// ---------------------------------------------------------------------------
// Match state machine: ends, turn order, shots, scores.
//
// Every shot is recorded in `log` as a tiny deterministic event
// ({ seq, player, angle, power }). Combined with the deterministic world, that
// log IS the match: replaying it reproduces the exact final position of every
// ball. This is the seam that networked play slots into later -- peers exchange
// these events, never ball coordinates -- and it is what makes replays and
// automated level playtesting possible for free.
// ---------------------------------------------------------------------------

import { RULES, SHOT, THROW_LINE, PHYSICS } from './config.js';
import { createWorld, addBall, stepWorld, isSettled, liveBalls, findJack } from './world.js';
import { scoreEnd, scoreSolo } from './scoring.js';
import { levelAt } from '../levels/levels.js';

export const OTHER = (p) => (p === 1 ? 2 : 1);

export function createMatch({
  mode = 'solo',          // 'solo' | 'local'
  names = { 1: 'You', 2: 'Opponent' },
  levelIndex = 0,
  starter = 1,
  seed = 1,
} = {}) {
  const match = {
    mode, names, seed,
    scores: { 1: 0, 2: 0 },
    levelIndex,
    endIndex: 0,
    starter,
    shotsLeft: { 1: RULES.shotsPerPlayer, 2: RULES.shotsPerPlayer },
    current: starter,
    phase: 'aiming',        // 'aiming' | 'simulating' | 'endover' | 'matchover'
    log: [],
    seq: 0,
    world: null,
    level: null,
    lastEnd: null,
    accumulator: 0,
  };
  startEnd(match);
  return match;
}

export function startEnd(match) {
  const level = levelAt(match.levelIndex);
  match.level = level;
  match.world = createWorld(level);
  addBall(match.world, { x: level.jack.x, y: level.jack.y, owner: 0 });

  match.shotsLeft = {
    1: RULES.shotsPerPlayer,
    2: match.mode === 'solo' ? 0 : RULES.shotsPerPlayer,
  };
  match.current = match.mode === 'solo' ? 1 : match.starter;
  match.phase = 'aiming';
  match.lastEnd = null;
  match.accumulator = 0;
  return match;
}

// ---------------------------------------------------------------------------
// Turn order
// ---------------------------------------------------------------------------

/** Nearest surviving ball of each player, as distance to the jack. */
function bests(world) {
  const jack = findJack(world);
  const out = { 1: Infinity, 2: Infinity };
  if (!jack || jack.state !== 'live') return out;
  for (const b of liveBalls(world)) {
    if (b.owner !== 1 && b.owner !== 2) continue;
    const d = Math.hypot(b.x - jack.x, b.y - jack.y);
    if (d < out[b.owner]) out[b.owner] = d;
  }
  return out;
}

/**
 * Who throws next, or null if the end is over.
 *
 * Under petanque rules the player who is NOT closest throws, and keeps
 * throwing until they take the lead or run out of balls. That is what gives
 * the format its tension: taking the lead hands the pressure straight back.
 */
