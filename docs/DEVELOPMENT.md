# QSO Trails development

## Requirements and commands

- Node.js `>=22`
- tracked npm lockfile
- Docker/Compose for production validation

```bash
npm ci --ignore-scripts
npm run check
npm run audit:prod
npm start       # normal runtime
npm run dev     # watch mode
```

`npm run check` syntax-checks server/preload/browser/test modules and runs pure/helper, PNG codec, privacy, network and privacy-default regression tests.

## Repository map

```text
server.js                    core Express/application behavior
qso-helpers.js               pure shared QSO helpers
privacy-guard.js             final public boundary
network-guard.js             proxy + Wavelog network controls
privacy-defaults.js          opt-in public metadata defaults
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
SECURITY.md                  security policy
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

There is no separate TypeScript/bundler/linter layer; keep modules understandable and tests focused.
