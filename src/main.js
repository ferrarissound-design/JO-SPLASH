import { Game } from './core/Game.js';
import { installSetupPreferences } from './core/SetupPreferences.js';

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  installSetupPreferences(game);
});
