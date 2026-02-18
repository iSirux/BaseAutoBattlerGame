import { Graphics, Rectangle } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import type { GameState, HexCoord } from "@/core/types";
import type { ArenaUnit } from "@/simulation/battleLog";
import { ALL_UNIT_DEFS } from "@/data/units";
import {
  PLAYER_DEPLOY_ROWS,
  getDefaultDeployment,
} from "@/core/gameState";
import { hexCorners, hexKey, hex } from "@/hex/coords";
import type { ArenaContext, UnitSprite } from "./arenaTypes";
import {
  BATTLE_HEX_SIZE,
  HEX_COLOR_SELECTED,
  HEX_COLOR_PLAYER,
  HEX_COLOR_PLAYER_HOVER,
  HEX_STROKE,
} from "./arenaTypes";
import { createUnitSprite } from "./arenaSprites";

export class DeploymentManager {
  private ctx: ArenaContext;

  /** Preview drag-and-drop state */
  private previewDrag: {
    placements: Map<string, HexCoord>;
    hexToUnit: Map<string, string>;
  } | null = null;

  /** Tracks pointerdown before drag threshold is exceeded */
  private pendingPreviewDrag: {
    unitId: string;
    sprite: UnitSprite;
    startX: number;
    startY: number;
    originalHex: HexCoord;
    isDragging: boolean;
  } | null = null;

  /** Unit currently being dragged */
  private draggingUnit: {
    id: string;
    sprite: UnitSprite;
    originalHex: HexCoord | null;
  } | null = null;

  /** Hex currently highlighted under the dragged unit */
  private hoveredDeployHex: HexCoord | null = null;

  /** Visible max row (updated during layout to include bench rows) */
  visibleMaxRow: number = 12;

  constructor(ctx: ArenaContext) {
    this.ctx = ctx;
  }

  get isDragging(): boolean {
    return this.draggingUnit !== null;
  }

  clear(): void {
    this.previewDrag = null;
    this.pendingPreviewDrag = null;
    this.draggingUnit = null;
    this.hoveredDeployHex = null;
  }

  // ── Player Preview Layout ──

