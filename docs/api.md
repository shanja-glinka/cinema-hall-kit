# Cinema Hall Kit — Public API (v0.2)

This document describes everything a developer sees when integrating the library. Version v0.2 was revised after review by three independent critics (code DX, customization, and backend integration). Accepted and rejected findings are listed in [`api-decisions.md`](./api-decisions.md).
Requirements are in [`requirements.md`](./requirements.md), and the hall format is in [`examples/meridian-hall-3.yaml`](./examples/meridian-hall-3.yaml).

## 0. Choosing a customization level

Start with the simplest mechanism that solves the task:

| Need                                              | Mechanism                                                                               |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| colors, radii, font, glass                        | **theme tokens** (`theme` or CSS variables `--chk-*`)                                   |
| detail for one element                            | **data attributes** (`[data-chk="seat"][data-status="taken"]`), optionally `classNames` |
| custom buttons, chips, cards from your UI library | **primitive slots** `Button`, `Chip`, `Card`                                            |
| different markup for part of the UI               | **structural slots** `seat`, `sheetContent`, `webglFallback`                            |
| custom screen layout                              | **parts**: `SeatPickerRoot` + `SeatPickerMap` / `SeatPickerView` / `SeatPickerSheet`    |
| fully custom UI                                   | **headless**: `useSeatPicker()`, `useHallEditor()`                                      |
| server, CLI, non-JS backend                       | **core**: `buildSeatManifest()`, `validateSelection()`, JSON Schema                     |

Set shared settings (theme, labels, locale, primitive slots) once in `CinemaHallProvider`. Component props override the provider: objects are merged by key, and only explicitly supplied slots are replaced.

---

## 1. Quick start (Next.js App Router)

Only the **config** crosses the Server → Client boundary: it is plain data of about 2 KB. The client computes the layout deterministically.

```tsx
// app/sessions/[sessionId]/page.tsx — Server Component
import { parseHallConfig } from '@cinema-hall/core';
import { BookingClient } from './booking-client';

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await db.sessions.get(sessionId); // session → hall version → config
  const { config } = parseHallConfig(await db.hallVersions.getConfig(session.hallVersionId), {
    strict: true,
  });
  return <BookingClient config={config} sessionId={sessionId} />;
}
```

```tsx
// app/sessions/[sessionId]/booking-client.tsx
'use client';
import { SeatPicker, type HallConfig } from '@cinema-hall/react';

export function BookingClient({ config, sessionId }: { config: HallConfig; sessionId: string }) {
  const { data } = useSessionOccupancy(sessionId); // SWR/React Query/WS — the host's choice
  return (
    <SeatPicker
      config={config}
      occupancy={data?.occupancy} // undefined → map is visible, seats are inactive
      pricing={data?.pricing}
      onBook={(keys, ctx) => holdSeats(sessionId, keys, ctx)} // Server Action → BookResult
      onBooked={(r) => router.push(`/checkout/${r.data.holdId}`)}
    />
  );
}
```

```tsx
// app/(client)/providers.tsx — once per application
'use client';
import { CinemaHallProvider, labels } from '@cinema-hall/react';
import '@cinema-hall/react/styles.css';

<CinemaHallProvider locale="en-US" labels={labels.en} theme={{ seed: { accent: '#87D9B4' } }}>
  {children}
</CinemaHallProvider>;
```

**Can be passed from a Server Component:** `config`, `occupancy`, `pricing`, `avatars`, `screen`, `view`, and `theme` without functions.
**Client file only:** `slots`, `labels` containing functions, `selection.rules`, `transitions.cameraFlight.path`, `scene` containing functions, and all callbacks.

Parts are exported by name (`SeatPickerRoot`, not `SeatPicker.Root`): Next does not allow accessing a client module through a property from server code.

---

## 2. `@cinema-hall/core` — framework-free TypeScript for Node, browsers, and the CLI

### 2.1 Seat identity

Each seat has two distinct identifiers:

|           | Example        | Purpose                              | Stability                                                                                                                      |
| --------- | -------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `SeatKey` | `centre.r2.s1` | key in the DB, `occupancy`, `onBook` | `${sectionId}.r${row within section}.s${seat within section row}`; does not change when **other** sections or bands are edited |
| `label`   | `B4`           | UI only                              | changes whenever seats are renumbered                                                                                          |

