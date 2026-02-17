import type { GameState, InputState, HexTile, HexCoord, Resources, BattleResult } from '@/core/types';
import { gameEvents } from '@/core/events';
import { BUILDING_DEFS } from '@/data/buildings';
import type { BuildingDef } from '@/core/types';
import { hexKey, hexNeighbors } from '@/hex/coords';
import { generateGrid } from '@/hex/grid';
import { createUnit, placeBuilding, canAfford, trainUnit } from '@/core/gameState';
import { UNIT_DEFS } from '@/data/units';
import { SFX } from '@/audio/sfx';

const BUILDING_ICON_COLORS: Record<string, string> = {
  lumber_mill: '#c49a3c',
  quarry: '#b0b0b0',
  iron_mine: '#506878',
  barracks: '#8b2020',
  archery_range: '#6b8e23',
  blacksmith: '#4a4a4a',
  kennel: '#8b6c42',
};

export class HUD {
  private frameCount = 0;
  private currentFps = 0;
  private fpsLastTime = performance.now();
  private lastResources = { wood: 0, stone: 0, iron: 0 };

  /** Called after a building is placed so the renderer can update */
  onBuildingPlaced: (() => void) | null = null;

  /** Track the last selected hex key to avoid rebuilding the panel every frame */
  private lastSelectedKey: string | null = null;

  /** Reference to the input state for setting placingBuilding */
  private inputState: InputState | null = null;

  constructor() {
    this.bindDebugPanel();
  }

  // ── Build Bar ──

  /** Initialize the build bar. Call once after renderer is ready. */
  initBuildBar(inputState: InputState): void {
    this.inputState = inputState;
    const bar = document.getElementById('build-bar')!;

    for (const def of Object.values(BUILDING_DEFS)) {
      const item = document.createElement('div');
      item.className = 'build-bar-item';
      item.dataset.building = def.type;
      item.dataset.tip = this.buildingTooltip(def);

      const icon = document.createElement('div');
      icon.className = 'build-bar-icon';
      icon.style.background = BUILDING_ICON_COLORS[def.type] ?? '#888';

      const label = document.createElement('div');
      label.className = 'build-bar-label';
      label.textContent = this.shortName(def.name);

      const cost = document.createElement('div');
      cost.className = 'build-bar-cost';
      cost.textContent = this.formatCost(def.cost);

      item.appendChild(icon);
      item.appendChild(label);
      item.appendChild(cost);

      item.addEventListener('click', () => {
        if (item.classList.contains('disabled')) return;
        if (inputState.placingBuilding === def.type) {
          // Toggle off
          inputState.placingBuilding = null;
        } else {
          inputState.placingBuilding = def.type;
        }
      });

      bar.appendChild(item);
    }
  }

  /** Update build bar active/disabled state each frame */
  updateBuildBar(state: GameState): void {
    const bar = document.getElementById('build-bar');
    if (!bar) return;

    const placing = this.inputState?.placingBuilding ?? null;

    for (const item of bar.querySelectorAll('.build-bar-item')) {
      const el = item as HTMLElement;
      const type = el.dataset.building!;
      const def = BUILDING_DEFS[type];
      if (!def) continue;

      const affordable = canAfford(state.resources, def.cost);
      el.classList.toggle('disabled', !affordable);
      el.classList.toggle('active', placing === type);
    }
  }

  private buildingTooltip(def: BuildingDef): string {
    if (def.produces) {
      return `${def.name} - Produces ${def.produces} (+${def.productionRate}/phase). Must be adjacent to ${def.requiredDeposit} deposit.`;
    }
    switch (def.type) {
      case 'barracks': return 'Barracks - Trains melee units.';
      case 'archery_range': return 'Archery Range - Trains ranged units.';
      case 'blacksmith': return 'Blacksmith - Crafts equipment from iron.';
      case 'kennel': return 'Kennel - Trains animal units.';
      default: return def.name;
    }
  }

  private shortName(name: string): string {
    // Shorten long names for the bar
    const shorts: Record<string, string> = {
      'Lumber Mill': 'Lumber',
      'Archery Range': 'Archery',
      'Iron Mine': 'Mine',
    };
    return shorts[name] ?? name;
  }

  // ── Resource bar + phase ──

