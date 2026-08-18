// Purely cosmetic impact effects.
//
// These live entirely outside the simulation: they are driven by the events
// the world emits, and dropping every one of them would not change a single
// ball position. That separation is deliberate -- effects can use wall-clock
// time and randomness freely, which the simulation must never do.

import { ownerColor, THEME } from './theme.js';

export function createEffects() {
  return { rings: [], maxRings: 40 };
}

export function pushEvents(fx, events) {
  for (const e of events) {
    if (fx.rings.length >= fx.maxRings) break;
    if (e.type === 'hit') {
      fx.rings.push({
        x: e.x, y: e.y, t: 0,
        life: 0.32 + 0.25 * e.strength,
        r0: 14, r1: 40 + 90 * e.strength,
        color: e.kind === 'bumper' ? THEME.bumperGlow : 'rgba(255,255,255,0.75)',
        width: 2 + 3 * e.strength,
      });
    } else if (e.type === 'sink') {
      fx.rings.push({
        x: e.x, y: e.y, t: 0, life: 0.7,
        r0: 8, r1: 70,
        color: THEME.moatEdge, width: 3,
      });
      fx.rings.push({
        x: e.x, y: e.y, t: 0, life: 0.55,
        r0: 4, r1: 46,
        color: ownerColor(e.owner), width: 2,
      });
    }
  }
  events.length = 0;
}

export function updateEffects(fx, dt) {
  for (let i = fx.rings.length - 1; i >= 0; i--) {
    const r = fx.rings[i];
    r.t += dt;
    if (r.t >= r.life) fx.rings.splice(i, 1);
  }
}

export function drawEffects(ctx, fx, toScreen, scale) {
  for (const r of fx.rings) {
    const k = r.t / r.life;
    const rad = (r.r0 + (r.r1 - r.r0) * easeOut(k)) * scale;
    const p = toScreen(r.x, r.y);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * scale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
