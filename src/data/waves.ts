import type { WaveDef } from '@/core/types';

/** Generate a wave definition based on wave number */
export function generateWave(waveNumber: number): WaveDef {
  const isBoss = waveNumber % 10 === 0;
  const isElite = !isBoss && waveNumber % 5 === 0;

  let enemies: { defId: string; count: number }[];

  if (isBoss) {
    enemies = generateBossWave(waveNumber);
  } else if (isElite) {
    enemies = generateEliteWave(waveNumber);
  } else {
    enemies = generateNormalWave(waveNumber);
  }

  return {
    waveNumber,
    enemies: enemies.filter((e) => e.count > 0),
    isElite,
    isBoss,
  };
}

/** Normal wave composition */
function generateNormalWave(waveNumber: number): { defId: string; count: number }[] {
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
  } else if (waveNumber <= 9) {
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

  return enemies;
}

/** Elite wave: tougher composition with more powerful enemies */
function generateEliteWave(waveNumber: number): { defId: string; count: number }[] {
  const enemies: { defId: string; count: number }[] = [];

  if (waveNumber === 5) {
    // First elite: strong orc force
    enemies.push({ defId: 'orc_warrior', count: 4 });
    enemies.push({ defId: 'orc_brute', count: 2 });
    enemies.push({ defId: 'goblin_archer', count: 3 });
  } else if (waveNumber <= 15) {
    // Mid elite: orc + troll mix
    enemies.push({ defId: 'orc_warrior', count: waveNumber - 2 });
    enemies.push({ defId: 'orc_brute', count: Math.floor(waveNumber / 3) });
    enemies.push({ defId: 'troll', count: Math.floor(waveNumber / 5) });
    enemies.push({ defId: 'goblin_archer', count: Math.floor(waveNumber / 2) });
  } else {
    // Late elite: heavy force
    enemies.push({ defId: 'orc_warrior', count: waveNumber - 3 });
    enemies.push({ defId: 'orc_brute', count: Math.floor(waveNumber / 3) + 1 });
    enemies.push({ defId: 'troll', count: Math.floor(waveNumber / 4) });
    enemies.push({ defId: 'goblin_archer', count: Math.floor(waveNumber / 2) });
  }

  return enemies;
}

/** Boss wave: boss enemy + entourage */
function generateBossWave(waveNumber: number): { defId: string; count: number }[] {
  const enemies: { defId: string; count: number }[] = [];

  if (waveNumber === 10) {
    // Goblin King + goblin entourage
    enemies.push({ defId: 'goblin_king', count: 1 });
    enemies.push({ defId: 'goblin', count: 4 });
    enemies.push({ defId: 'goblin_archer', count: 3 });
  } else if (waveNumber === 20) {
    // Orc Warlord + orc warband
    enemies.push({ defId: 'orc_warlord', count: 1 });
    enemies.push({ defId: 'orc_warrior', count: 5 });
    enemies.push({ defId: 'orc_brute', count: 3 });
    enemies.push({ defId: 'goblin_archer', count: 4 });
  } else if (waveNumber === 30) {
    // Troll Chieftain + troll force
    enemies.push({ defId: 'troll_chieftain', count: 1 });
    enemies.push({ defId: 'troll', count: 4 });
    enemies.push({ defId: 'orc_brute', count: 4 });
    enemies.push({ defId: 'goblin_archer', count: 5 });
  } else {
    // Wave 40+: scaled boss waves cycling through bosses
    const bossPool = ['goblin_king', 'orc_warlord', 'troll_chieftain'];
    const bossIdx = Math.floor(waveNumber / 10) % bossPool.length;
    const scaleFactor = Math.floor(waveNumber / 10);
    enemies.push({ defId: bossPool[bossIdx], count: 1 });
    enemies.push({ defId: 'orc_warrior', count: 3 + scaleFactor * 2 });
    enemies.push({ defId: 'orc_brute', count: 2 + scaleFactor });
    enemies.push({ defId: 'troll', count: 1 + scaleFactor });
    enemies.push({ defId: 'goblin_archer', count: 3 + scaleFactor });
  }

  return enemies;
}

/** Calculate BP reward for a wave */
export function calculateBP(waveNumber: number, won: boolean): number {
  const base = waveNumber;
  return won ? base * 2 : Math.max(1, Math.floor(base / 2));
}
