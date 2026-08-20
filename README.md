# QSO Trails

Self-hosted Wavelog/ADIF QSO path globe with an **admin-controlled, privacy-minimized public iframe**.

## Security-first architecture

The browser never reads your raw log files. Wavelog/ADIF data is stored in a private Docker volume under `/app/data`. When you publish settings, the server creates a sanitized `public-snapshot.json` containing only the selected QSOs and fields you explicitly allow. `/api/public` serves that cached snapshot with ETag/cache headers.

```text
Wavelog / ADIF
      |
      v
private /app/data/qsos.json
      |
server-side band/mode filtering + privacy rounding
      |
      v
private /app/data/public-snapshot.json
      |
      v
GET /api/public -> public iframe browser
```

The public globe never receives the Wavelog token or raw private QSO store.

## Main features

- Wavelog API v2 incremental synchronization (`since_id`)
- ADIF upload fallback
- Admin-selected public bands and modes
- Great-circle paths on an interactive globe
- World map data bundled through pinned npm dependencies; no third-party runtime JavaScript/CDN
- Server-side public record limit
- Public snapshot caching with ETag
- 4-character, 6-character, or exact home/remote coordinate privacy levels
- Callsign/mode/date/time/grid exposure is opt-in
- Admin page shows a sample of exactly what `/api/public` exposes
- Basic Auth plus brute-force throttling, CSRF protection, optional admin IP allowlist
- CSP, HSTS, anti-framing and browser security headers
- Wavelog URL SSRF/token-leakage protections
- Wavelog token encrypted at rest in production
- Non-root/read-only app container with dropped Linux capabilities
- GitHub Actions dependency audit and Dependabot configuration

## Requirements

- Docker Engine with Docker Compose supporting `dockerfile_inline` (Compose 2.17+)
- A DNS hostname pointing to the server
- TCP ports 80 and 443 reachable by Caddy
- Wavelog 3.1.0+ for API v2 sync

## Quick start

```bash
git clone https://github.com/paraabeli/qso-trails.git
cd qso-trails
cp .env.example .env
```

Edit `.env`:

```dotenv
DOMAIN=qso.example.com
ADMIN_USER=admin
ADMIN_PASSWORD=generate-a-long-unique-password
CONFIG_ENCRYPTION_KEY=generate-at-least-32-random-characters
```

Generate secrets, for example:

```bash
openssl rand -base64 32
openssl rand -base64 48
```

Start:

```bash
docker compose up -d --build
```

Then open:

- `https://qso.example.com/admin`
- `https://qso.example.com/embed`

## Wavelog setup

Create a Wavelog API v2 token with **only**:

```text
qso:read
```

In `/admin`, enter the Wavelog base URL and token, save, test, then sync. The token is encrypted in the persistent volume using `CONFIG_ENCRYPTION_KEY`.

By default, Wavelog must use HTTPS and resolve to a public address. For an intentional LAN deployment, set `ALLOW_PRIVATE_WAVELOG=true`. For intentional HTTP-only Wavelog, also set `ALLOW_INSECURE_WAVELOG=true` and understand that the Bearer token can then traverse the network without TLS.

## Public privacy controls

The default is intentionally conservative:

- home position: 4-character grid center
- remote QSO positions: 4-character grid centers
- band: exposed because it drives path colors
- callsign: hidden
- mode: hidden after server-side filtering
- QSO date/time: hidden
- remote grid string: hidden

The Admin page includes **What the Internet sees** and a sample `/api/public` response.

`maxPaths` is enforced on the server. If 20,000 QSOs match your filters but `maxPaths=2500`, only 2,500 QSO records are sent to each public browser while the displayed QSO count can still show 20,000.

## QRZ iframe

The admin page generates an iframe similar to:

```html
<iframe src="https://qso.example.com/embed" width="100%" height="620" style="border:0" loading="lazy"></iframe>
```

The default CSP permits framing by QSO Trails itself and QRZ domains only. To support another site, edit `EMBED_FRAME_ANCESTORS` in `.env`, for example:

```dotenv
EMBED_FRAME_ANCESTORS='self' https://qrz.com https://*.qrz.com https://example.org
```

## Restricting admin access

`ADMIN_ALLOWED_IPS` can contain exact addresses or IPv4 CIDRs:

```dotenv
ADMIN_ALLOWED_IPS=100.64.12.34,192.0.2.0/24
```

For a personal station server, putting admin access behind Tailscale/VPN and allowing only that address is recommended.

## Data files

The persistent `qso_data` Docker volume contains:

- `qsos.json` — private normalized QSO store
- `settings.json` — private admin/public configuration
- `wavelog.json` — Wavelog sync metadata and encrypted token
- `public-snapshot.json` — sanitized public payload cache

These files are **not** served through `/assets`.

## Dependency/runtime security

Production dependencies are exact-version pinned in `package.json`. Docker installs only those production dependencies with lifecycle scripts disabled. CI generates a lockfile transiently for dependency auditing. The included image uses Node 24 LTS and a pinned Caddy patch release.

GitHub Actions runs syntax checks, `npm audit --omit=dev --audit-level=high`, and validates the Compose file. Dependabot checks npm and Docker updates weekly.

## Updating

```bash
git pull
docker compose up -d --build
```

Review dependency/security PRs before merging.

## World map source

Country geometry comes from the npm `world-atlas` package (derived from Natural Earth) and is converted server-side with `topojson-client`. Visitors fetch it from `/api/world`; they do not execute CDN-hosted JavaScript.

## License

Application code is MIT licensed. Third-party packages and map data retain their own licenses.
