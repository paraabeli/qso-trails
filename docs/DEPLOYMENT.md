# Deployment Guide

QSO Trails has three explicit Docker deployment modes. Keep them separate because their network and trust assumptions differ.

- `compose.prod.yaml` — standalone Internet-facing production with its own Caddy.
- `compose.external-edge.yaml` — production behind an existing Cloudflare/Caddy edge, with SSH-only admin.
- `compose.dev.yaml` — loopback-only development/local POC.

For the shared-edge model, see [EXTERNAL_EDGE_DEPLOYMENT.md](EXTERNAL_EDGE_DEPLOYMENT.md). It includes `qso.example.com` / `example.com` examples, a shared Docker network, public-admin blocking, SSH tunnel access, Cloudflare-only origin filtering, automatic code deployment, and systemd timers.

## Production: `compose.prod.yaml`

Standalone production consists of:

```text
Internet
  |
  | TCP 80 / 443
  v
Caddy
  |
  | private Docker network, app:3000
  v
QSO Trails app
  |
  v
qso_data named volume
```

The application service has no `ports:` entry in production. Port 3000 is visible only inside the Docker network through `expose`. Caddy is the only service bound to public host ports.

Production also sets:

```text
TRUST_PROXY=loopback,uniquelocal
WAVELOG_CONFIRMATION_MAX_RECORDS=500000
WAVELOG_MAX_RESPONSE_BYTES=16777216
```

The proxy policy trusts the local/private reverse proxy path but does not trust arbitrary public peers merely because they supply forwarding headers.

### Create production environment

```bash
cp .env.production.example .env.production
```

Replace every placeholder. In particular:

- `DOMAIN` — public DNS name.
- `ADMIN_PASSWORD` — unique random admin password, at least 16 characters; 20+ recommended.
- `CONFIG_ENCRYPTION_KEY` — separate random value, at least 32 characters.
- `ADMIN_ALLOWED_IPS` — required exact trusted IP(s) / IPv4 CIDRs. Prefer VPN/Tailscale addresses.
- `EMBED_FRAME_ANCESTORS` — sites permitted to embed the public iframe.

The production stack sets `REQUIRE_ADMIN_ALLOWLIST=true`. The application refuses to start if the allowlist is empty.

Generate independent secrets, for example:

```bash
openssl rand -base64 32
openssl rand -base64 48
```

Do not use the same value for the admin password and encryption key.

### Start production

```bash
docker compose \
  --env-file .env.production \
  -f compose.prod.yaml \
  up -d --build
```

Inspect the effective configuration before first deployment:

```bash
docker compose \
  --env-file .env.production \
  -f compose.prod.yaml \
  config
```

Confirm the `app` service does **not** have a host `ports:` mapping.

### Production updates

```bash
git pull --ff-only

docker compose \
  --env-file .env.production \
  -f compose.prod.yaml \
  up -d --build
```

### Production logs

```bash
docker compose \
  --env-file .env.production \
  -f compose.prod.yaml \
  logs -f app caddy
```

Caddy access logs can contain client IP addresses and requested URL paths/query parameters. Treat host/container logs according to your operational privacy policy and keep log retention bounded.

## External edge: `compose.external-edge.yaml`

This mode does **not** start another Caddy. The application joins an existing external Docker network used by the VPS edge proxy.

Canonical example:

```text
Cloudflare
   |
existing Caddy :443
   |
qso.example.com -> qso-trails:3000

workstation -> SSH -> VPS 127.0.0.1:3300 -> Caddy -> qso-trails:3000
```

The companion Compose:

- keeps port 3000 unpublished;
- uses the hardened production container settings;
- forces `ADMIN_ALLOWED_IPS=127.0.0.1`;
- stores application state in a named volume;
- joins `${EDGE_NETWORK:-edge-web}`.

The existing edge proxy must:

- route `qso.example.com` to `qso-trails:3000`;
- return 404 for public `/admin`, `/admin/*`, and `/api/admin/*`;
- publish its private admin listener only as `127.0.0.1:3300` on the VPS;
- overwrite the private listener's forwarded client address with `127.0.0.1`.

Follow [EXTERNAL_EDGE_DEPLOYMENT.md](EXTERNAL_EDGE_DEPLOYMENT.md) rather than mixing pieces from standalone production.

## Development/local: `compose.dev.yaml`

Development intentionally skips Caddy and exposes the application only on the host loopback interface:

```text
Browser on same machine
        |
        | 127.0.0.1:3000 only
        v
QSO Trails app
        |
        v
qso_data_dev named volume
```

