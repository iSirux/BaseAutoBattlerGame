import type {
  GameState,
  GamePhase,
  Resources,
  Unit,
  Building,
  HexCoord,
  BattleState,
  BattleResult,
  EquipmentDef,
  EquipmentTier,
  EquipmentSlot,
  Card,
  CardRarity,
  CardType,
  UnitStats,
  TechEffect,
  BuildingType,
  UnitDeployment,
  TechNode,
} from "./types";
import { uid } from "./utils";
import { gameEvents } from "./events";
import {
  generateGrid,
  hasAdjacentDeposit,
  countAdjacentDeposits,
  getRingCost,
  getClaimableTiles,
  getValidBuildTiles,
} from "@/hex/grid";
import { hex, hexKey, hexNeighbors } from "@/hex/coords";
import { BUILDING_DEFS } from "@/data/buildings";
import { UNIT_DEFS, ALL_UNIT_DEFS, ENEMY_DEFS } from "@/data/units";
import { EQUIPMENT_DEFS } from "@/data/equipment";
import { TECH_UPGRADES, TECH_TREE } from "@/data/tech";
import { RELICS } from "@/data/relics";
import { generateWave, calculateBP } from "@/data/waves";
import {
  createHexBattleState,
  createEnemyUnits,
  ARENA_DEPTH,
  PLAYER_DEPLOY_ROWS,
} from "@/simulation/battle";
import { captureSnapshot } from "@/simulation/battleLog";
import type { ArenaSnapshot } from "@/simulation/battleLog";
import type { StarterKit } from "./types";

const INITIAL_BASE_HP = 100;
export const INITIAL_BATTLE_WIDTH = 8;
/** Width (columns) enemies deploy across — centered in player arena */
export const INITIAL_ENEMY_WIDTH = 4;
export const TIER_ORDER: EquipmentTier[] = [
  "crude",
  "bronze",
  "iron",
  "steel",
  "mithril",
];
export {
  ARENA_DEPTH,
  PLAYER_DEPLOY_ROWS,
  ENEMY_DEPLOY_ROWS,
} from "@/simulation/battle";

/** Create the initial game state for a new run */
export function createGameState(
  seed: number,
  starterKit: StarterKit,
): GameState {
  const grid = generateGrid(5, seed);

  // Collect claimed tiles from the grid (tiles within radius 1 are pre-claimed by generateGrid)
  const claimedTiles = new Set<string>();
  for (const [key, tile] of grid.tiles) {
    if (tile.claimed) claimedTiles.add(key);
  }

  const state: GameState = {
    phase: "build",
    wave: 1,
    resources: {
      wood: 10,
      stone: 10,
      iron: 0,
      planks: 0,
      cut_stone: 0,
      iron_bars: 0,
    },
    bp: 0,
    baseHp: INITIAL_BASE_HP,
    maxBaseHp: INITIAL_BASE_HP,
    grid,
    buildings: new Map(),
    claimedTiles,
    roster: new Map(),
    battleRoster: [],
    reinforcements: [],
    bench: [],
    purchasedTech: new Map(),
    activeRelics: [],
    battle: null,
    cardChoices: null,
    techShop: null,
    lossStreak: 0,
    equipmentInventory: [],
    blacksmithTier: "crude",
    gatherRateMultiplier: 1,
    buildingCostMultiplier: 1,
    battleWidthBonus: 0,
    deploymentSlots: 4,
    reinforcementQueueSize: 1,
    cardRarityBoost: 0,
    extraCardChoices: 0,
    techStatBonuses: {},
    techLivesBonus: 0,
    buildingUpgradeUnlocked: 1,
    currentWaveDef: null,
    savedDeployment: new Map(),
    freeTechPending: false,
    pendingStatBuff: null,
  };

  // Create starting mercenary unit
  const unit = createUnit(starterKit.unitDefId);
  unit.isMercenary = true;
  state.roster.set(unit.id, unit);
  state.battleRoster.push(unit.id);

  // Place camp building at center tile
  const centerCoord = hex(0, 0);
  const centerTile = state.grid.tiles.get(hexKey(centerCoord));
  if (centerTile) {
    const campBuilding: Building = {
      id: uid("b"),
      type: "camp",
      coord: centerCoord,
      level: 1,
    };
    centerTile.buildingId = campBuilding.id;
    state.buildings.set(campBuilding.id, campBuilding);
  }

  // Place starter kit building on a free adjacent tile
  const campNeighbors = hexNeighbors(centerCoord);
  for (const n of campNeighbors) {
    const nTile = state.grid.tiles.get(hexKey(n));
    if (nTile && !nTile.buildingId && !nTile.deposit) {
      const starterBuilding: Building = {
        id: uid("b"),
        type: starterKit.buildingType,
        coord: n,
        level: 1,
      };
      nTile.buildingId = starterBuilding.id;
      state.buildings.set(starterBuilding.id, starterBuilding);
      break;
    }
  }

  // Generate wave preview for first wave
  state.currentWaveDef = generateWave(1);

  // Auto-spawn units from all buildings
  autoSpawnUnits(state);

  return state;
}

/** Create a unit instance from a definition ID */
export function createUnit(defId: string): Unit {
  const def = ALL_UNIT_DEFS[defId];
  if (!def) throw new Error(`Unknown unit def: ${defId}`);
  return {
    id: uid("u"),
    defId,
    stats: { ...def.baseStats },
    cooldownTimer: 0,
    moveTimer: 0,
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
      if (stat === "maxHp") unit.stats.hp += value;
    }
  }

  // Apply tech lives bonus
  if (state.techLivesBonus > 0) {
    unit.lives += state.techLivesBonus;
    unit.maxLives += state.techLivesBonus;
  }

  // Apply relic bonuses
  for (const relicId of state.activeRelics) {
    const relic = RELICS.find((r) => r.id === relicId);
    if (!relic) continue;
    if (relic.effect.type === "unit_lives_bonus") {
      unit.lives += relic.effect.value;
      unit.maxLives += relic.effect.value;
    }
    if (relic.effect.type === "new_unit_armor") {
      const armorDef = EQUIPMENT_DEFS[relic.effect.equipmentId];
      if (armorDef && !unit.equipment.armor) {
        unit.equipment.armor = { ...armorDef };
        applyEquipmentStats(unit, armorDef);
      }
    }
  }

  return unit;
}

// ── Auto-Spawn System ──

/** Get the best unit a building can spawn at its current level */
export function getBestSpawnableUnit(
  buildingType: BuildingType,
  buildingLevel: number,
): import("./types").UnitDef | null {
  let best: import("./types").UnitDef | null = null;
  let bestLevel = -1;
  for (const def of Object.values(ALL_UNIT_DEFS)) {
    if (def.trainedAt !== buildingType) continue;
    const reqLevel = def.requiredBuildingLevel ?? 1;
    if (reqLevel <= buildingLevel && reqLevel > bestLevel) {
      best = def;
      bestLevel = reqLevel;
    }
  }
  return best;
}

/** Snapshot of an auto-spawned unit's assignments before clearing */
interface UnitSnapshot {
  defId: string;
  zone: "active" | "reinforcement" | "bench";
  hex?: HexCoord;
  equipment: Partial<Record<EquipmentSlot, EquipmentDef>>;
}

/** Remove all auto-spawned (non-mercenary) units, returning their equipment to inventory.
 *  Returns snapshots of removed units for restoring assignments on new units. */
