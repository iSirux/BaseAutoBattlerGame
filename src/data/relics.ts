import type { Relic } from '@/core/types';

export const RELICS: Relic[] = [
  {
    id: 'iron_will',
    name: 'Iron Will',
    description: 'All units gain +1 life.',
    rarity: 'epic',
    effect: { type: 'unit_lives_bonus', value: 1 },
  },
  {
    id: 'war_economy',
    name: 'War Economy',
    description: '+15% resource gather rate.',
    rarity: 'rare',
    effect: { type: 'gather_rate_bonus', multiplier: 1.15 },
  },
  {
    id: 'armorers_blessing',
    name: "Armorer's Blessing",
    description: 'New units start with a hide vest.',
    rarity: 'rare',
    effect: { type: 'new_unit_armor', equipmentId: 'hide_vest' },
  },
  {
    id: 'wide_formation',
    name: 'Wide Formation',
    description: '+1 battle width.',
    rarity: 'epic',
    effect: { type: 'battle_width_bonus', value: 1 },
  },
  {
    id: 'scavenger',
    name: 'Scavenger',
    description: 'Gain small resources after each battle.',
    rarity: 'common',
    effect: { type: 'post_battle_resources', resources: { wood: 3, stone: 2, iron: 1 } },
  },
];
