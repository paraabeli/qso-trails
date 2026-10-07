# AGENTS.md

Project rules for anyone (human or agent) changing QSO Trails. These are
contracts, not suggestions; the test suite enforces most of them.

## Non-negotiable contracts

- **Preload order is a contract.** The privacy boundary is installed by
  `--require` preloads in `package.json` (`start` and `dev`). Never reorder,
  remove or add a preload without updating `docs/PRELOAD_CONTRACT.md` and
  `test/preload-order.js` in the same change. `npm run check` fails on drift.
- **One public field allowlist.** Which QSO fields may be public is defined only
  in `qso-helpers.publicQsoFields`. Both the builder (`sanitizePublicQso`) and
  the fail-closed guard (`privacy-guard.hardenQso`) derive from it. Do not add a
  second field list.
- **The public snapshot is published explicitly.** `server.js#rebuildPublicSnapshot`
  builds via `snapshot.js`, then `snapshot.js#publishPublicSnapshot` runs
  `hardenPublicSnapshot` exactly once and writes with `nativeWriteFile`. Never
  route a normal snapshot write through the `fs.writeFile` patches (they are a
  last-resort backstop only) and never run the guard twice.
- **Fail closed.** A rejected snapshot write must preserve the previous
  known-good file. `test/lotw-failclosed.js` covers this.
- **`data/` is private runtime state.** Resolve its path only through
  `data-dir.js`. Tests must isolate it with `QSO_TRAILS_DATA_DIR` and must never
  read or rewrite an operator's real data.
- **New runtime module → add it to the `Dockerfile` COPY list.** The image lists
  each module explicitly; a missing entry only fails at container start.
  `test/dockerfile-copies.js` enforces that every local `require()` reachable
  from `server.js` and the preloads is copied.
- **COPY order matters for build-time steps.** A module must be copied *before*
  the `RUN` step that needs it, not merely somewhere in the file. The Earth-seed
  layer runs `scripts/build-earth-texture.js` (whose require graph now includes
  `data-dir.js`); CI builds with `QSO_TRAILS_SKIP_EARTH_BUILD=1` so it never
  exercises that step. `test/dockerfile-copies.js` therefore walks the
  build-time entrypoints too and asserts layer ordering, not just a flat set.

## Security-sensitive changes

- Keep the Wavelog HTTPS/private-address/redirect/DNS-pinning/size/record
  protections in `network-guard.js` intact.
- Public renderers consume only `data/public-snapshot.json`, never raw QSOs.
- Theme/background changes must not widen the public payload.
- Admin mutations require the CSRF check; Admin routes require
  `ADMIN_ALLOWED_IPS` under the production policy.
- Never commit `.env*`, runtime data, cached Earth imagery, certificates or keys.

## Workflow

- **Todo-driven, small slices.** Keep work in small, independently testable
  slices; run the relevant gate after each.
- **Evidence over assertion.** A change is done when a command proves it. Do not
  claim a PASS you did not run.
- **Stage by exact path.** `git add <path>` per file; never `git add -A`.
  Do not push, tag or release without explicit authorization.
- **Record non-blocking findings** in `non-blocking-todo.md` rather than leaving
  them in review comments or silently fixing unrelated things.

## Commands

```bash
npm ci --ignore-scripts
npm run check:syntax        # node --check every source/test file
npm run check:unit          # pure/helper regression tests (no server)
npm run check:assets        # asset cache-bust consistency
npm run check:integration   # boots the real server, drives HTTP
npm run check               # all of the above
npm run audit:prod
```

Node `>=24` (see `.nvmrc`; Docker and CI pin 24.19.0).

## Deliberate style decisions

- **No linter/formatter.** The dense, dependency-free module style is
  intentional (see `docs/DEVELOPMENT.md`). Do not introduce a bundler, a second
  module system, or a formatter gate without a migration plan; keep modules
  understandable and tests focused.
- CommonJS, semicolon-terminated, consistent with existing files.
