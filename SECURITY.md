# Security

## Supported deployment

QSO Trails is intended to run behind HTTPS using the included Caddy Docker Compose deployment. Keep the host OS, Docker Engine, and QSO Trails dependencies updated.

## Secrets

- Use a unique `ADMIN_PASSWORD` of at least 16 characters.
- Use a random `CONFIG_ENCRYPTION_KEY` of at least 32 characters and back it up securely. Changing it prevents decryption of the stored Wavelog token.
- Create a Wavelog API v2 token with **only** `qso:read` permission.
- Never commit `.env` or files from the persistent `data` volume.

## Admin exposure

For the strongest setup, restrict admin access with `ADMIN_ALLOWED_IPS` or place the service behind a VPN/Tailscale path. The public `/embed`, `/api/public`, and `/api/world` endpoints are intentionally Internet-accessible.

## Public data model

Anything returned by `/api/public` is public. QSO Trails defaults to approximate 4-character-grid positions and exposes only band plus coordinates. Callsigns, mode, dates, times, and remote grids are opt-in.

## Wavelog SSRF protections

HTTPS is required by default. Private/reserved Wavelog destinations and HTTP are blocked unless explicitly enabled with `ALLOW_PRIVATE_WAVELOG=true` and/or `ALLOW_INSECURE_WAVELOG=true`.

## Reporting

Please report vulnerabilities privately to the repository owner rather than opening a public issue with exploit details.
