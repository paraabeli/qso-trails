# Repository map

## Root runtime files

The application is intentionally a small CommonJS service without a `src/` build tree. Root-level JavaScript files are referenced directly by npm startup scripts and the Dockerfile.

- `server.js` — main Express server and application behavior.
- `privacy-guard.js` — final public-output privacy boundary.
- `network-guard.js` — outbound Wavelog and trusted-proxy boundary.
- `privacy-defaults.js` — persisted privacy defaults and response shaping.
- `lotw-feature.js` — LoTW confirmation and filtering integration.
- `static-publish.js` — static PNG endpoint and bounded cache.
- `static-render.js` — PNG/map renderer.
- `qso-helpers.js` — shared pure QSO coordinate, timing, distance, and public-field helpers.
- `package.json` — scripts, Node version, and dependencies.
- `Dockerfile` — production container build.
- `compose.prod.yaml` — Internet-facing production stack.
- `compose.dev.yaml` — loopback-only local stack.
- `compose.yaml` — compatibility stack for existing deployments.

Do not move the preload files casually: their paths and order are part of the privacy design.

## Browser code

`public/` contains the files served to browsers:

- `admin.js` — authenticated Admin UI behavior.
- `admin-privacy.js` — station-name and privacy controls.
- `admin-lotw.js` — LoTW Admin controls.
- `admin-publish.js` — embed/static presentation controls.
- `embed-extras.js` and `embed-lotw.js` — public embed presentation behavior.
- `globe.js` — interactive public map.
- `dom-safety.js` — compatibility guard for legacy dynamic option construction.
- `admin.html` and `embed.html` — browser entry documents.
- `style.css` — shared styling.

Browser code must treat server responses as already privacy-filtered and must not be given raw QSO/configuration data.

## Tests

`test/` contains executable Node regression checks:

- `privacy-regression.js` — sentinel-field removal, public counts, and fail-closed LoTW behavior.
- `network-guard.js` — restricted IPs, trusted-proxy settings, request pinning, and confirmation caps.
- `privacy-defaults.js` — privacy-safe settings and snapshot defaults.
- `qso-helpers.js` — pure coordinate, time, distance, and public-field shaping behavior.

The test files are run by `npm run check`.

## Data and documentation

- `data/.gitkeep` — keeps the runtime data directory present; real runtime files are not source.
- `docs/` — deployment, architecture, development, feature, network, and security documentation.
- `.github/workflows/security.yml` — CI/security checks.
- `.env*.example` — safe configuration templates only.

Never commit actual environment files, tokens, QSO stores, snapshots, or other runtime data.
