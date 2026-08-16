# Bool — Stage 1 faithful rebuild

This project rebuilds the supplied single-file `bool.html` as a maintainable TypeScript/Vite game while preserving the mechanics and the original three level layouts.

## Play modes

- **Solo practice** — three shots; preserves the reference implementation's placeholder solo scoring of one point per surviving ball.
- **Local two-player** — alternating shots on one device, three shots each, using the reference implementation's bocce-style scoring: the player with the closest ball scores one point for each of their balls closer than the opponent's closest ball.

Online multiplayer is intentionally deferred to Stage 2.

## Stage 1 mechanics preserved

- pull-back-and-release shooting
- movable yellow target ball
- ball/ball collisions
- board-edge rebounds
- walls
- bumpers
- rotating spinners
- moats that sink/remove balls
- target loss makes the round void
- three shots per player per level
- cumulative score across levels
- all three supplied level layouts

## Engineering changes

- TypeScript modules instead of a monolithic HTML script
- fixed 120 Hz simulation timestep
- time-based friction instead of frame-dependent physics
- game engine separated from renderer and DOM UI
- level definitions kept as data
- ordered shot log retained as first-class state for replay/networking later
- safe handling of zero-distance collision overlaps
- resizing transforms live ball state instead of silently restarting the round
- local two-player mode exercises the real scoring rules without introducing networking

## Source structure

- `src/game/engine.ts` — turns, shots, round flow and score state
- `src/game/physics.ts` — simulation and collisions
- `src/game/scoring.ts` — bocce scoring
- `src/game/renderer.ts` — canvas drawing only
- `src/levels/levels.ts` — level data
- `src/main.ts` — browser input and UI orchestration

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The output in `dist/` is a static site suitable for Vercel.

## Stage 2 boundary

Stage 2 should add online matches using Supabase while keeping the deterministic game engine intact. The network layer should synchronize ordered shot events rather than continuously streaming ball coordinates.
