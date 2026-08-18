// Headless tuning and automated playtesting.
//
// This is the payoff from a deterministic, browser-free simulation: we can
// fire tens of thousands of shots through a level in a couple of seconds and
// measure what actually happens, instead of guessing at constants and
// re-testing by hand.
//
// It is also the seed of the level generator idea — a generated level can be
// scored for playability by exactly this method before a human ever sees it.

import { PITCH, SHOT, THROW_LINE, SOLO, PHYSICS } from '../src/game/config.js';
import { createWorld, addBall, stepWorld, isSettled, findJack } from '../src/game/world.js';
import { LEVELS } from '../src/levels/levels.js';

function settle(w, cap = 40000) {
  let n = 0;
  while (!isSettled(w) && n++ < cap) stepWorld(w);
  return n;
}

/** How far a boule rolls on an empty pitch, per power setting. */
function travelCurve() {
  console.log('\n  Travel distance on an open pitch');
  console.log('  power   distance    settle    reaches jack?');
  console.log('  ' + '-'.repeat(52));

  // Distance from the throwing circle to a typical jack position.
  const jackDist = THROW_LINE.y - 0.13 * PITCH.H;

  for (let p = 0.2; p <= 1.001; p += 0.1) {
    const w = createWorld({ id: 'open', jack: { x: 10, y: 10 }, obstacles: [] });
    const b = addBall(w, {
      x: THROW_LINE.x, y: THROW_LINE.y,
      vx: 0, vy: -p * SHOT.maxLaunchSpeed, owner: 1,
    });
    const y0 = b.y;
    const steps = settle(w);
    const dist = y0 - b.y;
    const secs = (steps * PHYSICS.dt).toFixed(2);
    const reach = dist >= jackDist ? 'yes' : `${((dist / jackDist) * 100).toFixed(0)}%`;
    console.log(
      `  ${p.toFixed(1)}     ${dist.toFixed(0).padStart(6)}    ${secs.padStart(5)}s    ${reach}`,
    );
  }
  console.log(`\n  (throw circle to a jack at y=0.13H is ${jackDist.toFixed(0)} units)`);
}

/**
 * Fire a spread of shots at each level and report the outcome distribution.
 * A level where almost everything sinks is punishing; one where almost
 * everything lands tight is trivial.
 */
/** Fire one shot at a level and report where it ends up. */
function trial(lv, angle, power) {
  const w = createWorld(lv);
  addBall(w, { x: lv.jack.x, y: lv.jack.y, owner: 0 });
  const b = addBall(w, {
    x: THROW_LINE.x, y: THROW_LINE.y,
    vx: Math.cos(angle) * power * SHOT.maxLaunchSpeed,
    vy: Math.sin(angle) * power * SHOT.maxLaunchSpeed,
    owner: 1,
  });
  settle(w);

  if (b.state !== 'live') return { sunk: true };
  const jack = findJack(w);
  if (!jack || jack.state !== 'live') return { sunk: false, dist: Infinity };
  return { sunk: false, dist: Math.hypot(b.x - jack.x, b.y - jack.y) };
}

/**
 * Sweep a level and summarise the outcomes.
 *
 * Two sweeps, because they answer different questions:
 *
 *  - AIMED (narrow fan around the true bearing to the jack) tells us what
 *    happens to the obvious shot. If the obvious shot is a guaranteed moat,
 *    the level reads as broken however clever the intended line is.
 *
 *  - EXPLORE (the whole plausible fan) tells us whether ANY line works. The
 *    fraction landing in the ring is the size of the "success basin": how much
 *    of the input space rewards the player. A basin near zero means the level
 *    cannot be solved; a very large basin means it is trivial.
 */
function sweep(lv, { spread, powerLo, powerHi, n }) {
  const aimAngle = Math.atan2(lv.jack.y - THROW_LINE.y, lv.jack.x - THROW_LINE.x);
  let sunk = 0, inRing = 0, total = 0, best = Infinity;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const angle = aimAngle - spread + (2 * spread * i) / (n - 1);
      const power = powerLo + ((powerHi - powerLo) * j) / (n - 1);
      const r = trial(lv, angle, power);
      total++;
      if (r.sunk) { sunk++; continue; }
      if (r.dist < best) best = r.dist;
      if (r.dist <= SOLO.radius) inRing++;
    }
  }
  return { sunk: sunk / total, inRing: inRing / total, best, total };
}

function playtest() {
  console.log('\n  Automated playtest');
  console.log('  ' + '-'.repeat(74));
  console.log('  level             aimed:sunk  in-ring | explore:basin  best | par  verdict');
  console.log('  ' + '-'.repeat(74));

  for (const lv of LEVELS) {
    const aimed = sweep(lv, { spread: 0.13, powerLo: 0.5, powerHi: 0.9, n: 26 });
    const explore = sweep(lv, { spread: 0.7, powerLo: 0.35, powerHi: 1.0, n: 42 });

    // Par scales with how forgiving the level is.
    const par = explore.inRing >= 0.10 ? 3 : explore.inRing >= 0.04 ? 2 : explore.inRing > 0.004 ? 1 : 0;

    let verdict = '';
    if (par === 0) verdict = 'UNPLAYABLE — ring unreachable';
    else if (aimed.sunk > 0.75) verdict = 'HARSH — obvious shot almost always sinks';
    else if (explore.inRing > 0.35) verdict = 'trivial';
    else if (par !== lv.par) verdict = `par should be ${par}, is ${lv.par}`;

    const pc = (v) => (v * 100).toFixed(0).padStart(3) + '%';
    console.log(
      `  ${lv.id.padEnd(16)}  ${pc(aimed.sunk)}      ${pc(aimed.inRing)}  |  ` +
      `${pc(explore.inRing)}       ${explore.best === Infinity ? '  —' : explore.best.toFixed(0).padStart(3)}  |  ` +
      `${par}   ${verdict}`,
    );
  }

  console.log('\n  aimed   = narrow fan around the bearing to the jack (the obvious shot)');
  console.log('  explore = the full plausible fan (does ANY line work?)');
  console.log('  basin   = share of explored shots finishing inside the ' + SOLO.radius + '-unit ring');
}

travelCurve();
playtest();
console.log();
