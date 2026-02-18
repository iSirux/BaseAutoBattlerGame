import type { Application, Ticker } from 'pixi.js';
import type { BattleState } from '@/core/types';
import type { ArenaSnapshot, BattleEvent } from '@/simulation/battleLog';
import type { ArenaRenderer } from './arena';
import { battleUpdate } from '@/simulation/battle';

export type PlaybackSpeed = 1 | 2 | 4;

/** Base time scale for 1× speed. 2× and 4× multiply from here. */
const BASE_SPEED = 0.35;

export class BattleRunner {
  private battleState: BattleState;
  private arena: ArenaRenderer;
  private app: Application;
  private timeScale: number = BASE_SPEED;
  private isSkipping = false;
  private currentElapsed = 0;
  private tickerFn: ((ticker: Ticker) => void) | null = null;
  private lingerRemaining = -1; // seconds remaining in post-battle linger; -1 = not yet triggered
  onBattleEnd: (() => void) | null = null;
  onTickUpdate: ((elapsed: number) => void) | null = null;

  constructor(
    battleState: BattleState,
    snapshot: ArenaSnapshot,
    arena: ArenaRenderer,
    app: Application,
  ) {
    this.battleState = battleState;
    this.arena = arena;
    this.app = app;
    this.arena.setupBattle(snapshot);
  }

  start(): void {
    this.tickerFn = (ticker) => this.update(ticker);
    this.app.ticker.add(this.tickerFn);
  }

  private update(ticker: Ticker): void {
    if (this.isSkipping) {
      // Fast-forward simulation without animation
      while (!this.battleState.result) {
        battleUpdate(this.battleState, 0.1);
      }
      this.arena.showFinalState(this.battleState);
      this.stop();
      this.onBattleEnd?.();
      return;
    }

    const dt = (ticker.deltaMS / 1000) * this.timeScale;
    this.currentElapsed += dt;

    const events: BattleEvent[] = [];
    const continuing = battleUpdate(
      this.battleState,
      dt,
      (e: BattleEvent) => events.push(e),
    );

    this.arena.processEvents(events);
    this.arena.update(dt, this.battleState);
    this.onTickUpdate?.(this.currentElapsed);

    if (!continuing) {
      if (this.lingerRemaining < 0) {
        // First frame after battle ends — start linger countdown
        this.lingerRemaining = 1.0;
      } else {
        // Keep animating during linger (use real dt, not scaled, so it's always ~1s)
        this.lingerRemaining -= ticker.deltaMS / 1000;
        if (this.lingerRemaining <= 0) {
          this.stop();
          this.onBattleEnd?.();
        }
      }
    }
  }

  stop(): void {
    if (this.tickerFn) {
      this.app.ticker.remove(this.tickerFn);
      this.tickerFn = null;
    }
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.timeScale = BASE_SPEED * speed;
    this.arena.sfxEnabled = speed <= 2;
  }

  skip(): void {
    this.isSkipping = true;
  }
}
