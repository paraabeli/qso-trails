'use strict';

const assert = require('assert');
const { parseCoord, safeEqual } = require('../security-helpers');

assert.strictEqual(safeEqual('admin', 'admin'), true);
assert.strictEqual(safeEqual('admin', 'Admin'), false);
assert.strictEqual(safeEqual('short', 'shorter'), false);
assert.strictEqual(safeEqual('x'.repeat(4097), 'x'.repeat(4097)), true);
assert.strictEqual(safeEqual('x'.repeat(4097), 'x'.repeat(4096) + 'y'), false);
assert.strictEqual(safeEqual('x'.repeat(16385), 'x'.repeat(16385)), false);

assert.strictEqual(parseCoord('60.1699', true), 60.1699);
assert.strictEqual(parseCoord('N 60 10.194', true), 60 + 10.194 / 60);
assert.strictEqual(parseCoord('60:10.194N', true), 60 + 10.194 / 60);
assert.strictEqual(parseCoord('W 024 56.220', false), -(24 + 56.22 / 60));
assert.strictEqual(parseCoord('N 024 56.220', false), null);
assert.strictEqual(parseCoord('91', true), null);
assert.strictEqual(parseCoord('180:60E', false), null);
assert.strictEqual(parseCoord('N' + ' '.repeat(100000) + '60 10', true), null);
assert.strictEqual(parseCoord('60 10 N S', true), null);

console.log('security helper tests passed');
