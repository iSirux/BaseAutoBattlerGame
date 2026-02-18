import type { HexGrid, HexTile, HexCoord, DepositType, TerrainType } from '@/core/types';
import { pick, createRng } from '@/core/utils';
import { hex, hexKey, hexRange, hexNeighbors, hexDistance } from './coords';

const TERRAIN_TYPES: TerrainType[] = ['grass', 'grass', 'grass', 'forest', 'rock'];

/** Generate a hex grid map for a new run */
export function generateGrid(radius: number, seed: number): HexGrid {
  const rng = createRng(seed);
  const tiles = new Map<string, HexTile>();

  // Create all tiles with claimed = false
  const allCoords = hexRange(hex(0, 0), radius);
  for (const coord of allCoords) {
    tiles.set(hexKey(coord), {
      coord,
      terrain: pick(TERRAIN_TYPES, rng),
      deposit: null,
      buildingId: null,
      claimed: false,
    });
  }

  // Place resource deposits in clusters with increased spread
  // Wood: 3 clusters (size 2-3), 1 guaranteed within radius 2
  placeDeposits(tiles, allCoords, 'wood', 3, 2, rng, 3);
  // Stone: 2 clusters (size 2, mid-range)
  placeDeposits(tiles, allCoords, 'stone', 2, 2, rng, 2, 2, 4);
  // Iron: 1-2 clusters (size 1-2, radius 3-5)
  const ironClusters = rng() < 0.5 ? 1 : 2;
  placeDeposits(tiles, allCoords, 'iron', ironClusters, 1, rng, 2, 3, 5);

  // Keep center area clear for base (no deposits), except 1 guaranteed wood deposit
  const centerCoords = hexRange(hex(0, 0), 1);
  for (const coord of centerCoords) {
    const tile = tiles.get(hexKey(coord));
    if (tile) {
      tile.deposit = null;
      tile.terrain = 'grass';
    }
  }

  // Place exactly 1 wood deposit on a random neighbor of center
  const neighborCoords = hexNeighbors(hex(0, 0));
  const woodTarget = neighborCoords[Math.floor(rng() * neighborCoords.length)];
  const woodTile = tiles.get(hexKey(woodTarget));
  if (woodTile) {
    woodTile.deposit = 'wood';
  }

  // Set tiles within hex distance 1 from center to claimed
  for (const coord of centerCoords) {
    const tile = tiles.get(hexKey(coord));
    if (tile) {
      tile.claimed = true;
    }
  }

  // Guarantee at least 1 wood deposit within radius 2
  const nearbyCoords = hexRange(hex(0, 0), 2);
  const hasWoodNear = nearbyCoords.some(c => {
    const t = tiles.get(hexKey(c));
    return t?.deposit === 'wood';
  });
  if (!hasWoodNear) {
    const candidates = nearbyCoords.filter(c => {
      const dist = hexDistance(c, hex(0, 0));
      if (dist < 2) return false;
      const t = tiles.get(hexKey(c));
      return t && !t.deposit;
    });
    if (candidates.length > 0) {
      const target = candidates[Math.floor(rng() * candidates.length)];
      const t = tiles.get(hexKey(target));
      if (t) t.deposit = 'wood';
    }
  }

  // Guarantee at least 1 stone deposit within radius 3
  const midCoords = hexRange(hex(0, 0), 3);
  const hasStoneNear = midCoords.some(c => {
    const t = tiles.get(hexKey(c));
    return t?.deposit === 'stone';
  });
  if (!hasStoneNear) {
    const candidates = midCoords.filter(c => {
      const dist = hexDistance(c, hex(0, 0));
      if (dist < 2) return false;
      const t = tiles.get(hexKey(c));
      return t && !t.deposit;
    });
    if (candidates.length > 0) {
      const target = candidates[Math.floor(rng() * candidates.length)];
      const t = tiles.get(hexKey(target));
      if (t) t.deposit = 'stone';
    }
  }

  // Guarantee iron deposit within radius 4
  const ironCoords = hexRange(hex(0, 0), 4);
  const hasIron = ironCoords.some(c => {
    const t = tiles.get(hexKey(c));
    return t?.deposit === 'iron';
  });
  if (!hasIron) {
    const candidates = allCoords.filter(c => {
      const dist = hexDistance(c, hex(0, 0));
      if (dist < 2) return false;
      const t = tiles.get(hexKey(c));
      return t && !t.deposit;
    });
    if (candidates.length > 0) {
      const target = candidates[Math.floor(rng() * candidates.length)];
      const t = tiles.get(hexKey(target));
      if (t) t.deposit = 'iron';
    }
  }

  // Guarantee at least 1 forest tile within radius 2
  const hasForestNear = nearbyCoords.some(c => {
    const t = tiles.get(hexKey(c));
    return t && t.terrain === 'forest' && hexDistance(c, hex(0, 0)) > 1;
  });
  if (!hasForestNear) {
    const candidates = nearbyCoords.filter(c => {
      const dist = hexDistance(c, hex(0, 0));
      if (dist <= 1) return false;
      const t = tiles.get(hexKey(c));
      return t && t.terrain === 'grass';
    });
    if (candidates.length > 0) {
      const target = candidates[Math.floor(rng() * candidates.length)];
      const t = tiles.get(hexKey(target));
      if (t) t.terrain = 'forest';
    }
  }

  // Guarantee at least 1 rock tile within radius 2
  const hasRockNear = nearbyCoords.some(c => {
    const t = tiles.get(hexKey(c));
    return t && t.terrain === 'rock' && hexDistance(c, hex(0, 0)) > 1;
  });
  if (!hasRockNear) {
    const candidates = nearbyCoords.filter(c => {
      const dist = hexDistance(c, hex(0, 0));
      if (dist <= 1) return false;
      const t = tiles.get(hexKey(c));
      return t && t.terrain === 'grass' && !t.deposit;
    });
    if (candidates.length > 0) {
      const target = candidates[Math.floor(rng() * candidates.length)];
      const t = tiles.get(hexKey(target));
      if (t) t.terrain = 'rock';
    }
  }

  // Place 8-12 mountain tiles at distance >= 2 from center
  const mountainCount = 8 + Math.floor(rng() * 5); // 8-12
  const mountainCandidates = allCoords.filter(c => {
    const dist = hexDistance(c, hex(0, 0));
    if (dist < 2) return false; // not in radius 1
    const t = tiles.get(hexKey(c));
    return t && !t.deposit; // never on deposits
  });
  // Shuffle candidates using rng
  for (let i = mountainCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [mountainCandidates[i], mountainCandidates[j]] = [mountainCandidates[j], mountainCandidates[i]];
  }
  let mountainsPlaced = 0;
  for (const coord of mountainCandidates) {
    if (mountainsPlaced >= mountainCount) break;
    const tile = tiles.get(hexKey(coord));
    if (tile) {
      tile.terrain = 'mountain';
      mountainsPlaced++;
    }
  }

  return { tiles, radius };
}

