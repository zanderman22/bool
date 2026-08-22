// ---------------------------------------------------------------------------
// Canvas renderer.
//
// Owns the mapping between pitch units and screen pixels, and nothing else --
// it never mutates game state. Resizing or rotating the device only changes
// this mapping; the match keeps running untouched, which is the fix for the
// original's habit of rebuilding the level (and so silently restarting the
// round) on every resize event.
// ---------------------------------------------------------------------------

import { PITCH, BALL, THROW_LINE, SOLO } from '../game/config.js';
import { THEME, ownerColor } from './theme.js';
import { drawEffects } from './effects.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, cssW: 0, cssH: 0, dpr: 1, bottomInset: 0 };

  function resize(bottomInset = 0) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    // Fit the whole pitch into the space above the HUD, preserving aspect.
    const availH = Math.max(120, cssH - bottomInset);
    const scale = Math.min(cssW / PITCH.W, availH / PITCH.H);

    Object.assign(view, {
      dpr, cssW, cssH, bottomInset, scale,
      ox: (cssW - PITCH.W * scale) / 2,
      oy: (availH - PITCH.H * scale) / 2,
    });
  }

  const toScreen = (x, y) => ({ x: view.ox + x * view.scale, y: view.oy + y * view.scale });
  const toPitch = (sx, sy) => ({ x: (sx - view.ox) / view.scale, y: (sy - view.oy) / view.scale });

  function draw(match, aim, fx) {
    const { dpr, scale } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.cssW, view.cssH);

    // Letterbox backdrop.
    ctx.fillStyle = THEME.voidBg;
    ctx.fillRect(0, 0, view.cssW, view.cssH);

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(scale, scale);

    drawPitch(ctx);
    if (match.mode === 'solo') drawSoloRing(ctx, match);
    drawThrowLine(ctx);
    for (const o of match.world.obstacles) drawObstacle(ctx, o);
    if (match.phase === 'aiming') drawReadyBoule(ctx, match);
    if (aim && aim.active) drawAim(ctx, aim);
    for (const b of match.world.balls) drawBall(ctx, b, match);

    ctx.restore();

    drawEffects(ctx, fx, toScreen, scale);
  }

  return { resize, draw, toScreen, toPitch, view };
}

