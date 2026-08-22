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
assert.match(globe,/if\(requestedBand!=='ALL'&&!bands\.includes\(requestedBand\)\)bands\.push\(requestedBand\)/,'URL band must remain active even when capped public rows omit that band');
assert.match(globe,/if\(requestedBand!=='ALL'\)bandReplay\.value=requestedBand/,'URL band must initialize the shared globe filter independently of returned rows');
assert.match(globe,/settings=\{\.\.\.settings,\.\.\.\(d\.settings\|\|\{\}\)\}/,'live snapshots must refresh shared public settings');
assert.match(globe,/if\(visibleFresh\.length\)[\s\S]*?focus\(q\)\}draw\(\)/,'successful live snapshots must redraw even when fresh records are filtered out');
assert.match(globe,/qso-trails:public-settings/,'filtered settings refreshes must feed the main globe renderer');
assert.match(globe,/addEventListener\('resize',\(\)=>requestAnimationFrame\(draw\)\)/,'viewport resize must redraw the main globe canvas');

const themePack=read('public/theme-pack.js');
assert.doesNotMatch(themePack,/earthC|visibility\s*=\s*['"]hidden['"]|drawImage\(texture/,'theme pack must not replace the rotating globe with a flat Earth canvas');

const lotw=read('public/embed-lotw.js');
assert.match(lotw,/if\(visuallyFiltered\)[\s\S]*?qso-trails:public-settings/,'filtered embeds must poll public settings without writing unfiltered aggregates');
assert.doesNotMatch(lotw,/if\(filteredBand\|\|filteredDays\)return/,'filtered embeds must not disable settings polling');

console.log('embed renderer regression tests passed');