/** Place clusters of a deposit type on the grid */
function placeDeposits(
  tiles: Map<string, HexTile>,
  allCoords: HexCoord[],
  type: DepositType,
  clusterCount: number,
  clusterSize: number,
  rng: () => number,
  maxClusterSize?: number,
  minDist?: number,
  maxDist?: number,
): void {
  const minDistance = minDist ?? 2;
  const maxDistance = maxDist ?? Infinity;

  for (let c = 0; c < clusterCount; c++) {
    // Pick a center for this cluster (within distance range)
    let center: HexCoord;
    let attempts = 0;
    do {
      center = pick(allCoords, rng);
      attempts++;
    } while (
      (hexDistance(center, hex(0, 0)) < minDistance ||
        hexDistance(center, hex(0, 0)) > maxDistance) &&
      attempts < 50
    );

    // Place deposit on the center tile
    const tile = tiles.get(hexKey(center));
    if (tile && !tile.deposit) {
      tile.deposit = type;
    }

    // Determine actual cluster size for this cluster
    const actualSize = maxClusterSize
      ? clusterSize + Math.floor(rng() * (maxClusterSize - clusterSize + 1))
      : clusterSize;

    // Place deposits around center
    const neighbors = hexNeighbors(center);
    let placed = 0;
    for (const n of neighbors) {
      if (placed >= actualSize) break;
      const nTile = tiles.get(hexKey(n));
      if (nTile && !nTile.deposit && rng() > 0.3) {
        nTile.deposit = type;
        placed++;
      }
    }
  }
}