  update(state: GameState): void {
    this.setText('res-wood', String(state.resources.wood));
    this.setText('res-stone', String(state.resources.stone));
    this.setText('res-iron', String(state.resources.iron));
    this.setText('res-bp', String(state.bp));

    this.setDelta('res-delta-wood', state.resources.wood - this.lastResources.wood);
    this.setDelta('res-delta-stone', state.resources.stone - this.lastResources.stone);
    this.setDelta('res-delta-iron', state.resources.iron - this.lastResources.iron);
    this.lastResources = { ...state.resources };

    this.setText('phase-label', state.phase.replace('_', ' '));
    this.setText('wave-label', `Wave ${state.wave}`);

    const hpPct = (state.baseHp / state.maxBaseHp) * 100;
    const fill = document.getElementById('base-hp-fill');
    if (fill) fill.style.width = `${hpPct}%`;

    // Phase-aware visibility
    const isBuild = state.phase === 'build';
    const readyBtn = document.getElementById('ready-btn');
    const buildBar = document.getElementById('build-bar');
    if (readyBtn) readyBtn.classList.toggle('hidden', !isBuild);
    if (buildBar) buildBar.style.display = isBuild ? '' : 'none';

    // Roster count
    this.setText('roster-label', state.battleRoster.length > 0 ? `Army: ${state.battleRoster.length}` : '');

    this.updateBuildBar(state);
    this.updateFps();
    this.updateDebugValues(state);
  }

  // ── Hover tooltip ──

  updateHoverTooltip(input: InputState, state: GameState): void {
    const tooltip = document.getElementById('hex-hover')!;
    const hovered = input.hoveredHex;
    const selected = input.selectedHex;

    // Don't show hover tooltip if this hex is selected
    if (!hovered || (selected && hovered.q === selected.q && hovered.r === selected.r)) {
      tooltip.classList.remove('visible');
      return;
    }

    const tile = state.grid.tiles.get(hexKey(hovered));
    if (!tile) {
      tooltip.classList.remove('visible');
      return;
    }

    const text = this.tileSummary(tile, state);
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    tooltip.style.left = (input.lastMouseX + 16) + 'px';
    tooltip.style.top = (input.lastMouseY - 8) + 'px';
  }

  // ── Selection detail panel ──

  updateSelectionPanel(input: InputState, state: GameState): void {
    const panel = document.getElementById('hex-info')!;
    const content = document.getElementById('hex-info-content')!;
    const sel = input.selectedHex;

    if (!sel) {
      panel.classList.remove('visible');
      this.lastSelectedKey = null;
      return;
    }

    const key = hexKey(sel);
    const tile = state.grid.tiles.get(key);
    if (!tile) {
      panel.classList.remove('visible');
      this.lastSelectedKey = null;
      return;
    }

    panel.classList.add('visible');

    // Only rebuild panel HTML when selection changes (not every frame)
    if (key === this.lastSelectedKey) return;
    this.lastSelectedKey = key;

    this.rebuildSelectionContent(content, tile, sel, state);
  }

