# Third-Party Notices

QSO Trails is MIT licensed. It also depends on third-party software and data that retain their own licenses, attribution terms, or media-use guidance.

## Runtime dependencies

- Express — https://expressjs.com/ — MIT
- Multer — https://github.com/expressjs/multer — MIT
- topojson-client — https://github.com/topojson/topojson-client — ISC
- world-atlas — https://github.com/topojson/world-atlas — ISC

## Map and imagery data

`world-atlas` contains geographic data derived from Natural Earth. Natural Earth data is public domain. The conversion/distribution package itself retains its own license.

The optional `earth` theme uses **NASA Earth Observatory Blue Marble: Next Generation**, specifically the December global topography-and-bathymetry image. QSO Trails downloads the fixed NASA-hosted source server-side when needed, stores a reduced local cache, and serves a smaller browser texture for the interactive globe. Visitor browsers do not contact NASA directly.

NASA Earth Observatory asks users republishing Blue Marble: Next Generation to credit **NASA Earth Observatory**. QSO Trails therefore displays that credit whenever the NASA imagery is used in the interactive globe or a static image. NASA media and identity guidance still applies, and the credit does not imply NASA endorsement.

NASA reference page: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/

## DXCC rarity data

The optional DXCC rarity summary uses the **Club Log Most Wanted** JSON API. QSO Trails fetches the global ranking server-side and caches it locally; it does not send a user's QSO records, callsigns, grids, or other station data to Club Log. Worked entities are matched locally using ADIF DXCC entity numbers.

Club Log API documentation: https://clublog.freshdesk.com/support/solutions/articles/76225-most-wanted-list-json-api

Club Log remains the source of the ranking data and controls its availability and update schedule. Operators should review Club Log's current API terms and guidance before redistributing the ranking dataset independently of QSO Trails.

## Container images

Docker deployments use official Node.js and Caddy container images. Their bundled software components retain their respective upstream licenses.

This notice is provided for convenience and does not replace upstream license texts, attribution requirements, trademark policies, API terms, or media-use guidance.
