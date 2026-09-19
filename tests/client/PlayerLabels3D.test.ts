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
  it("keeps small-country text readable when zoomed out", () => {
    for (const zoom of [0.2, 0.5, 2, 20])
      expect(playerLabelWidth(1, zoom)).toBe(180);
    expect(playerLabelWidth(200, 20)).toBe(240);
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
      viewScale: 2,
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
