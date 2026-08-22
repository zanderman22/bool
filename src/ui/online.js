// ---------------------------------------------------------------------------
// Online lobby: create/join a room, watch seats fill, and hand off to a live
// match (src/net/onlineMatch.js) once both seats are taken and either player
// clicks "start match".
//
// This file is loaded ONLY via a dynamic import() from main.js -- never a
// static `import ... from` line. tools/bundle.js's dependency walker only
// follows static import declarations starting from src/main.js, so as long
// as that stays true, this file (and its own imports, including net/client.js's
// bare CDN import) never enters dist/bool.html's build graph. See
// bool-stage-2-supabase-setup.md for why that matters.
// ---------------------------------------------------------------------------

import { showScreen } from './screens.js';
import { levelAt } from '../levels/levels.js';
import {
  createRoom, joinRoom, subscribeToRoom, subscribeToMatchStart,
  getStoredDisplayName, setStoredDisplayName,
} from '../net/rooms.js';
import { supabase } from '../net/client.js';

const $ = (id) => document.getElementById(id);

let wired = false;
let unsubscribe = null;
let unsubscribeMatchStart = null;
let currentRoom = null; // { code, uid, seat }
let lastPlayers = [];   // most recent seat list, for the match's display names
let activeMatchId = null; // the match we're currently in/entering, so a
                           // duplicate delivery of the same row (checkExisting
                           // racing the live INSERT) or an echo doesn't
                           // re-enter the same match twice

function displayName() {
  const typed = $('name1').value.trim();
  if (typed) { setStoredDisplayName(typed); return typed; }
  return getStoredDisplayName() || 'You';
}

function leaveRoom() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (unsubscribeMatchStart) { unsubscribeMatchStart(); unsubscribeMatchStart = null; }
  currentRoom = null;
  lastPlayers = [];
  activeMatchId = null;
}

/**
 * Fully leave the online session: called when the player quits an online
 * match back to setup (src/main.js's endOnlineMatch() only tears down the
 * current match's shots channel -- this is the separate "leave the room
 * entirely" teardown, since the room-level subscription deliberately
 * outlives any one match so a rematch can still be picked up).
 */
export function leaveOnlineSession() {
  leaveRoom();
}

function renderSeats(players) {
  lastPlayers = players;
  const seatList = $('seatList');
  seatList.innerHTML = '';
  for (let seat = 0; seat < 2; seat++) {
    const p = players.find((pl) => pl.seat === seat);
    const row = document.createElement('div');
    row.className = 'seat';
    if (p) {
      row.classList.add('filled');
      if (currentRoom && p.uid === currentRoom.uid) row.classList.add('you');
    }
    const who = document.createElement('div');
    who.className = 'who';
    const dot = document.createElement('div');
    dot.className = 'dot2';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p ? p.display_name : 'Waiting for opponent…';
    who.append(dot, name);
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = p ? (currentRoom && p.uid === currentRoom.uid ? 'You' : (seat === 0 ? 'Host' : '')) : '';
    row.append(who, tag);
    seatList.appendChild(row);
  }

  const bothFilled = players.length >= 2;
  $('btnStartMatch').disabled = !bothFilled;
  $('btnStartMatch').textContent = bothFilled ? 'Start match' : 'Waiting for opponent…';
}