/** Check if a tile has an adjacent deposit of the given type */
export function hasAdjacentDeposit(
  grid: HexGrid,
  coord: HexCoord,
  depositType: DepositType,
): boolean {
  return hexNeighbors(coord).some((n) => {
    const tile = grid.tiles.get(hexKey(n));
    return tile?.deposit === depositType;
  });
}

/** Count how many adjacent tiles have a deposit of the given type */
export function countAdjacentDeposits(
  grid: HexGrid,
  coord: HexCoord,
  depositType: DepositType,
): number {
  return hexNeighbors(coord).filter((n) => {
    const tile = grid.tiles.get(hexKey(n));
    return tile?.deposit === depositType;
  }).length;
}

/** Get a tile from the grid */
export function getTile(grid: HexGrid, coord: HexCoord): HexTile | undefined {
  return grid.tiles.get(hexKey(coord));
}

/**
 * Get the cost (in some future currency) to claim a ring of tiles.
 * Ring = hex distance from center (0,0,0).
 * Ring 0-1: free (0), Ring 2-3: cost 2, Ring 4-5: cost 3
 */
export function getRingCost(coord: HexCoord): number {
  const ring = hexDistance(coord, hex(0, 0));
  if (ring <= 1) return 0;
  if (ring <= 3) return 2;
  return 3; // ring 4-5
}

/**
 * Get tiles that can be claimed: not already claimed, not mountain,
 * and adjacent to at least one claimed tile.
 */
export function getClaimableTiles(
  grid: Map<string, HexTile>,
  claimedTiles: Set<string>,
): HexCoord[] {
  const result: HexCoord[] = [];

  for (const [key, tile] of grid) {
    // Skip already claimed
    if (claimedTiles.has(key)) continue;
    // Skip mountains
    if (tile.terrain === 'mountain') continue;
    // Must have at least one adjacent claimed neighbor
    const neighbors = hexNeighbors(tile.coord);
    const hasClaimedNeighbor = neighbors.some(n => claimedTiles.has(hexKey(n)));
    if (hasClaimedNeighbor) {
      result.push(tile.coord);
    }
  }

  return result;
}

/** Deposit type required by each resource building */
const BUILDING_DEPOSIT_REQUIREMENT: Record<string, DepositType> = {
  lumber_mill: 'wood',
  quarry: 'stone',
  iron_mine: 'iron',
};

/** Terrain restrictions per building type */
const BUILDING_TERRAIN_ALLOWED: Record<string, TerrainType[]> = {
  lumber_mill: ['forest', 'grass'],
  quarry: ['rock', 'grass'],
  smelter: ['grass'],
  sawmill: ['grass'],
};

/**
 * Get the set of hex keys where a given building type can be placed.
 * Enforces: tile is claimed, no existing building, no deposit on tile,
 * not mountain, terrain restrictions, and resource building adjacency.
 */
export function getValidBuildTiles(
  grid: Map<string, HexTile>,
  buildingType: string,
  claimedTiles: Set<string>,
): Set<string> {
  const valid = new Set<string>();
  const terrainRestriction = BUILDING_TERRAIN_ALLOWED[buildingType];
  const requiredDeposit = BUILDING_DEPOSIT_REQUIREMENT[buildingType];

  for (const [key, tile] of grid) {
    // Must be claimed
    if (!claimedTiles.has(key)) continue;
    // No existing building
    if (tile.buildingId) continue;
    // Not a mountain
    if (tile.terrain === 'mountain') continue;

    // Resource buildings must be placed ON a matching deposit
    if (requiredDeposit) {
      if (tile.deposit !== requiredDeposit) continue;
    } else {
      // Non-resource buildings cannot be placed on deposits
      if (tile.deposit) continue;
    }

    // Terrain restriction (if any)
    if (terrainRestriction && !terrainRestriction.includes(tile.terrain)) continue;

    valid.add(key);
  }

  return valid;
}
