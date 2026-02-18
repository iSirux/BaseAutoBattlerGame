import { Graphics } from "pixi.js";
import type { BattleState, HexCoord } from "@/core/types";
import type { BattleEvent } from "@/simulation/battleLog";
import { SFX } from "@/audio/sfx";
import type { ArenaContext, UnitSprite } from "./arenaTypes";
import { UNIT_RADIUS, BOSS_RADIUS, getUnitColor } from "./arenaTypes";
import {
  updateHpBar,
  drawLivesDots,
  drawCooldownArc,
  flashUnit,
  spawnDamageNumber,
  spawnParticles,
} from "./arenaSprites";

// ── Process Battle Events ──

export function processEvents(
  ctx: ArenaContext,
  events: BattleEvent[],
): void {
  for (const event of events) {
    switch (event.type) {
      case "unit_moved": {
        const sprite = ctx.unitSprites.get(event.unitId);
        if (!sprite) break;
        const target = ctx.hexToPixelLocal(event.to);
        sprite.moveAnim = {
          fromX: sprite.container.x,
          fromY: sprite.container.y,
          toX: target.x,
          toY: target.y,
          elapsed: 0,
          duration: 120,
        };
        sprite.baseX = target.x;
        sprite.baseY = target.y;
        break;
      }

      case "melee_attack": {
        const attacker = ctx.unitSprites.get(event.attackerId);
        const target = ctx.unitSprites.get(event.targetId);
        if (!attacker || !target) break;
        const dx = target.baseX - attacker.baseX;
        const dy = target.baseY - attacker.baseY;
        attacker.attackAnim = {
          type: "melee",
          targetId: event.targetId,
          damage: event.damage,
          elapsed: 0,
          impactAt: 72,
          duration: 186,
          impacted: false,
          lungeX: dx * 0.35,
          lungeY: dy * 0.35,
        };
        break;
      }

      case "ranged_attack": {
        const attacker = ctx.unitSprites.get(event.attackerId);
        const target = ctx.unitSprites.get(event.targetId);
        if (!attacker || !target) break;
        const color =
          attacker.unit.side === "player" ? 0x88ff88 : 0xff8888;
        const projectile = new Graphics();
        projectile.circle(0, 0, 4);
        projectile.fill({ color });
        const glow = new Graphics();
        glow.circle(0, 0, 8);
        glow.fill({ color, alpha: 0.3 });
        projectile.addChild(glow);
        projectile.x = attacker.baseX;
        projectile.y = attacker.baseY;
        ctx.effectsLayer.addChild(projectile);
        ctx.playSfx(() => SFX.shoot());
        attacker.attackAnim = {
          type: "ranged",
          targetId: event.targetId,
          damage: event.damage,
          elapsed: 0,
          impactAt: 180,
          duration: 220,
          impacted: false,
          projectile,
          fromX: attacker.baseX,
          fromY: attacker.baseY,
          toX: target.baseX,
          toY: target.baseY,
        };
        break;
      }

      case "unit_died": {
        const sprite = ctx.unitSprites.get(event.unitId);
        if (!sprite) break;
        if (event.livesRemaining <= 0) {
          ctx.playSfx(() => SFX.death());
          spawnParticles(
            ctx.effectsLayer,
            sprite.baseX,
            sprite.baseY,
            getUnitColor(sprite.unit),
          );
          sprite.deathAnim = { elapsed: 0, duration: 250, isFull: true };
        } else {
          sprite.deathAnim = {
            elapsed: 0,
            duration: 300,
            isFull: false,
            livesRemaining: event.livesRemaining,
          };
        }
        break;
      }

      case "reinforcement": {
        const sprite = ctx.unitSprites.get(event.unitId);
        if (!sprite) break;
        const target = ctx.hexToPixelLocal(event.hex);
        sprite.reinforceAnim = {
          fromX: sprite.container.x,
          fromY: sprite.container.y,
          toX: target.x,
          toY: target.y,
          elapsed: 0,
          duration: 250,
        };
        sprite.container.visible = true;
        sprite.baseX = target.x;
        sprite.baseY = target.y;
        break;
      }
    }
  }
}

