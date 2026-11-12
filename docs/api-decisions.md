# API v0.1 → v0.2 review: decisions

Three independent Sonnet reviewers examined the API draft v0.1. Each worked from a separate
perspective and could not see the other reports:

| Reviewer | Perspective                                    |
| -------- | ---------------------------------------------- |
| **DX**   | Ease of use in code                            |
| **CUST** | Customization for developers embedding the kit |
| **BE**   | Backend integration                            |

Below are all findings rated “critical” or “important,” along with the decision for each. “Agreed”
means multiple reviewers independently reached the same conclusion.

## Accepted

| #   | Finding                                                                                                                                | From                     | Decision in v0.2                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `HallLayout` contained the `seatById` function: the quick start failed in Next at the Server → Client boundary                         | DX, BE (agreed)          | Pass `config` across the boundary; `HallLayout` is data only; add `createSeatIndex()`; test with `structuredClone`                                        |
| 2   | `seatId = 'B-4'` depended on sequential numbering: inserting a row renamed other people's bookings, and IDs collided with `perSection` | BE, DX (agreed)          | `SeatKey = section.rN.sM` (stable), separate from `label = 'B4'` (UI only)                                                                                |
| 3   | The `SeatPicker.Root` dotted notation does not work in a Server Component                                                              | DX                       | Named exports `SeatPickerRoot`, …                                                                                                                         |
| 4   | Theme, text, and locale were duplicated on every component                                                                             | CUST, DX (agreed)        | `CinemaHallProvider` + an explicit merge rule                                                                                                             |
| 5   | Package styles could not override Tailwind v4 without `!important`                                                                     | CUST                     | `@layer chk.*` + `:where()`, a priority ladder, inline styles only for explicit keys                                                                      |
| 6   | Unknown YAML fields silently disappeared                                                                                               | CUST                     | Preserve `meta` at every level; other unknown keys are errors, not removed; add `extraFields` to the constructor                                          |
| 7   | The theme did not reach WebGL, and color was described in three places                                                                 | CUST                     | Provider resolves tokens to `THREE.Color`, `theme.seatTypes`, and scene tokens; YAML takes precedence over the theme                                      |
| 8   | A light theme required ~30 overrides                                                                                                   | CUST                     | Two-level tokens: seed + `color-mix`                                                                                                                      |
| 9   | `stage` + `focusedSeatId` allowed invalid pairs and were awkward to synchronize with the URL                                           | DX                       | One union `view: {stage:'map'} \| {stage:'view'; seatKey}` + `onInvalidView`                                                                              |
| 10  | Multi-selection with a “no single gaps” rule was not possible: the rule could not see occupancy, and a tap immediately opened 3D       | DX, BE (agreed)          | `selectionRules` + `validateSelection` in core (UI and server), `openViewOn`, `p.total`, union `selection`                                                |
| 11  | `BookResult` did not cover hold → payment, retries, double taps, or stale data                                                         | BE, DX (agreed)          | `attemptId` (idempotency), `signal`, `prices`, `hold.expiresAt`, `revision`, partial `conflict`, `price_changed`/`closed`, exception → `error`, atomicity |
| 12  | `session` could not be passed while data was loading; live data was mixed with static data                                             | DX                       | Separate `occupancy` / `pricing` / `avatars` / `screen`; `undefined` = loading                                                                            |
| 13  | `occupancy` lacked `held`, `expiresAt`, and “my” seats; there were no deltas                                                           | BE                       | `Occupancy { revision, serverNow, taken, blocked, held[] }` + `applyOccupancyDelta`                                                                       |
| 14  | Avatars exposed other viewers' names and photos to everyone                                                                            | BE                       | Separate `avatars`; only `seed`/`color`/`imageUrl` (host opt-in), with no names                                                                           |
| 15  | `number` prices allowed fractions and were tied to the visual seat type                                                                | BE                       | `Money` in minor units; `priceTier` on the section (defaults to the seat type)                                                                            |
| 16  | Config was accepted without limits (DoS), YAML aliases, or restrictions on document-supplied `constraints`                             | BE                       | Strict schema limits, `maxBytes`, disallow aliases and tags, `validateHall({ enforce })`                                                                  |
| 17  | `ok:false` for a semantic error prevented opening a hall for correction                                                                | DX                       | `ok` indicates structure only; put `fit.*` in `issues` with `ok:true`                                                                                     |
| 18  | Editor: typed paths with `*` overloaded TypeScript, config could contain `NaN`, there was no `dirty` state, and comments were lost     | DX                       | `patch(DeepPartial)`, closed `FieldKey`, draft value in the field, `dirty`/`markSaved`, `source`; `editor` is the canonical entry point                   |
| 19  | `hidden`/`locked` only worked in the UI; YAML could bypass them                                                                        | CUST                     | Check `policy` on import and in `validateEdit` (on the server too)                                                                                        |
| 20  | `onSave` was described inconsistently; there were no conflicts or occupied-seat handling                                               | BE, DX                   | `SaveResult`: `conflict` / `invalid` / `seats_in_use`; `ctx.diff`                                                                                         |
| 21  | `geometryHash` was undefined                                                                                                           | BE                       | `seatSetHash` + `geometryHash` from a canonical object; algorithm frozen for `version`; golden files                                                      |
| 22  | JSON Schema promised more than it could deliver                                                                                        | BE                       | Document the limitation honestly + CLI `validate --json` / `layout` / `manifest`                                                                          |
| 23  | The database model and hall versions were undocumented                                                                                 | BE                       | §8 api.md: `hall_version`; session is bound to a version                                                                                                  |
| 24  | Individual seats could not be removed (aisle, wheelchair space)                                                                        | BE                       | `exclude` in the section                                                                                                                                  |
| 25  | The sheet could not be replaced, glass could not be disabled, and forwarding `sheet.props` leaked API                                  | CUST, DX                 | `sheet={false}`, `skin: 'glass'\|'plain'\|'none'`, no `sheet.props`                                                                                       |
| 26  | Slots: inline functions caused remounts, and there were no button slots                                                                | DX, CUST (agreed)        | Slots are components with stable references (development warning); primitives `Button`/`Chip`/`Card`                                                      |
| 27  | Three overlapping motion controls (`none` / `reducedMotion` / `quality`); `blur: 0` caused pixelation                                  | CUST                     | One `motion` control; do not lower `dpr` when blur is disabled                                                                                            |
| 28  | Custom camera path and synchronization with progress                                                                                   | CUST                     | `cameraFlight.path(t, ctx)`; progress 0 = map, 1 = view in either direction; no public `motion` types                                                     |
| 29  | 3D: one seat model for every type, `Object3D` avatars broke the draw-call budget, and there was nowhere for branding                   | CUST                     | `seatModels` by type with a GLB contract, avatars as instances only, `decals`, `useHallAnchors()`                                                         |
| 30  | i18n used strings; there was no aria or RTL support                                                                                    | CUST                     | Templates and functions, plural forms, `aria.*` keys, RTL rules                                                                                           |
| 31  | It was unclear what counted as a breaking change                                                                                       | CUST                     | Public contract table (§7.6)                                                                                                                              |
| 32  | `Issue.message` conflicted with the requirements                                                                                       | DX, BE, CUST (all three) | `Issue` without text; `formatIssue`; `IssueCode \| (string & {})`; `ref` by id                                                                            |
| 33  | `rules` silently replaced `defaultRules`                                                                                               | CUST, DX (agreed)        | `extraRules` + `severity: 'off'`                                                                                                                          |
| 34  | The imperative handle duplicated the prop and hook                                                                                     | DX                       | Handle removed; `resetLook` moved to the hook                                                                                                             |
| 35  | The quick start confused `hallId` and `sessionId`                                                                                      | BE                       | Flow: session → hall version → config                                                                                                                     |

