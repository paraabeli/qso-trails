'use strict';

// Asset cache-bust consistency check.
//
// public/embed.html and public/admin.html carry a `?v=<stamp>` cache-bust on
// every asset, plus a human-readable build label. This script is the single
// place that asserts they all agree, so CI does not need to hardcode the stamp.

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const embedHtml = read('public/embed.html');
const adminHtml = read('public/admin.html');

const versions = html => [...html.matchAll(/\?v=([0-9A-Za-z._-]+)/g)].map(match => match[1]);
const embedVersions = versions(embedHtml);
const adminVersions = versions(adminHtml);
assert.ok(embedVersions.length, 'public/embed.html must carry at least one asset version');
assert.ok(adminVersions.length, 'public/admin.html must carry at least one asset version');

const unique = new Set([...embedVersions, ...adminVersions]);
assert.equal(unique.size, 1, `all asset cache-bust versions must match, found: ${[...unique].join(', ')}`);

const version = [...unique][0];
const [date, rev] = version.split('-');
assert.match(date, /^\d{8}$/, `asset version date stamp must be YYYYMMDD, got ${date}`);
assert.ok(rev, `asset version must end in a revision, got ${version}`);
const label = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}.${rev}`;

assert.ok(embedHtml.includes(`data-qso-ui-build="${label}"`), `public/embed.html build label must be "${label}"`);
assert.ok(adminHtml.includes(`Admin UI build ${label}`), `public/admin.html build label must be "Admin UI build ${label}"`);

console.log(`Asset version checks passed (v=${version}, label=${label}).`);