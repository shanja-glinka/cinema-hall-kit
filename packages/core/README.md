# @cinema-hall/core

Framework-free model of a cinema hall: a YAML/JSON hall config, semantic checks, seat layout,
view metrics, a seat manifest for a database and the selection rules that the UI and the server share.
It runs in Node, in browsers and in the CLI. It has no React or three.js dependency.

Full API reference and the design rationale: [`docs/api.md`](../../docs/api.md) (section 2 for this package,
section 8 for the backend contract) and [`docs/requirements.md`](../../docs/requirements.md).
An example hall in the same format as the fixture: [`docs/examples/meridian-hall-3.yaml`](../../docs/examples/meridian-hall-3.yaml).

## Install

The registry command applies after `@cinema-hall/core` has been published to npm:

```sh
pnpm add @cinema-hall/core
```

Until then, use this repository as a pnpm workspace. From the repository root, run
`pnpm install --frozen-lockfile` and `pnpm build`; the `apps/demo` app is the workspace consumer.

## Usage

Parse a config, then compute the layout and the view from each seat:

```ts
import { readFileSync } from 'node:fs';
import { buildHallLayout, computeSeatView, formatIssue, parseHallConfig } from '@cinema-hall/core';

const text = readFileSync('hall.yaml', 'utf8');
const result = parseHallConfig(text); // YAML or JSON (auto)

if (!result.ok) {
  // Structural errors only: syntax, schema, limits. The hall cannot be used.
  for (const issue of result.issues) console.error(formatIssue(issue));
} else {
  // Semantic issues (fit.*, rows.*, layout.*, view.*) are warnings and errors, but the hall still loads.
  for (const issue of result.issues) console.warn(formatIssue(issue, undefined, 'en'));

  const layout = buildHallLayout(result.config);
  const seat = layout.seats.find((s) => s.label === 'B4');
  if (seat) {
    const view = computeSeatView(layout, seat.key); // { distance, fovDeg, lateralOffset, zone }
    console.log(view?.zone.label);
  }
}
```

Pass `{ strict: true }` to throw a `HallConfigError` on structural errors instead of checking `ok`.

Serialize a config back. Pass the original YAML as `source` to keep its comments and key order:

```ts
import { serializeHallConfig } from '@cinema-hall/core';

const yaml = serializeHallConfig(result.config, { source: text });
const json = serializeHallConfig(result.config, { format: 'json' });
```

Check a server-side session: occupancy, selection rules and a manifest for the database.

```ts
import {
  applyOccupancyDelta,
  buildSeatManifest,
  diffSeatManifests,
  selectionRules,
  validateSelection,
} from '@cinema-hall/core';

const manifest = buildSeatManifest(result.config); // seats + seatSetHash + geometryHash
const next = buildSeatManifest(changedConfig);
const diff = diffSeatManifests(manifest, next); // added, removed, moved, relabelled, retyped

const occupancy = applyOccupancyDelta(current, delta);
const violations = validateSelection(
  layout,
  occupancy,
  ['centre.r2.s1', 'centre.r2.s2'],
  [selectionRules.max(4), selectionRules.adjacent(), selectionRules.noSingleGap()],
);
```

Validate an edit from the constructor against the field policy on the server:

```ts
import { validateEdit, validateHall } from '@cinema-hall/core';

const issues = validateHall(config, { enforce: true, constraints: serverConstraints });
const locked = validateEdit(previousConfig, nextConfig, { 'hall.width': 'locked' });
```

Templates for a new hall, and the JSON Schema for non-JS backends:

```ts
import { builtInTemplates, hallConfigJsonSchema, templates } from '@cinema-hall/core';

const concept = templates.threeSections({ rows: 7, seats: [3, 8, 3], aisle: 1 });
const choices = builtInTemplates.map((t) => ({ id: t.id, label: t.label }));
```

`hallConfigJsonSchema` checks structure and limits only. Geometry checks (`fit.*`, `rows.*`, `view.*`) need Node: use `validateHall` or the CLI.

## CLI

The package exposes a `cinema-hall` binary. After the package has been published to npm, run it with
`npx @cinema-hall/core`:

```sh
npx @cinema-hall/core validate hall.yaml [--json] [--enforce constraints.json]   # exit 1 on any error
npx @cinema-hall/core manifest hall.yaml > seats.json
npx @cinema-hall/core layout   hall.yaml > layout.json
npx @cinema-hall/core schema > hall.schema.json
```

For the current repository clone, build from the repository root, then run the built CLI directly:

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/core/dist/cli.js validate docs/examples/meridian-hall-3.yaml
```

Exit codes: `0` ok, `1` validation errors, `2` usage or I/O error.

## Notes

- Requires Node.js 22 or later for the CLI. The library itself runs anywhere ES2022 runs.
- Dependencies: `yaml`, `zod` (v4), `@noble/hashes`.
- Limits are part of the schema: 100 rows per section, 200 seats per row, 5000 seats, 64 sections.
  Geometry is never computed for a config that fails them.
- Changing the algorithm of `buildHallLayout` changes seat keys and hashes. It is frozen per `version`.
