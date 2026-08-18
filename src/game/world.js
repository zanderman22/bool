// ---------------------------------------------------------------------------
// The physics world.
//
// Everything here is a pure function over plain data. A world is a flat,
// JSON-cloneable object, and stepWorld() is fully deterministic: same world +
// same sequence of shots => same outcome, on every device, at every refresh
// rate. That single property is what buys us networked play (send shots, not
// positions), replays, and automated level playtesting.
//
// Consequently: no Math.random(), no Date.now(), no reading of DOM or canvas
// state anywhere in this file.
// ---------------------------------------------------------------------------

import { PHYSICS, PITCH, BALL } from './config.js';
import { clamp, len } from '../core/vec.js';

let nextBallId = 1;

export function createWorld(level) {
  return {
    tick: 0,
    levelId: level.id,
    // Spinner angles mutate, so obstacles are copied rather than shared.
    obstacles: level.obstacles.map((o) => ({ ...o })),
    balls: [],
    // Transient collision events, drained each frame by the renderer for
    // effects and haptics. Never read by the simulation itself, so dropping
    // them cannot affect determinism.
    events: [],
  };
}

export function addBall(world, { x, y, vx = 0, vy = 0, owner }) {
  const isJack = owner === 0;
  const mass = isJack ? PHYSICS.jackMass : PHYSICS.ballMass;
  const ball = {
    id: nextBallId++,
    owner,
    x, y, vx, vy,
    r: isJack ? BALL.jackR : BALL.r,
    mass,
    invMass: 1 / mass,
    state: 'live',   // 'live' | 'sinking' | 'dead'
    sink: 0,         // 0..1 progress once sinking
    sinkX: 0, sinkY: 0,
  };
  world.balls.push(ball);
  return ball;
}

export function cloneWorld(w) {
  return {
    tick: w.tick,
    levelId: w.levelId,
    obstacles: w.obstacles.map((o) => ({ ...o })),
    balls: w.balls.map((b) => ({ ...b })),
    events: [],
  };
}

/** True once nothing is moving and no ball is mid-sink: the end can be scored. */
export function isSettled(w) {
  for (const b of w.balls) {
    if (b.state === 'sinking') return false;
    if (b.state === 'live' && (b.vx !== 0 || b.vy !== 0)) return false;
  }
  return true;
}

export const liveBalls = (w) => w.balls.filter((b) => b.state === 'live');
export const findJack = (w) => w.balls.find((b) => b.owner === 0);

// ---------------------------------------------------------------------------
// Stepping
// ---------------------------------------------------------------------------

/** Advance the world by exactly one fixed timestep. */
export function stepWorld(w) {
  const dt = PHYSICS.dt;

  // Substep count is driven by the fastest ball, so that no ball moves further
  // than a fraction of the smallest radius in a single substep. Without this,
  // a full-power shot at 120 Hz covers ~20 units per step and can pass clean
  // through a 20-unit-thick spinner blade between two steps.
  let maxV = 0;
  for (const b of w.balls) {
    if (b.state !== 'live') continue;
    const s = len(b.vx, b.vy);
    if (s > maxV) maxV = s;
  }
  const budget = BALL.jackR * PHYSICS.maxTravelPerStep;
  const n = clamp(Math.ceil((maxV * dt) / budget) || 1, 1, PHYSICS.maxSubsteps);
  const h = dt / n;

  for (let i = 0; i < n; i++) substep(w, h);
  w.tick++;
}

function substep(w, h) {
  // Spinners sweep at a constant angular velocity.
  for (const o of w.obstacles) {
    if (o.type === 'spinner') o.angle += o.omega * h;
  }

  for (const b of w.balls) {
    if (b.state === 'sinking') { advanceSink(b, h); continue; }
    if (b.state !== 'live') continue;

    applyDecay(b, h);
    b.x += b.vx * h;
    b.y += b.vy * h;

    collideBounds(w, b);
    for (const o of w.obstacles) {
      switch (o.type) {
        case 'wall':    collideWall(w, b, o); break;
        case 'bumper':  collideBumper(w, b, o); break;
        case 'spinner': collideSpinner(w, b, o); break;
        case 'moat':    checkMoat(w, b, o); break;
      }
    }

    // Snap to rest so ends actually resolve.
    if (b.state === 'live' && len(b.vx, b.vy) < PHYSICS.sleepSpeed) {
      b.vx = 0; b.vy = 0;
    }
  }

  // Ball-ball pass, after every ball has moved.
  for (let i = 0; i < w.balls.length; i++) {
    for (let j = i + 1; j < w.balls.length; j++) {
      collideBalls(w, w.balls[i], w.balls[j]);
    }
  }
}

