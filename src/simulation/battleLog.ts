import type { BattleState, BattleResult, Unit, UnitRole, HexCoord } from '@/core/types';
import { battleUpdate, TICK_DELTA } from './battle';
import { ALL_UNIT_DEFS, ENEMY_DEFS } from '@/data/units';

// ── Battle Event Types ──

export type BattleEvent =
  | { type: 'melee_attack'; attackerId: string; targetId: string; damage: number; targetHp: number; attackerSide: 'player' | 'enemy'; timerRemainder: number }
  | { type: 'ranged_attack'; attackerId: string; targetId: string; damage: number; targetHp: number; attackerSide: 'player' | 'enemy'; timerRemainder: number }
  | { type: 'unit_moved'; unitId: string; side: 'player' | 'enemy'; from: HexCoord; to: HexCoord }
  | { type: 'unit_died'; unitId: string; side: 'player' | 'enemy'; hex: HexCoord; livesRemaining: number }
  | { type: 'reinforcement'; unitId: string; side: 'player' | 'enemy'; hex: HexCoord }
  | { type: 'battle_end'; winner: 'player' | 'enemy' };

export type BattleEventSink = (event: BattleEvent) => void;

// ── Arena Display Types ──

export interface ArenaUnit {
  id: string;
  defId: string;
  name: string;
  role: UnitRole;
  side: 'player' | 'enemy';
  stats: { hp: number; maxHp: number; attack: number; cooldown: number };
  maxHp: number;
  lives: number;
  maxLives: number;
  isBoss: boolean;
  moveSpeed: number;
  attackRange: number;
  equipment?: { weapon?: boolean; armor?: boolean; shield?: boolean };
}

export interface ArenaSnapshot {
  arenaWidth: number;
  arenaDepth: number;
  /** All units placed on the arena at battle start, with their hex positions */
  unitPlacements: { unit: ArenaUnit; hex: HexCoord }[];
  /** Player units in the reinforcement queue (not yet on map) */
  reinforcements: ArenaUnit[];
  /** Enemy units in the reinforcement queue */
  enemyReinforcements: ArenaUnit[];
}

export interface BattleLog {
  initialState: ArenaSnapshot;
  events: BattleEvent[][];
  totalTicks: number;
}

// ── Snapshot Helpers ──

export function unitToArenaUnit(unit: Unit, side: 'player' | 'enemy'): ArenaUnit {
  const def = side === 'enemy' ? (ENEMY_DEFS[unit.defId] ?? ALL_UNIT_DEFS[unit.defId]) : ALL_UNIT_DEFS[unit.defId];
  return {
    id: unit.id,
    defId: unit.defId,
    name: def?.name ?? unit.defId,
    role: def?.role ?? 'melee',
    side,
    stats: { ...unit.stats },
    maxHp: unit.stats.maxHp,
    lives: unit.lives,
    maxLives: unit.maxLives,
    isBoss: !!(side === 'enemy' && ENEMY_DEFS[unit.defId]?.isBoss),
    moveSpeed: def?.moveSpeed ?? 2.0,
    attackRange: def?.attackRange ?? 1,
    equipment: {
      weapon: !!unit.equipment?.weapon,
      armor: !!unit.equipment?.armor,
      shield: !!unit.equipment?.shield,
    },
  };
}

export function captureSnapshot(state: BattleState): ArenaSnapshot {
  const unitPlacements: { unit: ArenaUnit; hex: HexCoord }[] = [];

  for (const [unitId, unitHex] of state.unitPositions) {
    const playerUnit = state.playerUnits.get(unitId);
    const enemyUnit = state.enemyUnits.get(unitId);
    if (playerUnit) {
      unitPlacements.push({ unit: unitToArenaUnit(playerUnit, 'player'), hex: unitHex });
    } else if (enemyUnit) {
      unitPlacements.push({ unit: unitToArenaUnit(enemyUnit, 'enemy'), hex: unitHex });
    }
  }

  return {
    arenaWidth: state.arenaWidth,
    arenaDepth: state.arenaDepth,
    unitPlacements,
    reinforcements: state.reinforcementQueue.map(u => unitToArenaUnit(u, 'player')),
    enemyReinforcements: state.enemyReinforcementQueue.map(u => unitToArenaUnit(u, 'enemy')),
  };
}

// ── Record Battle ──

/** Run a battle to completion while recording all events per tick */
export function recordBattle(battleState: BattleState): { result: BattleResult; log: BattleLog } {
  const initialState = captureSnapshot(battleState);
  const events: BattleEvent[][] = [];

  while (!battleState.result) {
    const tickEvents: BattleEvent[] = [];
    const sink: BattleEventSink = (event) => tickEvents.push(event);

    const continuing = battleUpdate(battleState, TICK_DELTA, sink);
    events.push(tickEvents);

    if (!continuing) break;
  }

  if (!battleState.result) {
    battleState.result = {
      winner: 'enemy',
      survivingEnemies: [],
      survivingAllies: [],
      bpEarned: 0,
    };
    events.push([{ type: 'battle_end', winner: 'enemy' }]);
  }

  return {
    result: battleState.result,
    log: {
      initialState,
      events,
      totalTicks: battleState.tick,
    },
  };
}
