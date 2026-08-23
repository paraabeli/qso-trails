'use strict';

const assert = require('assert');
const { parseAdif } = require('../adif-parser');

assert.deepStrictEqual(
  parseAdif('<CALL:5>K1ABC<GRIDSQUARE:4>FN31<EOR>'),
  [{ CALL: 'K1ABC', GRIDSQUARE: 'FN31' }]
);

assert.deepStrictEqual(
  parseAdif('<band:3:S>20M<mode:3>FT8<eor>'),
  [{ BAND: '20M', MODE: 'FT8' }]
);

assert.deepStrictEqual(
  parseAdif('<COMMENT:5>a<b>c<CALL:3>ABC<EOR>'),
  [{ COMMENT: 'a<b>c', CALL: 'ABC' }]
);

assert.deepStrictEqual(
  parseAdif('<ADIF_VER:5>3.1.4<EOH><CALL:3>ABC<EOR>'),
  [{ CALL: 'ABC' }]
);

assert.deepStrictEqual(
  parseAdif('<CALL:3>ABC'),
  [{ CALL: 'ABC' }]
);

assert.deepStrictEqual(
  parseAdif('<CALL:x>ABC<EOR><BAD-NAME:3>XYZ<EOR>'),
  []
);

const adversarial = '<0:0:>'.repeat(50_000) + '<EOR>';
assert.deepStrictEqual(parseAdif(adversarial), [{ '0': '' }]);

const unterminated = '<0:0:'.repeat(50_000);
assert.deepStrictEqual(parseAdif(unterminated), []);

console.log('adif-parser tests passed');
