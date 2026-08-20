# Wavelog QSO Globe

Self-hosted QSO globe for Wavelog/ADIF logs with an **admin-controlled public iframe**.

The public iframe cannot choose arbitrary bands or modes. The server filters the stored QSO data according to the selections saved in `/admin`, then `/api/public` returns only the allowed contacts.

## Features

- Direct **Wavelog API v2** synchronization
- Incremental sync using Wavelog `since_id`
- Optional automatic background sync
- Upload Wavelog `.adi` / `.adif` as a fallback
- Uses `LAT`/`LON` when available, otherwise `GRIDSQUARE`
- Great-circle QSO paths
- 3D-style rotating globe
- Natural Earth / `world-atlas` country outlines
- Admin selects one or many public bands
- Admin selects one or many public modes (CW, SSB, FT8, etc.)
- Optional public QSO count
- Optional callsign exposure
- Configurable maximum rendered paths
- Public iframe endpoint: `/embed`
- Basic-auth protected admin: `/admin`
- JSON persistence; no database required

## Requirements

- Node.js 20+
- npm
- Wavelog 3.1.0+ for API v2 synchronization

## Install

```bash
cp .env.example .env
npm install
```

Set environment variables before starting. `.env` is only an example file; this app intentionally does not load it automatically.

Linux/macOS example:

```bash
export ADMIN_USER=admin
export ADMIN_PASSWORD='use-a-long-random-password'
export PUBLIC_BASE_URL='https://qso.example.com'
export PORT=3000
npm start
```

PowerShell:

```powershell
$env:ADMIN_USER="admin"
$env:ADMIN_PASSWORD="use-a-long-random-password"
$env:PUBLIC_BASE_URL="https://qso.example.com"
$env:PORT="3000"
npm start
```

Then open:

- Admin: `http://localhost:3000/admin`
- Public iframe: `http://localhost:3000/embed`

## Wavelog API sync

In Wavelog create an **API v2 token** with the read-only permission:

```text
qso:read
```

Wavelog API v2 tokens use Bearer authentication and normally start with `wl2_`.

In `/admin`:

1. Enter the base URL of your Wavelog instance, e.g. `https://log.example.com`.
2. Enter the API v2 token.
3. Optionally enter one or more station IDs, comma-separated. Leave blank for all stations available to that token.
4. Click **Test connection**.
5. Click **Sync new QSOs** for incremental synchronization.
6. Use **Full resync** if you want to rebuild the local QSO store from Wavelog.
7. Optionally enable scheduled synchronization.

The first incremental sync behaves as a full sync. Later syncs remember the highest Wavelog QSO ID and request only newer contacts using `since_id`.

The API credential is stored locally in `data/wavelog.json`; this file is ignored by Git and should not be made public.

## Admin workflow

1. Sign in at `/admin`.
2. Synchronize Wavelog or upload an ADIF export.
3. Set your Maidenhead locator.
4. Check the bands that are allowed publicly.
5. Check the modes that are allowed publicly.
6. Choose public display options.
7. Click **Publish selected view**.
8. Copy the generated iframe HTML.

If no bands or no modes are selected, the public iframe intentionally displays zero QSOs.

## QRZ-style iframe

After setting `PUBLIC_BASE_URL`, the admin page generates code similar to:

```html
<iframe
  src="https://qso.example.com/embed"
  width="100%"
  height="620"
  style="border:0"
  loading="lazy">
</iframe>
```

Whether a third-party site accepts the iframe is controlled by that site's HTML/security policy.

## Data privacy

The `/api/public` endpoint is filtered on the server. Contacts outside the admin-selected band/mode set are not returned to the browser.

When **Show callsigns** is disabled, callsigns are stripped on the server before the public response is sent.

The public payload still contains the coordinates, band/mode, date/time, and grid information required by the visualization. For a privacy-focused deployment, publish only the contacts you are comfortable making public.

## Docker

```bash
export ADMIN_PASSWORD='use-a-long-random-password'
export PUBLIC_BASE_URL='https://qso.example.com'
docker compose up -d --build
```

The `data/` directory is mounted into the container and persists settings, QSO data, sync state, and the Wavelog API configuration.

## Deployment

A simple setup is:

```text
Internet
   |
 HTTPS reverse proxy (Caddy / nginx / Traefik)
   |
 Node app :3000
```

Use HTTPS and change the default admin password before exposing `/admin` publicly.

The app is intended as a small self-hosted station service. It does not currently implement multi-user accounts or CSRF tokens. Put it behind HTTPS and consider additional reverse-proxy rate limiting if it is exposed broadly.

## World map source

The globe uses the `world-atlas` package, derived from Natural Earth data, loaded via jsDelivr and converted with `topojson-client`.

## License

Application code in this repository is provided under the MIT License. Third-party map data/libraries retain their own licenses.
