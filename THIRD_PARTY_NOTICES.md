# Third-Party Notices

QSO Trails is MIT licensed. It also depends on third-party software and data that retain their own licenses, attribution terms, or media-use guidance.

## Runtime dependencies

- Express — https://expressjs.com/ — MIT
- Multer — https://github.com/expressjs/multer — MIT
- topojson-client — https://github.com/topojson/topojson-client — ISC
- world-atlas — https://github.com/topojson/world-atlas — ISC

## Map and imagery data

`world-atlas` contains geographic data derived from Natural Earth. Natural Earth data is public domain. The conversion/distribution package itself retains its own license.

The optional `earth` theme uses **NASA Visible Earth / Blue Marble — Land Surface, Ocean Color and Sea Ice**. QSO Trails downloads the fixed NASA source server-side when needed and stores a reduced local cache; the original image is not bundled in the Git repository.

NASA states that its media is generally not subject to copyright in the United States, subject to NASA's media/identity usage guidelines and third-party exceptions. QSO Trails credits this imagery as **NASA Blue Marble / NASA Visible Earth** and does not imply NASA endorsement. Operators redistributing or branding the imagery should review NASA's current media usage guidance.

## Container images

Docker deployments use official Node.js and Caddy container images. Their bundled software components retain their respective upstream licenses.

This notice is provided for convenience and does not replace upstream license texts, attribution requirements, trademark policies, or media-use guidance.
