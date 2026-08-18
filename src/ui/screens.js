// Modal screen management.

const IDS = ['setup', 'endover', 'matchover'];

export function showScreen(name) {
  for (const id of IDS) {
    document.getElementById(`screen-${id}`).classList.toggle('hidden', id !== name);
  }
  document.getElementById('hud').classList.toggle('hidden', name === 'setup');
}

export const hideScreens = () => showScreen(null);