// ── Update Battle Animations ──

export function updateBattleAnimations(
  ctx: ArenaContext,
  dt: number,
  battleState: BattleState,
): void {
  const dtMs = dt * 1000;
  const toDelete: string[] = [];

  for (const [unitId, sprite] of ctx.unitSprites) {
    // ── Move animation ──
    if (sprite.moveAnim) {
      const anim = sprite.moveAnim;
      anim.elapsed += dtMs;
      const t = Math.min(1, anim.elapsed / anim.duration);
      sprite.container.x = anim.fromX + (anim.toX - anim.fromX) * t;
      sprite.container.y = anim.fromY + (anim.toY - anim.fromY) * t;
      if (t >= 1) {
        sprite.container.x = anim.toX;
        sprite.container.y = anim.toY;
        sprite.moveAnim = undefined;
      }
    }

    // ── Attack animation ──
    if (sprite.attackAnim) {
      const anim = sprite.attackAnim;
      anim.elapsed += dtMs;

      if (anim.type === "melee") {
        const lungeX = anim.lungeX!;
        const lungeY = anim.lungeY!;
        const holdEnd = anim.impactAt + 60;

        if (anim.elapsed <= anim.impactAt) {
          const t = anim.elapsed / anim.impactAt;
          sprite.container.x = sprite.baseX + lungeX * t;
          sprite.container.y = sprite.baseY + lungeY * t;
        } else if (anim.elapsed <= holdEnd) {
          sprite.container.x = sprite.baseX + lungeX;
          sprite.container.y = sprite.baseY + lungeY;
        } else {
          const recoilDuration = anim.duration - holdEnd;
          const t = Math.min(
            1,
            (anim.elapsed - holdEnd) / recoilDuration,
          );
          sprite.container.x = sprite.baseX + lungeX * (1 - t);
          sprite.container.y = sprite.baseY + lungeY * (1 - t);
        }

        if (!anim.impacted && anim.elapsed >= anim.impactAt) {
          anim.impacted = true;
          const target = ctx.unitSprites.get(anim.targetId);
          if (target) {
            target.currentHp = Math.max(0, target.currentHp - anim.damage);
            updateHpBar(target);
            flashUnit(target);
            spawnDamageNumber(ctx.effectsLayer, target.baseX, target.baseY, anim.damage);
            ctx.playSfx(() => SFX.hit());
          }
        }
      } else {
        // Ranged: move projectile toward target
        const projectile = anim.projectile;
        if (projectile && !anim.impacted) {
          const t = Math.min(1, anim.elapsed / anim.impactAt);
          projectile.x = anim.fromX! + (anim.toX! - anim.fromX!) * t;
          projectile.y = anim.fromY! + (anim.toY! - anim.fromY!) * t;
        }

        if (!anim.impacted && anim.elapsed >= anim.impactAt) {
          anim.impacted = true;
          if (projectile) {
            projectile.destroy();
            anim.projectile = undefined;
          }
          const target = ctx.unitSprites.get(anim.targetId);
          if (target) {
            target.currentHp = Math.max(0, target.currentHp - anim.damage);
            updateHpBar(target);
            flashUnit(target);
            spawnDamageNumber(ctx.effectsLayer, target.baseX, target.baseY, anim.damage);
            ctx.playSfx(() => SFX.hit());
          }
        }
      }

      if (anim.elapsed >= anim.duration) {
        sprite.container.x = sprite.baseX;
        sprite.container.y = sprite.baseY;
        sprite.attackAnim = undefined;
      }
    }

    // ── Death animation ──
    if (sprite.deathAnim) {
      const anim = sprite.deathAnim;
      anim.elapsed += dtMs;

      if (anim.isFull) {
        const t = Math.min(1, anim.elapsed / anim.duration);
        sprite.container.scale.set(1 - t);
        sprite.container.alpha = 1 - t;
        if (anim.elapsed >= anim.duration) {
          sprite.container.visible = false;
          toDelete.push(unitId);
        }
      } else {
        const blinkPhase = Math.floor(anim.elapsed / 50) % 2;
        sprite.container.alpha = blinkPhase === 0 ? 0.2 : 1.0;
        if (anim.elapsed >= anim.duration) {
          sprite.container.alpha = 1;
          if (anim.livesRemaining !== undefined) {
            sprite.unit.lives = anim.livesRemaining;
          } else {
            sprite.unit.lives = Math.max(0, sprite.unit.lives - 1);
          }
          sprite.currentHp = sprite.unit.maxHp;
          updateHpBar(sprite);
          const radius = sprite.unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS;
          drawLivesDots(
            sprite.livesDots,
            sprite.unit.lives,
            sprite.unit.maxLives,
            radius,
          );
          sprite.deathAnim = undefined;
        }
      }
    }

    // ── Reinforcement animation ──
    if (sprite.reinforceAnim) {
      const anim = sprite.reinforceAnim;
      anim.elapsed += dtMs;
      const t = Math.min(1, anim.elapsed / anim.duration);
      const ease = 1 - Math.pow(1 - t, 2);
      sprite.container.x = anim.fromX + (anim.toX - anim.fromX) * ease;
      sprite.container.y = anim.fromY + (anim.toY - anim.fromY) * ease;
      sprite.container.alpha = 0.4 + 0.6 * ease;
      if (t >= 1) {
        sprite.container.x = anim.toX;
        sprite.container.y = anim.toY;
        sprite.container.alpha = 1;
        sprite.reinforceAnim = undefined;
      }
    }

    // ── Cooldown arc: read live value from BattleState ──
    const bsUnit =
      battleState.playerUnits.get(unitId) ??
      battleState.enemyUnits.get(unitId);
    if (bsUnit) {
      sprite.cooldownTimer = bsUnit.cooldownTimer;
      drawCooldownArc(sprite);
    }
  }

  for (const id of toDelete) {
    ctx.unitSprites.delete(id);
  }
}

