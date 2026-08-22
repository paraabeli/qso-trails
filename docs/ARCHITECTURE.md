# QSO Trails architecture

This document is the short map of the runtime and its privacy boundaries. The detailed security decisions remain in `SECURITY.md` and `SECURITY_PRIVACY_HARDENING.md`.

## Runtime composition

The npm startup scripts intentionally preload the protection and publishing layers in this order:

```text
privacy-guard.js
network-guard.js
privacy-defaults.js
static-publish.js
server.js
```

`static-publish.js` loads the LoTW feature layer as part of the publishing setup. These files are kept at the repository root because the startup command and Docker image refer to them directly.

## Data flow

```text
Wavelog API / ADIF upload
          |
          v
private data/qsos.json + data/settings.json
          |
          v
server-side normalization, filtering, coordinate rounding
          |
          v
LoTW-aware snapshot transform
          |
          v
final privacy guard and atomic write
          |
          v
private data/public-snapshot.json
          |
          +--> /api/public
          +--> /embed
          +--> /static/qrz.png
```

The public renderers consume the sanitized snapshot. They do not need the raw QSO store or the Wavelog token.

## Main areas

- `server.js` — Express application, imports, settings, synchronization, normalization, snapshot creation, and routes.
- `network-guard.js` — Wavelog HTTPS, DNS/IP, redirect, response-size, confirmation-cap, and trusted-proxy protections.
- `privacy-defaults.js` — privacy-safe defaults for persisted settings and snapshot metadata.
- `lotw-feature.js` — LoTW confirmation state, filtering, metrics, and snapshot integration.
- `privacy-guard.js` — final public snapshot sanitization, fail-closed LoTW validation, no-store enforcement, and static-image rate limiting.
- `static-publish.js` — sanitized snapshot to PNG rendering and bounded image caching.
- `static-render.js` — pure PNG/map rendering functions.
- `public/` — browser-side admin and embed code; it receives only public/admin responses from the server.
- `test/` — Node-based regression tests for privacy, network, and default behavior.
- `data/` — runtime/private state. Do not commit real data or secrets.
- `docs/` — deployment, security, feature, and development documentation.

## Privacy invariants

1. The browser never receives the raw QSO store or Wavelog API token.
2. Public QSO fields are selected server-side; presentation URL switches are not privacy permissions.
3. Coordinates are rounded unless exact public coordinates are explicitly selected.
4. Internal identifiers, source fields, LoTW timestamps, and private DXCC fields are removed before public output.
5. A LoTW-confirmed-only snapshot must be produced by the LoTW-aware path or the write is rejected.
6. A rejected snapshot write must not replace the previous known-good snapshot.
7. `/api/public` and `/static/qrz.png` remain no-store endpoints through the final guard.

## Safe change boundaries

- Documentation and tests can be changed without changing runtime behavior.
- Pure helper extraction is reasonable when inputs, outputs, and serialization stay unchanged.
- Keep the preload order unchanged unless the whole startup and privacy test path is being redesigned.
- Treat public payload changes, settings defaults, route registration, filesystem wrappers, and network guards as security-sensitive changes.

For commands and the completion gate, read `DEVELOPMENT.md`. For the file-by-file map, read `REPOSITORY_MAP.md`.
