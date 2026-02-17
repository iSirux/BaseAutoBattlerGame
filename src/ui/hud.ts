import type { GameState, InputState, HexTile, HexCoord, Resources, BattleResult, EquipmentSlot, Card } from '@/core/types';
import { gameEvents } from '@/core/events';
import { BUILDING_DEFS } from '@/data/buildings';
import type { BuildingDef } from '@/core/types';
import { hexKey, hexNeighbors } from '@/hex/coords';
import { generateGrid } from '@/hex/grid';
import {
  createUnit, placeBuilding, canAfford, trainUnit,
  moveUnitToActive, moveUnitToReinforcements, moveUnitToBench,
  craftEquipment, equipItem, unequipItem, getCraftableEquipment,
  upgradeBlacksmith, getBlacksmithUpgradeCost,
  purchaseTech, selectCard, generateCardChoices,
  TIER_ORDER, getBuildingProductionRate, getBenchCapacity,
  sellUnit, upgradeBuilding, getBuildingUpgradeCost,
} from '@/core/gameState';
import { countAdjacentDeposits } from '@/hex/grid';
import { ALL_UNIT_DEFS, ENEMY_DEFS } from '@/data/units';
import { RELICS } from '@/data/relics';
import { SFX } from '@/audio/sfx';

const BUILDING_ICON_COLORS: Record<string, string> = {
  lumber_mill: '#c49a3c',
  quarry: '#b0b0b0',
  iron_mine: '#506878',
  barracks: '#8b2020',
  archery_range: '#6b8e23',
  blacksmith: '#4a4a4a',
  kennel: '#8b6c42',
  guardhouse: '#4a6a8b',
};

export class HUD {
  private frameCount = 0;
  private currentFps = 0;
  private fpsLastTime = performance.now();
  private lastResources = { wood: 0, stone: 0, iron: 0 };
  private isMobile = window.matchMedia('(max-width: 768px)').matches
    || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

  onBuildingPlaced: (() => void) | null = null;
  private lastSelectedKey: string | null = null;
  private inputState: InputState | null = null;
  private selectedUnitId: string | null = null;
  private rosterVisible = false;

  /** Callbacks set by main.ts */
  onTechShopOpen: (() => void) | null = null;

  constructor() {
    this.bindDebugPanel();
  }

