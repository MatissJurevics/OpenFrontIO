import * as T from "three";
import { describe, expect, it } from "vitest";
import { createModel } from "../../src/client/render/three/Models3D";
import {
  configureCamera,
  intersectTerrain,
  surfaceHeight,
} from "../../src/client/render/three/Projection3D";
import { UnitType } from "../../src/core/game/Game";

describe("3D terrain picking", () => {
  const geometry = new T.PlaneGeometry(400, 300, 20, 15);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(200, 0, 150);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(
      i,
      Math.sin(p.getX(i) * 0.015) * Math.cos(p.getZ(i) * 0.02) * 15 + 16,
    );
  geometry.computeVertexNormals();
  const ground = new T.Mesh(geometry, new T.MeshBasicMaterial());
  ground.updateMatrixWorld();
  for (const scale of [0.5, 2, 8])
    it(`round trips raised ground at zoom ${scale}`, () => {
      const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
      configureCamera(camera, {
        x: 200,
        y: 150,
        width: 1200,
        height: 700,
        scale,
      });
      for (const [x, y] of [
        [23, 27],
        [121, 204],
        [287, 108],
        [399, 299],
      ]) {
        const point = new T.Vector3(
          x,
          surfaceHeight(geometry, x, y),
          y,
        ).project(camera);
        const ray = new T.Raycaster();
        ray.setFromCamera(new T.Vector2(point.x, point.y), camera);
        const hit = ray.intersectObject(ground)[0];
        expect(hit).toBeDefined();
        expect(hit.point.x).toBeCloseTo(x, 4);
        expect(hit.point.z).toBeCloseTo(y, 4);
        expect(
          intersectTerrain(ray.ray, geometry)?.distanceTo(hit.point),
        ).toBeLessThan(0.0001);
      }
    });
  it("keeps the world point under the cursor during anchored zoom", () => {
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000),
      state = { x: 200, y: 150, width: 1200, height: 700, scale: 2 };
    const pick = () => {
      configureCamera(camera, state);
      const ray = new T.Raycaster();
      ray.setFromCamera(new T.Vector2(0.2, 0.1), camera);
      return ray.intersectObject(ground)[0].point;
    };
    const before = pick().clone();
    state.scale = 3;
    for (let i = 0; i < 4; i++) {
      const after = pick();
      state.x += before.x - after.x;
      state.y += before.z - after.z;
    }
    expect(pick().distanceTo(before)).toBeLessThan(0.01);
  });
});
describe("complete 3D unit coverage", () => {
  for (const type of Object.values(UnitType))
    it(`builds finite, elevated geometry for ${type}`, () => {
      const group = createModel(type);
      const bounds = new T.Box3().setFromObject(group);
      expect(bounds.isEmpty()).toBe(false);
      expect(bounds.max.y - bounds.min.y).toBeGreaterThan(0.5);
      group.traverse((o) => {
        if (o instanceof T.Mesh) {
          const a = o.geometry.attributes.position.array;
          expect(Array.from(a).every(Number.isFinite)).toBe(true);
          o.geometry.dispose();
          (o.material as T.MeshStandardMaterial).map?.dispose();
          (o.material as T.Material).dispose();
        }
      });
    });
  it("uses distinct silhouettes for trade, invasion, and warships", () => {
    const sizes = [
      UnitType.TradeShip,
      UnitType.TransportShip,
      UnitType.Warship,
    ].map((type) => {
      const g = createModel(type);
      return new T.Box3().setFromObject(g).getSize(new T.Vector3()).y;
    });
    expect(new Set(sizes).size).toBe(3);
  });
});