Other details also included in v0.2: `themeToCss` for CSP; a glass fallback for
`prefers-reduced-transparency`; `classNames` are appended rather than replaced; `onSelectionLost`;
inline `scene` and `theme` objects are compared by value.

## Rejected or changed

| Finding                                                          | From | Why                                                                                                                                                                      |
| ---------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reduce transition-phase settings to presets                      | DX   | Conflicts with the requirement: transitions are part of the library and are customizable. Compromise: presets cover 90% of cases; overriding phases remains optional.    |
| Defer 3D customization (`seatModels`, `avatar`, `decals`)        | DX   | Conflicts with the requirement to “improve customization.” Kept within the CUST instancing contract to avoid harming performance.                                        |
| Make `motion` an optional peer with a separate entry point       | CUST | Transitions are core to the product, and `react-modal-sheet` requires `motion` anyway. A second entry point for a rare case conflicts with KISS.                         |
| Defer composite constructor components                           | CUST | They are inexpensive on top of `useHallEditor`, and a “very convenient constructor API” is an explicit requirement. Only the form's `sections` filter is deferred.       |
| Insert a row in the middle of a section using explicit `rowKeys` | BE   | In v1, the section's trailing keys shift; `diffSeatManifests` shows this, and hall versions protect bookings already sold. Explicit keys can be added in v1.1 if needed. |

