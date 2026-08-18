// Swipe aiming.
//
// Direction and power both come from the swipe, matching how Bool played:
// "the intensity of the shot and its direction are based on the length and the
// direction of the swipe". The drag is inverted -- you pull back away from
// where you want the ball to go, like drawing a bow -- which keeps your thumb
// clear of the part of the pitch you are trying to look at.
//
// Drag distances are converted into PITCH units before being measured, so a
// swipe of a given on-screen length means the same thing on a phone as on a
// desktop. Measuring in raw pixels (as the original did) made the game
// materially easier on large screens.

import { SHOT } from '../game/config.js';
import { previewPath } from '../game/predict.js';

export function createAim(canvas, renderer, { canShoot, getWorld, onShoot }) {
  const aim = { active: false, dx: 0, dy: 0, power: 0, angle: 0, path: [] };
  let pointerId = null;
  let start = null;
  let dirty = false;

  const pitchDelta = (e) => {
    const s = renderer.view.scale || 1;
    return { x: (start.x - e.clientX) / s, y: (start.y - e.clientY) / s };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (pointerId !== null || !canShoot()) return;
    pointerId = e.pointerId;
    canvas.setPointerCapture(pointerId);
    start = { x: e.clientX, y: e.clientY };
    Object.assign(aim, { active: true, dx: 0, dy: 0, power: 0, angle: 0, path: [] });
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId || !start) return;
    const d = pitchDelta(e);
    const dist = Math.hypot(d.x, d.y);
    const clamped = Math.min(dist, SHOT.maxDrag);
    const k = dist > 0 ? clamped / dist : 0;

    aim.dx = d.x * k;
    aim.dy = d.y * k;
    aim.power = clamped / SHOT.maxDrag;
    aim.angle = Math.atan2(aim.dy, aim.dx);
    dirty = true;
  });

  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    try { canvas.releasePointerCapture(pointerId); } catch { /* already gone */ }
    pointerId = null;

    const dist = Math.hypot(aim.dx, aim.dy);
    const fired = aim.active && dist >= SHOT.minDrag;
    const shot = { angle: aim.angle, power: aim.power };

    Object.assign(aim, { active: false, dx: 0, dy: 0, power: 0, path: [] });
    start = null;

    if (fired) onShoot(shot);
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  /**
   * Refresh the predicted path. Called once per animation frame rather than on
   * every pointermove, since a fast swipe fires move events far more often
   * than the screen refreshes.
   */
  function tick() {
    if (!aim.active || !dirty) return;
    dirty = false;
    aim.path = aim.power > 0 ? previewPath(getWorld(), aim.angle, aim.power) : [];
  }

  /** Drop any in-progress aim, e.g. when the turn changes underneath us. */
  function cancel() {
    pointerId = null;
    start = null;
    Object.assign(aim, { active: false, dx: 0, dy: 0, power: 0, path: [] });
  }

  return { aim, tick, cancel };
}
