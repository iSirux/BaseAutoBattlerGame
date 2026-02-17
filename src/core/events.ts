/** Minimal typed event emitter for game state changes */

type EventMap = { [key: string]: unknown };

type Listener<T> = (data: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventBus<E extends { [key: string]: any }> {
  private listeners = new Map<keyof E, Set<Listener<any>>>();

  on<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  emit<K extends keyof E>(event: K, data: E[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** Game events */
export interface GameEvents {
  'phase:changed': { from: string; to: string };
  'resources:changed': { wood: number; stone: number; iron: number };
  'building:placed': { buildingId: string };
  'building:removed': { buildingId: string };
  'unit:trained': { unitId: string };
  'unit:died': { unitId: string; livesRemaining: number };
  'unit:eliminated': { unitId: string };
  'battle:tick': { tick: number };
  'battle:started': { totalTicks: number };
  'battle:ended': { winner: 'player' | 'enemy' };
  'wave:started': { wave: number };
  'bp:changed': { bp: number };
  'tech:purchased': { techId: string };
  'card:selected': { cardId: string };
  'relic:gained': { relicId: string };
  'roster:changed': {};
  'base:damaged': { damage: number; remaining: number };
  'game:over': { wave: number };
}

export const gameEvents = new EventBus<GameEvents>();
