# DXCC rarity and NASA imagery

## DXCC rarity source

QSO Trails uses the official Club Log Most Wanted JSON API:

- API documentation: `https://clublog.freshdesk.com/support/solutions/articles/76225-most-wanted-list-json-api`
- JSON endpoint: `https://clublog.org/mostwanted.php?api=1`

The API returns Most Wanted position mapped to an ADIF DXCC entity number. QSO Trails converts that response to `DXCC -> rank`, then compares it locally with the `DXCC` value already present in imported ADIF/Wavelog QSOs.

No QSO record, callsign, grid, coordinate, Wavelog token, or station identifier is sent to Club Log. The only Club Log request is for the same global Most Wanted list for every QSO Trails installation.

The ranking is cached in `data/clublog-most-wanted.json` and refreshed at most once per 24 hours. If an update fails but a prior cache exists, QSO Trails continues with the stale cache and marks the source as cached/stale. If no ranking is available, normal DXCC statistics continue to work and the rarest-worked list is empty.

The public snapshot exposes only aggregate DXCC statistics. It does not expose additional per-QSO DXCC metadata.

The interactive DXCC breakdown can independently show or hide: continent totals, top entities, rarest worked entities, band totals, mode totals, most distant entity, and newest first-worked entity. These are presentation switches only; hiding or showing a section does not change the underlying public-data privacy policy.

## NASA Blue Marble: Next Generation

The `earth` theme uses NASA Earth Observatory **Blue Marble: Next Generation — December, with topography and bathymetry**.

Reference page:

`https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/`

NASA-hosted PNG source used by the renderer:

`https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.png`

The source is a 2:1 equirectangular global **texture**. It is not the aspect ratio of the QSO Trails card and it is not shown as a flat image when `projection=globe` is selected.

### Docker image seed and runtime cache

A normal production Docker build runs `scripts/build-earth-texture.js`. The build downloads the NASA source, validates and decodes it with bounded resource limits, downsamples it to 4096×2048, and stores it at `/app/earth-seed/earth-blue-marble-ng-200412.png` inside the application image.

That build step is intentionally placed before normal application-source copies in the Dockerfile. With ordinary Docker layer caching, UI and application-code changes can reuse the already-built imagery layer instead of downloading the source again. A no-cache build or a change to the imagery build inputs can cause the layer to be rebuilt.

Runtime lookup order is:

1. `/app/data/earth-blue-marble-ng-200412.png` — persistent administrator-refreshed cache;
2. `/app/earth-seed/earth-blue-marble-ng-200412.png` — texture baked into the Docker image;
3. bounded server-side NASA download only when neither local copy is available.

The image seed is deliberately outside `/app/data` because production normally mounts persistent application data at that path. The mounted data volume therefore cannot hide the image-baked seed.

For deterministic CI or an intentionally offline image build, `QSO_TRAILS_SKIP_EARTH_BUILD=1` skips the external build-time fetch. This is not the normal production setting.

Visitor browsers request `/assets/earth-blue-marble.png` from the QSO Trails host. They never contact NASA. The browser receives a locally generated 2048×1024 derivative and may cache it for 24 hours.

An Admin refresh downloads a new copy into the persistent data cache. If refresh fails, the existing persistent cache or image seed remains usable.

NASA Earth Observatory requests the credit **NASA Earth Observatory** for republication of Blue Marble: Next Generation imagery. QSO Trails displays `NASA Earth Observatory · Blue Marble: Next Generation` in the interactive Earth view and includes the NASA credit in static Earth cards using the actual imagery.

## Globe versus Mercator

`projection=globe` and `projection=mercator` are intentionally different render paths.

The 3D path inverse-projects the equirectangular NASA texture onto a circular sphere with square output pixels, then draws QSO great-circle paths using the same spherical projection. The flat path samples the same texture as a Mercator map.

If NASA imagery is unavailable, the application may use its vector-map fallback, but the fallback keeps the same card dimensions and must not be resized into a 2:1 rectangle. The static response also exposes `X-QSO-Trails-Earth-Fallback: 1` when an Earth request had to use the fallback.

## Static image sizing and presets

All static themes, including `earth`, use the established QSO Trails **640:500 card aspect ratio**. The NASA source remains 2:1 internally as a texture only.

A custom width is bounded to:

- minimum: 320 px
- default: 640 px
- maximum: 3840 px
- height: `width × 500 / 640`
- maximum rendered pixel count: 12,000,000

Examples:

- `width=640` → 640×500
- `width=800` → 800×625
- `width=1920` → 1920×1500
- `width=3840` → 3840×3000

Named presets are also available:

- `size=qrz` → 640×500
- `size=qso-card` → 960×750
- `size=homepage` → 1280×1000

The Admin UI exposes those presets plus Custom width. The generated `<img>` snippet always includes the matching width and height.

The globe itself occupies the map portion of the card and is sized from the smaller map dimension, so changing card size cannot stretch the sphere into an oval.

## Selectable static information

The static image URL supports presentation switches that affect only text drawn into the card:

- `name=0` — hide station label;
- `stats=0` — hide QSO count;
- `lotw=1` — show LoTW-confirmed count;
- `legend=0` — hide band legend;
- `dxcc=0` — hide DXCC entity count;
- `continents=0` — hide continent count independently of the DXCC entity count;
- `rarity=0` — hide rarest-worked DXCC information independently;
- `grid=4` or `grid=6` — show the home Maidenhead locator at the requested length;
- `updated=0` — hide generated timestamp.

The home-grid renderer enforces the global public home-position precision. Requesting `grid=6` while the station is published at 4-character precision produces only four characters; a presentation URL cannot bypass the privacy setting.

LoTW and DXCC values are aggregate values already maintained in the sanitized public snapshot. The static renderer does not add per-QSO confirmation status, private DXCC metadata, private coordinates, callsigns, dates, modes, or remote grids.

Large rendered images use a byte-bounded in-process cache so repeated large requests cannot create an unbounded memory cache. Existing per-client static-image rate limiting still applies.

## Updating sources

When changing the Club Log source, keep DXCC matching based on the ADIF numeric entity identifier and retain the rule that user QSO data is never sent to the ranking provider.

When changing NASA imagery, verify all of the following before changing `earth-texture.js`:

1. the asset is an official NASA-hosted Blue Marble: Next Generation global map suitable for equirectangular texture mapping;
2. the source page and asset URL are documented here and in `THIRD_PARTY_NOTICES.md`;
3. visible NASA Earth Observatory credit remains in both interactive and static uses;
4. download and decode limits remain bounded;
5. the source/seed texture preserves its 2:1 equirectangular texture ratio; and
6. static **card** output remains aspect-ratio safe and the globe remains circular.