function clearAutoSpawnedUnits(state: GameState): UnitSnapshot[] {
  const snapshots: UnitSnapshot[] = [];
  const toRemove: string[] = [];
  for (const [id, unit] of state.roster) {
    if (unit.isMercenary) continue;
    // Determine zone
    let zone: "active" | "reinforcement" | "bench" = "bench";
    if (state.battleRoster.includes(id)) zone = "active";
    else if (state.reinforcements.includes(id)) zone = "reinforcement";

    // Save snapshot with equipment and position
    snapshots.push({
      defId: unit.defId,
      zone,
      hex: state.savedDeployment.get(id),
      equipment: { ...unit.equipment },
    });

    // Return equipment to inventory
    for (const slot of ["weapon", "armor", "shield"] as EquipmentSlot[]) {
      const equip = unit.equipment[slot];
      if (equip) {
        removeEquipmentStats(unit, equip);
        state.equipmentInventory.push(equip);
      }
    }
    // Clean up saved deployment for this unit
    state.savedDeployment.delete(id);
    toRemove.push(id);
  }
  for (const id of toRemove) {
    state.roster.delete(id);
  }
  state.battleRoster = state.battleRoster.filter((id) => state.roster.has(id));
  state.reinforcements = state.reinforcements.filter((id) =>
    state.roster.has(id),
  );
  state.bench = state.bench.filter((id) => state.roster.has(id));
  return snapshots;
}

/** Auto-spawn units from all buildings, optionally restoring zone/position/equipment from snapshots */
function autoSpawnUnitsWithRestore(
  state: GameState,
  snapshots: UnitSnapshot[],
): void {
  // Group snapshots by defId so we can match new units to old assignments
  const snapshotsByDef = new Map<string, UnitSnapshot[]>();
  for (const snap of snapshots) {
    const arr = snapshotsByDef.get(snap.defId) ?? [];
    arr.push(snap);
    snapshotsByDef.set(snap.defId, arr);
  }

  for (const building of state.buildings.values()) {
    const unitDef = getBestSpawnableUnit(
      building.type as BuildingType,
      building.level,
    );
    if (!unitDef) continue;
    const count = unitDef.spawnCount ?? 1;
    for (let i = 0; i < count; i++) {
      const unit = createUnitWithBonuses(unitDef.id, state);
      state.roster.set(unit.id, unit);

      // Try to restore from a matching snapshot
      const defSnapshots = snapshotsByDef.get(unit.defId);
      const snap = defSnapshots?.shift();

      if (snap) {
        // Restore zone assignment
        if (
          snap.zone === "active" &&
          state.battleRoster.length < state.deploymentSlots
        ) {
          state.battleRoster.push(unit.id);
        } else if (
          snap.zone === "reinforcement" &&
          state.reinforcements.length < state.reinforcementQueueSize
        ) {
          state.reinforcements.push(unit.id);
        } else if (snap.zone === "bench") {
          state.bench.push(unit.id);
        } else {
          // Fallback: fill in order
          if (state.battleRoster.length < state.deploymentSlots) {
            state.battleRoster.push(unit.id);
          } else if (
            state.reinforcements.length < state.reinforcementQueueSize
          ) {
            state.reinforcements.push(unit.id);
          } else {
            state.bench.push(unit.id);
          }
        }

        // Restore deployment position
        if (snap.hex) {
          state.savedDeployment.set(unit.id, snap.hex);
        }

        // Restore equipment (re-equip same items from inventory)
        for (const slot of ["weapon", "armor", "shield"] as EquipmentSlot[]) {
          const oldEquip = snap.equipment[slot];
          if (!oldEquip) continue;
          // Find same item in inventory
          const invIdx = state.equipmentInventory.findIndex(
            (e) =>
              e.id === oldEquip.id &&
              e.slot === oldEquip.slot &&
              e.tier === oldEquip.tier,
          );
          if (invIdx >= 0) {
            equipItem(state, unit.id, invIdx);
          }
        }
      } else {
        // No snapshot match — assign normally
        if (state.battleRoster.length < state.deploymentSlots) {
          state.battleRoster.push(unit.id);
        } else if (state.reinforcements.length < state.reinforcementQueueSize) {
          state.reinforcements.push(unit.id);
        } else {
          state.bench.push(unit.id);
        }
        autoEquip(state, unit);
      }
    }
  }
  gameEvents.emit("roster:changed", {});
}

/** Auto-spawn units from all buildings (no restoration — used at game start) */
export function autoSpawnUnits(state: GameState): void {
  autoSpawnUnitsWithRestore(state, []);
}

/** Clear auto-spawned units and re-spawn fresh ones, preserving zone/position/equipment */
export function refreshAutoSpawn(state: GameState): void {
  const snapshots = clearAutoSpawnedUnits(state);
  autoSpawnUnitsWithRestore(state, snapshots);
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

  // Must be on a claimed tile
  if (!tile.claimed) return null;
  // Cannot build on mountains
  if (tile.terrain === "mountain") return null;
  // Tech gating for processing buildings
  if (buildingType === "smelter" && !state.purchasedTech.has("metallurgy"))
    return null;
  if (
    buildingType === "sawmill" &&
    !state.purchasedTech.has("sawmill_blueprint")
  )
    return null;

  // Resource buildings must be placed ON a matching deposit tile
  if (def.requiredDeposit) {
    if (tile.deposit !== def.requiredDeposit) return null;
  } else {
    // Non-resource buildings cannot be placed on deposits
    if (tile.deposit) return null;
  }

  // Apply building cost multiplier
  const adjustedCost: Partial<Resources> = {};
  for (const [res, amount] of Object.entries(def.cost)) {
    if (amount)
      adjustedCost[res as keyof Resources] = Math.floor(
        amount * state.buildingCostMultiplier,
      );
  }

  if (!canAfford(state.resources, adjustedCost)) return null;
  spendResources(state, adjustedCost);

  const building: Building = {
    id: uid("b"),
    type: def.type,
    coord,
    level: 1,
  };

  tile.buildingId = building.id;
  state.buildings.set(building.id, building);
  gameEvents.emit("building:placed", { buildingId: building.id });

  // Auto-spawn units from new military building
  refreshAutoSpawn(state);

  return building;
}

/** Claim an unclaimed tile adjacent to existing claimed territory */
export function claimTile(state: GameState, coord: HexCoord): boolean {
  const key = hexKey(coord);
  const tile = state.grid.tiles.get(key);
  if (!tile) return false;
  if (tile.claimed) return false;
  if (tile.terrain === "mountain") return false;

  // Must have at least one adjacent claimed neighbor
  const neighbors = hexNeighbors(coord);
  const hasClaimedNeighbor = neighbors.some((n) =>
    state.claimedTiles.has(hexKey(n)),
  );
  if (!hasClaimedNeighbor) return false;

  // Check cost
  const cost = getRingCost(coord);
  if (cost > 0 && state.resources.wood < cost) return false;

  // Spend wood
  if (cost > 0) {
    state.resources.wood -= cost;
    gameEvents.emit("resources:changed", { ...state.resources });
  }

  // Claim the tile
  tile.claimed = true;
  state.claimedTiles.add(key);
  gameEvents.emit("building:placed", { buildingId: "" }); // triggers re-render
  return true;
}

