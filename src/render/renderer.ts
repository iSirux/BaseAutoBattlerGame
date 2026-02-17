import { Application, Container, Graphics } from 'pixi.js';
import type { GameState, HexTile, InputState, HexCoord } from '@/core/types';
import { hexToPixel, hexCorners, pixelToHex, hexKey, hexNeighbors } from '@/hex/coords';
import { BUILDING_DEFS } from '@/data/buildings';

const HEX_SIZE = 32;

const TERRAIN_COLORS: Record<string, number> = {
  grass: 0x4a7c4f,
  forest: 0x2d5a30,
  rock: 0x7a7a7a,
  mountain: 0x5a5a5a,
};

const DEPOSIT_COLORS: Record<string, number> = {
  wood: 0x8b6914,
  stone: 0x9e9e9e,
  iron: 0x6e7b8b,
};

const BUILDING_COLORS: Record<string, number> = {
  lumber_mill: 0xc49a3c,
  quarry: 0xb0b0b0,
  iron_mine: 0x506878,
  barracks: 0x8b2020,
  archery_range: 0x6b8e23,
  blacksmith: 0x4a4a4a,
  kennel: 0x8b6c42,
};

export class GameRenderer {
  app: Application;
  worldContainer: Container;
  gridLayer: Container;
  buildingLayer: Container;
  highlightLayer: Container;

  inputState: InputState;

  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private dragDistance = 0;

  private activePointers = new Map<number, { x: number; y: number }>();
  private pinchStartDist = 0;
  private pinchStartScale = 1;
  private isPinching = false;
  private isTouchDevice = false;

  private hoverGfx: Graphics;
  private selectGfx: Graphics;
  private validPlacementGfx: Graphics;

  /** Callback when a placement click occurs */
  onPlacementClick: ((coord: HexCoord) => void) | null = null;

  constructor() {
    this.app = new Application();
    this.worldContainer = new Container();
    this.gridLayer = new Container();
    this.buildingLayer = new Container();
    this.highlightLayer = new Container();

    this.hoverGfx = new Graphics();
    this.selectGfx = new Graphics();
    this.validPlacementGfx = new Graphics();

    this.inputState = {
      hoveredHex: null,
      selectedHex: null,
      placingBuilding: null,
      lastMouseX: 0,
      lastMouseY: 0,
      isPanning: false,
    };
  }

