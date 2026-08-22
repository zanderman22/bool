// ---------------------------------------------------------------------------
// Entry point. Wires input -> match -> renderer, and owns the animation loop.
//
// This file is the only place that touches the DOM, wall-clock time and the
// canvas. Everything under src/game is pure and testable without a browser,
// which is what lets the whole simulation run headlessly in tests.
// ---------------------------------------------------------------------------

import { createMatch, applyShot, updateMatch, nextEnd, startEnd } from './game/match.js';
import { RULES } from './game/config.js';
import { createRenderer } from './render/renderer.js';
import { createEffects, pushEvents, updateEffects } from './render/effects.js';
import { createAim } from './input/aim.js';
import { updateHud, showBanner } from './ui/hud.js';
import { showScreen } from './ui/screens.js';
import { levelAt } from './levels/levels.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');

const renderer = createRenderer(canvas);
const fx = createEffects();
let match = null;

// Set only while an online match (src/net/onlineMatch.js) is live. `myPlayer`
// is 1 or 2 -- whichever seat this device occupies in the room -- and gates
// the local player's own swipes to their own turn; `onLocalShot` is how a
// swipe reaches the network instead of applying straight to `match`.
// `cleanup` tears down the Supabase Realtime subscription.
let online = null;

function endOnlineMatch() {
  if (online) { online.cleanup?.(); online = null; }
}

const canShoot = () =>
  !!match && match.phase === 'aiming' && (!online || match.current === online.myPlayer);

const aim = createAim(canvas, renderer, {
  canShoot,
  getWorld: () => match.world,
  onShoot: (shot) => {
    if (!canShoot()) return;
    if (online) {
      online.onLocalShot(shot);
      vibrate(12);
      return;
    }
    applyShot(match, { player: match.current, ...shot });
    vibrate(12);
    updateHud(match);
  },
});

// --- layout ----------------------------------------------------------------

function layout() {
  const hud = $('hud');
  const inset = hud.classList.contains('hidden') ? 0 : hud.offsetHeight;
  renderer.resize(inset);
}

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 120));
// Only the mapping from pitch to pixels changes on resize. The match itself is
// untouched, so rotating the device mid-throw no longer restarts the round.

// --- loop ------------------------------------------------------------------

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;

  if (match) {
    const wasPhase = match.phase;
    updateMatch(match, dt);
    if (match.phase !== wasPhase) onPhaseChange(wasPhase);

    aim.tick();
    pushEvents(fx, match.world.events);
    updateEffects(fx, dt);
    renderer.draw(match, aim.aim, fx);
    updateHud(match);
  }
}
requestAnimationFrame(frame);

function onPhaseChange(from) {
  if (from === 'simulating' && match.phase === 'aiming') aim.cancel();
  if (match.phase === 'endover') showEndOver();
  if (match.phase === 'matchover') showMatchOver();
}

// --- screens ---------------------------------------------------------------

function startMatch(mode) {
  const n1 = $('name1').value.trim() || 'You';
  const n2 = $('name2').value.trim() || 'Opponent';
  try { localStorage.setItem('bool.name1', n1); localStorage.setItem('bool.name2', n2); } catch { /* private mode */ }

  match = createMatch({ mode, names: { 1: n1, 2: n2 } });
  showScreen(null);
  layout();
  showBanner(`${levelAt(match.levelIndex).name}`);
  updateHud(match);
}

function showEndOver() {
  const r = match.lastEnd;
  const solo = match.mode === 'solo';

  if (r.isVoid) {
    $('eoEyebrow').textContent = 'END VOID';
    $('eoTitle').textContent = 'Jack lost';
    $('eoDetail').textContent = 'The jack left the pitch, so no points are scored. Replay the end.';
    $('btnNext').textContent = 'Replay end';
  } else if (solo) {
    $('eoEyebrow').textContent = r.cleared ? 'LEVEL CLEARED' : 'PAR MISSED';
    $('eoTitle').textContent = `${r.points} of ${r.par}`;
    $('eoDetail').textContent = r.cleared
      ? 'Enough boules inside the ring. On to the next.'
      : `You needed ${r.par} boule${r.par === 1 ? '' : 's'} inside the ring.`;
    $('btnNext').textContent = r.cleared ? 'Next level' : 'Try again';
  } else if (!r.winner) {
    $('eoEyebrow').textContent = 'END COMPLETE';
    $('eoTitle').textContent = 'No score';
    $('eoDetail').textContent = 'Nothing survived on the pitch.';
    $('btnNext').textContent = 'Next level';
  } else {
    $('eoEyebrow').textContent = 'END COMPLETE';
    $('eoTitle').textContent = `${match.names[r.winner]} +${r.points}`;
    $('eoDetail').textContent =
      `${match.scores[1]}–${match.scores[2]}. First to ${RULES.matchTarget} takes the match.`;
    $('btnNext').textContent = 'Next level';
  }
  showScreen('endover');
}

