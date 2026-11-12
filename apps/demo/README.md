# apps/demo: @cinema-hall example

Next.js 16 (App Router), React 19. This demo shows both library screens and a mock backend: seat
selection with a 3D view from the seat, and a hall constructor. The packages are connected just as
they are for an npm consumer: through the public `exports` from the built `dist`. Imports from
`packages/*/src` are prohibited by an ESLint rule, and `transpilePackages` is not used in
`next.config.ts`.

## Run

From the repository root:

```sh
pnpm i && pnpm build && pnpm --filter demo dev
```

`pnpm build` builds the packages and the demo. To run only the demo, first build `packages/core`
and `packages/react`, because the demo reads their `dist` outputs. Then open http://localhost:3000.

Playwright smoke tests (Chromium, WebGL through SwiftShader):

```sh
pnpm --filter demo exec playwright install chromium   # once
pnpm --filter demo e2e
```

`playwright.config.ts` builds the app and starts `next start` on port 3100. Screenshots of the map,
3D view, sheet, and constructor are saved in `test-results/screens/`.

## Flow: “YAML → hall → sessions → booking”

1. **Hall.** A hall is created from YAML: sample halls are seeded when the server starts, and a
   custom hall can be uploaded at `/halls/new` or created from a template in the constructor.
2. **Versions.** A hall stores versions. The first version is created with the hall, and each save
   in the constructor adds another version.
3. **Sessions** are bound to the hall version that was current when they were created (api.md §8).
   A session consists of a date, time, format (`2D`, `LUX`, or any text up to 16 characters),
   optional prices by tier, and the share of occupied seats used by the mock.
4. **Booking.** `/sessions/[id]` builds seat selection from the hall version bound to the session.
   Session prices override hall prices by tier (`resolvePricing`).
5. **Repinning sessions.** A new hall version does not change existing sessions. The explicit
   “repin future sessions” operation compares version manifests with `diffSeatManifests` and leaves
   a session untouched if it has occupied or held seats that disappear in the new version.

## Pages

| Route                        | What it shows                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                          | Home page. Cards for sample halls show the hall plan (SVG from `buildHallLayout`), seat count, seat types with prices, and session chips. Cards for “Upload your hall” and “Hall constructor.” `?new=<hallId>` highlights the created hall. |
| `/halls/new`                 | Hall upload: file (`.yaml`, `.yml`, `.json`), drag and drop, paste text, “Use example.” Browser validation (`parseHallConfig` and `validateHall`) with line and column numbers, hall plan, and session generator.                           |
| `/sessions/[sessionId]`      | `SeatPicker`: hall map, 3D view from the seat, price sheet, and timed booking. The header (cinema, hall, date, format) and time chips come from the session's hall: the chips are other sessions in that hall on the same day.              |
| `/constructor`               | `HallConstructor` from `@cinema-hall/react`. With no parameters, it opens “Orbit · Hall 2.”                                                                                                                                                 |
| `/constructor?hall=<hallId>` | The same editor for any hall, whether a sample or uploaded. After saving: “New version N saved,” “Repin future sessions,” and “Open in booking.”                                                                                            |
| `/constructor?template=<id>` | Starts from a template (`single`, `threeSections`, `stadium`). The first save creates the hall on the server.                                                                                                                               |

On a session page, `?seat=<SeatKey>` (for example, `?seat=centre.r2.s1`) sets the “view from seat”:
navigation is synchronized with the URL through `router.replace`, and an invalid key is cleared
through `onInvalidView`.

## What the code demonstrates

- `app/layout.tsx`: stylesheet import order. First `globals.css`, then `@cinema-hall/react/styles.css`.
- `app/providers.tsx` (`'use client'`): `CinemaHallProvider` with `locale="en-US"` and `labels.en`,
  and a custom `Button` slot (`DemoButton`, declared at module scope).
- `app/globals.css`: `@layer chk, app;`, overriding tokens in `@layer app { .chk-root { … } }`.
  The provider theme sets only the mode so it does not override these tokens (api.md §7.1).
