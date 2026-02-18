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
  enemyBattleWidth: number,
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
        cooldownTimer: 0,
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

  // Apply wave modifier to all enemies
  if (wave.modifier) {
    const allEnemies = [...enemyMelee, ...enemyRanged];
    for (const unit of allEnemies) {
      for (const [stat, value] of Object.entries(wave.modifier.statChanges)) {
        if (value !== undefined && stat in unit.stats) {
          (unit.stats as unknown as Record<string, number>)[stat] += value;
        }
      }
    }
  }

  // Reset cooldown timers for all units entering battle
  const allPlayerUnits = [...playerFrontline, ...playerRanged, ...reinforcements];
  for (const unit of allPlayerUnits) {
    unit.cooldownTimer = 0;
  }
  const allEnemyUnits = [...enemyMelee, ...enemyRanged];
  for (const unit of allEnemyUnits) {
    unit.cooldownTimer = 0;
  }

  // Fill frontline slots
  const frontline: (Unit | null)[] = new Array(battleWidth).fill(null);
  for (let i = 0; i < Math.min(playerFrontline.length, battleWidth); i++) {
    frontline[i] = playerFrontline[i];
  }

  const enemyFrontline: (Unit | null)[] = new Array(enemyBattleWidth).fill(null);
  for (let i = 0; i < Math.min(enemyMelee.length, enemyBattleWidth); i++) {
    enemyFrontline[i] = enemyMelee[i];
  }

  // Remaining enemy melee go to a virtual reinforcement queue
  const enemyReinforcements = enemyMelee.slice(enemyBattleWidth);

  // Fill ranged slots (same width as frontline)
  const rangedSlots: (Unit | null)[] = new Array(battleWidth).fill(null);
  for (let i = 0; i < Math.min(playerRanged.length, battleWidth); i++) {
    rangedSlots[i] = playerRanged[i];
  }

  const enemyRangedSlots: (Unit | null)[] = new Array(enemyBattleWidth).fill(null);
  for (let i = 0; i < Math.min(enemyRanged.length, enemyBattleWidth); i++) {
    enemyRangedSlots[i] = enemyRanged[i];
  }

  const reinforcementQueue = [
    ...playerFrontline.slice(battleWidth),
    ...reinforcements,
  ];

  // Pre-fill empty frontline slots from the reinforcement queue
  fillFrontline(frontline, reinforcementQueue, battleWidth);
  fillFrontline(enemyFrontline, enemyReinforcements, enemyBattleWidth);

  return {
    frontline,
    ranged: rangedSlots,
    reinforcementQueue,
    enemyFrontline,
    enemyRanged: enemyRangedSlots,
    battleWidth,
    enemyBattleWidth,
    tick: 0,
    result: null,
    _enemyReinforcements: enemyReinforcements,
  } as BattleState & { _enemyReinforcements: Unit[] };
}

/** Time delta per battle tick (seconds) */
const TICK_DELTA = 0.1;

