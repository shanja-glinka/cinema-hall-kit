# Contributing

## Requirements and setup

- Node.js 22 or newer
- Git
- Corepack, which selects the workspace's pinned pnpm 10.18.3

Clone the published GitHub repository and install exactly from the lockfile:

```sh
git clone https://github.com/shanja-glinka/cinema-hall-kit.git
cd cinema-hall-kit
corepack enable
corepack prepare pnpm@10.18.3 --activate
pnpm install --frozen-lockfile
```

The repository is a pnpm workspace. `packages/core` is framework-free,
`packages/react` depends on core, and `apps/demo` consumes both packages through their public build
outputs. Build before starting the demo:

```sh
pnpm build
pnpm --filter demo dev
```

Open <http://localhost:3000>. The demo stores halls, sessions, and holds in process memory, and
recreates its sample data when its server starts. It does not require environment variables or an
external database.

## Checks

Run these from the repository root:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm check:publish
pnpm check:licenses
```

The Playwright suite runs the demo against a local production build and needs Chromium. Install it
once, then run the suite:

```sh
pnpm --filter demo exec playwright install chromium
pnpm e2e
```

The configured browser uses SwiftShader for WebGL. E2E screenshots and reports are generated under
`apps/demo/test-results/` and `apps/demo/playwright-report/`; these are local artifacts.

## Project map

- `packages/core/src/`: configuration parsing, validation, layout, metrics, manifests, and selection.
- `packages/core/test/`: core unit tests and fixtures.
- `packages/react/src/`: React components, hooks, scene, styles, and transitions.
- `packages/react/test/`: component and behavior tests.
- `apps/demo/`: Next.js example, mock backend, and browser tests. Read its `README.md` and `AGENTS.md`.
- `docs/api.md`: public API and integration reference.
- `docs/examples/`: sample hall configurations.

Keep changes focused, preserve public package exports, and update the relevant tests and docs when
changing behavior. Use Prettier conventions and ESLint rules already configured in the repository.

## Package release notes

Only `@cinema-hall/core` and `@cinema-hall/react` are npm packages. The demo is a private workspace
app. Before preparing package releases, run `pnpm check:publish` and `pnpm check:licenses`; package
versions and changelogs are managed with Changesets. Do not publish the demo as a package.

## Licensing

Project source and documentation are under [0BSD](LICENSE). Check [NOTICE.md](NOTICE.md) and
[`apps/demo/CREDITS.md`](apps/demo/CREDITS.md) before changing or adding assets or dependencies.
The concept video and extracted screenshots are reference-only materials outside the project
license; they are excluded from the repository by `.gitignore`.
