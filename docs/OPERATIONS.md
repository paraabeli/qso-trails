# QSO Trails Operations

This is the canonical operations guide for production/development deployment, Wavelog/LoTW synchronization, public themes, Earth imagery, logging, backups and upgrades.

## Deployment modes

### Production

Use `compose.prod.yaml` with `.env.production`:

```bash
cp .env.production.example .env.production
# Edit every placeholder.
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
```

Production topology:

```text
Internet -> Caddy :80/:443 -> private Docker network -> app:3000
```

The app has no public host-port mapping. `ADMIN_ALLOWED_IPS` is required by the production policy and should contain only trusted administration addresses/CIDRs, preferably VPN/Tailscale addresses.

Generate separate random values for `ADMIN_PASSWORD` and `CONFIG_ENCRYPTION_KEY`. Runtime `.env*` files are excluded from Git and Docker build context; still protect them on the host (`chmod 600`).

### Development / local POC

Use `compose.dev.yaml` with `.env.development`:

```bash
cp .env.development.example .env.development
docker compose --env-file .env.development -f compose.dev.yaml up -d --build
```

Development binds only `127.0.0.1:3000:3000`. Do not change this to `3000:3000` or `0.0.0.0:3000:3000` on an untrusted network.

### Compatibility stack

`compose.yaml` remains for older deployments using `.env`. New installations should prefer the explicit prod/dev files. The compatibility stack uses the same hardened image, Admin allowlist policy and Caddy logging configuration as production.

## Wavelog and LoTW

Use a Wavelog API v2 token with only:

```text
qso:read
confirmation:read
```

Normal production defaults:

```dotenv
ALLOW_PRIVATE_WAVELOG=false
ALLOW_INSECURE_WAVELOG=false
```

Enable either only for a deliberate private/local Wavelog deployment. Wavelog connections are DNS-validated and pinned to an approved address at connection time; redirects are rejected and individual responses/LoTW confirmation pagination have safety caps.

After first enabling LoTW support, run **Full resync** once. Incremental QSO sync uses QSO IDs; LoTW confirmation refresh uses the confirmation endpoint because a later LoTW confirmation does not change the original QSO ID.

Map filter choices:

- all selected QSOs;
- LoTW-confirmed QSOs only.

Embed count choices:

- QSO count;
- LoTW-confirmed count;
- both.

## Privacy controls

The public renderer receives only `public-snapshot.json`, never the raw QSO store or Wavelog token. Callsign, mode, date, time, remote grid, station label and DXCC aggregates are server-controlled opt-ins. Public coordinate precision can be 4-character grid center, 6-character grid center or exact.

A public path map necessarily reveals the configured public/rounded home point and public endpoints required to draw selected paths. Treat anything returned by `/api/public` or rendered into the embed/static image as public.

## Themes

### Embed themes

The embed supports:

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

`earth` switches to a real-world NASA Blue Marble background with a QSO overlay. The browser requests the image only from the same QSO Trails origin; it never contacts NASA directly.

### Static themes

The static PNG supports the original themes plus:

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

Use for example:

```text
/static/qrz.png?projection=globe&theme=aurora
/static/qrz.png?projection=mercator&theme=earth
```

Presentation switches remain available: `name=0`, `stats=0`, `legend=0`, `dxcc=0`, `updated=0`.

## NASA Blue Marble imagery

The `earth` theme uses NASA Visible Earth, **The Blue Marble: Land Surface, Ocean Color and Sea Ice**, from the fixed NASA source:

```text
https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.png
```

QSO Trails downloads this server-side only when required, limits the download size, validates the PNG, downsamples it to a local 1024×512 cache and stores it in the private app data volume. Subsequent embed/static requests use the local same-origin cache. If the upstream image is unavailable and there is no valid local cache, static rendering safely falls back to the vector map and the interactive Earth overlay falls back to the normal renderer.

NASA states its imagery is generally not subject to U.S. copyright, subject to NASA media/identity usage rules. Attribute the source as **NASA Blue Marble / NASA Visible Earth** and do not imply NASA endorsement. Review NASA's current media usage guidelines before commercial redistribution or branding changes.

## Production logging and retention

Production web access logging is configured in `Caddyfile.prod` and deliberately minimizes retained traffic information.

Caddy access logs:

- roll every day at midnight or at 20 MiB, whichever comes first;
- keep no more than 30 rolled files;
- delete logs older than **720 hours / 30 days**;
- use owner-only `0600` files;
- mask IPv4 client addresses to 16 bits and IPv6 to 32 bits;
- remove query strings from logged URIs;
- remove request and response headers;
- skip `/assets/*` and favicon traffic.

The retained access record is intended to contain only basic operational data such as timestamp, masked source network, method/path, response status, response size and duration. Authentication headers/cookies/query values are not retained by this policy.

Logs live in the `caddy_logs` named Docker volume mounted only into Caddy. Do not publish or back up that volume indefinitely. The application and Caddy runtime stdout/stderr also use Docker's bounded `local` logging driver with small size/file caps; those runtime logs are for diagnostics and are not the canonical web-traffic history.

To inspect recent access logs:

```bash
docker compose --env-file .env.production -f compose.prod.yaml exec caddy \
  sh -c 'tail -n 100 /var/log/qso-trails/access.log'
```

To delete all retained access logs immediately:

```bash
docker compose --env-file .env.production -f compose.prod.yaml exec caddy \
  sh -c 'rm -f /var/log/qso-trails/access*.log /var/log/qso-trails/access*.log.gz'
```

## Persistent data and backups

The app data volume can contain raw/normalized QSOs, encrypted Wavelog configuration, LoTW confirmation state, settings, public snapshot and the cached Earth texture. Protect backups at least as strongly as the live volume. Caddy never mounts the QSO data volume.

Back up `CONFIG_ENCRYPTION_KEY` separately and securely; changing/loss of it prevents decryption of the stored Wavelog token.

## Upgrades

```bash
git pull
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
```

After upgrading:

1. confirm `docker compose ... ps` is healthy;
2. inspect `/api/public` and Admin's **What the Internet sees**;
3. check an embed theme and static PNG;
4. confirm app port 3000 is not publicly published;
5. confirm `Caddyfile.prod` validates and new access logs are rolling in `caddy_logs`.

## Public endpoints

Intentionally public:

```text
/embed
/api/public
/api/world
/static/qrz.png
/assets/*.js
/assets/*.css
/assets/earth-blue-marble.png   # generated local cache when used
```

Admin endpoints require authentication, CSRF protection for mutations and the production network allowlist.

## Troubleshooting

If `earth` does not load, first try another theme. The map should remain usable. Then check app logs for the NASA cache fetch/PNG validation path and confirm the server can make outbound HTTPS requests to `eoimages.gsfc.nasa.gov`.

If Admin is unreachable in production, verify `ADMIN_ALLOWED_IPS` and the documented trusted-proxy topology before weakening the allowlist.

For security/privacy architecture and disclosure policy, see root `SECURITY.md`. For implementation structure, see `docs/ARCHITECTURE.md`; for contribution/testing details, see `docs/DEVELOPMENT.md`.
