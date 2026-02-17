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

  // Unlock AudioContext on first user interaction (required by mobile browsers)
  const unlockAudio = () => {
    const ctx = (window as any).zzfxX as AudioContext | undefined;
    if (ctx?.state === 'suspended') ctx.resume();
    document.removeEventListener('pointerdown', unlockAudio);
  };
  document.addEventListener('pointerdown', unlockAudio);

  // HUD
  const hud = new HUD();
  hud.onBuildingPlaced = () => renderer.renderGrid(state);
  hud.initBuildBar(renderer.inputState);
  hud.initRosterPanel(state);
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
    }
  };

  // Initial render
  renderer.renderGrid(state);
  hud.update(state);

  // Grant flat resource income once when entering build phase
  tickResources(state);
  gameEvents.on('phase:changed', ({ to }) => {
    if (to === 'build') {
      tickResources(state);
    }
  });

  // Tech shop button
  document.getElementById('tech-shop-btn')!.addEventListener('click', () => {
    if (state.phase !== 'build') return;
    SFX.click();
    hud.showTechShop(state);
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

    // Battle results → Card selection → Advance to build
    hud.showBattleResults(result, unitsLost, () => {
      if (state.phase === 'game_over') return;

      // Show card selection
      hud.showCardSelection(state, () => {
        advanceToBuild(state);
        renderer.renderGrid(state);
        hud.update(state);
      });
    });
  });

  // Main frame loop
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
