import type { WaveDef } from '@/core/types';

/** Generate a wave definition based on wave number */
export function generateWave(waveNumber: number): WaveDef {
  const enemies: { defId: string; count: number }[] = [];

  if (waveNumber <= 3) {
    // Early waves: goblins only
    enemies.push({ defId: 'goblin', count: 2 + waveNumber });
    if (waveNumber >= 2) {
      enemies.push({ defId: 'goblin_archer', count: 1 });
    }
  } else if (waveNumber <= 6) {
    // Mid-early: introduce orcs
    enemies.push({ defId: 'goblin', count: 2 + Math.floor(waveNumber / 2) });
    enemies.push({ defId: 'orc_warrior', count: Math.floor(waveNumber / 2) });
    enemies.push({ defId: 'goblin_archer', count: Math.floor(waveNumber / 3) });
  } else if (waveNumber <= 10) {
    // Mid: orc heavy
    enemies.push({ defId: 'goblin', count: 3 });
    enemies.push({ defId: 'orc_warrior', count: waveNumber - 3 });
    enemies.push({ defId: 'orc_brute', count: Math.floor(waveNumber / 4) });
    enemies.push({ defId: 'goblin_archer', count: Math.floor(waveNumber / 2) });
  } else {
    // Late: trolls and heavy composition
    enemies.push({ defId: 'orc_warrior', count: waveNumber - 4 });
    enemies.push({ defId: 'orc_brute', count: Math.floor(waveNumber / 3) });
    enemies.push({ defId: 'troll', count: Math.floor((waveNumber - 8) / 2) });
    enemies.push({ defId: 'goblin_archer', count: Math.floor(waveNumber / 2) });
  }

  // Filter out zero counts
  return {
    waveNumber,
    enemies: enemies.filter((e) => e.count > 0),
  };
}

/** Calculate BP reward for a wave */
export function calculateBP(waveNumber: number, won: boolean): number {
  const base = waveNumber;
  return won ? base * 2 : Math.max(1, Math.floor(base / 2));
}
