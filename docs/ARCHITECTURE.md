# QSO Trails architecture

## Runtime composition

Startup preloads intentionally apply in this order:

```text
privacy-guard.js
network-guard.js
privacy-defaults.js
static-publish.js
static-theme-pack.js
server.js
```

`static-publish.js` installs the LoTW feature layer. `static-theme-pack.js` adds extra static themes and imports the bounded Earth-texture service; it does not widen the public snapshot.

## Data flow

```text
Wavelog API / ADIF
       |
       v
private data/qsos.json + settings
       |
normalization / band-mode selection / coordinate rounding
       |
LoTW-aware snapshot transform
       |
fail-closed privacy guard + atomic write
       |
private data/public-snapshot.json
       |
       +--> /api/public
       +--> /embed
       +--> /static/qrz.png
```

Public renderers consume only the sanitized snapshot. Raw QSOs and Wavelog credentials remain server-side.

## Main modules

- `server.js` — Express routes, settings, Wavelog/ADIF import and base snapshot logic.
- `qso-helpers.js` — pure shared QSO helpers.
- `network-guard.js` — trusted-proxy and Wavelog network/SSRF/resource controls.
- `privacy-defaults.js` — opt-in station-name/DXCC privacy defaults.
- `lotw-feature.js` — LoTW confirmation state/filtering/count integration.
- `privacy-guard.js` — final public sanitization, fail-closed checks, no-store and static rate limiting.
- `static-publish.js` / `static-render.js` — core static image publication/rendering.
- `static-theme-pack.js` — expanded static themes and local Earth-texture blending.
- `earth-texture.js` / `png-codec.js` — bounded NASA image fetch/cache/PNG handling.
- `public/theme-pack.js` / `public/admin-theme-pack.js` — extra embed/Admin theme UI.
- `public/` — browser code; no direct access to private data/Wavelog credentials.
- `test/` — privacy, network, helper, default and PNG regression tests.

## Earth imagery boundary

The optional Earth theme performs one server-side fetch to a fixed NASA Visible Earth source when no valid local cache exists. The response is time/size/pixel bounded, redirects are rejected, PNG data is validated/downsampled, and the result is stored privately. Browsers receive the cached image from the QSO Trails origin only.

## Privacy invariants

1. Browser code never receives the raw QSO store or Wavelog token.
2. Public fields are selected server-side; URL presentation flags are not permissions.
3. Internal IDs/source fields/LoTW timestamps/private DXCC fields are stripped.
4. LoTW-confirmed-only policy fails closed and cannot broaden to all QSOs on transform failure.
5. Rejected snapshot writes preserve the previous known-good atomic snapshot.
6. `/api/public` and `/static/qrz.png` remain `no-store`.
7. Themes may change presentation/background only; they do not widen public data.

Operational topology/logging is in `OPERATIONS.md`; security policy is in root `SECURITY.md`; change/test guidance is in `DEVELOPMENT.md`.