  layoutPlayerPreview(state: GameState): void {
    const ctx = this.ctx;
    const defaultDeploy = getDefaultDeployment(state, ctx.arenaWidth);

    this.previewDrag = {
      placements: new Map(),
      hexToUnit: new Map(),
    };

    state.battleRoster.forEach((unitId) => {
      const unit = state.roster.get(unitId);
      if (!unit) return;
      const def = ALL_UNIT_DEFS[unit.defId];
      if (!def) return;

      const savedHex = state.savedDeployment.get(unitId);
      let placedHex =
        savedHex && this.isValidPlayerHex(savedHex)
          ? savedHex
          : defaultDeploy.placements.get(unitId);

      if (placedHex && this.previewDrag!.hexToUnit.has(hexKey(placedHex))) {
        placedHex = defaultDeploy.placements.get(unitId);
        if (
          placedHex &&
          this.previewDrag!.hexToUnit.has(hexKey(placedHex))
        ) {
          placedHex = this.findFreePlayerHex();
        }
      }
      if (!placedHex) return;

      const hk = hexKey(placedHex);
      this.previewDrag!.placements.set(unitId, placedHex);
      this.previewDrag!.hexToUnit.set(hk, unitId);
      ctx.setHexColor(placedHex, HEX_COLOR_SELECTED);

      const arenaUnit: ArenaUnit = {
        id: unitId,
        defId: unit.defId,
        name: def.name,
        role: def.role,
        side: "player",
        stats: { ...unit.stats },
        maxHp: unit.stats.maxHp,
        lives: unit.lives,
        maxLives: unit.maxLives,
        isBoss: false,
        moveSpeed: def.moveSpeed,
        attackRange: def.attackRange,
        equipment: {
          weapon: !!unit.equipment?.weapon,
          armor: !!unit.equipment?.armor,
          shield: !!unit.equipment?.shield,
        },
      };
      const pos = ctx.hexToPixelLocal(placedHex);
      const sprite = createUnitSprite(ctx, arenaUnit, pos.x, pos.y, 0.8, false);
      this.makePreviewDraggable(unitId, sprite);
    });

    this.setupPreviewDragEvents();

    // Show reinforcements in the reinforcement row behind player zone
    const reinforceRow = ctx.arenaDepth;
    state.reinforcements.forEach((unitId, q) => {
      if (q >= ctx.arenaWidth) return;
      const unit = state.roster.get(unitId);
      if (!unit) return;
      const def = ALL_UNIT_DEFS[unit.defId];
      if (!def) return;
      const arenaUnit: ArenaUnit = {
        id: unitId,
        defId: unit.defId,
        name: def.name,
        role: def.role,
        side: "player",
        stats: { ...unit.stats },
        maxHp: unit.stats.maxHp,
        lives: unit.lives,
        maxLives: unit.maxLives,
        isBoss: false,
        moveSpeed: def.moveSpeed,
        attackRange: def.attackRange,
        equipment: {
          weapon: !!unit.equipment?.weapon,
          armor: !!unit.equipment?.armor,
          shield: !!unit.equipment?.shield,
        },
      };
      const rHex = hex(q, reinforceRow);
      const pos = ctx.hexToPixelLocal(rHex);
      const rSprite = createUnitSprite(ctx, arenaUnit, pos.x, pos.y, 0.5, false);
      this.previewDrag!.placements.set(unitId, rHex);
      this.previewDrag!.hexToUnit.set(hexKey(rHex), unitId);
      this.makePreviewDraggable(unitId, rSprite);
    });

    // Show bench units in rows behind reinforcements
    const benchStartRow = ctx.arenaDepth + 1;
    const benchRows = state.bench.length > 0 ? Math.ceil(state.bench.length / ctx.arenaWidth) : 0;

    // Draw bench hex backgrounds
    for (let r = benchStartRow; r < benchStartRow + benchRows; r++) {
      for (let q = 0; q < ctx.arenaWidth; q++) {
        const coord = hex(q, r);
        const key = hexKey(coord);
        const pos = ctx.hexToPixelLocal(coord);
        const corners = hexCorners(pos, BATTLE_HEX_SIZE - 1);
        const gfx = new Graphics();
        gfx.poly(corners.flatMap((c: { x: number; y: number }) => [c.x, c.y]));
        gfx.fill({ color: 0x0f1a0f, alpha: 0.4 });
        gfx.stroke({ color: HEX_STROKE, width: 1, alpha: 0.3 });
        ctx.hexLayer.addChild(gfx);
        ctx.hexGraphics.set(key, gfx);
      }
    }

    // Place bench unit sprites
    state.bench.forEach((unitId, idx) => {
      const unit = state.roster.get(unitId);
      if (!unit) return;
      const def = ALL_UNIT_DEFS[unit.defId];
      if (!def) return;
      const benchQ = idx % ctx.arenaWidth;
      const benchR = benchStartRow + Math.floor(idx / ctx.arenaWidth);
      const arenaUnit: ArenaUnit = {
        id: unitId,
        defId: unit.defId,
        name: def.name,
        role: def.role,
        side: "player",
        stats: { ...unit.stats },
        maxHp: unit.stats.maxHp,
        lives: unit.lives,
        maxLives: unit.maxLives,
        isBoss: false,
        moveSpeed: def.moveSpeed,
        attackRange: def.attackRange,
        equipment: {
          weapon: !!unit.equipment?.weapon,
          armor: !!unit.equipment?.armor,
          shield: !!unit.equipment?.shield,
        },
      };
      const bHex = hex(benchQ, benchR);
      const pos = ctx.hexToPixelLocal(bHex);
      const bSprite = createUnitSprite(ctx, arenaUnit, pos.x, pos.y, 0.35, false);
      this.previewDrag!.placements.set(unitId, bHex);
      this.previewDrag!.hexToUnit.set(hexKey(bHex), unitId);
      this.makePreviewDraggable(unitId, bSprite);
    });

    // Update visibleMaxRow to include bench rows
    this.visibleMaxRow = benchRows > 0 ? benchStartRow + benchRows : benchStartRow - 1;
  }

