// ---------------------------------------------------------------------------
// Supabase client init + anonymous auth.
//
// Loaded from a CDN as an ES module (esm.sh), not an npm dependency, to keep
// the project's "plain ES modules, no build step" property intact -- see
// bool-stage-1-decisions.md. tools/bundle.js's dependency walker rejects any
// bare (non-relative) import, so this file -- and anything that imports it --
// must stay OUT of src/main.js's import graph until the bundler is taught to
// leave bare imports alone (or vendors this file locally). It's fine for now:
// nothing in src/net/ is wired into main.js yet.
//
// Project ref: pwezyhpqyrsxbqhzzjlz (Supabase project "bool", eu-west-1).
// ---------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://pwezyhpqyrsxbqhzzjlz.supabase.co';
// Publishable key -- safe to ship in client code. All access is governed by
// the RLS policies on rooms/room_players/matches/shots, not by keeping this
// secret. See the "publishable_key" note below for the legacy anon key.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_z1719OzFPe5jb3i8E1bPNQ_JV8MeXFP';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let authReady = null;

/**
 * Ensure we have a signed-in user (anonymous auth -- a UID with no
 * email/password, per the Stage 2 MVP scope). Safe to call repeatedly; the
 * session persists across reloads via the client's own storage, so this is a
 * no-op after the first successful call in a browser.
 */
export function ensureAuth() {
  if (!authReady) {
    authReady = (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) return session.user;
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      return data.user;
    })();
  }
  return authReady;
}

/** The current user's uid, once ensureAuth() has resolved. Throws if called before that. */
export async function currentUid() {
  const user = await ensureAuth();
  return user.id;
}
