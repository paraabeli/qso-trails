# QSO Trails

**QSO Trails** is a self-hosted amateur-radio QSO visualization service for Wavelog and ADIF logs. It draws great-circle contact paths on an interactive 3D-style world globe and provides an admin-controlled public iframe suitable for profile pages and station websites.

> Name note: this project intentionally avoids the name **QSO Globe**, which is already used by other amateur-radio software.

## Features

- Direct **Wavelog API v2** synchronization
- Incremental Wavelog sync using `since_id`
- Optional automatic synchronization
- Manual `.adi` / `.adif` import
- Uses QSO `LAT` / `LON` when available, otherwise Maidenhead `GRIDSQUARE`
- Great-circle paths from your station to worked stations
- 3D-style rotating globe with Natural Earth / `world-atlas` country outlines
- Admin-selectable public bands and modes
- Optional public QSO count
- Optional callsign exposure
- Callsigns removed **server-side** when public exposure is disabled
- Public iframe endpoint at `/embed`
- Basic-auth protected admin page at `/admin`
- JSON persistence; no database required
- One-file Docker Compose deployment with **Caddy + automatic HTTPS**

## Wavelog requirements

Direct API synchronization uses Wavelog API v2 and requires **Wavelog 3.1.0 or later**.

Create a Wavelog API v2 token with only:

```text
qso:read
```

API v2 tokens begin with `wl2_`. Paste the token and your Wavelog base URL into the QSO Trails admin page.

The token is persisted in the app data volume. Treat the server and its backups as sensitive.

## Fastest production deployment

Requirements:

- A Linux host with Docker Engine and Docker Compose v2.17+
- A DNS name pointing to the host
- TCP ports **80** and **443** reachable from the Internet
- UDP port **443** optional but recommended for HTTP/3

Clone the repository and create `.env`:

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
DOMAIN=qso.example.com
ADMIN_USER=admin
ADMIN_PASSWORD=replace-with-a-long-random-password
```

Start everything:

```bash
docker compose up -d --build
```

That single `compose.yaml`:

1. Builds QSO Trails using an inline Dockerfile.
2. Starts the Node application on the internal Docker network.
3. Starts Caddy.
4. Publishes ports 80/443.
5. Obtains and renews a public TLS certificate automatically.
6. Reverse-proxies `https://$DOMAIN` to the app.
7. Persists QSO settings/data and Caddy certificates in named Docker volumes.

Open:

```text
https://qso.example.com/admin
https://qso.example.com/embed
```

Useful commands:

```bash
docker compose ps
docker compose logs -f
docker compose pull
docker compose up -d --build
docker compose down
```

Do **not** use `docker compose down -v` unless you intend to delete the QSO cache/settings and Caddy certificate state.

## DNS / firewall checklist

Before starting Caddy for a public domain:

- Create an `A` record for `DOMAIN` pointing to the server's public IPv4 address.
- Add an `AAAA` record only if the server really has working public IPv6.
- Forward/open TCP 80 and 443 to the Docker host.
- Optionally open UDP 443 for HTTP/3.
- Make sure another web server is not already bound to ports 80/443.

Caddy obtains HTTPS automatically when the configured hostname resolves to the server.

## Admin workflow

1. Open `/admin`.
2. Enter the Wavelog base URL.
3. Enter a Wavelog API v2 token with `qso:read`.
4. Optionally specify station IDs.
5. Test the connection.
6. Run **Sync new** or **Full resync**.
7. Enter your station/callsign label and home Maidenhead locator.
8. Select the bands allowed in the public view.
9. Select the modes allowed in the public view.
10. Choose whether callsigns and the QSO count may be public.
11. Publish the selected view.
12. Copy the iframe HTML.

The public client cannot override the admin's band/mode selections: `/api/public` is filtered on the server.

## QRZ-style iframe

The admin page generates markup similar to:

```html
<iframe
  src="https://qso.example.com/embed"
  width="100%"
  height="620"
  style="border:0"
  loading="lazy">
</iframe>
```

Whether an external site accepts an iframe is ultimately controlled by that site's HTML and Content Security Policy.

## Manual development

Requires Node.js 20+.

```bash
npm install
ADMIN_PASSWORD='dev-password' PUBLIC_BASE_URL='http://localhost:3000' npm start
```

Then open:

```text
http://localhost:3000/admin
http://localhost:3000/embed
```

## Runtime data

Runtime files are stored in `/app/data` inside the app container and persisted in the `qso_data` Docker volume.

The app may create files including:

```text
qsos.json
settings.json
wavelog.json
```

`wavelog.json` contains the Wavelog API token and must not be committed to Git.

## Security notes

- Change the default/admin password before making the service public.
- Keep the Wavelog API token limited to `qso:read`.
- Use HTTPS for the public deployment.
- Back up the `qso_data` volume if the locally cached settings matter to you.
- The current application is intended for a small self-hosted station deployment; it does not yet provide multi-user accounts, CSRF tokens, or an external secret-management backend.

## World map source

The globe uses `world-atlas`, derived from Natural Earth data, loaded in the public browser and converted using `topojson-client`.

## License

Application code is provided under the MIT License. Third-party libraries and map data retain their own licenses.