## Deferred (v1.1+)

- Export `GlassSheet`/`GlassPanel` (CUST, DX): glass is available through tokens; new public DOM is not needed yet.
- `diffHallConfigs` for auditing (BE).
- Typed `meta` through `createHallCodec` (CUST): in v1 it is validated by a custom rule.
- `migrateHallConfig`: will arrive with `version: 2`; currently there is a `schema.unsupportedVersion` error.
- Field policy as a function `(path, config) => policy` (CUST).
- Ports to other languages and WASM (BE): the CLI and golden files are sufficient.

## Implementation review: coordinator decisions

Codex GPT-6.1 Sol reviewed each block of code against the contract. It served only as the reviewer;
Claude workers wrote the code. Below are findings that were rejected or resolved differently from
the reviewer's suggestions.

| Finding                                                                                         | Decision                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format: 'json'` should reject YAML (core F14)                                                  | No: JSON is a subset of YAML 1.2, and one parser handles both; `format` changes only error text. This catches duplicate keys the same way in both formats. |
| Allow standard YAML tags such as `!!str` (core F15)                                             | No: hall config does not need tags; banning them all is simpler and safer.                                                                                 |
| JSON Schema should include common limits (core F11)                                             | Resolved in the docs: the schema checks structure and per-field limits; only `parseHallConfig` checks common limits and geometry.                          |
| Compare string revisions “like humans do”                                                       | No: compare lexically, by code units, as specified in the contract.                                                                                        |
| A GLB seat model with a tintable material should use one InstancedMesh (3D F12)                 | Two per seat type are acceptable: still well within the budget of 50 draw calls.                                                                           |
| `editor.reset()` should check field policies                                                    | No: `reset` sets an external baseline (the server version after a conflict); it is not a user edit. The policy protects all user actions.                  |
| Debounce constructor validation by 150 ms                                                       | No: values are applied on blur/Enter and validation is synchronous, so there is no stale state before saving.                                              |
| Drag and drop sections                                                                          | Replaced with arrows: dragging with the mouse moves the plan.                                                                                              |
| `onViewChange` at the start of a transition                                                     | No: it is a request based on user intent, like `onValueChange`. Otherwise a controlled picker would block itself.                                          |
| Pinch zoom for the seat map                                                                     | Outside v1.                                                                                                                                                |
| Protect against host `formatPrice`/`labels` that throw or return a non-string (picker F48, F49) | No: that violates the host's typed contract.                                                                                                               |

**User decisions during the work:**

- no gradients;
- prices without a currency, with cents, using the `¤` sign;
- constructor with “canvas + inspector”;
- map and 3D view side by side on desktop;
- separate “Preview” and “Continue” actions;
- demo palette and names do not reproduce the reference;
- Codex serves only as reviewer.
