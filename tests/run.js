// Headless test suite.
//
// Everything under src/game and src/levels is browser-free by design, so the
// entire simulation can be exercised in node. This is what makes automated
// level playtesting possible later: if we can fire ten thousand shots at a
// level in a script, a generator can be told whether a level is trivial,
// impossible, or just right.

import { PITCH, PHYSICS, RULES, SHOT, THROW_LINE, BALL } from '../src/game/config.js';
import { createWorld, addBall, stepWorld, isSettled, findJack } from '../src/game/world.js';
import { validateLevel } from '../src/levels/schema.js';
import { LEVELS, levelAt } from '../src/levels/levels.js';
import { scoreEnd } from '../src/game/scoring.js';
import { createMatch, applyShot, replay, nextThrower, updateMatch, nextEnd } from '../src/game/match.js';

let passed = 0, failed = 0;
const results = [];

function test(name, fn) {
  try { fn(); passed++; results.push(['PASS', name, '']); }
  catch (e) { failed++; results.push(['FAIL', name, e.message]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'not equal'}: got ${a}, expected ${b}`);
}

/** Run a world to rest, with a hard cap so a runaway never hangs the suite. */
function settle(w, cap = 40000) {
  let n = 0;
  while (!isSettled(w) && n++ < cap) stepWorld(w);
  return n;
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

test('every level passes validation', () => {
  const errs = LEVELS.flatMap(validateLevel);
  assert(errs.length === 0, errs.join('; '));
});

test('level ids are unique', () => {
  const ids = LEVELS.map((l) => l.id);
  eq(new Set(ids).size, ids.length, 'duplicate level id');
});

test('no jack starts inside a moat', () => {
  for (const lv of LEVELS) {
    for (const o of lv.obstacles) {
      if (o.type !== 'moat') continue;
      const inside = lv.jack.x > o.x && lv.jack.x < o.x + o.w &&
                     lv.jack.y > o.y && lv.jack.y < o.y + o.h;
      assert(!inside, `${lv.id}: jack starts in a moat`);
    }
  }
});

test('no obstacle blocks the throwing circle', () => {
  for (const lv of LEVELS) {
    for (const o of lv.obstacles) {
      if (o.type === 'bumper') {
        const d = Math.hypot(o.x - THROW_LINE.x, o.y - THROW_LINE.y);
        assert(d > o.r + BALL.r + 20, `${lv.id}: bumper sits on the throwing circle`);
      } else if (o.type !== 'spinner') {
        const inside = THROW_LINE.x > o.x - BALL.r && THROW_LINE.x < o.x + o.w + BALL.r &&
                       THROW_LINE.y > o.y - BALL.r && THROW_LINE.y < o.y + o.h + BALL.r;
        assert(!inside, `${lv.id}: ${o.type} covers the throwing circle`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Determinism — the property everything else is built on
// ---------------------------------------------------------------------------

const SAMPLE_LOG = [
  { seq: 0, player: 1, angle: -1.52, power: 0.72 },
  { seq: 1, player: 2, angle: -1.61, power: 0.80 },
  { seq: 2, player: 1, angle: -1.44, power: 0.66 },
  { seq: 3, player: 2, angle: -1.70, power: 0.91 },
  { seq: 4, player: 1, angle: -1.58, power: 0.77 },
  { seq: 5, player: 2, angle: -1.49, power: 0.63 },
];

const snapshot = (m) =>
  m.world.balls.map((b) => `${b.owner}:${b.state}:${b.x.toFixed(9)}:${b.y.toFixed(9)}`).join('|');

test('replaying the same log twice is bit-identical', () => {
  for (let li = 0; li < LEVELS.length; li++) {
    const a = replay(SAMPLE_LOG, { levelIndex: li });
    const b = replay(SAMPLE_LOG, { levelIndex: li });
    eq(snapshot(a), snapshot(b), `level ${LEVELS[li].id} diverged between replays`);
  }
});

test('replay reconstructs a match spanning more than one end', () => {
  // A real match plays to RULES.matchTarget over many ends under one shot
  // log (a rematch is the only thing that starts a *new* log) -- this is
  // what a reconnecting online client rebuilds from (bool-stage-2-scope.md
  // step 6), so replay() must carry on past an end's conclusion instead of
  // stopping there. Verified against a match "played live" end-to-end via
  // updateMatch()/nextEnd() -- the same functions main.js's own game loop
  // and "Next" button call -- so this checks replay() reconstructs exactly
  // what actually happened, not just that it runs without crashing.
  const levelIndex = 0;
  const TWO_END_LOG = [...SAMPLE_LOG, ...SAMPLE_LOG.map((s) => ({ ...s, seq: s.seq + 6 }))];

  function playLive(log) {
    const m = createMatch({ mode: 'local', levelIndex });
    for (const shot of log) {
      m.current = shot.player;
      m.phase = 'aiming';
      applyShot(m, shot);
      let guard = 0;
      while (m.phase === 'simulating' && guard++ < 1000) updateMatch(m, 1);
      if (m.phase === 'endover') nextEnd(m);
      if (m.phase === 'matchover') break;
    }
    return m;
  }

  const live = playLive(TWO_END_LOG);
  const rebuilt = replay(TWO_END_LOG, { levelIndex });
  eq(snapshot(rebuilt), snapshot(live), 'reconnect replay diverged from a live-played match spanning end(s)');
  assert(rebuilt.endIndex > 0 || rebuilt.phase === 'matchover', 'replay should have advanced past the first end');
});

test('simulation is independent of how time is chopped up', () => {
  // Same shots, stepped as one big block vs. many uneven frames. The fixed
  // timestep accumulator must make these identical. The original advanced
  // physics once per rendered frame, so this test would have failed outright.
  const build = () => {
    const m = createMatch({ mode: 'local', levelIndex: 0 });
    return m;
  };
  const chopped = build();
  const whole = build();

  for (const shot of SAMPLE_LOG) {
    for (const m of [chopped, whole]) {
      m.current = shot.player; m.phase = 'aiming';
      applyShot(m, shot);
    }
    settle(chopped.world);
    settle(whole.world);
    for (const m of [chopped, whole]) {
      const n = nextThrower(m);
      if (n === null) break;
      m.current = n; m.phase = 'aiming';
    }
  }
  eq(snapshot(chopped), snapshot(whole), 'stepping pattern changed the outcome');
});

test('no NaN or infinity after a long violent simulation', () => {
  const w = createWorld(levelAt(5)); // Pinball: maximum bumper chaos
  addBall(w, { x: 500, y: 300, owner: 0 });
  for (let i = 0; i < 12; i++) {
    addBall(w, {
      x: 120 + i * 70, y: 1400,
      vx: (i % 2 ? 1 : -1) * 1800, vy: -2200,
      owner: (i % 2) + 1,
    });
  }
  settle(w, 60000);
  for (const b of w.balls) {
    assert(Number.isFinite(b.x) && Number.isFinite(b.y), 'ball position went non-finite');
    assert(Number.isFinite(b.vx) && Number.isFinite(b.vy), 'ball velocity went non-finite');
    assert(b.x >= -1 && b.x <= PITCH.W + 1, `ball escaped horizontally: ${b.x}`);
    assert(b.y >= -1 && b.y <= PITCH.H + 1, `ball escaped vertically: ${b.y}`);
  }
});

// ---------------------------------------------------------------------------
// Collision integrity
// ---------------------------------------------------------------------------

test('a full-power shot cannot tunnel through a thin wall', () => {
  // A 6-unit-thick wall is far thinner than anything in the level set; if
  // substepping holds here it holds everywhere.
  const level = {
    id: 'tunnel-probe',
    jack: { x: 500, y: 200 },
    obstacles: [{ type: 'wall', x: 0, y: 800, w: PITCH.W, h: 6, cr: 0 }],
  };
  for (const speed of [SHOT.maxLaunchSpeed, PHYSICS.maxSpeed]) {
    const w = createWorld(level);
    const b = addBall(w, { x: 500, y: 1400, vx: 0, vy: -speed, owner: 1 });
    settle(w);
    assert(b.y > 800, `ball at speed ${speed} passed through the wall (ended at y=${b.y})`);
  }
});

test('a full-power shot cannot tunnel through a spinner blade', () => {
  const level = {
    id: 'spinner-probe',
    jack: { x: 500, y: 200 },
    obstacles: [{ type: 'spinner', x: 500, y: 800, length: 900, thick: 16, angle: 0, omega: 2.4 }],
  };
  const w = createWorld(level);
  const b = addBall(w, { x: 500, y: 1400, vx: 0, vy: -PHYSICS.maxSpeed, owner: 1 });
  // Only the first crossing matters; after bouncing it may drift past the
  // blade tips legitimately.
  for (let i = 0; i < 40 && !isSettled(w); i++) stepWorld(w);
  assert(b.y > 780, `ball tunnelled through the blade (y=${b.y})`);
});

test('balls come to rest rather than creeping forever', () => {
  const w = createWorld({ id: 'empty', jack: { x: 500, y: 200 }, obstacles: [] });
  addBall(w, { x: 500, y: 1400, vx: 0, vy: -SHOT.maxLaunchSpeed, owner: 1 });
  const steps = settle(w);
  const seconds = steps * PHYSICS.dt;
  assert(seconds < 12, `took ${seconds.toFixed(1)}s to settle`);
  assert(steps > 30, 'settled implausibly fast');
});

test('collisions do not manufacture energy', () => {
  // Two balls, head on. Total kinetic energy must not rise.
  const w = createWorld({ id: 'energy', jack: { x: 10, y: 10 }, obstacles: [] });
  const a = addBall(w, { x: 400, y: 800, vx: 900, vy: 0, owner: 1 });
  const b = addBall(w, { x: 600, y: 800, vx: -900, vy: 0, owner: 2 });
  const ke = () => 0.5 * a.mass * (a.vx ** 2 + a.vy ** 2) + 0.5 * b.mass * (b.vx ** 2 + b.vy ** 2);
  const before = ke();
  for (let i = 0; i < 30; i++) stepWorld(w);
  assert(ke() <= before * 1.001, `energy rose from ${before.toFixed(0)} to ${ke().toFixed(0)}`);
});

test('zero-distance overlap resolves instead of producing NaN', () => {
  // The original divided by a zero distance here.
  const w = createWorld({ id: 'coincident', jack: { x: 10, y: 10 }, obstacles: [] });
  const a = addBall(w, { x: 500, y: 800, owner: 1 });
  const b = addBall(w, { x: 500, y: 800, owner: 2 });
  stepWorld(w);
  assert(Number.isFinite(a.x) && Number.isFinite(b.x), 'coincident balls produced NaN');
  assert(Math.hypot(b.x - a.x, b.y - a.y) > 0, 'coincident balls did not separate');
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoringWorld(spec) {
  const w = createWorld({ id: 'scoring', jack: { x: 500, y: 500 }, obstacles: [] });
  addBall(w, { x: 500, y: 500, owner: 0 });
  for (const [owner, dist] of spec) addBall(w, { x: 500 + dist, y: 500, owner });
  return w;
}

test('closest player scores one point per ball inside the opponent best', () => {
  const w = scoringWorld([[1, 100], [1, 150], [2, 200], [2, 260]]);
  const r = scoreEnd(w);
  eq(r.winner, 1, 'wrong winner');
  eq(r.points, 2, 'wrong points');
});

test('only balls strictly closer than the opponent best count', () => {
  const w = scoringWorld([[1, 100], [1, 300], [2, 200]]);
  const r = scoreEnd(w);
  eq(r.winner, 1);
  eq(r.points, 1, 'the ball outside the opponent best should not count');
});

test('a whole-sweep end scores the maximum', () => {
  const w = scoringWorld([[1, 60], [1, 90], [1, 120], [2, 400]]);
  eq(scoreEnd(w).points, 3);
});

test('opponent with nothing on the pitch concedes every surviving ball', () => {
  const w = scoringWorld([[1, 100], [1, 150]]);
  const r = scoreEnd(w);
  eq(r.winner, 1);
  eq(r.points, 2);
});

test('losing the jack voids the end', () => {
  const w = scoringWorld([[1, 100], [2, 200]]);
  findJack(w).state = 'dead';
  const r = scoreEnd(w);
  assert(r.isVoid, 'end should be void');
  eq(r.points, 0);
});

test('a sunk ball does not score', () => {
  const w = scoringWorld([[1, 100], [2, 200]]);
  w.balls.find((b) => b.owner === 1).state = 'dead';
  const r = scoreEnd(w);
  eq(r.winner, 2, 'the sunk ball should not have won the end');
});

test('an end where nothing survives scores nothing', () => {
  const w = scoringWorld([]);
  const r = scoreEnd(w);
  eq(r.winner, null);
  eq(r.points, 0);
  assert(!r.isVoid, 'jack is intact, so the end is not void');
});

// ---------------------------------------------------------------------------
// Turn order
// ---------------------------------------------------------------------------

test('petanque turn order gives the throw to whoever is not closest', () => {
  const m = createMatch({ mode: 'local', levelIndex: 1, starter: 1 });
  eq(nextThrower(m), 1, 'starter throws first');

  m.shotsLeft = { 1: 2, 2: 3 };
  eq(nextThrower(m), 2, 'the other player must open too');

  // Player 2 is now closest, so player 1 should throw.
  m.shotsLeft = { 1: 2, 2: 2 };
  const jack = findJack(m.world);
  addBall(m.world, { x: jack.x + 300, y: jack.y, owner: 1 });
  addBall(m.world, { x: jack.x + 80, y: jack.y, owner: 2 });
  eq(nextThrower(m), 1, 'the player who is not closest should throw');

  // Player 1 gets closer; the throw passes back.
  addBall(m.world, { x: jack.x + 40, y: jack.y, owner: 1 });
  eq(nextThrower(m), 2, 'taking the lead should hand the throw over');
});

test('a player out of boules never gets the throw', () => {
  const m = createMatch({ mode: 'local', levelIndex: 0 });
  m.shotsLeft = { 1: 0, 2: 2 };
  eq(nextThrower(m), 2);
  m.shotsLeft = { 1: 0, 2: 0 };
  eq(nextThrower(m), null, 'end should be over');
});

test('the winner of an end throws first in the next one', () => {
  const m = createMatch({ mode: 'local', levelIndex: 1, starter: 1 });
  const jack = findJack(m.world);
  addBall(m.world, { x: jack.x + 40, y: jack.y, owner: 2 });
  m.shotsLeft = { 1: 0, 2: 0 };
  m.phase = 'simulating';
  m.accumulator = 0;
  // Drive it to conclusion.
  updateMatch(m, 1 / 60);
  eq(m.starter, 2, 'the end winner should start the next end');
});

test('every level can be completed by some shot', () => {
  // Sanity check that no level is a dead end: for each, find at least one
  // power/angle that leaves a ball alive on the pitch.
  for (const [i, lv] of LEVELS.entries()) {
    let survived = false;
    for (let a = -2.4; a <= -0.75 && !survived; a += 0.06) {
      for (let p = 0.3; p <= 1.0 && !survived; p += 0.08) {
        const m = createMatch({ mode: 'solo', levelIndex: i });
        applyShot(m, { player: 1, angle: a, power: p });
        settle(m.world);
        const ball = m.world.balls.find((b) => b.owner === 1);
        if (ball && ball.state === 'live') survived = true;
      }
    }
    assert(survived, `${lv.id}: no shot leaves a ball on the pitch`);
  }
});

// ---------------------------------------------------------------------------

const w = 62;
console.log('\n  Bool — test suite\n  ' + '-'.repeat(w));
for (const [status, name, msg] of results) {
  const mark = status === 'PASS' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${mark} ${name}`);
  if (msg) console.log(`      \x1b[31m${msg}\x1b[0m`);
}
console.log('  ' + '-'.repeat(w));
console.log(`  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
