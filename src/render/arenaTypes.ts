import type { Container, Graphics, Text } from "pixi.js";
import type { HexCoord, UnitRole } from "@/core/types";
import type { ArenaUnit } from "@/simulation/battleLog";

// ── Layout Constants ──

export const BATTLE_HEX_SIZE = 28;
export const UNIT_RADIUS = 13;
export const BOSS_RADIUS = 19;
export const HP_BAR_WIDTH = 26;
export const HP_BAR_HEIGHT = 5;
export const TEXT_RESOLUTION = 3;

// ── Zone Colors ──

export const HEX_COLOR_DEFAULT = 0x1a1a2e;
export const HEX_COLOR_ENEMY = 0x2e1a1a;
export const HEX_COLOR_PLAYER = 0x1a2e1a;
export const HEX_COLOR_PLAYER_HOVER = 0x2a4a2a;
export const HEX_COLOR_SELECTED = 0x3a6a3a;
export const HEX_STROKE = 0x3a3a5e;
export const HEX_COLOR_REINFORCE_PLAYER = 0x142214;
export const HEX_COLOR_REINFORCE_ENEMY = 0x221414;

// ── Unit Colors ──

const PLAYER_COLORS: Partial<Record<UnitRole, number>> = {
  fodder: 0x6688aa,
  melee: 0x4488cc,
  ranged: 0x44aa44,
  glass_cannon: 0x66ccff,
  tank: 0x6666cc,
  animal: 0x44aa88,
};

const ENEMY_COLORS: Partial<Record<UnitRole, number>> = {
  fodder: 0xaa6644,
  melee: 0xcc4444,
  ranged: 0xcc8844,
  glass_cannon: 0xcc6644,
  tank: 0xcc2222,
  animal: 0xcc6666,
};

const BOSS_COLOR = 0xccaa44;

export function getUnitColor(unit: ArenaUnit): number {
  if (unit.isBoss) return BOSS_COLOR;
  const map = unit.side === "player" ? PLAYER_COLORS : ENEMY_COLORS;
  return map[unit.role] ?? (unit.side === "player" ? 0x4488cc : 0xcc4444);
}

// ── Animation State Types ──

export interface MoveAnim {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  elapsed: number;
  duration: number;
}

export interface AttackAnim {
  type: "melee" | "ranged";
  targetId: string;
  damage: number;
  elapsed: number;
  impactAt: number;
  duration: number;
  impacted: boolean;
  projectile?: Graphics;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  lungeX?: number;
  lungeY?: number;
}

export interface DeathAnim {
  elapsed: number;
  duration: number;
  isFull: boolean;
  livesRemaining?: number;
}

export interface ReinforceAnim {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  elapsed: number;
  duration: number;
}

// ── Unit Sprite ──

export interface UnitSprite {
  container: Container;
  body: Graphics;
  hpBar: Graphics;
  hpBg: Graphics;
  nameLabel: Text;
  livesDots: Graphics;
  cooldownArc: Graphics;
  cooldownTimer: number;
  unit: ArenaUnit;
  currentHp: number;
  baseX: number;
  baseY: number;
  moveAnim?: MoveAnim;
  attackAnim?: AttackAnim;
  deathAnim?: DeathAnim;
  reinforceAnim?: ReinforceAnim;
}

// ── Arena Context (shared interface for extracted modules) ──

export interface ArenaContext {
  readonly arenaWidth: number;
  readonly arenaDepth: number;
  readonly unitSprites: Map<string, UnitSprite>;
  readonly hexGraphics: Map<string, Graphics>;
  readonly unitsLayer: Container;
  readonly effectsLayer: Container;
  readonly hexLayer: Container;
  readonly container: Container;
  sfxEnabled: boolean;

  hexToPixelLocal(coord: HexCoord): { x: number; y: number };
  setHexColor(coord: HexCoord, color: number, alpha?: number): void;
  resetHexColor(coord: HexCoord): void;
  playSfx(fn: () => void): void;

  // Callbacks
  onEnemyClick:
    | ((defId: string, screenX: number, screenY: number) => void)
    | null;
  onPlayerUnitClick:
    | ((
        unitId: string,
        defId: string,
        screenX: number,
        screenY: number,
      ) => void)
    | null;
  onPreviewUnitMoved:
    | ((movedUnits: Array<{ unitId: string; newHex: HexCoord }>) => void)
    | null;
  onPreviewZoneChanged:
    | ((changes: Array<{ unitId: string; toZone: 'active' | 'reinforcement' | 'bench'; hex?: HexCoord }>) => void)
    | null;
  onArenaHexHover:
    | ((label: string | null, screenX: number, screenY: number) => void)
    | null;
}
