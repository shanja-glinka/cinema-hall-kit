# Cinema Hall Kit

Build cinema hall layouts and seat-booking experiences for React applications. This pnpm workspace
contains two reusable TypeScript packages and a Next.js demo with an in-memory mock backend.

**Live demo:** [Open Cinema Hall Kit](https://cinema-hall-kit.freemyip.com)

## Install in your project

```sh
npm install @cinema-hall/react @cinema-hall/core react react-dom three @react-three/fiber motion
```

For a framework-free backend or CLI, install only `@cinema-hall/core`.
Import `@cinema-hall/react/styles.css` once in your application and connect booking callbacks to your own backend.
The published kit does not require the Next.js demo.

Published packages: [core on npm](https://www.npmjs.com/package/@cinema-hall/core) and
[React on npm](https://www.npmjs.com/package/@cinema-hall/react).

## Clone and run

Requirements: Node.js 22 or newer, Git, and Corepack. The repository pins pnpm 10.18.3.

```sh
git clone https://github.com/shanja-glinka/cinema-hall-kit.git
cd cinema-hall-kit
corepack enable
corepack prepare pnpm@10.18.3 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm --filter demo dev
```

Open <http://localhost:3000>. The demo provides:

- `/` — home page and hall list
- `/constructor` — hall constructor
- `/sessions/sat-1610` — seat picker for the 16:10 session (other sample sessions include 18:40 LUX and 21:20)

The demo backend stores data in process memory and reseeds the sample halls when the server starts. It is intended for exploration, not production bookings.

## Packages

- [`@cinema-hall/core`](packages/core): framework-free TypeScript for hall configuration, YAML and JSON parsing, validation, seat layout, view metrics, selection rules, seat manifests, and a CLI. It runs in browsers, Node.js, and server environments.
- [`@cinema-hall/react`](packages/react): React components including `HallConstructor`, `SeatPicker`, `SeatMap`, and `SeatView` (three.js / React Three Fiber), plus theme and label providers and headless hooks.
- [`apps/demo`](apps/demo): a Next.js 16 App Router example that consumes the packages through their public exports.

## Minimal integration

```tsx
'use client';
import { CinemaHallProvider, SeatPicker, labels } from '@cinema-hall/react';
import '@cinema-hall/react/styles.css';

<CinemaHallProvider locale="en-US" labels={labels.en}>
  <SeatPicker
    config={hallConfig} // parsed on the server with parseHallConfig(yaml) from @cinema-hall/core
    occupancy={occupancy} // session occupancy from your backend
    onBook={(keys, ctx) => holdSeats(sessionId, keys, ctx)}
  />
</CinemaHallProvider>;
```

Prices are plain numbers in the hall config (for example, `pricing.tiers.standard: 450`), without a currency. They display with the neutral `¤` sign; a session can override any tier.

## Documentation

- [API reference](docs/api.md): public APIs, customization, integration, and backend contract.
- [Requirements](docs/requirements.md): product behavior and acceptance criteria.
- [API decisions](docs/api-decisions.md): recorded API review decisions.
- [Concept analysis](docs/concept-analysis.md): the design analysis behind the example.
- [Sample hall configuration](docs/examples/meridian-hall-3.yaml): a commented YAML example.
- [Deployment notes](docs/deployment.md): demo hosting requirements and limitations.
- [Contributor guide](CONTRIBUTING.md), [agent guidance](AGENTS.md), and the [AI/search index](llms.txt).

## Workspace commands

| Command               | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `pnpm build`          | Build core, React, and the demo.                          |
| `pnpm test`           | Run package unit tests with Vitest.                       |
| `pnpm typecheck`      | Type-check the packages and demo.                         |
| `pnpm lint`           | Run ESLint and the no-gradients check.                    |
| `pnpm e2e`            | Run the Playwright demo scenarios.                        |
| `pnpm check:publish`  | Check package metadata and exports with publint and attw. |
| `pnpm check:licenses` | Check production dependency licenses.                     |

The Playwright suite needs Chromium. Install it once with `pnpm --filter demo exec playwright install chromium`.

## License

Project code and documentation use [0BSD](LICENSE). See [NOTICE.md](NOTICE.md) and
[demo asset credits](apps/demo/CREDITS.md) for third-party asset and dependency license details.
