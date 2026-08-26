'use strict';
const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const globe=read('public/globe.js');
assert.match(globe,/const earthMode=requestedTheme==='earth'/,'Earth must be owned by the main globe renderer');
assert.match(globe,/getContext\('webgl'/,'Earth must use the textured sphere renderer');
assert.match(globe,/ctx\.drawImage\(surface,0,0,w,h\)/,'Earth texture must be composited into the main capture canvas');
assert.match(globe,/gl\.uniform2f\(state\.rotation,rotation\.x,rotation\.y\)/,'Earth texture must use the same rotation state as QSO paths');
assert.match(globe,/webglcontextlost/,'Earth must fall back when its WebGL context is lost');
assert.match(globe,/gl\.isContextLost\?\.\(\)/,'Earth draw path must detect an already-lost WebGL context');
assert.match(globe,/if\(requestedBand!=='ALL'&&!bands\.includes\(requestedBand\)\)bands\.push\(requestedBand\)/,'URL band must remain active even when capped public rows omit that band');
assert.match(globe,/if\(requestedBand!=='ALL'\)bandReplay\.value=requestedBand/,'URL band must initialize the shared globe filter independently of returned rows');
assert.match(globe,/settings=\{\.\.\.settings,\.\.\.\(d\.settings\|\|\{\}\)\}/,'live snapshots must refresh shared public settings');
assert.match(globe,/if\(replayCurrent&&!knownKeys\.has\(key\(replayCurrent\)\)\)/,'live refreshes must clear an evicted replay/live marker');
assert.match(globe,/if\(visibleFresh\.length\)[\s\S]*?focus\(q\)\}draw\(\)/,'successful live snapshots must redraw even when fresh records are filtered out');
assert.match(globe,/settings\.embedCount==='lotw'\?shown:/,'LoTW-only aggregate mode must not be labeled as a published-QSO denominator');
assert.match(globe,/qso-trails:public-settings/,'filtered settings refreshes must feed the main globe renderer');
assert.match(globe,/Object\.prototype\.hasOwnProperty\.call\(detail,'qsoCount'\)/,'filtered settings refreshes must update the exposed published count');
assert.match(globe,/publishedCount=Number\.isFinite\(count\)&&count>=0\?count:null/,'filtered count refreshes must reject missing or invalid totals');
assert.match(globe,/addEventListener\('resize',\(\)=>requestAnimationFrame\(draw\)\)/,'viewport resize must redraw the main globe canvas');
assert.match(globe,/function setEarthStatus\(text\)/,'Earth texture completion must use guarded status updates');
assert.match(globe,/setEarthStatus\('Real Earth · NASA Blue Marble · rotating globe'\)/,'Earth texture load must not directly overwrite user details');

