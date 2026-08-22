// Palette. Organised so a new look (or a level pack with its own theme) is a
// data swap rather than a hunt through draw calls.
//
// This palette (Aug 2026) replaces the original dark/neon carry-over with a
// bright, warm scheme inspired by surviving screenshots of the original
// Voodoo game: a sunlit turquoise court, glossy orange & purple boules, and
// a red jack -- "inviting" rather than moody. The layout and rendering
// stay entirely our own; only the colours were drawn from that reference.

export const THEME = {
  p1: '#F5811E',   // warm glossy orange
  p2: '#9B3FC4',   // glossy purple
  jack: '#F2453F', // bright red
  ghost: 'rgba(255,255,255,0.62)',

  voidBg: '#0B3F3B',
  pitchTop: '#2FE0CE',
  pitchBottom: '#14B3A3',
  pitchEdge: 'rgba(6,46,42,0.22)',

  wall: '#FF6FA8',
  wallStripe: 'rgba(255,255,255,0.32)',
  wallEdge: 'rgba(255,111,168,0.45)',

  moat: '#0B3B37',
  moatEdge: 'rgba(255,246,230,0.28)',

  bumper: '#FFF7EA',
  bumperGlow: 'rgba(255,171,80,0.55)',

  spinner: 'rgba(255,247,234,0.92)',

  throwLine: 'rgba(255,255,255,0.35)',
  soloRing: 'rgba(242,69,63,0.45)',
};

export const ownerColor = (owner) =>
  owner === 0 ? THEME.jack : owner === 1 ? THEME.p1 : owner === 2 ? THEME.p2 : THEME.ghost;
