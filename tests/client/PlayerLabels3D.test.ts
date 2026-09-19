import * as T from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  playerLabelWidth,
  troopLabel,
} from "../../src/client/render/three/PlayerLabels3D";
import { Scene3D } from "../../src/client/render/three/Scene3D";
import type { PlayerState, PlayerStatic } from "../../src/client/render/types";
afterEach(() => vi.restoreAllMocks());
describe("readable strategic labels", () => {
  it("scales with territory and stays inside narrow borders and holes", () => {
    const owners = new Uint16Array(100 * 100).fill(3);
    const fit = (size: number, x = 50, y = 50, elevation = () => 0) =>
      playerLabelWidth(size, x, y, 3, owners, 100, 100, elevation);
    expect(fit(10)).toBeCloseTo(15.3);
    expect(fit(20)).toBeCloseTo(30.6);
    expect(fit(100)).toBeLessThanOrEqual(90);
    // A foreign tile inside the label, not just its perimeter.
    owners[50 * 100 + 55] = 2;
    expect(fit(100)).toBeCloseTo(9);
    owners.fill(3);
    for (let y = 52; y < 100; y++) owners.fill(2, y * 100, (y + 1) * 100);
    expect(fit(100)).toBeLessThan(10);
    owners[50 * 100 + 50] = 2;
    expect(fit(100)).toBe(0);
    expect(fit(0)).toBe(0);
  });
  it("accounts for elevated foreign terrain projecting into the label", () => {
    const owners = new Uint16Array(10000).fill(3);
    owners[60 * 100 + 50] = 2;
    const flat = playerLabelWidth(20, 50, 50, 3, owners, 100, 100, () => 0);
    const raised = playerLabelWidth(20, 50, 50, 3, owners, 100, 100, (_x, y) =>
      y >= 60 ? 12 : 0,
    );
    expect(raised).toBeLessThan(flat);
  });
  it("distinguishes zero troops from missing data", () => {
    expect(troopLabel(0)).toBe("Troops: 0");
    expect(troopLabel(undefined)).toBe("Troops: —");
    expect(troopLabel(125430)).toBe("Troops: 125.4K");
    expect(troopLabel(2400500)).toBe("Troops: 2.4M");
  });
  it("maps public player IDs to live troop totals and refreshes the label", () => {
    const ctx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const scene = Object.assign(Object.create(Scene3D.prototype), {
      scene: new T.Scene(),
      labels: new Map(),
      displayNames: new Map(),
      playerIDs: new Map(),
      palette: new Float32Array(32).fill(0.5),
      width: 100,
      height: 100,
      owners: new Uint16Array(10000).fill(3),
      ground: new T.Mesh(new T.PlaneGeometry(100, 100, 1, 1)),
    }) as Scene3D;
    scene.registerPlayers([
      { id: "public-player", smallID: 3, name: "Ada", displayName: "Ada" },
    ] as PlayerStatic[]);
    const names = new Map([
      ["name-slot", { playerID: "public-player", x: 50, y: 50, size: 2 }],
    ]);
    scene.updateNames(names, new Map([[3, { troops: 1200 } as PlayerState]]));
    expect(ctx.fillText).toHaveBeenCalledWith("Ada", 256, 61, 475);
    expect(ctx.fillText).toHaveBeenCalledWith("Troops: 1.2K", 256, 116, 475);
    ctx.fillText.mockClear();
    scene.updateNames(names, new Map([[3, { troops: 9500 } as PlayerState]]));
    expect(ctx.fillText).toHaveBeenCalledWith("Troops: 9.5K", 256, 116, 475);
    ctx.fillText.mockClear();
    scene.updateNames(names, new Map([[3, { troops: 9500 } as PlayerState]]));
    expect(ctx.fillText).not.toHaveBeenCalled();
    scene.updateNames(new Map(), new Map());
    expect(scene.scene.children).toHaveLength(0);
  });
});
