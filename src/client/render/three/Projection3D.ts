import * as T from "three";
export interface SceneCameraState {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}
/** CSS-pixel camera shared by rendering, pointer picking, and camera-control tests. */
export function configureCamera(
  camera: T.OrthographicCamera,
  state: SceneCameraState,
) {
  const { x, y, scale, width, height } = state;
  camera.left = -width / (2 * scale);
  camera.right = width / (2 * scale);
  camera.top = height / (2 * scale);
  camera.bottom = -height / (2 * scale);
  camera.position.set(x, 1200, y + 1000);
  camera.lookAt(x, 0, y);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
/** Interpolate the actual two triangles of each terrain cell, including coastal slopes. */
export function surfaceHeight(
  geometry: T.PlaneGeometry,
  x: number,
  y: number,
): number {
  const {
    width,
    height,
    widthSegments: nx,
    heightSegments: ny,
  } = geometry.parameters;
  const fx = Math.max(0, Math.min(nx - 1e-6, (x / width) * nx)),
    fy = Math.max(0, Math.min(ny - 1e-6, (y / height) * ny));
  const ix = Math.floor(fx),
    iy = Math.floor(fy),
    tx = fx - ix,
    ty = fy - iy,
    a = iy * (nx + 1) + ix,
    b = a + nx + 1;
  const p = geometry.attributes.position;
  return tx + ty <= 1
    ? p.getY(a) * (1 - tx - ty) + p.getY(a + 1) * tx + p.getY(b) * ty
    : p.getY(b + 1) * (tx + ty - 1) +
        p.getY(b) * (1 - tx) +
        p.getY(a + 1) * (1 - ty);
}

/** Raycast only height-field cells crossed within its bounded vertical extent. */
export function intersectTerrain(
  ray: T.Ray,
  geometry: T.PlaneGeometry,
): T.Vector3 | null {
  if (Math.abs(ray.direction.y) < 1e-6) return null;
  const high = ray.at((32 - ray.origin.y) / ray.direction.y, new T.Vector3());
  const low = ray.at((-3 - ray.origin.y) / ray.direction.y, new T.Vector3());
  const {
    width,
    height,
    widthSegments: nx,
    heightSegments: ny,
  } = geometry.parameters;
  const x0 = Math.max(0, Math.floor((Math.min(high.x, low.x) / width) * nx));
  const x1 = Math.min(
    nx - 1,
    Math.floor((Math.max(high.x, low.x) / width) * nx),
  );
  const y0 = Math.max(0, Math.floor((Math.min(high.z, low.z) / height) * ny));
  const y1 = Math.min(
    ny - 1,
    Math.floor((Math.max(high.z, low.z) / height) * ny),
  );
  const p = geometry.attributes.position,
    a = new T.Vector3(),
    b = new T.Vector3(),
    c = new T.Vector3(),
    hit = new T.Vector3();
  let best: T.Vector3 | null = null,
    dist = Infinity;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * (nx + 1) + x,
        j = i + nx + 1;
      for (const indices of [
        [i, j, i + 1],
        [j, j + 1, i + 1],
      ]) {
        a.fromBufferAttribute(p, indices[0]);
        b.fromBufferAttribute(p, indices[1]);
        c.fromBufferAttribute(p, indices[2]);
        if (ray.intersectTriangle(a, b, c, false, hit)) {
          const d = hit.distanceToSquared(ray.origin);
          if (d < dist) {
            dist = d;
            best = hit.clone();
          }
        }
      }
    }
  return best;
}
