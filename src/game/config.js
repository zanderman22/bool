// ---------------------------------------------------------------------------
// Tuning constants and the virtual coordinate system.
//
// The most important decision here: the simulation runs in a FIXED virtual
// pitch of PITCH.W x PITCH.H units, never in screen pixels. The renderer scales
// and letterboxes that pitch onto whatever screen it is handed.
//
// This is what makes the game consistent across devices. In the original
// bool.html, obstacle geometry was multiplied by window.innerWidth/innerHeight,
// so a level was literally a different level on a phone than on a laptop, and
// rotating the device rebuilt the geometry mid-match.
// ---------------------------------------------------------------------------

export const PITCH = { W: 1000, H: 1600 };

export const PHYSICS = {
  // Simulation runs at a fixed 120 Hz regardless of display refresh rate, with
  // an accumulator in the main loop. This is a correctness requirement, not a
  // nicety: the original advanced physics once per requestAnimationFrame, so a
  // 120 Hz phone played a materially different game from a 60 Hz laptop.
  dt: 1 / 120,

  // Cap on how far a ball may travel in one substep, as a fraction of the
  // smallest radius. Exceeding it triggers substepping, which is what stops
  // hard shots tunnelling straight through thin walls and spinner blades.
  maxTravelPerStep: 0.35,
  maxSubsteps: 16,

  // Velocity decay uses two terms, because either alone feels wrong:
  //  - viscous damping (proportional to speed) bleeds off the initial burst
  //  - rolling deceleration (constant) is what actually brings a ball to rest
  // With damping alone, balls creep asymptotically and ends never resolve.
  damping: 0.9,       // per second, applied as exp(-damping * dt)
  rollingDecel: 210,  // units per second squared

  // Below this speed a ball snaps to rest.
  sleepSpeed: 6,

  wallBounce: 0.62,
  ballBounce: 0.88,    // steel-on-steel boules are lively
  bumperBounce: 1.18,  // bumpers add energy...
  bumperMinKick: 260,  // ...and always give at least this, so a ball dribbling
                       // into a bumper still pops off it

  // Spinners drag balls along their surface as they sweep.
  spinnerFriction: 0.22,

  // Masses. A lighter jack scatters convincingly when struck without
  // behaving like a ping-pong ball.
  ballMass: 1,
  jackMass: 0.55,

  // How long a ball takes to disappear once it enters a moat, in seconds.
  sinkTime: 0.55,

  maxSpeed: 3200,
};

export const BALL = { r: 32, jackR: 18 };

export const RULES = {
  shotsPerPlayer: 3,
  // Points needed to win a match, as in real petanque.
  matchTarget: 13,
  // 'petanque'  - the player who is NOT closest throws next (the real rule,
  //               and far more tactical: being closest hands the pressure over)
  // 'alternate' - strict alternation, simpler to follow
  turnOrder: 'petanque',
};

export const SOLO = {
  // Radius of the scoring ring around the jack in solo play. Drawn on screen,
  // so the target is explicit rather than guessed at.
  radius: 190,
};

export const SHOT = {
  maxDrag: 420,   // swipe length in pitch units for full power
  minDrag: 45,    // below this the swipe is ignored as a stray tap
  maxLaunchSpeed: 2450,
  // Aim preview length. Deliberately short: because the simulation is
  // deterministic we could show the entire trajectory, but that would remove
  // all the skill, so the preview fades out early.
  previewSteps: 46,
};

/** Where a ball is released from, in pitch coordinates. */
export const THROW_LINE = { x: PITCH.W / 2, y: PITCH.H - 110 };
