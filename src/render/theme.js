// Palette. Carried over from the original bool.html so the game still looks
// like itself, but organised so a future theme (or a level pack with its own
// look) is a data swap rather than a hunt through draw calls.

export const THEME = {
  p1: '#ff416c',
  p2: '#43e97b',
  jack: '#ffcc00',
  ghost: 'rgba(255,255,255,0.55)',

  voidBg: '#0b0b1a',
  pitchTop: '#1b1740',
  pitchBottom: '#120f2c',
  pitchEdge: 'rgba(255,255,255,0.10)',

  wall: '#ffd54a',
  wallEdge: 'rgba(255,213,74,0.35)',

  moat: '#0a1040',
  moatEdge: 'rgba(90,140,255,0.45)',

  bumper: '#ffffff',
  bumperGlow: 'rgba(140,200,255,0.65)',

  spinner: 'rgba(200,215,255,0.85)',

  throwLine: 'rgba(255,255,255,0.16)',
  soloRing: 'rgba(255,204,0,0.35)',
};

export const ownerColor = (owner) =>
  owner === 0 ? THEME.jack : owner === 1 ? THEME.p1 : owner === 2 ? THEME.p2 : THEME.ghost;
