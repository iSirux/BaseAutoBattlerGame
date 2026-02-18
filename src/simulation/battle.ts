import type { BattleState, BattleResult, Unit, HexCoord, UnitDeployment } from '@/core/types';
import { uid } from '@/core/utils';
import { ENEMY_DEFS, ALL_UNIT_DEFS } from '@/data/units';
import type { WaveDef } from '@/core/types';
import type { BattleEventSink } from './battleLog';
import { hex, hexKey, hexDistance, bfsNextStep } from '@/hex/coords';

/** Time delta per battle tick (seconds) */
export const TICK_DELTA = 0.1;

/** Number of rows in the battle arena (2 enemy + 5 neutral + 2 player) */
export const ARENA_DEPTH = 9;

/** Enemy deployment rows (top of arena) */
const ENEMY_DEPLOY_ROWS = 2;

/** Player deployment rows (bottom of arena) */
export const PLAYER_DEPLOY_ROWS = 2;

/** Build the set of all valid arena hexes */
function buildValidHexes(arenaWidth: number, arenaDepth: number): Set<string> {
  const valid = new Set<string>();
  for (let q = 0; q < arenaWidth; q++) {
    for (let r = 0; r < arenaDepth; r++) {
      valid.add(hexKey(hex(q, r)));
    }
  }
  return valid;
}

/** Auto-place enemy units in the enemy deployment zone (rows 0..ENEMY_DEPLOY_ROWS-1),
 *  centered within `enemyBattleWidth` columns of the arena. */
function autoPlaceEnemies(
  enemies: Unit[],
  arenaWidth: number,
  enemyBattleWidth: number,
  unitPositions: Map<string, HexCoord>,
  hexOccupants: Map<string, string>,
): Unit[] {
  const offset = Math.floor((arenaWidth - enemyBattleWidth) / 2);
  const queue: Unit[] = [];
  let idx = 0;

  for (let r = 0; r < ENEMY_DEPLOY_ROWS && idx < enemies.length; r++) {
    for (let col = 0; col < enemyBattleWidth && idx < enemies.length; col++) {
      const q = offset + col;
      const coord = hex(q, r);
      const key = hexKey(coord);
      if (!hexOccupants.has(key)) {
        const unit = enemies[idx++];
        unit.hex = coord;
        unitPositions.set(unit.id, coord);
        hexOccupants.set(key, unit.id);
      }
    }
  }

  // Remaining enemies go to reinforcement queue
  while (idx < enemies.length) {
    queue.push(enemies[idx++]);
  }
  return queue;
}

/** Create initial hex battle state from player units, enemy wave, and deployment choices. */
export function createHexBattleState(
  playerUnits: Unit[],
  enemyUnits: Unit[],
  deployment: UnitDeployment,
  battleWidth: number,
  enemyBattleWidth: number,
): BattleState {
  const arenaWidth = battleWidth;
  const arenaDepth = ARENA_DEPTH;

  const unitPositions = new Map<string, HexCoord>();
  const hexOccupants = new Map<string, string>();
  const playerUnitsMap = new Map<string, Unit>();
  const enemyUnitsMap = new Map<string, Unit>();
  const reinforcementQueue: Unit[] = [];
  const enemyReinforcementQueue: Unit[] = [];

  // Reset timers for all units
  for (const unit of [...playerUnits, ...enemyUnits]) {
    unit.cooldownTimer = 0;
    unit.moveTimer = 0;
    unit.hex = undefined;
  }

  // Place player units according to deployment
  const placedPlayerIds = new Set<string>();
  for (const unit of playerUnits) {
    const chosenHex = deployment.placements.get(unit.id);
    if (chosenHex) {
      const key = hexKey(chosenHex);
      if (!hexOccupants.has(key)) {
        unit.hex = chosenHex;
        unitPositions.set(unit.id, chosenHex);
        hexOccupants.set(key, unit.id);
        playerUnitsMap.set(unit.id, unit);
        placedPlayerIds.add(unit.id);
      } else {
        reinforcementQueue.push(unit);
      }
    } else {
      reinforcementQueue.push(unit);
    }
  }

  // Auto-place enemies
  const enemyReinforcements = autoPlaceEnemies(
    enemyUnits, arenaWidth, enemyBattleWidth, unitPositions, hexOccupants,
  );
  for (const unit of enemyUnits) {
    if (unit.hex) {
      enemyUnitsMap.set(unit.id, unit);
    }
  }
  for (const unit of enemyReinforcements) {
    enemyReinforcementQueue.push(unit);
  }

  return {
    arenaWidth,
    arenaDepth,
    unitPositions,
    hexOccupants,
    playerUnits: playerUnitsMap,
    enemyUnits: enemyUnitsMap,
    reinforcementQueue,
    enemyReinforcementQueue,
    tick: 0,
    result: null,
  };
}

