// Seeded, deterministic PRNG (mulberry32).
//
// The simulation must never call Math.random(): every source of variation has
// to be reproducible, so that a match can be replayed from its shot events
// alone. That property is what makes networked play, replays and automated
// level playtesting possible later.

export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.state = () => a;
  rng.setState = (s) => { a = s >>> 0; };
  return rng;
}

/** Deterministic 32-bit hash, for turning level ids or match codes into seeds. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
