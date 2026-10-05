# QSO Trails development

## Requirements and commands

- Node.js `>=24` (see `.nvmrc`; Docker/CI pin 24.19.0)
- tracked npm lockfile
- Docker/Compose for production validation

```bash
npm ci --ignore-scripts
npm run check:syntax        # node --check every source/test file
npm run check:unit          # pure/helper regression tests
npm run check:assets        # asset cache-bust consistency
npm run check:integration   # boots the real server and drives HTTP
npm run check               # all of the above
npm run audit:prod
npm start                   # normal runtime
npm run dev                 # watch mode
```

`npm run check` runs the four gates in order. `check:integration` spawns the real
server through the `--require` preloads with an isolated `QSO_TRAILS_DATA_DIR`, so
it never touches local data.

## Repository map

```text
server.js                    core Express/application behavior + explicit publish pipeline
data-dir.js                  single source of truth for the private data directory
snapshot.js                  public-snapshot build + explicit publication pipeline
qso-helpers.js               pure shared QSO helpers + public field allowlist
privacy-guard.js             final public boundary (fail-closed)
network-guard.js             proxy + Wavelog network controls
privacy-defaults.js          opt-in public metadata defaults
auth-failures.js             bounded admin failed-auth tracker
lotw-feature.js              LoTW confirmation integration
static-render.js             core dependency-free PNG/map renderer
static-publish.js            core static route/publish layer
static-theme-pack.js         additional static themes / Earth blending
earth-texture.js             bounded NASA cache service
png-codec.js                 bounded dependency-free PNG codec
public/                      Admin/embed browser modules
test/                        Node regression tests
compose.prod.yaml            standalone Internet production
compose.dev.yaml             loopback-only local development
compose.external-edge.yaml   existing external edge deployment
compose.yaml                 compatibility production stack
Caddyfile.prod               standalone minimal/30-day access logging
infra/, scripts/             external-edge helpers/examples/systemd
docs/OPERATIONS.md           canonical operator manual
docs/ARCHITECTURE.md         runtime/privacy architecture
docs/PRELOAD_CONTRACT.md     preload load-order contract + publish pipeline
SECURITY.md                  security policy
AGENTS.md                    project contracts for changes
```

## Safe change checklist

1. Read `ARCHITECTURE.md` plus the relevant section of `OPERATIONS.md`/`SECURITY.md`.
2. Preserve preload ordering unless intentionally redesigning the protection layers.
3. Keep public renderers based on `data/public-snapshot.json`, never raw QSO data.
4. Theme/background changes must not widen the public payload.
5. Add/update a focused regression test for behavioral changes.
6. Run `npm run check` and `npm run audit:prod`.
7. Validate affected Compose/Caddy configuration.
8. Confirm no `.env*`, runtime data, cached Earth image, certificate or key is staged.

## Docker validation

```bash
docker compose --env-file .env.production -f compose.prod.yaml config
docker compose --env-file .env.development -f compose.dev.yaml config
docker compose --env-file .env.external-edge -f compose.external-edge.yaml config
```

Production must never publish app port 3000; development must bind only host loopback.

## CI

`.github/workflows/security.yml` is the completion gate. It validates dependencies, JavaScript tests, Compose topology, Caddy configuration, production image/start, public privacy headers/assets, and static theme PNG output.

There is no separate TypeScript/bundler/linter layer; keep modules understandable and tests focused. This is deliberate (see `AGENTS.md`). Preload order and the public field allowlist are contracts enforced by `test/preload-order.js` and `test/public-fields.js`.
