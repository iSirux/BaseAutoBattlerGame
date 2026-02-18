import { createGameState, tickResources, placeBuilding, prepareBattle, finalizeBattle, advanceToBuild, setPhase, INITIAL_BATTLE_WIDTH, getDefaultDeployment, claimTile, moveUnitToActive, moveUnitToBench, moveUnitToReinforcements } from '@/core/gameState';
import type { HexCoord } from '@/core/types';
import { gameEvents } from '@/core/events';
import { GameRenderer } from '@/render/renderer';
import { BattleRunner } from '@/render/battlePlayback';
import { BattleControls } from '@/ui/battleControls';
import { HUD } from '@/ui/hud';
import { generateStarterKits } from '@/data/starters';
import { SFX } from '@/audio/sfx';

function showStarterSelection(): Promise<import('@/core/types').StarterKit> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('starter-select')!;
    const choices = document.getElementById('starter-choices')!;
    choices.innerHTML = '';

    const kits = generateStarterKits(3);
    for (const kit of kits) {
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
          <span>${resParts.join(', ')}</span>
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

  // Preview drag-and-drop: persist moved positions to savedDeployment
  renderer.arena.onPreviewUnitMoved = (movedUnits) => {
    for (const { unitId, newHex } of movedUnits) {
      if (state.battleRoster.includes(unitId)) {
        state.savedDeployment.set(unitId, newHex);
      }
    }
  };

  // Zone transfers via drag-and-drop (bench/reinforcement ↔ active)
  renderer.arena.onPreviewZoneChanged = (changes) => {
    for (const { unitId, toZone, hex: newHex } of changes) {
      if (toZone === 'active') {
        moveUnitToActive(state, unitId);
        // Save deployment position for the newly active unit
        if (newHex) {
          state.savedDeployment.set(unitId, newHex);
        }
      } else if (toZone === 'bench') {
        moveUnitToBench(state, unitId);
      } else if (toZone === 'reinforcement') {
        moveUnitToReinforcements(state, unitId);
      }
    }
    // Refresh the preview to reflect the new zone assignments
    if (state.currentWaveDef) {
      renderer.arena.showWavePreview(state.currentWaveDef, state);
    }
  };

  // Arena zone hover tooltip
  renderer.arena.onArenaHexHover = (label, screenX, screenY) => {
    const tooltip = document.getElementById('hex-hover')!;
    if (!label) {
      tooltip.classList.remove('visible');
      return;
    }
    tooltip.textContent = label;
    tooltip.classList.add('visible');
    let left = screenX + 16;
    let top = screenY - 8;
    const rect = tooltip.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) left = screenX - rect.width - 8;
    if (top + rect.height > window.innerHeight) top = screenY - rect.height - 8;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  };

  // Placement mode: click on hex to place the selected building
  renderer.onPlacementClick = (coord) => {
    const buildingType = renderer.inputState.placingBuilding;
    if (!buildingType) return;

    if (buildingType === '__claim__') {
      const success = claimTile(state, coord);
      if (success) {
        SFX.build();
        renderer.renderGrid(state);
      }
      return;
    }

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

  // Game over handler
  gameEvents.on('game:over', ({ wave }) => {
    hud.showGameOver(wave as number);
  });
  document.getElementById('game-over-restart')?.addEventListener('click', () => {
    location.reload();
  });

  // Track if battle is in progress to prevent double-clicks
  let battleInProgress = false;

  // Ready button: start the battle (async flow)
  document.getElementById('ready-btn')!.addEventListener('click', async () => {
    if (state.phase !== 'build' || battleInProgress) return;
    battleInProgress = true;
    SFX.click();

    const rosterSizeBefore = [...state.roster.values()].filter(u => u.isMercenary).length;

    // 1. Switch to battle phase (hides build UI)
    setPhase(state, 'battle');
    hud.update(state);
    hud.hideSelectionPanel();
    renderer.inputState.selectedHex = null;
    document.getElementById('roster-panel')?.classList.remove('visible');

    // 2. Build deployment from savedDeployment + default fallback
    const effectiveBattleWidth = INITIAL_BATTLE_WIDTH + state.battleWidthBonus;
    const defaultDeploy = getDefaultDeployment(state, effectiveBattleWidth);
    const placements = new Map<string, HexCoord>();
    for (const unitId of state.battleRoster) {
      const savedHex = state.savedDeployment.get(unitId);
      if (savedHex) {
        placements.set(unitId, savedHex);
      } else {
        const defaultHex = defaultDeploy.placements.get(unitId);
        if (defaultHex) placements.set(unitId, defaultHex);
      }
    }
    const deployment = { placements };

    // 3. Create battle state and capture initial snapshot (no simulation yet)
    const { battleState, snapshot } = prepareBattle(state, deployment);

    // 4. Pan to arena and run real-time battle
    await renderer.panToArena();
    const runner = new BattleRunner(battleState, snapshot, renderer.arena, renderer.app);
    battleControls.bind(runner);
    battleControls.show();

    await new Promise<void>(resolve => {
      runner.onBattleEnd = resolve;
      runner.start();
    });

    battleControls.hide();

    // 5. Finalize battle
    finalizeBattle(state, battleState.result!, battleState);
    const mercenariesAfter = [...state.roster.values()].filter(u => u.isMercenary).length;
    const unitsLost = rosterSizeBefore - mercenariesAfter;

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
    }, battleState.result!, unitsLost);
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
