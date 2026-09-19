import * as T from "three";
import type {
  DeadUnitFx,
  GhostPreviewData,
  NameEntry,
  NukeTrajectoryData,
  PlayerState,
  PlayerStatic,
  TerrainRect,
  UnitState,
} from "../types";
import { createModel } from "./Models3D";
import { playerLabelWidth, troopLabel } from "./PlayerLabels3D";

import {
  configureCamera,
  intersectTerrain,
  surfaceHeight,
  type SceneCameraState,
} from "./Projection3D";
export type { SceneCameraState } from "./Projection3D";
export class Scene3D {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 20000);
  private ground: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private water: T.Mesh;
  private sun = new T.DirectionalLight(0xffedc9, 3);
  private colors: Uint8Array;
  private texture: T.DataTexture;
  private owners: Uint16Array;
  private models = new Map<
    number,
    {
      object: T.Group;
      state: UnitState;
      from: T.Vector3;
      to: T.Vector3;
      updated: number;
      origin: number;
    }
  >();
  private templates = new Map<string, T.Group>();
  private clouds: { object: T.Group; start: number }[] = [];
  private ghost: T.Group | null = null;
  private raycaster = new T.Raycaster();
  private frameSize = new T.Vector2();
  private active = false;
  private markers = new Map<string, T.LineSegments>();
  private selected: readonly number[] = [];
  private moveUntil = 0;
  private oilPixels: Uint8ClampedArray | null = null;
  private oilVisible = true;
  private oilAlpha = 0.65;
  private playerIDs = new Map<string, number>();
  private viewScale = 1;
  private labels = new Map<string, T.Sprite>();
  private displayNames = new Map<string, string>();
  private forest: {
    trees: T.InstancedMesh;
    trunks: T.InstancedMesh;
    locations: T.Vector3[];
  } | null = null;
  private waveTexture: T.CanvasTexture | null = null;
  private palette: Float32Array;
  constructor(
    private canvas: HTMLCanvasElement,
    readonly width: number,
    readonly height: number,
    private terrain: Uint8Array,
    palette: Float32Array,
  ) {
    this.palette = palette;
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.domElement.id = "world-3d-canvas";
    this.renderer.domElement.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;display:none";
    canvas.insertAdjacentElement("afterend", this.renderer.domElement);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.background = new T.Color(0x274c72);
    this.scene.add(new T.HemisphereLight(0xe3f3ff, 0x77754b, 2));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.colors = new Uint8Array(width * height * 4);
    this.owners = new Uint16Array(width * height);
    this.texture = new T.DataTexture(this.colors, width, height, T.RGBAFormat);
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.magFilter = T.LinearFilter;
    this.texture.minFilter = T.LinearFilter;
    const step = Math.max(2, Math.ceil(Math.sqrt((width * height) / 200000)));
    const geometry = new T.PlaneGeometry(
      width,
      height,
      Math.ceil(width / step),
      Math.ceil(height / step),
    );
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(width / 2, 0, height / 2);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setY(i, this.elevation(p.getX(i), p.getZ(i)));
    geometry.computeVertexNormals();
    // PlaneGeometry's UV top edge is map north; data texture rows are map south.
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this.ground = new T.Mesh(
      geometry,
      new T.MeshStandardMaterial({ map: this.texture, roughness: 0.96 }),
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.water = new T.Mesh(
      new T.PlaneGeometry(width * 3, height * 3),
      new T.MeshStandardMaterial({
        color: 0x287eaa,
        roughness: 0.28,
        metalness: 0.28,
        transparent: true,
        opacity: 0.84,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(width / 2, -0.4, height / 2);
    this.water.receiveShadow = true;
    this.scene.add(this.water);
    this.paint();
    this.addForests();
    const waves = document.createElement("canvas");
    waves.width = waves.height = 128;
    const ctx = waves.getContext("2d")!;
    const pixels = ctx.createImageData(128, 128);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4;
        const n =
          Math.sin(y * 0.5 + Math.sin(x * 0.15) * 2) * 0.5 +
          Math.sin(y * 0.2 - x * 0.14) * 0.2;
        pixels.data[i] = 128 + n * 22;
        pixels.data[i + 1] = 128 + Math.cos(y * 0.5 + x * 0.1) * 30;
        pixels.data[i + 2] = 250;
        pixels.data[i + 3] = 255;
      }
    ctx.putImageData(pixels, 0, 0);
    this.waveTexture = new T.CanvasTexture(waves);
    this.waveTexture.wrapS = this.waveTexture.wrapT = T.RepeatWrapping;
    this.waveTexture.repeat.set(width / 40, height / 40);
    const waterMaterial = this.water.material as T.MeshStandardMaterial;
    waterMaterial.normalMap = this.waveTexture;
    waterMaterial.normalScale.set(0.3, 0.3);
    waterMaterial.color.set(0x24567f);
  }
  private raw(x: number, y: number) {
    return this.terrain[
      Math.max(0, Math.min(this.height - 1, Math.floor(y))) * this.width +
        Math.max(0, Math.min(this.width - 1, Math.floor(x)))
    ];
  }
  elevation(x: number, y: number): number {
    const b = this.raw(x, y);
    if (!(b & 128)) return -2.5;
    let h = 0;
    for (const [dx, dy] of [
      [0, 0],
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ])
      h += (this.raw(x + dx, y + dy) & 31) / 5;
    return 0.6 + Math.pow(h / 31, 2.1) * 22;
  }
  private noise(x: number, y: number) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  private paint(refs?: readonly number[]) {
    const paintOne = (i: number) => {
      const x = i % this.width,
        y = Math.floor(i / this.width),
        b = this.terrain[i],
        owner = this.owners[i] & 4095;
      let c: T.Color;
      if (!(b & 128)) c = new T.Color(0x225f81);
      else if (b & 64) c = new T.Color(0xcac293);
      else
        c = new T.Color(0x658132).lerp(
          new T.Color(0x9e9b81),
          Math.max(0, ((b & 31) - 18) / 13),
        );
      c.multiplyScalar(
        0.78 +
          this.noise(x, y) * 0.2 +
          Math.sin(x * 0.17) * Math.cos(y * 0.13) * 0.12,
      );
      if (owner && b & 128) {
        const own = new T.Color(
          this.palette[owner * 4],
          this.palette[owner * 4 + 1],
          this.palette[owner * 4 + 2],
        );
        const border = [i - 1, i + 1, i - this.width, i + this.width].some(
          (j) =>
            j >= 0 &&
            j < this.owners.length &&
            (this.owners[j] & 4095) !== owner,
        );
        c.lerp(own, border ? 1 : 0.65);
      }
      c.convertLinearToSRGB();
      const o = i * 4;
      this.colors[o] = c.r * 255;
      this.colors[o + 1] = c.g * 255;
      this.colors[o + 2] = c.b * 255;
      this.colors[o + 3] = 255;
      if (this.oilVisible && this.oilPixels) {
        const alpha = (this.oilPixels[o + 3] / 255) * this.oilAlpha;
        for (let channel = 0; channel < 3; channel++)
          this.colors[o + channel] =
            this.colors[o + channel] * (1 - alpha) +
            this.oilPixels[o + channel] * alpha;
      }
    };
    if (refs) {
      const dirty = new Set<number>();
      for (const i of refs)
        for (const j of [i, i - 1, i + 1, i - this.width, i + this.width])
          if (j >= 0 && j < this.owners.length) dirty.add(j);
      for (const i of dirty) paintOne(i);
    } else for (let i = 0; i < this.terrain.length; i++) paintOne(i);
    this.texture.needsUpdate = true;
  }
  setOwners(owners: Uint16Array, refs?: readonly number[]) {
    this.owners = owners;
    this.paint(refs);
  }
  setPalette(palette: Float32Array) {
    this.palette = palette;
    this.paint();
  }
  private addForests() {
    const locations: T.Vector3[] = [];
    const spacing = Math.max(10, Math.sqrt((this.width * this.height) / 10000));
    for (let y = 5; y < this.height; y += spacing)
      for (let x = 5; x < this.width; x += spacing) {
        const px = x + this.noise(x, y) * 7,
          py = y + this.noise(y, x) * 7;
        if (
          this.raw(px, py) & 128 &&
          !(this.raw(px, py) & 64) &&
          (this.raw(px, py) & 31) < 22 &&
          Math.sin(px * 0.025) * Math.cos(py * 0.031) + this.noise(x, y) > 0.7
        )
          locations.push(new T.Vector3(px, this.elevation(px, py), py));
      }
    const trees = new T.InstancedMesh(
      new T.CylinderGeometry(0, 2, 6, 7, 3),
      new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
      locations.length,
    );
    const trunks = new T.InstancedMesh(
      new T.CylinderGeometry(0.24, 0.4, 2, 5),
      new T.MeshStandardMaterial({ color: 0x766047 }),
      locations.length,
    );
    const dummy = new T.Object3D();
    locations.forEach((p, i) => {
      const s = 0.7 + this.noise(p.x, p.z) * 0.7;
      dummy.position.copy(p).add(new T.Vector3(0, 4 * s, 0));
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      trees.setMatrixAt(i, dummy.matrix);
      trees.setColorAt(
        i,
        new T.Color().setHSL(
          0.25 + this.noise(p.z, p.x) * 0.08,
          0.32,
          0.22 + this.noise(p.x, p.z) * 0.12,
        ),
      );
      dummy.position.copy(p).add(new T.Vector3(0, s, 0));
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
    });
    trees.castShadow = true;
    trees.receiveShadow = true;
    this.scene.add(trees, trunks);
    this.forest = { trees, trunks, locations };
  }
  setCamera(state: SceneCameraState) {
    this.viewScale = state.scale;
    for (const label of this.labels.values()) this.resizeLabel(label);
    const { x, y, scale, width, height } = state;
    this.renderer.getSize(this.frameSize);
    if (this.frameSize.x !== width || this.frameSize.y !== height)
      this.renderer.setSize(width, height, false);
    configureCamera(this.camera, state);
    this.sun.position.set(x - 180, 280, y - 120);
    this.sun.target.position.set(x, 0, y);
    const range = Math.min(1500, Math.max(160, (width / scale) * 0.6));
    const c = this.sun.shadow.camera;
    c.left = -range;
    c.right = range;
    c.top = range;
    c.bottom = -range;
    c.far = 2500;
    c.updateProjectionMatrix();
  }
  project(x: number, y: number) {
    const p = new T.Vector3(
      x,
      surfaceHeight(this.ground.geometry, x, y),
      y,
    ).project(this.camera);
    return {
      x: ((p.x + 1) * this.frameSize.x) / 2,
      y: ((1 - p.y) * this.frameSize.y) / 2,
    };
  }
  pick(x: number, y: number) {
    this.raycaster.setFromCamera(
      new T.Vector2(
        (x / this.frameSize.x) * 2 - 1,
        1 - (y / this.frameSize.y) * 2,
      ),
      this.camera,
    );
    const hit = intersectTerrain(this.raycaster.ray, this.ground.geometry);
    const p =
      hit ??
      this.raycaster.ray.intersectPlane(
        new T.Plane(new T.Vector3(0, 1, 0), 0),
        new T.Vector3(),
      );
    return { x: p?.x ?? 0, y: p?.z ?? 0 };
  }
  private template(type: string, owner: number) {
    const key = `${type}:${owner}`;
    let model = this.templates.get(key);
    if (!model) {
      const o = owner * 4;
      const c = new T.Color(
        this.palette[o] ?? 0.2,
        this.palette[o + 1] ?? 0.5,
        this.palette[o + 2] ?? 0.7,
      );
      model = createModel(type, c.getHex());
      this.templates.set(key, model);
    }
    return model;
  }
  updateUnits(units: Map<number, UnitState>) {
    const now = performance.now();
    if (this.forest) {
      const occupied = new Set<string>();
      for (const u of units.values())
        if (!/Ship|Transport|Bomb|MIRV|Shell|Train/.test(u.unitType)) {
          const x = Math.floor((u.pos % this.width) / 13),
            y = Math.floor(Math.floor(u.pos / this.width) / 13);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              occupied.add(`${x + dx},${y + dy}`);
        }
      const { trees, trunks, locations } = this.forest;
      const hidden = new T.Matrix4().makeScale(0, 0, 0);
      let changed = false;
      locations.forEach((p, i) => {
        if (occupied.has(`${Math.floor(p.x / 13)},${Math.floor(p.z / 13)}`)) {
          trees.setMatrixAt(i, hidden);
          trunks.setMatrixAt(i, hidden);
          changed = true;
        }
      });
      if (changed) {
        trees.instanceMatrix.needsUpdate = true;
        trunks.instanceMatrix.needsUpdate = true;
      }
    }
    for (const [id, entry] of this.models)
      if (!units.has(id) || !units.get(id)?.isActive) {
        this.scene.remove(entry.object);
        this.models.delete(id);
      }
    for (const [id, state] of units) {
      if (!state.isActive) continue;
      let e = this.models.get(id);
      if (
        e &&
        (e.state.ownerID !== state.ownerID ||
          e.state.unitType !== state.unitType)
      ) {
        this.scene.remove(e.object);
        this.models.delete(id);
        e = undefined;
      }
      if (!e) {
        const object = this.template(state.unitType, state.ownerID).clone();
        this.scene.add(object);
        e = {
          object,
          state: { ...state },
          from: new T.Vector3(),
          to: new T.Vector3(),
          updated: now,
          origin: state.pos,
        };
        this.models.set(id, e);
      }
      const x = state.pos % this.width,
        y = Math.floor(state.pos / this.width);
      const ship = /Warship|Trade Ship|Transport/.test(state.unitType);
      const target = new T.Vector3(
        x,
        ship ? 0 : Math.max(0, surfaceHeight(this.ground.geometry, x, y)),
        y,
      );
      if (/Bomb|MIRV|SAMMissile|Shell/.test(state.unitType)) {
        const end = state.targetTile ?? state.pos,
          ox = e.origin % this.width,
          oy = Math.floor(e.origin / this.width),
          ex = end % this.width,
          ey = Math.floor(end / this.width);
        const total = Math.hypot(ex - ox, ey - oy);
        const remaining = Math.hypot(ex - x, ey - y);
        target.y +=
          8 +
          Math.sin(Math.PI * Math.min(1, remaining / Math.max(1, total))) *
            Math.min(140, 30 + total * 0.2);
      }
      e.from.copy(e.to.lengthSq() ? e.object.position : target);
      e.to.copy(target);
      e.updated = now;
      e.state = { ...state };
      const dx = x - (state.lastPos % this.width),
        dy = y - Math.floor(state.lastPos / this.width);
      if (ship && (dx || dy)) e.object.rotation.y = Math.atan2(dx, dy);
      e.object.scale.setScalar(state.underConstruction ? 0.7 : 1);
      if (state.unitType === "Port") {
        let best = -1,
          angle = 0;
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI) / 8;
          let score = 0;
          for (const d of [5, 10, 16])
            if (!(this.raw(x + Math.sin(a) * d, y + Math.cos(a) * d) & 128))
              score++;
          if (score > best) {
            best = score;
            angle = a;
          }
        }
        e.object.rotation.y = angle;
      }
    }
  }
  setGhost(data: GhostPreviewData | null) {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((o) => {
        if (o instanceof T.Mesh) (o.material as T.Material).dispose();
      });
      this.ghost = null;
    }
    this.rings(
      "build-range",
      data && data.rangeRadius > 0
        ? [
            {
              x: data.radiusTileX,
              y: data.radiusTileY,
              radius: data.rangeRadius,
              color: data.canBuild ? 0xa3edbb : 0xff6754,
            },
          ]
        : [],
    );
    if (!data) return;
    this.ghost = this.template(data.ghostType, data.ownerID).clone();
    this.ghost.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.material = (o.material as T.MeshStandardMaterial).clone();
        o.material.transparent = true;
        o.material.opacity = 0.55;
        o.material.color.set(data.canBuild ? 0x77ffba : 0xff5544);
      }
    });
    this.ghost.position.set(
      data.tileX,
      this.elevation(data.tileX, data.tileY) + 0.4,
      data.tileY,
    );
    this.scene.add(this.ghost);
  }
  detonate(events: DeadUnitFx[]) {
    for (const e of events) {
      if (this.clouds.length >= 24) break;
      if (
        !e.reachedTarget ||
        !/Bomb|MIRV/.test(e.unitType) ||
        (e.tickAge ?? 0) > 80
      )
        continue;
      const object = new T.Group();
      const mat = new T.MeshStandardMaterial({
        color: 0xbaa68c,
        roughness: 1,
        transparent: true,
      });
      for (let i = 0; i < 38; i++) {
        const cap = i >= 12,
          a = i * 2.399,
          r = cap ? 8 + (i % 5) * 2 : 2;
        const mesh = new T.Mesh(new T.SphereGeometry(cap ? 6 : 3, 10, 7), mat);
        mesh.position.set(
          Math.cos(a) * r,
          cap ? 28 + Math.sin(a) * 3 : i * 2.2,
          Math.sin(a) * r,
        );
        mesh.scale.y = cap ? 0.65 : 1;
        object.add(mesh);
      }
      const ring = new T.Mesh(
        new T.TorusGeometry(20, 0.6, 6, 64),
        new T.MeshBasicMaterial({
          color: 0xffd797,
          transparent: true,
          opacity: 0.8,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1;
      object.add(ring);
      object.position.set(
        e.pos % this.width,
        Math.max(
          0,
          this.elevation(e.pos % this.width, Math.floor(e.pos / this.width)),
        ),
        Math.floor(e.pos / this.width),
      );
      this.scene.add(object);
      this.clouds.push({
        object,
        start: performance.now() - (e.tickAge ?? 0) * 100,
      });
    }
  }
  render(enabled: boolean) {
    if (enabled !== this.active) {
      this.active = enabled;
      this.canvas.style.visibility = enabled ? "hidden" : "visible";
      this.renderer.domElement.style.display = enabled ? "block" : "none";
    }
    if (!enabled) return;
    const now = performance.now();
    for (const e of this.models.values()) {
      e.object.position.lerpVectors(
        e.from,
        e.to,
        Math.min(1, (now - e.updated) / 100),
      );
      if (/Warship|Trade Ship|Transport/.test(e.state.unitType))
        e.object.rotation.z = Math.sin(now * 0.0015 + e.state.id) * 0.018;
    }
    this.rings(
      "selection",
      this.selected.flatMap((id) => {
        const e = this.models.get(id);
        return e
          ? [
              {
                x: e.object.position.x,
                y: e.object.position.z,
                radius: 9,
                color: 0xffefa3,
              },
            ]
          : [];
      }),
    );
    if (this.moveUntil && now > this.moveUntil) {
      this.rings("move", []);
      this.moveUntil = 0;
    }
    this.clouds = this.clouds.filter((e) => {
      const age = (now - e.start) / 1000;
      if (age > 9) {
        this.scene.remove(e.object);
        e.object.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.geometry.dispose();
            (o.material as T.Material).dispose();
          }
        });
        return false;
      }
      e.object.scale.setScalar(0.4 + age * 0.14);
      e.object.traverse((o) => {
        if (o instanceof T.Mesh) {
          const m = o.material as T.MeshStandardMaterial;
          m.opacity = Math.min(1, (9 - age) / 3);
          if (m.emissive)
            m.emissive.setRGB(
              Math.max(0, 1 - age),
              Math.max(0, 0.35 - age * 0.4),
              0,
            );
        }
      });
      return true;
    });
    if (this.waveTexture) this.waveTexture.offset.y = now * 0.000003;
    this.renderer.render(this.scene, this.camera);
  }
  setSelected(ids: readonly number[]) {
    this.selected = [...ids];
  }
  rings(
    key: string,
    rings: readonly { x: number; y: number; radius: number; color: number }[],
  ) {
    const old = this.markers.get(key);
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
      (old.material as T.Material).dispose();
      this.markers.delete(key);
    }
    if (!rings.length) return;
    const positions: number[] = [],
      colors: number[] = [];
    for (const r of rings) {
      const color = new T.Color(r.color);
      for (let i = 0; i < 64; i++)
        for (const j of [i, i + 1]) {
          const a = (j * Math.PI) / 32,
            x = r.x + Math.cos(a) * r.radius,
            y = r.y + Math.sin(a) * r.radius;
          positions.push(
            x,
            Math.max(0, surfaceHeight(this.ground.geometry, x, y)) + 0.3,
            y,
          );
          colors.push(color.r, color.g, color.b);
        }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    const line = new T.LineSegments(
      geometry,
      new T.LineBasicMaterial({
        vertexColors: true,
        depthTest: false,
        transparent: true,
        opacity: 0.85,
      }),
    );
    line.renderOrder = 5;
    this.scene.add(line);
    this.markers.set(key, line);
  }
  move(x: number, y: number) {
    this.rings("move", [{ x, y, radius: 5, color: 0xffeaa3 }]);
    this.moveUntil = performance.now() + 1800;
  }
  trajectory(data: NukeTrajectoryData | null) {
    const old = this.markers.get("trajectory");
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
      (old.material as T.Material).dispose();
      this.markers.delete("trajectory");
    }
    if (!data) return;
    const points: T.Vector3[] = [];
    for (let i = 0; i < 64; i++)
      for (const j of [i, i + 1]) {
        const t = j / 64,
          u = 1 - t;
        const x =
            u * u * u * data.p0x +
            3 * u * u * t * data.p1x +
            3 * u * t * t * data.p2x +
            t * t * t * data.p3x,
          y =
            u * u * u * data.p0y +
            3 * u * u * t * data.p1y +
            3 * u * t * t * data.p2y +
            t * t * t * data.p3y;
        points.push(new T.Vector3(x, 8 + Math.sin(t * Math.PI) * 70, y));
      }
    const line = new T.LineSegments(
      new T.BufferGeometry().setFromPoints(points),
      new T.LineBasicMaterial({
        color: 0xffcf75,
        transparent: true,
        opacity: 0.75,
      }),
    );
    this.scene.add(line);
    this.markers.set("trajectory", line);
  }
  setLayers(images: Map<string, ImageBitmap>) {
    const image = images.get("oil");
    this.oilPixels = null;
    if (image) {
      const canvas = document.createElement("canvas");
      canvas.width = this.width;
      canvas.height = this.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, this.width, this.height);
      this.oilPixels = ctx.getImageData(0, 0, this.width, this.height).data;
    }
    this.paint();
  }
  setLayerVisible(id: string, visible: boolean) {
    if (id === "oil") {
      this.oilVisible = visible;
      this.paint();
    }
  }
  setLayerAlpha(id: string, alpha: number) {
    if (id === "oil") {
      this.oilAlpha = Math.max(0, Math.min(1, alpha));
      this.paint();
    }
  }
  setDisplayNames(names: Map<string, string>) {
    this.displayNames = new Map([...this.displayNames, ...names]);
    for (const s of this.labels.values()) {
      this.scene.remove(s);
      s.material.map?.dispose();
      s.material.dispose();
    }
    this.labels.clear();
  }
  registerPlayers(players: readonly PlayerStatic[]) {
    for (const p of players) this.playerIDs.set(p.id, p.smallID);
    this.setDisplayNames(
      new Map(players.map((p) => [p.id, p.displayName || p.name])),
    );
  }
  private resizeLabel(sprite: T.Sprite) {
    const width =
      playerLabelWidth(sprite.userData.countrySize ?? 0, this.viewScale) /
      this.viewScale;
    sprite.scale.set(width, (width * 144) / 512, 1);
  }
  updateNames(
    names: Map<string, NameEntry>,
    players: Map<number, PlayerState>,
  ) {
    for (const [id, s] of this.labels)
      if (!names.has(id)) {
        this.scene.remove(s);
        s.material.map?.dispose();
        s.material.dispose();
        this.labels.delete(id);
      }
    for (const [id, n] of names) {
      let sprite = this.labels.get(id);
      if (!sprite) {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 144;
        const texture = new T.CanvasTexture(canvas);
        texture.colorSpace = T.SRGBColorSpace;
        sprite = new T.Sprite(
          new T.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        sprite.renderOrder = 20;
        this.labels.set(id, sprite);
        this.scene.add(sprite);
      }
      const smallID = this.playerIDs.get(n.playerID),
        player = smallID === undefined ? undefined : players.get(smallID);
      const name = this.displayNames.get(n.playerID) ?? n.playerID;
      const troops = troopLabel(player?.troops);
      const owner =
        smallID === undefined
          ? new T.Color(0xffffff)
          : new T.Color(
              this.palette[smallID * 4],
              this.palette[smallID * 4 + 1],
              this.palette[smallID * 4 + 2],
            );
      const color = `#${owner.getHexString()}`;
      const stamp = `${name}|${troops}|${color}`;
      if (sprite.userData.stamp !== stamp) {
        const texture = sprite.material.map as T.CanvasTexture,
          canvas = texture.image as HTMLCanvasElement,
          ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, 512, 144);
        ctx.fillStyle = "rgba(9,18,29,0.9)";
        ctx.beginPath();
        ctx.roundRect(2, 2, 508, 140, 18);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.font = "700 48px system-ui";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(name, 256, 61, 475);
        ctx.font = "700 43px system-ui";
        ctx.fillStyle = "#ffe7a0";
        ctx.fillText(troops, 256, 116, 475);
        texture.needsUpdate = true;
        sprite.userData.stamp = stamp;
      }
      sprite.userData.countrySize = n.size;
      this.resizeLabel(sprite);
      sprite.position.set(
        n.x,
        surfaceHeight(this.ground.geometry, n.x, n.y) + 10,
        n.y,
      );
    }
  }
  updateTerrain(rects: readonly TerrainRect[], bytes: Uint8Array) {
    let offset = 0;
    for (const r of rects)
      for (let y = 0; y < r.h; y++) {
        this.terrain.set(
          bytes.subarray(offset, offset + r.w),
          (r.y + y) * this.width + r.x,
        );
        offset += r.w;
      }
    const p = this.ground.geometry.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setY(i, this.elevation(p.getX(i), p.getZ(i)));
    p.needsUpdate = true;
    this.ground.geometry.computeVertexNormals();
    this.ground.geometry.computeBoundingSphere();
    this.paint();
  }
  dispose() {
    this.canvas.style.visibility = "visible";
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>();
    const collect = (o: T.Object3D) => {
      if (o instanceof T.Mesh || o instanceof T.LineSegments) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
      }
    };
    this.scene.traverse(collect);
    for (const t of this.templates.values()) t.traverse(collect);
    for (const g of geometries) g.dispose();
    for (const m of materials) {
      if (m instanceof T.MeshStandardMaterial) m.map?.dispose();
      m.dispose();
    }
    for (const l of this.labels.values()) {
      l.material.map?.dispose();
      l.material.dispose();
    }
    this.waveTexture?.dispose();
    this.texture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