/** Upgrade a building to the next level */
export function upgradeBuilding(state: GameState, buildingId: string): boolean {
  const building = state.buildings.get(buildingId);
  if (!building) return false;
  const def = BUILDING_DEFS[building.type];
  if (!def) return false;

  // Check tech gating: building level capped by buildingUpgradeUnlocked (max 3)
  if (building.level >= state.buildingUpgradeUnlocked || building.level >= 3)
    return false;

  // Cost = base cost × 2^level — so level 1→2 costs 2x base, level 2→3 costs 4x base
  const costMultiplier = Math.pow(2, building.level);
  const upgradeCost: Partial<Resources> = {};
  for (const [res, amount] of Object.entries(def.cost)) {
    if (amount)
      upgradeCost[res as keyof Resources] = Math.floor(
        amount * costMultiplier * state.buildingCostMultiplier,
      );
  }

  if (!canAfford(state.resources, upgradeCost)) return false;
  spendResources(state, upgradeCost);
  building.level++;
  gameEvents.emit("building:placed", { buildingId }); // reuse event to trigger re-render

  // Auto-spawn better units from upgraded building
  refreshAutoSpawn(state);

  return true;
}

/** Get the cost to upgrade a building */
export function getBuildingUpgradeCost(
  state: GameState,
  building: Building,
): Partial<Resources> {
  const def = BUILDING_DEFS[building.type];
  if (!def) return {};
  const costMultiplier = Math.pow(2, building.level);
  const upgradeCost: Partial<Resources> = {};
  for (const [res, amount] of Object.entries(def.cost)) {
    if (amount)
      upgradeCost[res as keyof Resources] = Math.floor(
        amount * costMultiplier * state.buildingCostMultiplier,
      );
  }
  return upgradeCost;
}

/** Expand the map by 1 ring of tiles */
export function expandMap(state: GameState): void {
  const newRadius = state.grid.radius + 1;
  const newGrid = generateGrid(newRadius, Date.now());
  for (const [key, newTile] of newGrid.tiles) {
    if (!state.grid.tiles.has(key)) {
      newTile.claimed = false; // new tiles start unclaimed
      state.grid.tiles.set(key, newTile);
    }
  }
  state.grid.radius = newRadius;
}

/** Calculate the effective production rate for a resource building, including adjacency bonus */
export function getBuildingProductionRate(
  state: GameState,
  building: Building,
): number {
  const def = BUILDING_DEFS[building.type];
  if (!def.produces) return 0;

  const adjacentCount = countAdjacentDeposits(
    state.grid,
    building.coord,
    def.produces as import("./types").DepositType,
  );
  const baseRate = def.productionRate + adjacentCount;

  return Math.floor(baseRate * building.level * state.gatherRateMultiplier);
}

/** Tick resource production from all resource buildings */
export function tickResources(state: GameState): void {
  for (const building of state.buildings.values()) {
    const def = BUILDING_DEFS[building.type];

    // Apply passive income (e.g. camp)
    if (def.passiveIncome) {
      for (const [res, amount] of Object.entries(def.passiveIncome)) {
        if (amount) state.resources[res as keyof Resources] += amount;
      }
    }

    if (!def.produces) continue;

    // Processing buildings (sawmill, smelter): consume inputs to produce output
    if (def.consumes) {
      // Check if we can afford the input cost
      const consumesCopy: Partial<typeof state.resources> = {};
      let canProcess = true;
      for (const [res, amount] of Object.entries(def.consumes)) {
        if (amount && amount > 0) {
          consumesCopy[res as keyof typeof state.resources] = amount;
          if (
            (state.resources[res as keyof typeof state.resources] ?? 0) < amount
          ) {
            canProcess = false;
          }
        }
      }
      if (!canProcess) continue;

      // Spend inputs
      for (const [res, amount] of Object.entries(consumesCopy)) {
        if (amount)
          state.resources[res as keyof typeof state.resources] -= amount;
      }

      // Produce output (processing buildings don't get gatherRateMultiplier)
      let output = def.productionRate * building.level;

      // Smelter adjacency bonus: if adjacent to iron_mine, +1 output
      if (building.type === "smelter") {
        const neighbors = hexNeighbors(building.coord);
        for (const n of neighbors) {
          const nTile = state.grid.tiles.get(hexKey(n));
          if (nTile?.buildingId) {
            const adjBuilding = state.buildings.get(nTile.buildingId);
            if (adjBuilding?.type === "iron_mine") {
              output += 1;
              break;
            }
          }
        }
      }

      state.resources[def.produces] += output;
    } else {
      // Raw resource buildings: use existing production rate with multiplier
      // Quarry lv2+ produces cut_stone instead of stone
      let produces = def.produces;
      if (
        building.type === "quarry" &&
        building.level >= 2 &&
        state.purchasedTech.has("masonry")
      ) {
        produces = "cut_stone";
      }
      state.resources[produces] += getBuildingProductionRate(state, building);
    }
  }

  // Apply scavenger relic (keep existing logic)
  for (const relicId of state.activeRelics) {
    const relic = RELICS.find((r) => r.id === relicId);
    if (relic?.effect.type === "post_battle_resources") {
      for (const [res, amount] of Object.entries(relic.effect.resources)) {
        if (amount)
          state.resources[res as keyof typeof state.resources] += amount;
      }
    }
  }

  gameEvents.emit("resources:changed", { ...state.resources });
}

/** Change the game phase */
export function setPhase(state: GameState, phase: GamePhase): void {
  const from = state.phase;
  state.phase = phase;
  gameEvents.emit("phase:changed", { from, to: phase });
}

/** Apply base damage after a lost battle */
export function damageBase(state: GameState, damage: number): void {
  state.baseHp = Math.max(0, state.baseHp - damage);
  gameEvents.emit("base:damaged", { damage, remaining: state.baseHp });
  if (state.baseHp <= 0) {
    setPhase(state, "game_over");
    gameEvents.emit("game:over", { wave: state.wave });
  }
}

/** Check if the player can afford a cost */
export function canAfford(
  current: Resources,
  cost: Partial<Resources>,
): boolean {
  for (const [res, amount] of Object.entries(cost)) {
    if ((current[res as keyof Resources] ?? 0) < (amount ?? 0)) return false;
  }
  return true;
}

/** Deduct resources */
export function spendResources(
  state: GameState,
  cost: Partial<Resources>,
): void {
  for (const [res, amount] of Object.entries(cost)) {
    if (amount) state.resources[res as keyof Resources] -= amount;
  }
  gameEvents.emit("resources:changed", { ...state.resources });
}

/** Prepare battle: resets HP, creates BattleState, and captures initial snapshot. Does NOT run the simulation. */
export function prepareBattle(
  state: GameState,
  deployment: UnitDeployment,
): { battleState: BattleState; snapshot: ArenaSnapshot } {
  // Reset all roster units' HP to max before battle
  for (const unit of state.roster.values()) {
    unit.stats.hp = unit.stats.maxHp;
  }

  const effectiveBattleWidth = INITIAL_BATTLE_WIDTH + state.battleWidthBonus;
  const wave = state.currentWaveDef ?? generateWave(state.wave);

  // Collect all player units (active + reinforcements)
  const playerUnits: Unit[] = [];
  for (const id of state.battleRoster) {
    const unit = state.roster.get(id);
    if (unit) playerUnits.push(unit);
  }
  for (const id of state.reinforcements) {
    const unit = state.roster.get(id);
    if (unit && !playerUnits.some((u) => u.id === id)) playerUnits.push(unit);
  }

  // Create enemy units from wave definition
  const enemyUnits = createEnemyUnits(wave);

  const battleState = createHexBattleState(
    playerUnits,
    enemyUnits,
    deployment,
    effectiveBattleWidth,
    INITIAL_ENEMY_WIDTH,
  );
  const snapshot = captureSnapshot(battleState);

  gameEvents.emit("battle:started", {});

  return { battleState, snapshot };
}

