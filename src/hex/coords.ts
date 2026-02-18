import type { HexCoord } from '@/core/types';

/** Create a hex coordinate (cube coords, q + r + s = 0) */
export function hex(q: number, r: number): HexCoord {
  return { q, r, s: -q - r };
}

/** Serialize a hex coord to a map key */
export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r},${coord.s}`;
}

/** Deserialize a map key to a hex coord */
export function parseHexKey(key: string): HexCoord {
  const [q, r, s] = key.split(',').map(Number);
  return { q, r, s };
}

/** Check if two hex coords are equal */
export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r && a.s === b.s;
}

/** The 6 neighbor direction vectors in cube coords */
const DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0, s: -1 },
  { q: 1, r: -1, s: 0 },
  { q: 0, r: -1, s: 1 },
  { q: -1, r: 0, s: 1 },
  { q: -1, r: 1, s: 0 },
  { q: 0, r: 1, s: -1 },
];

/** Get the 6 neighbors of a hex coord */
export function hexNeighbors(coord: HexCoord): HexCoord[] {
  return DIRECTIONS.map((d) => ({
    q: coord.q + d.q,
    r: coord.r + d.r,
    s: coord.s + d.s,
  }));
}

/** Manhattan distance between two hex coords */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.s - b.s)) / 2;
}

/** Add two hex coords */
export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q + b.q, r: a.r + b.r, s: a.s + b.s };
}

// ── Pixel conversion (flat-top hexagons) ──

/** Convert hex coord to pixel position (flat-top orientation) */
export function hexToPixel(coord: HexCoord, size: number): { x: number; y: number } {
  const x = size * (3 / 2) * coord.q;
  const y = size * (Math.sqrt(3) / 2 * coord.q + Math.sqrt(3) * coord.r);
  return { x, y };
}

/** Convert pixel position to hex coord (flat-top orientation, rounded) */
export function pixelToHex(px: number, py: number, size: number): HexCoord {
  const q = (2 / 3) * px / size;
  const r = (-1 / 3 * px + Math.sqrt(3) / 3 * py) / size;
  return hexRound(q, r);
}

/** Round fractional hex coords to nearest hex */
function hexRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  } else {
    rs = -rq - rr;
  }

  return { q: rq, r: rr, s: rs };
}

/** Get all hex coords within a radius of center (inclusive) */
export function hexRange(center: HexCoord, radius: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      results.push({
        q: center.q + q,
        r: center.r + r,
        s: center.s - q - r,
      });
    }
  }
  return results;
}

/**
 * BFS pathfinding: find the first step from `from` toward `target`.
 * Avoids hexes in `blocked` (except the target itself, which is treated as reachable).
 * Only traverses hexes in `validHexes`.
 * Returns the neighbor of `from` that is on the shortest path, or null if unreachable.
 */
export function bfsNextStep(
  from: HexCoord,
  target: HexCoord,
  blocked: Set<string>,
  validHexes: Set<string>,
): HexCoord | null {
  if (hexEquals(from, target)) return null;

  const targetKey = hexKey(target);
  const visited = new Set<string>();
  visited.add(hexKey(from));

  // Queue: each entry tracks the hex and the first step taken from `from`
  const queue: Array<{ hex: HexCoord; first: HexCoord }> = [];

  for (const n of hexNeighbors(from)) {
    const nKey = hexKey(n);
    if (visited.has(nKey)) continue;
    if (!validHexes.has(nKey)) continue;
    if (blocked.has(nKey) && nKey !== targetKey) continue;
    visited.add(nKey);
    queue.push({ hex: n, first: n });
  }

  while (queue.length > 0) {
    const { hex: current, first } = queue.shift()!;
    if (hexKey(current) === targetKey) return first;

    for (const n of hexNeighbors(current)) {
      const nKey = hexKey(n);
      if (visited.has(nKey)) continue;
      if (!validHexes.has(nKey)) continue;
      if (blocked.has(nKey) && nKey !== targetKey) continue;
      visited.add(nKey);
      queue.push({ hex: n, first });
    }
  }

  return null;
}

/** Get the corner vertices of a hex (for rendering) */
export function hexCorners(center: { x: number; y: number }, size: number): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    corners.push({
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    });
  }
  return corners;
}