export function nextThrower(match) {
  const s = match.shotsLeft;
  if (s[1] <= 0 && s[2] <= 0) return null;
  if (match.mode === 'solo') return s[1] > 0 ? 1 : null;
  if (s[1] <= 0) return 2;
  if (s[2] <= 0) return 1;

  const thrown1 = RULES.shotsPerPlayer - s[1];
  const thrown2 = RULES.shotsPerPlayer - s[2];
  // Opening throws: starter first, then the other player.
  if (thrown1 === 0 && thrown2 === 0) return match.starter;
  if (thrown1 === 0) return 1;
  if (thrown2 === 0) return 2;

  if (RULES.turnOrder === 'alternate') return OTHER(match.current);

  const b = bests(match.world);
  // Both players' balls are gone (all sunk): fall back to alternating.
  if (b[1] === b[2]) return OTHER(match.current);
  return b[1] < b[2] ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/**
 * Convert a swipe into a shot event. `angle` in radians, `power` in 0..1.
 * Kept separate from applyShot so the same event can arrive from input, from
 * the network, or from a replay.
 */
export function shotFromSwipe(dx, dy) {
  const dist = Math.hypot(dx, dy);
  if (dist < SHOT.minDrag) return null;
  return {
    angle: Math.atan2(dy, dx),
    power: Math.min(dist, SHOT.maxDrag) / SHOT.maxDrag,
  };
}

/** Apply a shot event to the match. Returns the spawned ball, or null if rejected. */
export function applyShot(match, { player, angle, power }) {
  if (match.phase !== 'aiming') return null;
  if (player !== match.current) return null;
  if (match.shotsLeft[player] <= 0) return null;

  const speed = Math.max(0, Math.min(1, power)) * SHOT.maxLaunchSpeed;
  const ball = addBall(match.world, {
    x: THROW_LINE.x,
    y: THROW_LINE.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    owner: player,
  });

  match.shotsLeft[player]--;
  match.log.push({ seq: match.seq++, player, angle, power });
  match.phase = 'simulating';
  return ball;
}

// ---------------------------------------------------------------------------
// Advancing
// ---------------------------------------------------------------------------

/**
 * Advance the match by `elapsed` real seconds, using a fixed-timestep
 * accumulator so simulation speed is identical at any refresh rate.
 */
export function updateMatch(match, elapsed) {
  if (match.phase !== 'simulating') return;

  // Clamp so a backgrounded tab does not try to catch up thousands of steps
  // in one frame when it regains focus.
  match.accumulator += Math.min(elapsed, 0.25);

  while (match.accumulator >= PHYSICS.dt) {
    match.accumulator -= PHYSICS.dt;
    stepWorld(match.world);
    if (isSettled(match.world)) break;
  }

  if (!isSettled(match.world)) return;

  match.accumulator = 0;
  const next = nextThrower(match);
  if (next === null) {
    concludeEnd(match);
  } else {
    match.current = next;
    match.phase = 'aiming';
  }
}

function concludeEnd(match) {
  const result = match.mode === 'solo'
    ? scoreSolo(match.world, match.level)
    : scoreEnd(match.world);

  match.lastEnd = result;

  if (match.mode !== 'solo' && !result.isVoid && result.winner) {
    match.scores[result.winner] += result.points;
    // In petanque the winner of an end throws first in the next one.
    match.starter = result.winner;
  }

  const won = match.mode !== 'solo' &&
    (match.scores[1] >= RULES.matchTarget || match.scores[2] >= RULES.matchTarget);

  match.phase = won ? 'matchover' : 'endover';
}

/** Move to the next end. A void end is replayed on the same level. */
export function nextEnd(match) {
  if (match.lastEnd && match.lastEnd.isVoid) {
    // Same level again, nothing scored.
    return startEnd(match);
  }
  match.endIndex++;
  match.levelIndex++;
  return startEnd(match);
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

/**
 * Rebuild a match from its shot log. Used by the determinism tests, and the
 * mechanism a spectator or a reconnecting player would use to catch up.
 *
 * A log can span more than one end -- a real match plays to
 * RULES.matchTarget across many ends, all under the same shot log -- so
 * concluding an end here moves on to the next one via nextEnd() (exactly
 * what btnNext does for local/online play) rather than stopping at the
 * first end's conclusion. Stops early only if the log itself runs out or
 * the match is actually won.
 */
export function replay(log, { levelIndex = 0, mode = 'local', starter = 1, names } = {}) {
  const match = createMatch({ mode, names, levelIndex, starter });
  for (const shot of log) {
    match.current = shot.player;
    match.phase = 'aiming';
    applyShot(match, shot);
    // Run to settlement with no wall-clock involvement at all.
    let guard = 0;
    while (!isSettled(match.world) && guard++ < 20000) stepWorld(match.world);
    const next = nextThrower(match);
    if (next === null) {
      concludeEnd(match);
      if (match.phase === 'matchover') break;
      nextEnd(match);
      continue;
    }
    match.current = next;
    match.phase = 'aiming';
  }
  return match;
}
