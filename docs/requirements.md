# Cinema Hall Kit — Requirements

Library for constructing cinema halls and selecting seats with a 3D seat view, with smooth transitions between the map and 3D view. It is integrated into a React + TypeScript booking app through npm packages. A Next.js example is included.

| Document                                                           | Contents                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| [`concept-analysis.md`](./concept-analysis.md)                     | concept analysis                                          |
| [`api.md`](./api.md)                                               | **public API, the single source of truth for signatures** |
| [`api-decisions.md`](./api-decisions.md)                           | API review by three critics and accepted decisions        |
| [`examples/meridian-hall-3.yaml`](./examples/meridian-hall-3.yaml) | sample config                                             |
| [`../NOTICE.md`](../NOTICE.md)                                     | licenses                                                  |

---

## 1. Scope

**The library provides:**

- hall description (YAML/JSON ⇄ typed object) and validation;
- seat layout and viewing metrics;
- a seat manifest for the database and seat selection rules (the same on the client and server);
- UI: constructor, map, 3D view, transitions, and sheet.

**The library does not provide:**

- networking;
- storage;
- holds or payment;
- authorization;
- real-time transport.

The host passes data through props and receives results through callbacks that return values (`BookResult`, `SaveResult`). The boundary is described in detail in api.md §8.

---

## 2. Repository structure

Monorepo using pnpm workspaces. The example consumes packages **only through their public `exports`** from the built `dist`, like a regular npm consumer. The linter prohibits imports from `packages/*/src` in `apps/*`.

```
cinema-hall-kit/
├─ packages/
│  ├─ core/                 @cinema-hall/core — framework-free TS, no React/three/DOM; includes CLI (bin)
│  │  └─ src/
│  │     ├─ schema/         zod schema, limits, HallConfig types; JSON Schema
│  │     ├─ codec/          parse/serialize YAML+JSON while preserving comments
│  │     ├─ validation/     rules (one per file), validateHall, validateEdit
│  │     ├─ layout/         buildHallLayout, createSeatIndex, SeatKey
│  │     ├─ metrics/        computeSeatView, zones
│  │     ├─ selection/      selectionRules, validateSelection
│  │     ├─ occupancy/      session types, applyOccupancyDelta
│  │     ├─ manifest/       buildSeatManifest, diffSeatManifests, canonical hashes
│  │     ├─ cli/
│  │     └─ index.ts
│  └─ react/                @cinema-hall/react
│     └─ src/
│        ├─ provider/       CinemaHallProvider, theme → CSS vars + THREE.Color, labels
│        ├─ theme/          tokens.ts (single source of truth), styles (@layer chk.*)
│        ├─ seat-map/       2D map (SVG)
│        ├─ scene/          three object builders: room, screen, seats, avatars, decals
│        ├─ seat-view/      R3F Canvas, look-around camera
│        ├─ transitions/    phase timeline, blur/dpr, camera tween
│        ├─ sheet/          react-modal-sheet wrapper + glass skin
│        ├─ seat-picker/    SeatPicker, SeatPickerRoot/Map/View/Sheet, useSeatPicker
│        ├─ constructor/    useHallEditor, HallConstructor + parts
│        ├─ slots/          default Button/Chip/Card primitives, SlotProps types
│        └─ index.ts
├─ apps/demo/               Next.js (App Router)
├─ docs/
├─ LICENSE (0BSD) · NOTICE.md
└─ package.json · pnpm-workspace.yaml · tsconfig.base.json
```

### 2.1 Dependencies (versions as of 2026-11-09)

| Package | `dependencies`                                                                                             | `peerDependencies`                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| core    | `zod` ^4.6, `yaml` ^2.9                                                                                    | —                                                                                   |
| react   | `@cinema-hall/core` (`workspace:^`), `react-modal-sheet` ^5.7                                              | `react` ^19, `react-dom` ^19, `three` ≥0.187, `@react-three/fiber` ^9, `motion` ≥14 |
| demo    | `next` ^16.4, `react`, `react-dom`, `three`, `@react-three/fiber`, `motion`, both packages (`workspace:*`) | —                                                                                   |

- Anything that must have a single instance (React, three, R3F, motion) is a **peer dependency**. Two copies break R3F context, `instanceof`, and animations.
- **`react-modal-sheet` is a regular dependency:** the host does not use it directly, and its API is not exposed (api.md §6).
  - The npm package `react-sheet` is an abandoned React 16 table. The sheet used here is called `react-modal-sheet`.
- **`motion` is needed by two parts:** the sheet and the DOM transition phases. No separate animation library is needed.
- **Not used:** drei, gsap, postprocessing, react-hook-form, or UI kits. Blur uses CSS `filter` and `backdrop-filter`, not WebGL post-processing.
- **All dependency licenses:** MIT or ISC. The allowlist is in NOTICE.md and checked in CI.