const themePack=read('public/theme-pack.js');
assert.doesNotMatch(themePack,/earthC|visibility\s*=\s*['"]hidden['"]|drawImage\(texture/,'theme pack must not replace the rotating globe with a flat Earth canvas');

const embedHtml=read('public/embed.html');
assert.match(embedHtml,/theme-pack\.js\?v=20260826-3/,'interactive embed must load the expanded visual theme pack');
assert.match(embedHtml,/globe\.js\?v=20260826-3/,'interactive globe asset must be cache-busted after Earth renderer changes');
assert.match(embedHtml,/embed-extras\.js\?v=20260826-3/,'embed controls asset must be cache-busted after visibility changes');
assert.match(embedHtml,/data-qso-ui-build="2026-08-26\.3"/,'embed must expose a build marker for stale-deployment diagnosis');

const lotw=read('public/embed-lotw.js');
assert.match(lotw,/const requestedBand=String\(query\.get\('band'\)\|\|'all'\)/,'stats ownership must retain the requested URL band during startup');
assert.match(lotw,/bandTouched=false/,'stats ownership must distinguish initialization from visitor band changes');
assert.match(lotw,/function visuallyFiltered\(\)\{const selected=bandTouched\?String\(bandReplay\?\.value\|\|'all'\)[\s\S]*?:requestedBand;/,'stats ownership must use the URL band until the visitor changes the selector');
assert.match(lotw,/if\(visuallyFiltered\(\)\)[\s\S]*?qso-trails:public-settings/,'filtered embeds must poll public settings without writing unfiltered aggregates');
assert.match(lotw,/detail:\{settings:data\?\.settings\|\|\{\},qsoCount:/,'filtered embeds must forward newly exposed public counts with settings');
assert.match(lotw,/function syncObserver\(\)/,'aggregate stats observer must be switched with the active filter state');
assert.match(lotw,/function bandChanged\(\)\{bandTouched=true;/,'visitor band changes must hand stats ownership to the live selector');
assert.match(lotw,/bandReplay\?\.addEventListener\('change',bandChanged\)/,'changing the band selector must re-evaluate stats ownership immediately');
assert.doesNotMatch(lotw,/if\(filteredBand\|\|filteredDays\)return/,'filtered embeds must not disable settings polling');

const extras=read('public/embed-extras.js');
assert.match(extras,/const requestedBand=String\(query\.get\('band'\)\|\|'all'\)/,'DXCC ownership must retain the requested URL band during startup');
assert.match(extras,/bandTouched=false/,'DXCC ownership must distinguish initialization from visitor band changes');
assert.match(extras,/function visuallyFiltered\(\)\{const selected=bandTouched\?String\(bandReplay\?\.value\|\|'all'\)[\s\S]*?:requestedBand;/,'DXCC filtering must use the URL band until the visitor changes the selector');
assert.match(extras,/DXCC progress: unavailable for filtered view/,'filtered embeds must not display unfiltered DXCC aggregates');
assert.match(extras,/if\(visuallyFiltered\(\)\)\{renderDxcc\(null\);return;\}/,'filtered DXCC views must not fetch the server-wide aggregate');
assert.match(extras,/Most Wanted #/,'DXCC breakdown must show Club Log Most Wanted rank for rarest worked entities');
assert.match(extras,/showWebm=enabled\('webm'\)/,'embed must support hiding WebM export controls');
assert.match(extras,/showReplayControls=enabled\('replaycontrols'\)/,'embed must support hiding the replay control box');
assert.match(extras,/showTools=enabled\('tools'\)/,'embed must support hiding the Search Live tools box');
assert.match(extras,/toolsBox\.hidden=true;toolsBox\.style\.display='none'/,'Search Live tools box must remain hidden when disabled');
assert.match(extras,/3D globe · Imagery: NASA Earth Observatory · Blue Marble: Next Generation/,'Earth embed must identify the renderer as a 3D globe and credit NASA');
assert.match(extras,/vector globe fallback active/,'Earth texture failures must be visible instead of looking like a normal Mercator map');

const earthTexture=read('earth-texture.js');
assert.match(earthTexture,/DOWNLOAD_TIMEOUT_MS = 90_000/,'NASA texture download must allow slow self-hosted connections more than 15 seconds');
assert.match(earthTexture,/DOWNLOAD_ATTEMPTS = 3/,'NASA texture download must retry bounded transient failures');
assert.match(earthTexture,/diagnostics\.warn\('earth', 'NASA Blue Marble download attempt failed\.'/,'Earth download failures must be visible in private diagnostics');
assert.match(earthTexture,/existing cache was preserved/,'manual-style refresh failures must preserve a previously good Earth cache');

const staticRenderer=read('static-render.js');
assert.match(staticRenderer,/RAREST \$\{rare\}/,'static info box must include rarest worked DXCC entities');
assert.match(staticRenderer,/NASA EARTH OBSERVATORY \/ BLUE MARBLE NEXT GENERATION/,'NASA static output must include visible credit');

const staticThemes=read('static-theme-pack.js');
assert.match(staticThemes,/if \(options\.projection === 'mercator'\) fillEarthMercator/,'Earth static renderer must use Mercator only when explicitly selected');
assert.match(staticThemes,/else fillEarthGlobe/,'Earth static renderer must have a separate globe projection path');

const adminHtml=read('public/admin.html');
assert.match(adminHtml,/Admin UI build 2026-08-26\.4/,'Admin must display the current build marker');
assert.match(adminHtml,/id="embedShowWebm"/,'WebM visibility control must exist directly in Admin HTML');
assert.match(adminHtml,/id="embedShowReplay"/,'Replay visibility control must exist directly in Admin HTML');
assert.match(adminHtml,/id="embedShowTools"/,'Search Live visibility control must exist directly in Admin HTML');
assert.match(adminHtml,/Real Earth · NASA Blue Marble NG · 3D globe/,'Blue Marble NG interactive theme must exist directly in Admin HTML');
assert.match(adminHtml,/id="staticProjection"[\s\S]*value="globe">3D globe[\s\S]*value="mercator">Mercator map/,'Static Admin must expose distinct globe and Mercator projections');
assert.match(adminHtml,/id="staticTheme"[\s\S]*value="earth">Real Earth · NASA Blue Marble NG/,'Static Blue Marble NG theme must exist directly in Admin HTML');
assert.match(adminHtml,/id="diagnosticsCard"/,'Admin must expose a private diagnostics section');
assert.match(adminHtml,/id="diagnosticLog"/,'Admin must expose recent sanitized application logs');
assert.match(adminHtml,/admin\.js\?v=20260826-4/,'Admin JS must be cache-busted for diagnostics changes');
assert.doesNotMatch(adminHtml,/admin-publish\.js/,'current Admin must not depend on the legacy dynamic publish helper');

const admin=read('public/admin.js');
assert.match(admin,/setHiddenFlag\(p,'webm','embedShowWebm'\)/,'core Admin must write the WebM visibility flag');
assert.match(admin,/setHiddenFlag\(p,'replaycontrols','embedShowReplay'\)/,'core Admin must write the replay visibility flag');
assert.match(admin,/setHiddenFlag\(p,'tools','embedShowTools'\)/,'core Admin must write the Search Live visibility flag');
assert.match(admin,/p\.set\('projection',\$\('staticProjection'\)\?\.value==='mercator'\?'mercator':'globe'\)/,'core Admin must preserve the selected static projection');
assert.match(admin,/fetch\('\/api\/admin\/diagnostics\?limit=300'/,'Earth health must use the authenticated private diagnostics endpoint');
assert.doesNotMatch(admin,/assets\/earth-blue-marble\.png\?check/,'Admin health checks must not trigger a public texture download with HEAD');

const diagnostics=read('diagnostics.js');
assert.match(diagnostics,/MAX_ENTRIES = 500/,'diagnostic log must be memory bounded');
assert.match(diagnostics,/authorization\|cookie\|csrf/i,'diagnostics must redact authentication-related fields');
const adminDiagnostics=read('admin-diagnostics.js');
assert.match(adminDiagnostics,/this\.get\('\/api\/admin\/diagnostics'/,'private diagnostics endpoint must live under the existing admin route prefix');
assert.match(adminDiagnostics,/pathname !== '\/api\/admin\/diagnostics'/,'diagnostics polling must not recursively flood its own log');
assert.doesNotMatch(adminDiagnostics,/remoteAddress|req\.ip|x-forwarded-for/i,'diagnostic request logging must not collect visitor IP addresses');

console.log('embed renderer regression tests passed');
