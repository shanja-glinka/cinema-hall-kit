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
// the parameterized templates raise hall.height above their default (single 5 m, stadium 6 m,
// threeSections 8 m) when the requested rows put the back row's eye + 0.5 m headroom higher
templates.balcony()                                   // two levels: stalls + a balcony over the rear stalls, 240 seats
// every template also takes TemplateOptions: { texts?: { names?, seatTypes?, bands? } }
templates.balcony({ texts: { names: { balcony: 'Hall 5' } } })   // replaces single texts; the others stay as in templateTexts
templateTexts                                         // TemplateTexts: the built-in hall names, seat type labels and band labels
templatePrices                                        // { standard: 450, recliner: 650, premium: 650, balcony: 380 }: every template sets pricing.tiers for each seat type it uses
builtInTemplates                                      // picker list: threeSections, single, stadium, balcony; each validates with no issues
// HallTemplate.create(options?: TemplateOptions): the built-in entries pass the options on; ids never change with the texts
suggestId(label: string, taken: Iterable<string>, fallback = 'item'): string
// a valid id from a human label: Cyrillic → Latin, lowercase, spaces → '-', other symbols dropped,
// '-2', '-3', … on collision ('Grand Hall' → 'grand-hall', 'VIP' with ['vip'] taken → 'vip-2')
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
// resolveConstraints(config, { constraints?, enforce? }): ResolvedConstraints — the thresholds in effect,
// every field set. Constraints (what a host supplies) keeps the balcony thresholds optional, so a
// complete object typed before they existed still compiles; ResolvedConstraints (DEFAULT_CONSTRAINTS,
// ctx.constraints) has every field.
// The rules get ctx.layout = buildHallLayout(config, { constraints, enforce }), so its balcony sizes
// are the ones they check.

interface ValidationRule { code: string; check(ctx: ValidationRuleContext): Issue[] }
interface ValidationRuleContext { config: HallConfig; layout: HallLayout; constraints: Constraints }
// validateHall passes a BuiltHallLayout and a ResolvedConstraints; the context keeps the wider types,
// so a context built by hand (a test of a custom rule, a direct call of defaultRules) still compiles.
resolveRuleContext(ctx): ResolvedRuleContext  // { config; layout: BuiltHallLayout; constraints: ResolvedConstraints }
// The context from validateHall is returned as it is. A hand-built one gets the default thresholds it
// leaves out and the layout fields buildHallLayout sets (a missing level means 0, missing balcony sizes
// come from the thresholds, a layout without bands is single-level). A hand-built context is read again
// on every call, so a rule sees a change made to it since the last check.

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