  // ── Preview Drag and Drop ──

  private setupPreviewDragEvents(): void {
    const ctx = this.ctx;
    ctx.container.eventMode = "static";
    ctx.container.hitArea = new Rectangle(-8000, -8000, 16000, 16000);

    ctx.container.on("pointermove", (e: FederatedPointerEvent) => {
      const local = ctx.container.toLocal(e.global);

      // Zone hover tooltip (always active)
      if (!this.pendingPreviewDrag || !this.pendingPreviewDrag.isDragging) {
        const row = this.screenToArenaRow(local.x, local.y);
        const label = row !== null ? this.getZoneLabel(row) : null;
        ctx.onArenaHexHover?.(label, e.globalX, e.globalY);
      }

      if (!this.pendingPreviewDrag) return;

      if (!this.pendingPreviewDrag.isDragging) {
        const dx = e.globalX - this.pendingPreviewDrag.startX;
        const dy = e.globalY - this.pendingPreviewDrag.startY;
        if (dx * dx + dy * dy < 25) return;

        this.pendingPreviewDrag.isDragging = true;
        const { unitId, sprite, originalHex } = this.pendingPreviewDrag;

        if (this.previewDrag) {
          this.previewDrag.placements.delete(unitId);
          this.previewDrag.hexToUnit.delete(hexKey(originalHex));
          this.resetPreviewHexColor(originalHex);
        }

        this.draggingUnit = { id: unitId, sprite, originalHex };
        sprite.container.zIndex = 100;
        sprite.container.cursor = "grabbing";
      }

      if (this.draggingUnit) {
        this.draggingUnit.sprite.container.x = local.x;
        this.draggingUnit.sprite.container.y = local.y;

        const nearHex = this.findNearestPlayerHex(local.x, local.y);
        const nearKey = nearHex ? hexKey(nearHex) : null;
        const hoverKey = this.hoveredDeployHex
          ? hexKey(this.hoveredDeployHex)
          : null;
        if (nearKey !== hoverKey) {
          if (this.hoveredDeployHex)
            this.resetPreviewHexColor(this.hoveredDeployHex);
          if (nearHex) ctx.setHexColor(nearHex, HEX_COLOR_PLAYER_HOVER);
          this.hoveredDeployHex = nearHex;
        }
      }
    });

    ctx.container.on("pointerup", (e: FederatedPointerEvent) => {
      if (!this.pendingPreviewDrag) return;

      if (!this.pendingPreviewDrag.isDragging) {
        const { sprite } = this.pendingPreviewDrag;
        this.pendingPreviewDrag = null;
        const au = sprite.unit;
        ctx.onPlayerUnitClick?.(au.id, au.defId, e.globalX, e.globalY);
        return;
      }

      const local = ctx.container.toLocal(e.global);
      this.finalizePreviewDrop(local.x, local.y);
    });

    ctx.container.on("pointerupoutside", () => {
      if (!this.pendingPreviewDrag) return;
      if (this.pendingPreviewDrag.isDragging) {
        this.cancelPreviewDrop();
      }
      this.pendingPreviewDrag = null;
    });
  }

  private makePreviewDraggable(unitId: string, sprite: UnitSprite): void {
    sprite.container.eventMode = "static";
    sprite.container.cursor = "grab";

    sprite.container.on("pointerdown", (e: FederatedPointerEvent) => {
      if (!this.previewDrag) return;
      const originalHex = this.previewDrag.placements.get(unitId);
      if (!originalHex) return;

      this.pendingPreviewDrag = {
        unitId,
        sprite,
        startX: e.globalX,
        startY: e.globalY,
        originalHex,
        isDragging: false,
      };
      e.stopPropagation();
    });
  }

