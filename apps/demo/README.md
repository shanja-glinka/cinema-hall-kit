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
   “Move future showtimes” operation compares version manifests with `diffSeatManifests` and leaves
   a session untouched if it has sold, taken or held seats that disappear in the new version; the
   refusal names the showtime (`Nov 28 · 18:30`) and the seat labels (`Q7`).
6. **Purchase (demo).** A reservation (hold) lasts 10 minutes. "Confirm purchase" turns the
   viewer's active hold into sold seats and a ticket number (`T-1A2B3C4D`). It is idempotent by
   hold id and refuses an expired hold. No payment is taken. The confirmed seats must all be in one
   reservation: seats reserved separately are bought one reservation at a time, and the page says
   so instead of sending the purchase.

New halls made in the constructor (templates, copies, "Save as new hall") get an id made from their
name; an `id` written in an imported file is ignored there. On `/halls/new` the file's `id` is used
when it is free; when another hall has it, the hall gets an id from its name and the page says so.

## Pages

| Route                        | What it shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                          | Home page for a cinema administrator: "Create a new hall" (a template, or a copy of an existing hall), then the halls. Each card has the plan, seat types with prices, showtime chips (`· v1` marks a showtime on an older hall version), "Add or delete showtimes", "Edit hall" and "Copy". Older sample texts are shown in their current wording, for example the recliner seat type "Lounge" as "Lounge (recliners)" (`lib/shared/sample-texts.ts`); a name the administrator typed is shown as typed. Sample halls carry a "Sample" badge. Developer notes are at the bottom. `?new=<hallId>` highlights a created hall; `&requested=<id>` explains a changed id. |
| `/halls/new`                 | "Import a hall from a file": file (`.yaml`, `.yml`, `.json`), drag and drop, paste text, "Load example". Browser check (`parseHallConfig` and `validateHall`) with the place of each issue in words (paths and codes under "Technical details"), hall plan, the id the hall will get when the file's id is taken, and the showtime generator.                                                                                                                                                                                                                                                                                                                         |
| `/halls/[hallId]/showtimes`  | The showtimes of a hall. "New showtimes": the same generator, sent to `POST /api/halls/[hallId]/sessions`; one day is the default ("Several days" adds a last day), each day is picked with the browser's calendar and written out as `Sat, Nov 28`; pretend sales ("Seats occupied") start at 0 under a closed "Demo simulation" part. "Showtimes of this hall": each showtime with "Delete" and a confirmation (`DELETE …/sessions/[id]`; refused with the reason while seats are sold or temporarily reserved). The booking page's back link leads to the page a showtime was opened from (for that showtime and the other showtimes of its hall), or here.        |
| `/sessions/[sessionId]`      | `SeatPicker`: hall map, 3D view from the seat, price sheet, a 10-minute reservation and the demo purchase ("Confirm purchase", no payment) through `onConfirm`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `/constructor`               | Without parameters: a chooser (new hall from a template, a copy, or a hall to change). It never opens a sample hall for editing by itself.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `/constructor?hall=<hallId>` | Edits a hall. "Save as new hall" keeps it as it is and saves the layout under a new name. The first save of a sample hall, or of a hall with showtimes, asks: "Save as new hall" or "Update this hall".                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/constructor?template=<id>` | A new hall from a template (`single`, `threeSections`, `stadium`, and `balcony` when the installed core has it). The first save creates it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `/constructor?copy=<hallId>` | A new hall from a copy: "<name> (copy)", no id, and a header comment of its own. The first save creates it; the original is not changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

On a session page, `?seat=<SeatKey>` (for example, `?seat=centre.r2.s1`) sets the “view from seat”:
navigation is synchronized with the URL through `router.replace`, and an invalid key is cleared
through `onInvalidView`.

## What the code demonstrates

- `app/layout.tsx`: stylesheet import order. First `globals.css`, then `@cinema-hall/react/styles.css`.
- `app/providers.tsx` (`'use client'`): `CinemaHallProvider` with `locale="en-US"` and `labels.en`,
  where one label is overridden: the picker's button says "Reserve seats · {price}" (it holds the
  seats for 10 minutes; the purchase comes after). Also a custom `Button` slot (`DemoButton`,
  declared at module scope).
- `app/globals.css`: `@layer chk, app;`, overriding tokens in `@layer app { .chk-root { … } }`.
  The provider theme sets only the mode so it does not override these tokens (api.md §7.1).
- `app/sessions/[sessionId]/page.tsx`: Server Component. Session → hall version → `parseHallConfig`
  (strict). Only the plain `config` object is sent to the client.
- `app/sessions/[sessionId]/booking-client.tsx`: polls occupancy every 3 s (`fetch` and
  `AbortController`, without SWR); `onBook` calls a Server Action, and `onBooked` displays the
  booking panel.
- `app/sessions/[sessionId]/actions.ts`: `holdSeats` and `purchaseSeats`, Server Actions. A purchase
  is idempotent by hold id, so when its answer is lost the page simply sends it again; a ticket whose
  answer never arrived (or that went through after a reload) comes with the next occupancy answer
  (`ownTickets`). The page keeps no record of its own about a purchase.
- `app/constructor/page.tsx`: Server Component. Current hall version → `parseHallConfig` (strict) →
  `config`, `source` (YAML with comments), and `revision` are sent to the client.
- `app/constructor/constructor-client.tsx`: `useHallEditor` and `<HallConstructor>` with `onSave`,
  a draft in `localStorage`, the save question for sample halls and halls with showtimes, "Save as
  new hall", and a list of the hall's showtimes to open.
- `public/screen/dunes.svg`: image on the screen. The original work is licensed under CC0; see
  `CREDITS.md`.

## Mock backend

Everything is in process memory in `lib/server/`. The model follows api.md §8: hall → hall versions
→ sessions bound to a version → seat state. When the server starts, it creates three halls from
`data/*.yaml` (4 sessions across two days each; LUX and premiere sessions have their own prices).
They are marked as samples and pass every check with no errors and no warnings:

| Hall                         | File                      | Seats |
| ---------------------------- | ------------------------- | ----- |
| Orbita Hall 2 (`sat-1610` …) | `data/orbita-hall-2.yaml` | 126   |
| Chamber Hall                 | `data/kamerny-hall.yaml`  | 65    |
| Grand Hall (two levels)      | `data/bolshoy-hall.yaml`  | 228   |

| File                       | What it does                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/server/store.ts`      | Singleton on `globalThis`, seeds halls and sessions, deterministic occupancy (hash of session id and seat key; the share is set on the session and defaults to 40%), date formatting. |
| `lib/server/halls.ts`      | Creates a hall from YAML (`config.id` when free, otherwise a unique slug of the name; `asNew` always uses the name), saves a version with a `conflict` on revision mismatch.          |
| `lib/server/sessions.ts`   | Creates and deletes sessions, repins future sessions to a version.                                                                                                                    |
| `lib/server/cards.ts`      | Page models: hall with tiers and sessions.                                                                                                                                            |
| `lib/shared/hall-text.ts`  | Comment-preserving edits of a hall document: top-level `id`/`name`, header comment, copies.                                                                                           |
| `lib/shared/hall-id.ts`    | Hall id slugs (shared, so the upload page can tell the id in advance).                                                                                                                |
| `lib/server/booking.ts`    | Occupancy, holds with a 10-minute TTL, idempotency by `attemptId`, `validateSelection` with `max(6)` and `noSingleGap()` rules, price validation, atomic booking.                     |
| `lib/server/viewer.ts`     | `httpOnly` cookie `chk_viewer`: used to determine `mine` for holds.                                                                                                                   |
| `lib/shared/hall-check.ts` | Validates hall text with `parseHallConfig` and `validateHall`. Runs in the browser (feedback) and on the server (`enforce: true`, which performs the enforcement).                    |
| `lib/shared/generator.ts`  | Session generator: dates × times → sessions. One implementation for the form and server.                                                                                              |
| `lib/shared/types.ts`      | Response types and JSON form validation. This file can be imported by the client.                                                                                                     |

### Routes

| Method and path                                     | Body and response                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/halls`                                    | `{ halls: HallCard[] }`: id, name, version, seat count, tiers with prices, sessions, and count of future sessions on old versions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `POST /api/halls`                                   | `{ yaml, cinema?, generator?, name?, asNew? }` (`requestedId` in the answer when the file's id was not used). The server parses YAML, runs `validateHall(…, { enforce: true })` (thresholds from the document are ignored), validates the generator, and only then creates the hall and sessions. The file may be up to 256 KiB; the stored text, with the id the server writes into it, may be up to 4 KiB larger, and that stored text is accepted again when it is saved or copied (`asNew`). 201 `{ ok, hall, created, stored }`, where `stored` is the hall as saved (`{ hallId, revision, config, source }`). 400 `{ ok: false, error, message, issues? , field? }`, 413 for a body over 300 KB. |
| `GET /api/halls/[hallId]`                           | `{ hallId, revision, config, source }`: current version.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `POST /api/halls/[hallId]`                          | `{ baseRevision, yaml }`: saves a new version from the constructor. Returns `SaveResult` and `revision`. Sessions are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GET /api/halls/[hallId]/sessions`                  | `{ sessions }` in ascending time order, each with `versionRev`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `POST /api/halls/[hallId]/sessions`                 | Generator: `{ from, to, slots: [{ time, format }], prices?, occupancyPercent? }`. One session is for one day and one time. Sessions are bound to the current version.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `DELETE /api/halls/[hallId]/sessions/[id]`          | Deletes a session. Returns 409 while it has active holds or sold tickets, with the reason in the message.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `POST /api/halls/[hallId]/repin`                    | `{ toRev? }` (defaults to the current version). Repins future sessions. Response: `moved`, `refused` (session and seats that disappear but are occupied or held; `retryable: true` when they are only held, so moving again can succeed once the holds end), `unchanged`.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GET /api/sessions/[sessionId]/occupancy`           | `{ occupancy, pricing, ownHolds?, ownTickets? }`: `ownHolds` lists the caller's own active holds (cookie `chk_viewer`), so a reopened booking page restores its reservation; `ownTickets` lists the caller's tickets for the showtime, so a purchase whose answer was lost still shows its ticket.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `POST /api/sessions/[sessionId]/purchase`           | `{ holdId, keys?, prices? }`: demo purchase of the caller's hold (cookie `chk_viewer`): only `keys` (all in the hold) are sold and charged, the rest is released. `prices` (`[{ key, price }]`, as the viewer saw them; without it, the prices at reservation) bind the purchase: a changed price sells nothing and answers 409 `price_changed` with the new `total`. 200 `{ ok, ticket }`, 409 `expired` / `not_found` / `price_changed`, 404 unknown showtime. Repeating returns the same ticket.                                                                                                                                                                                                    |
| `holdSeats(sessionId, keys, { attemptId, prices })` | Server Action, returns `BookResult`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Generator rules (the same in the browser and on the server): dates cannot be before today, a period
up to 31 days, up to 12 times per day, up to 200 sessions per request, format length 1–16 characters,
and occupancy as an integer from 0 to 100. A tier price is a number of at least 0 with no more than
two decimal places, without a currency (displayed as `¤`); a price equal to the hall price is not
considered an override. Demo limits: 40 halls, 1500 sessions, 400 sessions per hall.

Server modules are not imported from client files. The `server-only` package is not included because
the requirements do not call for extra dependencies. This is a convention, not a build-time check.

Grand Hall is a real two-level hall: stalls and lounge rows on the ground floor, and a balcony band
(`label: Balcony`, `startDistance: 13.5`, `elevation: 5.6`) that hangs over the lounge rows
(api.md §2.4.1).

## Texts

The demo is in English. Its own texts are in `lib/shared/texts.ts` (one typed object, `t`, with
functions for texts that take numbers or names), so they can be changed or translated in one place.

- Dates go through `Intl.DateTimeFormat` with `en-US` (`Nov 28`), prices through `formatPrice`,
  and issue texts through the core catalog (`formatIssue(issue, issueMessages.en)`).
- The library's own texts (seat picker and hall editor) come from `labels.en` of
  `@cinema-hall/react`.

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
- After saving, a panel appears above the editor: "Hall … created" with "Add showtimes" as the next
  step, or "Changes saved" with, when showtimes use the previous layout, a plain explanation and
  "Move future showtimes" (hidden when there is nothing to move), and the showtimes to open.
- Protection: the first save of a sample hall, or of a hall with showtimes, asks "Save as new hall"
  (with a name) or "Update this hall"; Cancel saves nothing.

## Tests

`pnpm --filter demo test` runs the unit tests of `lib/` (`e2e/unit.spec.ts` and `e2e/unit-*.spec.ts`, no browser, no
server; `playwright.unit.config.ts`). `pnpm --filter demo e2e` runs everything against a build.

- `e2e/unit-flows.spec.ts`: hall ids, copies and header comments, issue places in words, date
  labels, template choices (`balcony` only when present), sample halls without warnings, creating
  halls with a taken id or as new, the demo purchase (idempotent, expired, other viewer), and
  readable repin refusals.
- `e2e/unit-hall-text.spec.ts`: id and name rewrites that keep YAML, JSON and flow-style hall
  texts valid, with their formatting and comments; size limits and copy names.
- `e2e/unit-booking.spec.ts`: reservations taken over by a newer hold, one reservation per
  purchase, lost or repeated purchase answers, prices after a reload, tickets after a showtime
  moves, and the balcony sizes of the booking view.
- `e2e/unit-constructor-saving.spec.ts`: one save at a time, the stored copy after a save, the
  save dialog, and drafts at the stored size limit.
- `e2e/unit-back-link.spec.ts`: the way back from a booking page.
- `e2e/halls.spec.ts`: home page (create first, samples labelled, import secondary), YAML import
  (check, generator, booking; the id note for a taken id), invalid YAML creates nothing, server
  thresholds, invalid generator parameters, a new version and moving showtimes (refusal with seat
  labels, `· v1` chips), a template becomes a hall, and the full new-hall flow: template → save →
  "Add showtimes" → booking → "Confirm purchase". "Copy" opens a new hall.
- `e2e/booking.spec.ts`: seat selection, taken seats, 3D view and metrics, reservation ("Reserve
  seats"), conflict.
- `e2e/unit-texts.spec.ts`: no empty text, plurals, dates, generator and issue texts, template and
  copy names, sample hall wording, showtime form texts, and the two-level Grand Hall (balcony over
  the rear rows, no issues, 228 seats).
- `e2e/showtimes-and-samples.spec.ts`: deleting a showtime, the booking page's back link, and the
  names the sample halls and the two-level plan use.
- `e2e/transition.spec.ts`: back navigation during a transition, no console errors.
- `e2e/constructor.spec.ts`: `fit.width` → fix → save (updating the sample after the question) →
  export with comments; conflict; draft; `/constructor` shows a chooser; the save question can be
  cancelled; "Save as new hall" leaves the sample unchanged.
- `e2e/api.spec.ts`: route limits, malformed bodies, conflicts, the purchase route.

## Licenses

The demo code and `data/orbita-hall-2.yaml` are distributed under 0BSD, like the rest of the
repository. The image `public/screen/dunes.svg` was recreated and is licensed under CC0. See
`CREDITS.md` for details.
