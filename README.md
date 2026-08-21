# QSO Trails

Self-hosted Wavelog/ADIF QSO path mapping with admin-controlled, privacy-minimized interactive and static public views.

> **Development disclosure:** QSO Trails was designed and implemented entirely with ChatGPT, with project direction, testing, deployment decisions and release responsibility by paraabeli.
>
> Copyright © 2026 paraabeli. Released under the MIT License.

## Privacy model

The public browser never receives the raw Wavelog/ADIF store or Wavelog API token.

```text
Wavelog / ADIF
      |
      v
private /app/data/qsos.json
      |
server-side selection + coordinate rounding + privacy controls
      |
LoTW-aware publish transform
      |
final fail-closed privacy guard
      |
      v
private /app/data/public-snapshot.json
      |
      +--> /api/public
      +--> /embed
      +--> /static/qrz.png
```

The final `privacy-guard.js` is deliberately loaded before the publishing layers. It performs the last outbound snapshot check, strips internal/private fields and unselected counts, and refuses a LoTW-confirmed-only snapshot if the LoTW filter was not successfully applied. A rejected atomic snapshot write leaves the previous known-good snapshot in place rather than broadening disclosure.

Treat anything returned by `/api/public` or rendered in the public map/image as public information. A public path map necessarily reveals the configured **public/rounded** home point and the endpoint positions required to draw the selected paths.

See [SECURITY.md](SECURITY.md) and [the security/privacy hardening checklist](docs/SECURITY_PRIVACY_HARDENING.md).

## Features

- Wavelog API v2 incremental QSO synchronization.
- LoTW confirmation synchronization and LoTW-confirmed-only map filtering.
- Embed count modes: QSO count, LoTW-confirmed count, or both.
- ADIF upload fallback.
- Server-side band/mode filtering.
- 4-character, 6-character, or exact public coordinate precision.
- Callsign, mode, date, time and remote-grid fields are opt-in.
- Optional aggregate DXCC statistics without publishing per-QSO DXCC/country/continent fields.
- Interactive great-circle globe, density mode, replay, live polling, search/focus and WebM export.
- Server-rendered 640×500 globe/Mercator PNG with multiple themes.
- Basic Auth, brute-force throttling, CSRF protection and production Admin IP/CIDR allowlisting.
- CSP, HSTS, anti-framing, no-referrer and permissions restrictions.
- Wavelog HTTPS/SSRF protections and AES-256-GCM token encryption at rest.
- Non-root/read-only application container with dropped Linux capabilities and `no-new-privileges`.
- Locked npm dependency installation, Dependabot and GitHub Actions security/privacy regression checks.

## Docker deployment modes

There are two canonical Compose files.

### Production

Use:

```text
compose.prod.yaml
.env.production
```

The production application has **no host port 3000 mapping**. Only Caddy binds public ports 80/443.

Create the environment:

```bash
cp .env.production.example .env.production
```

Edit every placeholder. `ADMIN_ALLOWED_IPS` is required in production and should contain only trusted administration addresses or IPv4 CIDRs, preferably from a VPN/Tailscale network.

Generate independent secrets, for example:

```bash
openssl rand -base64 32
openssl rand -base64 48
```

Start:

```bash
docker compose \
  --env-file .env.production \
  -f compose.prod.yaml \
  up -d --build
```

Then open:

```text
https://YOUR_DOMAIN/admin
https://YOUR_DOMAIN/embed
```

The production privacy layer refuses to start when `REQUIRE_ADMIN_ALLOWLIST=true` and `ADMIN_ALLOWED_IPS` is empty.

### Development / local POC

Use:

```text
compose.dev.yaml
.env.development
```

Create the environment:

```bash
cp .env.development.example .env.development
```

Start:

```bash
docker compose \
  --env-file .env.development \
  -f compose.dev.yaml \
  up -d --build
```

The development mapping is explicitly:

```text
127.0.0.1:3000 -> container:3000
```

Open `http://localhost:3000/admin` or `http://localhost:3000/embed`.

Do not replace the mapping with an unspecified-host `3000:3000` on an untrusted network.

Full instructions: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and [docs/LOCAL_POC.md](docs/LOCAL_POC.md).

### Legacy compatibility

`compose.yaml` is retained temporarily for existing deployments using `.env`. It now uses the same hardened Dockerfile and production Admin allowlist policy. New installs should explicitly choose `compose.prod.yaml` or `compose.dev.yaml`.

## Environment-file safety

Runtime environment files are not tracked or copied into images:

```text
.env
.env.production
.env.development
.env.local
.env.*
```

`.gitignore` and `.dockerignore` ignore `.env` and `.env.*` while allowing only tracked `*.example` templates.

Environment-file exclusion prevents accidental source/image inclusion, but it does not protect secrets from a compromised Docker host. Treat the Docker host and daemon as privileged infrastructure.