/** Generate a default auto-deployment for all active player units */
export function getDefaultDeployment(
  state: GameState,
  arenaWidth: number,
): UnitDeployment {
  const placements = new Map<string, HexCoord>();
  const ARENA_DEP = ARENA_DEPTH;
  const playerRowStart = ARENA_DEP - PLAYER_DEPLOY_ROWS;

  // Collect all units that could participate
  const allActive = state.battleRoster
    .map((id) => state.roster.get(id))
    .filter((u): u is Unit => !!u);
  const reinforcementUnits = state.reinforcements
    .map((id) => state.roster.get(id))
    .filter((u): u is Unit => !!u);
  const allUnits = [...allActive, ...reinforcementUnits];

  const tanks = allUnits.filter((u) => {
    const d = ALL_UNIT_DEFS[u.defId];
    return d?.role === "tank" || d?.role === "animal";
  });
  const melee = allUnits.filter((u) => {
    const d = ALL_UNIT_DEFS[u.defId];
    return (
      d?.role === "melee" || d?.role === "glass_cannon" || d?.role === "fodder"
    );
  });
  const ranged = allUnits.filter((u) => {
    const d = ALL_UNIT_DEFS[u.defId];
    return d?.role === "ranged";
  });

  const placed = new Set<string>();
  const usedCoords = new Set<string>();

  const placeGroup = (group: Unit[], preferredRow: number) => {
    let col = 0;
    let row = preferredRow;
    for (const unit of group) {
      if (placed.has(unit.id)) continue;
      // Find next available hex in player zone
      while (row >= playerRowStart) {
        const coord = hex(col, row);
        const key = hexKey(coord);
        if (!usedCoords.has(key)) {
          placements.set(unit.id, coord);
          placed.add(unit.id);
          usedCoords.add(key);
          col++;
          if (col >= arenaWidth) {
            col = 0;
            row--;
          }
          break;
        }
        col++;
        if (col >= arenaWidth) {
          col = 0;
          row--;
        }
      }
    }
  };

  // Front row (closest to enemies): tanks and animals; then melee; back row: ranged
  placeGroup(tanks, ARENA_DEP - 1);
  placeGroup(melee, ARENA_DEP - 1);
  placeGroup(ranged, ARENA_DEP - PLAYER_DEPLOY_ROWS);
  // Any remaining
  const remaining = allUnits.filter((u) => !placed.has(u.id));
  placeGroup(remaining, ARENA_DEP - 1);

  return { placements };
}

/** Finalize battle: award BP, remove dead units, damage base, emit events. */
export function finalizeBattle(
  state: GameState,
  result: BattleResult,
  battleState: BattleState,
): void {
  // Calculate and award BP
  const wave = state.currentWaveDef ?? generateWave(state.wave);
  const bp = calculateBP(state.wave, result.winner === "player", wave.isBoss);
  result.bpEarned = bp;
  state.bp += bp;

  // Reset HP for all surviving units so build phase and deployment show full HP
  for (const unit of state.roster.values()) {
    if (unit.lives > 0) unit.stats.hp = unit.stats.maxHp;
  }

  // Remove permanently dead units (lives <= 0)
  const deadIds: string[] = [];
  for (const unit of state.roster.values()) {
    if (unit.lives <= 0) {
      // Return equipment to inventory before removing (skip merc-bound items)
      for (const slot of ["weapon", "armor", "shield"] as EquipmentSlot[]) {
        const equip = unit.equipment[slot];
        if (equip) {
          removeEquipmentStats(unit, equip);
          if (!equip.isMercBound) state.equipmentInventory.push(equip);
        }
      }
      // Clean up saved deployment for dead unit
      state.savedDeployment.delete(unit.id);
      deadIds.push(unit.id);
    }
  }
  for (const id of deadIds) {
    state.roster.delete(id);
  }
  // Purge dead IDs from all arrays
  state.battleRoster = state.battleRoster.filter((id) => state.roster.has(id));
  state.reinforcements = state.reinforcements.filter((id) =>
    state.roster.has(id),
  );
  state.bench = state.bench.filter((id) => state.roster.has(id));

  if (result.winner === "enemy") {
    // Check if any surviving enemy is a boss → instant game over
    const hasBoss = result.survivingEnemies.some(
      (e) => ENEMY_DEFS[e.defId]?.isBoss,
    );
    if (hasBoss) {
      state.baseHp = 0;
      gameEvents.emit("base:damaged", { damage: state.baseHp, remaining: 0 });
      setPhase(state, "game_over");
      gameEvents.emit("game:over", { wave: state.wave });
    } else {
      const baseDamage = result.survivingEnemies.length * 5;
      damageBase(state, baseDamage);
    }
    state.lossStreak++;
  } else {
    state.lossStreak = 0;
  }

  state.battle = battleState;
  gameEvents.emit("battle:ended", result);
}

/** Advance from battle/results back to the build phase */
export function advanceToBuild(state: GameState): void {
  state.wave++;
  state.battle = null;
  state.cardChoices = null;

  // Generate wave preview for the next wave
  state.currentWaveDef = generateWave(state.wave);

  // Clear auto-spawned units and re-spawn fresh ones for the new wave
  refreshAutoSpawn(state);

  setPhase(state, "build");
}

// ── Roster Management ──

function removeUnitFromAllZones(state: GameState, unitId: string): void {
  state.battleRoster = state.battleRoster.filter((id) => id !== unitId);
  state.reinforcements = state.reinforcements.filter((id) => id !== unitId);
  state.bench = state.bench.filter((id) => id !== unitId);
}

export function moveUnitToActive(state: GameState, unitId: string): void {
  if (!state.roster.has(unitId)) return;
  // Don't exceed deployment slot limit (unless unit is already in battleRoster)
  if (
    !state.battleRoster.includes(unitId) &&
    state.battleRoster.length >= state.deploymentSlots
  )
    return;
  removeUnitFromAllZones(state, unitId);
  state.battleRoster.push(unitId);
  gameEvents.emit("roster:changed", {});
}

export function moveUnitToReinforcements(
  state: GameState,
  unitId: string,
): void {
  if (!state.roster.has(unitId)) return;
  if (state.reinforcements.length >= state.reinforcementQueueSize) return;
  removeUnitFromAllZones(state, unitId);
  state.reinforcements.push(unitId);
  gameEvents.emit("roster:changed", {});
}

/** Get the bench capacity: 2 base + 2×level per military building */
export function getBenchCapacity(state: GameState): number {
  const militaryTypes = new Set([
    "barracks",
    "archery_range",
    "kennel",
    "guardhouse",
  ]);
  let slots = 0;
  for (const b of state.buildings.values()) {
    if (militaryTypes.has(b.type)) slots += 2 * b.level;
  }
  return 2 + slots;
}

