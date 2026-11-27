# Concept analysis

Analysis source: `Cinema_app_design_that_shows_you_the_view_from_your_seat_before.mp4`. It is a 26-second video, not a GIF, showing a 720×1562 vertical mobile screen. Frames were sampled once per second, so timings are approximate to about ±0.5 seconds. The video and extracted frames (`docs/concept/*.jpg`) are third-party reference materials outside the project’s 0BSD license and are excluded from the public repository; this document retains only the written analysis.

## 1. Scenario

| Time    | Screen            | Action                                                                                                                          |
| ------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0–1 s   | Hall map (`01`)   | No seat is selected. “Choose your seat” appears at the bottom, and Continue is disabled.                                        |
| 1–2 s   | Map (`02`)        | Tap B4: the seat turns mint, its number appears, and the bottom panel shows “Row B · Seat 4 / €12.50”; Continue becomes active. |
| 2–3 s   | Transition (`03`) | Tap Continue: the map zooms toward the selected seat while the other elements fade.                                             |
| 3–6 s   | 3D (`04`, `06`)   | The camera flies into the seat and stops at eye level. A seat details sheet slides up from the bottom.                          |
| 7–9 s   | —                 | “Change seat” returns to the map while preserving the selection.                                                                |
| 9–14 s  | —                 | Select F8, repeat the transition, and show the “Sweet spot” view (`05`).                                                        |
| 15–19 s | 3D                | A rear, elevated flyover shows the whole hall; the selected seat is highlighted in green (`04`).                                |
| 17–25 s | —                 | Select I12 (a recliner), show “Full picture” (`07`), then return to the map.                                                    |

## 2. Hall map (2D)

- **Header:** back button, cinema name, “Hall 3 · Fri 14 Nov”, and an info button.
- **Session switcher:** time and format segments such as `19:45 IMAX`; the active segment is light.
- **Screen:** a glowing arc with the letter-spaced `SCREEN` label.
- **Seat grid:**
  - 9 rows, A–I; row letters appear only on the left.
  - Three section columns with 3, 8, and 3 seats, separated by aisles. There is no cross aisle.
  - Rows H–I are recliners with a different seat type and price (€16 instead of €12.50).
  - Seat numbering **continues across sections**: B4 is the first seat in the center section, and I12 is the first seat in the right section.
- **Seat states:** `available` (filled), `taken` (outline only), `recliner` (burgundy fill), and `selected` (mint with a number and glow). Seat type and occupancy are independent: an occupied recliner uses a burgundy outline.
- **Legend:** below the grid.
- **Bottom panel:** selected seat, price, and Continue button.

## 3. View from the seat (3D)

- Full-screen 3D scene:
  - a screen with an image or video and a black surround;
  - stepped rows, visible in `04` and `07`;
  - red seats with armrests, side curtains, and pin lights on the ceiling;
  - the selected seat is green.
- **Top label:** “● View from F8” and a back button.
- **Bottom sheet:**
  - viewing-zone label: `UP CLOSE` / `SWEET SPOT` / `FULL PICTURE`;
  - row and seat, such as “Row F, Seat 8”, plus “Standard · €12.50”;
  - a mini hall map with the selected seat marked;
  - three metric cards: distance to the screen, viewing angle, and offset from center (left/right of centre);
  - `Change seat` and `Book · €12.50` buttons.
- **Transition:** the camera flies from a wide rear view to the viewer’s eye position in about 1–1.5 seconds with ease-in-out timing. The sheet slides in after the camera stops.
- **Missing from the concept but required by the specification:** avatars for occupied seats. In the video, occupied seats look empty in 3D.

### Metrics estimated from the frames

The screen is approximately 11.5 m wide. Viewing angle is the horizontal angle at which the screen is seen from the viewer’s eye position. The zone is determined by this angle.

