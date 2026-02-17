import type { GameState, GamePhase, Resources, Unit, Building, HexCoord, BattleState, BattleResult, EquipmentDef, EquipmentTier, EquipmentSlot, Card, CardRarity, CardType, UnitStats, TechEffect } from './types';
import { uid } from './utils';
import { gameEvents } from './events';
import { generateGrid, hasAdjacentDeposit, countAdjacentDeposits } from '@/hex/grid';
import { hex, hexKey } from '@/hex/coords';
import { BUILDING_DEFS } from '@/data/buildings';
import { UNIT_DEFS } from '@/data/units';
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
  const grid = generateGrid(6, seed);

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
    purchasedTech: new Set(),
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
  const def = UNIT_DEFS[defId];
  if (!def) throw new Error(`Unknown unit def: ${defId}`);
  return {
    id: uid('u'),
    defId,
    stats: { ...def.baseStats },
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

  // Apply building cost multiplier
  const adjustedCost: Partial<Resources> = {};
  for (const [res, amount] of Object.entries(def.cost)) {
    if (amount) adjustedCost[res as keyof Resources] = Math.floor(amount * state.buildingCostMultiplier);
  }

  if (!canAfford(state.resources, adjustedCost)) return null;
  spendResources(state, adjustedCost);

  const building: Building = {
    id: uid('b'),
    type: def.type,
    coord,
  };

  tile.buildingId = building.id;
  state.buildings.set(building.id, building);
  gameEvents.emit('building:placed', { buildingId: building.id });

  return building;
}

/** Bonus production per extra adjacent deposit (beyond the first) */
const ADJACENCY_BONUS_PER_DEPOSIT = 0.5;

/** Calculate the effective production rate for a resource building, including adjacency bonus */
export function getBuildingProductionRate(state: GameState, building: Building): number {
  const def = BUILDING_DEFS[building.type];
  if (!def.produces) return 0;

  const adjacentCount = countAdjacentDeposits(state.grid, building.coord, def.produces);
  const extraDeposits = Math.max(0, adjacentCount - 1);
  const adjacencyMultiplier = 1 + extraDeposits * ADJACENCY_BONUS_PER_DEPOSIT;

  return Math.floor(def.productionRate * adjacencyMultiplier * state.gatherRateMultiplier);
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
export function trainUnit(state: GameState, defId: string): Unit | null {
  const def = UNIT_DEFS[defId];
  if (!def) return null;

  const hasBuilding = [...state.buildings.values()].some((b) => b.type === def.trainedAt);
  if (!hasBuilding) return null;

  if (!canAfford(state.resources, def.trainingCost)) return null;
  spendResources(state, def.trainingCost);

  const unit = createUnitWithBonuses(defId, state);
  state.roster.set(unit.id, unit);
  state.battleRoster.push(unit.id);
  gameEvents.emit('unit:trained', { unitId: unit.id });
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
    const def = UNIT_DEFS[unit.defId];
    if (def?.role === 'ranged') {
      ranged.push(unit);
    } else {
      melee.push(unit);
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
    const baseDamage = result.survivingEnemies.reduce((sum, e) => sum + e.stats.attack, 0);
    damageBase(state, baseDamage);
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

  // Generate wave preview for the next wave
  state.currentWaveDef = generateWave(state.wave);

  // Reset tech shop every 5 waves
  if (state.wave % 5 === 1) {
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
}

export function moveUnitToReinforcements(state: GameState, unitId: string): void {
  if (!state.roster.has(unitId)) return;
  if (state.reinforcements.length >= state.reinforcementQueueSize) return;
  removeUnitFromAllZones(state, unitId);
  state.reinforcements.push(unitId);
}

export function moveUnitToBench(state: GameState, unitId: string): void {
  if (!state.roster.has(unitId)) return;
  removeUnitFromAllZones(state, unitId);
  state.bench.push(unitId);
}

// ── Equipment ──

export function getBlacksmithUpgradeCost(currentTier: EquipmentTier): Partial<Resources> | null {
  const idx = TIER_ORDER.indexOf(currentTier);
  if (idx >= TIER_ORDER.length - 1) return null;
  const mult = Math.pow(2, idx);
  return { iron: 20 * mult, stone: 10 * mult };
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

  const unitDef = UNIT_DEFS[unit.defId];
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
  return true;
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
  const available = TECH_UPGRADES.filter(t => !state.purchasedTech.has(t.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  state.techShop = shuffled.slice(0, 4);
}

export function purchaseTech(state: GameState, techId: string): boolean {
  const tech = TECH_UPGRADES.find(t => t.id === techId);
  if (!tech) return false;
  if (state.purchasedTech.has(techId)) return false;
  if (state.bp < tech.cost) return false;

  state.bp -= tech.cost;
  state.purchasedTech.add(techId);
  gameEvents.emit('tech:purchased', { techId });
  gameEvents.emit('bp:changed', { bp: state.bp });

  applyTechEffect(state, tech.effect);

  // Replace purchased tech in shop with new random one
  if (state.techShop) {
    const idx = state.techShop.findIndex(t => t.id === techId);
    if (idx >= 0) {
      const remaining = TECH_UPGRADES.filter(t =>
        !state.purchasedTech.has(t.id) &&
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
  }
}

// ── Card Generation ──

export function generateCardChoices(state: GameState): void {
  const numChoices = 3 + state.extraCardChoices;
  const wave = generateWave(state.wave);
  const cards: Card[] = [];

  for (let i = 0; i < numChoices; i++) {
    if (i === 0 && wave.isBoss) {
      cards.push(generateRelicCard(state));
      continue;
    }
    const minRarity = (i === 0 && wave.isElite) ? 'rare' as CardRarity : undefined;
    cards.push(generateRandomCard(state, state.wave, minRarity));
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
    common: { wood: 15, stone: 10, iron: 5 },
    rare: { wood: 30, stone: 20, iron: 10 },
    epic: { wood: 50, stone: 35, iron: 20 },
    legendary: { wood: 80, stone: 60, iron: 40 },
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
    common: ['militia', 'wolf'],
    rare: ['swordsman', 'archer'],
    epic: ['berserker', 'bear', 'spearman'],
    legendary: ['spearman', 'berserker'],
  };
  const pool = pools[rarity];
  const unitDefId = pool[Math.floor(Math.random() * pool.length)];
  const def = UNIT_DEFS[unitDefId];
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
      gameEvents.emit('unit:trained', { unitId: unit.id });
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
  if (def.modifiers.speed) parts.push(`${def.modifiers.speed > 0 ? '+' : ''}${def.modifiers.speed} SPD`);
  if (def.bonusLives) parts.push(`+${def.bonusLives} Life`);
  return parts.join(', ');
}