/** Get the moveSpeed for a unit (from its def) */
function getMoveSpeed(unit: Unit): number {
  const def = ALL_UNIT_DEFS[unit.defId] ?? ENEMY_DEFS[unit.defId];
  return def?.moveSpeed ?? 2.0;
}

/** Get the attackRange for a unit (from its def) */
function getAttackRange(unit: Unit): number {
  const def = ALL_UNIT_DEFS[unit.defId] ?? ENEMY_DEFS[unit.defId];
  return def?.attackRange ?? 1;
}

/** Find the nearest enemy unit and return it with its hex distance */
function findNearestEnemy(
  unitHex: HexCoord,
  enemies: Map<string, Unit>,
  unitPositions: Map<string, HexCoord>,
): { unit: Unit; hex: HexCoord; dist: number } | null {
  let best: { unit: Unit; hex: HexCoord; dist: number } | null = null;
  for (const [id, enemy] of enemies) {
    const eHex = unitPositions.get(id);
    if (!eHex) continue;
    const dist = hexDistance(unitHex, eHex);
    if (!best || dist < best.dist) {
      best = { unit: enemy, hex: eHex, dist };
    }
  }
  return best;
}

/** Find the closest enemy within attack range */
function findTargetInRange(
  unitHex: HexCoord,
  range: number,
  enemies: Map<string, Unit>,
  unitPositions: Map<string, HexCoord>,
): Unit | null {
  let best: { unit: Unit; dist: number } | null = null;
  for (const [id, enemy] of enemies) {
    const eHex = unitPositions.get(id);
    if (!eHex) continue;
    const dist = hexDistance(unitHex, eHex);
    if (dist <= range && (!best || dist < best.dist)) {
      best = { unit: enemy, dist };
    }
  }
  return best?.unit ?? null;
}

/** Apply damage to a unit */
function applyDamage(target: Unit, damage: number): void {
  target.stats.hp = Math.max(0, target.stats.hp - damage);
}

/** Remove a unit from the arena maps */
function removeUnit(
  unitId: string,
  unitPositions: Map<string, HexCoord>,
  hexOccupants: Map<string, string>,
  unitsMap: Map<string, Unit>,
): void {
  const pos = unitPositions.get(unitId);
  if (pos) {
    hexOccupants.delete(hexKey(pos));
    unitPositions.delete(unitId);
  }
  unitsMap.delete(unitId);
}

