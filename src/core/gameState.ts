import type { GameState, GamePhase, Resources, Unit, Building, HexCoord, BattleState, BattleResult, EquipmentDef, EquipmentTier, EquipmentSlot, Card, CardRarity, CardType, UnitStats, TechEffect } from './types';
import { uid } from './utils';
import { gameEvents } from './events';
import { generateGrid, hasAdjacentDeposit, countAdjacentDeposits } from '@/hex/grid';
import { hex, hexKey } from '@/hex/coords';
import { BUILDING_DEFS } from '@/data/buildings';
import { UNIT_DEFS, ALL_UNIT_DEFS, ENEMY_DEFS } from '@/data/units';
import { EQUIPMENT_DEFS } from '@/data/equipment';
import { TECH_UPGRADES } from '@/data/tech';
import { RELICS } from '@/data/relics';
import { generateWave, calculateBP } from '@/data/waves';
import { createBattleState } from '@/simulation/battle';
import { recordBattle } from '@/simulation/battleLog';
import type { BattleLog } from '@/simulation/battleLog';
import type { StarterKit } from './types';

const INITIAL_BASE_HP = 100;
export const INITIAL_BATTLE_WIDTH = 4;
export const TIER_ORDER: EquipmentTier[] = ['crude', 'bronze', 'iron', 'steel', 'mithril'];

/** Create the initial game state for a new run */
export function createGameState(seed: number, starterKit: StarterKit): GameState {
  const grid = generateGrid(4, seed);

  const state: GameState = {
    phase: 'build',
    wave: 1,
    resources: { ...starterKit.startingResources },
    bp: 0,
    baseHp: INITIAL_BASE_HP,
    maxBaseHp: INITIAL_BASE_HP,
    grid,
    buildings: new Map(),
    roster: new Map(),
    battleRoster: [],
    reinforcements: [],
    bench: [],
    trainedThisPhase: new Set(),
    purchasedTech: new Map(),
    activeRelics: [],
    battle: null,
    cardChoices: null,
    techShop: null,
    lossStreak: 0,
    equipmentInventory: [],
    blacksmithTier: 'crude',
    gatherRateMultiplier: 1,
    buildingCostMultiplier: 1,
    battleWidthBonus: 0,
    reinforcementQueueSize: 2,
    cardRarityBoost: 0,
    extraCardChoices: 0,
    techStatBonuses: {},
    techLivesBonus: 0,
    currentWaveDef: null,
  };

  // Create starting unit
  const unit = createUnit(starterKit.unitDefId);
  state.roster.set(unit.id, unit);
  state.battleRoster.push(unit.id);

  // Place starter building at center tile (free — part of the kit)
  const centerCoord = hex(0, 0);
  const centerTile = state.grid.tiles.get(hexKey(centerCoord));
  if (centerTile) {
    const building: Building = {
      id: uid('b'),
      type: starterKit.buildingType,
      coord: centerCoord,
      level: 1,
    };
    centerTile.buildingId = building.id;
    state.buildings.set(building.id, building);
  }

  // Generate initial tech shop
  generateTechShop(state);

  // Generate wave preview for first wave
  state.currentWaveDef = generateWave(1);

  return state;
}

/** Create a unit instance from a definition ID */
export function createUnit(defId: string): Unit {
  const def = ALL_UNIT_DEFS[defId];
  if (!def) throw new Error(`Unknown unit def: ${defId}`);
  return {
    id: uid('u'),
    defId,
    stats: { ...def.baseStats },
    cooldownTimer: 0,
    lives: def.baseLives,
    maxLives: def.baseLives,
    equipment: {},
  };
}

/** Create a unit with tech bonuses applied */
function createUnitWithBonuses(defId: string, state: GameState): Unit {
  const unit = createUnit(defId);

  // Apply cumulative tech stat bonuses
  for (const [stat, value] of Object.entries(state.techStatBonuses)) {
    if (value && stat in unit.stats) {
      (unit.stats as unknown as Record<string, number>)[stat] += value;
      if (stat === 'maxHp') unit.stats.hp += value;
    }
  }

  // Apply tech lives bonus
  if (state.techLivesBonus > 0) {
    unit.lives += state.techLivesBonus;
    unit.maxLives += state.techLivesBonus;
  }

  // Apply relic bonuses
  for (const relicId of state.activeRelics) {
    const relic = RELICS.find(r => r.id === relicId);
    if (!relic) continue;
    if (relic.effect.type === 'unit_lives_bonus') {
      unit.lives += relic.effect.value;
      unit.maxLives += relic.effect.value;
    }
    if (relic.effect.type === 'new_unit_armor') {
      const armorDef = EQUIPMENT_DEFS[relic.effect.equipmentId];
      if (armorDef && !unit.equipment.armor) {
        unit.equipment.armor = { ...armorDef };
        applyEquipmentStats(unit, armorDef);
      }
    }
  }

  return unit;
}

