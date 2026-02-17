import { Container, Graphics, Text } from 'pixi.js';
import type { WaveDef, UnitRole } from '@/core/types';
import type { ArenaSnapshot, ArenaUnit, BattleEvent } from '@/simulation/battleLog';
import { ENEMY_DEFS } from '@/data/units';
import { SFX } from '@/audio/sfx';

// ── Layout Constants ──

const SLOT_SPACING = 50;
const FRONTLINE_GAP = 140;
const RANGED_OFFSET = 60;
const REINFORCE_OFFSET = 100;
const UNIT_RADIUS = 16;
const BOSS_RADIUS = 24;
const HP_BAR_WIDTH = 30;
const HP_BAR_HEIGHT = 4;

/** How far the arena background extends around units */
const ARENA_PADDING_X = 160;
const ARENA_PADDING_TOP = 180;
const ARENA_PADDING_BOTTOM = 60;

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

  /** Callback when an enemy preview unit is clicked */
  onEnemyClick: ((defId: string, screenX: number, screenY: number) => void) | null = null;

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

  private drawArenaBackground(battleWidth: number, mode: 'preview' | 'battle'): void {
    this.bgLayer.removeChildren();

    const halfW = Math.max(battleWidth, 4) * SLOT_SPACING / 2 + ARENA_PADDING_X;
    const top = -ARENA_PADDING_TOP;
    const bottom = (mode === 'battle' ? FRONTLINE_GAP + REINFORCE_OFFSET : 0) + ARENA_PADDING_BOTTOM;
    const w = halfW * 2;
    const h = bottom - top;

    // Dark ground
    const bg = new Graphics();
    bg.roundRect(-halfW, top, w, h, 12);
    bg.fill({ color: 0x0d0d1a, alpha: 0.7 });
    bg.stroke({ color: 0x3a3050, width: 1.5, alpha: 0.5 });
    this.bgLayer.addChild(bg);

    // Dividing line between enemy and player sides
    if (mode === 'battle') {
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
      });
      enemyLabel.anchor.set(0.5, 1);
      enemyLabel.x = 0;
      enemyLabel.y = midY - 6;
      enemyLabel.alpha = 0.4;
      this.bgLayer.addChild(enemyLabel);

      const playerLabel = new Text({
        text: 'YOUR ARMY',
        style: { fontSize: 9, fill: 0x4488cc, fontFamily: 'Segoe UI, system-ui, sans-serif', letterSpacing: 2 },
      });
      playerLabel.anchor.set(0.5, 0);
      playerLabel.x = 0;
      playerLabel.y = midY + 6;
      playerLabel.alpha = 0.4;
      this.bgLayer.addChild(playerLabel);
    }
  }

  // ── Wave Preview ──

  showWavePreview(wave: WaveDef): void {
    this.clear();
    this.battleWidth = 4;

    this.drawArenaBackground(this.battleWidth, 'preview');

    // Title
    const title = new Text({
      text: `Wave ${wave.waveNumber}${wave.isBoss ? ' (BOSS)' : wave.isElite ? ' (ELITE)' : ''}`,
      style: {
        fontSize: 16,
        fontWeight: 'bold',
        fill: wave.isBoss ? 0xccaa44 : wave.isElite ? 0xe08080 : 0xc8a03c,
        fontFamily: 'Segoe UI, system-ui, sans-serif',
      },
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
        const isBoss = ['goblin_king', 'orc_warlord', 'troll_chieftain'].includes(entry.defId);
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

    // Layout frontline
    const frontlineCount = Math.min(melee.length, this.battleWidth);
    for (let i = 0; i < frontlineCount; i++) {
      const pos = this.slotPosition(i, this.battleWidth, 'enemy', 'frontline');
      this.createUnitSprite(melee[i], pos.x, pos.y, 0.6, true);
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
    }

    // Enemy count label
    const countLabel = new Text({
      text: `${enemies.length} enemies`,
      style: { fontSize: 11, fill: 0xaa8866, fontFamily: 'Segoe UI, system-ui, sans-serif' },
    });
    countLabel.anchor.set(0.5, 0);
    countLabel.x = 0;
    countLabel.y = -REINFORCE_OFFSET - 14;
    this.labelLayer.addChild(countLabel);
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
    });
    roleLetter.anchor.set(0.5, 0.5);
    container.addChild(roleLetter);

    // Name label
    const nameLabel = new Text({
      text: unit.name,
      style: { fontSize: 9, fill: 0xe0d8c0, fontFamily: 'Segoe UI, system-ui, sans-serif' },
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
        this.onEnemyClick?.(unit.defId, e.globalX, e.globalY);
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
    if (fillWidth > 0) {
      gfx.roundRect(-HP_BAR_WIDTH / 2, radius + 4, fillWidth, HP_BAR_HEIGHT, 2);
      gfx.fill({ color });
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
    row: 'frontline' | 'ranged' | 'reinforcement',
  ): { x: number; y: number } {
    const x = (index - (totalSlots - 1) / 2) * SLOT_SPACING;

    let y: number;
    if (side === 'enemy') {
      switch (row) {
        case 'frontline': y = 0; break;
        case 'ranged': y = -RANGED_OFFSET; break;
        case 'reinforcement': y = -REINFORCE_OFFSET; break;
      }
    } else {
      switch (row) {
        case 'frontline': y = FRONTLINE_GAP; break;
        case 'ranged': y = FRONTLINE_GAP + RANGED_OFFSET; break;
        case 'reinforcement': y = FRONTLINE_GAP + REINFORCE_OFFSET; break;
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
