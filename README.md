# QSO Trails

Self-hosted Wavelog/ADIF QSO path mapping with privacy-minimized interactive embeds and static images.

> QSO Trails was designed and implemented with ChatGPT, with project direction, testing, deployment decisions and release responsibility by paraabeli.
>
> Copyright © 2026 paraabeli. MIT licensed.

## What it does

- Wavelog API v2 QSO synchronization plus LoTW confirmation synchronization.
- ADIF upload fallback.
- All-QSO or LoTW-confirmed-only publication.
- Server-side band/mode selection and 4/6-character or exact coordinate precision.
- Opt-in callsign, mode, date, time, remote-grid, station-label and DXCC aggregate publication.
- Interactive path/density/replay/live views.
- Static 640×500 globe or Mercator PNG.
- Expanded visual themes plus optional **Real Earth / NASA Blue Marble** mode.
- Hardened production Docker/Caddy deployment with private app networking and bounded/minimal access logging.

## Privacy boundary

```text
Wavelog / ADIF
      |
      v
private data/qsos.json + settings
      |
server-side filtering + rounding + privacy permissions
      |
LoTW-aware transformation
      |
fail-closed final privacy guard
      |
private data/public-snapshot.json
      |
      +--> /api/public
      +--> /embed
      +--> /static/qrz.png
```

The public renderer never receives the raw QSO store or Wavelog token. Treat everything intentionally returned by public endpoints as public information. A public path map necessarily reveals the selected public/rounded home and remote positions required to draw its paths.

## Production quick start

```bash
cp .env.production.example .env.production
# Configure domain, independent secrets, and ADMIN_ALLOWED_IPS.
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
```

Only Caddy publishes ports 80/443. The app port 3000 remains private to Docker networking.

For local development:

```bash
cp .env.development.example .env.development
docker compose --env-file .env.development -f compose.dev.yaml up -d --build
```

Development binds only `127.0.0.1:3000`.

For an existing Cloudflare/Caddy edge, use `compose.external-edge.yaml`; the app stays unpublished and the repository includes SSH-admin, deploy, Cloudflare-origin-lock and systemd helpers.

## Wavelog

Use a read-only API v2 token with exactly the capabilities needed by QSO Trails:

```text
qso:read
confirmation:read
```

Normal deployments keep private-address and insecure-HTTP Wavelog access disabled. Run **Full resync** once after initially enabling LoTW confirmation support.

## Themes

Interactive themes:

```text
night · ocean · light · midnight · aurora · amber · mono · ice · earth
```

Static themes:

```text
retro · clean · futuristic · rough · midnight · aurora · amber · mono · ice · earth
```

Examples:

```text
/embed?theme=aurora
/embed?theme=earth
/static/qrz.png?projection=globe&theme=midnight
/static/qrz.png?projection=mercator&theme=earth
```

`earth` uses a locally cached NASA Visible Earth Blue Marble texture. Visitor browsers request only QSO Trails; they do not contact NASA or another map provider directly.

## Logging

Standalone production Caddy access logs are deliberately minimal and have a **30-day maximum retention**. The policy masks client IPs, removes query strings and request/response headers, skips asset noise, rolls daily/at a size limit, and expires logs after 720 hours. Runtime container stdout/stderr is separately size-bounded.

## Documentation

The repository now has a deliberately small canonical documentation set:

- [Operations](docs/OPERATIONS.md) — prod/dev/external-edge deployment, Wavelog/LoTW, themes/Earth imagery, logging, backups and upgrades.
- [Architecture](docs/ARCHITECTURE.md) — runtime composition, data flow and privacy invariants.
- [Development](docs/DEVELOPMENT.md) — repository layout, tests and change checklist.
- [Security](SECURITY.md) — threat model, deployment assumptions and vulnerability reporting.

CI/security workflow: [.github/workflows/security.yml](.github/workflows/security.yml).

## Development gate

```bash
npm ci --ignore-scripts
npm run check
npm run audit:prod
```

CI additionally validates Compose/Caddy configuration, production image startup, privacy endpoints and static themes.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). NASA Blue Marble imagery remains subject to NASA's media/identity usage guidance; see `docs/OPERATIONS.md`.