/** Try to place a building on the grid. Returns the building or null if invalid. */
export function placeBuilding(
  state: GameState,
  buildingType: string,
  coord: HexCoord,
): Building | null {
  const def = BUILDING_DEFS[buildingType];
  if (!def) return null;

  const key = hexKey(coord);
  const tile = state.grid.tiles.get(key);
  if (!tile || tile.buildingId) return null;

  // Check adjacency requirement
  if (def.requiredDeposit && !hasAdjacentDeposit(state.grid, coord, def.requiredDeposit)) {
    return null;
  }

  // First resource building of each type is free
  const FREE_FIRST: readonly string[] = ['lumber_mill', 'quarry', 'iron_mine'];
  const isFirstFree = FREE_FIRST.includes(buildingType) &&
    ![...state.buildings.values()].some(b => b.type === buildingType);

  if (!isFirstFree) {
    // Apply building cost multiplier
    const adjustedCost: Partial<Resources> = {};
    for (const [res, amount] of Object.entries(def.cost)) {
      if (amount) adjustedCost[res as keyof Resources] = Math.floor(amount * state.buildingCostMultiplier);
    }

    if (!canAfford(state.resources, adjustedCost)) return null;
    spendResources(state, adjustedCost);
  }

  const building: Building = {
    id: uid('b'),
    type: def.type,
    coord,
    level: 1,
  };

  tile.buildingId = building.id;
  state.buildings.set(building.id, building);
  gameEvents.emit('building:placed', { buildingId: building.id });

  return building;
}

/** Upgrade a building to the next level */
export function upgradeBuilding(state: GameState, buildingId: string): boolean {
  const building = state.buildings.get(buildingId);
  if (!building) return false;
  const def = BUILDING_DEFS[building.type];
  if (!def) return false;

  // Cost = base cost × 2^(level-1) — so level 1→2 costs 2x base, level 2→3 costs 4x base
  const costMultiplier = Math.pow(2, building.level - 1);
  const upgradeCost: Partial<Resources> = {};
  for (const [res, amount] of Object.entries(def.cost)) {
    if (amount) upgradeCost[res as keyof Resources] = Math.floor(amount * costMultiplier * state.buildingCostMultiplier);
  }

  if (!canAfford(state.resources, upgradeCost)) return false;
  spendResources(state, upgradeCost);
  building.level++;
  gameEvents.emit('building:placed', { buildingId }); // reuse event to trigger re-render
  return true;
}

/** Get the cost to upgrade a building */
export function getBuildingUpgradeCost(state: GameState, building: Building): Partial<Resources> {
  const def = BUILDING_DEFS[building.type];
  if (!def) return {};
  const costMultiplier = Math.pow(2, building.level - 1);
  const upgradeCost: Partial<Resources> = {};
  for (const [res, amount] of Object.entries(def.cost)) {
    if (amount) upgradeCost[res as keyof Resources] = Math.floor(amount * costMultiplier * state.buildingCostMultiplier);
  }
  return upgradeCost;
}

/** Expand the map by 1 ring of tiles */
export function expandMap(state: GameState): void {
  const newRadius = state.grid.radius + 1;
  const newGrid = generateGrid(newRadius, Date.now());

  // Keep existing tiles (with buildings), add new ring tiles from the fresh grid
  for (const [key, newTile] of newGrid.tiles) {
    if (!state.grid.tiles.has(key)) {
      state.grid.tiles.set(key, newTile);
    }
  }
  state.grid.radius = newRadius;
}

/** Calculate the effective production rate for a resource building, including adjacency bonus */
export function getBuildingProductionRate(state: GameState, building: Building): number {
  const def = BUILDING_DEFS[building.type];
  if (!def.produces) return 0;

  const adjacentCount = countAdjacentDeposits(state.grid, building.coord, def.produces);
  const extraDeposits = Math.max(0, adjacentCount - 1);
  const baseRate = def.productionRate + extraDeposits;

  return Math.floor(baseRate * building.level * state.gatherRateMultiplier);
}

