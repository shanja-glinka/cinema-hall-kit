---
'@cinema-hall/core': minor
---

Multi-level halls (balconies), new validation rules, and templates that open clean and come with
prices.

**New: multi-level halls**

- Bands accept `label`, `startDistance` and `elevation`, so a balcony can hang over the rear
  stalls. A band raised over a lower band of another run is on level 1 (`overhang: true`) whatever
  its position in the config.
- `buildHallLayout` reports `bands` (`BandBox`: level, depth range, floor heights, `overhang`), a
  `level` on every seat, row and section box, `SectionBox.floorElevation`, and the
  `balconySlabThickness` / `balconyParapetHeight` it was built with. It returns the new
  `BuiltHallLayout` (`BuiltSeat`, `BuiltRow`, `BuiltSectionBox`), where all of these are set.
- `buildHallLayout(config, { constraints, enforce })` (`BuildLayoutOptions`, `ConstraintOptions`)
  takes the same constraint options as `validateHall`, so the drawn balcony sizes match the checked
  ones. The one-argument form still works, including `configs.map(buildHallLayout)`.
- `balconySlabSteps(layout)` returns the floor slab of every balcony as the 3D view draws it, and
  `BALCONY_PARAPET_THICKNESS` (0.12 m) the depth of its front wall.
- New constraints `minOverhangClearance`, `balconySlabThickness` (default 0.3 m) and
  `balconyParapetHeight` (default 0.8 m). `ResolvedConstraints` is the type with every threshold
  set, used by `DEFAULT_CONSTRAINTS`, `resolveConstraints` and the rule context.
- `resolveRuleContext(ctx)` (`ResolvedRuleContext`) completes a rule context with the built layout
  fields and every threshold, as the built-in rules use it.
- `suggestId(label, taken, fallback)` makes a readable, unused id from a name.

**Validation rules**

- `layout.bandOverlap` (error) reports seats that would share a place: seats under a balcony
  without enough clearance below its whole floor slab, two bands on the same level that overlap in
  plan, and a band placed so close to the one before it (with `gapBefore` or `startDistance`) that
  their seats overlap. It compares seat bodies (the seat type's width and depth), not seat centres,
  and stays fast on large multi-level halls.
- `view.overhang` (warning) reports rows under a balcony whose view of the top of the screen is
  hidden by its floor slab.
- `view.sightline` compares seats on the same level only and treats the front wall of every balcony
  in front of a balcony seat as an obstacle, over the wall's full depth. Only balconies (level 1 and
  up) get a front wall.
- `view.firstRowTooClose` and `view.frontRowVertical` measure the occupied row nearest the screen,
  at its own floor, and point at the field that positions it.
- Issue texts name the section or band they are about and use row labels (new `section`, `band`
  and `rowLabel` params). `fit.depth` suggests the fix and carries the band's `ref`;
  `fit.headroom` names the band of the highest seat and points at the hall height.

**Templates**

- New `balcony` template ("Two levels: stalls + balcony", 240 seats).
- `threeSections`, `single`, `stadium` and `balcony` open with no errors and no warnings; seat
  counts are unchanged. Templates with a `rows` option raise `hall.height` when the back row needs
  it.
- Every template sets `pricing.tiers` for each seat type it uses (`templatePrices`), so a hall made
  from a template can be booked right away, and every band has a label.
- Templates and `HallTemplate.create` accept `TemplateOptions`
  (`{ texts?: { names?, seatTypes?, bands? } }`) to replace the hall name and the seat type and band
  labels; ids stay the same. The English texts are exported as `templateTexts`.

**Compatibility**

- Configs without the new band fields lay out exactly as before.
- Hand-built layouts keep type-checking: the level and balcony fields are optional on `HallLayout`,
  the new thresholds are optional on `Constraints`, and `ValidationRuleContext` keeps its wider
  types, so custom rules and direct calls of `defaultRules` compile unchanged.
- `resolveRuleContext` reads a hand-built context again on every call, so a rule sees changes made
  to a reused context.