The key does not depend on global numbering or row letters, so `seatNumbering: perSection` cannot create collisions.
Individual seats can be removed with `exclude: ['r1.s1']` in a section, using section-local keys. This creates an aisle or wheelchair space: the geometry remains empty, no label is assigned, and neighboring keys do not change.
Rule: changing a section's `seatsPerRow` or `rows` affects keys only at the end of **that** section. This is visible in `diffSeatManifests`. Sessions are tied to a hall version (§8), so existing bookings do not move.

### 2.2 Parsing and serialization

```ts
parseHallConfig(input: string | unknown, opts?: ParseOptions): ParseResult
interface ParseOptions {
  format?: 'yaml' | 'json' | 'auto';  // always parsed with one YAML 1.2 parser (JSON is a subset); affects only error text
  strict?: boolean;          // true — throws HallConfigError on a structural error (useful on the server)
  maxBytes?: number;         // 256 KB by default; aliases, explicit tags, and duplicate keys (in YAML and JSON) are always forbidden
}
type ParseResult =
  | { ok: true;  config: HallConfig; issues: Issue[] }   // issues — semantic (fit.*, rows.*) and warnings
  | { ok: false; issues: Issue[] };                      // structural errors only (syntax, schema, limits)
```

`ok` means only that the structure is valid. A hall with a `fit.width` issue parses successfully; open it in the constructor to fix it.

```ts
serializeHallConfig(config: HallConfig, opts?: { format?: 'yaml' | 'json'; source?: string }): string
// source — the original YAML; comments and key order are taken from it
defineHall(config: HallConfig): HallConfig            // identity helper for autocomplete
templates.threeSections({ rows, seats: [3, 8, 3], aisle }) / templates.single(...) / templates.stadium(...)
hallConfigJsonSchema                                  // JSON Schema: structure and per-field limits for non-JS backends
```

**Hard schema limits** (structural, checked before layout calculation to protect the API from DoS): `rows ≤ 100` per section, `seatsPerRow ≤ 200`, `≤ 5000` seats per hall, `≤ 64` sections.
A config with a `version` greater than the supported version produces `schema.unsupportedVersion`. A migration function will be added with `version: 2`.

**Custom fields:** `meta` (arbitrary JSON) is allowed at the root, on the `hall`, band, section, and seat type. It is preserved on round-trip and included in the manifest. Other unknown keys are structural errors, not silently removed.

### 2.3 Validation

```ts
validateHall(config, opts?: {
  extraRules?: ValidationRule[];                                  // extend defaultRules
  severity?: Partial<Record<IssueCode, 'error' | 'warning' | 'off'>>;
  constraints?: Partial<Constraints>;
  enforce?: boolean;   // true (server): ignore constraints from the document; only opts + defaults apply
}): Issue[]
// constraints priority: opts > config.constraints (if !enforce) > defaults

interface ValidationRule { code: string; check(ctx: { config; layout; constraints }): Issue[] }

interface Issue {                      // wire format: no preformatted text
  severity: 'error' | 'warning';
  code: IssueCode;                     // BuiltInIssueCode | (string & {}) — autocomplete is preserved
  path: (string | number)[];           // path in the config
  ref?: { bandId?: string; sectionId?: string; seatTypeId?: string };  // stable across reordering
  params?: Record<string, string | number>;
}
formatIssue(issue, messages?: IssueMessages, locale?): string        // English built in

// `issueMessages.ru` remains as a compatibility alias to the English catalog.
validateEdit(prev, next, policy: FieldPolicy): Issue[]               // 'field.locked' — same policy on the server
```

### 2.4 Layout and metrics

```ts
buildHallLayout(config: HallConfig): HallLayout     // pure and deterministic; always returns a result
// The algorithm is frozen for each config version: a behavior change requires a version change.

interface HallLayout {                              // data only: lossless with structuredClone/JSON
  schemaVersion: number;
  seats: Seat[];                                    // row by row, left to right
  rows: Row[]; sections: SectionBox[]; screen: ScreenGeometry; bounds: Box3Like;
}
interface Seat {
  key: SeatKey; label: string; row: string; number: number;
  bandId: string; sectionId: string; seatTypeId: string; priceTier: string;
  position: Vec3; eye: Vec3;                        // meters
}
createSeatIndex(layout): { get(key): Seat | undefined; neighbors(key): { left?: Seat; right?: Seat } }
computeSeatView(layout, key): SeatViewMetrics       // { distance, fovDeg, lateralOffset, zone }
```