**Names in issue texts.** Issues about a section or a band carry its display name in `params` so that
texts can say which one they mean: `section` (a name made from the section id: `rec-centre` →
`Rec centre`) for `rows.legroom`, `rows.pitch`, `layout.aisle`, `view.sightline` and `view.overhang`;
`band` (the band's `label`, or a name made from its id) for `fit.width`, `fit.depth`, `fit.headroom`,
`layout.bandOverlap` and `view.overhang`. Row-level issues keep `row` (the 1-based row number inside the
section) and add `rowLabel` (the row's label, for example `C`), which the built-in texts use. Codes and
paths are unchanged. `fit.depth` stays at `hall.depth` and also carries `ref.bandId` of the band whose
rearmost seat causes it, so a UI can mark that band too. `fit.headroom` stays at `hall.height` with no
`ref` (its `band` param names the band of the highest seat), so following it opens the hall height.

Built-in codes for multi-level halls (see §2.4.1):

| Code                 | Severity | Condition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.bandOverlap` | error    | a seat of a lower level has less than `minOverhangClearance` from its floor to the underside of a balcony above it (its floor − `balconySlabThickness`). A balcony (level 1+) is measured over its whole floor slab as the 3D view draws it (`balconySlabSteps`: across the hall's width, back to the next balcony or the back wall), and every lower seat whose body (the seat type's width and depth) reaches under the slab counts, even when its centre is in front of it; a band that overlaps a lower band in plan but stays on level 0, and a band that overlaps another band on its own level (two balconies at the same height in the same place), are measured over the upper band's sections, comparing seat bodies (the seat type's width and depth), so a seat whose body reaches into a section counts even when its centre is outside it. Other bands are checked too when their seat bodies overlap although their row strips do not (a band whose `gapBefore` or `startDistance` puts its first row closer than the seat depths need). Once per pair of upper and lower band. Path: the upper band's `elevation` (or `startDistance`; `gapBefore` for a band that follows the lower one too closely). Params: `required`, `available` (floor heights of the upper band there), `rowLabel`, `band`, `below` |
| `view.overhang`      | warning  | the line from a seat of a lower level to the top edge of the screen passes above the underside of a balcony above it (its row's floor − `balconySlabThickness`). A balcony (level 1+) is measured over its whole floor slab (`balconySlabSteps`), so seats beside or behind the balcony's own seats count too; a band that overlaps a lower band in plan but stays on level 0 is measured at the front edge of its sections. Once per section, at its first such row. Params: `row`, `rowLabel`, `section`, `band`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### 2.4 Layout and metrics

```ts
buildHallLayout(config: HallConfig, options?: { constraints?: Partial<Constraints>; enforce?: boolean }): BuiltHallLayout
// Also callable with one argument, so configs.map(buildHallLayout) works; a second argument that is not an object (an index) is ignored.
// Pure and deterministic; always returns a result. `options` (BuildLayoutOptions, the same fields as
// validateHall's) only decide balconySlabThickness and balconyParapetHeight; positions, keys and hashes
// do not depend on them. Pass the options given to validateHall, so a renderer draws the balcony
// sizes the rules checked.
// The algorithm is frozen for each config version: a behavior change requires a version change.

// The layout that functions and components accept. The level and balcony fields are optional, so a
// single-level layout built by hand (as before levels existed) stays valid; missing means level 0,
// no balconies and the default slab and barrier sizes.
interface HallLayout {                              // data only: lossless with structuredClone/JSON
  schemaVersion: number;
  seats: Seat[];                                    // row by row, left to right
  rows: Row[]; sections: SectionBox[]; screen: ScreenGeometry; bounds: Box3Like;
  bands?: BandBox[];                                // config order
  eyeHeight: number;                                // layout.eyeHeight or 1.15
  balconySlabThickness?: number;                    // resolved like the thresholds (options > config unless enforce > 0.3)
  balconyParapetHeight?: number;                    // resolved the same way; default 0.8
}
interface Seat {
  key: SeatKey; label: string; row: string; number: number;
  bandId: string; sectionId: string; seatTypeId: string; priceTier: string;
  level?: number;                                   // 0 = ground floor, 1+ = balcony
  position: Vec3; eye: Vec3;                        // meters
}
interface Row { index; label; bandId; level?: number; elevation: number; seatKeys: SeatKey[] }
interface SectionBox { bandId; sectionId; …; minX; maxX; minZ; maxZ; firstRowIndex; level?: number; floorElevation?: number }
// What buildHallLayout returns (and validation rules receive as ctx.layout): every field above set.
interface BuiltHallLayout extends HallLayout {
  bands: BandBox[]; balconySlabThickness: number; balconyParapetHeight: number;
  seats: BuiltSeat[]; rows: BuiltRow[]; sections: BuiltSectionBox[]; // level (and floorElevation) required
}
interface BandBox {
  id: string; label?: string; index: number;
  level: number;          // 0 = ground floor; 1+ = band whose plan footprint overlaps another band and sits above it (any config order)
  minZ: number; maxZ: number;                       // depth range: first row − half spacing … last row + half spacing
  floorElevation: number; // floor of the first row
  topElevation: number;   // floor of the last row
  overhang: boolean;      // true when it overlaps a lower band in plan
}
createSeatIndex(layout): { get(key): Seat | undefined; neighbors(key): { left?: Seat; right?: Seat } }
computeSeatView(layout, key): SeatViewMetrics       // { distance, fovDeg, lateralOffset, zone }
balconySlabSteps(layout: HallLayout): BalconySlabStep[]
// The floor slab of every band with level ≥ 1, as the 3D view draws it and layout.bandOverlap and
// view.overhang measure it: one step per row and section ({ bandId, level, minX, maxX, minZ, maxZ, floor }; underside = floor −
// balconySlabThickness). Across the hall's width (sections' strips meet halfway between them), from the
// band's minZ back to the next balcony of the same level or the back wall. [] without bands. Built from
// the section footprints and row floors, not the seats: a row or section with every seat excluded keeps
// its step. Renderers should draw these steps rather than derive their own.
```

#### 2.4.1 Multi-level halls (balconies)

A band may set three optional fields. A config without them lays out exactly as before (same
positions, keys and hashes).

| Band field      | Meaning                                                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label`         | Display name, 1–64 characters (`Stalls`, `Balcony`). Issue texts use it.                                                                                                                                                                                                   |
| `startDistance` | Metres (> 0) from the screen plane to the centre line of the band's first row. The band is placed there instead of after the previous band, so it can hang over the bands in front of it. `gapBefore` is ignored. On the first band it replaces `layout.firstRowDistance`. |
| `elevation`     | Metres (≥ 0): floor height of the band's first row. The rake restarts there; the band's next rows add `riserHeight`.                                                                                                                                                       |

Later bands without `startDistance` continue after the positioned band, and bands without
`elevation` keep rising from the previous band's last row, as before. Row labels and `rowIndex` follow
config order, so balcony rows continue the labels of the stalls.

A band is on level 1 (or higher) when its plan footprint overlaps a band of another run and its
first-row floor is higher, whichever of the two comes first in the config (a balcony may be listed
before the stalls under it); a band that simply continues after another one (neither field
set) keeps that band's level. Validation then:

- checks the headroom under the balcony (`layout.bandOverlap`, thresholds `minOverhangClearance`
  2.4 m and `balconySlabThickness` 0.3 m) over its whole floor slab (`balconySlabSteps`), including
  seats beside or behind the balcony's own seats that the slab covers;
- warns when the balcony hides the top of the screen from the rows under it (`view.overhang`), over
  the same whole floor slab, so rows beside or behind the balcony's own seats are checked too;
- compares heads for `view.sightline` only between seats on the same level, and treats the front
  barrier of every balcony band (a band of level 1+; `balconyParapetHeight` 0.8 m above its
  first-row floor, across the hall's width, from its front edge `BALCONY_PARAPET_THICKNESS`
  (0.12 m, the depth the 3D view draws) toward the screen, its top tested over that whole depth) as an obstacle for the balcony rows
  behind it: its own rows and those of later balcony bands on its level or above. A ground-floor band
  raised with `elevation` has no barrier, as in the 3D view;
- checks the ceiling (`fit.headroom`) and the depth (`fit.depth`) against the balcony seats as well.

```yaml
layout:
  firstRowDistance: 6
  bands:
    - { id: stalls, label: Stalls, riserHeight: 0.25, defaults: { rows: 7, … }, sections: […] }
    - { id: recliners, label: Recliners, gapBefore: 1.2, riserHeight: 0.35, … }
    - id: balcony
      label: Balcony
      startDistance: 12 # first balcony row 12 m from the screen, above the rear stalls
      elevation: 4.5 # its floor is 4.5 m up
      riserHeight: 0.6
      defaults: { rows: 3, rowSpacing: 1, seatPitch: 0.6, seatType: balcony }
      sections: [{ id: balcony, seatsPerRow: 14 }]
```

`templates.balcony()` (picker id `balcony`, "Two levels: stalls + balcony") is a complete example with no
issues. New field keys for the constructor policy: `band.label`, `band.startDistance`, `band.elevation`.
New `constraints` (and `DEFAULT_CONSTRAINTS`) keys: `minOverhangClearance`, `balconySlabThickness`,
`balconyParapetHeight`. They are optional in the `Constraints` type (defaults apply) and set in
`ResolvedConstraints`, the type of `DEFAULT_CONSTRAINTS`, of `resolveConstraints` and of
`resolveRuleContext(ctx).constraints`.

`view.firstRowTooClose` and `view.frontRowVertical` measure the occupied row closest to the screen in
the built layout, whichever band it belongs to (a row whose seats are all excluded does not count),
at that row's own floor height. The issue points at the field that positions that row: the
`startDistance` of the band that starts its run, or `layout.firstRowDistance`.

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
priceForSeat(pricing, seat): Price | null    // rounds to two decimals; negative or non-numeric → "no price"
sumPrices(prices): Price | null               // exact sum (added in cents internally); null if any price is missing
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
- rejected actions show the reason (for example, "Does not fit in depth: 15.5 m needed, hall is 15 m"); removing the last section in a band removes the entire band in one undo step;
- the toolbar shows "Unsaved changes" after an edit and "All changes saved" after a successful save; a field shows "Changed — not saved yet" briefly after its value is committed (the change is in the draft until Save); confirmations such as "Imported" are neutral and disappear after the next edit or 5 seconds; the Save button counts errors ("Save · 1 error");
- an error that the editor can fix in one click (seats that need a deeper or wider hall) offers a button such as "Make the hall 16.25 m deep" in the toolbar, the issue list, the object's inspector and under the hall field; the size is rounded up to 5 cm from the most the issue's rounded `required` can stand for, so the fix always clears the error (a hall that needs 8.002 m, shown as 8.00 m, is made 8.05 m deep);
- the issue list names the band and section of each issue ("Band 1 · Main hall › Section “Centre”"), so issues with the same text can be told apart; clicking one selects that object;
- section fields inherited from the band say so ("Same as the band: 7") and an overridden one offers "Use the band value (7)"; an empty "Gap before band" shows the row spacing it falls back to;
- plan text keeps a minimum on-screen size (11 px) when a deep hall is fitted, and section names move inside their block when the band in front leaves no room; sections without an aisle are drawn touching;
- the 3D preview adds a work light (ambient, hemisphere and two directional lights; the fog starts beyond the hall), so seats, risers and walls are readable from the back and the sides. The booking view keeps its screen-lit look.
- the 3D preview (`HallPreview`) opens on an elevated cutaway view from behind and to the right of the audience that holds the whole hall in the picture: the screen, every level and the walls. The camera may stand behind the back wall or above the ceiling (walls and ceiling face into the hall and are not drawn from outside); for a hall with balconies a steeper angle is chosen, so the stalls in front of the balcony stay visible. Orbiting keeps the target inside the hall; the eye stays above the floor and behind the screen wall, within a few hall sizes;
- under the plan, the buttons (+ Band, level filter, Fit hall, 2D/3D) sit on the first row and wrap before they shrink; the hints (click / wheel / drag, and the balcony hint of a multi-level hall) get a row of their own under them. On a narrow constructor only the balcony hint is shown;
- **Template** creates the built-in templates with their built-in English texts (`templateTexts`).

`useHallEditorContext().notify(message, tone?)` takes an optional `tone`: `'error'` (default, an alert) or `'info'` (a neutral status).

For simple cases, use the convenience API: `<HallConstructor defaultValue={config} onSave={…} />` creates the editor internally.

### 3.2 Editor API

```ts
  editor.config: HallConfig            // always structurally valid
  editor.layout: HallLayout            // always present (buildHallLayout is total)
editor.issues: Issue[];  editor.issuesFor(ref | path): Issue[]
editor.dirty: boolean;   editor.markSaved(baseline?, { revision? })
editor.history: { undo(); redo(); canUndo; canRedo; clear() }

editor.patch({ screen: { width: 12 } })                    // DeepPartial, one history step
editor.bands.add({ after?, growHall? }) | .remove(id) | .move(id, to) | .duplicate(id) | .patch(id, partial)
editor.sections.add(bandId, { after?, ...partial }) | .remove(ref) | .move(ref, to) | .duplicate(ref) | .patch(ref, partial)
editor.seatTypes.add(id, def) | .patch(id, partial) | .remove(id)  // remove → issue if the type is in use
editor.seatTypes.rename?.(id, nextId) // optional member; moves sections, band defaults and the price tier with the type
editor.batch(() => { … })                                  // multiple changes = one undo step
editor.importText(text, { maxBytes?, format? }?): ParseResult  // structural errors include line/col;
                                                           // maxBytes opens a stored document above the
                                                           // default upload limit (LIMITS.maxBytes)
editor.exportYaml(): string                                // with source comments
editor.reset(config, { source?, revision? })   // external baseline (server version): validates structure, not field policy
editor.revision                                   // opaque optimistic-lock token (etag, row version…)
```

New objects get readable, valid defaults:

- `bands.add()` creates `band-N` (shown as "Band N") with one section `band-N-section-1` (shown as
  "Section 1"). The section uses the hall's first seat type with the row spacing and seat pitch the
  hall already uses for it, the most seats per row (10 down to 1) that fit the width and the most
  rows (3, 2, 1) that fit the depth; the band keeps the riser of the band before it. With
  `growHall: true` a band that does not fit even with one row gets 3 rows and the hall is made
  deeper (rounded up to 5 cm). The constructor's "+ Row of sections" uses `growHall` and tells the
  user the new depth.
- `sections.add(bandId)` numbers sections within their band: `<band id>-section-N` ("Section N").
- In "Seats and prices", a new seat type gets an id made from its name with core's `suggestId`
  (`new-seat-type`, `balcony`, …). Until the hall is saved with it, renaming the type renames the id
  too (`seatTypes.rename`); a type the saved hall already has keeps its id. The id is shown as an
  editable "Short code" under the type's "Advanced" part (closed unless the code has an issue). Colours are stored as upper-case `#RRGGBB`.
- `seatTypes.rename` is optional in `SeatTypesApi`, so a host's own `HallEditor` written before it
  existed still type-checks. `useHallEditor` always provides it; with an editor that does not, the
  constructor keeps every id, edits only the label and shows the "Short code" as read-only text.

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

### 3.5 Multi-level halls (balconies) in the constructor

See §2.4.1 for the model. The template menu offers `balcony` as "Two levels: stalls + balcony".

- **Band panel.** Every band after the first has a switch "Upper level (balcony) above the bands in front". Turning it on sets `startDistance` and `elevation`: the band's first row goes over the rear of the bands in front, as far back as its last row still fits the hall (with `minRearClearance`), never behind the last row of the band just in front; its floor is the highest top floor of the bands under it plus `minOverhangClearance` and `balconySlabThickness` (both rounded to 5 cm, with the editor's `constraints`). The fields then read "Starts at [x] m from the screen" and "Floor height [y] m", with the lowest floor height that keeps the headroom as a hint. Turning it off removes both fields from the band. The first band shows a note instead of the switch. The switch follows the policy of `band.elevation`. A band's `label` is its name everywhere in the constructor ("Band 3 · Balcony").
- **Plan.** Upper-level bands are drawn after the floor below, so they are on top and take clicks where they overlap: see-through blocks with a dashed accent outline (`[data-chk="editor-band-group"][data-upper]`, `[data-chk="editor-level-outline"]`) and a "Balcony · level N" badge in the band label column. Band labels of overlapping bands are moved apart. While an object of one level is selected, the other levels are dimmed (`data-dimmed`). When the hall has more than one level, the canvas controls show a level filter (`[data-chk="editor-level-filter"]`: All levels / Ground floor / Level 1 …); the other levels then stay as a dashed outline that cannot be clicked (`[data-chk="editor-level-ghost"]`), so the bands under a balcony can be selected. Selecting an object on a hidden level (from an issue such as `layout.bandOverlap` or `view.overhang`, or from the inspector) switches the filter to its level.

---

## 4. Seat selection

### 4.1 Component

```tsx
<SeatPicker
  config={config}                                   // or layout={layout} if it has already been computed
  layoutOptions={{ enforce: true, constraints }}    // optional: passed to buildHallLayout(config, …), so balconies use the sizes the server checked
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
  onConfirm={(keys, ctx) => Promise<ConfirmResult>}   // optional purchase step after the reservation (§4.2)

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
  prices: { key: SeatKey; price: Price }[];   // what the user saw; the server validates it rather than trusting it
  signal: AbortSignal;
}): Promise<BookResult>

type BookResult<T = unknown> =
  | { ok: true; data: T; hold?: { expiresAt: string }; revision?: number | string }
  | { ok: false; reason: 'conflict'; keys: SeatKey[]; cause?: 'taken' | 'held' | 'unavailable' }
  | { ok: false; reason: 'price_changed' | 'closed' }
  | { ok: false; reason: 'error'; message?: string; retryable?: boolean };
```

Picker behavior:

- If `onBook` throws or its promise rejects, the result becomes `{ ok: false, reason: 'error' }` and the picker shows the generic error text (label `error`); the thrown error's text is never shown.
- `{ ok: false, reason: 'error', message }` with a non-empty `message` shows that text instead of the generic one, the same way `onConfirm` refusals do, so tell the viewer what to change (for example "Some of these seats are already reserved for you…"). A blank or missing `message` falls back to the label. The picker shows it as given: localize it on your side. The selection is kept, and the viewer can try again.
- Repeated clicks while `booking` are ignored.
- On `conflict`, **only** conflicting seats are removed from the selection and locally marked as taken until the next `occupancy` arrives.
- After `ok: true`, seats are treated as "mine" until an `occupancy` arrives with a `revision` greater than or equal to the returned revision. If `hold.expiresAt` is present, a timer is shown.
- Booking multiple seats is atomic: all or none. This is a backend contract.
- `onBook` means "reserve and proceed to checkout," not payment.
- While the seats are reserved, the picker says so plainly: the button reads "Seats reserved" (disabled) and the line under it reads "Seats reserved for 09:59 · Complete the purchase before the timer ends." (the second sentence only when the host passes `onConfirm`: a reservation-only picker shows just the countdown). When the timer runs out it reads "Your reservation has expired. Please choose your seats again."

#### Optional purchase step: `onConfirm`

```ts
onConfirm?(keys: SeatKey[], ctx: ConfirmContext<TData>): Promise<ConfirmResult>

interface ConfirmContext<TData = unknown> {
  booking: TData | undefined;   // the `data` your onBook returned for these seats (your hold/order id);
                                // undefined when the hold came in through occupancy (`mine: true`),
                                // and once the hold it belongs to has ended (released or timed out,
                                // judged on the server's clock from `occupancy.serverNow`):
                                // a later own hold for the same seat does not inherit it;
                                // also undefined when the confirmed seats do not all come from
                                // the same onBook call (separate holds, or a seat held elsewhere)
  holdExpiresAt: string | null; // ISO time the reservation ends, when known
  signal: AbortSignal;          // aborted when the picker unmounts
}

type ConfirmResult =
  | { ok: true; ticket?: string }                                  // ticket number to show, if any
  | { ok: false; reason: 'expired' | 'error'; message?: string };
```

- Without `onConfirm` nothing changes: the picker stops at the reservation and the host completes the purchase elsewhere.
- With `onConfirm`, a reserved selection shows **"Confirm purchase · price"** instead of the disabled "Seats reserved". The button calls `onConfirm` with the reserved seats; while it runs it reads "Confirming…".
- `onConfirm` receives the current selection, which can be a subset of the reservation if the viewer deselected seats; buy exactly those keys. Seats this viewer already bought are never passed again.
- Seats whose `onConfirm` is still running stay selected even if a newer occupancy shows them as taken; after the result they are checked against the last snapshot.
- `{ ok: true, ticket }` ends in **"Purchased"** (disabled) and the line "Purchased · ticket № …" ("Purchase complete" without a ticket). When the selected seats were bought in several purchases, the line lists every ticket, oldest first ("Purchased · tickets № T-1, T-2", label `purchaseTickets`), and `purchase.ticket` is the ticket of the purchase that just completed. Bought seats stay in the selection and are drawn as "Your seats" even when the next `occupancy` lists them as taken; `onSelectionLost` is not called for them. The total shown for bought seats is the price they had when the viewer confirmed; a later change of `pricing` (or of the hall) does not change it.
- `{ ok: false, reason: 'error' }`, a throw or a malformed value shows "The purchase could not be completed. Please try again." and the button stays available. `reason: 'expired'` (or a countdown that reaches zero) shows the expiry notice and disables the button. A refusal is about the seats it confirmed: when the viewer changes the selection (for example to another hold that is still active), its message is cleared and the new selection can be confirmed.
- A refusal with a non-empty `message` shows that text instead of the generic one, so tell the viewer what to change (for example "Buy both seats: one empty seat would be left between them."). The picker shows it as given: localize it on your side.
- **After a purchase, in `multiple` mode,** the viewer can add more seats. The next "Continue", its price and the total (`p.total`) cover only the seats not bought yet: `onBook` and its `prices` get only those keys, and so does the next `onConfirm`. Selection rules treat the bought seats as taken. Once every selected seat is bought, `p.total` is what was paid.
- Headless: `useSeatPicker()` returns `purchase: { status: 'idle' | 'confirming' | 'purchased' | 'expired' | 'error'; ticket: string | null; tickets?: string[] }` and `confirm()`. `ticket` is the ticket of the latest purchase among the selected seats; `tickets` lists every ticket of the selected seats, oldest purchase first.

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
// p.purchase: { status, ticket, tickets }, p.confirm()  — the optional purchase step (§4.2)
- **Reselecting an own hold.** `SeatMap` takes `isReselectable?(key)`: seats it returns `true` for can be picked although their status is not `available`. The picker passes the seats of the viewer's active hold that are not bought yet, so a seat deselected from a reservation (for example after the purchase was refused and the server kept the whole hold) can be selected again. Someone else's hold, bought seats and unavailable seats stay locked. Without the prop only selected and available seats can be picked, as before.
// p.transition: { phase, direction, progress: { get(): number; subscribe(fn): () => void } }  // no motion types
```

`SeatMap`, `SeatView`, and `HallPreview` also work without `Root`, for example, to show only a 3D preview on a movie page.

### 4.4 Seat map: states, legend, aisles and touch size

- **Type and state are drawn separately.** An available seat is filled with its seat type colour (every type, the first one included). Every other state also changes the shape, so states never depend on colour alone: **taken** is a hollow outline crossed out (×), **on hold** (another viewer) is a dashed outline with a dash, **unavailable** is a fainter crossed-out outline, **selected** is filled with the accent colour and shows the seat number, and **your seats** (your own hold or purchase) have an accent outline with a check mark.
- **Legend.** "Available seats" lists the seat types that have seats, with their price ("Classic · 450.00 ¤", or "Lounge · from 650.00 ¤" when prices differ within the type); "Seat status" lists Selected, Your seats (only when there are any), On hold, Taken and Unavailable (only when there are any). Swatches are drawn with the same shapes as the seats. Pass `showLegend={false}` to hide it.
- **Own holds.** `SeatMap` takes `isMine?(key)`; the picker passes the seats from `occupancy.held` with `mine: true`, its own fresh reservations and purchases. These seats are marked `data-mine` and announced as "Your seats", not as "On hold".
- **Aisles.** Seats are placed exactly where the layout puts them, so a section `gapBefore` is an empty aisle on the map. Two sections that touch (no gap in the layout) get a thin divider line (`[data-chk="section-divider"]`) so the boundary is still visible; no aisle is invented.
- **Touch size.** `minSeatSize` (CSS px, default `32`) is the smallest width of a seat's tap area. Each seat's tap area is its whole footprint (`[data-chk="seat-hit"]`), not only the drawn square. On touch screens (`pointer: coarse`) and in the picker below the desktop breakpoint, the map keeps this size and scrolls inside `[data-chk="map-scroll"]` (it opens on the centre of the hall); the legend stays outside the scroller, so it remains visible. `minSeatSize={0}` lets the map shrink to its container. While the map scrolls sideways, a rail of row letters (`[data-chk="row-rail"]`, labels `[data-chk="row-rail-label"]` with the `rowLabel` class) stays over the left edge of the scroller, and the map's own row letters are hidden (`[data-chk="map-scroll"][data-rail]`); it follows vertical scrolling too.
- **Zone names.** The zone chip shows `picker.zones[id]` when the host sets it; otherwise a library default zone (`up-close`, `sweet-spot`, `full-picture`) that keeps its default English name is shown with `picker.defaultZones[id]`; a zone the hall config renames, or a custom zone, keeps its name from the config.
- **Levels.** In a hall with balconies (seats with `level > 0`), each level is its own block: the ground floor first, under the screen, then each upper level below it under a heading (the names of its bands, or "Balcony" / "Level {level}" when they have none, labels `levelBalcony` and `levelUpper`), so a balcony never covers the stalls under it. The SVG is then a `group` (named `mapAria`) with one `grid` per level (`[data-chk="map-level"][data-level]`, named by `levelGridAria`: "Seat map: Balcony"); rows count from 1 within their grid. There is still one roving tab stop: Left and Right stay on the level, Up and Down move between levels. `minSeatSize`, aisles and the legend work as before. A hall on one level renders exactly as before, with one `grid`.
- New theme defaults: `seat-taken`, `seat-held` and `seat-blocked` are line colours with at least 3:1 contrast against the background in the dark and light schemes; legend text uses `--chk-fg`.

---

## 5. Transitions (part of the library)

The map ⇄ view transition is one interruptible timeline made of phases. Tapping Back mid-flight reverses the transition from its current point.

| Phase          | `cinematic`               | Behavior                                                                                                                                                                                                                                                         |
| -------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mapZoom`      | 450 ms                    | map zooms to the seat, other seats fade, map blur goes from 0→12 px                                                                                                                                                                                              |
| `crossfade`    | 350 ms, 150 ms overlap    | Canvas fades in from blur 16→0 px                                                                                                                                                                                                                                |
| `cameraFlight` | 1200 ms, easeInOutCubic   | camera arcs from the overview to eye position; `dpr` × 0.6 during flight (the overview stands behind and above the audience; in a hall with balconies it stands in front of the nearest balcony, under the ceiling, and looks down at the screen and the stalls) |
| `sheetIn`      | 300 ms after camera lands | sheet slides to `initialSnap`                                                                                                                                                                                                                                    |

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

- **States:** `[data-chk="<part>"]` + `data-status`, `data-selected`, `data-mine`, `data-seat-type`, `data-stage`, `data-phase`.
- **`classNames={{ root, map, seat, legend, sheet, metric, … }}`** are added to our classes rather than replacing them.

### 7.3 Slots

**Primitives** that replace all internal buttons, chips, and cards:

- `Button` with `variant: 'primary'|'secondary'|'ghost'`, `loading`, `disabled`;
- `Chip`;
- `Card`.

**Structural slots:** `seat`, `sheetContent`, `webglFallback`.

Each slot is a **component** with the exported props type `SlotProps<'Button'>`. Its reference must be stable: declare the component outside render. Changing the reference in dev mode produces a warning. Slot props are only added in minor versions.

### 7.4 Labels, locale, RTL, and accessibility

`labels` is a typed dictionary. Values are strings with placeholders (`'Row {row}, seat {number}'`) or functions; plural forms use `Intl.PluralRules`. Keys added after the first release are optional and fall back to English, so complete label objects written for an older version keep compiling. Multi-level halls added `picker.levelGround`, `levelBalcony`, `levelUpper`, `levelGridAria` and `editor.templateBalcony`, `bandUpperLevel`, `bandUpperLevelHint`, `bandUpperLevelFirst`, `unitFromScreen`, `bandStartDistanceHint`, `bandElevationHint`, `planLevelBadge`, `levelFilterAria`, `levelAll`, `levelGround`, `levelUpper`, `levelHint`. Later additions: `picker.defaultZones` (names of the default viewing zones), `editor.balconyName`, `stallsName`, `loungeName` (names of the `balcony`, `stalls` and `lounge` ids on the plan) and `editor.levelLegendGround`, `levelLegendUpper` (the legend under the plan of a multi-level hall in “All levels”). On the plan, a section id named after its band and a side (`lounge-left` in the band `lounge`) is called by its side, and any other id without a built-in name is shown as a name made from it (`vip-block` → `Vip block`), like core issue texts. The editor texts added with the save state, field hints and one-click fixes (`allSaved`, `applied`, `bandLabel`, `bandStartDistance`, `bandElevation`, `bandPlacementHint`, `bandGapHint`, `bandGapFirst`, `sectionGapHint`, `fromBand`, `resetToBandValue`, `seatTypeIdHint`, `fixDepth`, `fixWidth`, `bandAddedGrown`, `issuePlace`, `cMinOverhangClearance`, `cBalconySlabThickness`, `cBalconyParapetHeight`) and `picker.purchaseTickets` are optional in the same way. `editor.applied` (the note next to a field that was just changed) now says that the change is not saved yet. A seat type's short code is under its “Advanced” part, which opens when the code has an issue. Screen-reader names are label keys too (`picker.seatAria`, `picker.mapAria`, `editor.planAria`, …). `formatPrice?(price: Price, locale)` replaces the price text (see §2.6).

**Built-in language.** `labels.en` (the default) is the complete label set: `picker`, `editor` and `issues`. `labels.ru` remains as a compatibility alias to the English set. `locale` formats numbers and prices; `labels` picks the words, so pass your own label object for another language.

**Issue texts.** `labels.issues` (optional, type `IssueMessages` from core) is the catalog the constructor passes to core's `formatIssue` for validation issues: `labels.en.issues` is `issueMessages.en`. Codes it does not set, and every code when it is absent, use the built-in English texts, so English hosts see the same texts as before. Override single codes like any label: `labels={{ issues: { 'fit.depth': '…' } }}`. For `fit.depth`, a host that still words it through the older `labels.editor.issueFitDepth` keeps its text: a `labels.issues['fit.depth']` of its own wins, else a custom `issueFitDepth`, else the built-in text. The decimal point of numbers in issue texts follows `locale` ("16.25 m" in `en-US`).

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

**Balconies.** Every band with `level > 0` is drawn as a second floor, in the seat view and in the constructor preview: a stepped floor slab under its rows (one step per row, exactly `balconySlabThickness` thick as validation measures it — a zero thickness draws a flat floor — its top at the row's floor) from its front edge to the next balcony band or the back wall, across the hall's width, with a riser between rows, a front wall `balconyParapetHeight` above its first row, and a column under each end of its front edge at the side walls. The rows of the floor below stay visible under it; the ground-floor platforms no longer reach up to balcony rows. The balcony is two merged meshes (floor colour and wall colour). The slab and front-wall sizes come from the layout (`layout.balconySlabThickness`, `layout.balconyParapetHeight`, which `buildHallLayout` resolves from the hall's `constraints`), so a hall's own values are drawn; a hand-built layout without them uses the library defaults (`DEFAULT_CONSTRAINTS`).

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