export function moveUnitToBench(state: GameState, unitId: string): void {
  if (!state.roster.has(unitId)) return;
  // Check bench capacity (don't count the unit if it's already on bench)
  const currentBenchCount = state.bench.filter((id) => id !== unitId).length;
  if (currentBenchCount >= getBenchCapacity(state)) return;
  removeUnitFromAllZones(state, unitId);
  state.bench.push(unitId);
  gameEvents.emit("roster:changed", {});
}

/** Sell a building: 50% resource refund. Camp cannot be sold. */
export function sellBuilding(state: GameState, buildingId: string): boolean {
  const building = state.buildings.get(buildingId);
  if (!building || building.type === "camp") return false;

  const def = BUILDING_DEFS[building.type];
  if (!def) return false;

  // Refund 50% of adjusted cost
  for (const [res, amount] of Object.entries(def.cost)) {
    if (amount) {
      const adjusted = Math.floor(
        (amount as number) * state.buildingCostMultiplier,
      );
      state.resources[res as keyof Resources] += Math.floor(adjusted * 0.5);
    }
  }

  // Remove from tile
  const tile = state.grid.tiles.get(hexKey(building.coord));
  if (tile) tile.buildingId = null;
  state.buildings.delete(buildingId);

  gameEvents.emit("resources:changed", { ...state.resources });
  gameEvents.emit("building:placed", { buildingId: "" });

  // Re-spawn units from remaining buildings
  refreshAutoSpawn(state);

  return true;
}

/** Sell a mercenary unit: flat refund, return equipment. Auto-spawned units cannot be sold. */
export function sellUnit(state: GameState, unitId: string): boolean {
  const unit = state.roster.get(unitId);
  if (!unit) return false;
  if (!unit.isMercenary) return false;

  // Return equipment to inventory
  for (const slot of ["weapon", "armor", "shield"] as EquipmentSlot[]) {
    const equip = unit.equipment[slot];
    if (equip) {
      removeEquipmentStats(unit, equip);
      state.equipmentInventory.push(equip);
    }
  }

  // Flat refund for mercenary units
  state.resources.wood += 2;
  state.resources.stone += 1;

  // Remove from roster and all zones
  removeUnitFromAllZones(state, unitId);
  state.roster.delete(unitId);
  gameEvents.emit("resources:changed", { ...state.resources });
  gameEvents.emit("roster:changed", {});
  return true;
}

// ── Equipment ──

export function getBlacksmithUpgradeCost(
  currentTier: EquipmentTier,
): Partial<Resources> | null {
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
  return Object.values(EQUIPMENT_DEFS).filter((def) => {
    return TIER_ORDER.indexOf(def.tier) <= currentIdx;
  });
}

export function craftEquipment(state: GameState, equipmentId: string): boolean {
  const def = EQUIPMENT_DEFS[equipmentId];
  if (!def) return false;

  const tierIdx = TIER_ORDER.indexOf(def.tier);
  const currentIdx = TIER_ORDER.indexOf(state.blacksmithTier);
  if (tierIdx > currentIdx) return false;

  const hasBlacksmith = [...state.buildings.values()].some(
    (b) => b.type === "blacksmith",
  );
  if (!hasBlacksmith) return false;

  if (!canAfford(state.resources, def.craftCost)) return false;
  spendResources(state, def.craftCost);

  state.equipmentInventory.push({ ...def });

  // Auto-equip on all roster units with empty slots
  autoEquipAll(state);

  return true;
}

export function equipItem(
  state: GameState,
  unitId: string,
  inventoryIndex: number,
): boolean {
  const unit = state.roster.get(unitId);
  if (!unit) return false;

  const def = state.equipmentInventory[inventoryIndex];
  if (!def) return false;

  const unitDef = ALL_UNIT_DEFS[unit.defId];
  if (!unitDef) return false;

  if (def.slot === "weapon" && !unitDef.canEquipWeapons) return false;
  if (def.slot === "armor" && !unitDef.canEquipArmor) return false;
  if (def.slot === "shield" && !unitDef.canEquipWeapons) return false;

  // Unequip existing item in that slot (block if merc-bound)
  const existing = unit.equipment[def.slot];
  if (existing) {
    if (existing.isMercBound) return false;
    removeEquipmentStats(unit, existing);
    state.equipmentInventory.push(existing);
  }

  // Remove from inventory and equip
  state.equipmentInventory.splice(inventoryIndex, 1);
  unit.equipment[def.slot] = { ...def };
  applyEquipmentStats(unit, def);

  gameEvents.emit("roster:changed", {});
  return true;
}

export function unequipItem(
  state: GameState,
  unitId: string,
  slot: EquipmentSlot,
): boolean {
  const unit = state.roster.get(unitId);
  if (!unit) return false;

  const existing = unit.equipment[slot];
  if (!existing) return false;

  // Merc-bound equipment cannot be unequipped
  if (existing.isMercBound) return false;

  removeEquipmentStats(unit, existing);
  state.equipmentInventory.push(existing);
  delete unit.equipment[slot];
  gameEvents.emit("roster:changed", {});
  return true;
}