  async init(canvasContainer: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: canvasContainer,
      background: 0x1a1a2e,
      antialias: true,
    });
    canvasContainer.appendChild(this.app.canvas);

    this.worldContainer.addChild(this.gridLayer);
    this.worldContainer.addChild(this.buildingLayer);
    this.worldContainer.addChild(this.highlightLayer);
    this.highlightLayer.addChild(this.validPlacementGfx);
    this.highlightLayer.addChild(this.hoverGfx);
    this.highlightLayer.addChild(this.selectGfx);
    this.app.stage.addChild(this.worldContainer);

    // Center the world
    this.worldContainer.x = this.app.screen.width / 2;
    this.worldContainer.y = this.app.screen.height / 2;

    this.setupInput();
  }

  private setupInput(): void {
    const canvas = this.app.canvas;

    // Detect touch device and prevent browser gesture interception
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    canvas.addEventListener('pointerdown', (e) => {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two fingers = pinch-to-zoom
      if (this.activePointers.size === 2) {
        this.isPinching = true;
        this.isPanning = false;
        const pts = [...this.activePointers.values()];
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        this.pinchStartDist = Math.sqrt(dx * dx + dy * dy);
        this.pinchStartScale = this.worldContainer.scale.x;
        return;
      }

      if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
        // Right-click: cancel placement or pan
        if (this.inputState.placingBuilding) {
          this.inputState.placingBuilding = null;
          return;
        }
        this.isPanning = true;
        this.inputState.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.dragDistance = 0;
        return;
      }

      if (e.button === 0) {
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
        this.dragDistance = 0;
      }
    });

    // Escape cancels placement mode
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.inputState.placingBuilding) {
        this.inputState.placingBuilding = null;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.inputState.lastMouseX = e.offsetX;
      this.inputState.lastMouseY = e.offsetY;

      // Pinch-to-zoom with two fingers
      if (this.isPinching && this.activePointers.size === 2) {
        const pts = [...this.activePointers.values()];
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = dist / this.pinchStartDist;

        const oldScale = this.worldContainer.scale.x;
        const newScale = Math.max(0.3, Math.min(3, this.pinchStartScale * ratio));

        // Zoom toward pinch midpoint
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const worldX = (midX - this.worldContainer.x) / oldScale;
        const worldY = (midY - this.worldContainer.y) / oldScale;
        this.worldContainer.scale.set(newScale);
        this.worldContainer.x = midX - worldX * newScale;
        this.worldContainer.y = midY - worldY * newScale;
        return;
      }

      // Update hovered hex
      this.updateHoveredHex(e.offsetX, e.offsetY);

      if (this.isPanning) {
        const dx = e.clientX - this.panStart.x;
        const dy = e.clientY - this.panStart.y;
        this.dragDistance += Math.abs(dx) + Math.abs(dy);
        this.worldContainer.x += dx;
        this.worldContainer.y += dy;
        this.panStart = { x: e.clientX, y: e.clientY };
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      this.activePointers.delete(e.pointerId);

      // Exiting pinch: reset pan origin for remaining pointer, prevent accidental click
      if (this.isPinching) {
        this.isPinching = false;
        if (this.activePointers.size === 1) {
          const remaining = [...this.activePointers.values()][0];
          this.panStart = { x: remaining.x, y: remaining.y };
          this.isPanning = true;
        }
        this.dragDistance = Infinity; // suppress click after pinch
        return;
      }

      // Adaptive click threshold: touch needs more slack than mouse
      const clickThreshold = e.pointerType === 'touch' ? 15 : 5;
      if (this.dragDistance < clickThreshold && e.button === 0) {
        this.handleClick(e.offsetX, e.offsetY);
      }
      this.isPanning = false;
      this.inputState.isPanning = false;
    });

    canvas.addEventListener('pointerleave', (e) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size === 0) {
        this.isPanning = false;
        this.isPinching = false;
        this.inputState.isPanning = false;
        this.inputState.hoveredHex = null;
      }
    });

    canvas.addEventListener('pointercancel', (e) => {
      this.activePointers.delete(e.pointerId);
      if (this.activePointers.size < 2) this.isPinching = false;
      if (this.activePointers.size === 0) {
        this.isPanning = false;
        this.inputState.isPanning = false;
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const oldScale = this.worldContainer.scale.x;
      const newScale = Math.max(0.3, Math.min(3, oldScale * scaleFactor));

      // Zoom toward cursor position
      const worldX = (e.offsetX - this.worldContainer.x) / oldScale;
      const worldY = (e.offsetY - this.worldContainer.y) / oldScale;
      this.worldContainer.scale.set(newScale);
      this.worldContainer.x = e.offsetX - worldX * newScale;
      this.worldContainer.y = e.offsetY - worldY * newScale;
    }, { passive: false });

    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Convert screen coords to world coords, then to hex */
  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const scale = this.worldContainer.scale.x;
    return {
      x: (sx - this.worldContainer.x) / scale,
      y: (sy - this.worldContainer.y) / scale,
    };
  }

  private updateHoveredHex(sx: number, sy: number): void {
    const wp = this.screenToWorld(sx, sy);
    const coord = pixelToHex(wp.x, wp.y, HEX_SIZE);
    this.inputState.hoveredHex = coord;
  }

  private handleClick(sx: number, sy: number): void {
    const wp = this.screenToWorld(sx, sy);
    const coord = pixelToHex(wp.x, wp.y, HEX_SIZE);

    // If in placement mode, delegate to placement callback
    if (this.inputState.placingBuilding) {
      this.onPlacementClick?.(coord);
      return;
    }

    // Toggle selection: click same hex = deselect
    const sel = this.inputState.selectedHex;
    if (sel && sel.q === coord.q && sel.r === coord.r) {
      this.inputState.selectedHex = null;
    } else {
      this.inputState.selectedHex = coord;
    }
  }

  /** Render the hex grid from game state */
  renderGrid(state: GameState): void {
    this.gridLayer.removeChildren();

    for (const tile of state.grid.tiles.values()) {
      this.drawHexTile(tile, state);
    }
  }

  /** Update hover and selection highlights (call every frame) */
  updateHighlights(state: GameState): void {
    this.hoverGfx.clear();
    this.selectGfx.clear();
    this.validPlacementGfx.clear();

    const hovered = this.inputState.hoveredHex;
    const selected = this.inputState.selectedHex;
    const placing = this.inputState.placingBuilding;

    // Placement mode: highlight valid tiles
    if (placing) {
      const validTiles = this.getValidPlacementTiles(state, placing);
      for (const key of validTiles) {
        const tile = state.grid.tiles.get(key);
        if (!tile) continue;
        const center = hexToPixel(tile.coord, HEX_SIZE);
        const corners = hexCorners(center, HEX_SIZE - 1);
        this.validPlacementGfx.poly(corners.flatMap((c) => [c.x, c.y]));
        this.validPlacementGfx.fill({ color: 0x40c040, alpha: 0.2 });
        this.validPlacementGfx.stroke({ color: 0x40c040, width: 1.5, alpha: 0.5 });
      }

      // Hover in placement mode: green if valid, red if not
      if (hovered) {
        const hoverKey = hexKey(hovered);
        const isValid = validTiles.has(hoverKey);
        const center = hexToPixel(hovered, HEX_SIZE);
        const corners = hexCorners(center, HEX_SIZE - 1);
        this.hoverGfx.poly(corners.flatMap((c) => [c.x, c.y]));
        this.hoverGfx.stroke({
          color: isValid ? 0x40ff40 : 0xff4040,
          width: 2.5,
          alpha: 0.8,
        });
      }
      return;
    }

    // Normal mode
    if (hovered) {
      const tile = state.grid.tiles.get(hexKey(hovered));
      if (tile) {
        const center = hexToPixel(hovered, HEX_SIZE);
        const corners = hexCorners(center, HEX_SIZE - 1);
        this.hoverGfx.poly(corners.flatMap((c) => [c.x, c.y]));
        this.hoverGfx.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
      }
    }

    if (selected) {
      const tile = state.grid.tiles.get(hexKey(selected));
      if (tile) {
        const center = hexToPixel(selected, HEX_SIZE);
        const corners = hexCorners(center, HEX_SIZE - 1);
        this.selectGfx.poly(corners.flatMap((c) => [c.x, c.y]));
        this.selectGfx.stroke({ color: 0xffdc50, width: 3, alpha: 0.8 });
      }
    }
  }

  /** Get set of hex keys where a building type can be validly placed */
  private getValidPlacementTiles(state: GameState, buildingType: string): Set<string> {
    const valid = new Set<string>();
    const def = BUILDING_DEFS[buildingType];
    if (!def) return valid;

    for (const [key, tile] of state.grid.tiles) {
      if (tile.buildingId) continue; // already occupied
      if (def.requiredDeposit) {
        const hasDeposit = hexNeighbors(tile.coord).some((n) => {
          const nTile = state.grid.tiles.get(hexKey(n));
          return nTile?.deposit === def.requiredDeposit;
        });
        if (!hasDeposit) continue;
      }
      valid.add(key);
    }
    return valid;
  }

  private drawHexTile(tile: HexTile, state: GameState): void {
    const gfx = new Graphics();
    const center = hexToPixel(tile.coord, HEX_SIZE);
    const corners = hexCorners(center, HEX_SIZE - 1);

    let fillColor = TERRAIN_COLORS[tile.terrain] ?? 0x4a7c4f;

    if (tile.deposit) {
      fillColor = DEPOSIT_COLORS[tile.deposit] ?? fillColor;
    }

    gfx.poly(corners.flatMap((c) => [c.x, c.y]));
    gfx.fill({ color: fillColor, alpha: 0.8 });
    gfx.stroke({ color: 0x2a2a3e, width: 1 });

    if (tile.buildingId) {
      const building = state.buildings.get(tile.buildingId);
      if (building) {
        const bColor = BUILDING_COLORS[building.type] ?? 0xffffff;
        gfx.circle(center.x, center.y, HEX_SIZE * 0.4);
        gfx.fill({ color: bColor });
        gfx.stroke({ color: 0x000000, width: 1 });
      }
    }

    this.gridLayer.addChild(gfx);
  }

  get hexSize(): number {
    return HEX_SIZE;
  }

  destroy(): void {
    this.app.destroy(true);
  }
}