/** Tick resource production from all resource buildings */
export function tickResources(state: GameState): void {
  for (const building of state.buildings.values()) {
    const def = BUILDING_DEFS[building.type];
    if (def.produces) {
      state.resources[def.produces] += getBuildingProductionRate(state, building);
    }
  }

  // Apply scavenger relic (post-battle resources are handled here since tick runs on build phase start)
  for (const relicId of state.activeRelics) {
    const relic = RELICS.find(r => r.id === relicId);
    if (relic?.effect.type === 'post_battle_resources') {
      for (const [res, amount] of Object.entries(relic.effect.resources)) {
        if (amount) state.resources[res as keyof Resources] += amount;
      }
    }
  }

  gameEvents.emit('resources:changed', { ...state.resources });
}

/** Change the game phase */
export function setPhase(state: GameState, phase: GamePhase): void {
  const from = state.phase;
  state.phase = phase;
  gameEvents.emit('phase:changed', { from, to: phase });
}

/** Apply base damage after a lost battle */
export function damageBase(state: GameState, damage: number): void {
  state.baseHp = Math.max(0, state.baseHp - damage);
  gameEvents.emit('base:damaged', { damage, remaining: state.baseHp });
  if (state.baseHp <= 0) {
    setPhase(state, 'game_over');
    gameEvents.emit('game:over', { wave: state.wave });
  }
}

/** Check if the player can afford a cost */
export function canAfford(current: Resources, cost: Partial<Resources>): boolean {
  for (const [res, amount] of Object.entries(cost)) {
    if ((current[res as keyof Resources] ?? 0) < (amount ?? 0)) return false;
  }
  return true;
}

/** Deduct resources */
export function spendResources(state: GameState, cost: Partial<Resources>): void {
  for (const [res, amount] of Object.entries(cost)) {
    if (amount) state.resources[res as keyof Resources] -= amount;
  }
  gameEvents.emit('resources:changed', { ...state.resources });
}

/** Train a unit from a definition ID. Returns the unit or null if invalid. */
export function trainUnit(state: GameState, defId: string, buildingId?: string): Unit | null {
  const def = ALL_UNIT_DEFS[defId];
  if (!def) return null;

  // Peasant (trainedAt: null) can be trained without a building
  if (def.trainedAt !== null) {
    // Find the specific building instance
    let targetBuilding: Building | undefined;
    if (buildingId) {
      targetBuilding = state.buildings.get(buildingId);
      if (!targetBuilding || targetBuilding.type !== def.trainedAt) return null;
    } else {
      targetBuilding = [...state.buildings.values()].find((b) => b.type === def.trainedAt && !state.trainedThisPhase.has(b.id));
    }
    if (!targetBuilding) return null;

    // 1-per-building training limit
    if (state.trainedThisPhase.has(targetBuilding.id)) return null;

    if (!canAfford(state.resources, def.trainingCost)) return null;
    spendResources(state, def.trainingCost);

    state.trainedThisPhase.add(targetBuilding.id);
  } else {
    if (!canAfford(state.resources, def.trainingCost)) return null;
    spendResources(state, def.trainingCost);
  }

  const unit = createUnitWithBonuses(defId, state);
  state.roster.set(unit.id, unit);
  state.battleRoster.push(unit.id);
  autoEquip(state, unit);
  gameEvents.emit('unit:trained', { unitId: unit.id });
  gameEvents.emit('roster:changed', {});
  return unit;
}

/** Prepare battle: resets HP, creates BattleState, records battle log. Does NOT mutate roster. */
export function prepareBattle(state: GameState): { battleState: BattleState; log: BattleLog; result: BattleResult } {
  // Reset all roster units' HP to max before battle
  for (const unit of state.roster.values()) {
    unit.stats.hp = unit.stats.maxHp;
  }

  const effectiveBattleWidth = INITIAL_BATTLE_WIDTH + state.battleWidthBonus;

  // Split battleRoster into melee vs ranged
  const melee: Unit[] = [];
  const ranged: Unit[] = [];
  for (const id of state.battleRoster) {
    const unit = state.roster.get(id);
    if (!unit) continue;
    const def = ALL_UNIT_DEFS[unit.defId];
    if (def?.role === 'ranged') {
      ranged.push(unit);
    } else {
      melee.push(unit);
    }
  }

  // Cap ranged to battle width, excess go to bench
  if (ranged.length > effectiveBattleWidth) {
    const excess = ranged.splice(effectiveBattleWidth);
    for (const unit of excess) {
      // Move excess ranged units to bench
      state.battleRoster = state.battleRoster.filter(id => id !== unit.id);
      state.bench.push(unit.id);
    }
  }

  // Resolve reinforcement IDs to Unit objects
  const reinforcements: Unit[] = [];
  for (const id of state.reinforcements) {
    const unit = state.roster.get(id);
    if (unit) reinforcements.push(unit);
  }

  const wave = state.currentWaveDef ?? generateWave(state.wave);
  const battleState = createBattleState(melee, ranged, reinforcements, wave, effectiveBattleWidth);
  const { result, log } = recordBattle(battleState);

  gameEvents.emit('battle:started', { totalTicks: log.totalTicks });

  return { battleState, log, result };
}