### 2.5 Seat selection (same rules in the UI and on the server)

```ts
validateSelection(layout, occupancy: Occupancy, keys: SeatKey[], rules: SelectionRule[]): SelectionViolation[]
selectionRules.max(n) | selectionRules.noSingleGap() | selectionRules.sameRow() | selectionRules.adjacent()
type SelectionRule = (ctx: { keys; layout; index; status(key): SeatStatus }) => SelectionViolation | null
```

### 2.6 Session data

```ts
type SeatStatus = 'available' | 'taken' | 'held' | 'blocked';
interface Occupancy {
  revision: number | string;          // monotonic; older revisions are ignored
  serverNow?: string;                 // ISO timestamp for the hold timer
  taken?: SeatKey[];
  blocked?: SeatKey[];
  held?: { key: SeatKey; mine?: boolean; expiresAt?: string }[];
}
applyOccupancyDelta(prev: Occupancy, delta: OccupancyDelta): Occupancy

type Price = number   // arbitrary units, up to two decimal places, NO currency: 450, 450.5
interface Pricing { tiers: Record<string, Price>; seats?: Record<SeatKey, Price> }   // default tier = seatTypeId

resolvePricing(layout.pricing, session?.pricing): Pricing | undefined   // session prices override hall prices by tier
priceForSeat(pricing, seat): Price | null    // converts to minor units; negative or non-numeric → "no price"
sumPrices(prices): Price | null               // sum in minor units; null if any price is missing
formatPrice(450.5, 'en-US') // → '450.50 ¤' — neutral sign; change via labels.picker.priceSign or formatPrice
```

**Prices.** Base prices are set in the hall config (`pricing.tiers`, editable in the constructor) and use the same number everywhere—in the config, session data, and booking. No unit conversion is needed, so there is no "off by 100" error. A session can override any tier (for example, an evening or LUX session may cost more). No currency is specified: the UI shows prices with the neutral `¤` sign, which the host can replace through `formatPrice`.

```yaml
pricing:
  tiers:
    standard: 450
    recliner: 650
type Avatars = Record<SeatKey, { seed?: string; color?: string; imageUrl?: string }>  // no names or personal data
```

### 2.7 Database manifest

```ts
buildSeatManifest(config): SeatManifest
interface SeatManifest {
  manifestVersion: 1; schemaVersion: number;
  seatSetHash: string;      // sha256 of canonical JSON: keys + label + seatType + priceTier (excluding colors and meta)
  geometryHash: string;     // sha256 of positions rounded to millimeters
  seats: { key; label; row; number; sectionId; seatTypeId; priceTier; x; y; z; rowIndex; col }[];
  meta?: Meta;                                            // hall meta; excluded from hashes
  seatTypes: Record<string, { label: string; meta?: Meta }>;
  sections: Record<string, { bandId: string; meta?: Meta }>;
}
diffSeatManifests(prev, next): { added; removed; moved: { key; dx; dy; dz }[]; relabelled: { key; from; to }[]; retyped: SeatKey[] }
// moved compares the same coordinates rounded to millimeters as geometryHash
```

Hashes are computed from the parsed canonical object with sorted keys, not from YAML text. The release includes golden files for "config → manifest"; ports to other languages can be checked against them.

### 2.8 CLI (`bin` in the `core` package)

Run the published CLI directly through the npm registry:

```sh
npx @cinema-hall/core validate hall.yaml [--json] [--enforce constraints.json]   # exit 1 on error
npx @cinema-hall/core manifest hall.yaml > seats.json
npx @cinema-hall/core layout   hall.yaml > layout.json
npx @cinema-hall/core schema > hall.schema.json
```

