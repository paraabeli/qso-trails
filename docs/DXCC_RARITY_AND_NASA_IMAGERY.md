# DXCC rarity and NASA imagery

## DXCC rarity source

QSO Trails uses the official Club Log Most Wanted JSON API:

- API documentation: `https://clublog.freshdesk.com/support/solutions/articles/76225-most-wanted-list-json-api`
- JSON endpoint: `https://clublog.org/mostwanted.php?api=1`

The API returns Most Wanted position mapped to an ADIF DXCC entity number. QSO Trails converts that response to `DXCC -> rank`, then compares it locally with the `DXCC` value already present in imported ADIF/Wavelog QSOs.

No QSO record, callsign, grid, coordinate, Wavelog token, or station identifier is sent to Club Log. The only Club Log request is for the same global Most Wanted list for every QSO Trails installation.

The ranking is cached in `data/clublog-most-wanted.json` and refreshed at most once per 24 hours. If an update fails but a prior cache exists, QSO Trails continues with the stale cache and marks the source as cached/stale. If no ranking is available, normal DXCC statistics continue to work and the rarest-worked list is empty.

Club Log updates the underlying Most Wanted list on its own schedule; the daily QSO Trails refresh merely avoids keeping an old published ranking longer than necessary.

The public snapshot exposes only an aggregate top-three result containing DXCC number, country label when already available, Most Wanted position, and QSO count. It does not expose additional per-QSO DXCC metadata.

## NASA Blue Marble: Next Generation

The `earth` theme uses NASA Earth Observatory **Blue Marble: Next Generation — December, with topography and bathymetry**.

Reference page:

`https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/`

NASA-hosted PNG source used by the renderer:

`https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.png`

The source is a 2:1 equirectangular global image. QSO Trails downloads it only on the server, validates and decodes it with bounded resource limits, then stores a 4096×2048 local PNG cache at `data/earth-blue-marble-ng-200412.png`. The interactive WebGL globe is served a 2048×1024 derivative to remain compatible with lower WebGL texture limits. Static rendering uses the higher-resolution cache.

Visitor browsers request `/assets/earth-blue-marble.png` from the QSO Trails host; they do not contact NASA.

NASA Earth Observatory requests the credit **NASA Earth Observatory** for republication of Blue Marble: Next Generation imagery. QSO Trails displays `NASA Earth Observatory · Blue Marble: Next Generation` in the interactive Earth view and includes `NASA EARTH OBSERVATORY / BLUE MARBLE NEXT GENERATION` in the static-image information box.

## Static image sizing

`/static/qrz.png` accepts a bounded `width` query parameter:

- minimum: 320 px
- default: 640 px
- maximum: 3840 px
- maximum rendered pixel count: 12,000,000

The Admin UI exposes the same width control and emits the selected dimensions in the QRZ/static image snippet.

For the NASA `earth` theme, output remains 2:1 to match the source imagery. Examples:

- `width=640` → 640×320
- `width=1920` → 1920×960
- `width=3840` → 3840×1920

Other static themes preserve the established QSO Trails 640×500 card ratio while scaling to the selected width.

Large rendered images use a byte-bounded in-process cache so repeated 4K requests cannot create an unbounded memory cache. Existing per-client static-image rate limiting still applies.

## Updating sources

When changing the Club Log source, keep DXCC matching based on the ADIF numeric entity identifier and retain the rule that user QSO data is never sent to the ranking provider.

When changing NASA imagery, verify all of the following before changing `earth-texture.js`:

1. the asset is an official NASA-hosted Blue Marble: Next Generation global map suitable for equirectangular texture mapping;
2. the source page and asset URL are documented here and in `THIRD_PARTY_NOTICES.md`;
3. visible NASA Earth Observatory credit remains in both interactive and static uses;
4. the download and decode limits remain bounded; and
5. the cached image preserves a 2:1 aspect ratio for static exports.
