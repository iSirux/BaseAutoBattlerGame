import { Container, Graphics, Text } from 'pixi.js';
import type { WaveDef, UnitRole, GameState, Unit, UnitDef } from '@/core/types';
import type { ArenaSnapshot, ArenaUnit, BattleEvent } from '@/simulation/battleLog';
import { ENEMY_DEFS, ALL_UNIT_DEFS } from '@/data/units';
import { INITIAL_BATTLE_WIDTH } from '@/core/gameState';
import { SFX } from '@/audio/sfx';

// ── Layout Constants ──

const SLOT_SPACING = 50;
const FRONTLINE_GAP = 140;
const RANGED_OFFSET = 60;
const REINFORCE_OFFSET = 100;
const BENCH_OFFSET = 160;
const UNIT_RADIUS = 16;
const BOSS_RADIUS = 24;
const HP_BAR_WIDTH = 30;
const HP_BAR_HEIGHT = 6;

/** How far the arena background extends around units */
const ARENA_PADDING_X = 160;
const ARENA_PADDING_TOP = 180;
const ARENA_PADDING_BOTTOM = 60;

/** Render text at higher resolution so it stays crisp when zoomed */
const TEXT_RESOLUTION = 3;

// ── Colors ──

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
  unit: ArenaUnit;
  currentHp: number;
  baseX: number;
  baseY: number;
}

// ── Arena Renderer ──

export class ArenaRenderer {
  container: Container;
  private bgLayer: Container;
  private unitSprites: Map<string, UnitSprite> = new Map();
  private effectsLayer: Container;
  private unitsLayer: Container;
  private labelLayer: Container;
  private battleWidth: number = 4;
  private sfxThrottle: number = 0;
  sfxEnabled: boolean = true;

  /** Slot arrays for targeting arrows — populated during preview layout */
  private playerFrontlineIds: (string | null)[] = [];
  private enemyFrontlineIds: (string | null)[] = [];
  private playerRangedIds: string[] = [];
  private enemyRangedIds: string[] = [];

  /** Callback when an enemy preview unit is clicked */
  onEnemyClick: ((defId: string, screenX: number, screenY: number) => void) | null = null;

  /** Callback when a player preview unit is clicked */
  onPlayerUnitClick: ((unitId: string, defId: string, screenX: number, screenY: number) => void) | null = null;

  constructor() {
    this.container = new Container();
    this.bgLayer = new Container();
    this.unitsLayer = new Container();
    this.effectsLayer = new Container();
    this.labelLayer = new Container();
    this.container.addChild(this.bgLayer);
    this.container.addChild(this.unitsLayer);
    this.container.addChild(this.effectsLayer);
    this.container.addChild(this.labelLayer);
  }

  // ── Arena Background ──

  private drawArenaBackground(battleWidth: number, mode: 'preview' | 'battle' | 'preview_full'): void {
    this.bgLayer.removeChildren();

    const halfW = Math.max(battleWidth, 4) * SLOT_SPACING / 2 + ARENA_PADDING_X;
    const top = -ARENA_PADDING_TOP;
    let bottom: number;
    if (mode === 'preview') {
      bottom = ARENA_PADDING_BOTTOM;
    } else if (mode === 'preview_full') {
      bottom = FRONTLINE_GAP + BENCH_OFFSET + ARENA_PADDING_BOTTOM;
    } else {
      bottom = FRONTLINE_GAP + REINFORCE_OFFSET + ARENA_PADDING_BOTTOM;
    }
    const w = halfW * 2;
    const h = bottom - top;

    // Dark ground
    const bg = new Graphics();
    bg.roundRect(-halfW, top, w, h, 12);
    bg.fill({ color: 0x0d0d1a, alpha: 0.7 });
    bg.stroke({ color: 0x3a3050, width: 1.5, alpha: 0.5 });
    this.bgLayer.addChild(bg);

    // Dividing line between enemy and player sides
    if (mode === 'battle' || mode === 'preview_full') {
      const midY = FRONTLINE_GAP / 2;
      const line = new Graphics();
      line.moveTo(-halfW + 20, midY);
      line.lineTo(halfW - 20, midY);
      line.stroke({ color: 0x554430, width: 1, alpha: 0.4 });
      this.bgLayer.addChild(line);

      // Side labels
      const enemyLabel = new Text({
        text: 'ENEMIES',
        style: { fontSize: 9, fill: 0xcc6644, fontFamily: 'Segoe UI, system-ui, sans-serif', letterSpacing: 2 },
        resolution: TEXT_RESOLUTION,
      });
      enemyLabel.anchor.set(0.5, 1);
      enemyLabel.x = 0;
      enemyLabel.y = midY - 6;
      enemyLabel.alpha = 0.4;
      this.bgLayer.addChild(enemyLabel);

      const playerLabel = new Text({
        text: 'YOUR ARMY',
        style: { fontSize: 9, fill: 0x4488cc, fontFamily: 'Segoe UI, system-ui, sans-serif', letterSpacing: 2 },
        resolution: TEXT_RESOLUTION,
      });
      playerLabel.anchor.set(0.5, 0);
      playerLabel.x = 0;
      playerLabel.y = midY + 6;
      playerLabel.alpha = 0.4;
      this.bgLayer.addChild(playerLabel);
    }
  }

