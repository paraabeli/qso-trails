# QSO Trails preload contract

The privacy boundary is installed by Node `--require` preloads before `server.js`
runs. Their **order is a load-order contract, not an implementation detail**:
each layer captures the current `express.application.*`, `fs.*` and `global.fetch`
references and wraps them, so a layer installed earlier ends up *inside* a layer
installed later. `test/preload-order.js` fails the build if the order in
`package.json` (`start` / `dev`) drifts from the order below or from this
document.

## Install order

```text
1. privacy-guard.js      fail-closed public boundary (fs.writeFile, express get/use)
2. network-guard.js      trusted proxy + Wavelog SSRF controls (express.set, fetch)
3. privacy-defaults.js   opt-in metadata defaults (fs.writeFile, express get/post)
4. static-publish.js     static image publication (express.listen, fs.readFile*)
                         └─ requires lotw-feature.js and installs it
5. static-theme-pack.js  extra static themes + Earth blending (express.listen)
6. admin-diagnostics.js  in-memory diagnostics (express.handle/listen, console.*)
7. server.js             the application
```

\* `static-publish.js` no longer wraps `fs.readFile`; see "Changelog" below.

`compose.*.yaml` sets `NODE_ENV=production` and `REQUIRE_ADMIN_ALLOWLIST=true`;
`privacy-guard.js` refuses to start under that policy without `ADMIN_ALLOWED_IPS`.

## What each preload owns

| Preload | Wraps | Responsibility |
| --- | --- | --- |
| `privacy-guard.js` | `fs.writeFile`, `express.application.get/use` | Final fail-closed sanitization of `data/public-snapshot.json`, `no-store` + rate limits for `/api/public` and `/static/qrz.png`, hidden `/assets/*.html`, `no-store` for admin JS. Exports `hardenPublicSnapshot` and the native `nativeWriteFile`. |
| `network-guard.js` | `express.application.set`, `global.fetch` | Forces `trust proxy` from `TRUST_PROXY`; pins Wavelog API fetches to a validated DNS answer, rejects redirects/private hosts, caps response size and confirmation records. |
| `privacy-defaults.js` | `fs.writeFile`, `express.application.get/post` | Persists `publishStationName`/`showDxccStats` defaults on every settings write; shapes the Admin state/exposure response. |
| `static-publish.js` | `express.application.listen` | Registers `/static/qrz.png` for the four core themes. |
| `lotw-feature.js` | `fs.writeFile`, `express.application.get/post`, `global.fetch` | LoTW confirmation state, filtering and counts; injects the LoTW admin/embed script; enriches QSO writes with confirmation state. |
| `static-theme-pack.js` | `express.application.listen` | Registers `/static/qrz.png` for the six extra themes (including `earth`). |
| `admin-diagnostics.js` | `express.application.handle/listen`, `console.*` | Bounded in-memory log ring; `/api/admin/diagnostics` (earth + LoTW health). |

`express.application.listen` is wrapped by several layers purely to register
routes at startup: each wrapper calls `this.get(...)` for its route and then
delegates to the next wrapper, so all routes are registered by the time the real
listener starts.

## The public-snapshot pipeline is explicit

Rebuilding the public snapshot is **not** routed through the `fs.writeFile`
patches. `server.js#rebuildPublicSnapshot()` performs the steps in order:

```text
getState()                         -> private qsos + settings
getLotwState()                     -> LoTW confirmations (lotw-feature.js)
buildPublicSnapshot({...})         -> snapshot.js (single owner of the build)
publishPublicSnapshot(payload)     -> snapshot.js:
    hardenPublicSnapshot(json)     -> privacy-guard.js, runs exactly once
    nativeWriteFile(tmp) + rename  -> bypasses the fs.writeFile patches
```

`hardenPublicSnapshot` must run **exactly once** per publish: it deletes
`settings.lotwFilter` as part of its output, so a second pass under a
LoTW-confirmed-only policy would (correctly) reject the write as fail-open.

The `fs.writeFile` patches remain installed as a **last-resort backstop** for any
stray writer of `data/public-snapshot.json`; normal publication never reaches
them.

## Invariants

1. Browser code never receives the raw QSO store or the Wavelog token.
2. Public QSO fields are the single allowlist in `qso-helpers.publicQsoFields`;
   both the builder (`sanitizePublicQso`) and the guard (`privacy-guard.hardenQso`)
   derive from it, so they cannot disagree.
3. `hardenPublicSnapshot` fails closed: a malformed or fail-open payload is
   rejected and the previous known-good snapshot is preserved byte-for-byte.
4. Station label, callsign, mode, date, time and remote grid are opt-in and
   enforced server-side; presentation URL flags are never permissions.
5. `data/` is the only private runtime directory; its location is resolved once
   in `data-dir.js` and may be overridden with `QSO_TRAILS_DATA_DIR` (used by
   tests so they never touch operator data).

## Changing the order or adding a preload

1. Edit `package.json` (`start` **and** `dev`) and this document together.
2. Update `EXPECTED` in `test/preload-order.js`.
3. Run `npm run check`. The order test fails on any mismatch.

## Changelog

- The `static-publish.js` `fs.readFile` override was removed; the settings
  default is now read explicitly by `readSettingsOrDefault()`.
- The LoTW-aware snapshot build moved out of `lotw-feature.js`'s `fs.writeFile`
  patch into `snapshot.js`, and the duplicated `publicDxccStats` in `server.js`
  was removed.