Development sets `TRUST_PROXY=false`, because the browser talks directly to the application rather than through a reverse proxy.

Create the local environment:

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

Open:

- `http://localhost:3000/admin`
- `http://localhost:3000/embed`
- `http://localhost:3000/static/qrz.png`

The Compose binding is explicitly:

```text
127.0.0.1:3000:3000
```

Do not shorten this to `3000:3000`; an unspecified host address can expose the service on LAN/public interfaces.

## Environment-file rules

Runtime files are intentionally untracked:

```text
.env
.env.production
.env.external-edge
.env.development
.env.local
.env.anything-else
```

`.gitignore` and `.dockerignore` ignore `.env` plus `.env.*`; only `.env.example` and `.env.*.example` templates are allowed in Git/build context.

Protect runtime environment files, for example:

```bash
chmod 600 .env.production .env.external-edge .env.development
```

Docker environment variables are not a secret-management system against a compromised/root Docker host. The threat model assumes the Docker host and Docker daemon are trusted. For larger deployments, use an external secret-management mechanism appropriate to the platform.

## Persistent data

Private application state is stored in the app-only named volume. It can contain normalized private QSO records, encrypted Wavelog configuration/token, settings, the private LoTW confirmation cache, and the current sanitized public snapshot.

Do not publish or back up the volume to a public location. Backups should receive the same protection as the original private data.

## Public endpoints

The intended public surface is:

- `/embed`
- `/api/public`
- `/api/world`
- `/static/qrz.png`
- browser JS/CSS under `/assets`

HTML files in the public source directory are blocked from the generic `/assets` mount; `/admin` and `/embed` are served through their dedicated routes/headers.

The external-edge mode additionally blocks admin routes at the upstream public proxy.

## Admin endpoints

Application admin endpoints are:

- `/admin`
- `/api/admin/*`

Admin requires Basic Auth; mutation requests also require CSRF protection. Production additionally requires the IP/CIDR allowlist.

In external-edge mode the effective allowlist is loopback-only and the upstream public proxy denies admin routes, so administration happens through the documented SSH tunnel.

If you add Cloudflare, another reverse proxy, Kubernetes ingress, or a load balancer, review `TRUST_PROXY` and the actual forwarded-client-IP path before relying on client-IP allowlisting or rate limiting.

## Wavelog

Use a Wavelog API v2 token with only:

```text
qso:read
confirmation:read
```

Normal deployments should leave:

```dotenv
ALLOW_PRIVATE_WAVELOG=false
ALLOW_INSECURE_WAVELOG=false
```

For each QSO/confirmation API request, the network guard re-resolves the Wavelog hostname, validates all results, normalizes IPv4-mapped IPv6, and pins the actual socket to one validated address. Redirects are rejected and the original hostname is preserved for TLS certificate validation.

Production defaults also limit one Wavelog API response to 16 MiB and LoTW confirmation traversal to 500,000 records. Oversized confirmation refreshes retain the previous successful confirmation cache.

Enable private/insecure Wavelog options only for intentional private-network/local arrangements. HTTPS remains preferred even on private networks.

Detailed behavior is in `docs/NETWORK_BOUNDARY_HARDENING.md`.

## Legacy `compose.yaml`

`compose.yaml` remains temporarily for existing installations. It uses the same hardened Dockerfile, admin allowlist requirement, trusted-proxy policy and Wavelog resource limits, but uses the traditional `.env` filename.

New installs should choose one explicit mode rather than relying on the legacy file.

## Before exposing a server to the Internet

Confirm the requirements for the deployment mode you selected. At minimum:

- app port 3000 is not publicly published;
- runtime environment files contain unique secrets and are not tracked;
- `TRUST_PROXY` matches the real proxy topology;
- Wavelog token has only `qso:read` + `confirmation:read`;
- `ALLOW_INSECURE_WAVELOG=false` unless explicitly required;
- `ALLOW_PRIVATE_WAVELOG=false` unless explicitly required;
- public coordinate precision and optional fields have been reviewed in Admin;
- `/api/public` contains only information you intend to make public;
- host/Docker/proxy components are patched and backups/logs are protected.

For external-edge mode also verify public admin routes are blocked, the private proxy listener binds only to VPS loopback, and Cloudflare-only origin rules do not interfere with Docker egress.

See `SECURITY.md`, `docs/SECURITY_PRIVACY_HARDENING.md`, `docs/NETWORK_BOUNDARY_HARDENING.md`, and `docs/EXTERNAL_EDGE_DEPLOYMENT.md` for the relevant threat model and controls.
