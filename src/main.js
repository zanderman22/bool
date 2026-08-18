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

const canShoot = () => !!match && match.phase === 'aiming';

const aim = createAim(canvas, renderer, {
  canShoot,
  getWorld: () => match.world,
  onShoot: (shot) => {
    if (!canShoot()) return;
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

// --- wiring ----------------------------------------------------------------

$('btnSolo').onclick = () => startMatch('solo');
$('btnLocal').onclick = () => startMatch('local');

$('btnNext').onclick = () => {
  const solo = match.mode === 'solo';
  // A missed par replays the same level rather than advancing.
  if (solo && !match.lastEnd.isVoid && !match.lastEnd.cleared) startEnd(match);
  else nextEnd(match);
  showScreen(null);
  layout();
  showBanner(levelAt(match.levelIndex).name);
  updateHud(match);
};

$('btnRematch').onclick = () => startMatch(match.mode);
$('btnQuit').onclick = () => showScreen('setup');
$('btnQuit2').onclick = () => showScreen('setup');

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

showScreen('setup');
layout();

// Exposed for the browser smoke test (tools/browsertest.js) and for poking at
// a live match from the console. Read-only by convention.
window.__bool = {
  get match() { return match; },
  get renderer() { return renderer; },
};