- `app/sessions/[sessionId]/page.tsx`: Server Component. Session → hall version → `parseHallConfig`
  (strict). Only the plain `config` object is sent to the client.
- `app/sessions/[sessionId]/booking-client.tsx`: polls occupancy every 3 s (`fetch` and
  `AbortController`, without SWR); `onBook` calls a Server Action, and `onBooked` displays the
  booking panel.
- `app/sessions/[sessionId]/actions.ts`: `holdSeats`, a Server Action.
- `app/constructor/page.tsx`: Server Component. Current hall version → `parseHallConfig` (strict) →
  `config`, `source` (YAML with comments), and `revision` are sent to the client.
- `app/constructor/constructor-client.tsx`: `useHallEditor` and `<HallConstructor>` with `onSave`,
  a draft in `localStorage`, and an “Open session in booking” link.
- `public/screen/dunes.svg`: image on the screen. The original work is licensed under CC0; see
  `CREDITS.md`.

## Mock backend

Everything is in process memory in `lib/server/`. The model follows api.md §8: hall → hall versions
→ sessions bound to a version → seat state. When the server starts, it creates three halls from
`data/*.yaml` (4 sessions across two days each; LUX and premiere sessions have their own prices):

| Hall                          | File                      | Seats |
| ----------------------------- | ------------------------- | ----- |
| Orbit · Hall 2 (`sat-1610` …) | `data/orbita-hall-2.yaml` | 126   |
| Chamber Hall                  | `data/kamerny-hall.yaml`  | 65    |
| Grand Hall                    | `data/bolshoy-hall.yaml`  | 228   |

| File                       | What it does                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/server/store.ts`      | Singleton on `globalThis`, seeds halls and sessions, deterministic occupancy (hash of session id and seat key; the share is set on the session and defaults to 40%), date formatting. |
| `lib/server/halls.ts`      | Creates a hall from YAML (id from `config.id` or a unique transliteration of the name), saves a version with a `conflict` on revision mismatch.                                       |
| `lib/server/sessions.ts`   | Creates and deletes sessions, repins future sessions to a version.                                                                                                                    |
| `lib/server/cards.ts`      | Page models: hall with tiers and sessions.                                                                                                                                            |
| `lib/server/booking.ts`    | Occupancy, holds with a 10-minute TTL, idempotency by `attemptId`, `validateSelection` with `max(6)` and `noSingleGap()` rules, price validation, atomic booking.                     |
| `lib/server/viewer.ts`     | `httpOnly` cookie `chk_viewer`: used to determine `mine` for holds.                                                                                                                   |
| `lib/shared/hall-check.ts` | Validates hall text with `parseHallConfig` and `validateHall`. Runs in the browser (feedback) and on the server (`enforce: true`, which performs the enforcement).                    |
| `lib/shared/generator.ts`  | Session generator: dates × times → sessions. One implementation for the form and server.                                                                                              |
| `lib/shared/types.ts`      | Response types and JSON form validation. This file can be imported by the client.                                                                                                     |

### Routes

| Method and path                                     | Body and response                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/halls`                                    | `{ halls: HallCard[] }`: id, name, version, seat count, tiers with prices, sessions, and count of future sessions on old versions.                                                                                                                                                                                                   |
| `POST /api/halls`                                   | `{ yaml, cinema?, generator? }`. The server parses YAML, runs `validateHall(…, { enforce: true })` (thresholds from the document are ignored), validates the generator, and only then creates the hall and sessions. 201 `{ ok, hall, created }`. 400 `{ ok: false, error, message, issues? , field? }`, 413 for a body over 300 KB. |
| `GET /api/halls/[hallId]`                           | `{ hallId, revision, config, source }`: current version.                                                                                                                                                                                                                                                                             |
| `POST /api/halls/[hallId]`                          | `{ baseRevision, yaml }`: saves a new version from the constructor. Returns `SaveResult` and `revision`. Sessions are unchanged.                                                                                                                                                                                                     |
| `GET /api/halls/[hallId]/sessions`                  | `{ sessions }` in ascending time order, each with `versionRev`.                                                                                                                                                                                                                                                                      |
| `POST /api/halls/[hallId]/sessions`                 | Generator: `{ from, to, slots: [{ time, format }], prices?, occupancyPercent? }`. One session is for one day and one time. Sessions are bound to the current version.                                                                                                                                                                |
| `DELETE /api/halls/[hallId]/sessions/[id]`          | Deletes a session. Returns 409 while it has active bookings.                                                                                                                                                                                                                                                                         |
| `POST /api/halls/[hallId]/repin`                    | `{ toRev? }` (defaults to the current version). Repins future sessions. Response: `moved`, `refused` (session and seats that disappear but are occupied or held), `unchanged`.                                                                                                                                                       |
| `GET /api/sessions/[sessionId]/occupancy`           | `{ occupancy, pricing }`.                                                                                                                                                                                                                                                                                                            |
| `holdSeats(sessionId, keys, { attemptId, prices })` | Server Action, returns `BookResult`.                                                                                                                                                                                                                                                                                                 |

