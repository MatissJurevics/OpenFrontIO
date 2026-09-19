import type { GameMap, TileRef } from "./GameMap";

// Versioned, map-stable geology: all peers and replays derive identical fields.
export const OIL_LAYER_ID = "oil";
export const OIL_TICKS_PER_PAYOUT = 10;
export const OIL_GOLD_PER_RIG = 1_000;
export const OIL_TILES_PER_RIG = 400;
export const OIL_MIN_FIELD_SIZE = 80;
export const OIL_CUTOFF = 0.6;

export interface OilField {
  readonly id: number;
  readonly tiles: number;
  readonly capacity: number;
}

export interface OilFields {
  readonly fieldIds: Uint32Array;
  readonly richness: Uint8Array;
  readonly fields: readonly OilField[];
  fieldAt(tile: TileRef): OilField | undefined;
}

const cache = new WeakMap<GameMap, OilFields>();

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Gradient noise with a quintic fade; no trigonometry or random state. */
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const dx = x - ix,
    dy = y - iy;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const dot = (cx: number, cy: number, px: number, py: number) => {
    switch (hash(cx, cy, seed) & 3) {
      case 0:
        return px + py;
      case 1:
        return -px + py;
      case 2:
        return px - py;
      default:
        return -px - py;
    }
  };
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  return mix(
    mix(dot(ix, iy, dx, dy), dot(ix + 1, iy, dx - 1, dy), fade(dx)),
    mix(
      dot(ix, iy + 1, dx, dy - 1),
      dot(ix + 1, iy + 1, dx - 1, dy - 1),
      fade(dx),
    ),
    fade(dy),
  );
}

export function generateOilFields(map: GameMap): OilFields {
  const w = map.width(),
    h = map.height(),
    n = w * h;
  const fieldIds = new Uint32Array(n);
  const richness = new Uint8Array(n);
  // Include dimensions and immutable terrain in the seed, not ownership.
  let seed = hash(w, h, 0x0a11f1e1);
  for (let t = 0; t < n; t += 97) seed = hash(t, map.terrainByte(t), seed);
  for (let t = 0; t < n; t++) {
    if (!map.isLand(t) || map.isImpassable(t)) continue;
    const x = (t % w) / 64 + 0.37,
      y = Math.floor(t / w) / 64 + 0.71;
    const value =
      0.5 +
      0.5 *
        (noise(x, y, seed) * 0.75 + noise(x * 2, y * 2, seed ^ 7919) * 0.25);
    if (value > OIL_CUTOFF)
      richness[t] = Math.max(
        1,
        Math.min(255, Math.round((value - OIL_CUTOFF) * 1020)),
      );
  }
  const fields: OilField[] = [];
  const seen = new Uint8Array(n);
  // Reuse a typed flood-fill queue: O(map tiles), no per-tile objects.
  const queue = new Uint32Array(n);
  for (let start = 0; start < n; start++) {
    if (!richness[start] || seen[start]) continue;
    let head = 0,
      tail = 1;
    queue[0] = start;
    seen[start] = 1;
    const visit = (t: number) => {
      if (richness[t] && !seen[t]) {
        seen[t] = 1;
        queue[tail++] = t;
      }
    };
    while (head < tail) {
      const t = queue[head++];
      if (t >= w) visit(t - w);
      if (t + w < n) visit(t + w);
      if (t % w > 0) visit(t - 1);
      if (t % w < w - 1) visit(t + 1);
    }
    if (tail < OIL_MIN_FIELD_SIZE) {
      for (let i = 0; i < tail; i++) richness[queue[i]] = 0;
      continue;
    }
    const id = fields.length + 1;
    fields.push({
      id,
      tiles: tail,
      capacity: Math.max(1, Math.floor(tail / OIL_TILES_PER_RIG)),
    });
    for (let i = 0; i < tail; i++) fieldIds[queue[i]] = id;
  }
  return {
    fieldIds,
    richness,
    fields,
    fieldAt: (t) => fields[fieldIds[t] - 1],
  };
}

/** Call at game creation, before terrain can be changed by weapons. */
export function getOilFields(map: GameMap): OilFields {
  let fields = cache.get(map);
  if (!fields) {
    fields = generateOilFields(map);
    cache.set(map, fields);
  }
  return fields;
}

/** Maximum production rate is shared across every owner on the same field. */
export function oilFieldOutput(capacity: number, rigs: number): number {
  return Math.min(capacity, rigs) * OIL_GOLD_PER_RIG;
}
