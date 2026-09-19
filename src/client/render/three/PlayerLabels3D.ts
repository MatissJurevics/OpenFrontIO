export const LABEL_ASPECT = 144 / 512;
// The fixed camera looks down from (0, 1200, 1000).
const CAMERA_LENGTH = Math.hypot(1200, 1000);
const GROUND_Y = 1200 / CAMERA_LENGTH;
const HEIGHT_Y = 1000 / CAMERA_LENGTH;

/** World-space width of a billboard contained in the projected owned terrain.
 * Reject the projected bounds of every foreign tile, including holes. Bounds
 * are conservative on slopes; the final inset leaves room for the border.
 * No pixel minimum: zoom scales the label together with its territory.
 */
export function playerLabelWidth(
  size: number,
  x: number,
  y: number,
  owner: number | undefined,
  owners: Uint16Array,
  width: number,
  height: number,
  elevation: (x: number, y: number) => number,
): number {
  if (!owner || size <= 0 || !Number.isFinite(size)) return 0;
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  if ((owners[Math.floor(y) * width + Math.floor(x)] & 4095) !== owner)
    return 0;
  let half = (size * 1.7) / 2;
  const anchorHeight = elevation(x, y);
  // Terrain is bounded to [-3, 32]. Include tiles whose elevation can
  // project them into the label even if their ground position is outside it.
  const radiusY = (half * LABEL_ASPECT + 35 * HEIGHT_Y) / GROUND_Y + 1;
  const left = Math.floor(x - half) - 1;
  const right = Math.ceil(x + half) + 1;
  for (let ty = Math.floor(y - radiusY); ty <= Math.ceil(y + radiusY); ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (
        tx >= 0 &&
        ty >= 0 &&
        tx < width &&
        ty < height &&
        (owners[ty * width + tx] & 4095) === owner
      )
        continue;
      const dx = Math.max(tx - x, x - tx - 1, 0);
      if (dx >= half) continue;
      let bottom = Infinity,
        top = -Infinity;
      for (const cy of [ty, ty + 1]) {
        for (const cx of [tx, tx + 1]) {
          const projectedY =
            -(cy - y) * GROUND_Y +
            (elevation(cx, cy) - anchorHeight) * HEIGHT_Y;
          bottom = Math.min(bottom, projectedY);
          top = Math.max(top, projectedY);
        }
      }
      const dy = Math.max(bottom, -top, 0);
      half = Math.min(half, Math.max(dx, dy / LABEL_ASPECT));
      if (half === 0) return 0;
    }
  }
  return half * 2 * 0.9;
}
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export function troopLabel(troops: number | undefined): string {
  return troops === undefined
    ? "Troops: —"
    : `Troops: ${compact.format(Math.max(0, Math.floor(troops)))}`;
}

/** Cache fits until placement, terrain, or ownership in their search area changes.
 * Ownership arrays are mutated in place, so invalidation uses explicit deltas.
 */
export class TerritoryLabelCache {
  private readonly columns: number;
  private readonly revisions: Float64Array;
  private generation = 0;
  private readonly entries = new Map<number, { key: string; width: number }>();
  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.columns = Math.ceil(width / 64);
    this.revisions = new Float64Array(this.columns * Math.ceil(height / 64));
  }
  invalidate(refs?: readonly number[]) {
    if (!refs) {
      this.generation++;
      return;
    }
    const chunks = new Set<number>();
    for (const ref of refs)
      chunks.add(
        Math.floor((ref % this.width) / 64) +
          Math.floor(Math.floor(ref / this.width) / 64) * this.columns,
      );
    for (const chunk of chunks) this.revisions[chunk]++;
  }
  fit(
    size: number,
    x: number,
    y: number,
    owner: number | undefined,
    owners: Uint16Array,
    elevation: (x: number, y: number) => number,
  ): number {
    if (!owner || size <= 0 || !Number.isFinite(size)) return 0;
    const half = (size * 1.7) / 2;
    const radiusY = (half * LABEL_ASPECT + 35 * HEIGHT_Y) / GROUND_Y + 1;
    let revision = 0;
    const left = Math.max(0, Math.floor((x - half - 2) / 64));
    const right = Math.min(this.columns - 1, Math.floor((x + half + 2) / 64));
    const top = Math.max(0, Math.floor((y - radiusY - 2) / 64));
    const bottom = Math.min(
      Math.ceil(this.height / 64) - 1,
      Math.floor((y + radiusY + 2) / 64),
    );
    for (let cy = top; cy <= bottom; cy++)
      for (let cx = left; cx <= right; cx++)
        revision += this.revisions[cy * this.columns + cx];
    const key = `${size},${x},${y},${this.generation},${revision}`;
    const previous = this.entries.get(owner);
    if (previous?.key === key) return previous.width;
    const width = playerLabelWidth(
      size,
      x,
      y,
      owner,
      owners,
      this.width,
      this.height,
      elevation,
    );
    this.entries.set(owner, { key, width });
    return width;
  }
}