  // ── Build Bar ──

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
          inputState.placingBuilding = null;
        } else {
          inputState.placingBuilding = def.type;
        }
      });

      bar.appendChild(item);
    }
  }

  updateBuildBar(state: GameState): void {
    const bar = document.getElementById('build-bar');
    if (!bar) return;

    const placing = this.inputState?.placingBuilding ?? null;

    for (const item of bar.querySelectorAll('.build-bar-item')) {
      const el = item as HTMLElement;
      const type = el.dataset.building!;
      const def = BUILDING_DEFS[type];
      if (!def) continue;

      // Apply building cost multiplier for affordability check
      const adjustedCost: Partial<Resources> = {};
      for (const [res, amount] of Object.entries(def.cost)) {
        if (amount) adjustedCost[res as keyof Resources] = Math.floor(amount * state.buildingCostMultiplier);
      }
      const affordable = canAfford(state.resources, adjustedCost);
      el.classList.toggle('disabled', !affordable);
      el.classList.toggle('active', placing === type);
    }

    let cancelBtn = document.getElementById('build-bar-cancel');
    if (placing) {
      if (!cancelBtn) {
        cancelBtn = document.createElement('div');
        cancelBtn.id = 'build-bar-cancel';
        cancelBtn.className = 'build-bar-item';
        cancelBtn.style.cssText = 'background:rgba(200,60,60,0.25);border-color:rgba(200,60,60,0.5);';
        cancelBtn.innerHTML = '<div class="build-bar-icon" style="background:#c03030;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:bold;">\u2715</div><div class="build-bar-label" style="color:#e08080;">Cancel</div>';
        cancelBtn.addEventListener('click', () => {
          if (this.inputState) this.inputState.placingBuilding = null;
        });
        bar.appendChild(cancelBtn);
      }
    } else if (cancelBtn) {
      cancelBtn.remove();
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
      case 'guardhouse': return 'Guardhouse - Trains guard units.';
      default: return def.name;
    }
  }

  private shortName(name: string): string {
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

    // Show per-tick income
    const income = this.calcIncome(state);
    this.setText('res-income-wood', `(+${income.wood})`);
    this.setText('res-income-stone', `(+${income.stone})`);
    this.setText('res-income-iron', `(+${income.iron})`);

    this.setDelta('res-delta-wood', state.resources.wood - this.lastResources.wood);
    this.setDelta('res-delta-stone', state.resources.stone - this.lastResources.stone);
    this.setDelta('res-delta-iron', state.resources.iron - this.lastResources.iron);
    this.lastResources = { ...state.resources };

    this.setText('phase-label', state.phase.replace('_', ' '));
    this.setText('wave-label', `Wave ${state.wave}`);

    const hpPct = (state.baseHp / state.maxBaseHp) * 100;
    const fill = document.getElementById('base-hp-fill');
    if (fill) fill.style.width = `${hpPct}%`;

    const isBuild = state.phase === 'build';
    const readyBtn = document.getElementById('ready-btn');
    const buildBar = document.getElementById('build-bar');
    const techBtn = document.getElementById('tech-shop-btn');
    const rosterBtn = document.getElementById('roster-toggle');
    if (readyBtn) readyBtn.classList.toggle('hidden', !isBuild);
    if (buildBar) buildBar.style.display = isBuild ? '' : 'none';
    if (techBtn) (techBtn as HTMLElement).style.display = isBuild ? '' : 'none';
    if (rosterBtn) (rosterBtn as HTMLElement).style.display = isBuild ? '' : 'none';

    // Update roster label
    const totalUnits = state.roster.size;
    const activeCount = state.battleRoster.length;
    this.setText('roster-label', totalUnits > 0 ? `${activeCount}/${totalUnits}` : '');

    // Update relics bar
    this.updateRelicsBar(state);

    this.updateBuildBar(state);
    this.updateFps();
    this.updateDebugValues(state);
  }

  // ── Roster Panel ──

  initRosterPanel(state: GameState): void {
    const toggle = document.getElementById('roster-toggle');
    const panel = document.getElementById('roster-panel');
    const close = document.getElementById('roster-close');

    toggle?.addEventListener('click', () => {
      this.rosterVisible = !this.rosterVisible;
      panel?.classList.toggle('visible', this.rosterVisible);
      if (this.rosterVisible) this.rebuildRosterPanel(state);
    });
    close?.addEventListener('click', () => {
      this.rosterVisible = false;
      panel?.classList.remove('visible');
    });
  }

  updateRosterPanel(state: GameState): void {
    if (!this.rosterVisible) return;
    this.rebuildRosterPanel(state);
  }

  private rebuildRosterPanel(state: GameState): void {
    const content = document.getElementById('roster-content');
    if (!content) return;

    let html = '';

    // Active (battleRoster)
    html += `<div class="roster-section">`;
    html += `<div class="roster-section-title">Active (${state.battleRoster.length})</div>`;
    if (state.battleRoster.length === 0) {
      html += `<div class="roster-empty">No active units</div>`;
    }
    for (const id of state.battleRoster) {
      html += this.renderRosterUnit(id, state, 'active');
    }
    html += `</div>`;

    // Reinforcements
    html += `<div class="roster-section">`;
    html += `<div class="roster-section-title">Reinforcements (${state.reinforcements.length}/${state.reinforcementQueueSize})</div>`;
    if (state.reinforcements.length === 0) {
      html += `<div class="roster-empty">Empty</div>`;
    }
    for (const id of state.reinforcements) {
      html += this.renderRosterUnit(id, state, 'reinforcement');
    }
    html += `</div>`;

    // Bench
    const benchCap = getBenchCapacity(state);
    html += `<div class="roster-section">`;
    html += `<div class="roster-section-title">Bench (${state.bench.length}/${benchCap})</div>`;
    if (state.bench.length === 0) {
      html += `<div class="roster-empty">Empty</div>`;
    }
    for (const id of state.bench) {
      html += this.renderRosterUnit(id, state, 'bench');
    }
    html += `</div>`;

    // Equipment inventory
    if (state.equipmentInventory.length > 0) {
      html += `<div class="roster-section">`;
      html += `<div class="roster-section-title">Equipment (${state.equipmentInventory.length})</div>`;
      for (const eq of state.equipmentInventory) {
        html += `<div style="font-size:10px;color:rgba(240,230,211,0.6);padding:1px 0;">`;
        html += `${eq.name} <span style="color:#7ab0d4;">(${eq.slot})</span>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    content.innerHTML = html;

    // Bind zone buttons
    content.querySelectorAll('.zone-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const el = btn as HTMLElement;
        const unitId = el.dataset.unitId!;
        const zone = el.dataset.zone!;
        if (zone === 'active') moveUnitToActive(state, unitId);
        else if (zone === 'reinforcement') moveUnitToReinforcements(state, unitId);
        else if (zone === 'bench') moveUnitToBench(state, unitId);
        this.rebuildRosterPanel(state);
      });
    });

    // Bind sell buttons
    content.querySelectorAll('.sell-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const unitId = (btn as HTMLElement).dataset.unitId!;
        sellUnit(state, unitId);
        if (this.selectedUnitId === unitId) this.selectedUnitId = null;
        this.showUnitDetail(state);
        this.rebuildRosterPanel(state);
      });
    });

    // Bind unit click for detail
    content.querySelectorAll('.roster-unit').forEach(el => {
      el.addEventListener('click', () => {
        const unitId = (el as HTMLElement).dataset.unitId!;
        this.selectedUnitId = this.selectedUnitId === unitId ? null : unitId;
        this.showUnitDetail(state);
      });
    });
  }

  private renderRosterUnit(id: string, state: GameState, zone: string): string {
    const unit = state.roster.get(id);
    if (!unit) return '';
    const def = ALL_UNIT_DEFS[unit.defId];
    if (!def) return '';

    const equipNames: string[] = [];
    if (unit.equipment.weapon) equipNames.push(unit.equipment.weapon.name);
    if (unit.equipment.armor) equipNames.push(unit.equipment.armor.name);
    if (unit.equipment.shield) equipNames.push(unit.equipment.shield.name);

    const selected = this.selectedUnitId === id ? ' selected' : '';
    let hearts = '';
    for (let i = 0; i < unit.maxLives; i++) {
      hearts += i < unit.lives ? '\u2764' : '\u2661';
    }

    let html = `<div class="roster-unit${selected}" data-unit-id="${id}">`;
    html += `<div class="roster-unit-info">`;
    html += `<div class="roster-unit-name">${def.name} <span class="roster-unit-lives">${hearts}</span></div>`;
    html += `<div class="roster-unit-stats">HP:${unit.stats.maxHp} ATK:${unit.stats.attack} SPD:${unit.stats.speed}</div>`;
    if (equipNames.length > 0) {
      html += `<div style="font-size:9px;color:#7ab0d4;">${equipNames.join(', ')}</div>`;
    }
    html += `</div>`;
    html += `<div class="roster-zone-btns">`;
    if (zone !== 'active') html += `<button class="zone-btn" data-unit-id="${id}" data-zone="active" title="Move to Active">A</button>`;
    if (zone !== 'reinforcement') html += `<button class="zone-btn" data-unit-id="${id}" data-zone="reinforcement" title="Move to Reinforcements">R</button>`;
    if (zone !== 'bench') html += `<button class="zone-btn" data-unit-id="${id}" data-zone="bench" title="Move to Bench">B</button>`;
    html += `<button class="sell-btn zone-btn" data-unit-id="${id}" title="Sell Unit" style="color:#e06060;">$</button>`;
    html += `</div></div>`;
    return html;
  }

  private showUnitDetail(state: GameState): void {
    const detail = document.getElementById('unit-detail');
    if (!detail) return;

    if (!this.selectedUnitId) {
      detail.classList.remove('visible');
      return;
    }

    const unit = state.roster.get(this.selectedUnitId);
    if (!unit) {
      detail.classList.remove('visible');
      this.selectedUnitId = null;
      return;
    }

    const def = ALL_UNIT_DEFS[unit.defId];
    let html = `<div class="unit-detail-header">${def?.name ?? 'Unit'}</div>`;
    html += `<div class="unit-detail-stats">`;
    html += `HP: ${unit.stats.maxHp} | ATK: ${unit.stats.attack} | SPD: ${unit.stats.speed}<br>`;
    html += `Lives: ${unit.lives}/${unit.maxLives}<br>`;
    html += `Role: ${def?.role ?? '?'}`;
    html += `</div>`;

    // Equipment slots
    const slots: EquipmentSlot[] = ['weapon', 'armor', 'shield'];
    html += `<div style="margin-top:6px;">`;
    for (const slot of slots) {
      if (slot === 'weapon' && !def?.canEquipWeapons) continue;
      if (slot === 'armor' && !def?.canEquipArmor) continue;
      if (slot === 'shield' && !def?.canEquipWeapons) continue;

      const equipped = unit.equipment[slot];
      html += `<div class="unit-equip-slot">`;
      html += `<span>${this.capitalize(slot)}: ${equipped ? equipped.name : '<i style="opacity:0.4">empty</i>'}</span>`;
      if (equipped) {
        html += `<button class="equip-action-btn" data-action="unequip" data-slot="${slot}">Remove</button>`;
      } else {
        // Show equip options from inventory
        const available = state.equipmentInventory
          .map((eq, idx) => ({ eq, idx }))
          .filter(({ eq }) => eq.slot === slot);
        if (available.length > 0) {
          html += `<select class="equip-action-btn equip-select" data-slot="${slot}" style="max-width:80px;">`;
          html += `<option value="">Equip...</option>`;
          for (const { eq, idx } of available) {
            html += `<option value="${idx}">${eq.name}</option>`;
          }
          html += `</select>`;
        }
      }
      html += `</div>`;
    }
    html += `</div>`;

    detail.innerHTML = html;
    detail.classList.add('visible');

    // Bind unequip buttons
    detail.querySelectorAll('[data-action="unequip"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const slot = (btn as HTMLElement).dataset.slot as EquipmentSlot;
        unequipItem(state, this.selectedUnitId!, slot);
        this.showUnitDetail(state);
        this.rebuildRosterPanel(state);
      });
    });

    // Bind equip selects
    detail.querySelectorAll('.equip-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const select = e.target as HTMLSelectElement;
        const idx = parseInt(select.value);
        if (isNaN(idx)) return;
        equipItem(state, this.selectedUnitId!, idx);
        this.showUnitDetail(state);
        this.rebuildRosterPanel(state);
      });
    });
  }

  // ── Tech Shop ──

  showTechShop(state: GameState): void {
    const overlay = document.getElementById('tech-shop')!;
    overlay.classList.add('visible');
    this.rebuildTechShop(state);

    const closeBtn = document.getElementById('tech-shop-close')!;
    const newClose = closeBtn.cloneNode(true) as HTMLElement;
    closeBtn.parentNode!.replaceChild(newClose, closeBtn);
    newClose.addEventListener('click', () => {
      overlay.classList.remove('visible');
    });
  }

  private rebuildTechShop(state: GameState): void {
    const container = document.getElementById('tech-shop-items');
    if (!container) return;

    this.setText('ts-bp', String(state.bp));

    if (!state.techShop || state.techShop.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:rgba(240,230,211,0.4);padding:20px;">No upgrades available</div>';
      return;
    }

    let html = '';
    for (const tech of state.techShop) {
      const currentTier = state.purchasedTech.get(tech.id) ?? 0;
      const cost = tech.baseCost * Math.pow(2, currentTier);
      const affordable = state.bp >= cost;
      const maxed = currentTier >= tech.maxTier;
      const disabledClass = (!affordable || maxed) ? ' disabled' : '';
      const catClass = `tech-cat-${tech.category}`;
      const tierLabel = tech.maxTier > 1 ? ` (${currentTier}/${tech.maxTier})` : '';

      html += `<div class="tech-card${disabledClass}" data-tech-id="${tech.id}">`;
      html += `<div class="tech-card-info">`;
      html += `<div class="tech-card-name">${tech.name}${tierLabel}</div>`;
      html += `<div class="tech-card-desc">${tech.description}</div>`;
      html += `<span class="tech-card-category ${catClass}">${tech.category}</span>`;
      html += `</div>`;
      html += `<div class="tech-card-cost">${maxed ? 'MAX' : cost + ' BP'}</div>`;
      html += `</div>`;
    }

    container.innerHTML = html;

    // Bind purchase handlers
    container.querySelectorAll('.tech-card:not(.disabled)').forEach(card => {
      card.addEventListener('click', () => {
        const techId = (card as HTMLElement).dataset.techId!;
        const success = purchaseTech(state, techId);
        if (success) {
          SFX.click();
          this.rebuildTechShop(state);
        }
      });
    });
  }

  // ── Card Selection ──

  showCardSelection(state: GameState, onDone: () => void): void {
    generateCardChoices(state);
    const overlay = document.getElementById('card-selection')!;
    const container = document.getElementById('card-choices')!;
    overlay.classList.add('visible');

    SFX.cardReveal();

    if (!state.cardChoices) {
      overlay.classList.remove('visible');
      onDone();
      return;
    }

    let html = '';
    for (let i = 0; i < state.cardChoices.length; i++) {
      const card = state.cardChoices[i];
      html += `<div class="reward-card rarity-${card.rarity}" data-card-index="${i}">`;
      html += `<div class="reward-card-name">${card.name}</div>`;
      html += `<div class="reward-card-desc">${card.description}</div>`;
      html += `<div class="reward-card-type">${card.type.replace('_', ' ')}</div>`;
      html += `</div>`;
    }

    container.innerHTML = html;

    container.querySelectorAll('.reward-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt((card as HTMLElement).dataset.cardIndex!);
        selectCard(state, idx);
        SFX.collect();
        overlay.classList.remove('visible');
        onDone();
      });
    });
  }

  // ── Relics Bar ──

  private updateRelicsBar(state: GameState): void {
    const bar = document.getElementById('relics-bar');
    if (!bar) return;

    if (state.activeRelics.length === 0) {
      bar.innerHTML = '';
      return;
    }

    let html = '';
    for (const relicId of state.activeRelics) {
      const relic = RELICS.find(r => r.id === relicId);
      if (relic) {
        html += `<span class="relic-badge" title="${relic.description}">${relic.name}</span>`;
      }
    }
    bar.innerHTML = html;
  }

  // ── Hover tooltip ──

  updateHoverTooltip(input: InputState, state: GameState): void {
    const tooltip = document.getElementById('hex-hover')!;
    if (this.isMobile) {
      tooltip.classList.remove('visible');
      return;
    }
    const hovered = input.hoveredHex;
    const selected = input.selectedHex;

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

    let left = input.lastMouseX + 16;
    let top = input.lastMouseY - 8;
    const rect = tooltip.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) left = input.lastMouseX - rect.width - 8;
    if (top + rect.height > window.innerHeight) top = input.lastMouseY - rect.height - 8;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  // ── Selection detail panel ──

  updateSelectionPanel(input: InputState, state: GameState): void {
    const panel = document.getElementById('hex-info')!;
    const content = document.getElementById('hex-info-content')!;
    const sel = input.selectedHex;

    // If showing enemy/player detail, keep it until a valid hex tile is selected
    const showingEnemy = this.lastSelectedKey?.startsWith('enemy:') || this.lastSelectedKey?.startsWith('player:');

    if (!sel) {
      if (!showingEnemy) {
        panel.classList.remove('visible');
        this.lastSelectedKey = null;
      }
      return;
    }

    const key = hexKey(sel);
    const tile = state.grid.tiles.get(key);
    if (!tile) {
      if (!showingEnemy) {
        panel.classList.remove('visible');
        this.lastSelectedKey = null;
      }
      return;
    }

    panel.classList.add('visible');

    if (key === this.lastSelectedKey) return;
    this.lastSelectedKey = key;

    this.rebuildSelectionContent(content, tile, sel, state);
  }

  /** Show enemy info in the selection panel (same panel as buildings/units) */
  showEnemyDetail(defId: string): void {
    const panel = document.getElementById('hex-info')!;
    const content = document.getElementById('hex-info-content')!;
    const def = ENEMY_DEFS[defId];
    if (!def) return;

    const isBoss = !!ENEMY_DEFS[defId]?.isBoss;

    let html = '';
    if (this.isMobile) {
      html += `<button id="hex-info-close" style="
        position:absolute; top:8px; right:10px;
        background:none; border:none; color:#e0d8c0;
        font-size:22px; cursor:pointer; line-height:1; padding:2px 6px;
      ">&times;</button>`;
    }
    html += `<div class="info-header">${def.name}</div>`;
    if (isBoss) {
      html += `<div class="info-row" style="color:#ccaa44;font-size:11px;">Boss</div>`;
    }

    html += `<div class="info-section">`;
    html += `<div class="info-row"><b>Role:</b> ${this.capitalize(def.role)}</div>`;
    html += `<div class="info-row"><b>HP:</b> ${def.baseStats.maxHp}</div>`;
    html += `<div class="info-row"><b>ATK:</b> ${def.baseStats.attack}</div>`;
    html += `<div class="info-row"><b>SPD:</b> ${def.baseStats.speed}</div>`;
    html += `<div class="info-row"><b>Lives:</b> ${def.baseLives}</div>`;
    html += `</div>`;

    content.innerHTML = html;
    panel.classList.add('visible');
    this.lastSelectedKey = `enemy:${defId}`;

    // Mobile close button
    document.getElementById('hex-info-close')?.addEventListener('click', () => {
      panel.classList.remove('visible');
      this.lastSelectedKey = null;
    });
  }

  /** Show player unit info in the selection panel (from arena click) */
  showPlayerUnitDetail(unitId: string, state: GameState): void {
    const panel = document.getElementById('hex-info')!;
    const content = document.getElementById('hex-info-content')!;
    const unit = state.roster.get(unitId);
    if (!unit) return;
    const def = ALL_UNIT_DEFS[unit.defId];
    if (!def) return;

    let html = '';
    if (this.isMobile) {
      html += `<button id="hex-info-close" style="
        position:absolute; top:8px; right:10px;
        background:none; border:none; color:#e0d8c0;
        font-size:22px; cursor:pointer; line-height:1; padding:2px 6px;
      ">&times;</button>`;
    }
    html += `<div class="info-header">${def.name}</div>`;
    html += `<div class="info-section">`;
    html += `<div class="info-row"><b>Role:</b> ${this.capitalize(def.role)}</div>`;
    html += `<div class="info-row"><b>HP:</b> ${unit.stats.maxHp}</div>`;
    html += `<div class="info-row"><b>ATK:</b> ${unit.stats.attack}</div>`;
    html += `<div class="info-row"><b>SPD:</b> ${unit.stats.speed}</div>`;
    html += `<div class="info-row"><b>Lives:</b> ${unit.lives}/${unit.maxLives}</div>`;
    html += `</div>`;

    // Equipment
    const equipNames: string[] = [];
    if (unit.equipment.weapon) equipNames.push(unit.equipment.weapon.name);
    if (unit.equipment.armor) equipNames.push(unit.equipment.armor.name);
    if (unit.equipment.shield) equipNames.push(unit.equipment.shield.name);
    if (equipNames.length > 0) {
      html += `<div class="info-section">`;
      html += `<div class="info-row"><b>Equipment:</b></div>`;
      for (const name of equipNames) {
        html += `<div class="info-row" style="font-size:10px;color:#7ab0d4;">${name}</div>`;
      }
      html += `</div>`;
    }

    content.innerHTML = html;
    panel.classList.add('visible');
    this.lastSelectedKey = `player:${unitId}`;

    // Mobile close button
    document.getElementById('hex-info-close')?.addEventListener('click', () => {
      panel.classList.remove('visible');
      this.lastSelectedKey = null;
    });
  }

  /** Hide the selection panel */
  hideSelectionPanel(): void {
    document.getElementById('hex-info')?.classList.remove('visible');
    this.lastSelectedKey = null;
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

    const newBtn = btn.cloneNode(true) as HTMLElement;
    btn.parentNode!.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      overlay.classList.remove('visible');
      onContinue();
    });
  }

  /** Force panel to rebuild */
  private forceRefreshPanel(state: GameState, coord: HexCoord): void {
    const content = document.getElementById('hex-info-content');
    const tile = state.grid.tiles.get(hexKey(coord));
    if (!content || !tile) return;
    this.lastSelectedKey = null;
    this.rebuildSelectionContent(content, tile, coord, state);
    this.lastSelectedKey = hexKey(coord);
  }

  private rebuildSelectionContent(
    content: HTMLElement,
    tile: HexTile,
    coord: HexCoord,
    state: GameState,
  ): void {
    let html = '';
    if (this.isMobile) {
      html += `<button id="hex-info-close" style="
        position:absolute; top:8px; right:10px;
        background:none; border:none; color:#e0d8c0;
        font-size:22px; cursor:pointer; line-height:1; padding:2px 6px;
      ">&times;</button>`;
    }
    html += `<div class="info-header">${this.terrainLabel(tile.terrain)}</div>`;
    html += `<div class="info-row">Position: ${coord.q}, ${coord.r}</div>`;

    if (tile.deposit) {
      html += `<div class="info-row">Deposit: ${this.capitalize(tile.deposit)}</div>`;
    }

    if (tile.buildingId) {
      const building = state.buildings.get(tile.buildingId);
      if (building) {
        const def = BUILDING_DEFS[building.type];
        html += `<div class="info-section">`;
        html += `<div class="info-row"><b>${def.name}</b> <span style="font-size:10px;color:#c8a03c;">Lv.${building.level}</span></div>`;
        if (def.produces) {
          const rate = getBuildingProductionRate(state, building);
          const adjacentCount = countAdjacentDeposits(state.grid, building.coord, def.produces);
          html += `<div class="info-row">Produces: +${rate} ${def.produces}/phase</div>`;
          if (adjacentCount > 1) {
            const bonusFlat = adjacentCount - 1;
            html += `<div class="info-row" style="font-size:10px;color:#7ab0d4;">Adjacency: ${adjacentCount} deposits (+${bonusFlat})</div>`;
          }
        }

        // Upgrade button
        const upgCost = getBuildingUpgradeCost(state, building);
        const upgAffordable = canAfford(state.resources, upgCost);
        const upgDisabled = upgAffordable ? '' : ' disabled';
        html += `<button class="upgrade-bld-btn${upgDisabled}" data-building-id="${building.id}">`;
        html += `Upgrade to Lv.${building.level + 1} (${this.formatCost(upgCost)})`;
        html += `</button>`;

        html += `</div>`;

        // Blacksmith: show crafting UI
        if (building.type === 'blacksmith') {
          html += this.renderBlacksmithPanel(state);
        }

        // Show trainable units for military buildings + peasants (trainedAt: null)
        const trainable = Object.values(ALL_UNIT_DEFS).filter((u) => u.trainedAt === building.type || u.trainedAt === null);
        const alreadyTrained = state.trainedThisPhase.has(building.id);
        if (trainable.length > 0) {
          html += `<div class="info-section">`;
          html += `<div class="info-row"><b>Train:</b>`;
          if (alreadyTrained) html += ` <span style="font-size:10px;color:#e08080;">(trained this phase)</span>`;
          html += `</div>`;
          for (const uDef of trainable) {
            const affordable = canAfford(state.resources, uDef.trainingCost);
            const needsBuilding = uDef.trainedAt !== null;
            const blocked = needsBuilding && alreadyTrained;
            const disabledClass = (!affordable || blocked) ? ' disabled' : '';
            const costStr = this.formatCost(uDef.trainingCost);
            html += `<button class="train-btn${disabledClass}" data-unit="${uDef.id}" data-building-id="${building.id}">`;
            html += `<span class="build-name">${uDef.name}</span>`;
            html += `<span class="build-cost">${costStr}</span>`;
            html += `</button>`;
          }
          html += `</div>`;
        }
      }
    } else {
      const buildable = this.getBuildableHere(tile, state);
      if (buildable.length > 0) {
        html += `<div class="info-section">`;
        html += `<div class="info-row"><b>Build:</b></div>`;
        for (const entry of buildable) {
          const adjustedCost: Partial<Resources> = {};
          for (const [res, amount] of Object.entries(entry.cost)) {
            if (amount) adjustedCost[res as keyof Resources] = Math.floor(amount * state.buildingCostMultiplier);
          }
          const affordable = canAfford(state.resources, adjustedCost);
          const disabledClass = affordable ? '' : ' disabled';
          const costStr = this.formatCost(adjustedCost);
          html += `<button class="build-btn${disabledClass}" data-building="${entry.type}">`;
          html += `<span class="build-name">${entry.name}</span>`;
          html += `<span class="build-cost">${costStr}</span>`;
          html += `</button>`;
        }
        html += `</div>`;
      }
    }

    content.innerHTML = html;

    // Bind build buttons
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

    // Bind train buttons
    content.querySelectorAll('.train-btn:not(.disabled)').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const unitDefId = (btn as HTMLElement).dataset.unit!;
        const bldId = (btn as HTMLElement).dataset.buildingId;
        const result = trainUnit(state, unitDefId, bldId || undefined);
        if (result) {
          SFX.train();
          this.forceRefreshPanel(state, coord);
          if (this.rosterVisible) this.rebuildRosterPanel(state);
        }
      });
    });

    // Bind building upgrade buttons
    content.querySelector('.upgrade-bld-btn:not(.disabled)')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const bldId = (e.currentTarget as HTMLElement).dataset.buildingId!;
      const result = upgradeBuilding(state, bldId);
      if (result) {
        SFX.build();
        this.onBuildingPlaced?.();
        this.forceRefreshPanel(state, coord);
      }
    });

    // Bind craft buttons
    content.querySelectorAll('.craft-btn:not(.disabled)').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const eqId = (btn as HTMLElement).dataset.equipment!;
        const result = craftEquipment(state, eqId);
        if (result) {
          SFX.collect();
          this.forceRefreshPanel(state, coord);
          if (this.rosterVisible) this.rebuildRosterPanel(state);
        }
      });
    });

    // Bind blacksmith upgrade
    content.querySelector('.upgrade-bs-btn:not(.disabled)')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const result = upgradeBlacksmith(state);
      if (result) {
        SFX.build();
        this.forceRefreshPanel(state, coord);
      }
    });

    // Mobile close button
    document.getElementById('hex-info-close')?.addEventListener('click', () => {
      if (this.inputState) this.inputState.selectedHex = null;
      document.getElementById('hex-info')?.classList.remove('visible');
      this.lastSelectedKey = null;
    });
  }

  private renderBlacksmithPanel(state: GameState): string {
    let html = `<div class="info-section">`;
    html += `<div class="info-row"><b>Forge</b> <span style="font-size:10px;color:#c8a03c;">(Tier: ${this.capitalize(state.blacksmithTier)})</span></div>`;

    // Upgrade button
    const upgradeCost = getBlacksmithUpgradeCost(state.blacksmithTier);
    if (upgradeCost) {
      const nextIdx = TIER_ORDER.indexOf(state.blacksmithTier) + 1;
      const nextTier = TIER_ORDER[nextIdx];
      const affordable = canAfford(state.resources, upgradeCost);
      const disabledClass = affordable ? '' : ' disabled';
      html += `<button class="upgrade-bs-btn${disabledClass}">`;
      html += `Upgrade to ${this.capitalize(nextTier)} (${this.formatCost(upgradeCost)})`;
      html += `</button>`;
    }

    // Craftable equipment
    const craftable = getCraftableEquipment(state);
    for (const eq of craftable) {
      const affordable = canAfford(state.resources, eq.craftCost);
      const disabledClass = affordable ? '' : ' disabled';
      const costStr = this.formatCost(eq.craftCost);
      const modStr = this.formatModifiers(eq);
      html += `<button class="craft-btn${disabledClass}" data-equipment="${eq.id}">`;
      html += `<span class="build-name">${eq.name} <span style="font-size:9px;color:#7ab0d4;">${modStr}</span></span>`;
      html += `<span class="build-cost">${costStr}</span>`;
      html += `</button>`;
    }
    html += `</div>`;
    return html;
  }

  private formatModifiers(eq: { modifiers: Record<string, number | undefined>; bonusLives?: number }): string {
    const parts: string[] = [];
    if (eq.modifiers.attack) parts.push(`+${eq.modifiers.attack}ATK`);
    if (eq.modifiers.maxHp) parts.push(`+${eq.modifiers.maxHp}HP`);
    if (eq.modifiers.speed) parts.push(`${(eq.modifiers.speed ?? 0) > 0 ? '+' : ''}${eq.modifiers.speed}SPD`);
    if (eq.bonusLives) parts.push(`+${eq.bonusLives}Life`);
    return parts.join(' ');
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

  bindDebugActions(state: GameState, onRerender: () => void): void {
    document.getElementById('dbg-add-resources')?.addEventListener('click', () => {
      state.resources.wood += 50;
      state.resources.stone += 50;
      state.resources.iron += 50;
      gameEvents.emit('resources:changed', { ...state.resources });
    });

    document.getElementById('dbg-add-unit')?.addEventListener('click', () => {
      const unit = createUnit('militia');
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
      console.log('Equipment Inventory:', state.equipmentInventory);
      console.log('Tech Purchased:', [...state.purchasedTech.entries()]);
      console.log('Relics:', state.activeRelics);
    });

    document.getElementById('dbg-new-seed')?.addEventListener('click', () => {
      state.grid = generateGrid(4, Date.now());
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
    if (tile.deposit) text += ` - ${this.capitalize(tile.deposit)} deposit`;
    if (tile.buildingId) {
      const building = state.buildings.get(tile.buildingId);
      if (building) {
        const def = BUILDING_DEFS[building.type];
        text += ` [${def.name}`;
        if (def.produces) {
          const rate = getBuildingProductionRate(state, building);
          text += ` +${rate}/${def.produces}`;
          const adjacentCount = countAdjacentDeposits(state.grid, building.coord, def.produces);
          if (adjacentCount > 1) {
            text += ` (${adjacentCount} deposits)`;
          }
        }
        text += `]`;
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

  private calcIncome(state: GameState): Resources {
    const income: Resources = { wood: 0, stone: 0, iron: 0 };
    for (const building of state.buildings.values()) {
      const def = BUILDING_DEFS[building.type];
      if (def.produces) {
        income[def.produces] += getBuildingProductionRate(state, building);
      }
    }
    return income;
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