// ---------------------------------------------------------------------------

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPitch(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, PITCH.H);
  g.addColorStop(0, THEME.pitchTop);
  g.addColorStop(1, THEME.pitchBottom);
  ctx.fillStyle = g;
  roundRect(ctx, 0, 0, PITCH.W, PITCH.H, 26);
  ctx.fill();

  ctx.strokeStyle = THEME.pitchEdge;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawThrowLine(ctx) {
  ctx.save();
  ctx.strokeStyle = THEME.throwLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 14]);
  ctx.beginPath();
  ctx.moveTo(30, THROW_LINE.y);
  ctx.lineTo(PITCH.W - 30, THROW_LINE.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // The throwing circle.
  ctx.beginPath();
  ctx.arc(THROW_LINE.x, THROW_LINE.y, BALL.r + 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSoloRing(ctx, match) {
  const jack = match.world.balls.find((b) => b.owner === 0);
  if (!jack || jack.state !== 'live') return;
  ctx.save();
  ctx.strokeStyle = THEME.soloRing;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 12]);
  ctx.beginPath();
  ctx.arc(jack.x, jack.y, SOLO.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * The boule waiting to be thrown, in the current player's colour.
 *
 * Without this the throwing circle sits empty and there is no indication of
 * whose turn it is on the pitch itself — you have to read the HUD. Showing the
 * ball you are about to throw is also what makes the pull-back gesture legible.
 */
function drawReadyBoule(ctx, match) {
  const color = ownerColor(match.current);
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;

  const g = ctx.createRadialGradient(
    THROW_LINE.x - BALL.r * 0.35, THROW_LINE.y - BALL.r * 0.4, BALL.r * 0.15,
    THROW_LINE.x, THROW_LINE.y, BALL.r,
  );
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, color);
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(THROW_LINE.x, THROW_LINE.y, BALL.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawObstacle(ctx, o) {
  ctx.save();
  switch (o.type) {
    case 'wall': {
      ctx.fillStyle = THEME.wall;
      roundRect(ctx, o.x, o.y, o.w, o.h, o.cr || 6);
      ctx.fill();
      ctx.shadowColor = THEME.wallEdge;
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;
      drawWallStripes(ctx, o);
      break;
    }
    case 'moat': {
      ctx.fillStyle = THEME.moat;
      roundRect(ctx, o.x, o.y, o.w, o.h, 22);
      ctx.fill();
      ctx.strokeStyle = THEME.moatEdge;
      ctx.lineWidth = 3;
      ctx.stroke();
      break;
    }
    case 'bumper': {
      ctx.shadowColor = THEME.bumperGlow;
      ctx.shadowBlur = 28;
      ctx.fillStyle = THEME.bumper;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(120,170,255,0.35)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'spinner': {
      ctx.translate(o.x, o.y);
      ctx.rotate(o.angle);
      ctx.fillStyle = THEME.spinner;
      roundRect(ctx, -o.length / 2, -o.thick / 2, o.length, o.thick, o.thick / 2);
      ctx.fill();
      // Hub, so the pivot reads clearly.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, o.thick * 0.9, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/**
 * Diagonal candy stripes over a wall, clipped to its rounded rect. Purely a
 * surface treatment layered on top of the solid fill above -- the collision
 * geometry (o.x/o.y/o.w/o.h) is untouched.
 */
function drawWallStripes(ctx, o) {
  ctx.save();
  roundRect(ctx, o.x, o.y, o.w, o.h, o.cr || 6);
  ctx.clip();

  ctx.strokeStyle = THEME.wallStripe;
  ctx.lineWidth = Math.max(6, Math.min(o.w, o.h) * 0.22);
  const step = ctx.lineWidth * 2;
  const span = o.w + o.h; // long enough to cover the rect at 45 degrees
  ctx.beginPath();
  for (let d = -span; d < span; d += step) {
    ctx.moveTo(o.x + d, o.y);
    ctx.lineTo(o.x + d + o.h, o.y + o.h);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBall(ctx, b, match) {
  if (b.state === 'dead') return;
  const color = ownerColor(b.owner);
  const alpha = b.state === 'sinking' ? 1 - b.sink : 1;
  const radius = b.r * (b.state === 'sinking' ? 1 - b.sink * 0.65 : 1);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (b.owner === 0) {
    // The jack: small, bright, and unmistakable.
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
  }

  // Body, with a light source up and to the left so balls read as spheres.
  const g = ctx.createRadialGradient(
    b.x - radius * 0.35, b.y - radius * 0.4, radius * 0.15,
    b.x, b.y, radius,
  );
  g.addColorStop(0, mix(color, '#ffffff', 0.55));
  g.addColorStop(0.65, color);
  g.addColorStop(1, mix(color, '#000000', 0.4));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = b.owner === 0 ? 3 : 2;
  ctx.beginPath();
  ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawAim(ctx, aim) {
  // Predicted path, fading out along its length.
  if (aim.path && aim.path.length > 1) {
    for (let i = 0; i < aim.path.length; i += 3) {
      const p = aim.path[i];
      const k = 1 - i / aim.path.length;
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.5 * k;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 + 5 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Pull-back indicator: the drag runs backwards from the throwing circle, so
  // the gesture reads like drawing a bow.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 4;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(THROW_LINE.x, THROW_LINE.y);
  ctx.lineTo(THROW_LINE.x - aim.dx, THROW_LINE.y - aim.dy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Power arc around the throwing circle.
  const r = BALL.r + 30;
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(THROW_LINE.x, THROW_LINE.y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = powerColor(aim.power);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(THROW_LINE.x, THROW_LINE.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * aim.power);
  ctx.stroke();
  ctx.restore();
}

const powerColor = (p) => (p < 0.55 ? '#7ef7a5' : p < 0.85 ? '#ffd54a' : THEME.jack);

/** Blend two hex colours. Only used for shading, never in simulation. */
function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function hex(h) {
  const s = h.replace('#', '');
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}
