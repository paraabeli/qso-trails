'use strict';
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const globe=read('public/globe.js');
assert.match(globe,/const earthMode=requestedTheme==='earth'/,'Earth must be owned by the main globe renderer');
assert.match(globe,/getContext\('webgl'/,'Earth must use the textured sphere renderer');
assert.match(globe,/float d2=dot\(p,p\);if\(d2>1\.0\)discard/,'Earth shader must clip the texture to a circular sphere');
assert.match(globe,/float z=sqrt\(max\(0\.0,1\.0-d2\)\)/,'Earth shader must derive spherical depth rather than drawing a flat map');
assert.match(globe,/ctx\.drawImage\(surface,0,0,w,h\)/,'Earth texture must be composited into the main capture canvas');
assert.match(globe,/gl\.uniform2f\(state\.rotation,rotation\.x,rotation\.y\)/,'Earth texture must use the same rotation state as QSO paths');
assert.match(globe,/webglcontextlost/,'Earth must fall back when its WebGL context is lost');
assert.match(globe,/gl\.isContextLost\?\.\(\)/,'Earth draw path must detect an already-lost WebGL context');
assert.match(globe,/if\(requestedBand!=='ALL'&&!bands\.includes\(requestedBand\)\)bands\.push\(requestedBand\)/,'URL band must remain active even when capped public rows omit that band');
assert.match(globe,/if\(requestedBand!=='ALL'\)bandReplay\.value=requestedBand/,'URL band must initialize the shared globe filter independently of returned rows');
assert.match(globe,/settings=\{\.\.\.settings,\.\.\.\(d\.settings\|\|\{\}\)\}/,'live snapshots must refresh shared public settings');
assert.match(globe,/qso-trails:public-settings/,'filtered settings refreshes must feed the main globe renderer');
assert.match(globe,/addEventListener\('resize',\(\)=>requestAnimationFrame\(draw\)\)/,'viewport resize must redraw the main globe canvas');
assert.match(globe,/i\.dataset\.band=String\(b\|\|''\)\.toUpperCase\(\)/,'legend color selection must use CSP-safe data attributes');
assert.doesNotMatch(globe,/\.style\./,'interactive globe code must not write inline styles');
assert.match(globe,/earth-blue-marble\.png\?v=20260828-1/,'Earth texture URL must be cache-busted after browser derivative changes');

const themePack=read('public/theme-pack.js');
assert.match(themePack,/document\.documentElement\.dataset\.qsoTheme=requested/,'theme helper must only select an external-CSS theme');
assert.doesNotMatch(themePack,/createElement\(['"]style['"]\)|style\.textContent|append\(style\)/,'theme helper must not inject CSP-blocked styles');

const embedCss=read('public/embed.css');
assert.match(embedCss,/html\[data-qso-theme="earth"\] #wrap/,'Earth theme must live in the external stylesheet');
assert.match(embedCss,/\.dxccSectionBody/,'DXCC dynamic section styling must live in external CSS');
assert.match(embedCss,/\.nasaCredit/,'NASA credit styling must live in external CSS');
assert.match(embedCss,/\.dot\[data-band="20M"\]/,'band legend colors must live in external CSS');

const embedHtml=read('public/embed.html');
assert.match(embedHtml,/embed\.css\?v=20260828-1/,'interactive embed must load an external stylesheet');
assert.match(embedHtml,/theme-pack\.js\?v=20260828-1/,'interactive embed must load the current theme selector');
assert.match(embedHtml,/globe\.js\?v=20260828-1/,'interactive globe asset must be cache-busted after CSP and Earth delivery changes');
assert.match(embedHtml,/embed-extras\.js\?v=20260828-1/,'embed controls must be cache-busted after CSP changes');
assert.match(embedHtml,/embed-lotw\.js\?v=20260828-1/,'LoTW helper must be an explicit external script');
assert.match(embedHtml,/data-qso-ui-build="2026-08-28\.1"/,'embed must expose a current build marker');
assert.doesNotMatch(embedHtml,/<style(?:\s|>)/i,'embed document must contain no inline style element');
assert.doesNotMatch(embedHtml,/<script(?![^>]*\bsrc=)[^>]*>/i,'embed document must contain no inline script');
assert.doesNotMatch(embedHtml,/\sstyle=/i,'embed document must contain no inline style attribute');

const lotw=read('public/embed-lotw.js');
assert.match(lotw,/const requestedBand=String\(query\.get\('band'\)\|\|'all'\)/,'stats ownership must retain the requested URL band during startup');
assert.match(lotw,/bandTouched=false/,'stats ownership must distinguish initialization from visitor band changes');
assert.doesNotMatch(lotw,/createElement\('script'\)/,'LoTW helper must not inject another script');

const extras=read('public/embed-extras.js');
assert.match(extras,/showWebm=enabled\('webm'\)/,'embed must support hiding WebM export controls');
assert.match(extras,/showReplayControls=enabled\('replaycontrols'\)/,'embed must support hiding the replay control box');
assert.match(extras,/showTools=enabled\('tools'\)/,'embed must support hiding the Search Live tools box');
assert.match(extras,/showDxccRarity=enabled\('dxccrare'\)/,'embed must support selecting rarity breakdown');
assert.match(extras,/panel\.hidden=sections\.length===0/,'DXCC panel must disappear when all detailed sections are disabled');
assert.match(extras,/className='nasaCredit'/,'NASA credit must use external CSS class styling');
assert.match(extras,/className='dxccSectionBody'/,'DXCC section body must use external CSS class styling');
assert.match(extras,/Image by NASA Earth Observatory · Blue Marble: Next Generation/,'Earth embed must explicitly identify NASA as the image source');
assert.match(extras,/content-length/,'Earth embed must expose the actual local browser texture transfer size when available');
assert.doesNotMatch(extras,/\.style\./,'embed extras must not write inline styles');
assert.match(extras,/vector globe fallback active/,'Earth texture failures must remain visible');

const earthTexture=read('earth-texture.js');
assert.match(earthTexture,/DOWNLOAD_TIMEOUT_MS = 90_000/,'NASA texture download must allow slow self-hosted connections');
assert.match(earthTexture,/DOWNLOAD_ATTEMPTS = 3/,'NASA texture download must retry bounded transient failures');
assert.match(earthTexture,/IMAGE_SEED = path\.join\(IMAGE_SEED_DIR, 'earth-blue-marble-ng-200412\.png'\)/,'Earth texture must support an image-baked seed outside the data volume');
assert.match(earthTexture,/const GLOBE_W = 1280/,'browser Earth texture must be downscaled below the internal 4096px cache');
assert.match(earthTexture,/const GLOBE_H = 640/,'browser Earth texture must retain a 2:1 texture ratio');
assert.match(earthTexture,/const GLOBE_COLOR_MASK = 0xfc/,'browser Earth texture must use bounded RGB quantization for smaller PNG transfer');
assert.match(earthTexture,/downsample\(image, GLOBE_W, GLOBE_H, GLOBE_COLOR_MASK\)/,'browser derivative must use compact dimensions and quantization');
assert.match(earthTexture,/X-QSO-Trails-Texture-Dimensions/,'browser response must report the delivered texture dimensions');
assert.match(earthTexture,/X-QSO-Trails-Texture-Bytes/,'browser response must report exact delivered texture bytes');
assert.match(earthTexture,/browser: \{ width: GLOBE_W, height: GLOBE_H, format: 'image\/png', bytes: lastBrowserBytes/,'Admin diagnostics must report browser texture transfer size');

const staticThemes=read('static-theme-pack.js');
assert.match(staticThemes,/if \(options\.projection === 'mercator'\) fillEarthMercator/,'Earth static renderer must use Mercator only when explicitly selected');
assert.match(staticThemes,/else fillEarthGlobe/,'Earth static renderer must have a separate globe projection path');
assert.match(staticThemes,/Math\.min\(width \* \.46, mapHeight \* \.455\)/,'globe radius must be based on a square-pixel map area');
assert.match(staticThemes,/X-QSO-Trails-Earth-Fallback/,'static Earth fallback must be explicitly diagnosable');

const staticInfo=read('static-info.js');
assert.match(staticInfo,/function stationLine/,'static info must compose station and grid on one line');
assert.match(staticInfo,/parts\.push\(grid\.value\)/,'static grid must be placed directly after the station label');
assert.doesNotMatch(staticInfo,/PRIVACY LIMITED|\$\{grid\.length\} CHAR|`GRID \$\{grid\.value\}/,'rendered image must not include grid precision suffix text');
assert.match(staticInfo,/IMAGE BY NASA EARTH OBSERVATORY \/ BLUE MARBLE NEXT GENERATION/,'static Earth output must explicitly identify NASA as the image source');

const adminHtml=read('public/admin.html');
assert.match(adminHtml,/Admin UI build 2026-08-28\.1/,'Admin must display the current build marker');
assert.match(adminHtml,/style\.css\?v=20260828-1/,'Admin must load the current external stylesheet');
assert.match(adminHtml,/admin\.js\?v=20260828-1/,'Admin JS must be cache-busted for CSP changes');
assert.match(adminHtml,/admin-lotw\.js\?v=20260828-1/,'Admin LoTW helper must be an explicit external script');
assert.match(adminHtml,/id="staticGrid"/,'Static home-grid control must exist directly in Admin HTML');
assert.match(adminHtml,/never includes a “4 chars\/6 chars” suffix/,'Admin must document compact grid rendering');
assert.doesNotMatch(adminHtml,/\sstyle=/i,'Admin document must contain no inline style attributes');
assert.doesNotMatch(adminHtml,/<script(?![^>]*\bsrc=)[^>]*>/i,'Admin document must contain no inline script');

const admin=read('public/admin.js');
assert.match(admin,/setHiddenFlag\(p,'dxccrare','embedDxccRarity'\)/,'core Admin must write detailed DXCC visibility flags');
assert.match(admin,/p\.set\('lotw','1'\)/,'core Admin must support static LoTW count display');
assert.match(admin,/Math\.round\(width\*500\/640\)/,'custom static width must increase height proportionally');
assert.match(admin,/Browser texture:/,'Admin diagnostics must display the browser texture dimensions and bytes');
assert.doesNotMatch(admin,/\.style\./,'Admin runtime must not write inline styles under strict CSP');

const dockerfile=read('Dockerfile');
assert.match(dockerfile,/QSO_TRAILS_SKIP_EARTH_BUILD/,'Docker must provide a deterministic CI escape hatch for external imagery');
assert.match(dockerfile,/node scripts\/build-earth-texture\.js/,'production image build must prepare the local Earth texture seed');
assert.ok(dockerfile.indexOf('node scripts/build-earth-texture.js')<dockerfile.indexOf('COPY server.js ./'),'Earth seed must be in a cached layer before normal application-source copies');

const diagnostics=read('diagnostics.js');
assert.match(diagnostics,/MAX_ENTRIES = 500/,'diagnostic log must be memory bounded');
assert.match(diagnostics,/authorization\|cookie\|csrf/i,'diagnostics must redact authentication-related fields');

console.log('embed renderer regression tests passed');
