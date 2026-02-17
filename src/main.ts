import { createGameState, tickResources, placeBuilding, startBattle, advanceToBuild } from '@/core/gameState';
import { gameEvents } from '@/core/events';
import { GameRenderer } from '@/render/renderer';
import { HUD } from '@/ui/hud';
import { STARTER_KITS } from '@/data/starters';
import { SFX } from '@/audio/sfx';

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
  hud.onBuildingPlaced = () => renderer.renderGrid(state);
  hud.initBuildBar(renderer.inputState);
  hud.bindDebugActions(state, () => {
    renderer.renderGrid(state);
  });

  // Placement mode: click on hex to place the selected building
  renderer.onPlacementClick = (coord) => {
    const buildingType = renderer.inputState.placingBuilding;
    if (!buildingType) return;

    const result = placeBuilding(state, buildingType, coord);
    if (result) {
      SFX.build();
      renderer.renderGrid(state);
      // Stay in placement mode so player can place multiple
    }
  };

  // Initial render
  renderer.renderGrid(state);
  hud.update(state);

  // Grant flat resource income once when entering build phase
  tickResources(state); // initial build phase income
  gameEvents.on('phase:changed', ({ to }) => {
    if (to === 'build') {
      tickResources(state);
    }
  });

  // Ready button: start the battle
  document.getElementById('ready-btn')!.addEventListener('click', () => {
    if (state.phase !== 'build') return;
    SFX.click();

    const rosterSizeBefore = state.roster.size;
    const result = startBattle(state);
    const unitsLost = rosterSizeBefore - state.roster.size;

    renderer.renderGrid(state);
    hud.update(state);

    hud.showBattleResults(result, unitsLost, () => {
      if (state.phase !== 'game_over') {
        advanceToBuild(state);
        renderer.renderGrid(state);
        hud.update(state);
      }
    });
  });

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
