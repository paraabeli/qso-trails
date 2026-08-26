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
assert.match(extras,/bandReplay\?\.addEventListener\('change',\(\)=>\{bandTouched=true;refreshDxcc\(\);updateStatsTimer\(\);\}\)/,'changing the band selector must hand DXCC ownership to the live selector and refresh immediately');
assert.match(extras,/Most Wanted #/,'DXCC breakdown must show Club Log Most Wanted rank for rarest worked entities');
assert.match(extras,/nasaImageryCredit/,'Earth embed must render a dedicated imagery credit');
assert.match(extras,/NASA Earth Observatory · Blue Marble: Next Generation/,'Earth embed must use NASA Earth Observatory attribution');

const staticRenderer=read('static-render.js');
assert.match(staticRenderer,/RAREST \$\{rare\}/,'static info box must include rarest worked DXCC entities');
assert.match(staticRenderer,/NASA EARTH OBSERVATORY \/ BLUE MARBLE NEXT GENERATION/,'NASA static output must include visible credit');

const adminPublish=read('public/admin-publish.js');
assert.match(adminPublish,/width\.min='320';width\.max='3840'/,'admin static width control must be bounded');
assert.match(adminPublish,/theme==='earth'\?Math\.round\(width\/2\)/,'admin snippet must keep NASA 2:1 aspect ratio');

console.log('embed renderer regression tests passed');
