// Small maths helpers. Deliberately free functions over plain numbers rather
// than vector objects, so simulation state stays flat, cloneable and
// serialisable.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const len = (x, y) => Math.sqrt(x * x + y * y);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Closest point on an axis-aligned box to a point. */
export function closestOnBox(px, py, bx, by, bw, bh) {
  return { x: clamp(px, bx, bx + bw), y: clamp(py, by, by + bh) };
}

/** Rotate (x, y) by angle a. */
export function rot(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}
