import { describe, expect, test } from "vitest";
import { GameMapImpl } from "../src/core/game/GameMap";
import {
  generateOilFields,
  getOilFields,
  OIL_MIN_FIELD_SIZE,
} from "../src/core/game/OilFields";

function terrain() {
  const bytes = new Uint8Array(160 * 120).fill(128);
  for (let y = 0; y < 120; y++) {
    bytes[y * 160 + 80] = 0; // A water channel splits connected deposits.
    bytes[y * 160 + 81] = 159; // Impassable land cannot host rigs.
  }
  return new GameMapImpl(160, 120, bytes, 160 * 120 - 120);
}

describe("oil geology", () => {
  test("is repeatable across independent clients, with stable field IDs", () => {
    const a = generateOilFields(terrain());
    const b = generateOilFields(terrain());
    expect(a.fields.length).toBeGreaterThan(0);
    expect(a.fields).toEqual(b.fields);
    expect(a.fieldIds).toEqual(b.fieldIds);
    expect(a.richness).toEqual(b.richness);
    expect(new Set(a.richness).size).toBeGreaterThan(10);
  });

  test("fields are connected land only, with size-based capacity and no tiny specks", () => {
    const map = terrain();
    const oil = generateOilFields(map);
    for (const field of oil.fields) {
      const tiles = Array.from(oil.fieldIds.keys()).filter(
        (t) => oil.fieldIds[t] === field.id,
      );
      expect(tiles.length).toBe(field.tiles);
      expect(field.tiles).toBeGreaterThanOrEqual(OIL_MIN_FIELD_SIZE);
      expect(field.capacity).toBe(Math.max(1, Math.floor(field.tiles / 400)));
      const seen = new Set([tiles[0]]);
      const stack = [tiles[0]];
      while (stack.length) {
        const t = stack.pop()!;
        expect(map.isLand(t)).toBe(true);
        expect(map.isImpassable(t)).toBe(false);
        for (const next of map.neighbors(t)) {
          if (oil.fieldIds[next] === field.id && !seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
      expect(seen.size).toBe(field.tiles);
    }
  });

  test("ownership and later terrain destruction do not regenerate geology", () => {
    const map = terrain();
    const oil = getOilFields(map);
    const tile = oil.fieldIds.findIndex((id) => id !== 0);
    const before = oil.fieldAt(tile);
    map.setOwnerID(tile, 7);
    map.setWater(tile);
    expect(getOilFields(map)).toBe(oil);
    expect(oil.fieldAt(tile)).toBe(before);
    expect(oil.fieldAt(-1)).toBeUndefined();
    expect(oil.fieldAt(999999)).toBeUndefined();
  });
});