function showRoomErr(msg) {
  const el = $('roomErr');
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

function showJoinErr(msg) {
  const el = $('joinErr');
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

function showMenuErr(msg) {
  const el = $('menuErr');
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

function showRoomStatus(msg) {
  const el = $('roomStatus');
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

function inviteLink(code) {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('room', code);
  return url.toString();
}

async function copyInviteLink() {
  if (!currentRoom) return;
  const link = inviteLink(currentRoom.code);
  const btn = $('btnCopyLink');
  try {
    await navigator.clipboard.writeText(link);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1400);
  } catch {
    // Clipboard unavailable (permission denied, insecure context, etc.) --
    // fall back to a visible prompt so the link can still be copied by hand.
    window.prompt('Copy this link:', link);
  }
}

async function enterRoom(room) {
  currentRoom = room;
  $('roomCode').textContent = room.code;
  showRoomErr('');
  showScreen('online-room');
  unsubscribe = subscribeToRoom(room.code, renderSeats);
  unsubscribeMatchStart = subscribeToMatchStart(room.code, handleMatchStart);
}

/**
 * Fires (on both clients) every time a `matches` row appears for this room --
 * the first "start match" and every later rematch alike. The room-presence
 * subscription is only needed for the lobby's seat list, so it's dropped
 * here; the match-start subscription itself and `currentRoom` stay alive for
 * the whole session so a rematch (a fresh `matches` row for the same room)
 * still gets picked up without rejoining anything.
 */
async function handleMatchStart(matchRow) {
  if (matchRow.id === activeMatchId) return; // already in this one
  activeMatchId = matchRow.id;

  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  const host = lastPlayers.find((p) => p.seat === 0);
  const guest = lastPlayers.find((p) => p.seat === 1);
  const names = { 1: host?.display_name || 'Host', 2: guest?.display_name || 'Guest' };

  const { startOnlineMatch } = await import('../net/onlineMatch.js');
  await startOnlineMatch({
    matchId: matchRow.id,
    levelId: matchRow.level_id,
    roomCode: currentRoom.code,
    mySeat: currentRoom.seat,
    names,
  });
}

function wire() {
  if (wired) return;
  wired = true;

  $('btnOnlineCreate').onclick = async () => {
    showMenuErr('');
    $('btnOnlineCreate').disabled = true;
    try {
      const room = await createRoom({ levelId: levelAt(0).id, displayName: displayName() });
      await enterRoom(room);
    } catch (e) {
      showScreen('online-menu');
      showMenuErr('Could not create a room: ' + (e?.message || e));
    } finally {
      $('btnOnlineCreate').disabled = false;
    }
  };

  $('btnOnlineJoin').onclick = () => {
    showMenuErr('');
    showJoinErr('');
    showScreen('online-join');
    $('joinCode').focus();
  };

  $('btnJoinSubmit').onclick = async () => {
    const code = $('joinCode').value.trim().toUpperCase();
    if (!code) { showJoinErr('Enter a room code.'); return; }
    showJoinErr('');
    $('btnJoinSubmit').disabled = true;
    try {
      const room = await joinRoom(code, { displayName: displayName() });
      await enterRoom(room);
    } catch (e) {
      showJoinErr(e?.message || 'Could not join that room.');
    } finally {
      $('btnJoinSubmit').disabled = false;
    }
  };

  $('btnCopyLink').onclick = copyInviteLink;

  $('btnLeaveRoom').onclick = () => {
    leaveRoom();
    showScreen('online-menu');
  };

  $('btnOnlineBack1').onclick = () => showScreen('setup');
  $('btnOnlineBack2').onclick = () => showScreen('online-menu');

  $('btnStartMatch').onclick = async () => {
    if (!currentRoom) return;
    showRoomErr('');
    showRoomStatus('');
    $('btnStartMatch').disabled = true;
    try {
      const { error } = await supabase
        .from('matches')
        .insert({ room_id: currentRoom.code, level_id: levelAt(0).id, status: 'active' });
      if (error) throw error;
      // Both clients -- including this one -- transition into the match via
      // the shared subscribeToMatchStart() listener reacting to this insert,
      // not from here directly, so both sides enter from the same event.
      showRoomStatus('Match starting…');
    } catch (e) {
      showRoomErr('Could not start the match: ' + (e?.message || e));
      $('btnStartMatch').disabled = false;
    }
  };
}

export function openOnlineMenu() {
  wire();
  showMenuErr('');
  showScreen('online-menu');
}

/** If the page was opened via a "?room=CODE" invite link, jump straight to
 *  the join screen with the code pre-filled. */
export function openInviteLink(code) {
  wire();
  $('joinCode').value = code.toUpperCase();
  showJoinErr('');
  showScreen('online-join');
}
