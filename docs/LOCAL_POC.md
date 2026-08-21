# Local development / POC with Docker

Use the dedicated `compose.dev.yaml` stack for local testing. It deliberately binds the application to `127.0.0.1` only, so Docker does not expose port 3000 on LAN/public interfaces.

> This is a local development path. Do not reuse its credentials in production and do not change the host binding to `0.0.0.0` on an untrusted network.

## 1. Create the development environment file

```bash
cp .env.development.example .env.development
```

Edit `.env.development` and replace the example password/encryption key if the machine is shared or long-lived.

Runtime `.env*` files are ignored by both Git and Docker build context rules. Only the tracked `*.example` templates belong in the repository.

## 2. Start the development stack

```bash
docker compose \
  --env-file .env.development \
  -f compose.dev.yaml \
  up -d --build
```

The Compose file maps only:

```text
127.0.0.1:3000 -> container:3000
```

It does **not** use Caddy or expose ports 80/443.

## 3. Open QSO Trails

Admin:

```text
http://localhost:3000/admin
```

Public embed:

```text
http://localhost:3000/embed
```

Static picture:

```text
http://localhost:3000/static/qrz.png
```

## 4. View logs

```bash
docker compose \
  --env-file .env.development \
  -f compose.dev.yaml \
  logs -f app
```

## 5. Wavelog during local development

A normal public HTTPS Wavelog works with the safe defaults:

```dotenv
ALLOW_PRIVATE_WAVELOG=false
ALLOW_INSECURE_WAVELOG=false
```

If Wavelog runs directly on a Docker Desktop host, `localhost` from inside the QSO Trails container refers to the container itself. Docker Desktop commonly provides:

```text
host.docker.internal
```

For an intentionally local/private Wavelog address set:

```dotenv
ALLOW_PRIVATE_WAVELOG=true
```

If that local Wavelog is also plain HTTP rather than HTTPS, local testing additionally requires:

```dotenv
ALLOW_INSECURE_WAVELOG=true
```

Do not carry those relaxed values into the production environment unless the network design explicitly requires them and the risk has been reviewed.

The Wavelog v2 token should remain read-only with:

```text
qso:read
confirmation:read
```

## 6. Stop without deleting data

```bash
docker compose \
  --env-file .env.development \
  -f compose.dev.yaml \
  down
```

The `qso_data_dev` named volume remains.

To intentionally destroy the local QSO Trails data volume:

```bash
docker compose \
  --env-file .env.development \
  -f compose.dev.yaml \
  down -v
```

## 7. Change the local port safely

If port 3000 is occupied, keep the loopback address and change only the host port, for example:

```yaml
ports:
  - "127.0.0.1:3001:3000"
```

Also set `PUBLIC_BASE_URL` in `compose.dev.yaml` to `http://localhost:3001` for that local customization.

Never replace the binding with just `3001:3000` for a privacy-sensitive local test; an unspecified host address may expose it on all host interfaces.

## Production is different

Production uses:

```bash
cp .env.production.example .env.production
# Replace every placeholder and configure ADMIN_ALLOWED_IPS.
docker compose \
  --env-file .env.production \
  -f compose.prod.yaml \
  up -d --build
```

`compose.prod.yaml` does not publish application port 3000. Only the Caddy service exposes ports 80/443, and the application refuses to start when the required production Admin allowlist is empty.

See `SECURITY.md` and `docs/SECURITY_PRIVACY_HARDENING.md` for the privacy boundary and remaining audit work.
