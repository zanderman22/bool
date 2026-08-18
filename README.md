# Bool

A turn-based, swipe-to-throw pétanque game for the browser. Pull back, aim,
release; three boules each; closest to the jack takes the end.

This is a rebuild of the original single-file `bool.html` prototype, keeping the
gameplay and the look but replacing the engine underneath it.

## Running it

No build step, no dependencies.

```bash
npm run serve      # http://localhost:8080
```

Or build the whole game into one self-contained file you can open from anywhere
(including a phone, with no server):

```bash
npm run bundle     # -> dist/bool.html
```

## Rules

Bool was described as *"a turn-based, ball-swiping game inspired by the French
classic jeu pétanque"* where *"each player has three shots to get as close as
possible to the target, avoiding traps and obstacles"*, with shot power and
direction set by the length and direction of the swipe. The original app is
long delisted, so the finer rules here follow real pétanque:

- **Three boules each per end.**
- **Turn order** — after both players have opened, whoever is *not* closest to
  the jack throws, and keeps throwing until they take the lead or run out.
  Being closest hands the pressure straight back, which is what gives the
  format its tension. Set `RULES.turnOrder` to `'alternate'` in
  `src/game/config.js` for strict alternation instead.
- **Scoring** — the closest player scores one point for *every* boule of theirs
  nearer than the opponent's best. An end is worth 1–3 points, so there is real
  value in stacking a second and third boule tight.
- **The jack is live.** It can be knocked. Drive it into a moat and the end is
  void — no points, replay the level.
- **Moats** kill a boule outright; the throw is still spent.
- **First to 13** takes the match. The winner of an end throws first in the next.
- **Solo** is a par mode: land enough boules inside the scoring ring to clear
  the level. Each level's par comes from measured playtest data (see below).

## Architecture

```
src/core/      seeded RNG, maths helpers
src/game/      config, world (physics), match (rules), scoring, predict
src/levels/    level primitives + the level set as data
src/render/    canvas renderer, theme, effects
src/ui/        HUD and screens
src/input/     swipe aiming
tools/         dev server, bundler, tuning/playtest harness, browser test
tests/         headless test suite
```

Everything under `src/game` and `src/levels` is browser-free and pure. Only
`src/main.js`, `src/render` and `src/ui` touch the DOM.

### The one property everything rests on: determinism

`stepWorld()` is a pure function over plain data. Same world plus same sequence
of shots produces the same result, bit for bit, on any device at any refresh
rate. Nothing in the simulation calls `Math.random()` or reads the clock.

That single property is what pays for everything downstream:

- **Networked play** — peers exchange shot events (`{seq, player, angle,
  power}`), never ball positions. `match.log` is already exactly that, and
  `replay()` already reconstructs a match from it. This is the seam Stage 2
  plugs into; no engine changes required.
- **Replays and reconnection** — replaying the log catches you up.
- **Honest aim preview** — the trajectory guide runs the *real* physics on a
  cloned world, so there is no second approximate physics implementation to
  keep in sync. It is deliberately truncated so it aids aim without solving
  the shot for you.
- **Automated playtesting** — `npm run tune` fires thousands of shots through
  every level in about two seconds and reports whether each is playable.

### What changed from the original prototype

The mechanics are the same game. The engine is not:

| | Original | Now |
|---|---|---|
| Coordinates | Geometry scaled by `window.innerWidth/innerHeight` | Fixed 1000×1600 virtual pitch, letterboxed by the renderer |
| Timestep | One physics step per animation frame | Fixed 120 Hz with an accumulator |
| Fast shots | Could pass straight through thin walls | Velocity-based substepping prevents tunnelling |
| Ball collisions | Fixed 1.85 factor, mass ignored | Proper impulse with masses and restitution |
| Spinners | Arbitrary `+2` nudge along the normal | Real surface velocity (ω × r) and tangential drag |
| Degenerate overlaps | Divided by zero, produced `NaN` positions | Resolved with a deterministic tie-break |
| Resize | Rebuilt the level, silently restarting the round | Only remaps pitch→pixels; the match keeps running |
| Drag distance | Measured in raw pixels, so easier on big screens | Measured in pitch units, identical everywhere |
| Levels | Hard-coded, three of them | Data, with a validated schema and a campaign order |
| Solo scoring | Placeholder — a point per surviving ball | Par mode against a visible scoring ring |

The three original layouts are ported, with adjustments where measurement
showed they were unplayable rather than hard — see the comments in
`src/levels/levels.js`.

## Verifying

```bash
npm test           # 23 headless tests: determinism, collisions, scoring, turn order
npm run tune       # travel curve + automated playtest of every level
node tools/browsertest.js   # real browser, real swipes, screenshots to shots/
```

The test suite asserts the things that are easy to break and hard to notice:
replays are bit-identical, the outcome does not depend on how time is chopped
into frames, full-power shots cannot tunnel through a 6-unit wall, collisions
never manufacture energy, and coincident balls separate instead of producing
`NaN`.

`npm run tune` reports, per level, how often the obvious shot sinks and what
share of the whole plausible input space finishes inside the scoring ring —
the "success basin". A basin near zero means the level cannot be solved; a very
large one means it is trivial. Level pars and the campaign order are both set
from these numbers rather than by guesswork.

## Where this goes next

The engine is built so none of this needs it rewritten:

1. **Online play** — Supabase-backed rooms exchanging shot events. The event
   log, replay and reconnection paths already exist.
2. **More levels** — levels are data; adding one is a data edit.
3. **A level editor** — the same primitives, authored in the browser, validated
   by `validateLevel()` and auto-playtested by the `tune` harness before
   publishing.
4. **Generated levels** — a generator can propose layouts and the playtest
   harness can score them for playability before a human ever sees one.
