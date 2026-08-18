// ---------------------------------------------------------------------------
// Petanque scoring.
//
// The player whose ball is closest to the jack scores one point for EVERY ball
// of theirs that is closer than their opponent's best ball. So an end is worth
// between one and three points, and there is real value in stacking a second
// and third ball tight rather than settling for being nearest.
//
// If the jack is knocked into a moat or otherwise lost, the end is void and no
// points are awarded.
// ---------------------------------------------------------------------------

import { findJack, liveBalls } from './world.js';
import { SOLO } from './config.js';

/** Distances of a player's surviving balls to the jack, nearest first. */
function distances(world, jack, owner) {
  return liveBalls(world)
    .filter((b) => b.owner === owner)
    .map((b) => Math.hypot(b.x - jack.x, b.y - jack.y))
    .sort((a, b) => a - b);
}

export function scoreEnd(world) {
  const jack = findJack(world);
  if (!jack || jack.state !== 'live') {
    return { isVoid: true, winner: null, points: 0, p1: [], p2: [], reason: 'jack lost' };
  }

  const p1 = distances(world, jack, 1);
  const p2 = distances(world, jack, 2);

  const best1 = p1.length ? p1[0] : Infinity;
  const best2 = p2.length ? p2[0] : Infinity;

  if (best1 === Infinity && best2 === Infinity) {
    return { isVoid: false, winner: null, points: 0, p1, p2, reason: 'no balls survived' };
  }

  const winner = best1 < best2 ? 1 : 2;
  const oppBest = winner === 1 ? best2 : best1;
  const mine = winner === 1 ? p1 : p2;

  // If the opponent has nothing left on the pitch, every surviving ball counts.
  const points = oppBest === Infinity ? mine.length : mine.filter((d) => d < oppBest).length;

  return { isVoid: false, winner, points, p1, p2, reason: null };
}

/**
 * Solo scoring: no opponent, so you play against the level. A ball counts if it
 * finishes inside the scoring ring around the jack, and each level's `par` sets
 * how many you need to clear it.
 */
export function scoreSolo(world, level) {
  const jack = findJack(world);
  if (!jack || jack.state !== 'live') {
    return { isVoid: true, points: 0, par: level.par, cleared: false, reason: 'jack lost' };
  }
  const points = distances(world, jack, 1).filter((d) => d <= SOLO.radius).length;
  return { isVoid: false, points, par: level.par, cleared: points >= level.par, reason: null };
}
