import type { BattleState, BattleResult, Unit, UnitDef } from '@/core/types';
import { uid } from '@/core/utils';
import { UNIT_DEFS } from '@/data/units';
import { ENEMY_DEFS } from '@/data/units';
import type { WaveDef } from '@/core/types';

/** Create initial battle state from player roster and wave definition */
export function createBattleState(
  playerFrontline: Unit[],
  playerRanged: Unit[],
  reinforcements: Unit[],
  wave: WaveDef,
  battleWidth: number,
): BattleState {
  // Build enemy units from wave def
  const allEnemyDefs = { ...UNIT_DEFS, ...ENEMY_DEFS };
  const enemyMelee: Unit[] = [];
  const enemyRanged: Unit[] = [];

  for (const entry of wave.enemies) {
    const def = allEnemyDefs[entry.defId];
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

/** Advance the battle by one tick. Returns true if battle is still ongoing. */
export function battleTick(state: BattleState): boolean {
  if (state.result) return false;
  state.tick++;

  const extState = state as BattleState & { _enemyReinforcements?: Unit[] };

  // ── Combat: each unit attacks an opposing unit ──

  // Player frontline attacks enemy frontline
  for (let i = 0; i < state.battleWidth; i++) {
    const attacker = state.frontline[i];
    const defender = state.enemyFrontline[i];
    if (attacker && defender) {
      applyDamage(defender, attacker.stats.attack);
    }
    if (defender && attacker) {
      applyDamage(attacker, defender.stats.attack);
    }
  }

  // Player ranged attack random enemy frontline
  for (const archer of state.ranged) {
    const targets = state.enemyFrontline.filter((u): u is Unit => u !== null);
    if (targets.length > 0) {
      const target = targets[state.tick % targets.length];
      applyDamage(target, archer.stats.attack);
    }
  }

  // Enemy ranged attack random player frontline
  for (const archer of state.enemyRanged) {
    const targets = state.frontline.filter((u): u is Unit => u !== null);
    if (targets.length > 0) {
      const target = targets[state.tick % targets.length];
      applyDamage(target, archer.stats.attack);
    }
  }

  // ── Remove dead units, fill from reinforcements ──

  // Player side
  for (let i = 0; i < state.battleWidth; i++) {
    const unit = state.frontline[i];
    if (unit && unit.stats.hp <= 0) {
      unit.lives--;
      state.frontline[i] = null;
    }
  }
  fillFrontline(state.frontline, state.reinforcementQueue, state.battleWidth);

  // Enemy side
  for (let i = 0; i < state.battleWidth; i++) {
    const unit = state.enemyFrontline[i];
    if (unit && unit.stats.hp <= 0) {
      state.enemyFrontline[i] = null;
    }
  }
  fillFrontline(
    state.enemyFrontline,
    extState._enemyReinforcements ?? [],
    state.battleWidth,
  );

  // Remove dead ranged units
  state.ranged = state.ranged.filter((u) => u.stats.hp > 0);
  state.enemyRanged = state.enemyRanged.filter((u) => u.stats.hp > 0);

  // If no player frontline and ranged are exposed, enemies hit ranged
  const playerFrontAlive = state.frontline.some((u) => u !== null);
  if (!playerFrontAlive && state.ranged.length > 0) {
    // Ranged units become the frontline (exposed)
    for (let i = 0; i < Math.min(state.ranged.length, state.battleWidth); i++) {
      state.frontline[i] = state.ranged[i];
    }
    state.ranged = state.ranged.slice(state.battleWidth);
  }

  const enemyFrontAlive = state.enemyFrontline.some((u) => u !== null);
  if (!enemyFrontAlive && state.enemyRanged.length > 0) {
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