In the current repository clone, build the CLI and run it directly from `dist`:

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/core/dist/cli.js validate docs/examples/meridian-hall-3.yaml
```

Known limitation: JSON Schema checks only structure and per-field limits (no more than 100 rows per section, no more than 200 seats per row). Only `parseHallConfig` checks global limits (5000 seats per hall, 64 sections), seat type references, unique IDs, and geometry rules (`fit.*`, `rows.*`)—in Node, through the CLI, or in a sidecar.

---

## 3. Constructor

### 3.1 The editor is the single canonical entry point

```tsx
'use client';
const editor = useHallEditor({
  initial: config, // HallConfig
  source: yaml, // optional: original YAML to preserve comments
  policy: { 'hall.width': 'locked', 'screen.elevation': 'hidden' }, // FieldKey → 'editable'|'locked'|'hidden'
  extraRules,
  constraints,
  severity,
});

<HallConstructor
  editor={editor}
  templates={[...builtInTemplates, { id: 'imax', label: 'IMAX', create: () => imaxConfig }]}
  extraFields={[
    { key: 'meta.hallType', label: 'Hall type', control: 'select', options: ['IMAX', '2D'] },
  ]}
  fieldLimits={{ 'section.seatPitch': { min: 0.5, max: 0.8, step: 0.05 } }}
  view="2d" // '2d' | '3d' — what the canvas shows on open
  onSave={async (config, ctx) => api.saveHall(config, ctx)} // → SaveResult; see below
/>;
```

**Constructor screen layout** (canvas + inspector):

- **top toolbar:** hall name, chips "Hall 14×16×8 m" and "Screen 11.5×4.8 m" (click to select the hall or screen), Template, Import, Export, "Seats and prices", undo/redo, and "Save" with status;
- **canvas:** scaled hall plan (SVG); click to select a section, band, screen, or hall; errors appear as icons on the objects; "+" to the right of a band adds a section, "+ Section row" adds a band; in "Remove seats" mode, click a seat to exclude it; 2D ↔ 3D;
- **inspector:** only the selected object's fields, with clear wording and units; with nothing selected, a hall overview (seats by type, maximum revenue, issue list);
- move sections and bands with ← → / ↑ ↓ in the inspector or from the keyboard;
- rejected actions show the reason (for example, "Does not fit in depth: 15.5 m needed, hall is 15 m"); removing the last section in a band removes the entire band in one undo step.

For simple cases, use the convenience API: `<HallConstructor defaultValue={config} onSave={…} />` creates the editor internally.

### 3.2 Editor API

```ts
  editor.config: HallConfig            // always structurally valid
  editor.layout: HallLayout            // always present (buildHallLayout is total)
editor.issues: Issue[];  editor.issuesFor(ref | path): Issue[]
editor.dirty: boolean;   editor.markSaved(baseline?, { revision? })
editor.history: { undo(); redo(); canUndo; canRedo; clear() }

editor.patch({ screen: { width: 12 } })                    // DeepPartial, one history step
editor.bands.add({ after? }) | .remove(id) | .move(id, to) | .duplicate(id) | .patch(id, partial)
editor.sections.add(bandId, { after?, ...partial }) | .remove(ref) | .move(ref, to) | .duplicate(ref) | .patch(ref, partial)
editor.seatTypes.add(id, def) | .patch(id, partial) | .remove(id)  // remove → issue if the type is in use
editor.batch(() => { … })                                  // multiple changes = one undo step
editor.importText(text): ParseResult                       // structural errors include line/col
editor.exportYaml(): string                                // with source comments
editor.reset(config, { source?, revision? })   // external baseline (server version): validates structure, not field policy
editor.revision                                   // opaque optimistic-lock token (etag, row version…)
```

While typing (`""`, `"1."`), the input field stores the draft **in the field itself**. The value enters `config` only after parsing, so `NaN` cannot occur in the config.

`FieldKey` is a closed union of about 40 literals (`'hall.width' | 'screen.width' | 'section.seatPitch' | 'band.riserHeight' | …`), with no computed paths using `*`. The `hidden`/`locked` policy is checked by `editor.importText` and `validateEdit`, not merely hidden in the UI.

### 3.3 Saving

```ts
onSave(config, ctx: { yaml; manifest; diff; issues; revision }): Promise<SaveResult>
type SaveResult =
  | { ok: true; baseline?: HallConfig; revision? }                  // new revision token
  | { ok: false; reason: 'conflict'; server: HallConfig; source?; revision? }  // "Load version from server"
  | { ok: false; reason: 'invalid'; issues: Issue[] }              // server validation → highlight fields
  | { ok: false; reason: 'seats_in_use'; keys: SeatKey[] };        // constructor highlights seats with bookings
