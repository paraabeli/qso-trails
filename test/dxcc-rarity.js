'use strict';

const assert = require('assert/strict');
const { normalizeRanks, topRarestWorked } = require('../dxcc-rarity');

const ranks = normalizeRanks({
  '1': '344',
  '2': '123',
  '3': '291',
  nope: '999',
  '1001': '456'
});
assert.deepEqual(ranks, { '123': 2, '291': 3, '344': 1 });

const rows = [
  { dxcc: '291', country: 'Entity C' },
  { dxcc: '344', country: 'Entity A' },
  { dxcc: '123', country: 'Entity B' },
  { dxcc: '344', country: 'Entity A' },
  { dxcc: '999', country: 'Unranked' },
  { dxcc: '', country: 'Missing' }
];
const rarest = topRarestWorked(rows, { ranks }, 3);
assert.deepEqual(rarest, [
  { dxcc: '344', country: 'Entity A', rank: 1, qsos: 2 },
  { dxcc: '123', country: 'Entity B', rank: 2, qsos: 1 },
  { dxcc: '291', country: 'Entity C', rank: 3, qsos: 1 }
]);
assert.deepEqual(topRarestWorked(rows, { ranks }, 2).map(row => row.dxcc), ['344', '123']);
assert.deepEqual(topRarestWorked(rows, null, 3), []);

console.log('DXCC rarity tests passed');
