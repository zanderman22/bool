// ---------------------------------------------------------------------------
// Local-only "which online room was I last in" bookkeeping, for reconnect
// after a refresh (build-order step 6).
//
// Deliberately has NO Supabase import (pure localStorage) so main.js can
// import it with a static `import ... from` line -- unlike everything else
// under src/net/, which is loaded only via dynamic import() specifically to
// keep net/client.js's bare CDN import out of tools/bundle.js's static
// dependency graph (see bool-stage-2-supabase-setup.md). This file has no
// such import, so it's exempt from that restriction, and main.js uses it to
// decide -- with no network module loaded at all -- whether it's worth
// dynamically importing ui/online.js on boot to attempt resuming a room.
// ---------------------------------------------------------------------------

const KEY = 'bool:activeRoom';

export function getActiveRoomCode() {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveRoomCode(code) {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // Storage unavailable (private mode, etc.) -- reconnect just won't be
    // offered next load. Not fatal to the current session.
  }
}

export function clearActiveRoomCode() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}