/** Finalize battle: award BP, remove dead units, damage base, emit events. */
export function finalizeBattle(state: GameState, result: BattleResult, battleState: BattleState): void {
  // Calculate and award BP
  const bp = calculateBP(state.wave, result.winner === 'player');
  result.bpEarned = bp;
  state.bp += bp;

  // Remove permanently dead units (lives <= 0)
  const deadIds: string[] = [];
  for (const unit of state.roster.values()) {
    if (unit.lives <= 0) {
      // Return equipment to inventory before removing
      for (const slot of ['weapon', 'armor', 'shield'] as EquipmentSlot[]) {
        const equip = unit.equipment[slot];
        if (equip) state.equipmentInventory.push(equip);
      }
      deadIds.push(unit.id);
    }
  }
  for (const id of deadIds) {
    state.roster.delete(id);
  }
  // Purge dead IDs from all arrays
  state.battleRoster = state.battleRoster.filter((id) => state.roster.has(id));
  state.reinforcements = state.reinforcements.filter((id) => state.roster.has(id));
  state.bench = state.bench.filter((id) => state.roster.has(id));

  if (result.winner === 'enemy') {
    // Check if any surviving enemy is a boss → instant game over
    const hasBoss = result.survivingEnemies.some(e => ENEMY_DEFS[e.defId]?.isBoss);
    if (hasBoss) {
      state.baseHp = 0;
      gameEvents.emit('base:damaged', { damage: state.baseHp, remaining: 0 });
      setPhase(state, 'game_over');
      gameEvents.emit('game:over', { wave: state.wave });
    } else {
      const baseDamage = result.survivingEnemies.length * 5;
      damageBase(state, baseDamage);
    }
    state.lossStreak++;
  } else {
    state.lossStreak = 0;
  }

  state.battle = battleState;
  gameEvents.emit('battle:ended', result);
}

/** Advance from battle/results back to the build phase */
export function advanceToBuild(state: GameState): void {
  state.wave++;
  state.battle = null;
  state.cardChoices = null;
  state.trainedThisPhase.clear();

  // Generate wave preview for the next wave
  state.currentWaveDef = generateWave(state.wave);

  // Reset tech shop every 5 waves
  if (state.wave % 5 === 0) {
    generateTechShop(state);
  }

  setPhase(state, 'build');
}

// ── Roster Management ──

function removeUnitFromAllZones(state: GameState, unitId: string): void {
  state.battleRoster = state.battleRoster.filter(id => id !== unitId);
  state.reinforcements = state.reinforcements.filter(id => id !== unitId);
  state.bench = state.bench.filter(id => id !== unitId);
}

export function moveUnitToActive(state: GameState, unitId: string): void {
  if (!state.roster.has(unitId)) return;
  removeUnitFromAllZones(state, unitId);
  state.battleRoster.push(unitId);
  gameEvents.emit('roster:changed', {});
}

export function moveUnitToReinforcements(state: GameState, unitId: string): void {
  if (!state.roster.has(unitId)) return;
  if (state.reinforcements.length >= state.reinforcementQueueSize) return;
  removeUnitFromAllZones(state, unitId);
  state.reinforcements.push(unitId);
  gameEvents.emit('roster:changed', {});
}

/** Get the bench capacity: 2 base + 2 per military building */
export function getBenchCapacity(state: GameState): number {
  const militaryTypes = new Set(['barracks', 'archery_range', 'kennel', 'guardhouse']);
  let count = 0;
  for (const b of state.buildings.values()) {
    if (militaryTypes.has(b.type)) count++;
  }
  return 2 + 2 * count;
}

export function moveUnitToBench(state: GameState, unitId: string): void {
  if (!state.roster.has(unitId)) return;
  // Check bench capacity (don't count the unit if it's already on bench)
  const currentBenchCount = state.bench.filter(id => id !== unitId).length;
  if (currentBenchCount >= getBenchCapacity(state)) return;
  removeUnitFromAllZones(state, unitId);
  state.bench.push(unitId);
  gameEvents.emit('roster:changed', {});
}

