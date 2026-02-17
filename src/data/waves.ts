import type { WaveDef, WaveModifier } from '@/core/types';

const WAVE_MODIFIERS: WaveModifier[] = [
  { name: 'Hardened', description: 'Enemies have +5 HP', statChanges: { maxHp: 5, hp: 5 } },
  { name: 'Enraged', description: 'Enemies have +3 ATK', statChanges: { attack: 3 } },
  { name: 'Swift', description: 'Enemies attack 0.3s faster', statChanges: { cooldown: -0.3 } },
  { name: 'Ironclad', description: 'Enemies have +10 HP', statChanges: { maxHp: 10, hp: 10 } },
  { name: 'Frenzied', description: 'Enemies have +5 ATK', statChanges: { attack: 5 } },
];

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

  // Waves 30+ get random modifiers
  let modifier: WaveModifier | undefined;
  if (waveNumber >= 30) {
    modifier = WAVE_MODIFIERS[waveNumber % WAVE_MODIFIERS.length];
  }

  return {
    waveNumber,
    enemies: enemies.filter((e) => e.count > 0),
    isElite,
    isBoss,
    modifier,
  };
}

/** Normal wave composition using era-based enemies */
function generateNormalWave(waveNumber: number): { defId: string; count: number }[] {
  const enemies: { defId: string; count: number }[] = [];

  if (waveNumber <= 9) {
    // Early era: bandits, wild wolves, bandit archers
    enemies.push({ defId: 'bandit', count: 1 + Math.floor(waveNumber / 2) });
    if (waveNumber >= 2) enemies.push({ defId: 'wild_wolf', count: Math.floor(waveNumber / 3) });
    if (waveNumber >= 3) enemies.push({ defId: 'bandit_archer', count: Math.floor(waveNumber / 3) });
    if (waveNumber >= 5) enemies.push({ defId: 'goblin', count: Math.floor(waveNumber / 3) });
    if (waveNumber >= 7) enemies.push({ defId: 'goblin_archer', count: Math.floor(waveNumber / 4) });
  } else if (waveNumber <= 19) {
    // Mid era: orcs, skeletons, dark archers
    const scale = waveNumber - 9;
    enemies.push({ defId: 'orc_warrior', count: 2 + Math.floor(scale / 2) });
    enemies.push({ defId: 'skeleton', count: 1 + Math.floor(scale / 2) });
    enemies.push({ defId: 'goblin_archer', count: 1 + Math.floor(scale / 3) });
    if (waveNumber >= 12) enemies.push({ defId: 'dark_archer', count: Math.floor(scale / 3) });
    if (waveNumber >= 14) enemies.push({ defId: 'orc_brute', count: Math.floor(scale / 3) });
    if (waveNumber >= 16) enemies.push({ defId: 'troll', count: Math.floor(scale / 4) });
  } else if (waveNumber <= 29) {
    // Late era: dark knights, demons, warlocks, siege golems
    const scale = waveNumber - 19;
    enemies.push({ defId: 'orc_warrior', count: 3 + scale });
    enemies.push({ defId: 'dark_knight', count: 1 + Math.floor(scale / 3) });
    enemies.push({ defId: 'demon_imp', count: Math.floor(scale / 2) });
    enemies.push({ defId: 'dark_archer', count: 1 + Math.floor(scale / 3) });
    if (waveNumber >= 22) enemies.push({ defId: 'warlock', count: Math.floor(scale / 4) });
    if (waveNumber >= 25) enemies.push({ defId: 'siege_golem', count: Math.floor(scale / 5) });
    enemies.push({ defId: 'troll', count: Math.floor(scale / 3) });
  } else {
    // Wave 30+: all enemies with scaling
    const scale = waveNumber - 29;
    enemies.push({ defId: 'dark_knight', count: 2 + Math.floor(scale / 2) });
    enemies.push({ defId: 'demon_imp', count: 2 + Math.floor(scale / 2) });
    enemies.push({ defId: 'warlock', count: 1 + Math.floor(scale / 3) });
    enemies.push({ defId: 'siege_golem', count: 1 + Math.floor(scale / 4) });
    enemies.push({ defId: 'orc_brute', count: 2 + Math.floor(scale / 3) });
    enemies.push({ defId: 'troll', count: 1 + Math.floor(scale / 3) });
  }

  return enemies;
}

