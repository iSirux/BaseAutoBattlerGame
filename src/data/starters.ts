import type { StarterKit } from '@/core/types';

export const STARTER_KITS: StarterKit[] = [
  {
    id: 'militia_kit',
    name: 'Militia Kit',
    description: 'A swordsman with a barracks and basic supplies.',
    unitDefId: 'swordsman',
    buildingType: 'barracks',
    startingResources: { wood: 60, stone: 40, iron: 10 },
  },
  {
    id: 'frontier_kit',
    name: 'Frontier Kit',
    description: 'An archer with an archery range and ranged supplies.',
    unitDefId: 'archer',
    buildingType: 'archery_range',
    startingResources: { wood: 50, stone: 20, iron: 30 },
  },
  {
    id: 'beastmaster_kit',
    name: 'Beastmaster Kit',
    description: 'A wolf companion with a kennel and wood stores.',
    unitDefId: 'wolf',
    buildingType: 'kennel',
    startingResources: { wood: 80, stone: 30, iron: 0 },
  },
];