/** Sell a unit: refund 50% of training cost scaled by remaining lives, return equipment */
export function sellUnit(state: GameState, unitId: string): boolean {
  const unit = state.roster.get(unitId);
  if (!unit) return false;
  const def = ALL_UNIT_DEFS[unit.defId];
  if (!def) return false;

  // Return equipment to inventory
  for (const slot of ['weapon', 'armor', 'shield'] as EquipmentSlot[]) {
    const equip = unit.equipment[slot];
    if (equip) {
      removeEquipmentStats(unit, equip);
      state.equipmentInventory.push(equip);
    }
  }

  // Refund 50% of training cost × (lives/maxLives)
  const livesRatio = unit.maxLives > 0 ? unit.lives / unit.maxLives : 0;
  for (const [res, amount] of Object.entries(def.trainingCost)) {
    if (amount) {
      state.resources[res as keyof Resources] += Math.floor(amount * 0.5 * livesRatio);
    }
  }

  // Remove from roster and all zones
  removeUnitFromAllZones(state, unitId);
  state.roster.delete(unitId);
  gameEvents.emit('resources:changed', { ...state.resources });
  gameEvents.emit('roster:changed', {});
  return true;
}

// ── Equipment ──

export function getBlacksmithUpgradeCost(currentTier: EquipmentTier): Partial<Resources> | null {
  const idx = TIER_ORDER.indexOf(currentTier);
  if (idx >= TIER_ORDER.length - 1) return null;
  const mult = Math.pow(2, idx);
  return { iron: 5 * mult, stone: 3 * mult };
}

export function upgradeBlacksmith(state: GameState): boolean {
  const cost = getBlacksmithUpgradeCost(state.blacksmithTier);
  if (!cost || !canAfford(state.resources, cost)) return false;
  spendResources(state, cost);
  const idx = TIER_ORDER.indexOf(state.blacksmithTier);
  state.blacksmithTier = TIER_ORDER[idx + 1];
  return true;
}

export function getCraftableEquipment(state: GameState): EquipmentDef[] {
  const currentIdx = TIER_ORDER.indexOf(state.blacksmithTier);
  return Object.values(EQUIPMENT_DEFS).filter(def => {
    return TIER_ORDER.indexOf(def.tier) <= currentIdx;
  });
}

export function craftEquipment(state: GameState, equipmentId: string): boolean {
  const def = EQUIPMENT_DEFS[equipmentId];
  if (!def) return false;

  const tierIdx = TIER_ORDER.indexOf(def.tier);
  const currentIdx = TIER_ORDER.indexOf(state.blacksmithTier);
  if (tierIdx > currentIdx) return false;

  const hasBlacksmith = [...state.buildings.values()].some(b => b.type === 'blacksmith');
  if (!hasBlacksmith) return false;

  if (!canAfford(state.resources, def.craftCost)) return false;
  spendResources(state, def.craftCost);

  state.equipmentInventory.push({ ...def });
  return true;
}

export function equipItem(state: GameState, unitId: string, inventoryIndex: number): boolean {
  const unit = state.roster.get(unitId);
  if (!unit) return false;

  const def = state.equipmentInventory[inventoryIndex];
  if (!def) return false;

  const unitDef = ALL_UNIT_DEFS[unit.defId];
  if (!unitDef) return false;

  if (def.slot === 'weapon' && !unitDef.canEquipWeapons) return false;
  if ((def.slot === 'armor') && !unitDef.canEquipArmor) return false;
  if (def.slot === 'shield' && !unitDef.canEquipWeapons) return false;

  // Unequip existing item in that slot
  const existing = unit.equipment[def.slot];
  if (existing) {
    removeEquipmentStats(unit, existing);
    state.equipmentInventory.push(existing);
  }

  // Remove from inventory and equip
  state.equipmentInventory.splice(inventoryIndex, 1);
  unit.equipment[def.slot] = { ...def };
  applyEquipmentStats(unit, def);

  gameEvents.emit('roster:changed', {});
  return true;
}

export function unequipItem(state: GameState, unitId: string, slot: EquipmentSlot): boolean {
  const unit = state.roster.get(unitId);
  if (!unit) return false;

  const existing = unit.equipment[slot];
  if (!existing) return false;

  removeEquipmentStats(unit, existing);
  state.equipmentInventory.push(existing);
  delete unit.equipment[slot];
  gameEvents.emit('roster:changed', {});
  return true;
}