Generator rules (the same in the browser and on the server): dates cannot be before today, a period
up to 31 days, up to 12 times per day, up to 200 sessions per request, format length 1–16 characters,
and occupancy as an integer from 0 to 100. A tier price is a number of at least 0 with no more than
two decimal places, without a currency (displayed as `¤`); a price equal to the hall price is not
considered an override. Demo limits: 40 halls, 1500 sessions, 400 sessions per hall.

Server modules are not imported from client files. The `server-only` package is not included because
the requirements do not call for extra dependencies. This is a convention, not a build-time check.

## Constructor

`/constructor` uses `HallConstructor` from `@cinema-hall/react` on top of `useHallEditor`
(api.md §3, requirements §5.1). `extraFields` adds the `meta.hallType` field (LUX or 2D), and
`fieldLimits` narrows the seat pitch step, `section.seatPitch`, to the range 0.5–0.8 m in increments
of 0.05.

- Saving: `onSave` sends `{ yaml, baseRevision }` to `POST /api/halls/<hallId>` and returns the
  response as `SaveResult`. The server no longer refuses to save because seats are occupied in
  sessions: sessions remain on their own version, and occupancy is checked during repinning. The
  base revision changes after a successful save and after a conflict when the editor loads the server
  version (see the comment in `constructor-client.tsx`).
- Draft: unsaved changes are written to `localStorage` after 500 ms. On the next visit, the page
  offers to restore the draft, which is loaded through `editor.importText`.
- After saving, a panel appears above the editor: “New version N saved,” “Repin future sessions”
  (result for each session, including refusals with seat details), and “Open in booking” (the first
  session on the new version, or the hall card on the home page if there is none). A template becomes
  a hall on its first save.

## Tests

- `e2e/halls.spec.ts`: home page (cards with plans and chips; a session opens its hall), YAML upload
  (validation, generator for 2 days × 2 times with a price, booking), invalid YAML creates nothing,
  server ignores thresholds from the document, invalid generator parameters, new version and session
  repinning (an occupied session stays on its version), template becomes a hall.
- `e2e/booking.spec.ts`: seat selection, occupied seat cannot be selected, 3D view and metrics,
  timed booking, conflict when booking twice from two sessions.
- `e2e/transition.spec.ts`: back navigation during a transition, no console errors.
- `e2e/constructor.spec.ts`: `seatsPerRow` in the central section set to 30 → `fit.width` error →
  corrected to 8 → save new revision → export YAML with comments and screenshot `constructor.png`;
  draft after reload. The “clicking `fit.width` focuses the field” test is marked `test.fail`: the
  error is attached to the strip, and focus currently moves to the strip card (see the comment in
  the file).

## Licenses

The demo code and `data/orbita-hall-2.yaml` are distributed under 0BSD, like the rest of the
repository. The image `public/screen/dunes.svg` was recreated and is licensed under CC0. See
`CREDITS.md` for details.
