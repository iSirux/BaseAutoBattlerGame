import { Container, Graphics, Text } from "pixi.js";
import type { ArenaUnit } from "@/simulation/battleLog";
import type { ArenaContext, UnitSprite } from "./arenaTypes";
import {
  UNIT_RADIUS,
  BOSS_RADIUS,
  HP_BAR_WIDTH,
  HP_BAR_HEIGHT,
  TEXT_RESOLUTION,
  getUnitColor,
} from "./arenaTypes";

// ── HP / Lives / Cooldown Drawing ──

export function drawHpBar(
  gfx: Graphics,
  hp: number,
  maxHp: number,
  radius: number,
): void {
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

export function drawLivesDots(
  gfx: Graphics,
  lives: number,
  maxLives: number,
  radius: number,
): void {
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

export function drawCooldownArc(sprite: UnitSprite): void {
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

export function updateHpBar(sprite: UnitSprite): void {
  const radius = sprite.unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS;
  drawHpBar(sprite.hpBar, sprite.currentHp, sprite.unit.maxHp, radius);
}

// ── Visual Effects ──

export function flashUnit(sprite: UnitSprite): void {
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

export function spawnDamageNumber(
  effectsLayer: Container,
  x: number,
  y: number,
  damage: number,
): void {
  const text = new Text({
    text: `-${damage}`,
    style: {
      fontSize: 13,
      fontWeight: "bold",
      fill: 0xff4444,
      fontFamily: "Segoe UI, system-ui, sans-serif",
    },
    resolution: TEXT_RESOLUTION,
  });
  text.anchor.set(0.5, 0.5);
  text.x = x + (Math.random() - 0.5) * 10;
  text.y = y - 18;
  effectsLayer.addChild(text);
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

export function spawnParticles(
  effectsLayer: Container,
  x: number,
  y: number,
  color: number,
): void {
  for (let i = 0; i < 8; i++) {
    const particle = new Graphics();
    particle.circle(0, 0, 2.5);
    particle.fill({ color });
    particle.x = x;
    particle.y = y;
    effectsLayer.addChild(particle);
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

export function createUnitSprite(
  ctx: ArenaContext,
  unit: ArenaUnit,
  x: number,
  y: number,
  alpha: number = 1,
  clickable: boolean = false,
): UnitSprite {
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
    fodder: "F",
    melee: "M",
    ranged: "R",
    glass_cannon: "G",
    tank: "T",
    animal: "A",
  };
  const roleLetter = new Text({
    text: roleLetters[unit.role] ?? "?",
    style: {
      fontSize: 9,
      fontWeight: "bold",
      fill: 0xffffff,
      fontFamily: "Segoe UI, system-ui, sans-serif",
    },
    resolution: TEXT_RESOLUTION,
  });
  roleLetter.anchor.set(0.5, 0.5);
  container.addChild(roleLetter);

  // Equipment indicators
  if (unit.equipment) {
    const eqGfx = new Graphics();
    const r = radius + 2;
    if (unit.equipment.weapon) {
      eqGfx.circle(r * Math.cos(0), r * Math.sin(0), 3.5);
      eqGfx.fill({ color: 0xff8844 });
    }
    if (unit.equipment.armor) {
      eqGfx.circle(r * Math.cos(Math.PI), r * Math.sin(Math.PI), 3.5);
      eqGfx.fill({ color: 0x4488ff });
    }
    if (unit.equipment.shield) {
      const angle = Math.PI * 1.3;
      eqGfx.circle(r * Math.cos(angle), r * Math.sin(angle), 3.5);
      eqGfx.fill({ color: 0x44cc44 });
    }
    container.addChild(eqGfx);
  }

  const nameLabel = new Text({
    text: unit.name,
    style: {
      fontSize: 8,
      fill: 0xe0d8c0,
      fontFamily: "Segoe UI, system-ui, sans-serif",
    },
    resolution: TEXT_RESOLUTION,
  });
  nameLabel.anchor.set(0.5, 1);
  nameLabel.y = -radius - 0;
  container.addChild(nameLabel);

  const cooldownArc = new Graphics();
  container.addChild(cooldownArc);

  const hpBg = new Graphics();
  hpBg.roundRect(
    -HP_BAR_WIDTH / 2,
    radius + 3,
    HP_BAR_WIDTH,
    HP_BAR_HEIGHT,
    2,
  );
  hpBg.fill({ color: 0x333333 });
  container.addChild(hpBg);

  const hpBar = new Graphics();
  drawHpBar(hpBar, unit.stats.hp, unit.maxHp, radius);
  container.addChild(hpBar);

  const livesDots = new Graphics();
  drawLivesDots(livesDots, unit.lives, unit.maxLives, radius);
  container.addChild(livesDots);

  if (clickable) {
    container.eventMode = "static";
    container.cursor = "pointer";
    container.on("pointertap", (e) => {
      if (unit.side === "player") {
        ctx.onPlayerUnitClick?.(unit.id, unit.defId, e.globalX, e.globalY);
      } else {
        ctx.onEnemyClick?.(unit.defId, e.globalX, e.globalY);
      }
    });
  }

  ctx.unitsLayer.addChild(container);

  const sprite: UnitSprite = {
    container,
    body,
    hpBar,
    hpBg,
    nameLabel,
    livesDots,
    cooldownArc,
    cooldownTimer: 0,
    unit,
    currentHp: unit.stats.hp,
    baseX: x,
    baseY: y,
  };
  ctx.unitSprites.set(unit.id, sprite);
  return sprite;
}