/** Auto-equip the best available equipment from inventory onto a unit */
export function autoEquip(state: GameState, unit: Unit): void {
  const unitDef = ALL_UNIT_DEFS[unit.defId];
  if (!unitDef) return;

  const slots: EquipmentSlot[] = ['weapon', 'armor', 'shield'];
  for (const slot of slots) {
    if (unit.equipment[slot]) continue; // already has something
    if (slot === 'weapon' && !unitDef.canEquipWeapons) continue;
    if (slot === 'armor' && !unitDef.canEquipArmor) continue;
    if (slot === 'shield' && !unitDef.canEquipWeapons) continue;

    // Find best available item for this slot (highest tier index)
    let bestIdx = -1;
    let bestTierIdx = -1;
    for (let i = 0; i < state.equipmentInventory.length; i++) {
      const eq = state.equipmentInventory[i];
      if (eq.slot !== slot) continue;
      const tierIdx = TIER_ORDER.indexOf(eq.tier);
      if (tierIdx > bestTierIdx) {
        bestTierIdx = tierIdx;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      equipItem(state, unit.id, bestIdx);
    }
  }
}

function applyEquipmentStats(unit: Unit, def: EquipmentDef): void {
  for (const [stat, value] of Object.entries(def.modifiers)) {
    if (value !== undefined && stat in unit.stats) {
      (unit.stats as unknown as Record<string, number>)[stat] += value;
    }
  }
  if (def.bonusLives) {
    unit.lives += def.bonusLives;
    unit.maxLives += def.bonusLives;
  }
}

function removeEquipmentStats(unit: Unit, def: EquipmentDef): void {
  for (const [stat, value] of Object.entries(def.modifiers)) {
    if (value !== undefined && stat in unit.stats) {
      (unit.stats as unknown as Record<string, number>)[stat] -= value;
    }
  }
  if (def.bonusLives) {
    unit.lives = Math.max(1, unit.lives - def.bonusLives);
    unit.maxLives = Math.max(1, unit.maxLives - def.bonusLives);
  }
}

// ── Tech Shop ──

export function generateTechShop(state: GameState): void {
  const available = TECH_UPGRADES.filter(t => (state.purchasedTech.get(t.id) ?? 0) < t.maxTier);
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  state.techShop = shuffled.slice(0, 4);
}

export function purchaseTech(state: GameState, techId: string): boolean {
  const tech = TECH_UPGRADES.find(t => t.id === techId);
  if (!tech) return false;
  const currentTier = state.purchasedTech.get(techId) ?? 0;
  if (currentTier >= tech.maxTier) return false;
  const cost = tech.baseCost * Math.pow(2, currentTier);
  if (state.bp < cost) return false;

  state.bp -= cost;
  state.purchasedTech.set(techId, currentTier + 1);
  gameEvents.emit('tech:purchased', { techId });
  gameEvents.emit('bp:changed', { bp: state.bp });

  applyTechEffect(state, tech.effect);

  // Replace in shop only if maxed out
  if (state.techShop && currentTier + 1 >= tech.maxTier) {
    const idx = state.techShop.findIndex(t => t.id === techId);
    if (idx >= 0) {
      const remaining = TECH_UPGRADES.filter(t =>
        (state.purchasedTech.get(t.id) ?? 0) < t.maxTier &&
        !state.techShop!.some(s => s.id === t.id)
      );
      if (remaining.length > 0) {
        state.techShop[idx] = remaining[Math.floor(Math.random() * remaining.length)];
      } else {
        state.techShop.splice(idx, 1);
      }
    }
  }

  return true;
}

function applyTechEffect(state: GameState, effect: TechEffect): void {
  switch (effect.type) {
    case 'stat_boost':
      // Apply to all existing units
      for (const unit of state.roster.values()) {
        (unit.stats as unknown as Record<string, number>)[effect.stat] += effect.value;
        if (effect.stat === 'maxHp') unit.stats.hp += effect.value;
      }
      // Track for future units
      state.techStatBonuses[effect.stat] = (state.techStatBonuses[effect.stat] ?? 0) + effect.value;
      break;
    case 'gather_rate':
      state.gatherRateMultiplier *= effect.multiplier;
      break;
    case 'building_cost':
      state.buildingCostMultiplier *= effect.multiplier;
      break;
    case 'battle_width':
      state.battleWidthBonus += effect.value;
      break;
    case 'reserve_size':
      state.reinforcementQueueSize += effect.value;
      break;
    case 'unit_lives':
      for (const unit of state.roster.values()) {
        unit.lives += effect.value;
        unit.maxLives += effect.value;
      }
      state.techLivesBonus += effect.value;
      break;
    case 'card_rarity_boost':
      state.cardRarityBoost += effect.value;
      break;
    case 'extra_card_choice':
      state.extraCardChoices += effect.value;
      break;
    case 'expand_map':
      expandMap(state);
      break;
  }
}

// ── Card Generation ──

export function generateCardChoices(state: GameState): void {
  const numChoices = 3 + state.extraCardChoices;
  const wave = generateWave(state.wave);
  const cards: Card[] = [];
  const usedKeys = new Set<string>();

  for (let i = 0; i < numChoices; i++) {
    if (i === 0 && wave.isBoss) {
      const card = generateRelicCard(state);
      usedKeys.add(card.name);
      cards.push(card);
      continue;
    }
    const minRarity = (i === 0 && wave.isElite) ? 'rare' as CardRarity : undefined;
    let card: Card;
    let attempts = 0;
    do {
      card = generateRandomCard(state, state.wave, minRarity);
      attempts++;
    } while (usedKeys.has(card.name) && attempts < 20);
    usedKeys.add(card.name);
    cards.push(card);
  }

  state.cardChoices = cards;
}

function generateRandomCard(state: GameState, wave: number, minRarity?: CardRarity): Card {
  const rarity = rollCardRarity(wave, state.cardRarityBoost, state.lossStreak, minRarity);
  const types: CardType[] = ['resources', 'unit', 'bp_bonus', 'equipment'];
  const type = types[Math.floor(Math.random() * types.length)];
  return createCardOfType(type, rarity);
}

function generateRelicCard(state: GameState): Card {
  const available = RELICS.filter(r => !state.activeRelics.includes(r.id));
  const relic = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : RELICS[Math.floor(Math.random() * RELICS.length)];

  return {
    id: uid('card'),
    name: relic.name,
    description: relic.description,
    rarity: relic.rarity,
    type: 'relic',
    effect: { type: 'grant_relic', relicId: relic.id },
  };
}

function rollCardRarity(wave: number, boost: number, lossStreak: number, min?: CardRarity): CardRarity {
  let common = 60, rare = 0, epic = 0, legendary = 0;

  if (wave >= 3) rare = 25;
  if (wave >= 7) epic = 10;
  if (wave >= 12) legendary = 3;

  rare += lossStreak * 5;
  epic += lossStreak * 2;
  rare += boost * 5;
  epic += boost * 3;
  legendary += boost;
  rare += Math.floor(wave / 3);
  epic += Math.floor(wave / 5);
  legendary += Math.floor(wave / 10);

  const rarities: CardRarity[] = ['common', 'rare', 'epic', 'legendary'];
  const weights = [common, rare, epic, legendary];

  if (min) {
    const minIdx = rarities.indexOf(min);
    for (let i = 0; i < minIdx; i++) weights[i] = 0;
  }

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < rarities.length; i++) {
    r -= weights[i];
    if (r <= 0) return rarities[i];
  }
  return 'common';
}

