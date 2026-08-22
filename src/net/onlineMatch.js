// ---------------------------------------------------------------------------
// Feeds a live online match: submits the local player's shots to Supabase and
// consumes both players' shots -- including the local player's own, echoed
// straight back through Realtime -- through the exact same applyShot() the
// local hot-seat game already uses. This is the payoff of Stage 1's
// deterministic engine + shot log (see game/match.js): there is no separate
// "network physics" to write or keep in sync with local play. Both clients
// build an identical local match independently (same level, same starter)
// and from then on only exchange shot events; determinism guarantees both
// reach the same final ball positions without ever exchanging coordinates.
//
// Loaded only via a dynamic import() from src/ui/online.js (itself loaded
// only via dynamic import from src/main.js) -- never a static
// `import ... from` line anywhere in this chain. See
// bool-stage-2-supabase-setup.md for why net/* code must never enter
// tools/bundle.js's static import graph.
// ---------------------------------------------------------------------------

import { createMatch } from '../game/match.js';
import { LEVELS } from '../levels/levels.js';
import { supabase } from './client.js';
import { enterOnlineMatch, applyRemoteShot } from '../main.js';

function levelIndexFor(levelId) {
  const i = LEVELS.findIndex((l) => l.id === levelId);
  return i === -1 ? 0 : i;
}

// room_players.seat (0/1) <-> match.js's player numbering (1/2). Fixed for
// the room's lifetime -- seat 0 is always the host, seat 1 the guest -- so
// both clients agree on the mapping without exchanging anything.
const seatToPlayer = (seat) => (seat === 0 ? 1 : 2);

/**
 * Start a live online match (the first end, a continuation past it, and a
 * fresh rematch all funnel through here -- src/ui/online.js's
 * subscribeToMatchStart listener calls this again for every new `matches`
 * row on the room).
 *
 * @param matchId   the `matches` row id (shots reference this)
 * @param levelId   which level, from the `matches` row
 * @param roomCode  the room this match belongs to (needed to insert a
 *                  rematch's `matches` row later)
 * @param mySeat    0 (host) or 1 (guest) -- this device's seat in the room
 * @param names     { 1: hostName, 2: guestName } for the HUD
 */
export async function startOnlineMatch({ matchId, levelId, roomCode, mySeat, names }) {
  const match = createMatch({
    mode: 'local',
    names,
    levelIndex: levelIndexFor(levelId),
    starter: 1, // seat 0 / host always opens the first end, on both clients
  });

  const myPlayer = seatToPlayer(mySeat);

  // This client's own view of how many shots have been applied so far
  // (locally or remotely) -- deliberately not read off `match` itself, so
  // this module never needs access to main.js's private match state beyond
  // the functions imported above.
  let nextSeq = 0;
  const applied = new Set();   // seqs successfully applied -- dedupes our own echo
  const pending = new Map();   // seq -> row, for out-of-order Realtime delivery

  // Draining can stall: the very first shot of a new end always belongs to
  // whoever won the last one, and if it arrives before *this* client has
  // clicked past their own "end over" screen, applyRemoteShot() rejects it
  // (match.phase isn't 'aiming' yet for the new end). Rather than treat that
  // rejection as consumed, leave it in `pending` and stop -- main.js calls
  // onLocalAdvance() once this client's own player clicks "Next", which
  // retries the drain now that the match is ready for it. Turn gating caps
  // this at one stalled shot at a time: the other seat physically cannot
  // throw until it's their turn, which it isn't until this shot lands.
  function drain() {
    while (pending.has(nextSeq)) {
      const row = pending.get(nextSeq);
      if (!applied.has(row.seq)) {
        const ok = applyRemoteShot({ player: seatToPlayer(row.seat), angle: row.angle, power: row.power });
        if (!ok) break;
        applied.add(row.seq);
      }
      pending.delete(nextSeq);
      nextSeq++;
    }
  }

  function onLocalShot({ angle, power }) {
    const seq = nextSeq++;
    applied.add(seq);
    applyRemoteShot({ player: myPlayer, angle, power });
    supabase
      .from('shots')
      .insert({ match_id: matchId, seq, seat: mySeat, angle, power })
      .then(({ error }) => {
        // Not recoverable at this build step (no rollback/resync) -- logged
        // so a lost shot is at least visible rather than silently stalling
        // the opponent's turn forever. See reconnect-from-log, step 6.
        if (error) console.error('[bool] failed to persist shot', error);
      });
  }

  /** Called once this client's own player clicks past their endover screen. */
  function onLocalAdvance() {
    drain();
  }

  /** "Rematch": a fresh `matches` row for the same room. Both clients --
   *  including whoever didn't click -- transition via the room's persistent
   *  subscribeToMatchStart listener reacting to this insert, same as the
   *  very first "start match". */
  async function onRematch() {
    const { error } = await supabase
      .from('matches')
      .insert({ room_id: roomCode, level_id: LEVELS[0].id, status: 'active' });
    if (error) console.error('[bool] failed to start rematch', error);
  }

  /** Best-effort: mark this match complete in the DB once it concludes.
   *  Both clients call this independently with the same (deterministic)
   *  result -- a harmless redundant update, not a race. */
  async function onMatchOver() {
    const winnerPlayer = match.scores[1] >= match.scores[2] ? 1 : 2;
    const { error } = await supabase
      .from('matches')
      .update({ status: 'complete', winner_seat: winnerPlayer - 1, ended_at: new Date().toISOString() })
      .eq('id', matchId);
    if (error) console.error('[bool] failed to mark match complete', error);
  }

  const channel = supabase
    .channel(`match:${matchId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'shots', filter: `match_id=eq.${matchId}` },
      ({ new: row }) => {
        pending.set(row.seq, row);
        drain();
      },
    )
    .subscribe();

  enterOnlineMatch(match, {
    myPlayer,
    onLocalShot,
    onLocalAdvance,
    onRematch,
    onMatchOver,
    cleanup: () => supabase.removeChannel(channel),
  });
}