function showMatchOver() {
  const w = match.scores[1] >= match.scores[2] ? 1 : 2;
  $('moTitle').textContent = `${match.names[w]} wins`;
  $('moDetail').textContent = `${match.scores[1]}–${match.scores[2]}`;
  showScreen('matchover');
}

// --- online match handoff ---------------------------------------------------
//
// src/net/onlineMatch.js owns the Supabase side (submitting/consuming shots);
// these two functions are the only points where it touches this module's
// private `match`/`online` state, so it never needs main.js's internals
// beyond what's exported here.

export function enterOnlineMatch(m, { myPlayer, onLocalShot, cleanup }) {
  endOnlineMatch(); // replace any previous online session first
  match = m;
  online = { myPlayer, onLocalShot, cleanup };
  showScreen(null);
  layout();
  showBanner(levelAt(match.levelIndex).name);
  updateHud(match);
}

/** Apply a shot -- local or remote -- to the live online match. */
export function applyRemoteShot(shot) {
  if (!match) return;
  applyShot(match, shot);
  updateHud(match);
}

// --- wiring ----------------------------------------------------------------

$('btnSolo').onclick = () => startMatch('solo');
$('btnLocal').onclick = () => startMatch('local');

// Online play lives in its own module, loaded only on demand via a dynamic
// import() -- never a static `import ... from` line -- so tools/bundle.js's
// dependency walker (which only follows static imports from src/main.js)
// never has to deal with net/client.js's bare CDN import. See
// bool-stage-2-supabase-setup.md.
$('btnOnline').onclick = async () => {
  const { openOnlineMenu } = await import('./ui/online.js');
  openOnlineMenu();
};

$('btnNext').onclick = () => {
  // Continuing past one end, or rematching, over the network isn't wired up
  // yet (build-order step 5) -- for now this just falls back to advancing
  // the shared local `match` object with no further shot exchange, which
  // only makes sense for the player who happens to click it locally.
  endOnlineMatch();
  const solo = match.mode === 'solo';
  // A missed par replays the same level rather than advancing.
  if (solo && !match.lastEnd.isVoid && !match.lastEnd.cleared) startEnd(match);
  else nextEnd(match);
  showScreen(null);
  layout();
  showBanner(levelAt(match.levelIndex).name);
  updateHud(match);
};

$('btnRematch').onclick = () => { endOnlineMatch(); startMatch(match.mode); };
$('btnQuit').onclick = () => { endOnlineMatch(); showScreen('setup'); };
$('btnQuit2').onclick = () => { endOnlineMatch(); showScreen('setup'); };

$('btnLocal').addEventListener('pointerenter', revealSecondName);
$('name1').addEventListener('focus', revealSecondName);
function revealSecondName() { $('name2Field').classList.remove('hidden'); }

function vibrate(ms) { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } }

// --- boot ------------------------------------------------------------------

try {
  $('name1').value = localStorage.getItem('bool.name1') || '';
  $('name2').value = localStorage.getItem('bool.name2') || '';
  if ($('name2').value) $('name2Field').classList.remove('hidden');
} catch { /* private mode */ }

// A "?room=CODE" invite link jumps straight to the join screen instead of
// the usual setup screen. Only pulls in the online module (and its CDN
// dependency) when actually needed.
const inviteCode = new URLSearchParams(location.search).get('room');
if (inviteCode) {
  import('./ui/online.js').then((m) => m.openInviteLink(inviteCode));
} else {
  showScreen('setup');
}
layout();

// Exposed for the browser smoke test (tools/browsertest.js) and for poking at
// a live match from the console. Read-only by convention.
window.__bool = {
  get match() { return match; },
  get renderer() { return renderer; },
};
