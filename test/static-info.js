'use strict';

const assert = require('assert/strict');
const { encodePng, decodePng } = require('../png-codec');
const { applyStaticInfo, publicGrid } = require('../static-info');

assert.deepEqual(publicGrid({ homeGrid: 'KP20AB', homePrecision: 'grid4' }, '6'), { value: 'KP20', length: 4, requested: 6, limited: true });
assert.deepEqual(publicGrid({ homeGrid: 'KP20AB', homePrecision: 'grid6' }, '6'), { value: 'KP20AB', length: 6, requested: 6, limited: false });
assert.deepEqual(publicGrid({ homeGrid: 'KP20AB', homePrecision: 'exact' }, '4'), { value: 'KP20', length: 4, requested: 4, limited: false });
assert.equal(publicGrid({ homeGrid: 'invalid', homePrecision: 'exact' }, '6'), null);
assert.equal(publicGrid({ homeGrid: 'KP20AB', homePrecision: 'exact' }, 'none'), null);

const width = 640, height = 500;
const rgba = Buffer.alloc(width * height * 4);
for (let i = 0; i < rgba.length; i += 4) {
  rgba[i] = 245; rgba[i + 1] = 248; rgba[i + 2] = 250; rgba[i + 3] = 255;
}
const base = encodePng(width, height, rgba);
const body = applyStaticInfo(base, {
  qsoCount: 321,
  lotwCount: 123,
  settings: { stationName: 'TEST' },
  qsos: [{ band: '20M' }, { band: '40M' }],
  stats: { dxcc: { metadataAvailable: true, entities: 77, continents: 6, rarestWorked: [{ rank: 5, dxcc: 1 }] } }
}, {
  showName: true,
  showStats: true,
  showLotw: true,
  showLegend: true,
  showDxcc: true,
  showContinents: true,
  showRarity: true,
  gridPrecision: '6',
  showUpdated: false,
  showNasaCredit: false
}, { homeGrid: 'KP20AB', homePrecision: 'grid4' }, 'clean');
const image = decodePng(body, { maxPixels: width * height });
assert.equal(image.width, width);
assert.equal(image.height, height);
assert.notDeepEqual(image.data.subarray((338 * width) * 4, (339 * width) * 4), rgba.subarray((338 * width) * 4, (339 * width) * 4));

console.log('static info tests passed');
