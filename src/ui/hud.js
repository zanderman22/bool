// DOM HUD. Reads match state, never writes it.

import { RULES } from '../game/config.js';

const $ = (id) => document.getElementById(id);

function renderDots(el, left, cls) {
  // Rebuild only when the count changes, so the CSS transitions aren't
  // restarted on every animation frame.
  if (el.dataset.left === String(left)) return;
  el.dataset.left = String(left);
  el.innerHTML = '';
  for (let i = 0; i < RULES.shotsPerPlayer; i++) {
    const d = document.createElement('div');
    d.className = `dot ${i < left ? 'on ' + cls : ''}`;
    el.appendChild(d);
  }
}

export function updateHud(match) {
  const solo = match.mode === 'solo';

  $('p1Name').textContent = match.names[1];
  $('p2Name').textContent = match.names[2];
  // `invisible` rather than `hidden`: the panel keeps its space, so the score
  // stays centred in solo instead of sliding to the right-hand edge.
  $('side2').classList.toggle('invisible', solo);

  $('s1').textContent = solo ? (match.lastEnd?.points ?? 0) : match.scores[1];
  $('s2').textContent = match.scores[2];
  $('s2').parentElement.querySelector('i').classList.toggle('hidden', solo);
  $('s2').classList.toggle('hidden', solo);

  renderDots($('p1Dots'), match.shotsLeft[1], 'p1');
  if (!solo) renderDots($('p2Dots'), match.shotsLeft[2], 'p2');

  $('side1').classList.toggle('active', match.current === 1);
  $('side2').classList.toggle('active', match.current === 2);

  $('turnLabel').textContent = turnText(match, solo);
}

function turnText(match, solo) {
  if (match.phase === 'simulating') return 'Rolling…';
  if (match.phase !== 'aiming') return '';
  if (solo) {
    const thrown = RULES.shotsPerPlayer - match.shotsLeft[1];
    return `Boule ${Math.min(thrown + 1, RULES.shotsPerPlayer)} of ${RULES.shotsPerPlayer}`;
  }
  return `${match.names[match.current]} to throw`;
}

export function showBanner(text) {
  const b = document.getElementById('banner');
  document.getElementById('bannerText').textContent = text;
  b.classList.remove('hidden');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => b.classList.add('hidden'), 2200);
}
