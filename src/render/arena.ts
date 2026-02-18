import { Container, Graphics } from "pixi.js";
import type {
  WaveDef,
  GameState,
  HexCoord,
  BattleState,
} from "@/core/types";
import type {
  ArenaSnapshot,
  ArenaUnit,
  BattleEvent,
} from "@/simulation/battleLog";
import { ENEMY_DEFS } from "@/data/units";
import {
  INITIAL_BATTLE_WIDTH,
  INITIAL_ENEMY_WIDTH,
  ARENA_DEPTH,
  PLAYER_DEPLOY_ROWS,
  ENEMY_DEPLOY_ROWS,
} from "@/core/gameState";
import { hexCorners, hexKey, hex } from "@/hex/coords";

import type { ArenaContext, UnitSprite } from "./arenaTypes";
import {
  BATTLE_HEX_SIZE,
  HEX_COLOR_DEFAULT,
  HEX_COLOR_ENEMY,
  HEX_COLOR_PLAYER,
  HEX_STROKE,
  HEX_COLOR_REINFORCE_PLAYER,
  HEX_COLOR_REINFORCE_ENEMY,
} from "./arenaTypes";
import { createUnitSprite } from "./arenaSprites";
import {
  processEvents as processBattleEvents,
  updateBattleAnimations,
  showFinalState as showBattleFinalState,
} from "./arenaBattle";
import { DeploymentManager } from "./arenaDeployment";

// ── Arena Renderer ──

export class ArenaRenderer implements ArenaContext {
  container: Container;
  private bgLayer: Container;
  unitSprites: Map<string, UnitSprite> = new Map();
  effectsLayer: Container;
  unitsLayer: Container;
  private labelLayer: Container;
  hexLayer: Container;

  private _arenaWidth: number = 4;
  private _arenaDepth: number = 12;
  private visibleMaxRow: number = 12;
  private sfxThrottle: number = 0;
  sfxEnabled: boolean = true;

  private deployment: DeploymentManager;

  /** Callback when an enemy preview unit is clicked */
  onEnemyClick:
    | ((defId: string, screenX: number, screenY: number) => void)
    | null = null;

  /** Callback when a player preview unit is clicked */
  onPlayerUnitClick:
    | ((
        unitId: string,
        defId: string,
        screenX: number,
        screenY: number,
      ) => void)
    | null = null;

  /** Callback when player units are moved in the build-phase preview */
  onPreviewUnitMoved:
    | ((movedUnits: Array<{ unitId: string; newHex: HexCoord }>) => void)
    | null = null;

  /** Callback when a unit's zone changes via drag-and-drop (e.g. bench→active) */
  onPreviewZoneChanged:
    | ((changes: Array<{ unitId: string; toZone: 'active' | 'reinforcement' | 'bench'; hex?: HexCoord }>) => void)
    | null = null;

  /** Callback for arena hex hover tooltip */
  onArenaHexHover:
    | ((label: string | null, screenX: number, screenY: number) => void)
    | null = null;

  hexGraphics: Map<string, Graphics> = new Map();

  get arenaWidth(): number {
    return this._arenaWidth;
  }

  get arenaDepth(): number {
    return this._arenaDepth;
  }

  /** True while a unit is being dragged in preview mode */
  get isDragging(): boolean {
    return this.deployment.isDragging;
  }

  constructor() {
    this.container = new Container();
    this.bgLayer = new Container();
    this.hexLayer = new Container();
    this.unitsLayer = new Container();
    this.effectsLayer = new Container();
    this.labelLayer = new Container();
    this.container.addChild(this.bgLayer);
    this.container.addChild(this.hexLayer);
    this.container.addChild(this.unitsLayer);
    this.container.addChild(this.effectsLayer);
    this.container.addChild(this.labelLayer);

    this.deployment = new DeploymentManager(this);
  }

  // ── Coordinate Helpers ──

  hexToPixelLocal(coord: HexCoord): { x: number; y: number } {
    const size = BATTLE_HEX_SIZE;
    const colWidth = (size * 3) / 2;
    const rowHeight = size * Math.sqrt(3);
    const x = coord.q * colWidth;
    const y = coord.r * rowHeight + (coord.q & 1 ? rowHeight / 2 : 0);
    const cxQ = (this._arenaWidth - 1) / 2;
    const cxR = (this._arenaDepth - 1) / 2;
    const cx = cxQ * colWidth;
    const cy = cxR * rowHeight + (Math.round(cxQ) & 1 ? rowHeight / 2 : 0);
    return { x: x - cx, y: y - cy };
  }

  /** Get the zone name for a given arena row */
  getZoneLabel(row: number): string | null {
    if (row < 0) return 'Enemy Reinforcements';
    if (row < ENEMY_DEPLOY_ROWS) return 'Enemy Zone';
    if (row >= this._arenaDepth - PLAYER_DEPLOY_ROWS && row < this._arenaDepth) return 'Deploy Zone';
    if (row === this._arenaDepth) return 'Reinforcements';
    if (row > this._arenaDepth) return 'Bench';
    return null;
  }

