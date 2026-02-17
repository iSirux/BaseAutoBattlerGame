import { createGameState, tickResources } from '@/core/gameState';
import { gameEvents } from '@/core/events';
import { GameRenderer } from '@/render/renderer';
import { HUD } from '@/ui/hud';
import { STARTER_KITS } from '@/data/starters';

async function main() {
  const seed = Date.now();
  const starterKit = STARTER_KITS[0];
  const state = createGameState(seed, starterKit);

  // Renderer
  const renderer = new GameRenderer();
  const canvasContainer = document.getElementById('game-canvas')!;
  await renderer.init(canvasContainer);

  // HUD
  const hud = new HUD();
  hud.bindDebugActions(state, () => {
    renderer.renderGrid(state);
  });

  // Initial render
  renderer.renderGrid(state);
  hud.update(state);

  // Resource tick every 2 seconds during build phase
  setInterval(() => {
    if (state.phase === 'build') {
      tickResources(state);
    }
  }, 2000);

  // Main frame loop: update highlights, tooltips, and HUD every frame
  renderer.app.ticker.add(() => {
    renderer.updateHighlights(state);
    hud.updateHoverTooltip(renderer.inputState, state);
    hud.updateSelectionPanel(renderer.inputState, state);
    hud.update(state);
  });

  // Debug console access
  (window as any).__gameState = state;
  (window as any).__renderer = renderer;

  console.log('Base Auto Battler initialized. Access state via __gameState');
}

main().catch(console.error);