```

The library stores the revision token: the host passes the initial token to `useHallEditor({ revision })`, receives the current token in `ctx.revision`, and returns a new one in `ok`/`conflict`. The "Save" button is disabled while an `error` exists. Warnings (`warning`) do not block saving. The manifest from the client is only a hint to the server; the server recalculates it.

### 3.4 Parts for custom layouts

`HallConstructorRoot` (accepts `editor`), `HallConstructorToolbar`, `HallConstructorCanvas`, `HallConstructorInspector`, and `HallConstructorIssues`. They expose `useHallEditorContext()` and `useConstructorSelection()` → `{ selection: { kind: 'hall' | 'screen' | 'band' | 'section' | 'seatTypes'; bandId?; sectionId? } | null, select, clear }`, allowing you to build a custom inspector or canvas. Parts available to `classNames`: `editor`, `editorToolbar`, `editorCanvas`, `editorInspector`, `editorIssues`.

---

## 4. Seat selection

### 4.1 Component

```tsx
<SeatPicker
  config={config}                                   // or layout={layout} if it has already been computed
  occupancy={occupancy} pricing={pricing} avatars={avatars}
  screen={{ kind: 'image', src: '/still.jpg' }}     // or { kind: 'video', src, poster }

  selection={{ mode: 'single' }}                    // | { mode: 'multiple'; max?: number; rules?: SelectionRule[] }; both modes: openViewOn?: 'continue' | 'select'
  value={keys} defaultValue={[]} onValueChange={setKeys}
  onSelectionLost={(keys, cause) => toast(...)}     // a selected seat was taken

  view={{ stage: 'map' }}                            // | { stage: 'view'; seatKey } — controlled (for example, from the URL)
  defaultView={{ stage: 'map' }} onViewChange={(v) => router.replace(toQuery(v))}  // user request (like onValueChange)
  onInvalidView={() => router.replace('?')}          // seatKey does not exist or is unavailable

  onBook={(keys, ctx) => Promise<BookResult>}
  onBooked={(result) => {}}

  transitions="cinematic"                            // §5
  sheet={{ snapPoints: [0, 'peek', 1], initialSnap: 'peek', skin: 'glass' }}   // §6, or false
  scene={…}                                          // §7.5
  layoutMode="contained"                             // 'contained' (widget within a page) | 'fullscreen'
  slots={…} classNames={…} theme={…} labels={…}      // overrides CinemaHallProvider
/>
```

- **Two separate actions.** Tapping selects a seat. A bottom bar shows "Row E · Seat 14 · 450.00 ¤" and two buttons: "Preview" opens the 3D seat view, while "Continue · price" books the selection immediately (using the same `onBook` as the button in the sheet). `openViewOn: 'select'` opens the view on tap. In `multiple` mode, tapping toggles a seat. Selection rules are checked when booking; `max` limits the selection immediately.
- **Desktop.** When the picker root is wider than 1024 px, the layout changes: the map is on the left, with a live 3D view of the selected seat and a glass panel with metrics, price, and the same two buttons on the right; "Preview" expands the 3D view over the map. At 1024 px and below, the picker uses the mobile flow with a sheet. The breakpoint uses container width rather than window width, so a widget in a narrow page column behaves like the mobile layout.
- **The button price always matches the seats being booked.** If any seat has no price, the total is not shown and booking is unavailable ("Price unavailable"); a partial total is never substituted.
- `onViewChange` is a **request** based on user intent (Continue, Back, or tapping with `openViewOn: 'select'`), like `onValueChange`. An uncontrolled picker applies it immediately. A controlled picker starts the transition when the host passes a new `view`. A `view` change made by the host does not call the callback.
- The initial render with `view.stage = 'view'` is not animated. Later changes are animated. Browser Back works naturally through `view`.
- While `occupancy` is loading, the requested view waits on the map. Once the data arrives, the picker either opens the view or calls `onInvalidView` (the seat is taken or does not exist).
- When entering the view for a seat that is not in the selection, the picker adds it to the selection (through `onValueChange`) if it is available and the limit has not been reached. This keeps the seat, its price, and the booking button visible in the sheet.

### 4.2 Booking

```ts
onBook(keys: SeatKey[], ctx: {
  attemptId: string;                // uuid; same value on retries with the same selection → Idempotency-Key
  prices: { key: SeatKey; price: Money }[];   // what the user saw; the server validates it rather than trusting it
  signal: AbortSignal;
}): Promise<BookResult>

