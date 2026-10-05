'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// The privacy boundary is installed by --require preloads, so their order is a
// load-order contract, not an implementation detail. See docs/PRELOAD_CONTRACT.md.
const EXPECTED = [
  'privacy-guard.js',
  'network-guard.js',
  'privacy-defaults.js',
  'static-publish.js',
  'static-theme-pack.js',
  'admin-diagnostics.js'
];

function requiresOf(scriptName) {
  return [...String(pkg.scripts[scriptName] || '').matchAll(/--require\s+(\S+)/g)].map(match => match[1].replace(/^\.\//, ''));
}

assert.deepEqual(requiresOf('start'), EXPECTED, 'start --require order must match the documented preload contract');
assert.deepEqual(requiresOf('dev'), EXPECTED, 'dev --require order must match start');

const doc = fs.readFileSync(path.join(root, 'docs', 'PRELOAD_CONTRACT.md'), 'utf8');
let cursor = -1;
for (const file of EXPECTED) {
  const at = doc.indexOf(file);
  assert.ok(at > cursor, `${file} must be listed in docs/PRELOAD_CONTRACT.md in preload order`);
  cursor = at;
}

console.log('Preload order tests passed.');