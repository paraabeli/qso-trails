# QSO Trails

Self-hosted Wavelog/ADIF QSO path mapping with admin-controlled, privacy-minimized interactive and static public views.

> **Development disclosure:** QSO Trails was designed and implemented entirely with ChatGPT, with project direction, testing, deployment decisions and release responsibility by paraabeli.
>
> Copyright © 2026 paraabeli. Released under the MIT License.

## Privacy model

The browser never receives the raw Wavelog/ADIF store or the Wavelog API token.

```text
Wavelog / ADIF
      |
      v
private data/qsos.json + settings.json
      |
server-side filtering, coordinate rounding, and privacy permissions
      |
LoTW-aware transform
      |
final fail-closed privacy guard
      |
private data/public-snapshot.json
      |
      +--> /api/public
      +--> /embed
      +--> /static/qrz.png
```

The public endpoints and renderers use only the sanitized public snapshot. Public QSO fields, station-label publication, DXCC aggregates, counts, and coordinate precision are controlled server-side.

Read [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full runtime flow and privacy invariants.

## Features

- Wavelog API v2 incremental QSO synchronization.
- LoTW confirmation synchronization and confirmed-only filtering.
- ADIF upload fallback.
- Server-side band/mode filtering and coordinate precision controls.
- Opt-in callsign, mode, date, time, remote-grid, station-label, and DXCC aggregate publication.
- Interactive globe, density, replay, live polling, search/focus, and WebM export.
- Server-rendered 640×500 globe/Mercator PNG with multiple themes.
- Basic Auth, CSRF protection, rate limiting, trusted-proxy controls, and Admin IP/CIDR allowlisting.
- Wavelog HTTPS/SSRF protections and encrypted token storage.
- Hardened non-root/read-only Docker deployment.

## Quick start

Requirements: Node.js `>=22.0.0` and npm.

```bash
npm ci --ignore-scripts
npm run check
npm start
```

For development watch mode:

```bash
npm run dev
```

The local server uses port `3000` by default. Docker users should choose one of the explicit Compose modes below.

## Docker deployment

Standalone production with its own Caddy:

```bash
cp .env.production.example .env.production
# edit every placeholder and configure ADMIN_ALLOWED_IPS
docker compose \
  --env-file .env.production \
  -f compose.prod.yaml \
  up -d --build
```

External Cloudflare/Caddy edge with SSH-only admin:

```bash
cp .env.external-edge.example .env.external-edge
# edit secrets, domain, shared Docker network and embed origin
docker compose \
  --env-file .env.external-edge \
  -f compose.external-edge.yaml \
  up -d --build
```

The external-edge mode is intended for a VPS whose existing Caddy already owns ports 80/443. QSO Trails joins that proxy's private Docker network, leaves app port 3000 unpublished, blocks public admin routes at the edge, and reaches admin through an SSH tunnel to a loopback-only proxy listener.

Development/local POC:

```bash
cp .env.development.example .env.development
docker compose \
  --env-file .env.development \
  -f compose.dev.yaml \
  up -d --build
```

The development stack binds only to `127.0.0.1:3000`. Standalone production exposes the service through its own Caddy; external-edge production reuses an existing edge Caddy and does not publish the application port directly.

Full deployment instructions are in [DEPLOYMENT.md](docs/DEPLOYMENT.md), [EXTERNAL_EDGE_DEPLOYMENT.md](docs/EXTERNAL_EDGE_DEPLOYMENT.md), and [LOCAL_POC.md](docs/LOCAL_POC.md).

## Wavelog setup

Create a Wavelog API v2 token with only:

```text
qso:read
confirmation:read
```

No write/delete permission is required. Normal Wavelog traffic requires HTTPS and rejects private/reserved destinations unless explicitly configured otherwise.

## Public behavior

Intentionally public endpoints:

```text
/embed
/api/public
/api/world
/static/qrz.png
/assets/*.js
/assets/*.css
```

`/admin` is authenticated. Deployments may additionally block admin routes at an upstream edge. Generic `/assets` serving blocks HTML documents. Treat everything returned by a public endpoint or rendered in the public map/image as public information.

Presentation switches such as `name=0`, `stats=0`, `legend=0`, and `details=0` only change visible presentation. They do not grant permission to publish additional data.

## Development and security

- Development commands and the completion gate: [DEVELOPMENT.md](docs/DEVELOPMENT.md).
- File and directory responsibilities: [REPOSITORY_MAP.md](docs/REPOSITORY_MAP.md).
- Security policy and deployment assumptions: [SECURITY.md](SECURITY.md).
- Hardening checklist: [SECURITY_PRIVACY_HARDENING.md](docs/SECURITY_PRIVACY_HARDENING.md).
- Network boundary details: [NETWORK_BOUNDARY_HARDENING.md](docs/NETWORK_BOUNDARY_HARDENING.md).
- LoTW feature details: [LOTW_CONFIRMATIONS.md](docs/LOTW_CONFIRMATIONS.md).
- CI/security workflow: [.github/workflows/security.yml](.github/workflows/security.yml).

Run the complete local gate with:

```bash
npm run check
npm run audit:prod
```

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
