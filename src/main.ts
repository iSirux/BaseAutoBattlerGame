import { createGameState, tickResources, placeBuilding, prepareBattle, finalizeBattle, advanceToBuild, setPhase } from '@/core/gameState';
import { gameEvents } from '@/core/events';
import { GameRenderer } from '@/render/renderer';
import { BattlePlayback } from '@/render/battlePlayback';
import { BattleControls } from '@/ui/battleControls';
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

  // Battle Controls
  const battleControls = new BattleControls();

  // Enemy click → show in selection panel
  renderer.arena.onEnemyClick = (defId) => {
    hud.showEnemyDetail(defId);
  };

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

  // Show initial wave preview
  if (state.currentWaveDef) {
    renderer.arena.showWavePreview(state.currentWaveDef);
  }

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

  // Track if battle is in progress to prevent double-clicks
  let battleInProgress = false;

  // Ready button: start the battle (async flow)
  document.getElementById('ready-btn')!.addEventListener('click', async () => {
    if (state.phase !== 'build' || battleInProgress) return;
    battleInProgress = true;
    SFX.click();

    const rosterSizeBefore = state.roster.size;

    // 1. Switch to battle phase (hides build UI)
    setPhase(state, 'battle');
    hud.update(state);

    // 2. Prepare battle (instant, produces log)
    const { battleState, log, result } = prepareBattle(state);

    // 3. Clear wave preview, close panels
    hud.hideSelectionPanel();
    renderer.inputState.selectedHex = null;
    document.getElementById('roster-panel')?.classList.remove('visible');

    // 3. Pan camera to arena
    await renderer.panToArena();

    // 4. Play back the battle
    const playback = new BattlePlayback(log, renderer.arena);
    battleControls.bind(playback);
    battleControls.show();

    await playback.play();

    battleControls.hide();

    // 5. Finalize battle (mutate state)
    finalizeBattle(state, result, battleState);
    const unitsLost = rosterSizeBefore - state.roster.size;

    renderer.renderGrid(state);
    hud.update(state);

    // 6. Show battle results modal -> card selection -> advanceToBuild
    hud.showBattleResults(result, unitsLost, () => {
      if (state.phase === 'game_over') {
        battleInProgress = false;
        return;
      }

      // Show card selection
      hud.showCardSelection(state, async () => {
        advanceToBuild(state);
        renderer.renderGrid(state);
        hud.update(state);

        // 7. Show new wave preview, pan back to base
        if (state.currentWaveDef) {
          renderer.arena.showWavePreview(state.currentWaveDef);
        }
        await renderer.panToBase();
        battleInProgress = false;
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
