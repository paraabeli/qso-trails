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
assert.match(embedHtml,/theme-pack\.js\?v=20260826-5/,'interactive embed must load the current visual theme pack');
assert.match(embedHtml,/globe\.js\?v=20260826-5/,'interactive globe asset must be cache-busted after Earth fixes');
assert.match(embedHtml,/embed-extras\.js\?v=20260826-5/,'embed controls asset must be cache-busted after DXCC changes');
assert.match(embedHtml,/data-qso-ui-build="2026-08-26\.5"/,'embed must expose a current build marker');
assert.match(embedHtml,/max-height:calc\(100% - 20px\);overflow:auto/,'HUD must stay inside the preview viewport');
assert.match(embedHtml,/\.dxccPanel\[open\]\{max-height:min\(46vh,320px\);overflow:auto/,'opened DXCC breakdown must be scroll-bounded');
assert.match(embedHtml,/grid-template-columns:repeat\(auto-fit,minmax\(180px,1fr\)\)/,'DXCC sections must adapt to available width');

const lotw=read('public/embed-lotw.js');
assert.match(lotw,/const requestedBand=String\(query\.get\('band'\)\|\|'all'\)/,'stats ownership must retain the requested URL band during startup');
assert.match(lotw,/bandTouched=false/,'stats ownership must distinguish initialization from visitor band changes');
assert.match(lotw,/function visuallyFiltered\(\)\{const selected=bandTouched\?String\(bandReplay\?\.value\|\|'all'\)[\s\S]*?:requestedBand;/,'stats ownership must use the URL band until the visitor changes the selector');
assert.match(lotw,/if\(visuallyFiltered\(\)\)[\s\S]*?qso-trails:public-settings/,'filtered embeds must poll public settings without writing unfiltered aggregates');
assert.match(lotw,/detail:\{settings:data\?\.settings\|\|\{\},qsoCount:/,'filtered embeds must forward newly exposed public counts with settings');
assert.match(lotw,/function syncObserver\(\)/,'aggregate stats observer must be switched with the active filter state');
assert.match(lotw,/function bandChanged\(\)\{bandTouched=true;/,'visitor band changes must hand stats ownership to the live selector');
assert.match(lotw,/bandReplay\?\.addEventListener\('change',bandChanged\)/,'changing the band selector must re-evaluate stats ownership immediately');
assert.doesNotMatch(lotw,/createElement\('script'\)/,'LoTW helper must not inject a second stale theme script');

const extras=read('public/embed-extras.js');
assert.match(extras,/const requestedBand=String\(query\.get\('band'\)\|\|'all'\)/,'DXCC ownership must retain the requested URL band during startup');
assert.match(extras,/bandTouched=false/,'DXCC ownership must distinguish initialization from visitor band changes');
assert.match(extras,/DXCC progress: unavailable for filtered view/,'filtered embeds must not display unfiltered DXCC aggregates');
assert.match(extras,/showWebm=enabled\('webm'\)/,'embed must support hiding WebM export controls');
assert.match(extras,/showReplayControls=enabled\('replaycontrols'\)/,'embed must support hiding the replay control box');
assert.match(extras,/showTools=enabled\('tools'\)/,'embed must support hiding the Search Live tools box');
assert.match(extras,/showDxccCont=enabled\('dxcccont'\)/,'embed must support selecting continent breakdown');
assert.match(extras,/showDxccRarity=enabled\('dxccrare'\)/,'embed must support selecting rarity breakdown');
assert.match(extras,/showDxccNewest=enabled\('dxccnewest'\)/,'embed must support selecting newest-worked breakdown');
assert.match(extras,/panel\.hidden=sections\.length===0/,'DXCC panel must disappear when all detailed sections are disabled');
assert.match(extras,/fetch\('\/assets\/earth-blue-marble\.png',\{method:'HEAD',cache:'force-cache'\}\)/,'Earth status check must use the local cacheable texture URL');
assert.match(extras,/3D globe · Imagery: NASA Earth Observatory · Blue Marble: Next Generation/,'Earth embed must identify the renderer as a 3D globe and credit NASA');
assert.match(extras,/vector globe fallback active/,'Earth texture failures must remain visible');

const earthTexture=read('earth-texture.js');
assert.match(earthTexture,/DOWNLOAD_TIMEOUT_MS = 90_000/,'NASA texture download must allow slow self-hosted connections more than 15 seconds');
assert.match(earthTexture,/DOWNLOAD_ATTEMPTS = 3/,'NASA texture download must retry bounded transient failures');
assert.match(earthTexture,/IMAGE_SEED = path\.join\(IMAGE_SEED_DIR, 'earth-blue-marble-ng-200412\.png'\)/,'Earth texture must support an image-baked seed outside the data volume');
assert.match(earthTexture,/validTextureAt\(CACHE, 'persistent'\)[\s\S]*validTextureAt\(IMAGE_SEED, 'image'\)/,'runtime must prefer persistent cache then image-baked seed');
assert.match(earthTexture,/async function buildEarthSeed\(\)/,'Docker build must be able to prepare the image seed');
assert.match(earthTexture,/existing image seed\/cache was preserved/,'manual refresh failures must preserve a previously good local texture');
assert.match(earthTexture,/max-age=86400, immutable/,'browser texture must be cacheable once served locally');

const staticThemes=read('static-theme-pack.js');
assert.match(staticThemes,/if \(options\.projection === 'mercator'\) fillEarthMercator/,'Earth static renderer must use Mercator only when explicitly selected');
assert.match(staticThemes,/else fillEarthGlobe/,'Earth static renderer must have a separate globe projection path');
assert.match(staticThemes,/Math\.min\(width \* \.46, mapHeight \* \.455\)/,'globe radius must be based on a square-pixel map area');
assert.match(staticThemes,/X-QSO-Trails-Earth-Fallback/,'static Earth fallback must be explicitly diagnosable');
assert.match(staticThemes,/applyStaticInfo/,'expanded static themes must use the selectable info overlay');

const staticInfo=read('static-info.js');
assert.match(staticInfo,/options\.showLotw === true/,'static info must support a LoTW-confirmed count');
assert.match(staticInfo,/function publicGrid/,'static info must support a privacy-capped home grid');
assert.match(staticInfo,/const allowed = privateSettings\.homePrecision === 'grid6' \|\| privateSettings\.homePrecision === 'exact' \? 6 : 4/,'6-character grid must not exceed public home precision');

const adminHtml=read('public/admin.html');
assert.match(adminHtml,/Admin UI build 2026-08-26\.5/,'Admin must display the current build marker');
assert.match(adminHtml,/id="embedShowWebm"/,'WebM visibility control must exist directly in Admin HTML');
assert.match(adminHtml,/id="embedShowReplay"/,'Replay visibility control must exist directly in Admin HTML');
assert.match(adminHtml,/id="embedDxccRarity"/,'DXCC section visibility controls must exist directly in Admin HTML');
assert.match(adminHtml,/id="staticSizePreset"/,'Static size presets must exist directly in Admin HTML');
assert.match(adminHtml,/id="staticShowLotw"/,'Static LoTW count control must exist directly in Admin HTML');
assert.match(adminHtml,/id="staticGrid"/,'Static home-grid control must exist directly in Admin HTML');
assert.match(adminHtml,/value="qso-card">QSO card · 960 × 750/,'QSO card static preset must be available');
assert.match(adminHtml,/value="homepage">Homepage · 1280 × 1000/,'Homepage static preset must be available');
assert.match(adminHtml,/Real Earth · NASA Blue Marble NG · 3D globe/,'Blue Marble NG interactive theme must exist directly in Admin HTML');
assert.match(adminHtml,/id="staticProjection"[\s\S]*value="globe">3D globe[\s\S]*value="mercator">Mercator map/,'Static Admin must expose distinct globe and Mercator projections');
assert.match(adminHtml,/id="diagnosticsCard"/,'Admin must expose a private diagnostics section');
assert.match(adminHtml,/admin\.js\?v=20260826-5/,'Admin JS must be cache-busted for presentation changes');
assert.doesNotMatch(adminHtml,/admin-publish\.js/,'current Admin must not depend on the legacy dynamic publish helper');

const admin=read('public/admin.js');
assert.match(admin,/setHiddenFlag\(p,'webm','embedShowWebm'\)/,'core Admin must write the WebM visibility flag');
assert.match(admin,/setHiddenFlag\(p,'dxccrare','embedDxccRarity'\)/,'core Admin must write detailed DXCC visibility flags');
assert.match(admin,/p\.set\('lotw','1'\)/,'core Admin must support static LoTW count display');
assert.match(admin,/p\.set\('continents',\$\('staticShowContinents'\)\?\.checked\?'1':'0'\)/,'core Admin must select continent count independently');
assert.match(admin,/p\.set\('rarity',\$\('staticShowRarity'\)\?\.checked\?'1':'0'\)/,'core Admin must select rarity independently');
assert.match(admin,/Math\.round\(width\*500\/640\)/,'custom static width must increase height proportionally');
assert.doesNotMatch(admin,/theme==='earth'\?Math\.round\(width\/2\)/,'Admin must never squash Earth into a 2:1 output card');
assert.match(admin,/6-character display is disabled while public home precision/,'Admin must explain the grid privacy cap');
assert.match(admin,/fetch\('\/api\/admin\/diagnostics\?limit=300'/,'Earth health must use the authenticated private diagnostics endpoint');

const dockerfile=read('Dockerfile');
assert.match(dockerfile,/QSO_TRAILS_SKIP_EARTH_BUILD/,'Docker must provide a deterministic CI escape hatch for external imagery');
assert.match(dockerfile,/node scripts\/build-earth-texture\.js/,'production image build must prepare the local Earth texture seed');
assert.ok(dockerfile.indexOf('node scripts/build-earth-texture.js')<dockerfile.indexOf('COPY server.js ./'),'Earth seed must be in a cached layer before normal application-source copies');

const diagnostics=read('diagnostics.js');
assert.match(diagnostics,/MAX_ENTRIES = 500/,'diagnostic log must be memory bounded');
assert.match(diagnostics,/authorization\|cookie\|csrf/i,'diagnostics must redact authentication-related fields');
const adminDiagnostics=read('admin-diagnostics.js');
assert.match(adminDiagnostics,/this\.get\('\/api\/admin\/diagnostics'/,'private diagnostics endpoint must live under the existing admin route prefix');
assert.match(adminDiagnostics,/pathname !== '\/api\/admin\/diagnostics'/,'diagnostics polling must not recursively flood its own log');
assert.doesNotMatch(adminDiagnostics,/remoteAddress|req\.ip|x-forwarded-for/i,'diagnostic request logging must not collect visitor IP addresses');

console.log('embed renderer regression tests passed');
