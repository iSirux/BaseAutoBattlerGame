import type { BattleState, BattleResult, Unit, UnitRole, UnitStats } from '@/core/types';
import { battleTick } from './battle';
import { UNIT_DEFS, ENEMY_DEFS } from '@/data/units';

// ── Battle Event Types ──

export type BattleEvent =
  | { type: 'melee_attack'; attackerId: string; targetId: string; damage: number; targetHp: number; attackerSide: 'player' | 'enemy' }
  | { type: 'ranged_attack'; attackerId: string; targetId: string; damage: number; targetHp: number; attackerSide: 'player' | 'enemy' }
  | { type: 'unit_died'; unitId: string; side: 'player' | 'enemy'; slotIndex: number; livesRemaining: number }
  | { type: 'reinforcement'; unitId: string; side: 'player' | 'enemy'; slotIndex: number }
  | { type: 'ranged_exposed'; side: 'player' | 'enemy' }
  | { type: 'battle_end'; winner: 'player' | 'enemy' };

export type BattleEventSink = (event: BattleEvent) => void;

// ── Arena Display Types ──

export interface ArenaUnit {
  id: string;
  defId: string;
  name: string;
  role: UnitRole;
  side: 'player' | 'enemy';
  stats: UnitStats;
  maxHp: number;
  lives: number;
  maxLives: number;
  isBoss: boolean;
}

export interface ArenaSnapshot {
  playerFrontline: (ArenaUnit | null)[];
  playerRanged: ArenaUnit[];
  playerReinforcements: ArenaUnit[];
  enemyFrontline: (ArenaUnit | null)[];
  enemyRanged: ArenaUnit[];
  enemyReinforcements: ArenaUnit[];
  battleWidth: number;
}

export interface BattleLog {
  initialState: ArenaSnapshot;
  events: BattleEvent[][]; // events[tickIndex] = events for that tick
  totalTicks: number;
}

// ── Snapshot Helpers ──

const BOSS_DEF_IDS = new Set(['goblin_king', 'orc_warlord', 'troll_chieftain']);

function unitToArenaUnit(unit: Unit, side: 'player' | 'enemy'): ArenaUnit {
  const def = side === 'enemy' ? ENEMY_DEFS[unit.defId] : UNIT_DEFS[unit.defId];
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
    isBoss: BOSS_DEF_IDS.has(unit.defId),
  };
}

function captureSnapshot(state: BattleState): ArenaSnapshot {
  const extState = state as BattleState & { _enemyReinforcements?: Unit[] };

  return {
    playerFrontline: state.frontline.map(u => u ? unitToArenaUnit(u, 'player') : null),
    playerRanged: state.ranged.map(u => unitToArenaUnit(u, 'player')),
    playerReinforcements: state.reinforcementQueue.map(u => unitToArenaUnit(u, 'player')),
    enemyFrontline: state.enemyFrontline.map(u => u ? unitToArenaUnit(u, 'enemy') : null),
    enemyRanged: state.enemyRanged.map(u => unitToArenaUnit(u, 'enemy')),
    enemyReinforcements: (extState._enemyReinforcements ?? []).map(u => unitToArenaUnit(u, 'enemy')),
    battleWidth: state.battleWidth,
  };
}

// ── Record Battle ──

/** Run a battle to completion while recording all events per tick */
export function recordBattle(battleState: BattleState): { result: BattleResult; log: BattleLog } {
  const initialState = captureSnapshot(battleState);
  const events: BattleEvent[][] = [];

  const MAX_TICKS = 500;
  while (battleState.tick < MAX_TICKS) {
    const tickEvents: BattleEvent[] = [];
    const sink: BattleEventSink = (event) => tickEvents.push(event);

    const continuing = battleTick(battleState, sink);
    events.push(tickEvents);

    if (!continuing) break;
  }

  // Handle timeout
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