  /** Show the battle results overlay */
  showBattleResults(result: BattleResult, unitsLost: number, onContinue: () => void): void {
    const overlay = document.getElementById('battle-results')!;
    const title = document.getElementById('br-title')!;
    const body = document.getElementById('br-body')!;
    const btn = document.getElementById('br-continue')!;

    const won = result.winner === 'player';
    title.textContent = won ? 'Victory!' : 'Defeat!';
    title.style.color = won ? '#80e060' : '#e06060';

    let bodyText = '';
    if (!won) {
      const remaining = result.survivingEnemies.length;
      const baseDmg = result.survivingEnemies.reduce((s, e) => s + e.stats.attack, 0);
      bodyText += `Enemies remaining: ${remaining}\n`;
      bodyText += `Base damage: ${baseDmg}\n`;
    }
    bodyText += `BP earned: ${result.bpEarned}\n`;
    if (unitsLost > 0) {
      bodyText += `Units lost: ${unitsLost}`;
    }

    body.innerHTML = bodyText.split('\n').join('<br>');
    overlay.classList.add('visible');

    if (won) {
      SFX.victory();
    } else {
      SFX.defeat();
    }

    // Wire continue button (replace to remove old listeners)
    const newBtn = btn.cloneNode(true) as HTMLElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      overlay.classList.remove('visible');
      onContinue();
    });
  }

  /** Force panel to rebuild (e.g. after a building is placed) */
  private forceRefreshPanel(state: GameState, coord: HexCoord): void {
    const content = document.getElementById('hex-info-content');
    const tile = state.grid.tiles.get(hexKey(coord));
    if (!content || !tile) return;
    this.lastSelectedKey = null; // reset so next update rebuilds
    this.rebuildSelectionContent(content, tile, coord, state);
    this.lastSelectedKey = hexKey(coord);
  }

  private rebuildSelectionContent(
    content: HTMLElement,
    tile: HexTile,
    coord: HexCoord,
    state: GameState,
  ): void {
    let html = `<div class="info-header">${this.terrainLabel(tile.terrain)}</div>`;
    html += `<div class="info-row">Position: ${coord.q}, ${coord.r}</div>`;

    if (tile.deposit) {
      html += `<div class="info-row">Deposit: ${this.capitalize(tile.deposit)}</div>`;
    }

    if (tile.buildingId) {
      const building = state.buildings.get(tile.buildingId);
      if (building) {
        const def = BUILDING_DEFS[building.type];
        html += `<div class="info-section">`;
        html += `<div class="info-row"><b>${def.name}</b></div>`;
        if (def.produces) {
          html += `<div class="info-row">Produces: +${def.productionRate} ${def.produces}/phase</div>`;
        }
        html += `</div>`;

        // Show trainable units for military buildings
        const trainable = Object.values(UNIT_DEFS).filter((u) => u.trainedAt === building.type);
        if (trainable.length > 0) {
          html += `<div class="info-section">`;
          html += `<div class="info-row"><b>Train:</b></div>`;
          for (const uDef of trainable) {
            const affordable = canAfford(state.resources, uDef.trainingCost);
            const disabledClass = affordable ? '' : ' disabled';
            const costStr = this.formatCost(uDef.trainingCost);
            html += `<button class="train-btn${disabledClass}" data-unit="${uDef.id}">`;
            html += `<span class="build-name">${uDef.name}</span>`;
            html += `<span class="build-cost">${costStr}</span>`;
            html += `</button>`;
          }
          html += `</div>`;
        }
      }
    } else {
      // Show buildable options as clickable buttons
      const buildable = this.getBuildableHere(tile, state);
      if (buildable.length > 0) {
        html += `<div class="info-section">`;
        html += `<div class="info-row"><b>Build:</b></div>`;
        for (const entry of buildable) {
          const affordable = canAfford(state.resources, entry.cost);
          const disabledClass = affordable ? '' : ' disabled';
          const costStr = this.formatCost(entry.cost);
          html += `<button class="build-btn${disabledClass}" data-building="${entry.type}">`;
          html += `<span class="build-name">${entry.name}</span>`;
          html += `<span class="build-cost">${costStr}</span>`;
          html += `</button>`;
        }
        html += `</div>`;
      }
    }

    content.innerHTML = html;

    // Bind click handlers to build buttons
    content.querySelectorAll('.build-btn:not(.disabled)').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const buildingType = (btn as HTMLElement).dataset.building!;
        const result = placeBuilding(state, buildingType, coord);
        if (result) {
          SFX.build();
          this.onBuildingPlaced?.();
          this.forceRefreshPanel(state, coord);
        }
      });
    });

    // Bind click handlers to train buttons
    content.querySelectorAll('.train-btn:not(.disabled)').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const unitDefId = (btn as HTMLElement).dataset.unit!;
        const result = trainUnit(state, unitDefId);
        if (result) {
          SFX.train();
          this.forceRefreshPanel(state, coord);
        }
      });
    });
  }

  // ── Debug panel ──

  private bindDebugPanel(): void {
    const panel = document.getElementById('debug-panel');
    const tab = document.getElementById('debug-tab');
    const closeBtn = document.getElementById('debug-close');
    if (!panel || !tab) return;

    tab.addEventListener('click', () => panel.classList.add('debug-open'));
    closeBtn?.addEventListener('click', () => panel.classList.remove('debug-open'));
  }

  /** Wire up debug buttons that need game state access. Call once after state is created. */
  bindDebugActions(state: GameState, onRerender: () => void): void {
    document.getElementById('dbg-add-resources')?.addEventListener('click', () => {
      state.resources.wood += 50;
      state.resources.stone += 50;
      state.resources.iron += 50;
      gameEvents.emit('resources:changed', { ...state.resources });
    });

    document.getElementById('dbg-add-unit')?.addEventListener('click', () => {
      const unit = createUnit('swordsman');
      state.roster.set(unit.id, unit);
      state.bench.push(unit.id);
      gameEvents.emit('unit:trained', { unitId: unit.id });
    });

    document.getElementById('dbg-add-bp')?.addEventListener('click', () => {
      state.bp += 10;
      gameEvents.emit('bp:changed', { bp: state.bp });
    });

    document.getElementById('dbg-heal-base')?.addEventListener('click', () => {
      state.baseHp = state.maxBaseHp;
    });

    document.getElementById('dbg-dump-state')?.addEventListener('click', () => {
      console.log('Game State:', state);
      console.log('Buildings:', [...state.buildings.values()]);
      console.log('Roster:', [...state.roster.values()]);
    });

    document.getElementById('dbg-new-seed')?.addEventListener('click', () => {
      state.grid = generateGrid(6, Date.now());
      state.buildings.clear();
      for (const tile of state.grid.tiles.values()) {
        tile.buildingId = null;
      }
      onRerender();
    });
  }

  private updateDebugValues(state: GameState): void {
    const panel = document.getElementById('debug-panel');
    if (!panel?.classList.contains('debug-open')) return;

    this.setText('dbg-phase', state.phase);
    this.setText('dbg-wave', String(state.wave));
    this.setText('dbg-basehp', `${state.baseHp}/${state.maxBaseHp}`);
    this.setText('dbg-units', String(state.roster.size));
    this.setText('dbg-buildings', String(state.buildings.size));
    this.setText('dbg-fps', String(this.currentFps));
  }

  private updateFps(): void {
    this.frameCount++;
    const now = performance.now();
    if (now - this.fpsLastTime >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.fpsLastTime = now;
    }
  }

  // ── Helpers ──

  private tileSummary(tile: HexTile, state: GameState): string {
    let text = this.terrainLabel(tile.terrain);

    if (tile.deposit) {
      text += ` - ${this.capitalize(tile.deposit)} deposit`;
    }

    if (tile.buildingId) {
      const building = state.buildings.get(tile.buildingId);
      if (building) {
        const def = BUILDING_DEFS[building.type];
        text += ` [${def.name}]`;
      }
    }

    return text;
  }

  private terrainLabel(terrain: string): string {
    switch (terrain) {
      case 'grass': return 'Grassland';
      case 'forest': return 'Forest';
      case 'rock': return 'Rocky Ground';
      case 'mountain': return 'Mountain';
      default: return terrain;
    }
  }

  private getBuildableHere(
    tile: HexTile,
    state: GameState,
  ): { type: string; name: string; cost: Partial<Resources> }[] {
    const results: { type: string; name: string; cost: Partial<Resources> }[] = [];
    for (const def of Object.values(BUILDING_DEFS)) {
      if (def.requiredDeposit) {
        const hasDeposit = hexNeighbors(tile.coord).some((n) => {
          const nTile = state.grid.tiles.get(hexKey(n));
          return nTile?.deposit === def.requiredDeposit;
        });
        if (hasDeposit) results.push({ type: def.type, name: def.name, cost: def.cost });
      } else {
        results.push({ type: def.type, name: def.name, cost: def.cost });
      }
    }
    return results;
  }

  private formatCost(cost: Partial<Resources>): string {
    const parts: string[] = [];
    if (cost.wood) parts.push(`${cost.wood}W`);
    if (cost.stone) parts.push(`${cost.stone}S`);
    if (cost.iron) parts.push(`${cost.iron}I`);
    return parts.join(' ');
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  private setText(id: string, text: string): void {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  private setDelta(id: string, value: number): void {
    const el = document.getElementById(id);
    if (!el) return;
    if (value === 0) {
      el.textContent = '';
      return;
    }
    const abs = Math.abs(value);
    el.textContent = value > 0 ? `+${abs}` : `-${abs}`;
    el.className = 'res-delta ' + (value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero');
  }
}
