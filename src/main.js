import { Game } from './core/Game.js';
import { installSetupPreferences } from './core/SetupPreferences.js';

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  // Keep the WebGL surface in an explicit base stacking layer so HUD controls
  // remain genuinely clickable/tappable instead of merely visible above it.
  game.canvas.style.zIndex = '0';
  installSetupPreferences(game);
});
