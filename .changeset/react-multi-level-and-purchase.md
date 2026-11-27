---
'@cinema-hall/react': minor
---

Multi-level halls in the constructor, the seat map and the 3D views; an optional purchase step in
the seat picker; and a clearer, more forgiving hall constructor.

**New: multi-level halls**

- The band panel has an "Upper level (balcony)" switch that suggests where the band starts and how
  high its floor is, using the same slab and seat checks as validation. Band name, start distance
  and floor height are editable.
- The plan draws upper levels over the floor below with a level badge and a level filter; "All
  levels" dims the floor under a balcony and shows a solid/dashed legend.
- The 3D scene draws each balcony as a second floor: a stepped slab from core's
  `balconySlabSteps`, risers, a front wall and columns, with the slab thickness and wall sizes the
  checks used. Rows under a balcony stay visible, and the booking overview of a hall with balconies
  stands in front of the nearest balcony.
- The seat map shows each level as its own block and grid.
- New optional `layoutOptions` prop on `SeatPicker` / `SeatPickerRoot`, passed to
  `buildHallLayout` (for example `{ enforce: true, constraints }`), so the booking view draws
  balconies with the sizes the server checked. The constructor builds its layouts with the editor's
  `constraints`.

**Hall constructor**

- New bands are valid and readable: `bands.add` picks the first seat type and the seats and rows
  that fit, with ids `band-N` / `band-N-section-1`. `bands.add({ growHall: true })` makes the hall
  deeper when needed. `sections.add` numbers sections within their band.
- Seat types get an id from their name (core `suggestId`) that follows the name until saved. The id
  is editable as "Short code" under "Advanced"; `seatTypes.rename(id, nextId)` moves sections, band
  defaults and the price tier with the type. Colours are stored in upper case.
- Toolbar: a stable "Unsaved changes" / "All changes saved" state, "Save · 1 error" wording, a
  neutral "Imported" notice, and the full hall name as a tooltip. A changed field says "Changed —
  not saved yet" until the change is saved, undone, or replaced by the server version.
- One-click fixes for seats that need a deeper or wider hall ("Make the hall 16.25 m deep"); the
  offered size always clears the error and never exceeds the largest hall size.
- The issue list names the band and section of each issue. New optional `Labels.issues` catalog
  (`IssueMessages`) for issue texts; decimals follow `locale`.
- Inspector hints for inherited section values, the default band gap and aisles; the plan names
  sections in words (balcony, stalls, lounge, left/right) instead of raw ids, keeps text readable at
  "Fit hall", fits stacked band labels in view, and draws touching sections touching.
- The 3D preview has a work light, opens on an elevated cutaway of the whole hall, lets the camera
  leave the hall to look in, and grows its far plane with the hall.
- `editor.importText(text, opts?)` takes `ImportTextOptions` (`{ maxBytes, format }`) to open a
  stored document larger than the upload limit. `notify(message, tone?)` accepts `'info'`.

**Seat picker**

- New optional `onConfirm(keys, ctx)` prop: a reservation shows "Confirm purchase" and ends in
  "Purchased · ticket № …". `useSeatPicker()` adds `purchase` and `confirm()`. `ctx.booking` is the
  `onBook` data of the single active reservation that covers every confirmed seat, judged on the
  server clock; otherwise it is `undefined`. In `multiple` mode a later purchase covers only the
  seats not bought yet, the purchase line names the latest ticket (`purchase.ticket`) and lists all
  of them (`purchase.tickets`).
- Taken, held, unavailable and your own seats differ by shape as well as colour (crossed out,
  dashed, check mark), so states never rely on colour alone; available seats use their seat type colour; the legend lists seat types with prices
  and the seat states. Own holds read "Your seats" (`SeatMap` `isMine`) and can be selected again
  after being deselected (`isReselectable`).
- Reservation wording: "Seats reserved" and "Seats reserved for 09:59", with "Complete the purchase
  before the timer ends." only when the picker offers the purchase step.
- Refusals from `onBook` and `onConfirm` show the host's `message`, falling back to the generic
  text.
- Touch: each seat's tap area is its whole footprint, and on touch screens the map keeps seats at
  least `minSeatSize` (default 32 px) wide and scrolls instead. A rail of row letters stays in view
  while a wide map scrolls sideways. Section boundaries without an aisle get a thin divider.
- New optional `picker.defaultZones` labels name the default viewing zones.

**Compatibility**

- Every label key added in this release is optional in `EditorLabels` and `PickerLabels` and falls
  back to English, so complete label catalogs written for the first release keep compiling.
- `SeatTypesApi.rename` is optional: without it the constructor edits only a seat type's label and
  shows its code read-only.
- Hand-built layouts without `bands` render in the constructor plan.

**Fixes**

- An occupancy snapshot that arrives while `onConfirm` runs no longer drops the seats being bought.
- A purchase refusal that arrives late, or for seats no longer selected, no longer blocks buying a
  different active hold; one for seats still unpaid is shown.
- The total of a completed purchase keeps the prices the viewer confirmed.
- On a scrollable mobile map, the Preview zoom starts from where the seat is after panning.
- A seat map taller than its area no longer hides its top rows on desktop.
- The constructor's canvas footer keeps its buttons on one row.
