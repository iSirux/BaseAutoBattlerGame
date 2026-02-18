import type { StarterKit, BuildingType, UnitDef } from '@/core/types';
import { BUILDING_DEFS } from '@/data/buildings';
import { UNIT_DEFS } from '@/data/units';
import { shuffle, pick } from '@/core/utils';

/** Military building types that auto-spawn units (valid starter buildings) */
const STARTER_BUILDING_TYPES: BuildingType[] = ['barracks', 'archery_range', 'kennel', 'guardhouse'];

/** Base units eligible to be a starting mercenary (level 1, non-peasant) */
const MERC_UNITS: UnitDef[] = Object.values(UNIT_DEFS).filter(
  (u) => STARTER_BUILDING_TYPES.includes(u.trainedAt as BuildingType),
);

/** Generate random starter kit choices — each has a random building + a random merc that differs from the building's unit */
export function generateStarterKits(count: number): StarterKit[] {
  const pool = [...STARTER_BUILDING_TYPES];
  shuffle(pool);
  const picked = pool.slice(0, count);

  return picked.map((buildingType) => {
    const buildingDef = BUILDING_DEFS[buildingType];
    // Pick a random merc that is NOT the unit this building spawns
    const eligible = MERC_UNITS.filter((u) => u.trainedAt !== buildingType);
    const mercDef = pick(eligible);

    return {
      id: `starter_${buildingType}_${mercDef.id}`,
      name: `${buildingDef.name} + ${mercDef.name}`,
      description: `Start with a ${mercDef.name} mercenary. ${buildingDef.name} auto-spawns units each wave.`,
      unitDefId: mercDef.id,
      buildingType,
      startingResources: {},
    };
  });
}
