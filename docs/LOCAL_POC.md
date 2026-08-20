# Local POC on macOS with Docker Desktop

This guide runs QSO Trails locally on a Mac for proof-of-concept testing. It starts only the application container and publishes it on `http://localhost:3000`; Caddy and public HTTPS are intentionally skipped.

> **Local testing only:** the example username/password below are deliberately simple and must not be used for an Internet-facing deployment.

## 1. Prerequisites

Install and start Docker Desktop for Mac. You also need Git and access to the private QSO Trails repository.

Using GitHub CLI is the easiest way to clone a private repository:

```bash
brew install gh
gh auth login
```

Choose **GitHub.com**, **HTTPS**, and complete the browser login.

Clone QSO Trails:

```bash
gh repo clone paraabeli/qso-trails
cd qso-trails
```

## 2. Create the local environment file

Create `.env.local` in the repository root:

```bash
cat > .env.local <<'EOF'
DOMAIN=localhost

ADMIN_USER=admin
ADMIN_PASSWORD=local-poc-password-change-me
CONFIG_ENCRYPTION_KEY=local-poc-encryption-key-32-characters-minimum

ADMIN_ALLOWED_IPS=
EMBED_FRAME_ANCESTORS='self'

ALLOW_INSECURE_WAVELOG=false
ALLOW_PRIVATE_WAVELOG=false
EOF
```

Example local Admin login:

```text
Username: admin
Password: local-poc-password-change-me
```

These credentials are only an example for localhost testing. For any real deployment, use a long unique password and a separately generated encryption key.

## 3. Create a Docker Compose local override

The production Compose configuration does not publish application port `3000` directly because Caddy normally handles HTTPS. For a local POC, create `compose.local.yaml`:

```bash
cat > compose.local.yaml <<'EOF'
services:
  app:
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      PORT: "3000"
      ADMIN_USER: "${ADMIN_USER:-admin}"
      ADMIN_PASSWORD: "${ADMIN_PASSWORD}"
      CONFIG_ENCRYPTION_KEY: "${CONFIG_ENCRYPTION_KEY}"
      PUBLIC_BASE_URL: "http://localhost:3000"
      ADMIN_ALLOWED_IPS: ""
      EMBED_FRAME_ANCESTORS: "'self'"
      ALLOW_INSECURE_WAVELOG: "${ALLOW_INSECURE_WAVELOG:-false}"
      ALLOW_PRIVATE_WAVELOG: "${ALLOW_PRIVATE_WAVELOG:-false}"
EOF
```

## 4. Build and start the application

Start only the `app` service:

```bash
docker compose \
  --env-file .env.local \
  -f compose.yaml \
  -f compose.local.yaml \
  up -d --build app
```

Check container status:

```bash
docker compose \
  --env-file .env.local \
  -f compose.yaml \
  -f compose.local.yaml \
  ps
```

## 5. Open QSO Trails

Admin:

```text
http://localhost:3000/admin
```

Example POC login:

```text
Username: admin
Password: local-poc-password-change-me
```

Interactive public view:

```text
http://localhost:3000/embed
```

Static image:

```text
http://localhost:3000/static/qrz.png
```

Mercator static image example:

```text
http://localhost:3000/static/qrz.png?projection=mercator
```

## 6. View logs

```bash
docker compose \
  --env-file .env.local \
  -f compose.yaml \
  -f compose.local.yaml \
  logs -f app
```

Press `Ctrl+C` to stop following the logs; the container keeps running.

## 7. Connecting to Wavelog

### Public HTTPS Wavelog

If your Wavelog instance is available through a normal public HTTPS hostname, use that URL and leave these values disabled:

```dotenv
ALLOW_PRIVATE_WAVELOG=false
ALLOW_INSECURE_WAVELOG=false
```

### Wavelog running directly on the same Mac

A Docker container's `localhost` points back to the container itself, not to macOS. If Wavelog is running directly on your Mac, use Docker Desktop's host address:

```text
http://host.docker.internal:PORT
```

For example:

```text
http://host.docker.internal:8080
```

For a local HTTP Wavelog POC, change `.env.local` to:

```dotenv
ALLOW_PRIVATE_WAVELOG=true
ALLOW_INSECURE_WAVELOG=true
```

Then rebuild/restart the app:

```bash
docker compose \
  --env-file .env.local \
  -f compose.yaml \
  -f compose.local.yaml \
  up -d --build app
```

`ALLOW_INSECURE_WAVELOG=true` should only be used when intentionally testing an HTTP-only Wavelog endpoint. Keep it `false` for HTTPS.

## 8. Update the local POC

Pull the latest source and rebuild:

```bash
cd qso-trails
git pull

docker compose \
  --env-file .env.local \
  -f compose.yaml \
  -f compose.local.yaml \
  up -d --build app
```

## 9. Stop the POC without deleting data

```bash
docker compose \
  --env-file .env.local \
  -f compose.yaml \
  -f compose.local.yaml \
  down
```

The `qso_data` Docker volume remains available for the next start.

Do **not** use `docker compose down -v` unless you intentionally want to delete the persistent QSO Trails data volume.

## Troubleshooting

### Port 3000 is already in use

Change the override to another host port, for example:

```yaml
ports:
  - "3001:3000"
```

and change:

```yaml
PUBLIC_BASE_URL: "http://localhost:3001"
```

Then open `http://localhost:3001/admin`.

### Admin configuration validation fails

Production mode requires:

- `ADMIN_PASSWORD` to be at least 16 characters and not the default value
- `CONFIG_ENCRYPTION_KEY` to contain at least 32 characters

The example values in this guide satisfy those minimums but are still intended only for localhost testing.

### Wavelog cannot be reached from Docker

If Wavelog is running on the Mac itself, confirm that QSO Trails uses `host.docker.internal` rather than `localhost`. For a private/LAN address, `ALLOW_PRIVATE_WAVELOG=true` is required. For plain HTTP, `ALLOW_INSECURE_WAVELOG=true` is also required.

### Rebuild after pulling changes

If the browser still appears to show an older version after `git pull`, rebuild the application image:

```bash
docker compose \
  --env-file .env.local \
  -f compose.yaml \
  -f compose.local.yaml \
  up -d --build app
```

A hard browser refresh (`Cmd+Shift+R`) can also clear stale page assets during local testing.
