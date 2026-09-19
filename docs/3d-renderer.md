# 3D map rendering

The default view uses a Three.js scene with an orthographic camera, raised terrain, directional lighting, shadows, forests, animated water, and original procedural models. Its landscape palette takes visual inspiration from Civilization VI, while cities use modern glass towers, apartment blocks and streets; no Civilization assets are included.

Use **I** for 3D, **O** for the classic 2D view, or the sidebar buttons. Drag and scroll retain the normal map controls. The selected view is saved locally. The simulation and multiplayer protocol are unchanged.

Player names and live troop totals appear together on high-contrast labels, scaled together with their territory and inset within its projected borders, including holes and narrow regions. Country fills and colored borders make ownership visible across the terrain.

Cities, factories, harbors, oil rigs, defenses, missile silos and SAM launchers have geometry above the ground. Harbors face nearby water. Warships have naval camouflage, turrets and radar; trade ships carry colored cargo; invasion transports have open troop decks. Ships interpolate between simulation updates. Nuclear missiles rise above the map, and impacts create expanding, fading mushroom clouds and shock rings.

Oil is painted into the raised terrain when its overlay is enabled. Building previews, selection rings, spawn markers, attack markers and nuclear target rings use map coordinates. Pointer picking intersects the actual terrain triangles. The height-field raycast checks only cells crossed between the minimum and maximum elevation, avoiding a full-map triangle scan on pointer movement.

## Local visual test

Run the normal standalone development server:

```sh
STANDALONE=true npm run dev
```

For a separate art gallery with every building, all three ship classes and a nuclear effect button:

```sh
npm run preview:3d
```

The gallery is at `http://localhost:9010/dev/3d-preview.html`. It uses synthetic terrain and the same scene/models as the game; it is not a multiplayer match. Drag to pan and scroll to inspect details.

## Validation and limits

`tests/client/Scene3D.test.ts` checks elevated terrain projection/picking, the accelerated intersection against Three.js triangle raycasting, anchored zoom, finite geometry for every unit type, and distinct ship silhouettes. The focused input, settings, oil-economy and rendering checks pass.

This is a procedural art implementation, not Civilization VI's asset fidelity. The 3D scene has a bounded terrain mesh and instanced vegetation, but very large endgame fleets still need performance profiling. Cosmetic skins, railway drawing and the existing day/night postprocessing remain features of the classic 2D renderer. The visual camera height does not change simulation movement, attack ranges or line of sight.