  // ── Wave Preview ──

  showWavePreview(wave: WaveDef, state?: GameState): void {
    this.clear();
    this.battleWidth = state
      ? INITIAL_BATTLE_WIDTH + state.battleWidthBonus
      : INITIAL_BATTLE_WIDTH;

    const hasPlayer = !!state;
    this.drawArenaBackground(this.battleWidth, hasPlayer ? 'preview_full' : 'preview');

    // Title
    const title = new Text({
      text: `Wave ${wave.waveNumber}${wave.isBoss ? ' (BOSS)' : wave.isElite ? ' (ELITE)' : ''}`,
      style: {
        fontSize: 16,
        fontWeight: 'bold',
        fill: wave.isBoss ? 0xccaa44 : wave.isElite ? 0xe08080 : 0xc8a03c,
        fontFamily: 'Segoe UI, system-ui, sans-serif',
      },
      resolution: TEXT_RESOLUTION,
    });
    title.anchor.set(0.5, 1);
    title.x = 0;
    title.y = -REINFORCE_OFFSET - 30;
    this.labelLayer.addChild(title);

    // Build preview units
    const enemies: ArenaUnit[] = [];
    let idCounter = 0;
    for (const entry of wave.enemies) {
      const def = ENEMY_DEFS[entry.defId];
      if (!def) continue;
      for (let i = 0; i < entry.count; i++) {
        const isBoss = !!ENEMY_DEFS[entry.defId]?.isBoss;
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
          isBoss,
        });
      }
    }

    // Separate melee and ranged
    const melee = enemies.filter(e => e.role !== 'ranged');
    const ranged = enemies.filter(e => e.role === 'ranged');

    // Layout frontline — track slot assignments for targeting
    this.enemyFrontlineIds = new Array(this.battleWidth).fill(null);
    this.enemyRangedIds = [];
    const frontlineCount = Math.min(melee.length, this.battleWidth);
    for (let i = 0; i < frontlineCount; i++) {
      const pos = this.slotPosition(i, this.battleWidth, 'enemy', 'frontline');
      this.createUnitSprite(melee[i], pos.x, pos.y, 0.6, true);
      this.enemyFrontlineIds[i] = melee[i].id;
    }

    // Reinforcements (behind frontline)
    for (let i = frontlineCount; i < melee.length; i++) {
      const col = (i - frontlineCount) % this.battleWidth;
      const row = Math.floor((i - frontlineCount) / this.battleWidth);
      const pos = this.slotPosition(col, this.battleWidth, 'enemy', 'reinforcement');
      this.createUnitSprite(melee[i], pos.x, pos.y - row * 35, 0.4, true);
    }

    // Ranged (behind frontline)
    for (let i = 0; i < ranged.length; i++) {
      const pos = this.slotPosition(i, Math.max(ranged.length, this.battleWidth), 'enemy', 'ranged');
      this.createUnitSprite(ranged[i], pos.x, pos.y, 0.5, true);
      this.enemyRangedIds.push(ranged[i].id);
    }

    // Enemy count label
    const countLabel = new Text({
      text: `${enemies.length} enemies`,
      style: { fontSize: 11, fill: 0xaa8866, fontFamily: 'Segoe UI, system-ui, sans-serif' },
      resolution: TEXT_RESOLUTION,
    });
    countLabel.anchor.set(0.5, 0);
    countLabel.x = 0;
    countLabel.y = -REINFORCE_OFFSET - 14;
    this.labelLayer.addChild(countLabel);

    // Player army preview
    if (state) {
      this.layoutPlayerPreview(state);
      this.drawRowLabels(this.battleWidth);
      this.drawRowSeparators(this.battleWidth);
      this.drawSlotMarkers(this.battleWidth);
      this.drawTargetingArrows();
    }
  }

  // ── Player Preview ──

  private unitToPreviewArenaUnit(unit: Unit, def: UnitDef, realId: string): ArenaUnit {
    return {
      id: realId,
      defId: unit.defId,
      name: def.name,
      role: def.role,
      side: 'player',
      stats: { ...unit.stats },
      maxHp: unit.stats.maxHp,
      lives: unit.lives,
      maxLives: unit.maxLives,
      isBoss: false,
    };
  }

  private layoutPlayerPreview(state: GameState): void {
    // Split battleRoster into melee and ranged
    const activeMelee: ArenaUnit[] = [];
    const activeRanged: ArenaUnit[] = [];
    for (const unitId of state.battleRoster) {
      const unit = state.roster.get(unitId);
      if (!unit) continue;
      const def = ALL_UNIT_DEFS[unit.defId];
      if (!def) continue;
      const arenaUnit = this.unitToPreviewArenaUnit(unit, def, unitId);
      if (def.role === 'ranged') {
        activeRanged.push(arenaUnit);
      } else {
        activeMelee.push(arenaUnit);
      }
    }

    // Active melee → frontline slots — track slot assignments for targeting
    this.playerFrontlineIds = new Array(this.battleWidth).fill(null);
    this.playerRangedIds = [];
    const frontlineCount = Math.min(activeMelee.length, this.battleWidth);
    for (let i = 0; i < frontlineCount; i++) {
      const pos = this.slotPosition(i, this.battleWidth, 'player', 'frontline');
      this.createUnitSprite(activeMelee[i], pos.x, pos.y, 0.8, true);
      this.playerFrontlineIds[i] = activeMelee[i].id;
    }

    // Overflow melee → extra rows below frontline
    for (let i = frontlineCount; i < activeMelee.length; i++) {
      const col = (i - frontlineCount) % this.battleWidth;
      const row = Math.floor((i - frontlineCount) / this.battleWidth);
      const pos = this.slotPosition(col, this.battleWidth, 'player', 'frontline');
      this.createUnitSprite(activeMelee[i], pos.x, pos.y + (row + 1) * 35, 0.6, true);
    }

    // Active ranged → ranged row
    for (let i = 0; i < activeRanged.length; i++) {
      const pos = this.slotPosition(i, Math.max(activeRanged.length, this.battleWidth), 'player', 'ranged');
      this.createUnitSprite(activeRanged[i], pos.x, pos.y, 0.7, true);
      this.playerRangedIds.push(activeRanged[i].id);
    }

    // Reinforcements
    for (let i = 0; i < state.reinforcements.length; i++) {
      const unitId = state.reinforcements[i];
      const unit = state.roster.get(unitId);
      if (!unit) continue;
      const def = ALL_UNIT_DEFS[unit.defId];
      if (!def) continue;
      const arenaUnit = this.unitToPreviewArenaUnit(unit, def, unitId);
      const col = i % this.battleWidth;
      const row = Math.floor(i / this.battleWidth);
      const pos = this.slotPosition(col, this.battleWidth, 'player', 'reinforcement');
      this.createUnitSprite(arenaUnit, pos.x, pos.y + row * 35, 0.5, true);
    }

    // Bench
    for (let i = 0; i < state.bench.length; i++) {
      const unitId = state.bench[i];
      const unit = state.roster.get(unitId);
      if (!unit) continue;
      const def = ALL_UNIT_DEFS[unit.defId];
      if (!def) continue;
      const arenaUnit = this.unitToPreviewArenaUnit(unit, def, unitId);
      const col = i % this.battleWidth;
      const row = Math.floor(i / this.battleWidth);
      const pos = this.slotPosition(col, this.battleWidth, 'player', 'bench');
      this.createUnitSprite(arenaUnit, pos.x, pos.y + row * 35, 0.3, true);
    }

    // Player count label
    const totalPlayer = state.battleRoster.length + state.reinforcements.length + state.bench.length;
    const playerCountLabel = new Text({
      text: `${state.battleRoster.length} active, ${state.reinforcements.length} reinforcements, ${state.bench.length} bench`,
      style: { fontSize: 10, fill: 0x6688aa, fontFamily: 'Segoe UI, system-ui, sans-serif' },
      resolution: TEXT_RESOLUTION,
    });
    playerCountLabel.anchor.set(0.5, 0);
    playerCountLabel.x = 0;
    playerCountLabel.y = FRONTLINE_GAP + BENCH_OFFSET + 30;
    playerCountLabel.alpha = 0.6;
    this.labelLayer.addChild(playerCountLabel);
  }

  // ── Row Labels ──

  private drawRowLabels(battleWidth: number): void {
    const halfW = Math.max(battleWidth, 4) * SLOT_SPACING / 2 + ARENA_PADDING_X;
    const labelX = -halfW + 12;
    const labelStyle = { fontSize: 7, fontFamily: 'Segoe UI, system-ui, sans-serif', letterSpacing: 1 };

    const labels: { text: string; y: number; color: number }[] = [
      // Enemy labels
      { text: 'FRONTLINE', y: 0, color: 0xcc6644 },
      { text: 'RANGED', y: -RANGED_OFFSET, color: 0xcc6644 },
      { text: 'RESERVES', y: -REINFORCE_OFFSET, color: 0xcc6644 },
      // Player labels
      { text: 'ACTIVE', y: FRONTLINE_GAP, color: 0x4488cc },
      { text: 'RANGED', y: FRONTLINE_GAP + RANGED_OFFSET, color: 0x4488cc },
      { text: 'REINFORCEMENTS', y: FRONTLINE_GAP + REINFORCE_OFFSET, color: 0x4488cc },
      { text: 'BENCH', y: FRONTLINE_GAP + BENCH_OFFSET, color: 0x666688 },
    ];

    for (const { text, y, color } of labels) {
      const label = new Text({
        text,
        style: { ...labelStyle, fill: color },
        resolution: TEXT_RESOLUTION,
      });
      label.anchor.set(0, 0.5);
      label.x = labelX;
      label.y = y;
      label.alpha = 0.5;
      this.labelLayer.addChild(label);
    }
  }

  // ── Arena Bounds ──

  /** Returns the arena bounds in local coordinates for the battle view */
  getBattleBounds(): { top: number; bottom: number; width: number } {
    const halfW = Math.max(this.battleWidth, 4) * SLOT_SPACING / 2 + ARENA_PADDING_X;
    return {
      top: -ARENA_PADDING_TOP,
      bottom: FRONTLINE_GAP + REINFORCE_OFFSET + ARENA_PADDING_BOTTOM,
      width: halfW * 2,
    };
  }

  // ── Row Separators ──

  private drawRowSeparators(battleWidth: number): void {
    const halfW = Math.max(battleWidth, 4) * SLOT_SPACING / 2 + ARENA_PADDING_X;
    const lineX1 = -halfW + 40;
    const lineX2 = halfW - 40;
    const color = 0x555555;
    const alpha = 0.25;
    const dashLen = 6;
    const gapLen = 4;

    // Midpoints between adjacent rows
    const separatorYs = [
      // Enemy: between frontline (0) and ranged (-60)
      -30,
      // Enemy: between ranged (-60) and reserves (-100)
      -80,
      // Player: between frontline (140) and ranged (200)
      FRONTLINE_GAP + 30,
      // Player: between ranged (200) and reinforcements (240 = 100)
      FRONTLINE_GAP + 80,
      // Player: between reinforcements (240) and bench (300 = 160)
      FRONTLINE_GAP + 130,
    ];

    for (const y of separatorYs) {
      const line = new Graphics();
      let x = lineX1;
      while (x < lineX2) {
        const end = Math.min(x + dashLen, lineX2);
        line.moveTo(x, y);
        line.lineTo(end, y);
        x = end + gapLen;
      }
      line.stroke({ color, width: 1, alpha });
      this.bgLayer.addChild(line);
    }
  }

  // ── Slot Markers ──

  /** Draw faint circle outlines at each frontline slot position */
  private drawSlotMarkers(battleWidth: number): void {
    const gfx = new Graphics();
    const radius = UNIT_RADIUS + 2;
    const color = 0xffffff;
    const alpha = 0.08;

    for (let i = 0; i < battleWidth; i++) {
      // Enemy frontline slots
      const ePos = this.slotPosition(i, battleWidth, 'enemy', 'frontline');
      gfx.circle(ePos.x, ePos.y, radius);
      gfx.stroke({ color, width: 1, alpha });

      // Player frontline slots
      const pPos = this.slotPosition(i, battleWidth, 'player', 'frontline');
      gfx.circle(pPos.x, pPos.y, radius);
      gfx.stroke({ color, width: 1, alpha });
    }

    this.bgLayer.addChild(gfx);
  }

  // ── Targeting Arrows ──

  /** Find the target slot for a melee unit using the same logic as battle.ts */
  private findPreviewTarget(enemyLine: (string | null)[], slotIndex: number): string | null {
    if (enemyLine[slotIndex]) return enemyLine[slotIndex];
    for (let offset = 1; offset < enemyLine.length; offset++) {
      const left = slotIndex - offset;
      const right = slotIndex + offset;
      if (left >= 0 && enemyLine[left]) return enemyLine[left];
      if (right < enemyLine.length && enemyLine[right]) return enemyLine[right];
    }
    return null;
  }

  /** Draw a small arrow on each combat unit pointing at its actual target */
  private drawTargetingArrows(): void {
    const color = 0xcc4444;
    const alpha = 0.3;
    const headSize = 5;

    const drawArrowToTarget = (sprite: UnitSprite, target: UnitSprite) => {
      // Direction from this unit toward target in arena-local coords
      const dx = target.baseX - sprite.baseX;
      const dy = target.baseY - sprite.baseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      const nx = dx / dist;
      const ny = dy / dist;
      const startDist = (sprite.unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS) + 4;
      const tipDist = startDist + 8;

      // Arrow tip position (relative to unit center)
      const tipX = nx * tipDist;
      const tipY = ny * tipDist;

      // Perpendicular for arrowhead base
      const px = -ny * headSize;
      const py = nx * headSize;
      const baseX = nx * startDist;
      const baseY = ny * startDist;

      const arrow = new Graphics();
      arrow.moveTo(tipX, tipY);
      arrow.lineTo(baseX + px, baseY + py);
      arrow.lineTo(baseX - px, baseY - py);
      arrow.lineTo(tipX, tipY);
      arrow.fill({ color, alpha });

      sprite.container.addChild(arrow);
    };

    // Player frontline → find target in enemy frontline
    for (let i = 0; i < this.playerFrontlineIds.length; i++) {
      const id = this.playerFrontlineIds[i];
      if (!id) continue;
      const sprite = this.unitSprites.get(id);
      if (!sprite) continue;
      const targetId = this.findPreviewTarget(this.enemyFrontlineIds, i);
      if (!targetId) continue;
      const target = this.unitSprites.get(targetId);
      if (target) drawArrowToTarget(sprite, target);
    }

    // Player ranged → target first enemy frontline unit (tick 0 logic)
    const enemyFrontlineTargets = this.enemyFrontlineIds.filter((id): id is string => id !== null);
    if (enemyFrontlineTargets.length > 0) {
      for (const id of this.playerRangedIds) {
        const sprite = this.unitSprites.get(id);
        if (!sprite) continue;
        const target = this.unitSprites.get(enemyFrontlineTargets[0]);
        if (target) drawArrowToTarget(sprite, target);
      }
    }

    // Enemy frontline → find target in player frontline
    for (let i = 0; i < this.enemyFrontlineIds.length; i++) {
      const id = this.enemyFrontlineIds[i];
      if (!id) continue;
      const sprite = this.unitSprites.get(id);
      if (!sprite) continue;
      const targetId = this.findPreviewTarget(this.playerFrontlineIds, i);
      if (!targetId) continue;
      const target = this.unitSprites.get(targetId);
      if (target) drawArrowToTarget(sprite, target);
    }

    // Enemy ranged → target first player frontline unit (tick 0 logic)
    const playerFrontlineTargets = this.playerFrontlineIds.filter((id): id is string => id !== null);
    if (playerFrontlineTargets.length > 0) {
      for (const id of this.enemyRangedIds) {
        const sprite = this.unitSprites.get(id);
        if (!sprite) continue;
        const target = this.unitSprites.get(playerFrontlineTargets[0]);
        if (target) drawArrowToTarget(sprite, target);
      }
    }
  }

  // ── Battle Setup ──

  setupBattle(snapshot: ArenaSnapshot): void {
    this.clear();
    this.battleWidth = snapshot.battleWidth;

    this.drawArenaBackground(snapshot.battleWidth, 'battle');

    // Enemy frontline
    for (let i = 0; i < snapshot.battleWidth; i++) {
      const unit = snapshot.enemyFrontline[i];
      if (unit) {
        const pos = this.slotPosition(i, snapshot.battleWidth, 'enemy', 'frontline');
        this.createUnitSprite(unit, pos.x, pos.y);
      }
    }

    // Enemy ranged
    for (let i = 0; i < snapshot.enemyRanged.length; i++) {
      const unit = snapshot.enemyRanged[i];
      const pos = this.slotPosition(i, Math.max(snapshot.enemyRanged.length, snapshot.battleWidth), 'enemy', 'ranged');
      this.createUnitSprite(unit, pos.x, pos.y);
    }

    // Enemy reinforcements
    for (let i = 0; i < snapshot.enemyReinforcements.length; i++) {
      const unit = snapshot.enemyReinforcements[i];
      const col = i % snapshot.battleWidth;
      const row = Math.floor(i / snapshot.battleWidth);
      const pos = this.slotPosition(col, snapshot.battleWidth, 'enemy', 'reinforcement');
      this.createUnitSprite(unit, pos.x, pos.y - row * 35, 0.5);
    }

    // Player frontline
    for (let i = 0; i < snapshot.battleWidth; i++) {
      const unit = snapshot.playerFrontline[i];
      if (unit) {
        const pos = this.slotPosition(i, snapshot.battleWidth, 'player', 'frontline');
        this.createUnitSprite(unit, pos.x, pos.y);
      }
    }

    // Player ranged
    for (let i = 0; i < snapshot.playerRanged.length; i++) {
      const unit = snapshot.playerRanged[i];
      const pos = this.slotPosition(i, Math.max(snapshot.playerRanged.length, snapshot.battleWidth), 'player', 'ranged');
      this.createUnitSprite(unit, pos.x, pos.y);
    }

    // Player reinforcements
    for (let i = 0; i < snapshot.playerReinforcements.length; i++) {
      const unit = snapshot.playerReinforcements[i];
      const col = i % snapshot.battleWidth;
      const row = Math.floor(i / snapshot.battleWidth);
      const pos = this.slotPosition(col, snapshot.battleWidth, 'player', 'reinforcement');
      this.createUnitSprite(unit, pos.x, pos.y + row * 35, 0.5);
    }
  }

  // ── Tick Animation ──

  async applyTick(events: BattleEvent[], _speed: number): Promise<void> {
    // Phase 1: All attacks animate concurrently
    const attackAnims: Promise<void>[] = [];
    for (const event of events) {
      if (event.type === 'melee_attack') {
        attackAnims.push(this.animateMeleeAttack(event.attackerId, event.targetId, event.damage));
      } else if (event.type === 'ranged_attack') {
        attackAnims.push(this.animateRangedAttack(event.attackerId, event.targetId, event.damage));
      }
    }
    if (attackAnims.length > 0) await Promise.all(attackAnims);

    // Phase 2: Deaths after attacks resolve
    const deathAnims: Promise<void>[] = [];
    for (const event of events) {
      if (event.type === 'unit_died') {
        deathAnims.push(this.animateDeath(event.unitId));
      }
    }
    if (deathAnims.length > 0) await Promise.all(deathAnims);

    // Phase 3: Reinforcements after deaths
    const reinforceAnims: Promise<void>[] = [];
    for (const event of events) {
      if (event.type === 'reinforcement') {
        reinforceAnims.push(this.animateReinforcement(event.unitId, event.side, event.slotIndex));
      }
    }
    if (reinforceAnims.length > 0) await Promise.all(reinforceAnims);
  }

  /** Apply tick events instantly (for skip) */
  applyTickInstant(events: BattleEvent[]): void {
    for (const event of events) {
      switch (event.type) {
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
            sprite.container.visible = false;
            this.unitSprites.delete(event.unitId);
          }
          break;
        }
        case 'reinforcement': {
          const sprite = this.unitSprites.get(event.unitId);
          if (sprite) {
            const pos = this.slotPosition(event.slotIndex, this.battleWidth, event.side, 'frontline');
            sprite.container.x = pos.x;
            sprite.container.y = pos.y;
            sprite.baseX = pos.x;
            sprite.baseY = pos.y;
            sprite.container.alpha = 1;
          }
          break;
        }
      }
    }
  }

  // ── Animation Helpers ──

  private async animateMeleeAttack(attackerId: string, targetId: string, damage: number): Promise<void> {
    const attacker = this.unitSprites.get(attackerId);
    const target = this.unitSprites.get(targetId);
    if (!attacker || !target) return;

    // Calculate lunge: charge 35% of the distance toward target
    const dx = target.baseX - attacker.baseX;
    const dy = target.baseY - attacker.baseY;
    const lungeX = dx * 0.35;
    const lungeY = dy * 0.35;

    // Animate lunge forward (4 steps)
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      attacker.container.x = attacker.baseX + lungeX * t;
      attacker.container.y = attacker.baseY + lungeY * t;
      await this.wait(18);
    }

    // Impact: flash target, update HP, show damage
    target.currentHp = Math.max(0, target.currentHp - damage);
    this.updateHpBar(target);
    this.flashUnit(target);
    this.spawnDamageNumber(target.baseX, target.baseY, damage);
    this.playSfx(() => SFX.hit());

    await this.wait(60);

    // Return to base (3 steps)
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

    // Projectile
    const color = attacker.unit.side === 'player' ? 0x88ff88 : 0xff8888;
    const projectile = new Graphics();
    projectile.circle(0, 0, 4);
    projectile.fill({ color });
    // Glow effect
    const glow = new Graphics();
    glow.circle(0, 0, 8);
    glow.fill({ color, alpha: 0.3 });
    projectile.addChild(glow);

    projectile.x = attacker.baseX;
    projectile.y = attacker.baseY;
    this.effectsLayer.addChild(projectile);

    this.playSfx(() => SFX.shoot());

    // Animate projectile across (10 steps)
    const steps = 10;
    const dx = (target.baseX - attacker.baseX) / steps;
    const dy = (target.baseY - attacker.baseY) / steps;
    for (let i = 0; i < steps; i++) {
      projectile.x += dx;
      projectile.y += dy;
      await this.wait(18);
    }
    projectile.destroy();

    // Impact
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

    // Particle burst
    this.spawnParticles(sprite.baseX, sprite.baseY, getUnitColor(sprite.unit));

    // Shrink + fade
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      sprite.container.scale.set(1 - (i / steps));
      sprite.container.alpha = 1 - (i / steps);
      await this.wait(25);
    }

    sprite.container.visible = false;
    this.unitSprites.delete(unitId);
  }

  private async animateReinforcement(unitId: string, side: 'player' | 'enemy', slotIndex: number): Promise<void> {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) return;

    const targetPos = this.slotPosition(slotIndex, this.battleWidth, side, 'frontline');
    const startY = side === 'enemy' ? targetPos.y - 60 : targetPos.y + 60;

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

  /** Flash a white overlay on a unit to show impact */
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
      if (frame < 6) {
        requestAnimationFrame(animate);
      } else {
        flash.destroy();
      }
    };
    requestAnimationFrame(animate);
  }

  private spawnDamageNumber(x: number, y: number, damage: number): void {
    const text = new Text({
      text: `-${damage}`,
      style: { fontSize: 14, fontWeight: 'bold', fill: 0xff4444, fontFamily: 'Segoe UI, system-ui, sans-serif' },
      resolution: TEXT_RESOLUTION,
    });
    text.anchor.set(0.5, 0.5);
    text.x = x + (Math.random() - 0.5) * 12;
    text.y = y - 20;
    this.effectsLayer.addChild(text);

    let frame = 0;
    const animate = () => {
      frame++;
      text.y -= 0.8;
      text.alpha = Math.max(0, 1 - frame / 35);
      if (frame < 35) {
        requestAnimationFrame(animate);
      } else {
        text.destroy();
      }
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
        particle.y += vy * 0.8; // slightly flatten
        particle.alpha = Math.max(0, 1 - frame / 20);
        particle.scale.set(Math.max(0.2, 1 - frame / 25));
        if (frame < 20) {
          requestAnimationFrame(animate);
        } else {
          particle.destroy();
        }
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

    // Body circle
    const body = new Graphics();
    body.circle(0, 0, radius);
    body.fill({ color });
    body.stroke({ color: 0x000000, width: 1.5 });
    container.addChild(body);

    // Role indicator letter
    const roleLetters: Record<string, string> = {
      fodder: 'F', melee: 'M', ranged: 'R', glass_cannon: 'G', tank: 'T', animal: 'A',
    };
    const roleLetter = new Text({
      text: roleLetters[unit.role] ?? '?',
      style: { fontSize: 10, fontWeight: 'bold', fill: 0xffffff, fontFamily: 'Segoe UI, system-ui, sans-serif' },
      resolution: TEXT_RESOLUTION,
    });
    roleLetter.anchor.set(0.5, 0.5);
    container.addChild(roleLetter);

    // Name label
    const nameLabel = new Text({
      text: unit.name,
      style: { fontSize: 9, fill: 0xe0d8c0, fontFamily: 'Segoe UI, system-ui, sans-serif' },
      resolution: TEXT_RESOLUTION,
    });
    nameLabel.anchor.set(0.5, 1);
    nameLabel.y = -radius - 8;
    container.addChild(nameLabel);

    // HP bar background
    const hpBg = new Graphics();
    hpBg.roundRect(-HP_BAR_WIDTH / 2, radius + 4, HP_BAR_WIDTH, HP_BAR_HEIGHT, 2);
    hpBg.fill({ color: 0x333333 });
    container.addChild(hpBg);

    // HP bar fill
    const hpBar = new Graphics();
    this.drawHpBar(hpBar, unit.stats.hp, unit.maxHp, radius);
    container.addChild(hpBar);

    // Lives dots
    const livesDots = new Graphics();
    this.drawLivesDots(livesDots, unit.lives, unit.maxLives, radius);
    container.addChild(livesDots);

    // Click handler for preview mode
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
      container,
      body,
      hpBar,
      hpBg,
      nameLabel,
      livesDots,
      unit,
      currentHp: unit.stats.hp,
      baseX: x,
      baseY: y,
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
    const barY = radius + 4;
    if (fillWidth > 0) {
      gfx.roundRect(barX, barY, fillWidth, HP_BAR_HEIGHT, 2);
      gfx.fill({ color });
    }

    // Tick marks at every 5 HP (thin) and every 10 HP (thick)
    if (maxHp > 5) {
      for (let hpVal = 5; hpVal < maxHp; hpVal += 5) {
        const tickX = barX + (HP_BAR_WIDTH * hpVal) / maxHp;
        const isTen = hpVal % 10 === 0;
        gfx.moveTo(tickX, barY);
        gfx.lineTo(tickX, barY + HP_BAR_HEIGHT);
        gfx.stroke({ color: 0x000000, width: isTen ? 1.5 : 1, alpha: isTen ? 0.6 : 0.45 });
      }
    }
  }

  private drawLivesDots(gfx: Graphics, lives: number, maxLives: number, radius: number): void {
    gfx.clear();
    if (maxLives <= 1) return;
    const dotSize = 2.5;
    const gap = 6;
    const totalWidth = (maxLives - 1) * gap;
    const startX = -totalWidth / 2;
    const y = radius + HP_BAR_HEIGHT + 8;

    for (let i = 0; i < maxLives; i++) {
      const x = startX + i * gap;
      gfx.circle(x, y, dotSize);
      if (i < lives) {
        gfx.fill({ color: 0xe06060 });
      } else {
        gfx.stroke({ color: 0x666666, width: 1 });
      }
    }
  }

  private updateHpBar(sprite: UnitSprite): void {
    const radius = sprite.unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS;
    this.drawHpBar(sprite.hpBar, sprite.currentHp, sprite.unit.maxHp, radius);
  }

  // ── Layout ──

  private slotPosition(
    index: number,
    totalSlots: number,
    side: 'player' | 'enemy',
    row: 'frontline' | 'ranged' | 'reinforcement' | 'bench',
  ): { x: number; y: number } {
    const x = (index - (totalSlots - 1) / 2) * SLOT_SPACING;

    let y: number;
    if (side === 'enemy') {
      switch (row) {
        case 'frontline': y = 0; break;
        case 'ranged': y = -RANGED_OFFSET; break;
        case 'reinforcement': y = -REINFORCE_OFFSET; break;
        case 'bench': y = -REINFORCE_OFFSET - 60; break;
      }
    } else {
      switch (row) {
        case 'frontline': y = FRONTLINE_GAP; break;
        case 'ranged': y = FRONTLINE_GAP + RANGED_OFFSET; break;
        case 'reinforcement': y = FRONTLINE_GAP + REINFORCE_OFFSET; break;
        case 'bench': y = FRONTLINE_GAP + BENCH_OFFSET; break;
      }
    }

    return { x, y };
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
    this.unitSprites.clear();
    this.bgLayer.removeChildren();
    this.unitsLayer.removeChildren();
    this.effectsLayer.removeChildren();
    this.labelLayer.removeChildren();
  }

  // ── Utility ──

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
