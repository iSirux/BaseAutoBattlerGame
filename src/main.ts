import { createGameState, tickResources, placeBuilding, prepareBattle, finalizeBattle, advanceToBuild, setPhase } from '@/core/gameState';
import { gameEvents } from '@/core/events';
import { GameRenderer } from '@/render/renderer';
import { BattlePlayback } from '@/render/battlePlayback';
import { BattleControls } from '@/ui/battleControls';
import { HUD } from '@/ui/hud';
import { STARTER_KITS } from '@/data/starters';
import { SFX } from '@/audio/sfx';

function showStarterSelection(): Promise<typeof STARTER_KITS[number]> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('starter-select')!;
    const choices = document.getElementById('starter-choices')!;
    choices.innerHTML = '';

    for (const kit of STARTER_KITS) {
      const card = document.createElement('div');
      card.className = 'starter-card';

      const res = kit.startingResources;
      const resParts: string[] = [];
      if (res.wood) resParts.push(`${res.wood} Wood`);
      if (res.stone) resParts.push(`${res.stone} Stone`);
      if (res.iron) resParts.push(`${res.iron} Iron`);

      card.innerHTML = `
        <div class="starter-card-name">${kit.name}</div>
        <div class="starter-card-desc">${kit.description}</div>
        <div class="starter-card-details">
          <span>Resources: ${resParts.join(', ')}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        overlay.classList.remove('visible');
        resolve(kit);
      });

      choices.appendChild(card);
    }

    overlay.classList.add('visible');
  });
}

async function main() {
  const starterKit = await showStarterSelection();
  const seed = Date.now();
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

  // Player unit click → show unit detail
  renderer.arena.onPlayerUnitClick = (unitId) => {
    hud.showPlayerUnitDetail(unitId, state);
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
    renderer.arena.showWavePreview(state.currentWaveDef, state);
  }

  // Real-time refresh of wave preview when roster changes
  gameEvents.on('roster:changed', () => {
    if (state.phase === 'build' && state.currentWaveDef) {
      renderer.arena.showWavePreview(state.currentWaveDef, state);
    }
  });

  // Refresh preview when tech is purchased (may change battle width)
  gameEvents.on('tech:purchased', () => {
    if (state.phase === 'build' && state.currentWaveDef) {
      renderer.arena.showWavePreview(state.currentWaveDef, state);
    }
  });

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

    // 6. Show combined battle results + card selection -> advanceToBuild
    if ((state.phase as string) === 'game_over') {
      battleInProgress = false;
      return;
    }

    hud.showCardSelection(state, async () => {
      advanceToBuild(state);
      renderer.renderGrid(state);
      hud.update(state);

      // 7. Show new wave preview, pan back to base
      if (state.currentWaveDef) {
        renderer.arena.showWavePreview(state.currentWaveDef, state);
      }
      await renderer.panToBase();
      battleInProgress = false;
    }, result, unitsLost);
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
