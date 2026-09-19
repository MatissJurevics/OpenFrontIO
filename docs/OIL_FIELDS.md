# Oil fields and land rigs

This fork adds generated, renewable oil fields to every map. It builds on upstream `13b40338`; the old fork's custom commits were not reapplied.

## Playing

- Toggle **Oil fields** in the upper-left sidebar. Amber patches are buildable deposits; brighter areas show higher noise concentration. The overlay remains readable above territory colors.
- Hover or tap a deposit to see its size, capacity, operating rigs, and your estimated gold per second. The same layer has visibility/opacity controls in graphics settings.
- Select the pumpjack icon in the bottom build bar (or **Oil rig** in the build menu), then place it on a deposit in your territory. Ordinary building spacing and affordability rules apply. Rigs cannot be upgraded.
- A rig normally costs **125,000 gold**, takes **5 seconds** to construct, and generates up to **1,000 gold per second**. Existing infinite-gold and instant-build options apply.
- Capture rigs to take their future production. Unfinished, destroyed, and submerged rigs do not produce. Shared fields cross borders; ownership of land alone does not reserve production.

## Shared-field rule

Each connected deposit has `max(1, floor(land oil tiles / 400))` rig-equivalents of capacity. Fields smaller than 80 tiles are discarded.

For a field with capacity C and N operating rigs:

```
field gold per second = 1,000 × min(C, N)
owner's share = owner's operating rigs / N
```

A capacity-10 field with 8 rigs owned by A and 4 by B produces 10,000 gold/sec. A receives approximately 6,667 and B 3,333. Additional rigs never increase an already saturated field's total production. Capture offers a better return than endlessly adding your own rigs, although extra rigs can contest a rival's share.

Payouts are whole gold. The simulation divides gold equally per rig, then rotates the rounding remainder by stable unit ID so it neither creates money nor permanently favors older rigs. The UI shows the floored average share; individual payouts may differ slightly through rounding.

Oil is renewable in this version. Concentration determines which tiles belong to a field and its overlay intensity; total field size sets production capacity. There is no separate oil inventory, depletion, offshore drilling, refinery, rig upgrade, or dedicated oil-seeking AI yet. Balance values are starting values for playtesting.

## Implementation

- `src/core/game/OilFields.ts`: deterministic two-octave gradient noise, cutoff, connected-component grouping and cached immutable geology. Map dimensions and initial terrain determine the seed, independent of ownership or random simulation state.
- `src/core/execution/OilEconomyExecution.ts`: one shared economy pass every 10 simulation ticks, attached by `GameRunner`. Counts all owners before distributing capped production, including capture changes. Gold feeds the normal balance, lifetime-income metric and a dedicated oil statistics source.
- Rig integration uses the existing build intent, placement validation, construction, structure/capture/deletion groups and unit updates. The new enum values are appended to preserve existing indices.
- `MapLayerController` builds an RGBA oil overlay from the same core geology. `Renderer` supports thematic layers above territory. `GameLeftSidebar` provides the toggle and field inspection.
- Rig rendering appends a pumpjack SVG to the structure atlas at runtime. Existing structure columns remain in their original order; rigs have a diamond frame. The hotbar, build menu, disabled-unit controls and statistics include rigs.

Both multiplayer clients must run this fork's same game version. Existing upstream replays/clients are not a compatibility target for the new economy. The local browser smoke test used single-player; automated tests cover shared ownership and deterministic generation.

## Validation

Feature tests cover deterministic generation, connected land-only fields, immutable geology after terrain changes, valid/invalid placement, costs, disabled rigs, construction completion, shared caps, rival ownership, rounding fairness, capture, destruction, submersion and independent deposits. Production build and changed-file lint checks are also run. See the task's delivery note for final test results.

## Self-hosted playtesting

Use `Dockerfile.standalone` for a production asset build and guest multiplayer without the proprietary account service. Set `DOMAIN` to the public hostname. `STANDALONE=true` is an explicit opt-in: randomly generated, private browser IDs serve as guest bearer credentials. Keep these credentials secret; clearing browser storage creates a new guest identity. Account login, ranked matchmaking, purchases and cloud archives are not provided. Production rate limits still apply. The admin bot API is disabled unless explicitly configured; the internal API key is generated privately at container startup.

Local development: `STANDALONE=true npm run dev`. The setting reaches both the Vite page and the game server. Public deployment: build `Dockerfile.standalone`, route HTTPS and WebSockets to container port 80. No database or persistent volume is required for this playtest; restarting loses active matches.
