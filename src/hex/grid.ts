import type { HexGrid, HexTile, HexCoord, DepositType, TerrainType } from '@/core/types';
import { pick, createRng } from '@/core/utils';
import { hex, hexKey, hexRange, hexNeighbors, hexDistance } from './coords';

const TERRAIN_TYPES: TerrainType[] = ['grass', 'grass', 'grass', 'forest', 'rock'];

/** Generate a hex grid map for a new run */
export function generateGrid(radius: number, seed: number): HexGrid {
  const rng = createRng(seed);
  const tiles = new Map<string, HexTile>();

  // Create all tiles
  const allCoords = hexRange(hex(0, 0), radius);
  for (const coord of allCoords) {
    tiles.set(hexKey(coord), {
      coord,
      terrain: pick(TERRAIN_TYPES, rng),
      deposit: null,
      buildingId: null,
    });
  }

  // Place resource deposits in clusters
  placeDeposits(tiles, allCoords, 'wood', 3, 2, rng);
  placeDeposits(tiles, allCoords, 'stone', 2, 2, rng);
  placeDeposits(tiles, allCoords, 'iron', 2, 1, rng);

  // Keep center area clear for base
  const centerCoords = hexRange(hex(0, 0), 1);
  for (const coord of centerCoords) {
    const tile = tiles.get(hexKey(coord));
    if (tile) {
      tile.deposit = null;
      tile.terrain = 'grass';
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
): void {
  for (let c = 0; c < clusterCount; c++) {
    // Pick a center for this cluster (avoid center area)
    let center: HexCoord;
    let attempts = 0;
    do {
      center = pick(allCoords, rng);
      attempts++;
    } while (hexDistance(center, hex(0, 0)) < 2 && attempts < 50);

    // Place deposits around center
    const tile = tiles.get(hexKey(center));
    if (tile && !tile.deposit) {
      tile.deposit = type;
    }

    const neighbors = hexNeighbors(center);
    let placed = 0;
    for (const n of neighbors) {
      if (placed >= clusterSize) break;
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
