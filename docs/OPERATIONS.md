# QSO Trails operations

This is the canonical operator manual. It replaces the older deployment-, LoTW-, network-hardening-, local-POC-, and external-edge-specific manuals.

## 1. Deployment modes

### Standalone production

Use `compose.prod.yaml` with `.env.production`:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
# Edit every placeholder.
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
```

Topology:

```text
Internet -> Caddy :80/:443 -> private Docker network -> app:3000
```

The app has no public host-port mapping. `ADMIN_ALLOWED_IPS` is required by production policy and should contain only trusted administration IPs/CIDRs, preferably VPN/Tailscale addresses.

Generate separate random `ADMIN_PASSWORD` and `CONFIG_ENCRYPTION_KEY` values. Runtime `.env*` files are excluded from Git and Docker build contexts, but remain sensitive host files.

### Development / local POC

Use `compose.dev.yaml` with `.env.development`:

```bash
cp .env.development.example .env.development
docker compose --env-file .env.development -f compose.dev.yaml up -d --build
```

The app binds only `127.0.0.1:3000:3000`. Never replace this with `3000:3000` or `0.0.0.0:3000:3000` on an untrusted network.

### Compatibility production stack

`compose.yaml` remains for existing installs using `.env`. New installations should prefer the explicit production/development files. The compatibility stack uses the same hardened image, Admin allowlist policy and minimal Caddy logging policy as standalone production.

### Existing external edge / Cloudflare + Caddy

Use `compose.external-edge.yaml` when an existing public edge proxy already owns ports 80/443. QSO Trails joins the configured external Docker network and does not publish app port 3000.

Create `.env.external-edge` from `.env.external-edge.example`, protect it with mode 0600, and keep the effective Admin allowlist loopback-only. The sample edge config is `infra/caddy/external-edge.Caddyfile.example`.

The recommended public edge behavior is:

- proxy public QSO routes to `qso-trails:3000`;
- return 404 for `/admin`, `/admin/*`, and `/api/admin/*` on the public hostname;
- expose a separate Caddy admin listener only on VPS loopback (example `127.0.0.1:3300`);
- reach that listener through an SSH local forward;
- if forwarding Cloudflare's client IP, lock origin web ports to Cloudflare ranges so arbitrary clients cannot spoof `CF-Connecting-IP`.

Repository helpers remain available:

```text
scripts/qso-admin-tunnel.sh
scripts/deploy-external-edge.sh
scripts/cloudflare-origin-lock.sh
infra/systemd/qso-trails-deploy@.service/.timer
infra/systemd/qso-trails-cloudflare-origin-lock.service/.timer
```

Validate the external-edge Compose file and shared Docker network before starting it. Do not use `down -v` during routine updates because that deletes the persistent data volume.

## 2. Wavelog and LoTW

Create a Wavelog API v2 token with only:

```text
qso:read
confirmation:read
```

Normal production defaults:

```dotenv
ALLOW_PRIVATE_WAVELOG=false
ALLOW_INSECURE_WAVELOG=false
```

Enable either only for a deliberate private/local Wavelog deployment. Wavelog requests are DNS-validated and socket-pinned at connection time; redirects are rejected; individual responses and LoTW confirmation traversal are bounded.

After first enabling LoTW support, run **Full resync** once. Incremental QSO sync uses QSO IDs, while LoTW refresh uses the confirmation endpoint because a later confirmation does not change the original QSO ID.

Map choices:

- all selected QSOs;
- LoTW-confirmed QSOs only.

Embed count choices:

- QSO count;
- LoTW-confirmed count;
- both.

## 3. Public privacy model

The public renderer receives only the sanitized public snapshot, never the raw QSO store or Wavelog token. Callsign, mode, date, time, remote grid, station label and DXCC aggregates are server-controlled opt-ins. Coordinate precision can be 4-character grid center, 6-character grid center or exact.

A public path map necessarily reveals the configured public/rounded home point and public endpoints required to draw selected paths. Treat anything returned by `/api/public` or rendered in `/embed` or `/static/qrz.png` as public.

## 4. Themes

### Interactive embed

Use `theme=` with:

```text
night
ocean
light
midnight
aurora
amber
mono
ice
earth
```

`earth` displays real-world NASA Blue Marble imagery with the sanitized QSO overlay. Advanced globe controls/replay remain available on the normal vector themes; Earth mode focuses on the photographic world view.

### Static image

Static PNG themes:

```text
retro
clean
futuristic
rough
midnight
aurora
amber
mono
ice
earth
```

Examples:

```text
/static/qrz.png?projection=globe&theme=aurora
/static/qrz.png?projection=mercator&theme=earth
```

Presentation flags remain `name=0`, `stats=0`, `legend=0`, `dxcc=0`, and `updated=0`.

## 5. Real Earth imagery

Earth mode uses NASA Visible Earth's **The Blue Marble: Land Surface, Ocean Color and Sea Ice** from this fixed source:

```text
https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.png
```

The visitor's browser never contacts NASA. QSO Trails downloads the image server-side only when needed, rejects redirects, limits download size/time, validates the PNG, downsamples it to 1024×512, and stores the cache as `/app/data/earth-blue-marble.png` with private file permissions. Both embed and static output then use the same-origin/local copy.

If NASA is unavailable and no valid cache exists, QSO Trails falls back to the normal vector renderer rather than exposing another map provider or failing the public map.

NASA states its media is generally not subject to U.S. copyright, subject to its media/identity guidelines. Credit the imagery as **NASA Blue Marble / NASA Visible Earth** and do not imply NASA endorsement. Review NASA's current media usage guidance if the distribution context changes.

## 6. Production web logging: minimal, maximum 30 days

`Caddyfile.prod` is the canonical standalone-production access-log policy.

Access logs:

- rotate daily at midnight or at 20 MiB, whichever comes first;
- keep at most 30 rolled files;
- remove files older than `720h` / 30 days;
- use file mode `0600`;
- mask IPv4 client addresses to `/16` and IPv6 to `/32`;
- remove query strings from logged URIs;
- remove request and response headers;
- skip `/assets/*` and favicon noise.

The goal is to retain only operationally useful fields such as time, masked source network, HTTP method/path, response status, response size and duration. Authorization/cookie/header contents and query values are deliberately not part of the retained web-traffic history.

Logs are stored in the `caddy_logs` named volume mounted only into Caddy. Application/Caddy stdout and stderr separately use Docker's bounded `local` logging driver with small size/file limits; those runtime logs are diagnostic buffers, not long-term web analytics.

Inspect recent web logs:

```bash
docker compose --env-file .env.production -f compose.prod.yaml exec caddy \
  sh -c 'tail -n 100 /var/log/qso-trails/access.log'
```

Delete retained standalone-Caddy access logs immediately if required:

```bash
docker compose --env-file .env.production -f compose.prod.yaml exec caddy \
  sh -c 'rm -f /var/log/qso-trails/access*.log /var/log/qso-trails/access*.log.gz'
```

For external-edge deployments, logging/retention belongs to the existing edge proxy. Apply the same privacy principles and 30-day maximum there; `Caddyfile.prod` is not used by `compose.external-edge.yaml`.

## 7. Persistent data and backups

The app data volume may contain raw/normalized QSOs, encrypted Wavelog configuration, LoTW state, settings, sanitized snapshot, and the cached Earth texture. Protect backups at least as strongly as live data. Standalone Caddy does not mount the QSO data volume.

Back up `CONFIG_ENCRYPTION_KEY` separately and securely; losing/changing it prevents decryption of the stored Wavelog token.

## 8. Updates and rollback

Standalone production update:

```bash
git pull
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
```

After upgrading:

1. verify containers are healthy;
2. inspect Admin's **What the Internet sees** and `/api/public`;
3. verify one embed theme plus a static PNG;
4. confirm host port 3000 is not published;
5. confirm Caddy access logs rotate in `caddy_logs`.

External-edge deployments can use `scripts/deploy-external-edge.sh` and the provided systemd service/timer. The deploy helper refuses dirty or non-fast-forward state.

For rollback, check out a known-good commit and rebuild/reconcile without deleting the named data volume.

## 9. Public endpoints

Intentionally public:

```text
/embed
/api/public
/api/world
/static/qrz.png
/assets/*.js
/assets/*.css
/assets/earth-blue-marble.png   # local cache when Earth mode is used
```

Admin routes require application authentication/CSRF controls plus the chosen production network boundary.

## 10. Troubleshooting

If Earth mode does not load, switch to another theme first: the map should remain usable. Then check app logs and outbound HTTPS access to `eoimages.gsfc.nasa.gov`. A valid existing Earth cache avoids any upstream request.

If Admin is unreachable, verify `ADMIN_ALLOWED_IPS`, the supported proxy topology, and—on external-edge installs—the SSH/loopback listener before weakening network restrictions.

If Caddy will not start after logging changes, run the Caddy validation command from CI against `Caddyfile.prod` before changing security settings.

See `SECURITY.md` for threat model/reporting, `docs/ARCHITECTURE.md` for runtime boundaries, and `docs/DEVELOPMENT.md` for contribution/testing.