### 2.2 Build and publishing

- `tsup`: ESM + `.d.ts`, `sideEffects: ["*.css"]`, `exports` field with `types` / `import`.
- Add a `"use client"` banner to the `react` bundle.
- `styles.css`: all rules are inside `@layer chk.reset, chk.structure, chk.skin` and use `:where()` (api.md §7.1).
- Run `publint` and `@arethetypeswrong/cli` before publishing.
- `changesets`. Each package has `"license": "0BSD"` and a `LICENSE` file.

### 2.3 Quality

- TypeScript `strict` + `noUncheckedIndexedAccess`, no `any` in the public API.
- ESLint (flat config, `typescript-eslint`) + Prettier.
- Tests:
  - **`core`** — vitest, ≥ 90% coverage; golden files for "config → manifest"; verify that `structuredClone(layout)` produces the same object.
  - **`react`** — tests for the editor reducer, seat map (keyboard, aria), and transition timeline (interruption, reverse direction).
  - **`demo`** — Playwright smoke tests (§6).
- Root scripts: `dev`, `build`, `test`, `lint`, `typecheck`.

---

## 3. Data model

### 3.1 Hall config (`version: 1`)

| Block           | Fields                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| root            | `version`, `id?`, `name`, `meta?`                                                                                                 |
| `hall`          | `width`, `depth`, `height`, `wallColor?`, `floorColor?`, `meta?`                                                                  |
| `screen`        | `width`, `height`, `elevation`, `curvature?`                                                                                      |
| `seatTypes`     | `id → { label, width, depth, color, meta? }`, at least one                                                                        |
| `layout`        | `firstRowDistance`, `rowLabels`, `seatNumbering`, `eyeHeight?`, `bands[]`                                                         |
| `bands[]`       | `id`, `gapBefore?`, `riserHeight?`, `defaults?`, `sections[]`, `meta?`                                                            |
| `sections[]`    | `id`, `seatsPerRow`, `gapBefore?`, `rows?`, `rowSpacing?`, `seatPitch?`, `seatType?`, `priceTier?`, `color?`, `exclude?`, `meta?` |
| `constraints?`  | validation thresholds (overridden on the server through `enforce`)                                                                |
| `viewingZones?` | `[{ id, label, minFov }]`                                                                                                         |

- **A band** is a row of sections along the hall's depth. A grid of "E columns × K section rows" is described as K bands with E sections each.
- **Row spacing is set on each section**, with a fallback to the band's `defaults`.
- **Bands are centered** on the screen axis.
- **Seat key:** `SeatKey = <sectionId>.r<N>.s<M>`, where N and M are the row and seat numbers within a section. Its separate label, `label = B4`, is used only in the UI (api.md §2.1).
- **Hard limits** (structural): at most 100 rows per section, 200 seats per row, 5000 seats per hall, and 64 sections.
- Unknown keys outside `meta` are errors.

### 3.2 Session data

This data is not part of YAML. It is passed through separate props: `occupancy`, `pricing`, `avatars`, and `screen` (api.md §2.6).

- `occupancy` includes `revision` and `held` with `mine` and `expiresAt`.
- Prices use minor units and price categories (`priceTier`).
- Avatars contain no personal data.

---

## 4. Hall validation

Each check is a separate rule function. Extend the list through `extraRules` and change severity through `severity` (down to `'off'`).

| Code                                   | Severity          | Condition                                                                                          |
| -------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| `schema.*`                             | error, structural | types, limits, hex colors, `seatType` references, unique `id`s, `unsupportedVersion`, unknown keys |
| `fit.width`                            | error             | widest band width + 2 × `minWallClearance` > `hall.width`                                          |
| `fit.depth`                            | error             | last row + half seat depth + `minRearClearance` > `hall.depth`                                     |
| `fit.screenWidth` / `fit.screenHeight` | error             | screen does not fit in the hall                                                                    |
| `fit.headroom`                         | error             | last row's eye height + 0.5 m > `hall.height`                                                      |
| `rows.legroom`                         | error             | `rowSpacing − seatType.depth` < `minLegroom`                                                       |
| `rows.pitch`                           | error             | `seatPitch` < `seatType.width`                                                                     |
| `layout.aisle`                         | warning           | aisle < `minAisleWidth`                                                                            |
| `view.firstRowTooClose`                | warning           | `firstRowDistance / screen.width` < `minFirstRowDistanceRatio`                                     |
| `view.frontRowVertical`                | warning           | angle from the first row to the top edge of the screen > `maxFrontRowVerticalAngle`                |
| `view.sightline`                       | warning           | the head of the person in front blocks the lower edge of the screen                                |
| `field.locked`                         | error             | editing a field forbidden by policy (`validateEdit`)                                               |

