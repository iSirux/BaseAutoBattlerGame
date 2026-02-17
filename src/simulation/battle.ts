import type { BattleState, BattleResult, Unit } from '@/core/types';
import { uid } from '@/core/utils';
import { ENEMY_DEFS } from '@/data/units';
import type { WaveDef } from '@/core/types';
import type { BattleEventSink } from './battleLog';

/** Create initial battle state from player roster and wave definition */
export function createBattleState(
  playerFrontline: Unit[],
  playerRanged: Unit[],
  reinforcements: Unit[],
  wave: WaveDef,
  battleWidth: number,
): BattleState {
  // Build enemy units from wave def
  const enemyMelee: Unit[] = [];
  const enemyRanged: Unit[] = [];

  for (const entry of wave.enemies) {
    const def = ENEMY_DEFS[entry.defId];
    if (!def) continue;
    for (let i = 0; i < entry.count; i++) {
      const unit: Unit = {
        id: uid('e'),
        defId: entry.defId,
        stats: { ...def.baseStats },
        lives: def.baseLives,
        maxLives: def.baseLives,
        equipment: {},
      };
      if (def.role === 'ranged') {
        enemyRanged.push(unit);
      } else {
        enemyMelee.push(unit);
      }
    }
  }

  // Fill frontline slots
  const frontline: (Unit | null)[] = new Array(battleWidth).fill(null);
  for (let i = 0; i < Math.min(playerFrontline.length, battleWidth); i++) {
    frontline[i] = playerFrontline[i];
  }

  const enemyFrontline: (Unit | null)[] = new Array(battleWidth).fill(null);
  for (let i = 0; i < Math.min(enemyMelee.length, battleWidth); i++) {
    enemyFrontline[i] = enemyMelee[i];
  }

  // Remaining enemy melee go to a virtual reinforcement queue
  const enemyReinforcements = enemyMelee.slice(battleWidth);

  return {
    frontline,
    ranged: [...playerRanged],
    reinforcementQueue: [
      ...playerFrontline.slice(battleWidth),
      ...reinforcements,
    ],
    enemyFrontline,
    enemyRanged,
    battleWidth,
    tick: 0,
    result: null,
    _enemyReinforcements: enemyReinforcements,
  } as BattleState & { _enemyReinforcements: Unit[] };
}

/** Get the attack interval for a unit based on its speed stat.
 *  Higher speed = lower interval = attacks more often.
 *  Speed 7 -> every tick, Speed 2 -> every 6th tick. */
function getAttackInterval(unit: Unit): number {
  return Math.max(1, 8 - unit.stats.speed);
}

/** Check if a unit should attack on this tick based on its speed */
function canAttackThisTick(unit: Unit, tick: number): boolean {
  return tick % getAttackInterval(unit) === 0;
}

/** Find a melee target: prefer the opposing slot, then scan outward for nearest enemy */
function findMeleeTarget(
  enemyLine: (Unit | null)[],
  slotIndex: number,
  width: number,
): Unit | null {
  // Prefer direct opponent
  if (enemyLine[slotIndex]) return enemyLine[slotIndex];
  // Scan outward from slot (left-right alternating)
  for (let offset = 1; offset < width; offset++) {
    const left = slotIndex - offset;
    const right = slotIndex + offset;
    if (left >= 0 && enemyLine[left]) return enemyLine[left];
    if (right < width && enemyLine[right]) return enemyLine[right];
  }
  return null;
}

