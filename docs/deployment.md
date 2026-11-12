# Demo deployment notes

The Next.js app in `apps/demo` is an interactive example, not a production booking service. Its
server stores halls, hall versions, sessions, holds, and bookings in process memory. A server
restart reseeds the sample data and clears changes made through the demo. The app has no durable
database, account system, or production booking integration.

## Build and start

Use a Node.js 22 or newer environment with Corepack and the repository's pinned pnpm version. Build
from the repository root so the workspace packages exist in `dist` before Next.js builds the demo:

```sh
corepack enable
corepack prepare pnpm@10.18.3 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm --filter demo start
```

`next start` listens on port 3000 by default; set `PORT` in the process environment when the host
requires a different port. The demo has no project-specific environment variables.

## Hosting considerations

The demo URL is <https://cinema-hall-kit.freemyip.com>. Its free hostname is provided by
[freemyip.com](https://freemyip.com), which requires an annual refresh to keep the hostname active.

For a public showcase, use a Node.js host that can build the entire monorepo and run the demo as a
single long-lived server process. The in-memory mock means that multiple instances do not share
state and restarts discard user changes. Use a separate persistent backend and appropriate booking
and account controls before adapting the example for real bookings.

Package publication is a separate step from demo deployment. Check package metadata and contents
from the repository root with `pnpm check:publish` and `pnpm check:licenses`.
