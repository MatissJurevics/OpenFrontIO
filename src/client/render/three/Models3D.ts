import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Original procedural models; local +Z is the bow/front. Shared merged geometry. */
export function createModel(type: string, color = 0x3578a5): T.Group {
  const group = new T.Group();
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4;
      const seam = y % 8 === 0 || (x + (Math.floor(y / 8) % 2) * 8) % 16 === 0;
      const noise = (Math.sin(x * 12.1 + y * 7.7) * 1234) % 1;
      const v =
        type === "Warship"
          ? Math.sin(x * 0.4 + y * 0.6) > 0
            ? 185
            : 250
          : seam
            ? 190
            : 235 + noise * 15;
      pixels.set([v, v, v, 255], i);
    }
  const detail = new T.DataTexture(pixels, 32, 32);
  detail.wrapS = detail.wrapT = T.RepeatWrapping;
  detail.repeat.set(2, 2);
  detail.needsUpdate = true;

  const parts = new Map<number, T.BufferGeometry[]>();
  const add = (
    g: T.BufferGeometry,
    c: number,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
  ) => {
    g.rotateX(rx);
    g.rotateY(ry);
    g.translate(x, y, z);
    const list = parts.get(c) ?? [];
    list.push(g);
    parts.set(c, list);
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: number,
  ) => add(new T.BoxGeometry(w, h, d), c, x, y + h / 2, z);
  const cylinder = (
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    c: number,
  ) => add(new T.CylinderGeometry(r, r, h, 12), c, x, y + h / 2, z);
  const house = (x: number, z: number, w: number, d: number, h: number) => {
    box(x, 0, z, w, h, d, 0xd9c39a);
    add(
      new T.CylinderGeometry(w * 0.72, w * 0.72, d, 4),
      color,
      x,
      h + 0.5,
      z,
      Math.PI / 2,
      Math.PI / 4,
    );
    for (let i = 0; i < 2; i++)
      box(
        x - w * 0.25 + i * w * 0.5,
        h * 0.45,
        z + d / 2 + 0.02,
        0.45,
        0.75,
        0.08,
        0x3b4547,
      );
  };
  if (/Warship|Trade Ship|Transport/.test(type)) {
    const shape = new T.Shape();
    shape.moveTo(-2.5, -7);
    shape.lineTo(2.5, -7);
    shape.lineTo(3, 3);
    shape.lineTo(0, 9);
    shape.lineTo(-3, 3);
    shape.closePath();
    const hull = new T.ExtrudeGeometry(shape, {
      depth: 2,
      bevelEnabled: true,
      bevelSize: 0.5,
      bevelThickness: 0.4,
      bevelSegments: 1,
      steps: 1,
    });
    hull.rotateX(Math.PI / 2);
    add(hull, type === "Trade Ship" ? 0x62452d : 0x465964, 0, 2.3, 0);
    box(0, 2, 0, 5, 0.5, 12, 0xb8aa88);
    for (let i = 0; i < 5; i++) {
      box(-1 - i * 0.7, 0.06, -8 - i * 1.7, 0.4, 0.04, 1.7, 0xa8d6d5);
      box(1 + i * 0.7, 0.06, -8 - i * 1.7, 0.4, 0.04, 1.7, 0xa8d6d5);
    }
    if (type === "Warship") {
      box(0, 2.5, -1, 3, 2.5, 4, 0x899ca0);
      box(0, 5, -1, 2, 1.3, 2, 0xc2c8bb);
      for (const z of [-5, 4]) {
        cylinder(0, 2.5, z, 1.25, 1, 0x617785);
        box(0, 3.2, z + 2, 0.32, 0.32, 3.8, 0x303f47);
      }
      cylinder(0, 6, -1, 0.13, 4, 0x384b54);
      box(0, 9, -1, 3, 0.2, 0.3, 0x526570);
      // Distinct naval camouflage plates along the hull.
      for (let i = 0; i < 5; i++)
        box(
          i % 2 ? -2.7 : 2.7,
          0.8,
          -5 + i * 2,
          0.25,
          0.85,
          1.4,
          i % 2 ? 0x233d53 : 0x96a9a8,
        );
    } else if (type === "Trade Ship") {
      for (let i = 0; i < 6; i++)
        box(
          i % 2 ? 1.25 : -1.25,
          2.5,
          -4 + Math.floor(i / 2) * 2.6,
          2,
          1.6,
          2.2,
          [0xa84f36, 0x426d77, 0xcc9b45][i % 3],
        );
      box(0, 2.5, 5, 3, 3, 2, 0xf0dfb5);
      cylinder(0, 5, 5, 0.3, 2, color);
    } else {
      box(-2, 2.5, 0, 0.5, 1.5, 10, color);
      box(2, 2.5, 0, 0.5, 1.5, 10, color);
      box(0, 2.5, -5, 4, 2, 2, 0x667154);
      for (let i = 0; i < 8; i++)
        cylinder(
          i % 2 ? 1 : -1,
          2.5,
          -3 + Math.floor(i / 2) * 2,
          0.38,
          1.2,
          0x58643b,
        );
      box(0, 2.5, 6, 4, 0.2, 3, 0x929579);
    }
  } else if (/Bomb|MIRV|SAMMissile|Shell/.test(type)) {
    cylinder(0, 0, 0, 0.65, 5, 0xe8dfc1);
    add(new T.ConeGeometry(0.65, 2, 12), color, 0, 6, 0);
    box(0, 0, 0, 2, 0.9, 0.2, 0x5c6668);
    box(0, 0, 0, 0.2, 0.9, 2, 0x5c6668);
    add(new T.ConeGeometry(0.55, 3, 10), 0xff9b2d, 0, -1, 0, Math.PI);
  } else if (type === "City") {
    // Concrete street grid, glass offices and flat-roof apartment blocks.
    box(0, -0.3, 0, 23, 0.5, 21, 0x9fa8a9);
    box(0, 0.21, 0, 23, 0.08, 2, 0x343e46);
    box(0, 0.21, 0, 2, 0.08, 21, 0x343e46);
    for (let i = -9; i <= 9; i += 3) {
      box(i, 0.31, 0, 1, 0.03, 0.12, 0xf6df97);
      box(0, 0.31, i, 0.12, 0.03, 1, 0xf6df97);
    }
    const tower = (
      x: number,
      z: number,
      w: number,
      d: number,
      h: number,
      glass: boolean,
    ) => {
      box(x, 0.3, z, w, h, d, glass ? 0x385a6c : 0xc5cbd0);
      box(x, h + 0.3, z, w + 0.25, 0.35, d + 0.25, 0xe4e7e6);
      box(x, h + 0.65, z, w * 0.4, 0.65, d * 0.35, 0x6b777d);
      for (let y = 1.3; y < h; y += 1.65) {
        box(
          x,
          y,
          z + d / 2 + 0.03,
          w * 0.85,
          0.72,
          0.07,
          glass ? 0x9bc7db : 0x354f62,
        );
        box(
          x,
          y,
          z - d / 2 - 0.03,
          w * 0.85,
          0.72,
          0.07,
          glass ? 0x729cb9 : 0x354f62,
        );
        box(
          x + w / 2 + 0.03,
          y,
          z,
          0.07,
          0.72,
          d * 0.85,
          glass ? 0x82b2c7 : 0x354f62,
        );
        box(
          x - w / 2 - 0.03,
          y,
          z,
          0.07,
          0.72,
          d * 0.85,
          glass ? 0x658ba8 : 0x354f62,
        );
      }
      box(x, 0.5, z + d / 2 + 0.08, w * 0.7, 0.55, 0.12, color);
    };
    tower(-4, -4, 4, 4, 15, true);
    tower(3.5, -4, 3.5, 4, 11, true);
    tower(-4, 4, 4.5, 3.5, 7, false);
    tower(4, 4, 4, 4, 9, true);
    tower(-8, 4, 2.3, 4, 4, false);
    tower(8, -4, 2.2, 5, 6, false);
    cylinder(-4, 15.8, -4, 0.12, 3.5, 0xc4d2db);
    for (const z of [-8, 8]) {
      box(4, 0.25, z, 8, 0.15, 2, 0x4e7252);
      for (let x = 1; x <= 7; x += 3) {
        cylinder(x, 0.4, z, 0.15, 1, 0x6b5c46);
        add(new T.SphereGeometry(0.65, 6, 5), 0x5b8d52, x, 1.6, z);
      }
    }
  } else if (type === "Factory") {
    box(0, -0.2, 0, 16, 0.4, 12, 0xa99c81);
    house(-2, 0, 8, 6, 3.5);
    for (let i = 0; i < 3; i++) {
      cylinder(3 + i * 2.4, 0, -3, 0.8, 8 + i, 0xad7653);
      cylinder(3 + i * 2.4, 7 + i, -3, 0.85, 1, 0xe3d4b1);
    }
    for (let i = 0; i < 3; i++) cylinder(-5 + i * 3, 0, 5, 1.2, 2.8, 0xa6b8b3);
    box(-2, 1, 3, 7, 0.4, 0.5, 0x3e585c);
  } else if (type === "Port") {
    house(-4, -3, 6, 5, 3);
    box(0, -0.2, 1, 16, 0.5, 5, 0x9c8060);
    for (const x of [-6, 1, 6]) {
      box(x, 0, 6, 2, 0.5, 9, 0xb29a71);
      for (const z of [3, 8, 10]) cylinder(x, -3, z, 0.3, 3, 0x6a5340);
    }
    box(3, 0, 0, 0.5, 8, 0.5, 0xe2b345);
    box(1, 7, 0, 7, 0.45, 0.45, 0xe2b345);
    cylinder(-2, 4, 0, 0.06, 3, 0x394e54);
  } else if (type === "Oil Rig") {
    box(0, 0, 0, 9, 0.6, 7, 0x9e9c82);
    for (const x of [-2, 2]) {
      box(x, 0, 0, 0.5, 6, 0.6, 0xd3ae47);
    }
    box(0, 6, 0, 7, 0.6, 0.8, 0x283f4a);
    box(3, 3, 0, 0.4, 3, 0.4, 0x344954);
    cylinder(-3, 0, -2, 1.1, 2, 0x445a62);
    cylinder(3, 0, 2, 1.4, 2, 0x657a7b);
  } else if (type === "Missile Silo") {
    cylinder(0, 0, 0, 4, 1, 0xc3bda6);
    cylinder(0, 1, 0, 2.5, 0.3, 0x4c5e62);
    house(5, 2, 3, 4, 2);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      box(Math.cos(a) * 5, 0, Math.sin(a) * 5, 0.4, 1, 0.4, color);
    }
  } else if (type === "SAM Launcher") {
    box(0, 0, 0, 6, 1, 5, 0x667350);
    for (let i = 0; i < 4; i++) box(-2 + i * 1.3, 1, 0, 0.8, 3, 0.9, color);
    cylinder(3, 0, 0, 0.15, 5, 0x444d44);
    add(new T.SphereGeometry(1.3, 8, 5), 0xc6c9a7, 3, 5, 0);
  } else if (type === "Defense Post") {
    cylinder(0, 0, 0, 4, 2, 0xabaa88);
    cylinder(0, 2, 0, 2, 2, color);
    box(0, 3, 3, 0.5, 0.5, 5, 0x394c4b);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      box(Math.cos(a) * 4, 2, Math.sin(a) * 4, 1, 1, 1, 0xd3c6a0);
    }
  } else {
    box(0, 0, 0, 3, 2, 7, color);
    box(0, 2, 1, 2, 1.5, 3, 0xd2c9ae);
  }
  for (const [c, geometries] of parts) {
    const geometry = mergeGeometries(
      geometries.map((g) => (g.index ? g.toNonIndexed() : g)),
    );
    const mesh = new T.Mesh(
      geometry,
      new T.MeshStandardMaterial({ color: c, map: detail, roughness: 0.88 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const g of geometries) g.dispose();
  }
  return group;
}