/** Auto-equip the best available equipment from inventory onto a unit */
export function autoEquip(state: GameState, unit: Unit): void {
  const unitDef = ALL_UNIT_DEFS[unit.defId];
  if (!unitDef) return;

  const slots: EquipmentSlot[] = ["weapon", "armor", "shield"];
  for (const slot of slots) {
    if (unit.equipment[slot]) continue; // already has something
    if (slot === "weapon" && !unitDef.canEquipWeapons) continue;
    if (slot === "armor" && !unitDef.canEquipArmor) continue;
    if (slot === "shield" && !unitDef.canEquipWeapons) continue;

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

/** Sum a unit's base stats for ranking (higher = better unit, gets priority for equipment) */
function unitStatSum(unit: Unit): number {
  return (
    unit.stats.maxHp +
    unit.stats.attack * 5 +
    unit.stats.armor * 3 +
    (1 / Math.max(0.1, unit.stats.cooldown)) * 10
  );
}

/** Auto-equip all roster units that have empty equipment slots, prioritizing best units first */
function autoEquipAll(state: GameState): void {
  const units = [...state.roster.values()].sort(
    (a, b) => unitStatSum(b) - unitStatSum(a),
  );
  for (const unit of units) {
    autoEquip(state, unit);
  }
}

export function applyEquipmentStats(unit: Unit, def: EquipmentDef): void {
  for (const [stat, value] of Object.entries(def.modifiers)) {
    if (value !== undefined && stat in unit.stats) {
      (unit.stats as unknown as Record<string, number>)[stat] += value;
    }
  }
  if (def.hpPercent) {
    const unitDef = ALL_UNIT_DEFS[unit.defId];
    if (unitDef) {
      const bonus = Math.round(unitDef.baseStats.maxHp * def.hpPercent);
      unit.stats.maxHp += bonus;
      unit.stats.hp += bonus;
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
  if (def.hpPercent) {
    const unitDef = ALL_UNIT_DEFS[unit.defId];
    if (unitDef) {
      const bonus = Math.round(unitDef.baseStats.maxHp * def.hpPercent);
      unit.stats.maxHp -= bonus;
      unit.stats.hp = Math.min(unit.stats.hp, unit.stats.maxHp);
    }
  }
  if (def.bonusLives) {
    unit.lives = Math.max(1, unit.lives - def.bonusLives);
    unit.maxLives = Math.max(1, unit.maxLives - def.bonusLives);
  }
}

// ── Tech Shop ──

export function generateTechShop(_state: GameState): void {
  // Tech tree is always available — no shop generation needed
}

export function purchaseTech(state: GameState, techId: string): boolean {
  const node = TECH_TREE[techId];
  if (!node) return false;

  // Already purchased
  if (state.purchasedTech.has(techId)) return false;

  // Check all prerequisites are purchased
  for (const prereqId of node.prereqIds) {
    if (!state.purchasedTech.has(prereqId)) return false;
  }

  // Free tech pending from Breakthrough card — skip cost and consume the flag
  if (state.freeTechPending) {
    state.freeTechPending = false;
  } else {
    // Check BP cost (flat, no tier doubling)
    if (state.bp < node.cost) return false;
    state.bp -= node.cost;
  }

  state.purchasedTech.set(techId, 1);
  gameEvents.emit("tech:purchased", { techId });
  gameEvents.emit("bp:changed", { bp: state.bp });

  applyTechEffect(state, node.effect);

  return true;
}

function applyTechEffect(state: GameState, effect: TechEffect): void {
  switch (effect.type) {
    case "stat_boost":
      // Apply to all existing units
      for (const unit of state.roster.values()) {
        (unit.stats as unknown as Record<string, number>)[effect.stat] +=
          effect.value;
        if (effect.stat === "maxHp") unit.stats.hp += effect.value;
      }
      // Track for future units
      state.techStatBonuses[effect.stat] =
        (state.techStatBonuses[effect.stat] ?? 0) + effect.value;
      break;
    case "gather_rate":
      state.gatherRateMultiplier *= effect.multiplier;
      break;
    case "building_cost":
      state.buildingCostMultiplier *= effect.multiplier;
      break;
    case "battle_width":
      state.battleWidthBonus += effect.value;
      break;
    case "reserve_size":
      state.reinforcementQueueSize += effect.value;
      break;
    case "unit_lives":
      for (const unit of state.roster.values()) {
        unit.lives += effect.value;
        unit.maxLives += effect.value;
      }
      state.techLivesBonus += effect.value;
      break;
    case "card_rarity_boost":
      state.cardRarityBoost += effect.value;
      break;
    case "extra_card_choice":
      state.extraCardChoices += effect.value;
      break;
    case "expand_map":
      expandMap(state);
      break;
    case "building_upgrade_unlock":
      state.buildingUpgradeUnlocked = Math.max(
        state.buildingUpgradeUnlocked,
        effect.value,
      );
      break;
    case "deployment_slot":
      state.deploymentSlots += effect.value;
      break;
    case "reinforcement_slot":
      state.reinforcementQueueSize += effect.value;
      break;
    case "special":
      // Special effects are handled by checking purchasedTech directly
      // (e.g., sawmill_blueprint enables sawmill building, masonry enables quarry lv2)
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
    if (wave.isBoss) {
      const card = generateRelicCard(state);
      usedKeys.add(card.name);
      cards.push(card);
      continue;
    }
    const minRarity =
      i === 0 && wave.isElite ? ("rare" as CardRarity) : undefined;
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

function generateRandomCard(
  state: GameState,
  wave: number,
  minRarity?: CardRarity,
): Card {
  const rarity = rollCardRarity(
    wave,
    state.cardRarityBoost,
    state.lossStreak,
    minRarity,
  );

  // 25% chance to attempt a context-aware card (rare+ only — common context cards are too cheap)
  const rarityOrder: CardRarity[] = ["common", "rare", "epic", "legendary"];
  if (rarityOrder.indexOf(rarity) >= 1 && Math.random() < 0.25) {
    const ctx = generateContextCard(state, rarity);
    if (ctx) return ctx;
  }

  const types: CardType[] = ["resources", "unit", "equipment", "stat_buff"];
  if (getUpgradeableBuildings(state).length > 0) types.push("building_upgrade");
  // Breakthrough is always epic — only offer it when an epic/legendary was rolled
  if ((rarity === 'epic' || rarity === 'legendary') && getAvailableTechNodes(state).length > 0) types.push("tech_node");

  const type = types[Math.floor(Math.random() * types.length)];
  return createCardOfType(type, rarity, state);
}

function generateRelicCard(state: GameState): Card {
  const available = RELICS.filter((r) => !state.activeRelics.includes(r.id));
  const relic =
    available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : RELICS[Math.floor(Math.random() * RELICS.length)];

  return {
    id: uid("card"),
    name: relic.name,
    description: relic.description,
    rarity: relic.rarity,
    type: "relic",
    effect: { type: "grant_relic", relicId: relic.id },
  };
}

function rollCardRarity(
  wave: number,
  boost: number,
  lossStreak: number,
  min?: CardRarity,
): CardRarity {
  let common = 60,
    rare = 0,
    epic = 0,
    legendary = 0;

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

  const rarities: CardRarity[] = ["common", "rare", "epic", "legendary"];
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
  return "common";
}

function createCardOfType(
  type: CardType,
  rarity: CardRarity,
  state?: GameState,
): Card {
  switch (type) {
    case "resources":
      return createResourceCard(rarity);
    case "unit":
      return createUnitCard(rarity);
    case "equipment":
      return createEquipmentCard(rarity);
    case "stat_buff":
      return createStatBuffCard(rarity);
    case "building_upgrade":
      return createFreeUpgradeCard(rarity);
    case "tech_node":
      return createFreeTechCard();
    default:
      return createResourceCard(rarity);
  }
}

function createResourceCard(rarity: CardRarity): Card {
  const resources = ["wood", "stone", "iron"] as const;
  const pick = resources[Math.floor(Math.random() * resources.length)];
  const amounts: Record<typeof pick, Record<CardRarity, number>> = {
    wood: { common: 6, rare: 14, epic: 28, legendary: 50 },
    stone: { common: 4, rare: 10, epic: 20, legendary: 36 },
    iron: { common: 4, rare: 8, epic: 16, legendary: 24 },
  };
  const amount = amounts[pick][rarity];
  const res: Partial<Resources> = { [pick]: amount };
  const names: Record<typeof pick, string> = {
    wood: "Lumber Windfall",
    stone: "Stone Cache",
    iron: "Iron Deposit",
  };
  return {
    id: uid("card"),
    name: names[pick],
    description: `+${amount} ${pick}`,
    rarity,
    type: "resources",
    effect: { type: "grant_resources", resources: res },
  };
}

/** Equipment loadout for mercenary units by rarity */
const MERC_LOADOUTS: Record<
  CardRarity,
  { unitIds: string[]; weapon?: string; armor?: string }[]
> = {
  common: [
    { unitIds: ["peasant"], weapon: "rock" },
    { unitIds: ["wolf"], armor: "hide_vest" },
  ],
  rare: [
    { unitIds: ["militia"], weapon: "bronze_sword", armor: "hide_vest" },
    { unitIds: ["archer"], weapon: "short_bow", armor: "hide_vest" },
  ],
  epic: [
    { unitIds: ["guard"], weapon: "iron_sword", armor: "bronze_plate" },
    { unitIds: ["swordsman"], weapon: "iron_sword", armor: "bronze_plate" },
    { unitIds: ["sentinel"], weapon: "iron_sword", armor: "bronze_plate" },
    { unitIds: ["crossbowman"], weapon: "longbow", armor: "bronze_plate" },
    { unitIds: ["dire_wolf"], weapon: undefined, armor: "bronze_plate" },
  ],
  legendary: [
    { unitIds: ["champion"], weapon: "steel_blade", armor: "iron_armor" },
    { unitIds: ["sharpshooter"], weapon: "steel_blade", armor: "iron_armor" },
    { unitIds: ["warden"], weapon: "steel_blade", armor: "iron_armor" },
    { unitIds: ["alpha_wolf"], weapon: undefined, armor: "iron_armor" },
  ],
};

function equipMercenary(
  unit: Unit,
  weaponId?: string,
  armorId?: string,
): string[] {
  const equipped: string[] = [];
  const unitDef = ALL_UNIT_DEFS[unit.defId];
  if (!unitDef) return equipped;

  if (weaponId && unitDef.canEquipWeapons) {
    const def = EQUIPMENT_DEFS[weaponId];
    if (def) {
      const bound = { ...def, isMercBound: true };
      unit.equipment.weapon = bound;
      applyEquipmentStats(unit, bound);
      equipped.push(def.name);
    }
  }
  if (armorId && unitDef.canEquipArmor) {
    const def = EQUIPMENT_DEFS[armorId];
    if (def) {
      const bound = { ...def, isMercBound: true };
      unit.equipment.armor = bound;
      applyEquipmentStats(unit, bound);
      equipped.push(def.name);
    }
  }
  return equipped;
}

function createUnitCard(rarity: CardRarity): Card {
  const loadouts = MERC_LOADOUTS[rarity];
  const loadout = loadouts[Math.floor(Math.random() * loadouts.length)];
  const unitDefId = loadout.unitIds[0];
  const def = ALL_UNIT_DEFS[unitDefId];
  const gearParts: string[] = [];
  if (loadout.weapon)
    gearParts.push(EQUIPMENT_DEFS[loadout.weapon]?.name ?? loadout.weapon);
  if (loadout.armor)
    gearParts.push(EQUIPMENT_DEFS[loadout.armor]?.name ?? loadout.armor);
  const gearDesc = gearParts.length > 0 ? ` (${gearParts.join(", ")})` : "";
  return {
    id: uid("card"),
    name: def.name,
    description: `Mercenary ${def.name}${gearDesc} joins your army. Persists until killed.`,
    rarity,
    type: "unit",
    effect: { type: "grant_unit", unitDefId },
  };
}

function createEquipmentCard(rarity: CardRarity): Card {
  const tierMap: Record<CardRarity, EquipmentTier[]> = {
    common: ["crude"],
    rare: ["crude", "bronze"],
    epic: ["bronze", "iron"],
    legendary: ["iron", "steel", "mithril"],
  };
  const tiers = tierMap[rarity];
  const available = Object.values(EQUIPMENT_DEFS).filter((e) =>
    tiers.includes(e.tier),
  );
  const equip = available[Math.floor(Math.random() * available.length)];
  return {
    id: uid("card"),
    name: equip.name,
    description: `${equip.slot} - ${formatModifiers(equip)}`,
    rarity,
    type: "equipment",
    effect: { type: "grant_equipment", equipmentId: equip.id },
  };
}

function createStatBuffCard(rarity: CardRarity): Card {
  type BuffStat = "attack" | "maxHp" | "glancingChance";
  // Weighted: attack/maxHp more common, glancingChance only rare+
  const statPool: BuffStat[] =
    rarity === "common"
      ? ["attack", "maxHp"]
      : rarity === "rare"
        ? ["attack", "attack", "maxHp", "glancingChance"]
        : ["attack", "attack", "maxHp", "maxHp", "glancingChance"];
  const stat = statPool[Math.floor(Math.random() * statPool.length)];

  const values: Record<BuffStat, Partial<Record<CardRarity, number>>> = {
    attack:        { common: 2, rare: 4, epic: 7, legendary: 11 },
    maxHp:         { common: 5, rare: 8, epic: 13, legendary: 20 },
    glancingChance:{ rare: 0.10, epic: 0.15, legendary: 0.20 },
  };
  const value = values[stat][rarity] ?? values[stat].rare ?? 0;

  const names: Record<BuffStat, string> = {
    attack: "Personal Trainer",
    maxHp: "Endurance Training",
    glancingChance: "Evasion Drill",
  };
  const formatVal =
    stat === "glancingChance"
      ? `+${Math.round(value * 100)}% glancing`
      : stat === "maxHp"
        ? `+${value} max HP`
        : `+${value} attack`;
  return {
    id: uid("card"),
    name: names[stat],
    description: `Choose a unit to permanently gain ${formatVal}.`,
    rarity,
    type: "stat_buff",
    effect: { type: "stat_buff_single_unit", stat, value },
  };
}

function createFreeUpgradeCard(rarity: CardRarity): Card {
  return {
    id: uid("card"),
    name: "Master Builder",
    description: "Upgrade one of your buildings for free.",
    rarity,
    type: "building_upgrade",
    effect: { type: "free_building_upgrade" },
  };
}

function createFreeTechCard(): Card {
  return {
    id: uid("card"),
    name: "Breakthrough",
    description: "Unlock any available tech node for free.",
    rarity: "epic",
    type: "tech_node",
    effect: { type: "free_tech_node" },
  };
}

function generateContextCard(
  state: GameState,
  rarity: CardRarity,
): Card | null {
  const militaryTypes: BuildingType[] = [
    "barracks",
    "archery_range",
    "blacksmith",
    "kennel",
    "guardhouse",
  ];
  const resourceTypes: BuildingType[] = ["lumber_mill", "quarry", "iron_mine"];

  const militaryCount = [...state.buildings.values()].filter((b) =>
    militaryTypes.includes(b.type),
  ).length;
  const resourceBuildingCount = [...state.buildings.values()].filter((b) =>
    resourceTypes.includes(b.type),
  ).length;
  const claimedCount = state.claimedTiles.size;
  const rosterSize = state.roster.size;
  const animalCount = [...state.roster.values()].filter(
    (u) => ALL_UNIT_DEFS[u.defId]?.role === "animal",
  ).length;

  type ContextGen = () => Card;
  const candidates: ContextGen[] = [];

  if (militaryCount >= 1) {
    candidates.push(() => ({
      id: uid("card"),
      name: "War Levy",
      description: `+${militaryCount * 2} iron (from ${militaryCount} military buildings)`,
      rarity,
      type: "resources" as const,
      effect: {
        type: "grant_resources" as const,
        resources: { iron: militaryCount * 2 },
      },
    }));
  }
  if (claimedCount >= 2) {
    const wood = claimedCount;
    const stone = Math.floor(claimedCount / 2);
    candidates.push(() => ({
      id: uid("card"),
      name: "Land Prosperity",
      description: `+${wood} wood, +${stone} stone (from ${claimedCount} claimed tiles)`,
      rarity,
      type: "resources" as const,
      effect: { type: "grant_resources" as const, resources: { wood, stone } },
    }));
  }
  if (animalCount >= 1) {
    candidates.push(() => ({
      id: uid("card"),
      name: "Pack Instinct",
      description: `All animals gain +2 attack (${animalCount} unit${animalCount > 1 ? "s" : ""} affected).`,
      rarity,
      type: "stat_buff" as const,
      effect: {
        type: "stat_buff_role" as const,
        role: "animal" as const,
        stat: "attack" as const,
        value: 2,
      },
    }));
  }
  if (rosterSize >= 3) {
    candidates.push(() => ({
      id: uid("card"),
      name: "Veterans' Pay",
      description: `+${rosterSize} BP (from ${rosterSize} units in roster)`,
      rarity,
      type: "bp_bonus" as const,
      effect: { type: "grant_bp" as const, amount: rosterSize },
    }));
  }
  if (resourceBuildingCount >= 2) {
    const stone = resourceBuildingCount * 3;
    candidates.push(() => ({
      id: uid("card"),
      name: "Builder's Cache",
      description: `+${stone} stone (from ${resourceBuildingCount} resource buildings)`,
      rarity,
      type: "resources" as const,
      effect: { type: "grant_resources" as const, resources: { stone } },
    }));
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)]();
}

// ── Exported State Query Helpers ──

export function getUpgradeableBuildings(state: GameState): Building[] {
  return [...state.buildings.values()].filter((b) => {
    return b.level < state.buildingUpgradeUnlocked && b.level < 3;
  });
}

export function getAvailableTechNodes(state: GameState): TechNode[] {
  return Object.values(TECH_TREE).filter((node) => {
    if (state.purchasedTech.has(node.id)) return false;
    return node.prereqIds.every((prereqId) =>
      state.purchasedTech.has(prereqId),
    );
  });
}

export function upgradeBuildingFree(
  state: GameState,
  buildingId: string,
): void {
  const building = state.buildings.get(buildingId);
  if (!building) return;
  building.level++;
  refreshAutoSpawn(state);
  gameEvents.emit("building:placed", { buildingId });
}

export function unlockTechNodeFree(state: GameState, nodeId: string): void {
  const node = TECH_TREE[nodeId];
  if (!node) return;
  if (state.purchasedTech.has(nodeId)) return;
  state.purchasedTech.set(nodeId, 1);
  applyTechEffect(state, node.effect);
  gameEvents.emit("tech:purchased", { techId: nodeId });
}

/** Apply the selected card's effect */
export function selectCard(state: GameState, cardIndex: number): void {
  if (!state.cardChoices) return;
  const card = state.cardChoices[cardIndex];
  if (!card) return;

  switch (card.effect.type) {
    case "grant_resources":
      for (const [res, amount] of Object.entries(card.effect.resources)) {
        if (amount) state.resources[res as keyof Resources] += amount;
      }
      gameEvents.emit("resources:changed", { ...state.resources });
      break;

    case "grant_unit": {
      const grantUnitEffect = card.effect;
      const unit = createUnitWithBonuses(grantUnitEffect.unitDefId, state);
      unit.isMercenary = true;
      state.roster.set(unit.id, unit);
      // Apply merc equipment loadout (skip autoEquip to preserve loadout)
      const loadoutsForRarity = MERC_LOADOUTS[card.rarity] ?? [];
      const { unitDefId: mercDefId } = grantUnitEffect;
      const loadout = loadoutsForRarity.find((l) =>
        l.unitIds.includes(mercDefId),
      );
      if (loadout) {
        equipMercenary(unit, loadout.weapon, loadout.armor);
      } else {
        autoEquip(state, unit);
      }
      // Respect deployment slot limit
      if (state.battleRoster.length < state.deploymentSlots) {
        state.battleRoster.push(unit.id);
      } else if (state.reinforcements.length < state.reinforcementQueueSize) {
        state.reinforcements.push(unit.id);
      } else {
        state.bench.push(unit.id);
      }
      gameEvents.emit("unit:trained", { unitId: unit.id });
      gameEvents.emit("roster:changed", {});
      break;
    }

    case "grant_bp":
      state.bp += card.effect.amount;
      gameEvents.emit("bp:changed", { bp: state.bp });
      break;

    case "grant_equipment": {
      const equipDef = EQUIPMENT_DEFS[card.effect.equipmentId];
      if (equipDef) state.equipmentInventory.push({ ...equipDef });
      break;
    }

    case "grant_relic": {
      const relicId = card.effect.relicId;
      if (!state.activeRelics.includes(relicId)) {
        state.activeRelics.push(relicId);
        applyRelicEffect(state, relicId);
        gameEvents.emit("relic:gained", { relicId });
      }
      break;
    }

    case "stat_buff_role": {
      const roleEffect = card.effect;
      const targets = [...state.roster.values()].filter(
        (u) => ALL_UNIT_DEFS[u.defId]?.role === roleEffect.role,
      );
      for (const unit of targets) {
        (unit.stats as unknown as Record<string, number>)[roleEffect.stat] +=
          roleEffect.value;
        if (roleEffect.stat === "maxHp") unit.stats.hp += roleEffect.value;
      }
      gameEvents.emit("roster:changed", {});
      break;
    }

    case 'free_tech_node':
      state.freeTechPending = true;
      break;

    case 'stat_buff_single_unit':
      state.pendingStatBuff = { stat: card.effect.stat, value: card.effect.value };
      break;

    // free_building_upgrade is handled by HUD picker flow
  }

  gameEvents.emit("card:selected", { cardId: card.id });
  state.cardChoices = null;
}

/** Emit card:selected event and clear cardChoices without applying any effect.
 *  Used by the HUD picker flow after it has already applied the effect directly. */
export function finalizeCardSelection(state: GameState, cardId: string): void {
  gameEvents.emit("card:selected", { cardId });
  state.cardChoices = null;
}

/** Apply the pending single-unit stat buff to the chosen unit and clear the pending state. */
export function applyPendingStatBuff(state: GameState, unitId: string): void {
  const buff = state.pendingStatBuff;
  if (!buff) return;
  const unit = state.roster.get(unitId);
  if (!unit) return;
  (unit.stats as unknown as Record<string, number>)[buff.stat] += buff.value;
  if (buff.stat === 'maxHp') unit.stats.hp += buff.value;
  state.pendingStatBuff = null;
  gameEvents.emit('roster:changed', {});
}

function applyRelicEffect(state: GameState, relicId: string): void {
  const relic = RELICS.find((r) => r.id === relicId);
  if (!relic) return;

  switch (relic.effect.type) {
    case "unit_lives_bonus":
      for (const unit of state.roster.values()) {
        unit.lives += relic.effect.value;
        unit.maxLives += relic.effect.value;
      }
      break;
    case "gather_rate_bonus":
      state.gatherRateMultiplier *= relic.effect.multiplier;
      break;
    case "battle_width_bonus":
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
  if (res.planks) parts.push(`+${res.planks} Planks`);
  if (res.cut_stone) parts.push(`+${res.cut_stone} Cut Stone`);
  if (res.iron_bars) parts.push(`+${res.iron_bars} Iron Bars`);
  return parts.join(", ");
}

function formatModifiers(def: EquipmentDef): string {
  const parts: string[] = [];
  if (def.modifiers.attack) parts.push(`+${def.modifiers.attack} ATK`);
  if (def.modifiers.maxHp) parts.push(`+${def.modifiers.maxHp} HP`);
  if (def.modifiers.armor) parts.push(`+${def.modifiers.armor} ARM`);
  if (def.modifiers.glancingChance)
    parts.push(`+${Math.round(def.modifiers.glancingChance * 100)}% Glancing`);
  if (def.modifiers.cooldown)
    parts.push(
      `${def.modifiers.cooldown > 0 ? "+" : ""}${def.modifiers.cooldown}s CD`,
    );
  if (def.hpPercent) parts.push(`+${Math.round(def.hpPercent * 100)}% Max HP`);
  if (def.bonusLives) parts.push(`+${def.bonusLives} Life`);
  return parts.join(", ");
}