/** Elite wave: tougher composition */
function generateEliteWave(waveNumber: number): { defId: string; count: number }[] {
  const enemies: { defId: string; count: number }[] = [];

  if (waveNumber === 5) {
    enemies.push({ defId: 'bandit', count: 4 });
    enemies.push({ defId: 'wild_wolf', count: 3 });
    enemies.push({ defId: 'bandit_archer', count: 2 });
  } else if (waveNumber <= 15) {
    enemies.push({ defId: 'orc_warrior', count: waveNumber - 4 });
    enemies.push({ defId: 'skeleton', count: Math.floor(waveNumber / 3) });
    enemies.push({ defId: 'orc_brute', count: Math.floor(waveNumber / 5) });
    enemies.push({ defId: 'dark_archer', count: Math.floor(waveNumber / 4) });
  } else if (waveNumber <= 25) {
    enemies.push({ defId: 'dark_knight', count: 2 + Math.floor(waveNumber / 10) });
    enemies.push({ defId: 'orc_warrior', count: waveNumber - 8 });
    enemies.push({ defId: 'troll', count: Math.floor(waveNumber / 5) });
    enemies.push({ defId: 'warlock', count: Math.floor(waveNumber / 8) });
    enemies.push({ defId: 'dark_archer', count: Math.floor(waveNumber / 4) });
  } else {
    enemies.push({ defId: 'dark_knight', count: 3 + Math.floor(waveNumber / 8) });
    enemies.push({ defId: 'demon_imp', count: 2 + Math.floor(waveNumber / 8) });
    enemies.push({ defId: 'siege_golem', count: 1 + Math.floor(waveNumber / 15) });
    enemies.push({ defId: 'warlock', count: 2 + Math.floor(waveNumber / 10) });
    enemies.push({ defId: 'troll', count: Math.floor(waveNumber / 6) });
  }

  return enemies;
}

/** Boss wave: boss enemy + entourage */
function generateBossWave(waveNumber: number): { defId: string; count: number }[] {
  const enemies: { defId: string; count: number }[] = [];

  if (waveNumber === 10) {
    enemies.push({ defId: 'goblin_king', count: 1 });
    enemies.push({ defId: 'goblin', count: 4 });
    enemies.push({ defId: 'goblin_archer', count: 3 });
  } else if (waveNumber === 20) {
    enemies.push({ defId: 'orc_warlord', count: 1 });
    enemies.push({ defId: 'orc_warrior', count: 5 });
    enemies.push({ defId: 'orc_brute', count: 3 });
    enemies.push({ defId: 'dark_archer', count: 4 });
  } else if (waveNumber === 30) {
    enemies.push({ defId: 'troll_chieftain', count: 1 });
    enemies.push({ defId: 'troll', count: 4 });
    enemies.push({ defId: 'dark_knight', count: 3 });
    enemies.push({ defId: 'warlock', count: 3 });
  } else {
    // Wave 40+: scaled boss waves cycling through bosses
    const bossPool = ['goblin_king', 'orc_warlord', 'troll_chieftain'];
    const bossIdx = Math.floor(waveNumber / 10) % bossPool.length;
    const scaleFactor = Math.floor(waveNumber / 10);
    enemies.push({ defId: bossPool[bossIdx], count: 1 });
    enemies.push({ defId: 'dark_knight', count: 2 + scaleFactor });
    enemies.push({ defId: 'demon_imp', count: 1 + scaleFactor });
    enemies.push({ defId: 'siege_golem', count: scaleFactor });
    enemies.push({ defId: 'warlock', count: 1 + scaleFactor });
  }

  return enemies;
}

/** Calculate BP reward for a wave */
export function calculateBP(waveNumber: number, won: boolean): number {
  const base = waveNumber;
  return won ? base * 2 : Math.max(1, Math.floor(base / 2));
}