function createCardOfType(type: CardType, rarity: CardRarity): Card {
  switch (type) {
    case 'resources': return createResourceCard(rarity);
    case 'unit': return createUnitCard(rarity);
    case 'bp_bonus': return createBPCard(rarity);
    case 'equipment': return createEquipmentCard(rarity);
    default: return createResourceCard(rarity);
  }
}

function createResourceCard(rarity: CardRarity): Card {
  const amounts: Record<CardRarity, Partial<Resources>> = {
    common: { wood: 4, stone: 3, iron: 1 },
    rare: { wood: 8, stone: 5, iron: 3 },
    epic: { wood: 14, stone: 10, iron: 6 },
    legendary: { wood: 22, stone: 16, iron: 10 },
  };
  const res = amounts[rarity];
  return {
    id: uid('card'),
    name: `${capitalize(rarity)} Supply Crate`,
    description: formatResources(res),
    rarity,
    type: 'resources',
    effect: { type: 'grant_resources', resources: res },
  };
}

function createUnitCard(rarity: CardRarity): Card {
  const pools: Record<CardRarity, string[]> = {
    common: ['peasant', 'wolf'],
    rare: ['militia', 'archer'],
    epic: ['guard', 'swordsman', 'spearman'],
    legendary: ['berserker', 'bear'],
  };
  const pool = pools[rarity];
  const unitDefId = pool[Math.floor(Math.random() * pool.length)];
  const def = ALL_UNIT_DEFS[unitDefId];
  return {
    id: uid('card'),
    name: def.name,
    description: `A trained ${def.name} joins your army.`,
    rarity,
    type: 'unit',
    effect: { type: 'grant_unit', unitDefId },
  };
}

