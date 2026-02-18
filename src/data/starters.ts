import type { StarterKit } from '@/core/types';

export const STARTER_KITS: StarterKit[] = [
  {
    id: 'militia_kit',
    name: 'Militia Kit',
    description: 'A mercenary militia. Barracks auto-spawns soldiers each wave.',
    unitDefId: 'militia',
    buildingType: 'barracks',
    startingResources: { wood: 10, stone: 5, iron: 0 },
  },
  {
    id: 'frontier_kit',
    name: 'Frontier Kit',
    description: 'A mercenary archer. Archery range auto-spawns archers each wave.',
    unitDefId: 'archer',
    buildingType: 'archery_range',
    startingResources: { wood: 8, stone: 0, iron: 5 },
  },
  {
    id: 'beastmaster_kit',
    name: 'Beastmaster Kit',
    description: 'A mercenary wolf. Kennel auto-spawns wolves each wave.',
    unitDefId: 'wolf',
    buildingType: 'kennel',
    startingResources: { wood: 12, stone: 0, iron: 0 },
  },
  {
    id: 'defender_kit',
    name: 'Defender Kit',
    description: 'A mercenary guard. Guardhouse auto-spawns guards each wave.',
    unitDefId: 'guard',
    buildingType: 'guardhouse',
    startingResources: { wood: 5, stone: 10, iron: 0 },
  },
];
