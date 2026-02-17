import type { TechUpgrade } from '@/core/types';

export const TECH_UPGRADES: TechUpgrade[] = [
  // ── Combat ──
  {
    id: 'sharp_blades',
    name: 'Sharp Blades',
    description: 'All units gain +2 attack.',
    category: 'combat',
    cost: 5,
    effect: { type: 'stat_boost', stat: 'attack', value: 2 },
  },
  {
    id: 'hardened_troops',
    name: 'Hardened Troops',
    description: 'All units gain +5 max HP.',
    category: 'combat',
    cost: 5,
    effect: { type: 'stat_boost', stat: 'maxHp', value: 5 },
  },
  {
    id: 'battle_drills',
    name: 'Battle Drills',
    description: 'All units gain +1 speed.',
    category: 'combat',
    cost: 6,
    effect: { type: 'stat_boost', stat: 'speed', value: 1 },
  },
  {
    id: 'lethal_strikes',
    name: 'Lethal Strikes',
    description: 'All units gain +4 attack.',
    category: 'combat',
    cost: 10,
    effect: { type: 'stat_boost', stat: 'attack', value: 4 },
  },
  {
    id: 'iron_constitution',
    name: 'Iron Constitution',
    description: 'All units gain +12 max HP.',
    category: 'combat',
    cost: 12,
    effect: { type: 'stat_boost', stat: 'maxHp', value: 12 },
  },

  // ── Economy ──
  {
    id: 'efficient_gathering',
    name: 'Efficient Gathering',
    description: 'Resource gather rate +25%.',
    category: 'economy',
    cost: 4,
    effect: { type: 'gather_rate', multiplier: 1.25 },
  },
  {
    id: 'bulk_construction',
    name: 'Bulk Construction',
    description: 'Building costs reduced by 15%.',
    category: 'economy',
    cost: 6,
    effect: { type: 'building_cost', multiplier: 0.85 },
  },
  {
    id: 'master_gatherers',
    name: 'Master Gatherers',
    description: 'Resource gather rate +50%.',
    category: 'economy',
    cost: 10,
    effect: { type: 'gather_rate', multiplier: 1.5 },
  },

  // ── Utility ──
  {
    id: 'wider_formation',
    name: 'Wider Formation',
    description: 'Battle width +1.',
    category: 'utility',
    cost: 8,
    effect: { type: 'battle_width', value: 1 },
  },
  {
    id: 'deeper_reserves',
    name: 'Deeper Reserves',
    description: 'Reinforcement queue +2 slots.',
    category: 'utility',
    cost: 6,
    effect: { type: 'reserve_size', value: 2 },
  },
  {
    id: 'survival_training',
    name: 'Survival Training',
    description: 'All units gain +1 life.',
    category: 'utility',
    cost: 12,
    effect: { type: 'unit_lives', value: 1 },
  },
  {
    id: 'fortune_favor',
    name: "Fortune's Favor",
    description: 'Post-battle card rarity boosted.',
    category: 'utility',
    cost: 7,
    effect: { type: 'card_rarity_boost', value: 1 },
  },
  {
    id: 'extra_scout',
    name: 'Extra Scout',
    description: 'See +1 card choice after battles.',
    category: 'utility',
    cost: 10,
    effect: { type: 'extra_card_choice', value: 1 },
  },
];