/** Advance the battle by one tick. Returns true if battle is still ongoing. */
export function battleTick(state: BattleState, sink?: BattleEventSink): boolean {
  if (state.result) return false;
  state.tick++;

  const extState = state as BattleState & { _enemyReinforcements?: Unit[] };

  // ── Combat: units attack based on their speed stat ──

  // Player frontline attacks enemy frontline
  // Units prefer the enemy in their slot; if empty, retarget to nearest enemy
  for (let i = 0; i < state.battleWidth; i++) {
    const attacker = state.frontline[i];
    if (attacker && canAttackThisTick(attacker, state.tick)) {
      const target = findMeleeTarget(state.enemyFrontline, i, state.battleWidth);
      if (target) {
        applyDamage(target, attacker.stats.attack);
        sink?.({ type: 'melee_attack', attackerId: attacker.id, targetId: target.id, damage: attacker.stats.attack, targetHp: target.stats.hp, attackerSide: 'player' });
      }
    }
  }

  // Enemy frontline attacks player frontline
  for (let i = 0; i < state.battleWidth; i++) {
    const attacker = state.enemyFrontline[i];
    if (attacker && canAttackThisTick(attacker, state.tick)) {
      const target = findMeleeTarget(state.frontline, i, state.battleWidth);
      if (target) {
        applyDamage(target, attacker.stats.attack);
        sink?.({ type: 'melee_attack', attackerId: attacker.id, targetId: target.id, damage: attacker.stats.attack, targetHp: target.stats.hp, attackerSide: 'enemy' });
      }
    }
  }

  // Player ranged attack enemy frontline (speed-gated)
  for (const archer of state.ranged) {
    if (!canAttackThisTick(archer, state.tick)) continue;
    const targets = state.enemyFrontline.filter((u): u is Unit => u !== null);
    if (targets.length > 0) {
      const target = targets[state.tick % targets.length];
      applyDamage(target, archer.stats.attack);
      sink?.({ type: 'ranged_attack', attackerId: archer.id, targetId: target.id, damage: archer.stats.attack, targetHp: target.stats.hp, attackerSide: 'player' });
    }
  }

  // Enemy ranged attack player frontline (speed-gated)
  for (const archer of state.enemyRanged) {
    if (!canAttackThisTick(archer, state.tick)) continue;
    const targets = state.frontline.filter((u): u is Unit => u !== null);
    if (targets.length > 0) {
      const target = targets[state.tick % targets.length];
      applyDamage(target, archer.stats.attack);
      sink?.({ type: 'ranged_attack', attackerId: archer.id, targetId: target.id, damage: archer.stats.attack, targetHp: target.stats.hp, attackerSide: 'enemy' });
    }
  }

  // ── Remove dead units, fill from reinforcements ──

  // Player side
  for (let i = 0; i < state.battleWidth; i++) {
    const unit = state.frontline[i];
    if (unit && unit.stats.hp <= 0) {
      unit.lives--;
      sink?.({ type: 'unit_died', unitId: unit.id, side: 'player', slotIndex: i, livesRemaining: unit.lives });
      state.frontline[i] = null;
    }
  }

  // Track slots before fill to detect reinforcements
  const playerSlotsBefore = state.frontline.map(u => u?.id ?? null);
  fillFrontline(state.frontline, state.reinforcementQueue, state.battleWidth);
  if (sink) {
    for (let i = 0; i < state.battleWidth; i++) {
      const unit = state.frontline[i];
      if (unit && playerSlotsBefore[i] === null) {
        sink({ type: 'reinforcement', unitId: unit.id, side: 'player', slotIndex: i });
      }
    }
  }

  // Enemy side
  for (let i = 0; i < state.battleWidth; i++) {
    const unit = state.enemyFrontline[i];
    if (unit && unit.stats.hp <= 0) {
      sink?.({ type: 'unit_died', unitId: unit.id, side: 'enemy', slotIndex: i, livesRemaining: 0 });
      state.enemyFrontline[i] = null;
    }
  }

  const enemySlotsBefore = state.enemyFrontline.map(u => u?.id ?? null);
  fillFrontline(
    state.enemyFrontline,
    extState._enemyReinforcements ?? [],
    state.battleWidth,
  );
  if (sink) {
    for (let i = 0; i < state.battleWidth; i++) {
      const unit = state.enemyFrontline[i];
      if (unit && enemySlotsBefore[i] === null) {
        sink({ type: 'reinforcement', unitId: unit.id, side: 'enemy', slotIndex: i });
      }
    }
  }

  // Remove dead ranged units
  if (sink) {
    for (const u of state.ranged) {
      if (u.stats.hp <= 0) sink({ type: 'unit_died', unitId: u.id, side: 'player', slotIndex: -1, livesRemaining: u.lives - 1 });
    }
    for (const u of state.enemyRanged) {
      if (u.stats.hp <= 0) sink({ type: 'unit_died', unitId: u.id, side: 'enemy', slotIndex: -1, livesRemaining: 0 });
    }
  }
  state.ranged = state.ranged.filter((u) => u.stats.hp > 0);
  state.enemyRanged = state.enemyRanged.filter((u) => u.stats.hp > 0);

  // If no player frontline and ranged are exposed, enemies hit ranged
  const playerFrontAlive = state.frontline.some((u) => u !== null);
  if (!playerFrontAlive && state.ranged.length > 0) {
    sink?.({ type: 'ranged_exposed', side: 'player' });
    for (let i = 0; i < Math.min(state.ranged.length, state.battleWidth); i++) {
      state.frontline[i] = state.ranged[i];
    }
    state.ranged = state.ranged.slice(state.battleWidth);
  }

  const enemyFrontAlive = state.enemyFrontline.some((u) => u !== null);
  if (!enemyFrontAlive && state.enemyRanged.length > 0) {
    sink?.({ type: 'ranged_exposed', side: 'enemy' });
    for (let i = 0; i < Math.min(state.enemyRanged.length, state.battleWidth); i++) {
      state.enemyFrontline[i] = state.enemyRanged[i];
    }
    state.enemyRanged = state.enemyRanged.slice(state.battleWidth);
  }

  // ── Check win/loss ──
  const playerAlive =
    state.frontline.some((u) => u !== null) ||
    state.ranged.length > 0 ||
    state.reinforcementQueue.length > 0;

  const enemyAlive =
    state.enemyFrontline.some((u) => u !== null) ||
    state.enemyRanged.length > 0 ||
    (extState._enemyReinforcements?.length ?? 0) > 0;

  if (!playerAlive || !enemyAlive) {
    const winner = playerAlive ? 'player' : 'enemy';
    const survivingEnemies = [
      ...state.enemyFrontline.filter((u): u is Unit => u !== null),
      ...state.enemyRanged,
      ...(extState._enemyReinforcements ?? []),
    ];
    const survivingAllies = [
      ...state.frontline.filter((u): u is Unit => u !== null),
      ...state.ranged,
      ...state.reinforcementQueue,
    ];
    state.result = {
      winner,
      survivingEnemies,
      survivingAllies,
      bpEarned: 0, // Calculated externally
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
    // Timeout: enemy wins by default
    state.result = {
      winner: 'enemy',
      survivingEnemies: [],
      survivingAllies: [],
      bpEarned: 0,
    };
  }
  return state.result;
}

function applyDamage(target: Unit, damage: number): void {
  target.stats.hp = Math.max(0, target.stats.hp - damage);
}

function fillFrontline(
  frontline: (Unit | null)[],
  queue: Unit[],
  width: number,
): void {
  for (let i = 0; i < width; i++) {
    if (frontline[i] === null && queue.length > 0) {
      frontline[i] = queue.shift()!;
    }
  }
}
