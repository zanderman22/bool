// ---------------------------------------------------------------------------
// The level set.
//
// The first three are faithful ports of the original bool.html layouts. The
// rest are new, built from the same primitives to show the format carries its
// weight -- adding a level is now a data edit, not a code change.
//
// `par` is the solo target: the score you need to beat over one end to clear
// the level.
// ---------------------------------------------------------------------------

import { wall, moat, bumper, spinner, jack } from './schema.js';

const CATALOGUE = [
  {
    id: 'the-gate',
    name: 'The Gate',
    par: 1,
    jack: jack({ x: 0.5, y: 0.12 }),
    obstacles: [
      // Side walls funnel the throw toward the middle.
      wall({ x: 0.0, y: 0.30, w: 0.20, h: 0.02 }),
      wall({ x: 0.8, y: 0.30, w: 0.20, h: 0.02 }),
      // Two bumpers you must thread between.
      bumper({ x: 0.35, y: 0.50, r: 0.05 }),
      bumper({ x: 0.65, y: 0.50, r: 0.05 }),
      // A spinner intermittently blocking the direct line.
      spinner({ x: 0.5, y: 0.35, length: 0.15, thick: 0.02, rps: 0.38 }),
      // Corner moats punish a wild throw.
      moat({ x: 0.05, y: 0.70, w: 0.15, h: 0.10 }),
      moat({ x: 0.80, y: 0.70, w: 0.15, h: 0.10 }),
    ],
  },
  {
    id: 'the-shelf',
    name: 'The Shelf',
    par: 1,
    jack: jack({ x: 0.5, y: 0.14 }),
    obstacles: [
      wall({ x: 0.18, y: 0.30, w: 0.64, h: 0.03 }),
      moat({ x: 0.35, y: 0.54, w: 0.30, h: 0.08 }),
      bumper({ x: 0.50, y: 0.72, r: 0.06 }),
    ],
  },
  {
    id: 'the-causeway',
    name: 'The Causeway',
    par: 1,
    jack: jack({ x: 0.5, y: 0.14 }),
    obstacles: [
      // The corridor between the moats has to be wider than the spinner that
      // sweeps across it, or passage is pure timing and the level plays as a
      // coin flip. At the original 0.38 the gap either side of the blade was
      // narrower than a boule.
      moat({ x: 0.00, y: 0.26, w: 0.32, h: 0.62 }),
      moat({ x: 0.68, y: 0.26, w: 0.32, h: 0.62 }),
      // Hazards alternate either side of the lane rather than sitting on it.
      // A spinner hub dead centre deflects almost every straight throw into
      // the water, which measured as an 81% sink rate on the obvious shot.
      spinner({ x: 0.60, y: 0.52, length: 0.16, thick: 0.022, rps: 0.33 }),
      bumper({ x: 0.40, y: 0.30, r: 0.055 }),
      wall({ x: 0.30, y: 0.20, w: 0.12, h: 0.03 }),
      wall({ x: 0.58, y: 0.20, w: 0.12, h: 0.03 }),
    ],
  },

  // --- new levels -------------------------------------------------------
  {
    id: 'the-bank',
    name: 'The Bank',
    par: 3,
    // Jack tucked in the corner: the direct line is blocked, so the shot
    // wants to be played off the side wall.
    jack: jack({ x: 0.82, y: 0.13 }),
    obstacles: [
      wall({ x: 0.30, y: 0.22, w: 0.36, h: 0.03 }),
      wall({ x: 0.30, y: 0.22, w: 0.03, h: 0.24 }),
      moat({ x: 0.00, y: 0.46, w: 0.28, h: 0.12 }),
      bumper({ x: 0.20, y: 0.70, r: 0.045 }),
    ],
  },
  {
    id: 'the-mill',
    name: 'The Mill',
    par: 2,
    jack: jack({ x: 0.5, y: 0.11 }),
    obstacles: [
      spinner({ x: 0.30, y: 0.40, length: 0.22, thick: 0.022, rps: 0.42 }),
      spinner({ x: 0.70, y: 0.40, length: 0.22, thick: 0.022, angle: Math.PI / 2, rps: -0.42 }),
      // Moats flank the approach rather than sitting on it. A moat directly on
      // the throwing line makes the natural shot a guaranteed loss, which
      // reads as a broken level rather than a hard one.
      moat({ x: 0.14, y: 0.60, w: 0.16, h: 0.09 }),
      moat({ x: 0.70, y: 0.60, w: 0.16, h: 0.09 }),
      wall({ x: 0.00, y: 0.22, w: 0.28, h: 0.025 }),
      wall({ x: 0.72, y: 0.22, w: 0.28, h: 0.025 }),
    ],
  },
  {
    id: 'the-pinball',
    name: 'Pinball',
    par: 2,
    jack: jack({ x: 0.5, y: 0.16 }),
    obstacles: [
      bumper({ x: 0.28, y: 0.36, r: 0.05 }),
      bumper({ x: 0.72, y: 0.36, r: 0.05 }),
      // Offset from dead centre, so there is a line past it for a player who
      // spots it rather than a guaranteed ricochet for everyone.
      bumper({ x: 0.42, y: 0.52, r: 0.06 }),
      bumper({ x: 0.20, y: 0.64, r: 0.04 }),
      bumper({ x: 0.80, y: 0.64, r: 0.04 }),
      moat({ x: 0.00, y: 0.80, w: 0.18, h: 0.09 }),
      moat({ x: 0.82, y: 0.80, w: 0.18, h: 0.09 }),
    ],
  },
  {
    id: 'the-needle',
    name: 'The Needle',
    par: 1,
    jack: jack({ x: 0.5, y: 0.10 }),
    obstacles: [
      // A narrow gap dead ahead, with moats either side of the approach.
      wall({ x: 0.00, y: 0.34, w: 0.40, h: 0.03 }),
      wall({ x: 0.60, y: 0.34, w: 0.40, h: 0.03 }),
      moat({ x: 0.00, y: 0.44, w: 0.30, h: 0.22 }),
      moat({ x: 0.70, y: 0.44, w: 0.30, h: 0.22 }),
      spinner({ x: 0.50, y: 0.20, length: 0.22, thick: 0.02, rps: 0.28 }),
    ],
  },
  {
    id: 'the-island',
    name: 'The Island',
    par: 2,
    // The jack sits on an island ringed by water. Pure precision — no spinner
    // here, because a blade across the only corridor makes the level a
    // timing puzzle rather than an accuracy one.
    jack: jack({ x: 0.5, y: 0.26 }),
    obstacles: [
      moat({ x: 0.00, y: 0.14, w: 0.32, h: 0.26 }),
      moat({ x: 0.68, y: 0.14, w: 0.32, h: 0.26 }),
      moat({ x: 0.34, y: 0.02, w: 0.32, h: 0.09 }),
      bumper({ x: 0.30, y: 0.52, r: 0.045 }),
      bumper({ x: 0.70, y: 0.52, r: 0.045 }),
    ],
  },
];

// Campaign order, kept separate from the catalogue so a level's difficulty
// placement is a data decision rather than a question of where it happens to
// sit in the file. Ordering here follows the measured success-basin sizes
// reported by `npm run tune`, easiest first.
const CAMPAIGN = [
  'the-gate',
  'the-bank',
  'the-mill',
  'the-shelf',
  'the-pinball',
  'the-island',
  'the-needle',
  'the-causeway',
];

export const LEVELS = CAMPAIGN.map((id) => {
  const lv = CATALOGUE.find((l) => l.id === id);
  if (!lv) throw new Error(`campaign references unknown level "${id}"`);
  return lv;
});

export { CATALOGUE };

export const levelAt = (i) => LEVELS[((i % LEVELS.length) + LEVELS.length) % LEVELS.length];
