// ---------------------------------------------------------------------------
// Online lobby: create/join a room, watch seats fill, and (for now) prove a
// match row can be created once both seats are taken.
//
// This file is loaded ONLY via a dynamic import() from main.js -- never a
// static `import ... from` line. tools/bundle.js's dependency walker only
// follows static import declarations starting from src/main.js, so as long
// as that stays true, this file (and its own imports, including net/client.js's
// bare CDN import) never enters dist/bool.html's build graph. See
// bool-stage-2-supabase-setup.md for why that matters.
//
// Actually playing an online match -- feeding remote shots through the same
// applyShot()/replay() the local game already uses -- is the next build
// step (onlineMatch.js). This file only proves the room/presence plumbing:
// two browsers can create/join a room, see each other's seat fill, and a
// match row can be created once both are seated.
// ---------------------------------------------------------------------------

import { showScreen } from './screens.js';
import { levelAt } from '../levels/levels.js';
import { createRoom, joinRoom, subscribeToRoom, getStoredDisplayName, setStoredDisplayName } from '../net/rooms.js';
import { supabase } from '../net/client.js';

const $ = (id) => document.getElementById(id);

let wired = false;
let unsubscribe = null;
let currentRoom = null; // { code, uid, seat? }

function displayName() {
  const typed = $('name1').value.trim();
  if (typed) { setStoredDisplayName(typed); return typed; }
  return getStoredDisplayName() || 'You';
}

function leaveRoom() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  currentRoom = null;
}

function renderSeats(players) {
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
}

function wire() {
  if (wired) return;
  wired = true;

  $('btnOnlineCreate').onclick = async () => {
    $('btnOnlineCreate').disabled = true;
    try {
      const room = await createRoom({ levelId: levelAt(0).id, displayName: displayName() });
      await enterRoom(room);
    } catch (e) {
      showScreen('online-menu');
      alert('Could not create a room: ' + (e?.message || e));
    } finally {
      $('btnOnlineCreate').disabled = false;
    }
  };

  $('btnOnlineJoin').onclick = () => {
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
    $('btnStartMatch').disabled = true;
    try {
      const { data, error } = await supabase
        .from('matches')
        .insert({ room_id: currentRoom.code, level_id: levelAt(0).id, status: 'active' })
        .select()
        .single();
      if (error) throw error;
      alert(
        `Match created (${data.id.slice(0, 8)}…). Online gameplay wiring is the next build ` +
        `step -- this confirms both seats are connected and a match row can be created.`
      );
    } catch (e) {
      showRoomErr('Could not start the match: ' + (e?.message || e));
    } finally {
      $('btnStartMatch').disabled = false;
    }
  };
}

export function openOnlineMenu() {
  wire();
  showRoomErr('');
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
