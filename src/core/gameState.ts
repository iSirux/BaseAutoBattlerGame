import type { GameState, GamePhase, Resources, Unit, Building, HexCoord, BattleResult } from './types';
import { uid } from './utils';
import { gameEvents } from './events';
import { generateGrid, hasAdjacentDeposit } from '@/hex/grid';
import { hex, hexKey } from '@/hex/coords';
import { BUILDING_DEFS } from '@/data/buildings';
import { UNIT_DEFS } from '@/data/units';
import { generateWave, calculateBP } from '@/data/waves';
import { createBattleState, runBattle } from '@/simulation/battle';
import type { StarterKit } from './types';

const INITIAL_BASE_HP = 100;
export const INITIAL_BATTLE_WIDTH = 4;

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

  // Check cost
  if (!canAfford(state.resources, def.cost)) return null;

  // Deduct cost
  spendResources(state, def.cost);

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

/** Tick resource production from all resource buildings */
export function tickResources(state: GameState): void {
  for (const building of state.buildings.values()) {
    const def = BUILDING_DEFS[building.type];
    if (def.produces) {
      state.resources[def.produces] += def.productionRate;
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

  // Check player has the required building
  const hasBuilding = [...state.buildings.values()].some((b) => b.type === def.trainedAt);
  if (!hasBuilding) return null;

  if (!canAfford(state.resources, def.trainingCost)) return null;
  spendResources(state, def.trainingCost);

  const unit = createUnit(defId);
  state.roster.set(unit.id, unit);
  state.battleRoster.push(unit.id); // auto-deploy
  gameEvents.emit('unit:trained', { unitId: unit.id });
  return unit;
}

/** Run a battle for the current wave. Returns the BattleResult. */
export function startBattle(state: GameState): BattleResult {
  // Reset all roster units' HP to max before battle
  for (const unit of state.roster.values()) {
    unit.stats.hp = unit.stats.maxHp;
  }

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

  const wave = generateWave(state.wave);
  const battleState = createBattleState(melee, ranged, reinforcements, wave, INITIAL_BATTLE_WIDTH);
  const result = runBattle(battleState);

  // Calculate and award BP
  const bp = calculateBP(state.wave, result.winner === 'player');
  result.bpEarned = bp;
  state.bp += bp;

  // Remove permanently dead units (lives <= 0)
  const deadIds: string[] = [];
  for (const unit of state.roster.values()) {
    if (unit.lives <= 0) deadIds.push(unit.id);
  }
  for (const id of deadIds) {
    state.roster.delete(id);
  }
  // Purge dead IDs from all arrays
  state.battleRoster = state.battleRoster.filter((id) => state.roster.has(id));
  state.reinforcements = state.reinforcements.filter((id) => state.roster.has(id));
  state.bench = state.bench.filter((id) => state.roster.has(id));

  if (result.winner === 'enemy') {
    // Calculate base damage from surviving enemies' attack stats
    const baseDamage = result.survivingEnemies.reduce((sum, e) => sum + e.stats.attack, 0);
    damageBase(state, baseDamage);
    state.lossStreak++;
  } else {
    state.lossStreak = 0;
  }

  state.battle = battleState;
  gameEvents.emit('battle:ended', result);
  return result;
}

/** Advance from battle/results back to the build phase */
export function advanceToBuild(state: GameState): void {
  state.wave++;
  state.battle = null;
  setPhase(state, 'build');
}