type BookResult<T = unknown> =
  | { ok: true; data: T; hold?: { expiresAt: string }; revision?: number | string }
  | { ok: false; reason: 'conflict'; keys: SeatKey[]; cause?: 'taken' | 'held' | 'unavailable' }
  | { ok: false; reason: 'price_changed' | 'closed' }
  | { ok: false; reason: 'error'; message?: string; retryable?: boolean };
```

Picker behavior:

- If `onBook` throws or its promise rejects, the result becomes `{ ok: false, reason: 'error' }`.
- Repeated clicks while `booking` are ignored.
- On `conflict`, **only** conflicting seats are removed from the selection and locally marked as taken until the next `occupancy` arrives.
- After `ok: true`, seats are treated as "mine" until an `occupancy` arrives with a `revision` greater than or equal to the returned revision. If `hold.expiresAt` is present, a timer is shown.
- Booking multiple seats is atomic: all or none. This is a backend contract.
- `onBook` means "reserve and proceed to checkout," not payment.

### 4.3 Custom UI: parts and headless

```tsx
<SeatPickerRoot config={config} occupancy={occupancy} onBook={book}>
  <SeatPickerMap />
  <SeatPickerView>{/* R3F children */}</SeatPickerView>
  <MySheet /> {/* Do not render SeatPickerSheet — there is no built-in sheet */}
