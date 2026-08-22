// ---------------------------------------------------------------------------
// Room lifecycle: create, join, subscribe to presence/state changes.
//
// A room is nothing more than a row in `rooms` plus up to two rows in
// `room_players` (one per seat). The actual match/shot exchange lives in
// onlineMatch.js -- this file only gets two players into the same room and
// tells the caller when seats fill or players (dis)connect.
// ---------------------------------------------------------------------------

import { supabase, ensureAuth } from './client.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I -- easier to read aloud/type
const DISPLAY_NAME_KEY = 'bool:displayName';

/** The display name typed once and stored locally (Stage 2 MVP: no real accounts). */
export function getStoredDisplayName() {
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredDisplayName(name) {
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, name);
  } catch {
    // Storage unavailable (private mode, etc.) -- the caller just re-prompts
    // next time. Not fatal to online play.
  }
}

function randomCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code; // e.g. "BOLD-4F2K"
}

/**
 * Create a room as its host, seated at seat 0, and return { code, uid }.
 * Retries on the rare case of a code collision (unique primary key).
 */
export async function createRoom({ levelId, displayName }) {
  const user = await ensureAuth();
  const myUid = user.id;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error: roomError } = await supabase.from('rooms').insert({
      id: code,
      level_id: levelId,
      status: 'waiting',
      host_uid: myUid,
    });
    if (roomError) {
      // Unique violation on the code -- vanishingly unlikely, just retry.
      if (roomError.code === '23505') continue;
      throw roomError;
    }

    const { error: seatError } = await supabase.from('room_players').insert({
      room_id: code,
      uid: myUid,
      seat: 0,
      display_name: displayName,
    });
    if (seatError) throw seatError;

    return { code, uid: myUid, seat: 0 };
  }
  throw new Error('Could not allocate a room code after several attempts');
}

/**
 * Join an existing room at whichever seat (0 or 1) is open. Throws if the
 * room doesn't exist or both seats are already taken -- the RLS policy on
 * room_players' insert (unique per (room_id, seat)) is the actual source of
 * truth here; this just picks a seat to try.
 */
export async function joinRoom(code, { displayName }) {
  const uid = await ensureAuth();
  const myUid = uid.id;

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', code)
    .maybeSingle();
  if (roomError) throw roomError;
  if (!room) throw new Error(`No room with code ${code}`);

  const { data: existingPlayers, error: playersError } = await supabase
    .from('room_players')
    .select('seat, uid')
    .eq('room_id', code);
  if (playersError) throw playersError;

  const already = existingPlayers.find((p) => p.uid === myUid);
  if (already) return { code, uid: myUid, seat: already.seat, room };

  const takenSeats = new Set(existingPlayers.map((p) => p.seat));
  const seat = takenSeats.has(0) ? (takenSeats.has(1) ? null : 1) : 0;
  if (seat === null) throw new Error('Room is full');

  const { error: seatError } = await supabase.from('room_players').insert({
    room_id: code,
    uid: myUid,
    seat,
    display_name: displayName,
  });
  if (seatError) throw seatError;

  return { code, uid: myUid, seat, room };
}

/**
 * Subscribe to a room's player list. Calls `onChange` with the current full
 * list of { seat, uid, display_name } every time it changes (join/leave).
 * Returns an unsubscribe function.
 */
export function subscribeToRoom(code, onChange) {
  let cancelled = false;

  async function refresh() {
    const { data, error } = await supabase
      .from('room_players')
      .select('seat, uid, display_name')
      .eq('room_id', code)
      .order('seat', { ascending: true });
    if (!cancelled && !error) onChange(data);
  }

  const channel = supabase
    .channel(`room:${code}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${code}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, refresh)
    .subscribe();

  refresh();

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}

/**
 * Notify when a `matches` row appears for this room (i.e. either player has
 * clicked "start match"). Realtime delivers the INSERT to every subscriber
 * on the room -- including whoever made it -- so both clients transition
 * into the match from the same event; the "start match" button itself does
 * nothing but the insert. Also checks for an already-existing active match
 * once, in case one was created a moment before this subscription was set
 * up. Fires at most once; returns an unsubscribe function.
 */
export function subscribeToMatchStart(code, onMatchStart) {
  let handled = false;
  const fire = (row) => {
    if (handled || !row) return;
    handled = true;
    onMatchStart(row);
  };

  async function checkExisting() {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('room_id', code)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    fire(data);
  }

  const channel = supabase
    .channel(`room-matches:${code}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'matches', filter: `room_id=eq.${code}` },
      (payload) => fire(payload.new),
    )
    .subscribe();

  checkExisting();

  return () => supabase.removeChannel(channel);
}