/** Advance a unit's cooldown timer, returns true if the unit should attack this tick */
function advanceCooldown(unit: Unit): boolean {
  unit.cooldownTimer += TICK_DELTA;
  if (unit.cooldownTimer >= unit.stats.cooldown) {
    unit.cooldownTimer -= unit.stats.cooldown;
    return true;
  }
  return false;
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

  // ── Combat: units attack based on their cooldown timer ──

  // Player frontline attacks enemy frontline
  // Units prefer the enemy in their slot; if empty, retarget to nearest enemy
  for (let i = 0; i < state.battleWidth; i++) {
    const attacker = state.frontline[i];
    if (attacker && advanceCooldown(attacker)) {
      const target = findMeleeTarget(state.enemyFrontline, i, state.enemyBattleWidth);
      if (target) {
        applyDamage(target, attacker.stats.attack);
        sink?.({ type: 'melee_attack', attackerId: attacker.id, targetId: target.id, damage: attacker.stats.attack, targetHp: target.stats.hp, attackerSide: 'player' });
      }
    }
  }

  // Enemy frontline attacks player frontline
  for (let i = 0; i < state.enemyBattleWidth; i++) {
    const attacker = state.enemyFrontline[i];
    if (attacker && advanceCooldown(attacker)) {
      const target = findMeleeTarget(state.frontline, i, state.battleWidth);
      if (target) {
        applyDamage(target, attacker.stats.attack);
        sink?.({ type: 'melee_attack', attackerId: attacker.id, targetId: target.id, damage: attacker.stats.attack, targetHp: target.stats.hp, attackerSide: 'enemy' });
      }
    }
  }

  // Player ranged attack enemy frontline (cooldown-gated, target closest to slot)
  for (let i = 0; i < state.battleWidth; i++) {
    const archer = state.ranged[i];
    if (!archer || !advanceCooldown(archer)) continue;
    const target = findMeleeTarget(state.enemyFrontline, i, state.enemyBattleWidth);
    if (target) {
      applyDamage(target, archer.stats.attack);
      sink?.({ type: 'ranged_attack', attackerId: archer.id, targetId: target.id, damage: archer.stats.attack, targetHp: target.stats.hp, attackerSide: 'player' });
    }
  }

  // Enemy ranged attack player frontline (cooldown-gated, target closest to slot)
  for (let i = 0; i < state.enemyBattleWidth; i++) {
    const archer = state.enemyRanged[i];
    if (!archer || !advanceCooldown(archer)) continue;
    const target = findMeleeTarget(state.frontline, i, state.battleWidth);
    if (target) {
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
      if (unit.lives <= 0) {
        state.frontline[i] = null;
      } else {
        unit.stats.hp = unit.stats.maxHp;
      }
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
  for (let i = 0; i < state.enemyBattleWidth; i++) {
    const unit = state.enemyFrontline[i];
    if (unit && unit.stats.hp <= 0) {
      unit.lives--;
      sink?.({ type: 'unit_died', unitId: unit.id, side: 'enemy', slotIndex: i, livesRemaining: unit.lives });
      if (unit.lives <= 0) {
        state.enemyFrontline[i] = null;
      } else {
        unit.stats.hp = unit.stats.maxHp;
      }
    }
  }

  const enemySlotsBefore = state.enemyFrontline.map(u => u?.id ?? null);
  fillFrontline(
    state.enemyFrontline,
    extState._enemyReinforcements ?? [],
    state.enemyBattleWidth,
  );
  if (sink) {
    for (let i = 0; i < state.enemyBattleWidth; i++) {
      const unit = state.enemyFrontline[i];
      if (unit && enemySlotsBefore[i] === null) {
        sink({ type: 'reinforcement', unitId: unit.id, side: 'enemy', slotIndex: i });
      }
    }
  }

  // Remove dead ranged units (handle multi-life)
  for (let i = 0; i < state.battleWidth; i++) {
    const u = state.ranged[i];
    if (u && u.stats.hp <= 0) {
      u.lives--;
      sink?.({ type: 'unit_died', unitId: u.id, side: 'player', slotIndex: i, livesRemaining: u.lives });
      if (u.lives <= 0) {
        state.ranged[i] = null;
      } else {
        u.stats.hp = u.stats.maxHp;
      }
    }
  }
  for (let i = 0; i < state.enemyBattleWidth; i++) {
    const u = state.enemyRanged[i];
    if (u && u.stats.hp <= 0) {
      u.lives--;
      sink?.({ type: 'unit_died', unitId: u.id, side: 'enemy', slotIndex: i, livesRemaining: u.lives });
      if (u.lives <= 0) {
        state.enemyRanged[i] = null;
      } else {
        u.stats.hp = u.stats.maxHp;
      }
    }
  }

  // If no player frontline and ranged are exposed, enemies hit ranged
  const playerFrontAlive = state.frontline.some((u) => u !== null);
  const playerRangedAlive = state.ranged.some((u) => u !== null);
  if (!playerFrontAlive && playerRangedAlive) {
    sink?.({ type: 'ranged_exposed', side: 'player' });
    for (let i = 0; i < state.battleWidth; i++) {
      if (state.ranged[i]) {
        state.frontline[i] = state.ranged[i];
        state.ranged[i] = null;
      }
    }
  }

  const enemyFrontAlive = state.enemyFrontline.some((u) => u !== null);
  const enemyRangedAlive = state.enemyRanged.some((u) => u !== null);
  if (!enemyFrontAlive && enemyRangedAlive) {
    sink?.({ type: 'ranged_exposed', side: 'enemy' });
    for (let i = 0; i < state.enemyBattleWidth; i++) {
      if (state.enemyRanged[i]) {
        state.enemyFrontline[i] = state.enemyRanged[i];
        state.enemyRanged[i] = null;
      }
    }
  }

  // ── Check win/loss ──
  const playerAlive =
    state.frontline.some((u) => u !== null) ||
    state.ranged.some((u) => u !== null) ||
    state.reinforcementQueue.length > 0;

  const enemyAlive =
    state.enemyFrontline.some((u) => u !== null) ||
    state.enemyRanged.some((u) => u !== null) ||
    (extState._enemyReinforcements?.length ?? 0) > 0;

  if (!playerAlive || !enemyAlive) {
    const winner = playerAlive ? 'player' : 'enemy';
    const survivingEnemies = [
      ...state.enemyFrontline.filter((u): u is Unit => u !== null),
      ...state.enemyRanged.filter((u): u is Unit => u !== null),
      ...(extState._enemyReinforcements ?? []),
    ];
    const survivingAllies = [
      ...state.frontline.filter((u): u is Unit => u !== null),
      ...state.ranged.filter((u): u is Unit => u !== null),
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
      const unit = queue.shift()!;
      unit.cooldownTimer = 0;
      frontline[i] = unit;
    }
  }
}
