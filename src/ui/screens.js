// Modal screen management.

const IDS = ['setup', 'online-menu', 'online-join', 'online-room', 'endover', 'matchover'];
// The HUD makes no sense before a match exists -- hidden on setup and every
// online-lobby screen, same as it always was for 'setup' alone. It stays
// visible behind endover/matchover (showing the frozen final score), which
// matches the original behaviour.
const HUD_HIDDEN = new Set(['setup', 'online-menu', 'online-join', 'online-room']);

export function showScreen(name) {
  for (const id of IDS) {
    document.getElementById(`screen-${id}`).classList.toggle('hidden', id !== name);
  }
  document.getElementById('hud').classList.toggle('hidden', HUD_HIDDEN.has(name));
}

export const hideScreens = () => showScreen(null);