| Seat | Concept estimate                          | Concept fixture (first row 4.95 m) | `docs/examples` sample (first row 6 m)    |
| ---- | ----------------------------------------- | ---------------------------------- | ----------------------------------------- |
| B4   | 6.3 m · 86° · 2.2 m left · Up close       | 6.7 m · 85° · 2.1 m left           | 7.6 m · 76° · 2.1 m left · Up close       |
| F8   | 9.8 m · 60° · 0.3 m right · Sweet spot    | 9.9 m · 61° · 0.3 m right          | 10.8 m · 56° · 0.3 m right · Sweet spot   |
| I12  | 13.3 m · 45° · 3.3 m right · Full picture | 13.5 m · 45° · 3.7 m right         | 14.5 m · 42° · 3.7 m right · Full picture |

The values are computed by `buildHallLayout` and `computeSeatView` (distance from the eye point to
the screen centre, horizontal angle, offset from the centre line). Two configs share the hall:

- the concept fixture, `packages/core/test/fixtures/meridian-hall-3.yaml`, keeps the geometry read
  from the video (first row 4.95 m from the screen, risers 0.15 m and 0.30 m). The unit tests check
  it against the concept estimates. It deliberately has warnings: `view.frontRowVertical` (44° at a
  40° threshold) and `view.sightline` for row C;
- the published sample, `docs/examples/meridian-hall-3.yaml`, moves the first row back to 6 m and
  raises the risers to 0.25 m and 0.35 m so that it passes every check with no warnings. Its seats are
  further from the screen, but each one stays in the same viewing zone as in the concept.

This suggests zone thresholds of ≥70° / ≥50° / otherwise, and the following sample dimensions:

- row spacing of about 0.95 m for standard seats and 1.15 m for recliners;
- seat pitch of 0.6 m;
- aisles of about 1 m.

## 4. Design tokens sampled from the frames

| Token                      | Color                              | Use                                                      |
| -------------------------- | ---------------------------------- | -------------------------------------------------------- |
| `bg`                       | `#0E0E12`                          | map background                                           |
| `surface`                  | `#151518`                          | bottom panel                                             |
| `surface-2`                | `#1E1E21`                          | session switcher and inactive button (`#1F1E23`)         |
| `seat-available`           | `#37363B`                          | available seats                                          |
| `seat-taken`               | `#37363B` outline, background fill | occupied seats                                           |
| `seat-recliner`            | `#5C3E3C`                          | recliner seats                                           |
| `accent` / `seat-selected` | `#87D9B4` (button `#8AE0BE`)       | selected seat                                            |
| `on-accent`                | very dark, almost black            | text on mint button                                      |
| `inverse`                  | `#F5F4F1`                          | Book button and active session                           |
| `sheet`                    | `#170D10`, translucent             | 3D glass sheet with `backdrop-filter: blur`; no gradient |
| `card`                     | `#281F1F`                          | metric cards                                             |
| 3D seat                    | about `#A3160F` in light           | seat material                                            |
| Selected 3D seat           | about `#66AD72` in light           | selected-seat material                                   |

The map seats have about an 8 px radius; buttons and labels are pill-shaped; the sheet has about a 24 px radius. The font is a sans-serif such as SF or Inter. The demo loads Inter with `next/font`; the library does not set a font and inherits it from the host.

## 5. Implementation conclusions

1. **Render the hall map in 2D (SVG/DOM), not three.js.** This supports accessibility, keyboard input, crisp text, and efficient rendering. Use three.js only for the seat view and constructor preview.
2. **Use a computed model:** config → coordinates for every seat. The map, 3D scene, and metrics all use this model. It is the library core and has no React or three.js dependency.
3. **Keep seat type and occupancy separate.** Type and geometry come from YAML. Occupancy, avatars, and prices come from session data and are runtime props.
4. **Represent the section structure as bands and sections:**
   - sections form columns within a band;
   - bands arrange section rows along the hall depth;
   - row labels and seat numbering continue across the configured layout.

   This is sufficient to describe the concept without exceptions.

5. **Let avatars occlude the view.** Head height varies slightly so occupied seats can block the screen, which is central to the seat-view feature.
