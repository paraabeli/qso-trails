'use strict';

const assert = require('assert/strict');
const { encodePng, decodePng } = require('../png-codec');
const { parseStaticPreset, parseStaticWidth, staticDimensions, resizePng } = require('../static-size');

assert.equal(parseStaticWidth('1'), 320);
assert.equal(parseStaticWidth('640'), 640);
assert.equal(parseStaticWidth('99999'), 3840);
assert.equal(parseStaticWidth('not-a-number'), 640);
assert.equal(parseStaticPreset('qrz'), 'qrz');
assert.equal(parseStaticPreset('qso-card'), 'qso-card');
assert.equal(parseStaticPreset('homepage'), 'homepage');
assert.equal(parseStaticPreset('unknown'), 'custom');

assert.deepEqual(staticDimensions(640, 'earth'), { width: 640, height: 500 });
assert.deepEqual(staticDimensions(1920, 'earth'), { width: 1920, height: 1500 });
assert.deepEqual(staticDimensions(3840, 'earth'), { width: 3840, height: 3000 });
assert.deepEqual(staticDimensions(640, 'retro'), { width: 640, height: 500 });
assert.deepEqual(staticDimensions(1280, 'clean'), { width: 1280, height: 1000 });
assert.deepEqual(staticDimensions(800, 'earth', 'custom'), { width: 800, height: 625 });
assert.deepEqual(staticDimensions(320, 'earth', 'qrz'), { width: 640, height: 500 });
assert.deepEqual(staticDimensions(320, 'clean', 'qso-card'), { width: 960, height: 750 });
assert.deepEqual(staticDimensions(320, 'retro', 'homepage'), { width: 1280, height: 1000 });

const source = encodePng(2, 1, Buffer.from([
  255, 0, 0, 255,
  0, 0, 255, 255
]));
const resized = decodePng(resizePng(source, 4, 2), { maxPixels: 8 });
assert.equal(resized.width, 4);
assert.equal(resized.height, 2);
assert.deepEqual([...resized.data.subarray(0, 4)], [255, 0, 0, 255]);
assert.deepEqual([...resized.data.subarray((4 * 4) - 4, 4 * 4)], [0, 0, 255, 255]);

console.log('static size tests passed');
