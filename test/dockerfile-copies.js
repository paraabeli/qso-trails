'use strict';

// Guard against the Dockerfile's hand-maintained COPY list drifting from the
// modules the app actually requires.
//
// The image does not COPY the whole context: it lists each module explicitly.
// Adding a new module and forgetting to add it here is only caught at container
// start ("Cannot find module './x'") or, worse, when a *build-time* RUN script
// fails. This test catches it at check time.
//
// Two things are checked, because one flat "is it COPYed somewhere?" set is not
// enough:
//
//   1. Layer order. A module must be COPYed *before* the RUN step that needs it.
//      `earth-texture.js` gained a `require('./data-dir')`; `data-dir.js` was in
//      the Dockerfile but only much later, so the build-time Earth-seed step
//      (which CI skips) died with MODULE_NOT_FOUND while this test still passed.
//   2. Build-time entrypoints. The require graph is walked from the build-time
//      scripts too, not only from server.js and the preloads.

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Files the container runs: server.js plus the preloads from package.json.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const preloads = [...String(pkg.scripts.start).matchAll(/--require\s+(\S+)/g)].map(match => match[1].replace(/^\.\//, ''));
const entries = [...preloads, 'server.js'];

const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

// --- parse the Dockerfile into ordered steps, joining `\` continuations ---
const steps = [];
{
  const lines = dockerfile.split('\n');
  let pending = '';
  for (const line of lines) {
    const text = pending ? `${pending} ${line.trim()}` : line.trim();
    if (text.endsWith('\\')) { pending = text.slice(0, -1).trim(); continue; }
    pending = '';
    if (!text || text.startsWith('#')) continue;
    const copy = text.match(/^COPY\s+(.*)$/i);
    if (copy) {
      // `COPY a b c dest` copies a, b and c; the last token is the destination.
      const tokens = copy[1].split(/\s+/).filter(token => !token.startsWith('--'));
      if (tokens.length >= 2) steps.push({ type: 'copy', sources: tokens.slice(0, -1).map(s => s.replace(/^\.\//, '')) });
      continue;
    }
    if (/^RUN\s/i.test(text)) steps.push({ type: 'run', text });
  }
}

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

function closure(entryFiles) {
  const seen = new Set();
  const queue = [...entryFiles];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of localRequires(file)) {
      const target = resolveLocal(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

// --- check 1: layer order for build-time RUN steps that invoke node ---
const copiedSoFar = new Set();
const orderViolations = [];
for (const step of steps) {
  if (step.type === 'copy') {
    for (const source of step.sources) copiedSoFar.add(source);
    continue;
  }
  for (const match of step.text.matchAll(/\bnode(?:\.js)?\s+([\w./-]+\.js)\b/g)) {
    const entry = match[1].replace(/^\.\//, '');
    if (!fs.existsSync(path.join(root, entry))) continue;
    for (const file of closure([entry])) {
      if (!copiedSoFar.has(file)) orderViolations.push(`${file} (needed by the "node ${entry}" step)`);
    }
  }
}
assert.deepEqual(
  orderViolations.sort(),
  [],
  `these modules are not COPYed before the build-time step that needs them: ${orderViolations.join(', ')}`
);

// --- check 2: the runtime require graph is fully COPYed by the end ---
const copiedFinally = new Set();
for (const step of steps) if (step.type === 'copy') for (const source of step.sources) copiedFinally.add(source);

const runtimeFiles = closure(entries);
const missing = [...runtimeFiles].filter(file => !copiedFinally.has(file)).sort();
assert.deepEqual(missing, [], `these required modules are not COPYed in the Dockerfile: ${missing.join(', ')}`);

const checked = new Set([...runtimeFiles, ...orderViolations]);
console.log(`Dockerfile COPY coverage tests passed (${checked.size} modules).`);