function applyDecay(b, h) {
  const sp = len(b.vx, b.vy);
  if (sp === 0) return;
  // Viscous term first, then constant rolling deceleration. The constant term
  // is what actually stops the ball; damping alone decays asymptotically.
  const decayed = sp * Math.exp(-PHYSICS.damping * h) - PHYSICS.rollingDecel * h;
  if (decayed <= 0) { b.vx = 0; b.vy = 0; return; }
  const k = decayed / sp;
  b.vx *= k; b.vy *= k;
}

function advanceSink(b, h) {
  b.sink += h / PHYSICS.sinkTime;
  // Drift toward the point where it broke the surface.
  b.x += (b.sinkX - b.x) * Math.min(1, h * 6);
  b.y += (b.sinkY - b.y) * Math.min(1, h * 6);
  if (b.sink >= 1) { b.state = 'dead'; b.vx = 0; b.vy = 0; }
}

// ---------------------------------------------------------------------------
// Collision resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a ball against an immovable surface.
 * `sv*` is the surface's own velocity at the contact point, which is what makes
 * a spinner impart momentum properly instead of the original's arbitrary
 * "add 2 units along the normal" fudge.
 */
function resolveStatic(w, b, nx, ny, pen, e, svx = 0, svy = 0, kind = 'wall') {
  if (pen > 0) { b.x += nx * pen; b.y += ny * pen; }

  const rvx = b.vx - svx, rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return; // separating already

  const j = -(1 + e) * vn;
  b.vx += j * nx;
  b.vy += j * ny;

  // Tangential coupling: a moving surface drags the ball along it.
  if (svx !== 0 || svy !== 0) {
    const tvx = rvx - vn * nx, tvy = rvy - vn * ny;
    b.vx -= tvx * PHYSICS.spinnerFriction;
    b.vy -= tvy * PHYSICS.spinnerFriction;
  }

  capSpeed(b);
  if (-vn > 90) w.events.push({ type: 'hit', kind, x: b.x, y: b.y, strength: Math.min(1, -vn / 900) });
}

function capSpeed(b) {
  const s = len(b.vx, b.vy);
  if (s > PHYSICS.maxSpeed) {
    const k = PHYSICS.maxSpeed / s;
    b.vx *= k; b.vy *= k;
  }
}

function collideBounds(w, b) {
  if (b.x < b.r)            resolveStatic(w, b, 1, 0, b.r - b.x, PHYSICS.wallBounce, 0, 0, 'bound');
  if (b.x > PITCH.W - b.r)  resolveStatic(w, b, -1, 0, b.x - (PITCH.W - b.r), PHYSICS.wallBounce, 0, 0, 'bound');
  if (b.y < b.r)            resolveStatic(w, b, 0, 1, b.r - b.y, PHYSICS.wallBounce, 0, 0, 'bound');
  if (b.y > PITCH.H - b.r)  resolveStatic(w, b, 0, -1, b.y - (PITCH.H - b.r), PHYSICS.wallBounce, 0, 0, 'bound');
}

/** Ball vs rounded rectangle. */
function collideWall(w, b, o) {
  const cr = o.cr || 0;
  const ix = o.x + cr, iy = o.y + cr;
  const iw = Math.max(0, o.w - cr * 2), ih = Math.max(0, o.h - cr * 2);

  const cx = clamp(b.x, ix, ix + iw);
  const cy = clamp(b.y, iy, iy + ih);
  let dx = b.x - cx, dy = b.y - cy;
  let d = len(dx, dy);

  const reach = b.r + cr;
  if (d >= reach) return;

  let nx, ny;
  if (d > 1e-6) { nx = dx / d; ny = dy / d; }
  else {
    // Ball centre is exactly on the inner box: push out the shortest way.
    // The original divided by zero here and produced NaN positions.
    const left = b.x - o.x, right = o.x + o.w - b.x;
    const top = b.y - o.y, bottom = o.y + o.h - b.y;
    const m = Math.min(left, right, top, bottom);
    nx = m === left ? -1 : m === right ? 1 : 0;
    ny = m === top ? -1 : m === bottom ? 1 : 0;
    d = 0;
  }
  resolveStatic(w, b, nx, ny, reach - d, PHYSICS.wallBounce, 0, 0, 'wall');
}

