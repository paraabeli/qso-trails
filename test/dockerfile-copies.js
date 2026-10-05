'use strict';

// Guard against the Dockerfile's hand-maintained COPY list drifting from the
// modules the app actually requires.
//
// The image does not COPY the whole context: it lists each module explicitly.
// Adding a new module and forgetting to add it here is only caught at container
// start ("Cannot find module './x'"). This test catches it at build time by
// walking every local require() reachable from the runtime entrypoints and
// checking it against the Dockerfile.

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Files the container runs: server.js plus the preloads from package.json.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const preloads = [...String(pkg.scripts.start).matchAll(/--require\s+(\S+)/g)].map(match => match[1].replace(/^\.\//, ''));
const entries = [...preloads, 'server.js'];

const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const copied = new Set();
for (const line of dockerfile.split('\n')) {
  const match = line.match(/^\s*COPY\s+(.*)$/i);
  if (!match) continue;
  // `COPY a b c dest` copies a, b and c; the last token is the destination.
  const tokens = match[1].trim().split(/\s+/).filter(token => !token.startsWith('--'));
  if (tokens.length < 2) continue;
  for (const source of tokens.slice(0, -1)) copied.add(source.replace(/^\.\//, ''));
}

// Resolve a relative require specifier to an on-disk module, applying Node's
// extension/index resolution so `require('./safe-files')` finds `safe-files.js`.
function resolveLocal(fromFile, spec) {
  const base = path.normalize(path.join(path.dirname(fromFile), spec));
  if (base.startsWith('..')) return null;
  for (const candidate of [base, `${base}.js`, path.join(base, 'index.js')]) {
    const absolute = path.join(root, candidate);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) return candidate;
  }
  return null;
}

function localRequires(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  return [...source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)].map(match => match[1]);
}

const seen = new Set();
const missing = [];
const queue = [...entries];
while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!copied.has(file)) missing.push(file);
  for (const spec of localRequires(file)) {
    const target = resolveLocal(file, spec);
    if (target && !seen.has(target)) queue.push(target);
  }
}

assert.deepEqual(missing.sort(), [], `these required modules are not COPYed in the Dockerfile: ${missing.join(', ')}`);

console.log(`Dockerfile COPY coverage tests passed (${seen.size} modules).`);