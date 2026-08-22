# QSO Trails security

## Supported boundaries

For standalone Internet production use `compose.prod.yaml`: only Caddy publishes ports 80/443 and the application port remains private to Docker networking. `compose.dev.yaml` is local-only and binds `127.0.0.1:3000`. `compose.external-edge.yaml` is for an existing trusted edge proxy and keeps app port 3000 unpublished.

Keep the host OS, Docker Engine, Caddy/Node images and dependencies patched.

## Secrets

- Use a unique random `ADMIN_PASSWORD` (20+ characters recommended).
- Use a separate random `CONFIG_ENCRYPTION_KEY` of at least 32 characters and back it up securely.
- Wavelog needs only `qso:read` and `confirmation:read`.
- Never commit runtime `.env*`, private data-volume contents, certificates or keys.

The Wavelog token is encrypted at rest with AES-256-GCM. Environment files are excluded from Git and the Docker build context, but the threat model assumes the Docker host/daemon is trusted.

## Admin exposure and proxy trust

Standalone production requires `ADMIN_ALLOWED_IPS`; the app refuses to start under the production policy when it is empty. Canonical production uses `TRUST_PROXY=loopback,uniquelocal`; local development uses `TRUST_PROXY=false`.

If Cloudflare, another load balancer, ingress controller or proxy hop is added, explicitly re-evaluate client-IP trust before relying on Admin allowlisting or per-IP rate limits. External-edge deployments should block public Admin routes at the edge and use a loopback/SSH-only Admin path.

## Public data model

Treat `/api/public`, `/embed`, `/static/qrz.png`, and any same-origin public theme assets as public. The raw QSO store and Wavelog credentials remain private.

The fail-closed privacy layer strips internal identifiers/source data, unselected optional QSO fields, LoTW timestamps and private DXCC data. Station-name and DXCC aggregates are opt-in. A LoTW-confirmed-only policy must be proven by the LoTW-aware snapshot transformer or the new snapshot write is rejected, preserving the previous known-good snapshot.

A public path map inherently exposes the configured public/rounded home and remote coordinates necessary to draw published paths.

## Wavelog SSRF/resource protections

Normal Wavelog access requires HTTPS and rejects private/reserved destinations. The network guard validates all current A/AAAA answers immediately before connection, normalizes IPv4-mapped IPv6, rejects unsafe/mixed answers when private access is disabled, pins the socket to a validated address while preserving the hostname for TLS, rejects redirects, limits individual response bodies, and caps LoTW confirmation traversal.

Relax `ALLOW_PRIVATE_WAVELOG` or `ALLOW_INSECURE_WAVELOG` only for a deliberate private/local deployment.

## Real Earth imagery

The optional `earth` theme uses a fixed NASA Visible Earth Blue Marble PNG. QSO Trails fetches it **server-side**, with a short timeout, redirect rejection, download/pixel limits and PNG validation, then stores a reduced local cache in the private app data volume. Visitor browsers request only the same QSO Trails origin; they do not contact NASA directly. If the source/cache is unavailable, the map falls back to vector rendering.

## Minimal traffic logging

Standalone production Caddy access logging is intentionally minimized in `Caddyfile.prod`:

- maximum retention: 30 days (`720h`), with at most 30 rolled files;
- daily/size-based rotation;
- masked client IPs;
- query strings removed;
- request/response headers removed;
- static asset noise skipped;
- access-log files mode `0600` in a dedicated Caddy-only volume.

Container stdout/stderr uses Docker's bounded `local` driver and is not intended as permanent web analytics. External-edge operators must apply an equivalent privacy/retention policy to their existing edge proxy.

## Browser hardening

The application sets CSP, anti-framing rules appropriate to Admin/embed, HSTS on HTTPS, no-referrer and permissions restrictions. Admin mutations require CSRF protection. Dynamic select-option construction is constrained to inert option data.

## Reporting

Report vulnerabilities privately to the repository owner. Do not open a public issue containing exploit details, secrets, private QSO data, or credentials.

Operational configuration is documented in `docs/OPERATIONS.md`; runtime/privacy architecture is in `docs/ARCHITECTURE.md`.
