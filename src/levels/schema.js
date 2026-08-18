// ---------------------------------------------------------------------------
// Levels are data, not code.
//
// A level is authored in normalised 0..1 coordinates and compiled once into
// pitch units. Because nothing here depends on screen size, a level is the
// same level everywhere -- and because it is plain data, it can equally well
// come from a file, a level editor, a database row, or a generator.
// ---------------------------------------------------------------------------

import { PITCH } from '../game/config.js';

const X = (v) => v * PITCH.W;
const Y = (v) => v * PITCH.H;
const S = (v) => v * Math.min(PITCH.W, PITCH.H);

/**
 * Primitive constructors. Each takes normalised coordinates and returns an
 * obstacle in pitch units.
 */
export const wall = ({ x, y, w, h, cr = 0.012 }) => ({
  type: 'wall', x: X(x), y: Y(y), w: X(w), h: Y(h), cr: S(cr),
});

export const moat = ({ x, y, w, h }) => ({
  type: 'moat', x: X(x), y: Y(y), w: X(w), h: Y(h),
});

export const bumper = ({ x, y, r }) => ({
  type: 'bumper', x: X(x), y: Y(y), r: S(r),
});

/** `rps` is revolutions per second; negative spins the other way. */
export const spinner = ({ x, y, length, thick, angle = 0, rps = 0.38 }) => ({
  type: 'spinner',
  x: X(x), y: Y(y),
  length: X(length), thick: S(thick),
  angle,
  omega: rps * Math.PI * 2,
});

export const jack = ({ x, y }) => ({ x: X(x), y: Y(y) });

/**
 * Validate a compiled level. Called by the tests and by the (future) editor;
 * cheap enough to leave on in development.
 */
export function validateLevel(level) {
  const errs = [];
  if (!level.id) errs.push('level has no id');
  if (!level.jack) errs.push(`${level.id}: no jack position`);
  else {
    if (level.jack.x < 0 || level.jack.x > PITCH.W) errs.push(`${level.id}: jack x out of pitch`);
    if (level.jack.y < 0 || level.jack.y > PITCH.H) errs.push(`${level.id}: jack y out of pitch`);
  }
  for (const [i, o] of (level.obstacles || []).entries()) {
    if (!['wall', 'moat', 'bumper', 'spinner'].includes(o.type)) {
      errs.push(`${level.id}: obstacle ${i} has unknown type "${o.type}"`);
    }
    if (o.type === 'spinner' && o.length <= o.thick) {
      errs.push(`${level.id}: spinner ${i} is thicker than it is long`);
    }
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'number' && !Number.isFinite(o[k])) {
        errs.push(`${level.id}: obstacle ${i} has non-finite ${k}`);
      }
    }
  }
  return errs;
}
