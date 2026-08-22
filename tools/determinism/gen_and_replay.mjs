// Cross-device determinism check.
// Generates a realistic shot log deterministically (from a fixed seed, no
// Math.random/date), replays it through the real engine, and prints a
// canonical fingerprint of the final state. Run this identically on two
// machines and diff the output -- if it matches, physics are bit-identical
// cross-device.

import { replay } from '../../src/game/match.js';
import { liveBalls, findJack } from '../../src/game/world.js';
import { levelAt } from '../../src/levels/levels.js';

// Simple deterministic PRNG (mulberry32) -- NOT Math.random, seeded, so the
// same log is generated on every machine.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildLog(levelIndex, shotCount, seed) {
  const rand = mulberry32(seed);
  const log = [];
  for (let i = 0; i < shotCount; i++) {
    const player = (i % 2) + 1;
    const angle = (rand() * 2 - 1) * Math.PI;
    const power = rand();
    log.push({ seq: i, player, angle, power });
  }
  return log;
}

function fingerprintMatch(match) {
  const balls = liveBalls(match.world)
    .map(b => ({ owner: b.owner, x: b.x, y: b.y, vx: b.vx, vy: b.vy, state: b.state }))
    .sort((a, b) => a.owner - b.owner || a.x - b.x || a.y - b.y);
  const jack = findJack(match.world);
  return {
    balls,
    jack: jack ? { x: jack.x, y: jack.y, state: jack.state } : null,
    log: match.log,
    lastEnd: match.lastEnd,
  };
}

const levelCount = 8;
const results = [];
for (let levelIndex = 0; levelIndex < levelCount; levelIndex++) {
  const level = levelAt(levelIndex);
  const log = buildLog(levelIndex, 6, 1000 + levelIndex);
  const match = replay(log, { levelIndex, mode: 'local', starter: 1 });
  results.push({ levelId: level.id, fingerprint: fingerprintMatch(match) });
}

const payload = JSON.stringify(results, (k, v) => (typeof v === 'number' ? Number(v.toFixed(10)) : v));
const rawPayload = JSON.stringify(results);

console.log('=== BOOL DETERMINISM CHECK ===');
console.log('node:', process.version, process.arch, process.platform);
console.log('--- rounded (10dp) fingerprint ---');
console.log(payload);
console.log('--- raw fingerprint ---');
console.log(rawPayload);
