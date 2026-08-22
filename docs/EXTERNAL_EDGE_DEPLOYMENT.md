# External Cloudflare/Caddy deployment with SSH-only admin

This deployment mode is for a VPS that already has a public Caddy reverse proxy and Cloudflare in front of it.

It keeps QSO Trails in its own checkout and container while reusing the existing edge proxy.

Example names in this guide:

```text
Main site:        https://example.com
QSO Trails:       https://qso.example.com
Shared network:   edge-web
QSO checkout:     /opt/qso-trails
Private admin:    127.0.0.1:3300 on the VPS
```

Replace these examples with your own values.

## Architecture

```text
PUBLIC

Browser
  |
  | HTTPS
  v
Cloudflare
  |
  | HTTPS
  v
existing Caddy :443
  |
  `--> qso.example.com --> qso-trails:3000
                               |
                               `--> qso-trails-data

PRIVATE ADMIN

Workstation
  |
  | SSH local forward
  v
VPS 127.0.0.1:3300
  |
  v
existing Caddy :3300
  |
  `--> qso-trails:3000
```

The QSO Trails application port `3000` is never published on the host.

The public QSO hostname serves the public viewer and public APIs, but Caddy returns `404` for `/admin` and `/api/admin/*` before those requests reach the application.

The admin interface is reached only through an SSH tunnel to a Caddy listener bound on the VPS loopback interface.

QSO Trails Basic Auth and CSRF protections remain enabled behind the SSH boundary.

## When to use this mode

Use `compose.external-edge.yaml` when:

- the VPS already has Caddy or another Dockerized edge proxy owning ports `80` and `443`;
- Cloudflare proxies the public QSO hostname;
- QSO Trails should share a private Docker network with that edge proxy;
- public admin access should be disabled;
- SSH is the intended admin transport.

Use the normal `compose.prod.yaml` instead when QSO Trails should run its own standalone Caddy.

## Files used by this mode

```text
.env.external-edge.example
compose.external-edge.yaml
infra/caddy/external-edge.Caddyfile.example
scripts/qso-admin-tunnel.sh
scripts/deploy-external-edge.sh
scripts/cloudflare-origin-lock.sh
infra/systemd/qso-trails-deploy@.service
infra/systemd/qso-trails-deploy@.timer
infra/systemd/qso-trails-cloudflare-origin-lock.service
infra/systemd/qso-trails-cloudflare-origin-lock.timer
```

Runtime `.env.external-edge` is ignored by Git and Docker build context.

## 1. DNS

Create a proxied Cloudflare DNS record for QSO Trails:

```text
Type   Name   Content          Proxy
A      qso    YOUR_VPS_IP      Proxied
```

Use an `AAAA` record only if the VPS and firewall are intentionally configured for IPv6.

The resulting public URL in this example is:

```text
https://qso.example.com
```

Keep Cloudflare SSL/TLS mode on:

```text
Full (strict)
```

## 2. Origin certificate

The existing Caddy edge needs a certificate valid for `qso.example.com` on the Cloudflare-to-origin TLS hop.

A Cloudflare Origin CA certificate covering both the apex and wildcard is convenient:

```text
example.com
*.example.com
```

The sample Caddyfile expects the edge container to see:

```text
/certs/origin.pem
/certs/origin-key.pem
```

Adapt those paths to your edge deployment.

Never commit the certificate private key.

## 3. Shared Docker network

The edge Caddy and QSO Trails must share one Docker network.

This guide uses:

```text
edge-web
```

If the existing edge Compose stack creates that network, give it an explicit stable name:

```yaml
networks:
  edge:
    name: edge-web
```

The QSO Trails companion Compose treats the network as external:

```yaml
networks:
  edge:
    external: true
    name: ${EDGE_NETWORK:-edge-web}
```

Confirm it exists before starting QSO Trails:

```bash
docker network inspect edge-web >/dev/null && echo ok
```

If no edge stack has created it yet:

```bash
docker network create edge-web
```

## 4. Clone and configure QSO Trails

Recommended checkout path:

```bash
git clone https://github.com/OWNER/qso-trails.git /opt/qso-trails
cd /opt/qso-trails
```

Create the runtime environment:

```bash
cp .env.external-edge.example .env.external-edge
chmod 600 .env.external-edge
```

Example:

```dotenv
DOMAIN=qso.example.com
EDGE_NETWORK=edge-web
QSO_DATA_VOLUME=qso-trails-data

ADMIN_USER=admin
ADMIN_PASSWORD=REPLACE_WITH_RANDOM_20_PLUS_CHAR_PASSWORD
CONFIG_ENCRYPTION_KEY=REPLACE_WITH_SEPARATE_RANDOM_32_PLUS_CHAR_KEY
ADMIN_ALLOWED_IPS=127.0.0.1

EMBED_FRAME_ANCESTORS='self' https://example.com

ALLOW_INSECURE_WAVELOG=false
ALLOW_PRIVATE_WAVELOG=false
```

Generate independent secrets, for example:

```bash
openssl rand -base64 32
openssl rand -base64 48
```

Do not reuse the admin password as the encryption key.

`compose.external-edge.yaml` explicitly overrides the effective value of:

```dotenv
ADMIN_ALLOWED_IPS=127.0.0.1
```

This prevents a stale or broad value in the env file from accidentally changing the SSH-only admin model.

## 5. Add QSO Trails routes to the existing Caddy

Use [`../infra/caddy/external-edge.Caddyfile.example`](../infra/caddy/external-edge.Caddyfile.example) as a reference.

The important public site block is:

```caddyfile
qso.example.com {
  tls /certs/origin.pem /certs/origin-key.pem
  encode zstd gzip

  @admin path /admin /admin/* /api/admin/*
  respond @admin 404

  reverse_proxy qso-trails:3000 {
    header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}
    header_up X-Real-IP {http.request.header.CF-Connecting-IP}
  }
}
```

The public route intentionally blocks:

```text
/admin
/admin/*
/api/admin/*
```

Public endpoints such as these remain reachable:

```text
/embed
/api/public
/api/world
/static/qrz.png
/assets/*
```

### Client-IP forwarding requirement

Forwarding `CF-Connecting-IP` is safe only when ordinary Internet clients cannot connect directly to the origin and spoof that header.

For this pattern, keep public origin ports restricted to Cloudflare source networks as described later in this guide.

Do not blindly copy the `CF-Connecting-IP` forwarding rule to an origin that accepts arbitrary direct Internet traffic.

## 6. Add the loopback-only admin listener

Add this Caddy listener:

```caddyfile
:3300 {
  reverse_proxy qso-trails:3000 {
    header_up X-Forwarded-For 127.0.0.1
    header_up X-Real-IP 127.0.0.1
  }
}
```

The Caddy container must publish that listener only on VPS loopback.

Example addition to the **existing edge Caddy service**:

```yaml
services:
  caddy:
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
      - "127.0.0.1:3300:3300"
    networks:
      - edge
```

Do **not** write:

```yaml
- "3300:3300"
```

because that exposes the private admin listener on public interfaces.

Verify host binding after recreating Caddy:

```bash
ss -ltnp | grep ':3300'
```

Expected address:

```text
127.0.0.1:3300
```

There should be no `0.0.0.0:3300` or public-address binding.

## 7. Start QSO Trails

Validate first:

```bash
cd /opt/qso-trails

docker compose \
  --env-file .env.external-edge \
  -f compose.external-edge.yaml \
  config
```

Confirm:

- there is only the QSO Trails application service;
- application port `3000` has no `ports:` mapping;
- the application joins `edge-web`;
- `ADMIN_ALLOWED_IPS` resolves to `127.0.0.1`;
- persistent data uses the intended named volume.

Start it:

```bash
docker compose \
  --env-file .env.external-edge \
  -f compose.external-edge.yaml \
  up -d --build
```

Check:

```bash
docker compose \
  --env-file .env.external-edge \
  -f compose.external-edge.yaml \
  ps
```

Logs:

```bash
docker compose \
  --env-file .env.external-edge \
  -f compose.external-edge.yaml \
  logs --tail=100 app
```

## 8. Verify public behavior

Through Cloudflare:

```bash
curl -I https://qso.example.com/embed
curl -I https://qso.example.com/api/public
curl -I https://qso.example.com/admin
```

Expected behavior:

```text
/embed       -> public response
/api/public  -> public response
/admin       -> 404
```

Verify the application port is not publicly published:

```bash
curl --connect-timeout 3 -I http://YOUR_VPS_IP:3000/ || true
```

That connection should fail.

## 9. Open the private admin interface

From your workstation:

```bash
ssh -N \
  -L 127.0.0.1:3300:127.0.0.1:3300 \
  user@your-vps
```

Then open:

```text
http://127.0.0.1:3300/admin
```

Or use the included helper:

```bash
sh scripts/qso-admin-tunnel.sh user@your-vps
```

The helper binds the workstation side explicitly to `127.0.0.1` and uses `ExitOnForwardFailure=yes`.

You may choose a different local workstation port:

```bash
sh scripts/qso-admin-tunnel.sh user@your-vps 13300
```

Then open:

```text
http://127.0.0.1:13300/admin
```

The VPS-side destination remains `127.0.0.1:3300` by default.

## 10. Configure Wavelog

Use the SSH-only admin interface to configure Wavelog.

Create a Wavelog API v2 token with only:

```text
qso:read
confirmation:read
```

Configure:

- Wavelog HTTPS base URL;
- API v2 token;
- station IDs;
- publication bands/modes;
- coordinate precision;
- optional callsign/mode/date/time/grid publication;
- LoTW/public statistics options;
- automatic sync interval.

Normal Internet-hosted Wavelog deployments should keep:

```dotenv
ALLOW_INSECURE_WAVELOG=false
ALLOW_PRIVATE_WAVELOG=false
```

QSO Trails handles Wavelog synchronization internally. A separate cron/systemd data-sync timer is not required.

## 11. Cloudflare-only origin firewall

Docker-published Caddy ports bypass some traditional host-firewall expectations, so the repository includes:

```text
scripts/cloudflare-origin-lock.sh
```

It installs rules in Docker's `DOCKER-USER` path that:

- download Cloudflare's current IPv4/IPv6 source ranges;
- allow Cloudflare to public TCP `80/443` and UDP `443`;
- drop non-Cloudflare traffic to those public web ports;
- scope the rules to traffic **entering through the VPS external interface**;
- leave Docker/container outbound HTTPS untouched.

The external-interface condition is important. A rule that matches all forwarded destination port `443` traffic can also block Docker builds and application egress to services such as npm or Wavelog.

Apply:

```bash
sudo bash /opt/qso-trails/scripts/cloudflare-origin-lock.sh
```

The script detects the default-route interface automatically.

Override it when necessary:

```bash
sudo EXT_IF=eth0 bash /opt/qso-trails/scripts/cloudflare-origin-lock.sh
```

Inspect:

```bash
sudo iptables -S DOCKER-USER
sudo iptables -S QSO-TRAILS-CLOUDFLARE
```

If Docker IPv6 networking is active:

```bash
sudo ip6tables -S DOCKER-USER
sudo ip6tables -S QSO-TRAILS-CLOUDFLARE
```

### Important scope warning

This helper makes public host ports `80/443` Cloudflare-only for Docker-forwarded traffic entering the selected external interface.

Use it only if every public service on those ports is intended to be behind Cloudflare.

If the VPS hosts unrelated direct-origin web services on the same ports, adapt the policy instead of applying this script unchanged.

## 12. Refresh Cloudflare ranges automatically

Install:

```bash
sudo cp infra/systemd/qso-trails-cloudflare-origin-lock.service /etc/systemd/system/
sudo cp infra/systemd/qso-trails-cloudflare-origin-lock.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now qso-trails-cloudflare-origin-lock.timer
sudo systemctl start qso-trails-cloudflare-origin-lock.service
```

Check:

```bash
systemctl list-timers qso-trails-cloudflare-origin-lock.timer
journalctl -u qso-trails-cloudflare-origin-lock.service -n 100 --no-pager
```

The timer refreshes the source ranges daily and after missed runs.

## 13. Automatic application deployments

The repository includes:

```text
scripts/deploy-external-edge.sh
infra/systemd/qso-trails-deploy@.service
infra/systemd/qso-trails-deploy@.timer
```

The helper:

- refuses a dirty Git working tree;
- fetches the configured branch from `origin`;
- refuses non-fast-forward state;
- pulls only when a newer commit exists;
- rebuilds/reconciles the container when needed;
- preserves the named data volume.

The service assumes the checkout is:

```text
/opt/qso-trails
```

and the deployment user can access Docker.

Install:

```bash
sudo cp infra/systemd/qso-trails-deploy@.service /etc/systemd/system/
sudo cp infra/systemd/qso-trails-deploy@.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

Enable for the Unix user that owns the checkout:

```bash
sudo systemctl enable --now "qso-trails-deploy@${USER}.timer"
```

Run once immediately:

```bash
sudo systemctl start "qso-trails-deploy@${USER}.service"
```

Check:

```bash
systemctl list-timers "qso-trails-deploy@${USER}.timer"
journalctl -u "qso-trails-deploy@${USER}.service" -n 100 --no-pager
```

The timer checks about every five minutes with a small randomized delay.

## 14. Persistent data and backups

Default external-edge volume name:

```text
qso-trails-data
```

It can contain private QSO records, settings, encrypted Wavelog configuration/token, LoTW cache, and the sanitized public snapshot.

Inspect:

```bash
docker volume inspect qso-trails-data
```

Treat backups as private data.

Do not use this during routine updates:

```bash
docker compose -f compose.external-edge.yaml down -v
```

because `-v` deletes the persistent data volume.

## 15. Rollback

Stop QSO Trails without deleting data:

```bash
cd /opt/qso-trails

docker compose \
  --env-file .env.external-edge \
  -f compose.external-edge.yaml \
  stop app
```

Disable automatic app deployment:

```bash
sudo systemctl disable --now "qso-trails-deploy@${USER}.timer"
```

For a code rollback, check out a known-good commit and reconcile the container:

```bash
git checkout KNOWN_GOOD_COMMIT

docker compose \
  --env-file .env.external-edge \
  -f compose.external-edge.yaml \
  up -d --build
```

Do not delete the data volume during a code rollback unless data destruction is explicitly intended.

## 16. Troubleshooting

### Public hostname returns 502

Confirm both containers share the same network:

```bash
docker network inspect edge-web
```

Confirm QSO Trails is healthy:

```bash
docker compose \
  --env-file /opt/qso-trails/.env.external-edge \
  -f /opt/qso-trails/compose.external-edge.yaml \
  ps
```

### Public `/admin` is reachable

The edge Caddy configuration is wrong or has not been reloaded.

Verify the public site contains a matcher equivalent to:

```caddyfile
@admin path /admin /admin/* /api/admin/*
respond @admin 404
```

### SSH tunnel connects but admin returns 403

Confirm the private Caddy listener overwrites both forwarded client-IP headers with `127.0.0.1` and the effective container environment contains:

```text
ADMIN_ALLOWED_IPS=127.0.0.1
```

### SSH tunnel cannot connect to port 3300

On the VPS:

```bash
ss -ltnp | grep ':3300'
```

The edge Caddy service should publish:

```text
127.0.0.1:3300
```

### Docker build times out fetching npm packages

First verify ordinary VPS connectivity.

If the timeout appeared after installing a Docker `DOCKER-USER` web-port firewall, inspect whether its `80/443` drop rules are scoped to the external ingress interface.

The provided `cloudflare-origin-lock.sh` uses `-i "$EXT_IF"` specifically so Docker bridge egress is not classified as inbound public web traffic.

### Wavelog synchronization fails

Inspect app logs and verify the Wavelog hostname, token, station IDs, and network restrictions.

Do not enable private or insecure Wavelog access merely to bypass an unrelated routing/firewall error.

## Final verification checklist

Before considering the deployment complete:

- `qso.example.com` is proxied by Cloudflare;
- Cloudflare uses Full (strict);
- the origin certificate covers `qso.example.com`;
- QSO Trails port `3000` is not host-published;
- edge and QSO containers share only the intended Docker network;
- public `/admin` and `/api/admin/*` return `404`;
- VPS port `3300` listens only on `127.0.0.1`;
- SSH tunnel reaches the admin interface;
- Basic Auth still protects admin;
- `ADMIN_ALLOWED_IPS=127.0.0.1` is effective;
- public QSO privacy settings and `/api/public` were reviewed;
- direct-origin HTTP/HTTPS is blocked when the Cloudflare-only firewall is used;
- Docker/container outbound HTTPS still works after firewall installation;
- the persistent data volume is backed up privately;
- automatic deployment and firewall timers are monitored.