function collideBumper(w, b, o) {
  const dx = b.x - o.x, dy = b.y - o.y;
  let d = len(dx, dy);
  const minD = b.r + o.r;
  if (d >= minD) return;

  let nx, ny;
  if (d > 1e-6) { nx = dx / d; ny = dy / d; }
  else { nx = 0; ny = -1; d = 0; }

  resolveStatic(w, b, nx, ny, minD - d, PHYSICS.bumperBounce, 0, 0, 'bumper');

  // Guarantee a minimum kick so a slow ball still pops off rather than
  // resting against the bumper face.
  const outward = b.vx * nx + b.vy * ny;
  if (outward < PHYSICS.bumperMinKick) {
    const add = PHYSICS.bumperMinKick - outward;
    b.vx += nx * add; b.vy += ny * add;
    capSpeed(b);
  }
  w.events.push({ type: 'hit', kind: 'bumper', x: o.x, y: o.y, strength: 1 });
}

/** Ball vs rotating capsule. */
function collideSpinner(w, b, o) {
  const ca = Math.cos(-o.angle), sa = Math.sin(-o.angle);
  const dx = b.x - o.x, dy = b.y - o.y;
  // Into the spinner's local frame.
  const lx = dx * ca - dy * sa;
  const ly = dx * sa + dy * ca;

  const half = Math.max(0, o.length / 2 - o.thick / 2);
  const cx = clamp(lx, -half, half);
  const cy = 0;

  let ex = lx - cx, ey = ly - cy;
  let d = len(ex, ey);
  const reach = b.r + o.thick / 2;
  if (d >= reach) return;

  let lnx, lny;
  if (d > 1e-6) { lnx = ex / d; lny = ey / d; }
  else { lnx = 0; lny = 1; d = 0; }

  // Normal back into world space.
  const c2 = Math.cos(o.angle), s2 = Math.sin(o.angle);
  const nx = lnx * c2 - lny * s2;
  const ny = lnx * s2 + lny * c2;

  // Velocity of the blade at the contact point: v = omega x r.
  const contactX = b.x - nx * (b.r - (reach - d));
  const contactY = b.y - ny * (b.r - (reach - d));
  const rx = contactX - o.x, ry = contactY - o.y;
  const svx = -o.omega * ry;
  const svy = o.omega * rx;

  resolveStatic(w, b, nx, ny, reach - d, PHYSICS.wallBounce, svx, svy, 'spinner');
}

function checkMoat(w, b, o) {
  if (b.state !== 'live') return;
  // A ball falls in once its centre crosses the lip.
  if (b.x < o.x || b.x > o.x + o.w || b.y < o.y || b.y > o.y + o.h) return;
  b.state = 'sinking';
  b.sink = 0;
  b.sinkX = b.x;
  b.sinkY = b.y;
  b.vx *= 0.35; b.vy *= 0.35;
  w.events.push({ type: 'sink', x: b.x, y: b.y, owner: b.owner });
}

function collideBalls(w, a, b) {
  if (a.state !== 'live' || b.state !== 'live') return;

  const dx = b.x - a.x, dy = b.y - a.y;
  let d = len(dx, dy);
  const minD = a.r + b.r;
  if (d >= minD) return;

  let nx, ny;
  if (d > 1e-6) { nx = dx / d; ny = dy / d; }
  else {
    // Perfectly coincident centres. Deterministic tie-break by id, so this
    // resolves identically on every machine rather than by float noise.
    nx = a.id < b.id ? 1 : -1; ny = 0; d = 0;
  }

  // Positional correction, split by inverse mass.
  const pen = minD - d;
  const totalInv = a.invMass + b.invMass;
  a.x -= nx * pen * (a.invMass / totalInv);
  a.y -= ny * pen * (a.invMass / totalInv);
  b.x += nx * pen * (b.invMass / totalInv);
  b.y += ny * pen * (b.invMass / totalInv);

  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn >= 0) return;

  // Proper impulse. The original used a fixed factor of 1.85 divided by two
  // and ignored mass entirely, which quietly injected energy on every clack.
  const j = (-(1 + PHYSICS.ballBounce) * vn) / totalInv;
  a.vx -= j * nx * a.invMass;
  a.vy -= j * ny * a.invMass;
  b.vx += j * nx * b.invMass;
  b.vy += j * ny * b.invMass;

  capSpeed(a); capSpeed(b);
  if (-vn > 60) {
    w.events.push({
      type: 'hit', kind: 'ball',
      x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      strength: Math.min(1, -vn / 900),
    });
  }
}