// ── Show Final State (skip mode) ──

export function showFinalState(
  ctx: ArenaContext,
  battleState: BattleState,
  hexToPixelLocal: (coord: HexCoord) => { x: number; y: number },
): void {
  for (const sprite of ctx.unitSprites.values()) {
    if (sprite.attackAnim?.projectile) {
      sprite.attackAnim.projectile.destroy();
    }
    sprite.moveAnim = undefined;
    sprite.attackAnim = undefined;
    sprite.deathAnim = undefined;
    sprite.reinforceAnim = undefined;
    sprite.container.scale.set(1);
    sprite.container.alpha = 1;
  }

  const activeIds = new Set([
    ...battleState.playerUnits.keys(),
    ...battleState.enemyUnits.keys(),
  ]);

  const toDelete: string[] = [];
  for (const [unitId, sprite] of ctx.unitSprites) {
    if (activeIds.has(unitId)) {
      const unitHex = battleState.unitPositions.get(unitId);
      if (unitHex) {
        const pos = hexToPixelLocal(unitHex);
        sprite.container.x = pos.x;
        sprite.container.y = pos.y;
        sprite.baseX = pos.x;
        sprite.baseY = pos.y;
        sprite.container.visible = true;
        sprite.container.alpha = 1;

        const unit =
          battleState.playerUnits.get(unitId) ??
          battleState.enemyUnits.get(unitId);
        if (unit) {
          sprite.currentHp = unit.stats.hp;
          updateHpBar(sprite);
          sprite.unit.lives = unit.lives;
          const radius = sprite.unit.isBoss ? BOSS_RADIUS : UNIT_RADIUS;
          drawLivesDots(
            sprite.livesDots,
            unit.lives,
            unit.maxLives,
            radius,
          );
        }
      }
    } else {
      sprite.container.visible = false;
      toDelete.push(unitId);
    }
  }
  for (const id of toDelete) ctx.unitSprites.delete(id);

  for (const sprite of ctx.unitSprites.values()) {
    sprite.cooldownTimer = 0;
    drawCooldownArc(sprite);
  }
}