Thresholds are engineering guidance, not standards. The example intentionally produces one warning: `view.frontRowVertical`, 44° at a 40° threshold.

**Metrics:**

- `distance` — distance from the eyes to the center of the screen;
- `fovDeg` — horizontal angle at which the screen is visible;
- `lateralOffset` — signed offset on the X axis;
- `zone` — the first entry in `viewingZones` for which `fovDeg ≥ minFov`.

---

## 5. UI

### 5.1 Screen 1 — constructor

The public API is in api.md §3.

- **"Canvas + inspector" layout** (chosen by the user after the accordion form proved too complicated):
  - a scaled hall plan in the center: click to select a section, band, screen, or hall; errors appear as icons on objects; 2D ↔ 3D;
  - an inspector on the right with fields for the selected object only; with nothing selected, show a hall overview (seats by type, maximum revenue, issues);
  - one row at the top: name, hall and screen dimensions, Template, Import, Export, "Seats and prices", undo/redo, and "Save";
  - below 900 px: plan on top, inspector below.
- **Prices:** in the "Seats and prices" panel and section inspector ("Seat price"); plain numbers up to two decimal places, no currency, sign `¤`.
- **Templates:** "Start with a template" offers built-in templates and host templates.
- **Bands and sections:** add with "+" directly on the plan, delete, duplicate, and reorder with ← → / ↑ ↓ in the inspector or from the keyboard (mouse dragging pans the plan, so drag and drop for sections is intentionally not used). Inherited values appear in the list as "Same as band (…)" beside a "reset to band value" button.
- **Validation:**
  - runs synchronously after each applied change (a field applies its value on blur, Enter, or arrow keys, not on every keystroke);
  - issues are grouped into errors and warnings; clicking an item focuses the field (by `ref`/`path`);
  - the problematic object is highlighted in the 3D preview.
- **Import and export:**
  - import: paste or choose a file; errors include line and column;
  - export: download or copy YAML with comments preserved;
  - "Save" is disabled when there is an `error`.
- **History:** undo/redo with `Ctrl/Cmd+Z` and `Shift+Ctrl/Cmd+Z`, an unsaved-changes indicator, and a warning on page exit when `dirty` is true.
- **Before saving:** if `onSave` returns `seats_in_use`, the constructor highlights the affected seats.

### 5.2 Screen 2 — seat selection (based on the concept)

The public API is in api.md §4.

**Map (2D, SVG):**

- States and tokens follow concept-analysis §2 and §4. Seat type and status are independent; `held` has its own appearance.
- Accessibility:
  - `role="grid"`; arrow-key navigation, Enter, or Space selects a seat;
  - `aria.*` labels come from `labels`;
  - taken seats use `aria-disabled`.
- Scales to its container and supports pinch zoom on narrow screens.
- While `occupancy === undefined`, the map is visible but seats are inactive.

**3D view:**

- Walls, floor, curtains, and point lighting. The screen texture from `screen` is the primary light source. Rows are tiered.
- Seats use one `InstancedMesh` per type; the selected seat uses the `accent` color.
- **Avatars for `taken` seats:**
  - always instanced;
  - head height varies deterministically by up to ±7 cm, so avatars can actually block the screen;
  - color comes from `avatars[key].color` or is derived from a hash.
- **Camera:**
  - "look around": yaw ±70°, pitch −30°…+25°, optional gyroscope;
  - no translation or zoom;
  - a button to "return view to screen".
- **Sheet:**
  - zone label, seat, type and price, mini map, three metrics;
  - `Change seat` and `Book · {price}` buttons;
  - in `multiple` mode, selection total and hold timer.

### 5.3 Transitions

Transitions are part of the library (api.md §5).

- **Phases:** `mapZoom` → `crossfade` → `cameraFlight` → `sheetIn`. Presets: `cinematic`, `subtle`, `none`.
- **Blur:**
  - CSS `filter` on the map and Canvas wrapper;
  - render with a lower `dpr` during `cameraFlight`;
  - `backdrop-filter` on the sheet, and the scene blurs slightly as the sheet rises (`dimScene`).
- **Behavior:**
  - the timeline can be interrupted and reversed from its current point;
  - the reverse transition runs at speed 0.7;
  - `motion: 'reduced'` makes changes immediate with a short fade;
  - `quality: 'low'` replaces blur with a fade and does not lower `dpr`.
- **Budget:**
  - no frame takes longer than 50 ms during a transition on an average phone;
  - blur radius is no more than 16 px;
  - no more than two layers are blurred in one frame.

### 5.4 Sheet (`react-modal-sheet`, glass skin)

The public API is in api.md §6.

