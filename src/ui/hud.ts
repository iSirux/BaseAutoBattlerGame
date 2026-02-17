import type { GameState, InputState, HexTile } from '@/core/types';
import { gameEvents } from '@/core/events';
import { BUILDING_DEFS } from '@/data/buildings';
import { hexKey, hexNeighbors } from '@/hex/coords';
import { generateGrid } from '@/hex/grid';
import { createUnit } from '@/core/gameState';

export class HUD {
  private frameCount = 0;
  private currentFps = 0;
  private fpsLastTime = performance.now();
  private lastResources = { wood: 0, stone: 0, iron: 0 };

  constructor() {
    this.bindDebugPanel();
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
      return;
    }

    const tile = state.grid.tiles.get(hexKey(sel));
    if (!tile) {
      panel.classList.remove('visible');
      return;
    }

    panel.classList.add('visible');

    let html = `<div class="info-header">${this.terrainLabel(tile.terrain)}</div>`;
    html += `<div class="info-row">Position: ${tile.coord.q}, ${tile.coord.r}</div>`;

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
          html += `<div class="info-row">Produces: +${def.productionRate} ${def.produces}/tick</div>`;
        }
        if (def.requiredDeposit) {
          html += `<div class="info-row">Requires: ${this.capitalize(def.requiredDeposit)} deposit</div>`;
        }
        html += `</div>`;
      }
    } else {
      // Show what can be built here
      const buildable = this.getBuildableHere(tile, state);
      if (buildable.length > 0) {
        html += `<div class="info-section">`;
        html += `<div class="info-row"><b>Can build:</b></div>`;
        for (const b of buildable) {
          html += `<div class="info-row">- ${b}</div>`;
        }
        html += `</div>`;
      }
    }

    // Units on this tile (for future use)
    content.innerHTML = html;
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

  private getBuildableHere(tile: HexTile, state: GameState): string[] {
    const names: string[] = [];
    for (const def of Object.values(BUILDING_DEFS)) {
      if (def.requiredDeposit) {
        const hasDeposit = hexNeighbors(tile.coord).some((n) => {
          const nTile = state.grid.tiles.get(hexKey(n));
          return nTile?.deposit === def.requiredDeposit;
        });
        if (hasDeposit) names.push(def.name);
      } else {
        names.push(def.name);
      }
    }
    return names;
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