## Wavelog setup

Create a Wavelog API v2 token with only:

```text
qso:read
confirmation:read
```

No write/delete permission is required.

In Admin enter the Wavelog base URL/token, save, test, and run **Full resync** once after enabling the LoTW feature. Subsequent QSO synchronization remains incremental while LoTW confirmations use the confirmation endpoint so a later LoTW confirmation is not missed merely because the QSO ID did not change.

By default:

```dotenv
ALLOW_PRIVATE_WAVELOG=false
ALLOW_INSECURE_WAVELOG=false
```

Normal Wavelog traffic must therefore use HTTPS and a non-private/non-reserved target. Relax these only for an intentional private/local arrangement and review the network risk.

## LoTW publishing

Admin provides:

```text
QSO map filter
- all selected QSOs
- LoTW-confirmed QSOs only

Embed count
- QSO count only
- LoTW confirmed count only
- both
```

LoTW-confirmed-only filtering occurs before `maxPaths` truncation.

The final public privacy guard minimizes count data:

- internal `allQsoCount` and `returnedQsos` accounting is not published;
- QSO-only mode publishes one QSO count;
- LoTW-only mode publishes one generic count whose value is the LoTW-confirmed count, and the embed labels it as LoTW;
- both mode publishes the QSO and LoTW counts;
- when public stats are disabled, aggregate count fields are removed.

Full internal metrics remain available through authenticated Admin state.

## Public QSO fields

Base rendering requires:

- public-rounded endpoint latitude/longitude;
- band.

Optional per-QSO fields are controlled server-side:

- callsign;
- mode;
- date;
- time;
- remote Maidenhead grid.

Private/internal fields such as source type, source ID, LoTW confirmation timestamp and per-QSO DXCC/country/continent are removed by the final guard.

Presentation URL parameters such as `name=0`, `stats=0`, `legend=0` and `details=0` only alter the visible UI. Do not confuse a presentation switch with a server-side privacy permission. Remaining station-label privacy work is explicitly tracked in the hardening checklist.

## DXCC statistics

When explicitly enabled, QSO Trails calculates DXCC aggregates server-side. Per-QSO DXCC/country/continent fields remain private.

The privacy guard removes DXCC aggregate output unless the stored `showDxccStats` setting explicitly enables it. Changing the brand-new-install default from enabled to disabled is tracked as remaining hardening work.

## Public endpoints

Intentionally public:

```text
/embed
/api/public
/api/world
/static/qrz.png
/assets/*.js
/assets/*.css
```

HTML documents are blocked from the generic `/assets` static mount. `/admin` is served through the authenticated route and `/embed` through its dedicated CSP/frame policy.

Privacy-sensitive `/api/public` and `/static/qrz.png` responses are forced to `Cache-Control: no-store` by the final guard. This prevents the new deployment from intentionally storing these responses in shared caches; it cannot retroactively erase copies cached under an older version's previous TTL.

The static image endpoint also has an in-process per-IP rate limit before rendering.

## Static image

Use:

```text
https://YOUR_DOMAIN/static/qrz.png
```

Common options:

```text
projection=globe|mercator
theme=retro|clean|futuristic|rough
name=0
stats=0
legend=0
dxcc=0
updated=0
```

The image renderer reads only the sanitized public snapshot; it does not fetch Wavelog or read the raw QSO store.

## Interactive embed

Basic example:

```html
<iframe
  src="https://YOUR_DOMAIN/embed"
  width="100%"
  height="620"
  style="border:0"
  loading="lazy">
</iframe>
```

The allowed parent sites are controlled by `EMBED_FRAME_ANCESTORS` and the embed CSP.

The interactive renderer supports visual themes, density, replay, grayline, live polling, band selection, trail opacity, callsign focus (only when callsigns are public), and browser-side WebM export. These features operate only on the sanitized `/api/public` payload.

## Security checks

CI currently runs:

- immutable-SHA GitHub Actions dependencies;
- `npm ci --ignore-scripts`;
- JavaScript syntax checks;
- fixture-based privacy regression tests with sentinel private values;
- production dependency audit;
- production/development Compose validation;
- assertion that production does not publish app port 3000;
- assertion that development binds app port 3000 only to `127.0.0.1`;
- production image build/start;
- `/embed` and `/api/public` smoke tests;
- verification that `/assets/admin.html` is blocked;
- `Cache-Control: no-store` checks;
- static PNG signature/size checks across themes/projections.

Remaining work, including proxy-trust hardening, DNS-rebinding-resistant Wavelog connections, LoTW record caps, server-side station-label publication controls and GitHub branch protection, is tracked in [docs/SECURITY_PRIVACY_HARDENING.md](docs/SECURITY_PRIVACY_HARDENING.md).

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