- `unstyled` mode with a custom glass skin: `backdrop-filter: blur(24px) saturate(160%)`, translucent tint, 1 px border, and inner highlight.
- Non-modal, with `mountPoint` at the picker root and snap points `[0, 'peek', 1]`.
- Skins: `glass`, `plain`, `none`. Fall back to an opaque background when `backdrop-filter` is unavailable, and for `prefers-reduced-transparency` and `prefers-contrast: more`.

### 5.5 Non-functional requirements for 3D

- Up to 600 seats: 60 fps on a recent mid-range phone, draw calls < 50.
- `dpr` in the range [1, `maxDpr`]; use `frameloop="demand"` outside animations.
- All resources are released on unmount: no leaks after switching seats 20 times.
- Canvas is created only on the client. Importing the package on the server is safe.
- If WebGL is unavailable, the `webglFallback` slot is shown and the map continues to work.

---

## 6. `apps/demo` example (Next.js 16, App Router)

| Route                   | What it shows                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                     | links to the two screens                                                                                                                                                                   |
| `/constructor`          | `HallConstructor` with `useHallEditor`. Starts from `meridian-hall-3.yaml`, stores a draft in `localStorage`, `onSave` → route handler; displays `SaveResult` (`invalid` / `seats_in_use`) |
| `/sessions/[sessionId]` | `SeatPicker`. Config is parsed in a Server Component, `occupancy` arrives through polling, `onBook` calls a Server Action                                                                  |
| `app/api/...`           | in-memory mock backend following api.md §8: hall versions, holds with 10-minute TTL, conflict on double booking, `validateSelection` and `validateHall({ enforce: true })` on the server   |

The demo shows:

- provider in the client layout;
- English UI and validation messages;
- theme overrides through the `app` CSS layer;
- a custom `Button` slot;
- syncing `view` with the URL (`?seat=centre.r2.s1`).

Media in `public/` must be original or CC0; sources are listed in `CREDITS.md`.

**Playwright smoke tests:**

1. Constructor: increase `seatsPerRow` → `fit.width` error → fix it → exported YAML matches the expected output and comments are preserved.
2. Booking: select a seat → 3D view and metrics → Book → hold and timer. A taken seat cannot be selected. Concurrent booking of the same seat returns `conflict`.
3. Transition: Back mid-flight reverses the animation; there are no console errors.

---

## 7. Visual rules

- **Gradients are prohibited everywhere:** CSS `linear-/radial-/conic-gradient`, SVG `<linearGradient>/<radialGradient>`, canvas `create*Gradient`. Softness, depth, and glow use only blur and glass effects: `filter: blur()`, `backdrop-filter`, SVG `feGaussianBlur`, and blurred `box-shadow`. A screen with no content uses a solid color.
- CI check: `pnpm check:no-gradients` (included in `pnpm lint`).

## 8. Code principles

- **SRP:**
  - `core` computes, `scene/` builds three objects, `transitions/` manages timing, and components connect everything to React;
  - one builder per object type.
- **OCP:** validation rules, selection rules, templates, slots, and zones are data and functions that can be extended without changing the core.
- **DIP:** the UI depends on types (`HallConfig`, `Occupancy`, `BookResult`), not on the data source.
- **DRY:**
  - the zod schema is the single source of types and structural validation;
  - `tokens.ts` is the single source of theme tokens;
  - the same `selectionRules` and `validateHall` work on the client and server.
- **KISS:**
  - no global store;
  - a reducer for the editor;
  - one timeline for transitions;
  - minimal dependencies.
- **Public API** is re-exported only from `index.ts`. The semver boundary is described in api.md §7.6.

---

## 9. Acceptance criteria

1. `pnpm i && pnpm build && pnpm test && pnpm lint && pnpm typecheck` pass from the root on a clean clone.
2. `parse(serialize(x)) ≡ x` for the default config and the example. Comments and `meta` are preserved.
3. For `meridian-hall-3.yaml`, the metrics for B4 (`centre.r2.s1`), F8, and I12 match concept-analysis §3 within 0.1 m and 1°.
4. Every check in §4 and every selection rule has a positive and a negative test.
5. The example's golden manifest is stable. Changing the `left` section does not change keys in the `centre` section.
6. `next build` for the demo runs without server/client boundary warnings. `publint`, `attw`, and the license check pass.
7. The smoke tests in §6 pass. The seat map is operable by keyboard alone.
8. Host styles from `@layer app` override package styles without `!important` (visual test in the demo).

## 10. Default decisions (can be changed)

| Question        | Decision                                                   |
| --------------- | ---------------------------------------------------------- |
| License         | 0BSD — no conditions, attribution not required (NOTICE.md) |
| Prices          | in session data, by `priceTier`, in minor units            |
| Seat key        | `SeatKey` (`centre.r2.s1`) separate from the label (`B4`)  |
| Package manager | pnpm                                                       |
| npm scope name  | `@cinema-hall/*` (replace with your own)                   |
