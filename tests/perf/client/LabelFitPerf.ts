import {
  playerLabelWidth,
  TerritoryLabelCache,
} from "../../../src/client/render/three/PlayerLabels3D";
const width = 2048,
  height = 2048;
const owners = new Uint16Array(width * height);
const labels = Array.from({ length: 100 }, (_, i) => ({
  owner: i + 1,
  x: 100 + (i % 10) * 190,
  y: 100 + Math.floor(i / 10) * 190,
  size: 80,
}));
for (const l of labels)
  for (let y = l.y - 90; y < l.y + 90; y++)
    owners.fill(l.owner, y * width + l.x - 90, y * width + l.x + 90);
const elevation = () => 0;
const cache = new TerritoryLabelCache(width, height);
function run(cached: boolean) {
  const start = performance.now();
  let sum = 0;
  for (let tick = 0; tick < 100; tick++)
    for (const l of labels)
      sum += cached
        ? cache.fit(l.size, l.x, l.y, l.owner, owners, elevation)
        : playerLabelWidth(
            l.size,
            l.x,
            l.y,
            l.owner,
            owners,
            width,
            height,
            elevation,
          );
  return { milliseconds: performance.now() - start, sum };
}
run(true);
const before = run(false),
  after = run(true);
console.log(
  JSON.stringify(
    {
      scenario:
        "100 stationary territories, 100 troop-only ticks, warmed cache",
      before,
      after,
      speedup: before.milliseconds / after.milliseconds,
    },
    null,
    2,
  ),
);
