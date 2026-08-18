// Aim preview.
//
// Because the simulation is deterministic and side-effect free, the honest way
// to draw a trajectory guide is simply to run the real physics on a throwaway
// copy of the world. No approximation, no second physics implementation to
// keep in sync -- what you see is exactly what will happen.
//
// The preview is deliberately truncated well before the shot resolves. We
// *could* show the whole path, but that would reduce the game to reading a
// line, so it fades out after a fraction of a second.

import { cloneWorld, addBall, stepWorld } from './world.js';
import { SHOT, THROW_LINE } from './config.js';

const PREVIEW_OWNER = -1;

export function previewPath(world, angle, power, steps = SHOT.previewSteps) {
  const w = cloneWorld(world);
  const speed = Math.max(0, Math.min(1, power)) * SHOT.maxLaunchSpeed;
  const ghost = addBall(w, {
    x: THROW_LINE.x,
    y: THROW_LINE.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    owner: PREVIEW_OWNER,
  });
  const id = ghost.id;

  const pts = [];
  for (let i = 0; i < steps; i++) {
    stepWorld(w);
    const b = w.balls.find((x) => x.id === id);
    if (!b || b.state !== 'live') break;
    pts.push({ x: b.x, y: b.y });
  }
  return pts;
}