function createBPCard(rarity: CardRarity): Card {
  const amounts: Record<CardRarity, number> = { common: 3, rare: 6, epic: 10, legendary: 15 };
  const amount = amounts[rarity];
  return {
    id: uid('card'),
    name: `${capitalize(rarity)} Battle Insight`,
    description: `+${amount} Battle Points`,
    rarity,
    type: 'bp_bonus',
    effect: { type: 'grant_bp', amount },
  };
}

function createEquipmentCard(rarity: CardRarity): Card {
  const tierMap: Record<CardRarity, EquipmentTier[]> = {
    common: ['crude'],
    rare: ['crude', 'bronze'],
    epic: ['bronze', 'iron'],
    legendary: ['iron', 'steel', 'mithril'],
  };
  const tiers = tierMap[rarity];
  const available = Object.values(EQUIPMENT_DEFS).filter(e => tiers.includes(e.tier));
  const equip = available[Math.floor(Math.random() * available.length)];
  return {
    id: uid('card'),
    name: equip.name,
    description: `${equip.slot} - ${formatModifiers(equip)}`,
    rarity,
    type: 'equipment',
    effect: { type: 'grant_equipment', equipmentId: equip.id },
  };
}

/** Apply the selected card's effect */
export function selectCard(state: GameState, cardIndex: number): void {
  if (!state.cardChoices) return;
  const card = state.cardChoices[cardIndex];
  if (!card) return;

  switch (card.effect.type) {
    case 'grant_resources':
      for (const [res, amount] of Object.entries(card.effect.resources)) {
        if (amount) state.resources[res as keyof Resources] += amount;
      }
      gameEvents.emit('resources:changed', { ...state.resources });
      break;

    case 'grant_unit': {
      const unit = createUnitWithBonuses(card.effect.unitDefId, state);
      state.roster.set(unit.id, unit);
      state.battleRoster.push(unit.id);
      autoEquip(state, unit);
      gameEvents.emit('unit:trained', { unitId: unit.id });
      gameEvents.emit('roster:changed', {});
      break;
    }

    case 'grant_bp':
      state.bp += card.effect.amount;
      gameEvents.emit('bp:changed', { bp: state.bp });
      break;

    case 'grant_equipment': {
      const equipDef = EQUIPMENT_DEFS[card.effect.equipmentId];
      if (equipDef) state.equipmentInventory.push({ ...equipDef });
      break;
    }

    case 'grant_relic': {
      const relicId = card.effect.relicId;
      if (!state.activeRelics.includes(relicId)) {
        state.activeRelics.push(relicId);
        applyRelicEffect(state, relicId);
        gameEvents.emit('relic:gained', { relicId });
      }
      break;
    }
  }

  gameEvents.emit('card:selected', { cardId: card.id });
  state.cardChoices = null;
}

function applyRelicEffect(state: GameState, relicId: string): void {
  const relic = RELICS.find(r => r.id === relicId);
  if (!relic) return;

  switch (relic.effect.type) {
    case 'unit_lives_bonus':
      for (const unit of state.roster.values()) {
        unit.lives += relic.effect.value;
        unit.maxLives += relic.effect.value;
      }
      break;
    case 'gather_rate_bonus':
      state.gatherRateMultiplier *= relic.effect.multiplier;
      break;
    case 'battle_width_bonus':
      state.battleWidthBonus += relic.effect.value;
      break;
    // new_unit_armor and post_battle_resources are handled elsewhere
  }
}

// ── Helpers ──

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatResources(res: Partial<Resources>): string {
  const parts: string[] = [];
  if (res.wood) parts.push(`+${res.wood} Wood`);
  if (res.stone) parts.push(`+${res.stone} Stone`);
  if (res.iron) parts.push(`+${res.iron} Iron`);
  return parts.join(', ');
}

function formatModifiers(def: EquipmentDef): string {
  const parts: string[] = [];
  if (def.modifiers.attack) parts.push(`+${def.modifiers.attack} ATK`);
  if (def.modifiers.maxHp) parts.push(`+${def.modifiers.maxHp} HP`);
  if (def.modifiers.cooldown) parts.push(`${def.modifiers.cooldown > 0 ? '+' : ''}${def.modifiers.cooldown}s CD`);
  if (def.bonusLives) parts.push(`+${def.bonusLives} Life`);
  return parts.join(', ');
}
