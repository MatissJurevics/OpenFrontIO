import { Scene3D } from "../render/three/Scene3D";
import type { UnitState } from "../render/types";
const w = 500,
  h = 400,
  terrain = new Uint8Array(w * h),
  owners = new Uint16Array(w * h),
  palette = new Float32Array(4096 * 8);
palette.set([0.2, 0.5, 0.9, 1], 4);
palette.set([0.85, 0.55, 0.12, 1], 8);
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++) {
    const coast = 260 + Math.sin(x * 0.025) * 17;
    terrain[y * w + x] =
      y < coast
        ? 128 |
          Math.max(
            0,
            Math.min(
              31,
              Math.floor(
                5 + 23 * Math.exp(-((x - 110) ** 2 + (y - 110) ** 2) / 1600),
              ),
            ),
          )
        : 5;
    if (y < coast) owners[y * w + x] = x < 260 ? 1 : 2;
    if (Math.abs(y - coast) < 3 && y < coast) terrain[y * w + x] |= 64;
  }
const scene = new Scene3D(
  document.querySelector("canvas")!,
  w,
  h,
  terrain,
  palette,
);
scene.setOwners(owners);
const types = [
  "City",
  "Factory",
  "Oil Rig",
  "Defense Post",
  "SAM Launcher",
  "Missile Silo",
  "Port",
  "Warship",
  "Trade Ship",
  "Transport",
  "Atom Bomb",
];
const units = new Map<number, UnitState>();
types.forEach((unitType, id) => {
  const x = [220, 280, 335, 170, 370, 130, 270, 225, 310, 365, 400][id],
    y = [170, 200, 165, 210, 215, 175, 255, 295, 320, 285, 200][id];
  units.set(id, {
    id,
    unitType,
    pos: y * w + x,
    lastPos: (y - 1) * w + x,
    isActive: true,
    ownerID: 1,
    underConstruction: false,
    targetTile: 240 * w + 370,
    level: 1,
  } as UnitState);
});
scene.updateUnits(units);
let x = 250,
  y = 220,
  scale = 6;
const draw = () => {
  scene.setCamera({ x, y, scale, width: innerWidth, height: innerHeight });
  scene.render(true);
  requestAnimationFrame(draw);
};
draw();
document.getElementById("nuke")!.onclick = () =>
  scene.detonate([
    {
      unitType: "Atom Bomb",
      pos: 220 * w + 320,
      reachedTarget: true,
      ownerSmallID: 1,
    },
  ]);
window.addEventListener("wheel", (e) => {
  scale = Math.max(1, Math.min(18, scale * Math.exp(-e.deltaY * 0.001)));
});
let drag = false;
window.onpointerdown = (e) => {
  if (e.target instanceof HTMLButtonElement) return;
  drag = true;
};
window.onpointerup = () => (drag = false);
window.onpointermove = (e) => {
  if (drag) {
    x -= e.movementX / scale;
    y -= e.movementY / scale / 0.77;
  }
};
