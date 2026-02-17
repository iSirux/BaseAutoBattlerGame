import type { BattleLog } from '@/simulation/battleLog';
import type { ArenaRenderer } from './arena';

export type PlaybackSpeed = 1 | 2 | 4;

export class BattlePlayback {
  private log: BattleLog;
  private arena: ArenaRenderer;
  private speed: PlaybackSpeed = 1;
  private isSkipping = false;
  private currentTick = 0;
  private onTickUpdate: ((tick: number, total: number) => void) | null = null;

  constructor(log: BattleLog, arena: ArenaRenderer) {
    this.log = log;
    this.arena = arena;
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.speed = speed;
    // Throttle SFX at high speeds
    this.arena.sfxEnabled = speed <= 2;
  }

  skip(): void {
    this.isSkipping = true;
  }

  setOnTickUpdate(cb: (tick: number, total: number) => void): void {
    this.onTickUpdate = cb;
  }

  async play(): Promise<void> {
    this.arena.setupBattle(this.log.initialState);

    for (let tick = 0; tick < this.log.events.length; tick++) {
      this.currentTick = tick;
      this.onTickUpdate?.(tick + 1, this.log.totalTicks);

      if (this.isSkipping) {
        // Apply all remaining ticks instantly
        for (let t = tick; t < this.log.events.length; t++) {
          this.arena.applyTickInstant(this.log.events[t]);
        }
        this.onTickUpdate?.(this.log.totalTicks, this.log.totalTicks);
        break;
      }

      const events = this.log.events[tick];
      if (events.length > 0) {
        await this.arena.applyTick(events, this.speed);
      }

      // Inter-tick delay based on speed
      await this.delay();
    }
  }

  private delay(): Promise<void> {
    if (this.isSkipping) return Promise.resolve();
    const baseDelay = 400;
    const ms = Math.floor(baseDelay / this.speed);
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