  /** Convert a screen point to the nearest arena hex row (for tooltip) */
  screenToArenaRow(localX: number, localY: number): number | null {
    const size = BATTLE_HEX_SIZE;
    const rowHeight = size * Math.sqrt(3);
    const colWidth = (size * 3) / 2;
    const cxQ = (this._arenaWidth - 1) / 2;
    const cxR = (this._arenaDepth - 1) / 2;
    const cy = cxR * rowHeight + (Math.round(cxQ) & 1 ? rowHeight / 2 : 0);
    const r = Math.round((localY + cy) / rowHeight);
    if (r < -1 || r > this.visibleMaxRow) return null;
    return r;
  }

  // ── Battle Bounds (for camera) ──

  getBattleBounds(): { top: number; bottom: number; width: number } {
    const topLeft = this.hexToPixelLocal(hex(0, -1));
    const botRight = this.hexToPixelLocal(
      hex(this._arenaWidth - 1, this.visibleMaxRow),
    );
    const pad = BATTLE_HEX_SIZE * 1.5;
    return {
      top: topLeft.y - pad,
      bottom: botRight.y + pad,
      width: botRight.x - topLeft.x + pad * 2,
    };
  }

  // ── Hex Grid Drawing ──

  private drawHexGrid(): void {
    this.hexLayer.removeChildren();
    this.hexGraphics.clear();

    // Enemy reinforcement row (row -1)
    for (let q = 0; q < this._arenaWidth; q++) {
      const coord = hex(q, -1);
      const key = hexKey(coord);
      const pos = this.hexToPixelLocal(coord);
      const corners = hexCorners(pos, BATTLE_HEX_SIZE - 1);
      const gfx = new Graphics();
      gfx.poly(corners.flatMap((c) => [c.x, c.y]));
      gfx.fill({ color: HEX_COLOR_REINFORCE_ENEMY, alpha: 0.5 });
      gfx.stroke({ color: HEX_STROKE, width: 1, alpha: 0.4 });
      this.hexLayer.addChild(gfx);
      this.hexGraphics.set(key, gfx);
    }

    // Main arena grid
    for (let q = 0; q < this._arenaWidth; q++) {
      for (let r = 0; r < this._arenaDepth; r++) {
        const coord = hex(q, r);
        const key = hexKey(coord);
        const pos = this.hexToPixelLocal(coord);
        const corners = hexCorners(pos, BATTLE_HEX_SIZE - 1);

        let fillColor = HEX_COLOR_DEFAULT;
        if (r < ENEMY_DEPLOY_ROWS) fillColor = HEX_COLOR_ENEMY;
        else if (r >= this._arenaDepth - PLAYER_DEPLOY_ROWS)
          fillColor = HEX_COLOR_PLAYER;

        const gfx = new Graphics();
        gfx.poly(corners.flatMap((c) => [c.x, c.y]));
        gfx.fill({ color: fillColor, alpha: 0.85 });
        gfx.stroke({ color: HEX_STROKE, width: 1, alpha: 0.7 });

        this.hexLayer.addChild(gfx);
        this.hexGraphics.set(key, gfx);
      }
    }

    // Player reinforcement row (row arenaDepth)
    for (let q = 0; q < this._arenaWidth; q++) {
      const coord = hex(q, this._arenaDepth);
      const key = hexKey(coord);
      const pos = this.hexToPixelLocal(coord);
      const corners = hexCorners(pos, BATTLE_HEX_SIZE - 1);
      const gfx = new Graphics();
      gfx.poly(corners.flatMap((c) => [c.x, c.y]));
      gfx.fill({ color: HEX_COLOR_REINFORCE_PLAYER, alpha: 0.5 });
      gfx.stroke({ color: HEX_STROKE, width: 1, alpha: 0.4 });
      this.hexLayer.addChild(gfx);
      this.hexGraphics.set(key, gfx);
    }
  }

  /** Highlight a hex with a given color */
  setHexColor(
    coord: HexCoord,
    color: number,
    alpha: number = 0.85,
  ): void {
    const key = hexKey(coord);
    const gfx = this.hexGraphics.get(key);
    if (!gfx) return;
    const pos = this.hexToPixelLocal(coord);
    const corners = hexCorners(pos, BATTLE_HEX_SIZE - 1);
    gfx.clear();
    gfx.poly(corners.flatMap((c) => [c.x, c.y]));
    gfx.fill({ color, alpha });
    gfx.stroke({ color: HEX_STROKE, width: 1, alpha: 0.7 });
  }

