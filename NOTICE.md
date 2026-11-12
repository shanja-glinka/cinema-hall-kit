# License and notices

## Project code and documentation: 0BSD

All project code (`packages/*`, `apps/*`), configuration, and documentation are distributed under **0BSD** (see [`LICENSE`](./LICENSE)). You may:

- use the project commercially or non-commercially;
- copy, modify, embed, and resell it;
- relicense it.

You do not need to provide attribution, retain a copyright notice, or disclose your source code. Each published package includes the same `LICENSE` file and declares `"license": "0BSD"` in `package.json`.

Why 0BSD instead of MIT or Unlicense:

- MIT requires retaining a copyright notice; 0BSD does not.
- Unlicense relies on a public-domain dedication, which may not work in every jurisdiction.
- 0BSD is OSI-approved and recognized by common license scanners.

## Materials not covered by 0BSD

| Path                                                                                        | Reason                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Cinema_app_design_that_shows_you_the_view_from_your_seat_before.mp4`, `docs/concept/*.jpg` | Third-party design concept and extracted frames. They are outside the project license and excluded from the public repository and packages; do not include them in the demo without separate permission. |
| Media in `apps/demo/public`                                                                 | Use only original work, CC0 assets, or assets with an explicit free license. Record the source in the adjacent `CREDITS.md` file.                                                                        |

## Dependencies

The packages' public dependencies use permissive licenses compatible with 0BSD:

| Package              | License |
| -------------------- | ------- |
| `zod`                | MIT     |
| `yaml`               | ISC     |
| `@noble/hashes`      | MIT     |
| `react`, `react-dom` | MIT     |
| `three`              | MIT     |
| `@react-three/fiber` | MIT     |
| `motion`             | MIT     |
| `react-modal-sheet`  | MIT     |

Those licenses continue to apply to their respective code. New dependencies must use MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, or 0BSD. Check them from the repository root with `pnpm check:licenses`.