  private finalizePreviewDrop(localX: number, localY: number): void {
    if (!this.draggingUnit || !this.previewDrag) return;
    const ctx = this.ctx;
    const { id: unitId, sprite, originalHex } = this.draggingUnit;
    this.draggingUnit = null;
    this.pendingPreviewDrag = null;

    if (this.hoveredDeployHex) {
      this.resetPreviewHexColor(this.hoveredDeployHex);
      this.hoveredDeployHex = null;
    }

    sprite.container.zIndex = 0;
    sprite.container.cursor = "grab";

    const targetHex = this.findNearestPlayerHex(localX, localY);
    if (!targetHex) {
      this.snapBackPreview(unitId, sprite, originalHex);
      return;
    }

    const key = hexKey(targetHex);
    const occupantId = this.previewDrag.hexToUnit.get(key);
    const movedUnits: Array<{ unitId: string; newHex: HexCoord }> = [];

    if (occupantId && occupantId !== unitId) {
      this.previewDrag.hexToUnit.delete(key);
      this.previewDrag.placements.delete(occupantId);
      if (originalHex) {
        const origKey = hexKey(originalHex);
        this.previewDrag.placements.set(occupantId, originalHex);
        this.previewDrag.hexToUnit.set(origKey, occupantId);
        const occupantSprite = ctx.unitSprites.get(occupantId);
        if (occupantSprite) {
          const origPos = ctx.hexToPixelLocal(originalHex);
          occupantSprite.container.x = origPos.x;
          occupantSprite.container.y = origPos.y;
          occupantSprite.baseX = origPos.x;
          occupantSprite.baseY = origPos.y;
        }
        ctx.setHexColor(originalHex, HEX_COLOR_SELECTED);
        movedUnits.push({ unitId: occupantId, newHex: originalHex });
      }
    }

    this.previewDrag.placements.set(unitId, targetHex);
    this.previewDrag.hexToUnit.set(key, unitId);
    const pos = ctx.hexToPixelLocal(targetHex);
    sprite.container.x = pos.x;
    sprite.container.y = pos.y;
    sprite.baseX = pos.x;
    sprite.baseY = pos.y;
    ctx.setHexColor(targetHex, HEX_COLOR_SELECTED);
    movedUnits.push({ unitId, newHex: targetHex });

    ctx.onPreviewUnitMoved?.(movedUnits);

    // Detect zone changes
    const zoneChanges: Array<{ unitId: string; toZone: 'active' | 'reinforcement' | 'bench'; hex?: HexCoord }> = [];
    const draggedFromDeploy = originalHex ? this.isValidPlayerHex(originalHex) : false;
    const draggedToDeploy = this.isValidPlayerHex(targetHex);

    if (!draggedFromDeploy && draggedToDeploy) {
      zoneChanges.push({ unitId, toZone: 'active', hex: targetHex });
    }

    if (occupantId && occupantId !== unitId && originalHex) {
      const occupantNowInDeploy = this.isValidPlayerHex(originalHex);
      if (!occupantNowInDeploy) {
        const origRow = originalHex.r;
        const toZone = origRow === ctx.arenaDepth ? 'reinforcement' : 'bench';
        zoneChanges.push({ unitId: occupantId, toZone });
      }
    }

    if (zoneChanges.length > 0) {
      ctx.onPreviewZoneChanged?.(zoneChanges);
    }
  }

  private cancelPreviewDrop(): void {
    if (!this.draggingUnit) return;
    const { id, sprite, originalHex } = this.draggingUnit;
    this.draggingUnit = null;
    if (this.hoveredDeployHex) {
      this.resetPreviewHexColor(this.hoveredDeployHex);
      this.hoveredDeployHex = null;
    }
    sprite.container.zIndex = 0;
    sprite.container.cursor = "grab";
    this.snapBackPreview(id, sprite, originalHex);
  }

