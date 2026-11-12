# Guidance for coding agents

Before changing code, read [`CONTRIBUTING.md`](CONTRIBUTING.md) and the README for the package or
app you are changing. For work in `apps/demo`, also follow [`apps/demo/AGENTS.md`](apps/demo/AGENTS.md).

- Preserve the public exports and runtime behavior unless the task explicitly changes them.
- Add or update tests and public API documentation when behavior or a public API changes.
- Build the workspace packages before running the demo; the demo imports their built `dist` exports.
- Keep generated output, local credentials, and reference-only material out of source changes.
- The demo backend is in-memory mock data. Do not describe it as durable booking or production storage.
- Preserve the root 0BSD license and the third-party asset and dependency notices.

Use the repository's pinned Node.js and pnpm versions and run the checks listed in
[`CONTRIBUTING.md`](CONTRIBUTING.md) that apply to the change.
