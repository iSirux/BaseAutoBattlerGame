import type { StarterKit } from '@/core/types';

export const STARTER_KITS: StarterKit[] = [
  {
    id: 'militia_kit',
    name: 'Militia Kit',
    description: 'A militia soldier with a barracks and basic supplies.',
    unitDefId: 'militia',
    buildingType: 'barracks',
    startingResources: { wood: 10, stone: 5, iron: 0 },
  },
  {
    id: 'frontier_kit',
    name: 'Frontier Kit',
    description: 'An archer with an archery range and ranged supplies.',
    unitDefId: 'archer',
    buildingType: 'archery_range',
    startingResources: { wood: 8, stone: 0, iron: 5 },
  },
  {
    id: 'beastmaster_kit',
    name: 'Beastmaster Kit',
    description: 'A wolf companion with a kennel and wood stores.',
    unitDefId: 'wolf',
    buildingType: 'kennel',
    startingResources: { wood: 12, stone: 0, iron: 0 },
  },
  {
    id: 'defender_kit',
    name: 'Defender Kit',
    description: 'A sturdy guard with a guardhouse and stone reserves.',
    unitDefId: 'guard',
    buildingType: 'guardhouse',
    startingResources: { wood: 5, stone: 10, iron: 0 },
  },
];
