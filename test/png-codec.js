'use strict';

const assert = require('assert');
const { encodePng, decodePng } = require('../png-codec');

const rgba = Buffer.from([
  255,0,0,255, 0,255,0,255,
  0,0,255,255, 255,255,255,128
]);
const png = encodePng(2,2,rgba);
assert.strictEqual(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
const decoded = decodePng(png,{maxPixels:4});
assert.strictEqual(decoded.width,2);
assert.strictEqual(decoded.height,2);
assert.deepStrictEqual(decoded.data,rgba);
assert.throws(()=>decodePng(Buffer.from('not-png')),/PNG|signature/i);
assert.throws(()=>decodePng(png,{maxPixels:3}),/dimensions|limit/i);
console.log('PNG codec regression tests passed.');