</SeatPickerRoot>
```

```tsx
function MySheet() {
  const p = useSeatPicker();
  if (p.stage !== 'view') return null; // discriminated union by stage: seat/metrics/price are non-null below
  return (
    <Drawer open onClose={p.backToMap}>
      {p.seat.label} · {p.metrics.zone.label} · {p.format(p.total)}
      <button disabled={p.status === 'booking'} onClick={p.book}>
        Book
      </button>
    </Drawer>
  );
}
// p.selected, p.total, p.violations, p.status: 'idle'|'booking'|'conflict'|'error', p.resetLook()
// p.transition: { phase, direction, progress: { get(): number; subscribe(fn): () => void } }  // no motion types
```

`SeatMap`, `SeatView`, and `HallPreview` also work without `Root`, for example, to show only a 3D preview on a movie page.

---

## 5. Transitions (part of the library)

The map ⇄ view transition is one interruptible timeline made of phases. Tapping Back mid-flight reverses the transition from its current point.

| Phase          | `cinematic`               | Behavior                                                                 |
| -------------- | ------------------------- | ------------------------------------------------------------------------ |
| `mapZoom`      | 450 ms                    | map zooms to the seat, other seats fade, map blur goes from 0→12 px      |
| `crossfade`    | 350 ms, 150 ms overlap    | Canvas fades in from blur 16→0 px                                        |
| `cameraFlight` | 1200 ms, easeInOutCubic   | camera arcs from the overview to eye position; `dpr` × 0.6 during flight |
| `sheetIn`      | 300 ms after camera lands | sheet slides to `initialSnap`                                            |

**Why blur is used.** It conceals details that would otherwise look cheap:

- frames while the screen texture loads;
- reduced `dpr` during flight, which prevents stutter;
- the difference in sharpness between the DOM map and WebGL.

If blur is disabled (`blur: 0` or `quality: 'low'`), `dpr` is not automatically reduced, avoiding visible pixelation. With `quality: 'low'`, blur is replaced with a fade.

```ts
type TransitionsProp = 'cinematic' | 'subtle' | 'none' | TransitionConfig;
interface TransitionConfig {
  preset?: 'cinematic' | 'subtle';
  motion?: 'full' | 'reduced' | 'off'; // single motion setting; defaults to prefers-reduced-motion
  quality?: 'high' | 'low';
  mapZoom?: Phase<{ maxScale?: number; blur?: number }> | false;
  crossfade?: Phase<{ blur?: number; overlap?: number }> | false;
  cameraFlight?:
    | Phase<{ path?: (t: number, ctx: { from: CameraPose; to: CameraPose; layout }) => CameraPose }>
    | false;
  sheetIn?: Phase | false;
  reverseSpeed?: number; // 0.7
}
type Phase<T = {}> = T & { duration?: number; delay?: number; ease?: Easing };
```

Progress: `0` = map, `1` = view, in either direction. Each phase's progress is available through `useSeatPicker().transition`; outside `Root`, use the `onTransition({ phase, direction, state: 'start' | 'end' })` prop.

Implementation: DOM phases use `motion` (already required by `react-modal-sheet`), while the camera uses a custom tween in `useFrame`.

---

## 6. Sheet: `react-modal-sheet` with a glass skin

```ts
sheet?: false | {
  snapPoints?: (number | 'peek')[];   // defaults to [0, 'peek', 1]; 'peek' uses the compact content height
  initialSnap?: number | 'peek';
  skin?: 'glass' | 'plain' | 'none';  // 'none' = unstyled: behavior only; all rendering is yours
  dimScene?: boolean;                 // scene darkens and blurs slightly as the sheet rises (y from Sheet.useContext)
  dismissible?: boolean;
}
```

- **Non-modal.** There is no `Sheet.Backdrop`, so the 3D view can be rotated while the sheet is open.
- **`mountPoint`** is the picker root, so in `contained` mode the sheet stays inside the widget.
- **Props from `react-modal-sheet` are not exposed**, so its major versions do not break our API.
- **Glass skin:**
  ```css
  background: var(--chk-glass-tint);
  backdrop-filter: blur(var(--chk-glass-blur)) saturate(var(--chk-glass-saturate));
  ```
  With a thin border and an inner highlight.
- **Opaque background fallback** for `@supports not (backdrop-filter)`, `prefers-reduced-transparency: reduce`, and `prefers-contrast: more`.

For a fully custom sheet, use `sheet={false}` and `useSeatPicker()` (§4.3).

---

## 7. Customization

### 7.1 Theme and precedence

Package styles are in the cascade layers `@layer chk.reset, chk.structure, chk.skin`, and all selectors are wrapped in `:where()` with zero specificity. Any host CSS wins without `!important`, including Tailwind v4 utilities.

**Precedence (lowest to highest):**

1. defaults;
2. host CSS (`--chk-*` on `.chk-root`, preferably in the host's `@layer app`);
3. `CinemaHallProvider theme`;
4. component `theme`;
5. `style`.

The `theme` prop writes inline only the **explicitly supplied** keys.

**Two-level tokens:**

- **seed:** `accent`, `bg`, `fg`, `radius`, `font`;
- **derived:** computed with `color-mix(in oklab, …)`, for example `surface`, `card`, `glass-tint`, `seat-available`. Override them individually.

The Tailwind light theme takes five lines:

```css
@layer app {
  .chk-root {
    --chk-accent: var(--color-brand-500);
    --chk-bg: white;
    --chk-fg: var(--color-zinc-900);
  }
}
```

```ts
theme={{ seed: { accent }, tokens: { 'glass-blur': '16px' }, scheme: 'auto' /* 'light'|'dark'|'auto' via [data-theme]/prefers-color-scheme */ }}
themes.cinemaDark /* concept */, themes.light
themeToCss(theme, { selector, nonce? })   // for strict CSP without inline styles
```

**WebGL theme.** The provider resolves tokens to `THREE.Color` and listens for scheme changes, so the 3D view changes colors along with the DOM.

**Seat colors:**

- YAML data (`seatTypes.color`) sets the default color;
- `theme.seatTypes.<id>` overrides it without editing the hall;
- the selected seat always uses `accent`.

Scene tokens: `--chk-scene-wall`, `--chk-scene-floor`, `--chk-scene-fog`.

### 7.2 Data attributes and `classNames`

- **States:** `[data-chk="<part>"]` + `data-status`, `data-selected`, `data-seat-type`, `data-stage`, `data-phase`.
- **`classNames={{ root, map, seat, legend, sheet, metric, … }}`** are added to our classes rather than replacing them.

### 7.3 Slots

**Primitives** that replace all internal buttons, chips, and cards:

- `Button` with `variant: 'primary'|'secondary'|'ghost'`, `loading`, `disabled`;
- `Chip`;
- `Card`.

**Structural slots:** `seat`, `sheetContent`, `webglFallback`.

Each slot is a **component** with the exported props type `SlotProps<'Button'>`. Its reference must be stable: declare the component outside render. Changing the reference in dev mode produces a warning. Slot props are only added in minor versions.

### 7.4 Labels, locale, RTL, and accessibility

`labels` is a typed dictionary. Values are strings with placeholders (`'Row {row}, seat {number}'`) or functions; plural forms use `Intl.PluralRules`. The `aria.*` keys cover all screen-reader labels. `formatPrice?(money, locale)`.

**RTL:**

- Chrome (header, sheet, buttons) is mirrored using logical CSS properties.
- The hall map represents a physical layout and is not mirrored: the screen is at the top, and left and right are from the viewer's perspective.

### 7.5 3D scene

```ts
scene={{
  seatModels: { standard: 'procedural', recliner: { url: '/recliner.glb', tintMaterial: 'Seat' } },
  // GLB contract: meters, origin at the center of the base on the floor, +Z toward the screen, one mesh per type (otherwise merge during loading)
  avatar: 'silhouette' | 'none' | { geometry?: BufferGeometry; tint?(key): ColorLike; headTexture?(key): string | undefined },
  // always instanced: a custom avatar does not exceed the draw-call budget
  decals: [{ wall: 'back' | 'left' | 'right', src: '/logo.png', width: 4, offset: [0, 3] }],
  camera: { fov: 60, look: { yaw: [-70, 70], pitch: [-30, 25] }, gyro: false },
  maxDpr: 2,
}}
// R3F children <SeatPickerView>…</SeatPickerView> + useHallAnchors() → { screen, backWall, leftWall, rightWall, ceiling } in meters
```

Inline `scene` and `theme` objects are compared by value, so recreating an object does not rebuild the scene.

### 7.6 Public contract (semver)

| Stable (breaking change = major)                                       | Internal (may change in minor versions) |
| ---------------------------------------------------------------------- | --------------------------------------- |
| seed and semantic tokens, scene tokens                                 | class names, DOM nesting                |
| `data-chk` and state data attributes                                   | derived tokens `--chk-_*`               |
| slot keys, slot props (additive only)                                  |                                         |
| package `exports`, types from `index.ts`                               |                                         |
| YAML format for `version: 1`, `SeatKey`, manifest `manifestVersion: 1` |                                         |

---

## 8. Backend integration

**Data model assumed by the library:**

```
hall(id, slug, name, current_version_id)
hall_version(id, hall_id, rev, schema_version, config jsonb, seat_set_hash, geometry_hash, created_by, created_at)
hall_seat(version_id, seat_key, label, row, section_id, seat_type_id, price_tier, x, z, PK(version_id, seat_key))
session(id, hall_version_id, occupancy_revision)
seat_state(session_id, seat_key, status, hold_id, expires_at, order_id, PK(session_id, seat_key))
```

- **Geometry source of truth** is an immutable config version. `hall_seat` is its projection through `buildSeatManifest`.
- **Editing a hall creates a new version.** Existing sessions remain on the old version. Moving future sessions is an explicit host operation using `diffSeatManifests`.
- **The database stores canonical JSON.** YAML with comments is only for human convenience.
- **The server must revalidate:**
  - that seats exist (`hall_seat`);
  - statuses;
  - prices (`ctx.prices` is for comparison only);
  - selection rules (`validateSelection`, the same rules used in the UI);
  - constructor field policy (`validateEdit`);
  - the config (`validateHall(…, { enforce: true })`).
- **The host is responsible for:**
  - real-time transport and delivery order;
  - creating and expiring holds;
  - idempotency;
  - payment, fees, and ticket categories;
  - edit permissions;
  - auditing;
  - drafts and publishing.