  private snapBackPreview(
    unitId: string,
    sprite: UnitSprite,
    originalHex: HexCoord | null,
  ): void {
    if (!this.previewDrag || !originalHex) return;
    const key = hexKey(originalHex);
    this.previewDrag.placements.set(unitId, originalHex);
    this.previewDrag.hexToUnit.set(key, unitId);
    const pos = this.ctx.hexToPixelLocal(originalHex);
    sprite.container.x = pos.x;
    sprite.container.y = pos.y;
    sprite.baseX = pos.x;
    sprite.baseY = pos.y;
    this.ctx.setHexColor(originalHex, HEX_COLOR_SELECTED);
  }

  private resetPreviewHexColor(coord: HexCoord): void {
    const occupied = this.previewDrag?.hexToUnit.has(hexKey(coord));
    this.ctx.setHexColor(coord, occupied ? HEX_COLOR_SELECTED : HEX_COLOR_PLAYER);
  }

  // ── Hex Helpers ──

  private isValidPlayerHex(coord: HexCoord): boolean {
    const { q, r } = coord;
    return (
      q >= 0 &&
      q < this.ctx.arenaWidth &&
      r >= this.ctx.arenaDepth - PLAYER_DEPLOY_ROWS &&
      r < this.ctx.arenaDepth
    );
  }

  private findNearestPlayerHex(
    localX: number,
    localY: number,
  ): HexCoord | null {
    const ctx = this.ctx;
    let best: HexCoord | null = null;
    let bestDist = Infinity;
    const rowStart = ctx.arenaDepth - PLAYER_DEPLOY_ROWS;
    for (let q = 0; q < ctx.arenaWidth; q++) {
      for (let r = rowStart; r < ctx.arenaDepth; r++) {
        const coord = hex(q, r);
        const pos = ctx.hexToPixelLocal(coord);
        const dx = localX - pos.x;
        const dy = localY - pos.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          best = coord;
        }
      }
    }
    const maxDist = BATTLE_HEX_SIZE * BATTLE_HEX_SIZE * 2.25;
    return bestDist <= maxDist ? best : null;
  }

  private findFreePlayerHex(): HexCoord | undefined {
    const ctx = this.ctx;
    const rowStart = ctx.arenaDepth - PLAYER_DEPLOY_ROWS;
    for (let r = ctx.arenaDepth - 1; r >= rowStart; r--) {
      for (let q = 0; q < ctx.arenaWidth; q++) {
        const coord = hex(q, r);
        if (!this.previewDrag!.hexToUnit.has(hexKey(coord))) return coord;
      }
    }
    return undefined;
  }

  // ── Zone helpers (duplicated from ArenaRenderer to avoid circular dep) ──

  private getZoneLabel(row: number): string | null {
    const ctx = this.ctx;
    if (row < 0) return 'Enemy Reinforcements';
    if (row < 4) return 'Enemy Zone'; // ENEMY_DEPLOY_ROWS
    if (row >= ctx.arenaDepth - PLAYER_DEPLOY_ROWS && row < ctx.arenaDepth) return 'Deploy Zone';
    if (row === ctx.arenaDepth) return 'Reinforcements';
    if (row > ctx.arenaDepth) return 'Bench';
    return null;
  }

  private screenToArenaRow(localX: number, localY: number): number | null {
    const ctx = this.ctx;
    const size = BATTLE_HEX_SIZE;
    const rowHeight = size * Math.sqrt(3);
    const colWidth = (size * 3) / 2;
    const cxQ = (ctx.arenaWidth - 1) / 2;
    const cxR = (ctx.arenaDepth - 1) / 2;
    const cy = cxR * rowHeight + (Math.round(cxQ) & 1 ? rowHeight / 2 : 0);
    const r = Math.round((localY + cy) / rowHeight);
    if (r < -1 || r > this.visibleMaxRow) return null;
    return r;
  }
}
