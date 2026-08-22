'use strict';

const assert = require('assert');
const path = require('path');
const { exactFile, exactOrAtomicTemp, allowedExactFile } = require('../safe-files');

const data = path.join(__dirname, '..', 'data');
const settings = path.join(data, 'settings.json');
const snapshot = path.join(data, 'public-snapshot.json');
const uuid = '123e4567-e89b-42d3-a456-426614174000';

assert.strictEqual(exactFile(settings, settings), true);
assert.strictEqual(exactFile('../settings.json', settings), false);
assert.strictEqual(exactFile(`${settings}/../wavelog.json`, settings), false);
assert.strictEqual(exactFile(Buffer.from(settings), settings), false);

assert.strictEqual(exactOrAtomicTemp(settings, settings), true);
assert.strictEqual(exactOrAtomicTemp(`${settings}.${uuid}.tmp`, settings), true);
assert.strictEqual(exactOrAtomicTemp(`${settings}.attacker.tmp`, settings), false);
assert.strictEqual(exactOrAtomicTemp(`${settings}.../wavelog.json`, settings), false);
assert.strictEqual(exactOrAtomicTemp(path.join(data, 'settings.json.evil'), settings), false);

assert.strictEqual(allowedExactFile(settings, [settings, snapshot]), settings);
assert.strictEqual(allowedExactFile(snapshot, [settings, snapshot]), snapshot);
assert.strictEqual(allowedExactFile(path.join(data, '..', 'server.js'), [settings, snapshot]), null);
assert.strictEqual(allowedExactFile('/etc/passwd', [settings, snapshot]), null);

console.log('safe-files tests passed');
