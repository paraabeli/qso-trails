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
- Server-side public record limit and cached sanitized public snapshot
- 4-character, 6-character, or exact home/remote coordinate privacy levels
- Callsign/mode/date/time/grid exposure is opt-in
- Basic Auth, brute-force throttling, CSRF protection and optional admin IP allowlist
- CSP, HSTS, anti-framing and browser security headers
- Wavelog SSRF/token-leakage protections and encrypted token storage
- Non-root/read-only app container, GitHub Actions security audit and Dependabot
- Selectable iframe sizes with live admin preview
- Band legend, clickable QSO detail, distance and bearing
- Visual date filters and live grayline/day-night overlay
- Night, Ocean, and Light themes
- Paths, density heatmap, or combined display modes
- Adjustable trail opacity
- Advanced chronological replay, live mode, search/focus, presets and WebM export

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

Then open `https://qso.example.com/admin` and `https://qso.example.com/embed`.

## Wavelog setup

Create a Wavelog API v2 token with only `qso:read`. In `/admin`, enter the Wavelog base URL and token, save, test, then sync. The token is encrypted in the persistent volume using `CONFIG_ENCRYPTION_KEY`.

By default Wavelog must use HTTPS and resolve to a public address. For an intentional LAN deployment set `ALLOW_PRIVATE_WAVELOG=true`. For intentional HTTP-only Wavelog also set `ALLOW_INSECURE_WAVELOG=true` and understand the Bearer token can traverse the network without TLS.

## Public privacy controls

Defaults are conservative: home and remote positions use 4-character grid centers, band is public for rendering, while callsign, mode, date/time and remote grid are hidden. The Admin page includes **What the Internet sees** and a sample `/api/public` response.

`maxPaths` is enforced server-side. If 20,000 QSOs match but `maxPaths=2500`, only 2,500 records are sent to a public browser.

## Advanced replay and live features

Replay remains a presentation layer over the sanitized `/api/public` payload. URL controls never request hidden records or hidden fields.

Advanced replay supports:

- loop replay continuously
- fade older trails during replay
- follow the newest replayed QSO by rotating the globe
- uniform replay or relative timing based on published date/time gaps
- replay a single public band or all bands
- pulsing current-QSO endpoint
- current replay HUD using only public date/time/callsign/band/mode fields
- timeline scrubber and play/pause controls
- `0.5×`, `1×`, `2×`, and `4×` automatic replay speeds
- browser-side WebM recording/export using `MediaRecorder`

Replay/date features require public QSO dates. Relative timing is most useful when public QSO times are also enabled.

### Live mode

Live mode polls `/api/public` once per minute with `cache: no-store`. It compares the new sanitized snapshot with the previous one and animates/focuses only newly appearing public records. It never calls Wavelog directly and never gains access to the private raw QSO store.

### Callsign focus

The public viewer can search/focus a callsign only when callsigns were explicitly made public. If callsigns are hidden, the feature cannot reconstruct them.

### DXCC progress panel

The public viewer contains a DXCC/continent progress panel. It only counts `dxcc`/`cont` metadata if those fields are already present in the sanitized public payload. Otherwise it clearly reports that DXCC metadata is not public rather than inferring hidden station data.

### Saved display presets

The Admin embed generator includes QRZ, 20m DX, FT8 last 30 days and Contest replay presets. A custom **My preset** can also be saved in the administrator's browser via `localStorage`; it does not alter server privacy settings.

## Embed query options

Generated iframe URLs may use:

- `days=1|7|30|365`
- `grayline=1`
- `theme=night|ocean|light`
- `mode=paths|density|both`
- `opacity=8..90`
- `replay=0.5|1|2|4`
- `loop=1`
- `follow=1`
- `timing=relative`
- `fade=0` to disable replay fading
- `band=<published band>`
- `live=1`

Example:

```html
<iframe src="https://qso.example.com/embed?days=30&grayline=1&theme=ocean&mode=both&opacity=40&replay=1&loop=1&follow=1&timing=relative" width="640" height="500" style="border:0" loading="lazy"></iframe>
```

## QRZ iframe sizing

Presets are Responsive `100% × 620`, Compact `480 × 420`, QRZ `640 × 500`, Wide `900 × 620`, and Custom width `320–2000` / height `300–1400`. Sizing only changes generated embed HTML and admin preview.

The default CSP permits framing by QSO Trails itself and QRZ domains only. To support another site, edit `EMBED_FRAME_ANCESTORS` in `.env`.

## Restricting admin access

`ADMIN_ALLOWED_IPS` can contain exact addresses or IPv4 CIDRs, for example:

```dotenv
ADMIN_ALLOWED_IPS=100.64.12.34,192.0.2.0/24
```

For a personal station server, putting admin access behind Tailscale/VPN and allowing only that address is recommended.

## Data files

The persistent `qso_data` volume contains `qsos.json`, `settings.json`, `wavelog.json`, and sanitized `public-snapshot.json`. These files are not served through `/assets`.

## Dependency/runtime security

Production dependencies are exact-version pinned. Docker installs production dependencies with lifecycle scripts disabled. CI runs syntax checks, `npm audit --omit=dev --audit-level=high`, and validates the Compose file. Dependabot checks npm and Docker updates weekly.

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
