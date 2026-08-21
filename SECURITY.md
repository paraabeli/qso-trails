# Security

## Supported deployment

For Internet-facing deployments use `compose.prod.yaml` behind the included Caddy reverse proxy. The application container is not published directly on a host port. `compose.dev.yaml` is for local development/testing only and binds port 3000 to `127.0.0.1`.

The legacy `compose.yaml` remains as a production-compatible migration path, but new installations should use the explicit production/development files.

Keep the host OS, Docker Engine, Caddy image, Node image and application dependencies updated.

## Secrets

- Use a unique `ADMIN_PASSWORD` of at least 16 characters; 20+ random characters is recommended.
- Use a separate random `CONFIG_ENCRYPTION_KEY` of at least 32 characters and back it up securely. Changing it prevents decryption of the stored Wavelog token.
- Create a Wavelog API v2 token with only `qso:read` and `confirmation:read` permissions.
- Never commit runtime environment files or files from the persistent data volume.
- Runtime files `.env`, `.env.*`, and private `data/*.json` files are gitignored and dockerignored. Only `*.example` environment templates are tracked.

## Admin exposure

Production deployments require `ADMIN_ALLOWED_IPS` when using `compose.prod.yaml`. Limit it to exact trusted addresses or IPv4 CIDRs, preferably a VPN/Tailscale/admin network. The production privacy guard refuses to start when `REQUIRE_ADMIN_ALLOWLIST=true` and no allowlist is configured.

The public `/embed`, `/api/public`, `/api/world`, and `/static/qrz.png` endpoints are intentionally Internet-accessible. `/admin` and `/api/admin/*` require authentication and the configured network policy.

## Public data model

Treat anything returned by `/api/public` or rendered into `/static/qrz.png` as permanently public once served. QSO Trails defaults to approximate positions and keeps raw Wavelog/ADIF records in the private data volume.

The privacy guard runs before the publishing layers and performs a final outbound check. It removes private/internal QSO fields, strips internal accounting counts, limits public count fields to the selected display mode, blocks HTML documents from the generic `/assets` mount, disables shared caching for privacy-sensitive public responses, and rejects a LoTW-confirmed-only snapshot if the LoTW filter was not successfully applied. Rejected snapshot writes leave the previous known-good atomic snapshot in place.

Callsings, mode, dates, times and remote grids remain opt-in public fields. Aggregate DXCC output is only retained by the privacy guard when the stored setting explicitly enables it.

## Wavelog SSRF protections

HTTPS is required by default. Private/reserved Wavelog destinations and HTTP are blocked unless explicitly enabled with `ALLOW_PRIVATE_WAVELOG=true` and/or `ALLOW_INSECURE_WAVELOG=true`. Redirects are disabled so the Bearer token is not automatically forwarded to another host.

Further DNS rebinding/connection-pinning hardening remains tracked in `docs/SECURITY_PRIVACY_HARDENING.md`.

## Development

Use:

```bash
cp .env.development.example .env.development
docker compose --env-file .env.development -f compose.dev.yaml up --build
```

The development container is reachable only on `http://127.0.0.1:3000` / `http://localhost:3000`. Do not change the host binding to `0.0.0.0` on an untrusted network.

## Production

Use:

```bash
cp .env.production.example .env.production
# Edit every placeholder, especially ADMIN_ALLOWED_IPS.
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
```

Do not publish application port 3000 from the production stack. Only Caddy should expose ports 80/443.

## Reporting

Please report vulnerabilities privately to the repository owner rather than opening a public issue with exploit details.
