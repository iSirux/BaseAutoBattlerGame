import { Container, Graphics, Text, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import type { WaveDef, UnitRole, GameState, HexCoord, UnitDeployment } from '@/core/types';
import type { ArenaSnapshot, ArenaUnit, BattleEvent } from '@/simulation/battleLog';
import { ENEMY_DEFS, ALL_UNIT_DEFS } from '@/data/units';
import { INITIAL_BATTLE_WIDTH, INITIAL_ENEMY_WIDTH, ARENA_DEPTH, PLAYER_DEPLOY_ROWS, getDefaultDeployment } from '@/core/gameState';
import { SFX } from '@/audio/sfx';
import { hexToPixel, hexCorners, hexKey, hex } from '@/hex/coords';

// ── Layout Constants ──

const BATTLE_HEX_SIZE = 28;
const UNIT_RADIUS = 13;
const BOSS_RADIUS = 19;
const HP_BAR_WIDTH = 26;
const HP_BAR_HEIGHT = 5;
const TEXT_RESOLUTION = 3;

// ── Zone Colors ──

const HEX_COLOR_DEFAULT = 0x1a1a2e;
const HEX_COLOR_ENEMY = 0x2e1a1a;
const HEX_COLOR_PLAYER = 0x1a2e1a;
const HEX_COLOR_PLAYER_HOVER = 0x2a4a2a;
const HEX_COLOR_SELECTED = 0x3a6a3a;
const HEX_STROKE = 0x3a3a5e;

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

function getUnitColor(unit: ArenaUnit): number {
  if (unit.isBoss) return BOSS_COLOR;
  const map = unit.side === 'player' ? PLAYER_COLORS : ENEMY_COLORS;
  return map[unit.role] ?? (unit.side === 'player' ? 0x4488cc : 0xcc4444);
}

// ── Unit Sprite ──

interface UnitSprite {
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
}

// ── Deployment State ──

interface DeploymentState {
  units: ArenaUnit[];
  placements: Map<string, HexCoord>;   // unitId → placed hex
  hexToUnit: Map<string, string>;       // hexKey → unitId
  arenaWidth: number;
  panel: HTMLElement;
}

// ── Arena Renderer ──

export class ArenaRenderer {
  container: Container;
  private bgLayer: Container;
  private unitSprites: Map<string, UnitSprite> = new Map();
  private effectsLayer: Container;
  private unitsLayer: Container;
  private labelLayer: Container;
  private hexLayer: Container;

  private arenaWidth: number = 4;
  private arenaDepth: number = 12;
  private sfxThrottle: number = 0;
  sfxEnabled: boolean = true;

  /** Callback when an enemy preview unit is clicked */
  onEnemyClick: ((defId: string, screenX: number, screenY: number) => void) | null = null;

  /** Callback when a player preview unit is clicked */
  onPlayerUnitClick: ((unitId: string, defId: string, screenX: number, screenY: number) => void) | null = null;

  /** Callback invoked when deployment is confirmed */
  onDeploymentComplete: ((deployment: UnitDeployment) => void) | null = null;

  /** True while a unit is being dragged in deployment mode */
  get isDragging(): boolean { return this.draggingUnit !== null; }

  private deployment: DeploymentState | null = null;
  private hexGraphics: Map<string, Graphics> = new Map();

  /** Unit currently being dragged in deployment mode */
  private draggingUnit: { id: string; sprite: UnitSprite; originalHex: HexCoord | null } | null = null;
  /** Hex currently highlighted under the dragged unit */
  private hoveredDeployHex: HexCoord | null = null;

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
  }

  // ── Coordinate Helpers ──

  /** Convert arena HexCoord to local pixel position (centered on arena) */
  private hexToPixelLocal(coord: HexCoord): { x: number; y: number } {
    const raw = hexToPixel(coord, BATTLE_HEX_SIZE);
    const cx = hexToPixel(hex((this.arenaWidth - 1) / 2, (this.arenaDepth - 1) / 2), BATTLE_HEX_SIZE);
    return { x: raw.x - cx.x, y: raw.y - cx.y };
  }

  // ── Battle Bounds (for camera) ──

  getBattleBounds(): { top: number; bottom: number; width: number } {
    const topLeft = this.hexToPixelLocal(hex(0, 0));
    const botRight = this.hexToPixelLocal(hex(this.arenaWidth - 1, this.arenaDepth - 1));
    const pad = BATTLE_HEX_SIZE * 1.5;
    return {
      top: topLeft.y - pad,
      bottom: botRight.y + pad,
      width: (botRight.x - topLeft.x) + pad * 2,
    };
  }

  // ── Hex Grid Drawing ──

  private drawHexGrid(): void {
    this.hexLayer.removeChildren();
    this.hexGraphics.clear();

    for (let q = 0; q < this.arenaWidth; q++) {
      for (let r = 0; r < this.arenaDepth; r++) {
        const coord = hex(q, r);
        const key = hexKey(coord);
        const pos = this.hexToPixelLocal(coord);
        const corners = hexCorners(pos, BATTLE_HEX_SIZE - 1);

        let fillColor = HEX_COLOR_DEFAULT;
        if (r < 2) fillColor = HEX_COLOR_ENEMY;
        else if (r >= this.arenaDepth - PLAYER_DEPLOY_ROWS) fillColor = HEX_COLOR_PLAYER;

        const gfx = new Graphics();
        gfx.poly(corners.flatMap(c => [c.x, c.y]));
        gfx.fill({ color: fillColor, alpha: 0.85 });
        gfx.stroke({ color: HEX_STROKE, width: 1, alpha: 0.7 });

        this.hexLayer.addChild(gfx);
        this.hexGraphics.set(key, gfx);
      }
    }
  }

  /** Highlight a hex with a given color */
  private setHexColor(coord: HexCoord, color: number, alpha: number = 0.85): void {
    const key = hexKey(coord);
    const gfx = this.hexGraphics.get(key);
    if (!gfx) return;
    const pos = this.hexToPixelLocal(coord);
    const corners = hexCorners(pos, BATTLE_HEX_SIZE - 1);
    gfx.clear();
    gfx.poly(corners.flatMap(c => [c.x, c.y]));
    gfx.fill({ color, alpha });
    gfx.stroke({ color: HEX_STROKE, width: 1, alpha: 0.7 });
  }

  private resetHexColor(coord: HexCoord): void {
    const { r } = coord;
    let fillColor = HEX_COLOR_DEFAULT;
    if (r < 2) fillColor = HEX_COLOR_ENEMY;
    else if (r >= this.arenaDepth - PLAYER_DEPLOY_ROWS) fillColor = HEX_COLOR_PLAYER;
    this.setHexColor(coord, fillColor);
  }

  // ── Zone Labels ──

  private drawZoneLabels(): void {
    const enemyLabel = new Text({
      text: 'ENEMY ZONE',
      style: { fontSize: 9, fill: 0xcc6644, fontFamily: 'Segoe UI, system-ui, sans-serif', letterSpacing: 2 },
      resolution: TEXT_RESOLUTION,
    });
    const ePos = this.hexToPixelLocal(hex(Math.floor((this.arenaWidth - 1) / 2), 1));
    enemyLabel.anchor.set(0.5, 0.5);
    enemyLabel.x = ePos.x;
    enemyLabel.y = ePos.y;
    enemyLabel.alpha = 0.4;
    this.labelLayer.addChild(enemyLabel);

    const playerLabel = new Text({
      text: 'YOUR ZONE',
      style: { fontSize: 9, fill: 0x4488cc, fontFamily: 'Segoe UI, system-ui, sans-serif', letterSpacing: 2 },
      resolution: TEXT_RESOLUTION,
    });
    const pPos = this.hexToPixelLocal(hex(Math.floor((this.arenaWidth - 1) / 2), this.arenaDepth - 2));
    playerLabel.anchor.set(0.5, 0.5);
    playerLabel.x = pPos.x;
    playerLabel.y = pPos.y;
    playerLabel.alpha = 0.4;
    this.labelLayer.addChild(playerLabel);
  }

  // ── Wave Preview ──

  showWavePreview(wave: WaveDef, state?: GameState): void {
    this.clear();
    this.arenaWidth = state ? INITIAL_BATTLE_WIDTH + state.battleWidthBonus : INITIAL_BATTLE_WIDTH;
    this.arenaDepth = ARENA_DEPTH;

    this.drawHexGrid();
    this.drawZoneLabels();

    // Wave title
    const title = new Text({
      text: `Wave ${wave.waveNumber}${wave.isBoss ? ' (BOSS)' : wave.isElite ? ' (ELITE)' : ''}`,
      style: {
        fontSize: 15,
        fontWeight: 'bold',
        fill: wave.isBoss ? 0xccaa44 : wave.isElite ? 0xe08080 : 0xc8a03c,
        fontFamily: 'Segoe UI, system-ui, sans-serif',
      },
      resolution: TEXT_RESOLUTION,
    });
    const topPos = this.hexToPixelLocal(hex(Math.floor((this.arenaWidth - 1) / 2), 0));
    title.anchor.set(0.5, 1);
    title.x = topPos.x;
    title.y = topPos.y - BATTLE_HEX_SIZE * 1.5;
    this.labelLayer.addChild(title);

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
          side: 'enemy',
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
    const offset = Math.floor((this.arenaWidth - enemyWidth) / 2);
    let ei = 0;
    outer:
    for (let r = 0; r < 2; r++) {
      for (let col = 0; col < enemyWidth; col++) {
        if (ei >= enemies.length) break outer;
        const q = offset + col;
        const pos = this.hexToPixelLocal(hex(q, r));
        this.createUnitSprite(enemies[ei++], pos.x, pos.y, 0.7, true);
      }
    }

    // Enemy count
    const countLabel = new Text({
      text: `${enemies.length} enemies`,
      style: { fontSize: 10, fill: 0xaa8866, fontFamily: 'Segoe UI, system-ui, sans-serif' },
      resolution: TEXT_RESOLUTION,
    });
    countLabel.anchor.set(0.5, 1);
    countLabel.x = topPos.x;
    countLabel.y = topPos.y - BATTLE_HEX_SIZE * 1.5 + 18;
    this.labelLayer.addChild(countLabel);

    // Player preview
    if (state) {
      this.layoutPlayerPreview(state);
    }
  }

  // ── Player Preview Layout ──

  private layoutPlayerPreview(state: GameState): void {
    // Mirror the exact placement logic used in deployment so preview matches battle
    const defaultDeploy = getDefaultDeployment(state, this.arenaWidth);

    state.battleRoster.forEach((unitId, idx) => {
      const unit = state.roster.get(unitId);
      if (!unit) return;
      const def = ALL_UNIT_DEFS[unit.defId];
      if (!def) return;

      // Use saved position if valid for current arena, else fall back to default
      const savedHex = state.savedDeployment[idx] as import('@/core/types').HexCoord | undefined;
      const placedHex = (savedHex && this.isValidPlayerHex(savedHex)) ? savedHex : defaultDeploy.placements.get(unitId);
      if (!placedHex) return;

      const arenaUnit: ArenaUnit = {
        id: unitId,
        defId: unit.defId,
        name: def.name,
        role: def.role,
        side: 'player',
        stats: { ...unit.stats },
        maxHp: unit.stats.maxHp,
        lives: unit.lives,
        maxLives: unit.maxLives,
        isBoss: false,
        moveSpeed: def.moveSpeed,
        attackRange: def.attackRange,
      };
      const pos = this.hexToPixelLocal(placedHex);
      this.createUnitSprite(arenaUnit, pos.x, pos.y, 0.8, true);
    });

    // Show reinforcements faded one row above the player zone
    const reinforceRow = this.arenaDepth - PLAYER_DEPLOY_ROWS - 1;
    if (reinforceRow >= 2) {
      state.reinforcements.forEach((unitId, q) => {
        if (q >= this.arenaWidth) return;
        const unit = state.roster.get(unitId);
        if (!unit) return;
        const def = ALL_UNIT_DEFS[unit.defId];
        if (!def) return;
        const arenaUnit: ArenaUnit = {
          id: unitId,
          defId: unit.defId,
          name: def.name,
          role: def.role,
          side: 'player',
          stats: { ...unit.stats },
          maxHp: unit.stats.maxHp,
          lives: unit.lives,
          maxLives: unit.maxLives,
          isBoss: false,
          moveSpeed: def.moveSpeed,
          attackRange: def.attackRange,
        };
        const pos = this.hexToPixelLocal(hex(q, reinforceRow));
        this.createUnitSprite(arenaUnit, pos.x, pos.y, 0.4, true);
      });
    }
  }

  // ── Deployment Mode ──

  /**
   * Enter deployment mode: auto-place all units using savedPositions (falling back to
   * default layout), then allow drag-and-drop repositioning before starting battle.
   */
  enterDeploymentMode(units: ArenaUnit[], wave: WaveDef, arenaWidth: number, initialPlacements: Map<string, HexCoord>): void {
    this.clear();
    this.arenaWidth = arenaWidth;
    this.arenaDepth = ARENA_DEPTH;

    this.drawHexGrid();
    this.drawZoneLabels();

    // Draw enemy preview (non-interactive)
    const enemyWidth = INITIAL_ENEMY_WIDTH;
    const offset = Math.floor((arenaWidth - enemyWidth) / 2);
    const enemyPreviews: ArenaUnit[] = [];
    let idCounter = 0;
    for (const entry of wave.enemies) {
      const def = ENEMY_DEFS[entry.defId];
      if (!def) continue;
      for (let i = 0; i < entry.count; i++) {
        enemyPreviews.push({
          id: `preview_${idCounter++}`,
          defId: entry.defId,
          name: def.name,
          role: def.role,
          side: 'enemy',
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
    let ei = 0;
    outer:
    for (let r = 0; r < 2; r++) {
      for (let col = 0; col < enemyWidth; col++) {
        if (ei >= enemyPreviews.length) break outer;
        const q = offset + col;
        const pos = this.hexToPixelLocal(hex(q, r));
        this.createUnitSprite(enemyPreviews[ei++], pos.x, pos.y, 0.7, false);
      }
    }

    // Setup deployment state
    const deployState: DeploymentState = {
      units,
      placements: new Map(),
      hexToUnit: new Map(),
      arenaWidth,
      panel: this.createDeploymentPanel(),
    };
    this.deployment = deployState;

    // Auto-place all units: use initialPlacements for units that have a saved hex
    for (const unit of units) {
      const savedHex = initialPlacements.get(unit.id);
      if (savedHex && this.isValidPlayerHex(savedHex) && !deployState.hexToUnit.has(hexKey(savedHex))) {
        this.placeUnit(unit.id, savedHex, hexKey(savedHex));
      }
    }
    // Fill any remaining unplaced units with the default layout
    this.autoDeployRemaining();

    // Setup drag-and-drop on all placed unit sprites
    this.setupDeploymentDragEvents();
    for (const unit of units) {
      const sprite = this.unitSprites.get(unit.id);
      if (sprite) this.makeDraggable(unit.id, sprite);
    }

    // Title
    const title = new Text({
      text: 'Deploy Your Units',
      style: { fontSize: 14, fontWeight: 'bold', fill: 0x88ccff, fontFamily: 'Segoe UI, system-ui, sans-serif' },
      resolution: TEXT_RESOLUTION,
    });
    const topPos = this.hexToPixelLocal(hex(Math.floor((arenaWidth - 1) / 2), 0));
    title.anchor.set(0.5, 1);
    title.x = topPos.x;
    title.y = topPos.y - BATTLE_HEX_SIZE * 1.5;
    this.labelLayer.addChild(title);
  }

  private createDeploymentPanel(): HTMLElement {
    document.getElementById('deployment-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'deployment-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(10, 10, 20, 0.88);
      border: 1px solid rgba(100, 140, 200, 0.4);
      border-radius: 8px;
      padding: 8px 16px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #e0d8c0;
      z-index: 100;
      display: flex;
      align-items: center;
      gap: 14px;
      pointer-events: auto;
    `;

    const hint = document.createElement('span');
    hint.style.cssText = 'font-size: 11px; color: #88aacc; opacity: 0.8;';
    hint.textContent = 'Drag units to rearrange';
    panel.appendChild(hint);

    const startBtn = document.createElement('button');
    startBtn.id = 'start-battle-btn';
    startBtn.textContent = 'Start Battle';
    startBtn.style.cssText = `
      padding: 6px 18px;
      background: rgba(140, 40, 40, 0.9); color: #ffcccc;
      border: 1px solid #884444; border-radius: 4px;
      font-size: 12px; font-weight: bold; cursor: pointer;
    `;
    startBtn.addEventListener('click', () => this.confirmDeployment());
    panel.appendChild(startBtn);

    document.body.appendChild(panel);
    return panel;
  }

  private isValidPlayerHex(coord: HexCoord): boolean {
    const { q, r } = coord;
    return q >= 0 && q < this.arenaWidth && r >= this.arenaDepth - PLAYER_DEPLOY_ROWS && r < this.arenaDepth;
  }

  private placeUnit(unitId: string, coord: HexCoord, key: string): void {
    if (!this.deployment) return;

    const unit = this.deployment.units.find(u => u.id === unitId);
    if (!unit) return;

    this.deployment.placements.set(unitId, coord);
    this.deployment.hexToUnit.set(key, unitId);
    this.setHexColor(coord, HEX_COLOR_SELECTED);

    const pos = this.hexToPixelLocal(coord);
    const existing = this.unitSprites.get(unitId);
    if (existing) {
      existing.container.visible = true;
      existing.container.x = pos.x;
      existing.container.y = pos.y;
      existing.baseX = pos.x;
      existing.baseY = pos.y;
    } else {
      this.createUnitSprite(unit, pos.x, pos.y, 1.0, false);
    }
  }

  private autoDeployRemaining(): void {
    if (!this.deployment) return;
    const playerRowStart = this.arenaDepth - PLAYER_DEPLOY_ROWS;
    for (let r = this.arenaDepth - 1; r >= playerRowStart; r--) {
      for (let q = 0; q < this.arenaWidth; q++) {
        const coord = hex(q, r);
        const key = hexKey(coord);
        if (this.deployment.hexToUnit.has(key)) continue;
        const unplaced = this.deployment.units.find(u => !this.deployment!.placements.has(u.id));
        if (!unplaced) return;
        this.placeUnit(unplaced.id, coord, key);
      }
    }
  }

  // ── Drag and Drop ──

  private setupDeploymentDragEvents(): void {
    // Make container receive drag-move and drag-end events over the whole arena
    this.container.eventMode = 'static';
    this.container.hitArea = new Rectangle(-8000, -8000, 16000, 16000);

    this.container.on('pointermove', (e: FederatedPointerEvent) => {
      if (!this.draggingUnit) return;
      const local = this.container.toLocal(e.global);
      this.draggingUnit.sprite.container.x = local.x;
      this.draggingUnit.sprite.container.y = local.y;

      // Highlight nearest valid hex
      const nearHex = this.findNearestPlayerHex(local.x, local.y);
      const nearKey = nearHex ? hexKey(nearHex) : null;
      const hoverKey = this.hoveredDeployHex ? hexKey(this.hoveredDeployHex) : null;
      if (nearKey !== hoverKey) {
        if (this.hoveredDeployHex) this.resetDeployHexColor(this.hoveredDeployHex);
        if (nearHex) this.setHexColor(nearHex, HEX_COLOR_PLAYER_HOVER);
        this.hoveredDeployHex = nearHex;
      }
    });

    this.container.on('pointerup', (e: FederatedPointerEvent) => {
      if (!this.draggingUnit) return;
      const local = this.container.toLocal(e.global);
      this.finalizeDrop(local.x, local.y);
    });

    this.container.on('pointerupoutside', () => {
      if (!this.draggingUnit) return;
      this.cancelDrop();
    });
  }

  private makeDraggable(unitId: string, sprite: UnitSprite): void {
    sprite.container.eventMode = 'static';
    sprite.container.cursor = 'grab';

    sprite.container.on('pointerdown', (e: FederatedPointerEvent) => {
      if (!this.deployment) return;

      const originalHex = this.deployment.placements.get(unitId) ?? null;

      // Free the hex so it can be taken during drag
      if (originalHex) {
        const key = hexKey(originalHex);
        this.deployment.placements.delete(unitId);
        this.deployment.hexToUnit.delete(key);
        this.resetHexColor(originalHex);
      }

      this.draggingUnit = { id: unitId, sprite, originalHex };
      sprite.container.zIndex = 100;
      sprite.container.cursor = 'grabbing';
      e.stopPropagation();
    });
  }

  private finalizeDrop(localX: number, localY: number): void {
    if (!this.draggingUnit || !this.deployment) return;
    const { id: unitId, sprite, originalHex } = this.draggingUnit;
    this.draggingUnit = null;

    if (this.hoveredDeployHex) {
      this.resetDeployHexColor(this.hoveredDeployHex);
      this.hoveredDeployHex = null;
    }

    sprite.container.zIndex = 0;
    sprite.container.cursor = 'grab';

    const targetHex = this.findNearestPlayerHex(localX, localY);
    if (!targetHex) {
      this.snapBack(unitId, sprite, originalHex);
      return;
    }

    const key = hexKey(targetHex);
    const occupantId = this.deployment.hexToUnit.get(key);

    if (occupantId && occupantId !== unitId) {
      // Swap: move occupant to originalHex
      this.deployment.hexToUnit.delete(key);
      this.deployment.placements.delete(occupantId);
      if (originalHex) {
        const origKey = hexKey(originalHex);
        this.deployment.placements.set(occupantId, originalHex);
        this.deployment.hexToUnit.set(origKey, occupantId);
        const occupantSprite = this.unitSprites.get(occupantId);
        if (occupantSprite) {
          const origPos = this.hexToPixelLocal(originalHex);
          occupantSprite.container.x = origPos.x;
          occupantSprite.container.y = origPos.y;
          occupantSprite.baseX = origPos.x;
          occupantSprite.baseY = origPos.y;
        }
        this.setHexColor(originalHex, HEX_COLOR_SELECTED);
      }
    }

    // Place dragged unit at target
    this.deployment.placements.set(unitId, targetHex);
    this.deployment.hexToUnit.set(key, unitId);
    const pos = this.hexToPixelLocal(targetHex);
    sprite.container.x = pos.x;
    sprite.container.y = pos.y;
    sprite.baseX = pos.x;
    sprite.baseY = pos.y;
    this.setHexColor(targetHex, HEX_COLOR_SELECTED);
  }

  private cancelDrop(): void {
    if (!this.draggingUnit) return;
    const { id, sprite, originalHex } = this.draggingUnit;
    this.draggingUnit = null;
    if (this.hoveredDeployHex) {
      this.resetDeployHexColor(this.hoveredDeployHex);
      this.hoveredDeployHex = null;
    }
    sprite.container.zIndex = 0;
    sprite.container.cursor = 'grab';
    this.snapBack(id, sprite, originalHex);
  }

  private snapBack(unitId: string, sprite: UnitSprite, originalHex: HexCoord | null): void {
    if (!this.deployment) return;
    if (originalHex) {
      const key = hexKey(originalHex);
      this.deployment.placements.set(unitId, originalHex);
      this.deployment.hexToUnit.set(key, unitId);
      const pos = this.hexToPixelLocal(originalHex);
      sprite.container.x = pos.x;
      sprite.container.y = pos.y;
      sprite.baseX = pos.x;
      sprite.baseY = pos.y;
      this.setHexColor(originalHex, HEX_COLOR_SELECTED);
    }
  }

  /** Returns the hex color for a hex in the player's deployment zone */
  private resetDeployHexColor(coord: HexCoord): void {
    const occupied = this.deployment?.hexToUnit.has(hexKey(coord));
    this.setHexColor(coord, occupied ? HEX_COLOR_SELECTED : HEX_COLOR_PLAYER);
  }

  /** Find the nearest player-zone hex center to a local point, within 1.5 hex radii */
  private findNearestPlayerHex(localX: number, localY: number): HexCoord | null {
    let best: HexCoord | null = null;
    let bestDist = Infinity;
    const rowStart = this.arenaDepth - PLAYER_DEPLOY_ROWS;
    for (let q = 0; q < this.arenaWidth; q++) {
      for (let r = rowStart; r < this.arenaDepth; r++) {
        const coord = hex(q, r);
        const pos = this.hexToPixelLocal(coord);
        const dx = localX - pos.x;
        const dy = localY - pos.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; best = coord; }
      }
    }
    const maxDist = BATTLE_HEX_SIZE * BATTLE_HEX_SIZE * 2.25;
    return bestDist <= maxDist ? best : null;
  }

  private confirmDeployment(): void {
    if (!this.deployment) return;

    const placements = new Map(this.deployment.placements);
    const deployment: UnitDeployment = { placements };

    this.deployment.panel.remove();
    this.deployment = null;

    // Clean up drag event listeners and container interactivity
    this.container.removeAllListeners();
    this.container.eventMode = 'none';
    this.container.hitArea = null;

    this.onDeploymentComplete?.(deployment);
  }

  // ── Battle Setup ──

  setupBattle(snapshot: ArenaSnapshot): void {
    this.clear();
    this.arenaWidth = snapshot.arenaWidth;
    this.arenaDepth = snapshot.arenaDepth;

    this.drawHexGrid();
    this.drawZoneLabels();

    // Place all units at their starting hexes
    for (const { unit, hex: unitHex } of snapshot.unitPlacements) {
      const pos = this.hexToPixelLocal(unitHex);
      this.createUnitSprite(unit, pos.x, pos.y);
    }

    // Create reinforcement sprites (hidden, will slide in later)
    for (const unit of snapshot.reinforcements) {
      const spawnQ = Math.floor(this.arenaWidth / 2);
      const spawnR = this.arenaDepth - 1;
      const pos = this.hexToPixelLocal(hex(spawnQ, spawnR));
      const sprite = this.createUnitSprite(unit, pos.x, pos.y, 0.3);
      sprite.container.visible = false;
    }

    for (const unit of snapshot.enemyReinforcements) {
      const pos = this.hexToPixelLocal(hex(Math.floor(this.arenaWidth / 2), 0));
      const sprite = this.createUnitSprite(unit, pos.x, pos.y, 0.3);
      sprite.container.visible = false;
    }
  }

  // ── Tick Animation ──

  async applyTick(events: BattleEvent[], _speed: number): Promise<void> {
    const attackerIds = new Set<string>();

    // Phase 1: Movements (animate slide)
    const moveAnims: Promise<void>[] = [];
    for (const event of events) {
      if (event.type === 'unit_moved') {
        moveAnims.push(this.animateMove(event.unitId, event.to));
      }
    }
    if (moveAnims.length > 0) await Promise.all(moveAnims);

    // Phase 2: Attacks
    const attackAnims: Promise<void>[] = [];
    for (const event of events) {
      if (event.type === 'melee_attack') {
        attackAnims.push(this.animateMeleeAttack(event.attackerId, event.targetId, event.damage));
        attackerIds.add(event.attackerId);
      } else if (event.type === 'ranged_attack') {
        attackAnims.push(this.animateRangedAttack(event.attackerId, event.targetId, event.damage));
        attackerIds.add(event.attackerId);
      }
    }
    if (attackAnims.length > 0) await Promise.all(attackAnims);

    // Phase 3: Deaths
    const deathAnims: Promise<void>[] = [];
    for (const event of events) {
      if (event.type === 'unit_died') {
        if (event.livesRemaining > 0) {
          deathAnims.push(this.animateLifeLost(event.unitId));
        } else {
          deathAnims.push(this.animateDeath(event.unitId));
        }
      }
    }
    if (deathAnims.length > 0) await Promise.all(deathAnims);

    // Phase 4: Reinforcements
    const reinforceAnims: Promise<void>[] = [];
    for (const event of events) {
      if (event.type === 'reinforcement') {
        reinforceAnims.push(this.animateReinforcement(event.unitId, event.hex));
      }
    }
    if (reinforceAnims.length > 0) await Promise.all(reinforceAnims);

    // Phase 5: Cooldown arcs
    for (const sprite of this.unitSprites.values()) {
      if (attackerIds.has(sprite.unit.id)) {
        sprite.cooldownTimer = 0;
      } else {
        sprite.cooldownTimer += 0.1;
      }
      this.drawCooldownArc(sprite);
    }
  }

  /** Apply tick events instantly (for skip) */
  applyTickInstant(events: BattleEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case 'unit_moved': {
          const sprite = this.unitSprites.get(event.unitId);
          if (sprite) {
            const pos = this.hexToPixelLocal(event.to);
            sprite.container.x = pos.x;
            sprite.container.y = pos.y;
            sprite.baseX = pos.x;
            sprite.baseY = pos.y;
          }
          break;
        }
        case 'melee_attack':
        case 'ranged_attack': {
          const target = this.unitSprites.get(event.targetId);
          if (target) {
            target.currentHp = event.targetHp;
            this.updateHpBar(target);
          }
          break;
        }
        case 'unit_died': {
          const sprite = this.unitSprites.get(event.unitId);
          if (sprite) {
            if (event.livesRemaining > 0) {
              sprite.currentHp = sprite.unit.maxHp;
              sprite.unit.lives = event.livesRemaining;
              this.updateHpBar(sprite);
              const radius = sprite.unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS;
              this.drawLivesDots(sprite.livesDots, event.livesRemaining, sprite.unit.maxLives, radius);
            } else {
              sprite.container.visible = false;
              this.unitSprites.delete(event.unitId);
            }
          }
          break;
        }
        case 'reinforcement': {
          const sprite = this.unitSprites.get(event.unitId);
          if (sprite) {
            const pos = this.hexToPixelLocal(event.hex);
            sprite.container.x = pos.x;
            sprite.container.y = pos.y;
            sprite.baseX = pos.x;
            sprite.baseY = pos.y;
            sprite.container.alpha = 1;
            sprite.container.visible = true;
          }
          break;
        }
      }
    }
  }

  // ── Animation Helpers ──

  private async animateMove(unitId: string, toHex: HexCoord): Promise<void> {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) return;

    const targetPos = this.hexToPixelLocal(toHex);
    const steps = 6;
    const startX = sprite.baseX;
    const startY = sprite.baseY;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      sprite.container.x = startX + (targetPos.x - startX) * t;
      sprite.container.y = startY + (targetPos.y - startY) * t;
      await this.wait(20);
    }

    sprite.baseX = targetPos.x;
    sprite.baseY = targetPos.y;
    sprite.container.x = targetPos.x;
    sprite.container.y = targetPos.y;
  }

  private async animateMeleeAttack(attackerId: string, targetId: string, damage: number): Promise<void> {
    const attacker = this.unitSprites.get(attackerId);
    const target = this.unitSprites.get(targetId);
    if (!attacker || !target) return;

    const dx = target.baseX - attacker.baseX;
    const dy = target.baseY - attacker.baseY;
    const lungeX = dx * 0.35;
    const lungeY = dy * 0.35;

    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      attacker.container.x = attacker.baseX + lungeX * t;
      attacker.container.y = attacker.baseY + lungeY * t;
      await this.wait(18);
    }

    target.currentHp = Math.max(0, target.currentHp - damage);
    this.updateHpBar(target);
    this.flashUnit(target);
    this.spawnDamageNumber(target.baseX, target.baseY, damage);
    this.playSfx(() => SFX.hit());
    await this.wait(60);

    for (let i = 1; i <= 3; i++) {
      const t = i / 3;
      attacker.container.x = attacker.baseX + lungeX * (1 - t);
      attacker.container.y = attacker.baseY + lungeY * (1 - t);
      await this.wait(18);
    }

    attacker.container.x = attacker.baseX;
    attacker.container.y = attacker.baseY;
  }

  private async animateRangedAttack(attackerId: string, targetId: string, damage: number): Promise<void> {
    const attacker = this.unitSprites.get(attackerId);
    const target = this.unitSprites.get(targetId);
    if (!attacker || !target) return;

    const color = attacker.unit.side === 'player' ? 0x88ff88 : 0xff8888;
    const projectile = new Graphics();
    projectile.circle(0, 0, 4);
    projectile.fill({ color });
    const glow = new Graphics();
    glow.circle(0, 0, 8);
    glow.fill({ color, alpha: 0.3 });
    projectile.addChild(glow);
    projectile.x = attacker.baseX;
    projectile.y = attacker.baseY;
    this.effectsLayer.addChild(projectile);
    this.playSfx(() => SFX.shoot());

    const steps = 10;
    const dx = (target.baseX - attacker.baseX) / steps;
    const dy = (target.baseY - attacker.baseY) / steps;
    for (let i = 0; i < steps; i++) {
      projectile.x += dx;
      projectile.y += dy;
      await this.wait(18);
    }
    projectile.destroy();

    target.currentHp = Math.max(0, target.currentHp - damage);
    this.updateHpBar(target);
    this.flashUnit(target);
    this.spawnDamageNumber(target.baseX, target.baseY, damage);
    await this.wait(40);
  }

  private async animateDeath(unitId: string): Promise<void> {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) return;
    this.playSfx(() => SFX.death());
    this.spawnParticles(sprite.baseX, sprite.baseY, getUnitColor(sprite.unit));

    const steps = 10;
    for (let i = 0; i < steps; i++) {
      sprite.container.scale.set(1 - (i / steps));
      sprite.container.alpha = 1 - (i / steps);
      await this.wait(25);
    }
    sprite.container.visible = false;
    this.unitSprites.delete(unitId);
  }

  private async animateLifeLost(unitId: string): Promise<void> {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) return;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      sprite.container.alpha = i % 2 === 0 ? 0.2 : 1;
      await this.wait(50);
    }
    sprite.container.alpha = 1;
    sprite.unit.lives--;
    sprite.currentHp = sprite.unit.maxHp;
    this.updateHpBar(sprite);
    const radius = sprite.unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS;
    this.drawLivesDots(sprite.livesDots, sprite.unit.lives, sprite.unit.maxLives, radius);
  }

  private async animateReinforcement(unitId: string, toHex: HexCoord): Promise<void> {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) return;

    const targetPos = this.hexToPixelLocal(toHex);
    const startY = targetPos.y + 60;

    sprite.container.x = targetPos.x;
    sprite.container.y = startY;
    sprite.container.alpha = 0.3;
    sprite.container.visible = true;

    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      sprite.container.y = startY + (targetPos.y - startY) * t;
      sprite.container.alpha = 0.3 + 0.7 * t;
      await this.wait(25);
    }

    sprite.container.x = targetPos.x;
    sprite.container.y = targetPos.y;
    sprite.container.alpha = 1;
    sprite.baseX = targetPos.x;
    sprite.baseY = targetPos.y;
  }

  // ── Effect Helpers ──

  private flashUnit(sprite: UnitSprite): void {
    const radius = sprite.unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS;
    const flash = new Graphics();
    flash.circle(0, 0, radius);
    flash.fill({ color: 0xffffff, alpha: 0.7 });
    sprite.container.addChild(flash);
    let frame = 0;
    const animate = () => {
      frame++;
      flash.alpha = Math.max(0, 0.7 - frame * 0.12);
      if (frame < 6) requestAnimationFrame(animate);
      else flash.destroy();
    };
    requestAnimationFrame(animate);
  }

  private spawnDamageNumber(x: number, y: number, damage: number): void {
    const text = new Text({
      text: `-${damage}`,
      style: { fontSize: 13, fontWeight: 'bold', fill: 0xff4444, fontFamily: 'Segoe UI, system-ui, sans-serif' },
      resolution: TEXT_RESOLUTION,
    });
    text.anchor.set(0.5, 0.5);
    text.x = x + (Math.random() - 0.5) * 10;
    text.y = y - 18;
    this.effectsLayer.addChild(text);
    let frame = 0;
    const animate = () => {
      frame++;
      text.y -= 0.7;
      text.alpha = Math.max(0, 1 - frame / 30);
      if (frame < 30) requestAnimationFrame(animate);
      else text.destroy();
    };
    requestAnimationFrame(animate);
  }

  private spawnParticles(x: number, y: number, color: number): void {
    for (let i = 0; i < 8; i++) {
      const particle = new Graphics();
      particle.circle(0, 0, 2.5);
      particle.fill({ color });
      particle.x = x;
      particle.y = y;
      this.effectsLayer.addChild(particle);
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 2 + Math.random() * 1.5;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      let frame = 0;
      const animate = () => {
        frame++;
        particle.x += vx;
        particle.y += vy * 0.8;
        particle.alpha = Math.max(0, 1 - frame / 20);
        particle.scale.set(Math.max(0.2, 1 - frame / 25));
        if (frame < 20) requestAnimationFrame(animate);
        else particle.destroy();
      };
      requestAnimationFrame(animate);
    }
  }

  // ── Sprite Creation ──

  private createUnitSprite(unit: ArenaUnit, x: number, y: number, alpha: number = 1, clickable: boolean = false): UnitSprite {
    const container = new Container();
    container.x = x;
    container.y = y;
    container.alpha = alpha;

    const radius = unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS;
    const color = getUnitColor(unit);

    const body = new Graphics();
    body.circle(0, 0, radius);
    body.fill({ color });
    body.stroke({ color: 0x000000, width: 1.5 });
    container.addChild(body);

    const roleLetters: Record<string, string> = {
      fodder: 'F', melee: 'M', ranged: 'R', glass_cannon: 'G', tank: 'T', animal: 'A',
    };
    const roleLetter = new Text({
      text: roleLetters[unit.role] ?? '?',
      style: { fontSize: 9, fontWeight: 'bold', fill: 0xffffff, fontFamily: 'Segoe UI, system-ui, sans-serif' },
      resolution: TEXT_RESOLUTION,
    });
    roleLetter.anchor.set(0.5, 0.5);
    container.addChild(roleLetter);

    const nameLabel = new Text({
      text: unit.name,
      style: { fontSize: 8, fill: 0xe0d8c0, fontFamily: 'Segoe UI, system-ui, sans-serif' },
      resolution: TEXT_RESOLUTION,
    });
    nameLabel.anchor.set(0.5, 1);
    nameLabel.y = -radius - 6;
    container.addChild(nameLabel);

    const cooldownArc = new Graphics();
    container.addChild(cooldownArc);

    const hpBg = new Graphics();
    hpBg.roundRect(-HP_BAR_WIDTH / 2, radius + 3, HP_BAR_WIDTH, HP_BAR_HEIGHT, 2);
    hpBg.fill({ color: 0x333333 });
    container.addChild(hpBg);

    const hpBar = new Graphics();
    this.drawHpBar(hpBar, unit.stats.hp, unit.maxHp, radius);
    container.addChild(hpBar);

    const livesDots = new Graphics();
    this.drawLivesDots(livesDots, unit.lives, unit.maxLives, radius);
    container.addChild(livesDots);

    if (clickable) {
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.on('pointertap', (e) => {
        if (unit.side === 'player') {
          this.onPlayerUnitClick?.(unit.id, unit.defId, e.globalX, e.globalY);
        } else {
          this.onEnemyClick?.(unit.defId, e.globalX, e.globalY);
        }
      });
    }

    this.unitsLayer.addChild(container);

    const sprite: UnitSprite = {
      container, body, hpBar, hpBg, nameLabel, livesDots, cooldownArc,
      cooldownTimer: 0, unit,
      currentHp: unit.stats.hp,
      baseX: x, baseY: y,
    };
    this.unitSprites.set(unit.id, sprite);
    return sprite;
  }

  private drawHpBar(gfx: Graphics, hp: number, maxHp: number, radius: number): void {
    gfx.clear();
    const pct = Math.max(0, hp / maxHp);
    const fillWidth = HP_BAR_WIDTH * pct;
    const color = pct > 0.6 ? 0x44aa44 : pct > 0.3 ? 0xccaa44 : 0xcc4444;
    const barX = -HP_BAR_WIDTH / 2;
    const barY = radius + 3;
    if (fillWidth > 0) {
      gfx.roundRect(barX, barY, fillWidth, HP_BAR_HEIGHT, 2);
      gfx.fill({ color });
    }
  }

  private drawLivesDots(gfx: Graphics, lives: number, maxLives: number, radius: number): void {
    gfx.clear();
    if (maxLives <= 1) return;
    const dotSize = 2;
    const gap = 5;
    const totalWidth = (maxLives - 1) * gap;
    const startX = -totalWidth / 2;
    const y = radius + HP_BAR_HEIGHT + 6;
    for (let i = 0; i < maxLives; i++) {
      const x = startX + i * gap;
      gfx.circle(x, y, dotSize);
      if (i < lives) gfx.fill({ color: 0xe06060 });
      else gfx.stroke({ color: 0x666666, width: 1 });
    }
  }

  private drawCooldownArc(sprite: UnitSprite): void {
    const gfx = sprite.cooldownArc;
    gfx.clear();
    const cd = sprite.unit.stats.cooldown;
    if (cd <= 0) return;
    const pct = Math.min(1, sprite.cooldownTimer / cd);
    if (pct <= 0) return;
    const radius = (sprite.unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS) + 2;
    const startAngle = -Math.PI / 2;
    const sweep = Math.PI * 2 * pct;
    const segments = Math.max(8, Math.floor(sweep * 12));
    const step = sweep / segments;
    for (let i = 0; i < segments; i++) {
      const a1 = startAngle + step * i;
      const a2 = startAngle + step * (i + 1);
      gfx.moveTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
      gfx.lineTo(Math.cos(a2) * radius, Math.sin(a2) * radius);
    }
    gfx.stroke({ color: 0xffffff, width: 2, alpha: 0.35 });
  }

  private updateHpBar(sprite: UnitSprite): void {
    const radius = sprite.unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS;
    this.drawHpBar(sprite.hpBar, sprite.currentHp, sprite.unit.maxHp, radius);
  }

  // ── SFX ──

  private playSfx(fn: () => void): void {
    if (!this.sfxEnabled) return;
    const now = performance.now();
    if (now - this.sfxThrottle < 50) return;
    this.sfxThrottle = now;
    fn();
  }

  // ── Cleanup ──

  clear(): void {
    document.getElementById('deployment-panel')?.remove();
    this.deployment = null;
    this.draggingUnit = null;
    this.hoveredDeployHex = null;

    this.container.removeAllListeners();
    this.container.eventMode = 'none';
    this.container.hitArea = null;

    this.unitSprites.clear();
    this.hexGraphics.clear();
    this.bgLayer.removeChildren();
    this.hexLayer.removeChildren();
    this.unitsLayer.removeChildren();
    this.effectsLayer.removeChildren();
    this.labelLayer.removeChildren();
  }

  // ── Utility ──

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