  resetHexColor(coord: HexCoord): void {
    const { r } = coord;
    let fillColor = HEX_COLOR_DEFAULT;
    if (r < ENEMY_DEPLOY_ROWS) fillColor = HEX_COLOR_ENEMY;
    else if (r >= this._arenaDepth - PLAYER_DEPLOY_ROWS)
      fillColor = HEX_COLOR_PLAYER;
    this.setHexColor(coord, fillColor);
  }

  // ── Zone Labels ──

  private drawZoneLabels(): void {
    // No labels
  }

  // ── Wave Preview ──

  showWavePreview(wave: WaveDef, state?: GameState): void {
    this.clear();
    this._arenaWidth = state
      ? INITIAL_BATTLE_WIDTH + state.battleWidthBonus
      : INITIAL_BATTLE_WIDTH;
    this._arenaDepth = ARENA_DEPTH;
    this.visibleMaxRow = this._arenaDepth;

    this.drawHexGrid();
    this.drawZoneLabels();

    // Build enemy ArenaUnits
    const enemies: ArenaUnit[] = [];
    let idCounter = 0;
    for (const entry of wave.enemies) {
      const def = ENEMY_DEFS[entry.defId];
      if (!def) continue;
      for (let i = 0; i < entry.count; i++) {
        enemies.push({
          id: `preview_${idCounter++}`,
          defId: entry.defId,
          name: def.name,
          role: def.role,
          side: "enemy",
          stats: { ...def.baseStats },
          maxHp: def.baseStats.maxHp,
          lives: def.baseLives,
          maxLives: def.baseLives,
          isBoss: !!def.isBoss,
          moveSpeed: def.moveSpeed,
          attackRange: def.attackRange,
        });
      }
    }

    // Auto-place enemies in enemy zone
    const enemyWidth = INITIAL_ENEMY_WIDTH;
    const offset = Math.floor((this._arenaWidth - enemyWidth) / 2);
    let ei = 0;
    outer: for (let r = 0; r < ENEMY_DEPLOY_ROWS; r++) {
      for (let col = 0; col < enemyWidth; col++) {
        if (ei >= enemies.length) break outer;
        const q = offset + col;
        const pos = this.hexToPixelLocal(hex(q, r));
        createUnitSprite(this, enemies[ei++], pos.x, pos.y, 0.7, true);
      }
    }

    // Player preview (delegated to DeploymentManager)
    if (state) {
      this.deployment.layoutPlayerPreview(state);
      this.visibleMaxRow = this.deployment.visibleMaxRow;
    }
  }

  // ── Battle Setup ──

  setupBattle(snapshot: ArenaSnapshot): void {
    this.clear();
    this._arenaWidth = snapshot.arenaWidth;
    this._arenaDepth = snapshot.arenaDepth;

    this.drawHexGrid();
    this.drawZoneLabels();

    // Place all units at their starting hexes
    for (const { unit, hex: unitHex } of snapshot.unitPlacements) {
      const pos = this.hexToPixelLocal(unitHex);
      createUnitSprite(this, unit, pos.x, pos.y, 1, true);
    }

    // Create player reinforcement sprites in the reinforcement row
    snapshot.reinforcements.forEach((unit, idx) => {
      const q = idx % this._arenaWidth;
      const pos = this.hexToPixelLocal(hex(q, this._arenaDepth));
      createUnitSprite(this, unit, pos.x, pos.y, 0.4);
    });

    // Create enemy reinforcement sprites in the enemy reinforcement row
    snapshot.enemyReinforcements.forEach((unit, idx) => {
      const q = idx % this._arenaWidth;
      const pos = this.hexToPixelLocal(hex(q, -1));
      createUnitSprite(this, unit, pos.x, pos.y, 0.4);
    });
  }

  // ── Real-Time Battle Animation (delegates to arenaBattle.ts) ──

  processEvents(events: BattleEvent[]): void {
    processBattleEvents(this, events);
  }

  update(dt: number, battleState: BattleState): void {
    updateBattleAnimations(this, dt, battleState);
  }

  showFinalState(battleState: BattleState): void {
    showBattleFinalState(this, battleState, (coord) =>
      this.hexToPixelLocal(coord),
    );
  }

  // ── SFX ──

  playSfx(fn: () => void): void {
    if (!this.sfxEnabled) return;
    const now = performance.now();
    if (now - this.sfxThrottle < 50) return;
    this.sfxThrottle = now;
    fn();
  }

  // ── Cleanup ──

  clear(): void {
    this.deployment.clear();

    this.container.removeAllListeners();
    this.container.eventMode = "none";
    this.container.hitArea = null;

    this.unitSprites.clear();
    this.hexGraphics.clear();
    this.bgLayer.removeChildren();
    this.hexLayer.removeChildren();
    this.unitsLayer.removeChildren();
    this.effectsLayer.removeChildren();
    this.labelLayer.removeChildren();
  }
}
