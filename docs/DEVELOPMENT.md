# Development guide

## Requirements

- Node.js `>=22.0.0`
- npm with the tracked `package-lock.json`
- Docker is needed only for Compose/image validation

## Install

```bash
npm ci --ignore-scripts
```

The install is lockfile-based and does not run dependency lifecycle scripts.

## Local commands

```bash
npm run check
npm run audit:prod
npm start
npm run dev
```

`npm run check` is the default acceptance command. It runs Node syntax checks for the server, preload layers, browser modules, and tests, followed by:

- privacy regression tests;
- network guard regression tests;
- privacy-default regression tests.

`npm run audit:prod` checks production dependencies for high-severity vulnerabilities.

There is currently no separate formatter, linter, TypeScript compiler, or bundler configured in `package.json`.

## Docker modes

Production:

```bash
docker compose \
  --env-file .env.production \
  -f compose.prod.yaml \
  up -d --build
```

Local development:

```bash
docker compose \
  --env-file .env.development \
  -f compose.dev.yaml \
  up -d --build
```

The development stack binds the application to `127.0.0.1:3000`. The production stack exposes the public service through Caddy and does not publish the application port directly.

## Safe change checklist

Before changing runtime code:

1. Read `docs/ARCHITECTURE.md` and the relevant security document.
2. Preserve the preload order in `package.json`.
3. Keep public rendering based on `data/public-snapshot.json`, not raw QSO data.
4. Add or update a focused regression test before changing behavior.
5. Run `npm run check` after each focused change.
6. Run `npm run audit:prod` for dependency changes.
7. Inspect `git diff --check` and confirm no `.env*` files or runtime data were added.

Do not treat a presentation option such as `name=0` or `stats=0` as a server-side privacy permission.

## CI reference

The complete CI/security workflow is `.github/workflows/security.yml`. It additionally validates Compose files, Docker behavior, endpoint headers, asset blocking, and static PNG output.