/** Advance the battle by one tick. Returns true if battle is still ongoing. */
export function battleTick(state: BattleState, sink?: BattleEventSink): boolean {
  if (state.result) return false;
  state.tick++;

  const validHexes = buildValidHexes(state.arenaWidth, state.arenaDepth);

  // ── Movement Phase ──
  // Process all units (player + enemy), skip if enemy is in attack range

  const processMovement = (
    units: Map<string, Unit>,
    enemies: Map<string, Unit>,
    side: 'player' | 'enemy',
  ) => {
    for (const [unitId, unit] of units) {
      const unitHex = state.unitPositions.get(unitId);
      if (!unitHex) continue;

      const range = getAttackRange(unit);
      const nearest = findNearestEnemy(unitHex, enemies, state.unitPositions);
      if (!nearest) continue;

      // Skip movement if enemy is within attack range
      if (nearest.dist <= range) continue;

      // Advance move timer
      unit.moveTimer += TICK_DELTA;
      const moveInterval = 1 / getMoveSpeed(unit);
      if (unit.moveTimer < moveInterval) continue;
      unit.moveTimer = 0;

      // Build blocked set: all occupied hexes except this unit
      const blocked = new Set<string>();
      for (const [key, occupantId] of state.hexOccupants) {
        if (occupantId !== unitId) blocked.add(key);
      }

      // BFS toward nearest enemy
      const nextHex = bfsNextStep(unitHex, nearest.hex, blocked, validHexes);
      if (!nextHex) continue;

      // Move if the next hex is unoccupied
      const nextKey = hexKey(nextHex);
      if (state.hexOccupants.has(nextKey)) continue;

      // Update position
      state.hexOccupants.delete(hexKey(unitHex));
      state.hexOccupants.set(nextKey, unitId);
      state.unitPositions.set(unitId, nextHex);
      unit.hex = nextHex;

      sink?.({ type: 'unit_moved', unitId, side, from: unitHex, to: nextHex });
    }
  };

  processMovement(state.playerUnits, state.enemyUnits, 'player');
  processMovement(state.enemyUnits, state.playerUnits, 'enemy');

  // ── Attack Phase ──

  const processAttacks = (
    units: Map<string, Unit>,
    enemies: Map<string, Unit>,
    side: 'player' | 'enemy',
  ) => {
    for (const [unitId, unit] of units) {
      const unitHex = state.unitPositions.get(unitId);
      if (!unitHex) continue;

      unit.cooldownTimer += TICK_DELTA;
      if (unit.cooldownTimer < unit.stats.cooldown) continue;

      const range = getAttackRange(unit);
      const target = findTargetInRange(unitHex, range, enemies, state.unitPositions);
      if (!target) continue;

      unit.cooldownTimer -= unit.stats.cooldown;
      applyDamage(target, unit.stats.attack);

      const attackType = range > 1 ? 'ranged_attack' : 'melee_attack';
      sink?.({
        type: attackType,
        attackerId: unitId,
        targetId: target.id,
        damage: unit.stats.attack,
        targetHp: target.stats.hp,
        attackerSide: side,
      });
    }
  };

  processAttacks(state.playerUnits, state.enemyUnits, 'player');
  processAttacks(state.enemyUnits, state.playerUnits, 'enemy');

  // ── Death Phase ──

  const processDeath = (
    units: Map<string, Unit>,
    side: 'player' | 'enemy',
  ) => {
    const dead: string[] = [];
    for (const [unitId, unit] of units) {
      if (unit.stats.hp <= 0) dead.push(unitId);
    }
    for (const unitId of dead) {
      const unit = units.get(unitId)!;
      const unitHex = state.unitPositions.get(unitId)!;
      unit.lives--;
      sink?.({ type: 'unit_died', unitId, side, hex: unitHex, livesRemaining: unit.lives });
      if (unit.lives <= 0) {
        removeUnit(unitId, state.unitPositions, state.hexOccupants, units);
      } else {
        unit.stats.hp = unit.stats.maxHp;
      }
    }
  };

  processDeath(state.playerUnits, 'player');
  processDeath(state.enemyUnits, 'enemy');

  // ── Reinforcement Phase ──

  const spawnReinforcement = (
    queue: Unit[],
    unitsMap: Map<string, Unit>,
    side: 'player' | 'enemy',
  ) => {
    if (queue.length === 0) return;

    // Spawn hex: center of rear row for player, center of front row for enemy
    const spawnQ = Math.floor(state.arenaWidth / 2);
    const spawnR = side === 'player' ? state.arenaDepth - 1 : 0;
    const spawnCoord = hex(spawnQ, spawnR);
    const spawnKey = hexKey(spawnCoord);

    if (state.hexOccupants.has(spawnKey)) return;

    const unit = queue.shift()!;
    unit.cooldownTimer = 0;
    unit.moveTimer = 0;
    unit.hex = spawnCoord;
    state.unitPositions.set(unit.id, spawnCoord);
    state.hexOccupants.set(spawnKey, unit.id);
    unitsMap.set(unit.id, unit);

    sink?.({ type: 'reinforcement', unitId: unit.id, side, hex: spawnCoord });
  };

  spawnReinforcement(state.reinforcementQueue, state.playerUnits, 'player');
  spawnReinforcement(state.enemyReinforcementQueue, state.enemyUnits, 'enemy');

  // ── Win Check ──

  const playerAlive = state.playerUnits.size > 0 || state.reinforcementQueue.length > 0;
  const enemyAlive = state.enemyUnits.size > 0 || state.enemyReinforcementQueue.length > 0;

  if (!playerAlive || !enemyAlive) {
    const winner = playerAlive ? 'player' : 'enemy';
    const survivingEnemies = [...state.enemyUnits.values()];
    const survivingAllies = [...state.playerUnits.values(), ...state.reinforcementQueue];
    state.result = {
      winner,
      survivingEnemies,
      survivingAllies,
      bpEarned: 0,
    };
    sink?.({ type: 'battle_end', winner });
    return false;
  }

  return true;
}

/** Run the entire battle to completion */
export function runBattle(state: BattleState): BattleResult {
  const MAX_TICKS = 500;
  while (battleTick(state) && state.tick < MAX_TICKS) {
    // continue
  }
  if (!state.result) {
    state.result = {
      winner: 'enemy',
      survivingEnemies: [],
      survivingAllies: [],
      bpEarned: 0,
    };
  }
  return state.result;
}

/** Instantiate enemy units from a wave definition, applying any modifier */
export function createEnemyUnits(wave: WaveDef): Unit[] {
  const enemies: Unit[] = [];
  for (const entry of wave.enemies) {
    const def = ENEMY_DEFS[entry.defId];
    if (!def) continue;
    for (let i = 0; i < entry.count; i++) {
      const unit: Unit = {
        id: uid('e'),
        defId: entry.defId,
        stats: { ...def.baseStats },
        cooldownTimer: 0,
        moveTimer: 0,
        lives: def.baseLives,
        maxLives: def.baseLives,
        equipment: {},
      };
      enemies.push(unit);
    }
  }

  // Apply wave modifier
  if (wave.modifier) {
    for (const unit of enemies) {
      for (const [stat, value] of Object.entries(wave.modifier.statChanges)) {
        if (value !== undefined && stat in unit.stats) {
          (unit.stats as unknown as Record<string, number>)[stat] += value;
        }
      }
    }
  }

  return enemies;
}
