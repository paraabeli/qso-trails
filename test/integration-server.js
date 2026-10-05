'use strict';

// End-to-end test of the composed preload stack: boots the real server as a
// child process (exactly as production does, via --require preloads), then
// drives it over HTTP. This is the integration coverage the pure unit tests in
// this directory cannot provide.
//
// The child runs with QSO_TRAILS_DATA_DIR pointing at a throwaway directory so
// it never touches an operator's real data.

const assert = require('assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const PRELOADS = ['privacy-guard.js', 'network-guard.js', 'privacy-defaults.js', 'static-publish.js', 'static-theme-pack.js', 'admin-diagnostics.js'];
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'integration-test-password-0123456789';

const basic = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function startServer(port, dataDir) {
  const args = [];
  for (const preload of PRELOADS) args.push('--require', path.join(root, preload));
  args.push(path.join(root, 'server.js'));
  return spawn(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      ADMIN_USER,
      ADMIN_PASSWORD,
      ADMIN_ALLOWED_IPS: '',
      TRUST_PROXY: 'false',
      QSO_TRAILS_DATA_DIR: dataDir,
      ALLOW_PRIVATE_WAVELOG: 'false',
      ALLOW_INSECURE_WAVELOG: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitReady(port, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/embed`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('server did not become ready in time');
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qso-trails-it-'));
  const port = await freePort();
  const child = startServer(port, dataDir);
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  try {
    await waitReady(port);
    const base = `http://127.0.0.1:${port}`;

    // --- public surface -----------------------------------------------------
    const pub = await fetch(`${base}/api/public`);
    assert.equal(pub.status, 200);
    assert.match(pub.headers.get('cache-control') || '', /no-store/i);
    const pubJson = await pub.json();
    assert.ok(Array.isArray(pubJson.qsos), 'public snapshot must expose a qsos array');
    assert.equal('allQsoCount' in pubJson, false, 'internal counts must be stripped');
    assert.equal('returnedQsos' in pubJson, false, 'internal counts must be stripped');
    assert.equal('lotwFilter' in (pubJson.settings || {}), false, 'internal policy flags must be stripped');

    const embed = await fetch(`${base}/embed`);
    const csp = embed.headers.get('content-security-policy') || '';
    assert.match(csp, /style-src 'self'/, 'embed CSP must restrict styles to self');
    assert.equal(csp.includes('unsafe-inline'), false, 'embed CSP must not allow unsafe-inline');

    assert.equal((await fetch(`${base}/assets/admin.html`)).status, 404, 'admin HTML must not be served as a static asset');
    const adminJs = await fetch(`${base}/assets/admin.js`);
    assert.equal(adminJs.status, 200);
    assert.match(adminJs.headers.get('cache-control') || '', /no-store/i, 'admin JS must be no-store');

    // --- admin auth ---------------------------------------------------------
    assert.equal((await fetch(`${base}/api/admin/state`)).status, 401, 'admin state requires auth');

    const state = await fetch(`${base}/api/admin/state`, { headers: { Authorization: basic(ADMIN_USER, ADMIN_PASSWORD) } });
    assert.equal(state.status, 200, 'valid credentials must succeed');
    const stateJson = await state.json();
    assert.ok(stateJson.csrfToken, 'authenticated state must return a CSRF token');
    assert.equal(typeof stateJson.wavelog.lotwConfirmationAvailable, 'boolean');

    const diagnostics = await fetch(`${base}/api/admin/diagnostics`, { headers: { Authorization: basic(ADMIN_USER, ADMIN_PASSWORD) } });
    assert.equal(diagnostics.status, 200);
    const diagnosticsJson = await diagnostics.json();
    assert.equal(typeof diagnosticsJson.lotw.confirmationAvailable, 'boolean', 'diagnostics must report LoTW health');
    assert.equal('csrfToken' in diagnosticsJson, false, 'diagnostics must not leak the CSRF token');

    // --- CSRF ---------------------------------------------------------------
    const noCsrf = await fetch(`${base}/api/admin/settings`, {
      method: 'POST',
      headers: { Authorization: basic(ADMIN_USER, ADMIN_PASSWORD), 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeGrid: 'KP20' })
    });
    assert.equal(noCsrf.status, 403, 'admin mutation without a CSRF token must be rejected');

    const withCsrf = await fetch(`${base}/api/admin/settings`, {
      method: 'POST',
      headers: { Authorization: basic(ADMIN_USER, ADMIN_PASSWORD), 'Content-Type': 'application/json', 'X-CSRF-Token': stateJson.csrfToken },
      body: JSON.stringify({ stationName: 'IT Station', homeGrid: 'KP20', bands: [], modes: [], homePrecision: 'grid4', remotePrecision: 'grid4', maxPaths: 500 })
    });
    assert.equal(withCsrf.status, 200, `CSRF-protected publish must succeed: ${await withCsrf.text()}`);

    // --- failed-auth throttling (run last: it locks out this client IP) -----
    let lastStatus = 0;
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await fetch(`${base}/api/admin/state`, { headers: { Authorization: basic(ADMIN_USER, 'wrong-password') } });
      lastStatus = response.status;
    }
    assert.equal(lastStatus, 429, 'repeated failed admin auth must be throttled');

    console.log('Integration server tests passed.');
  } finally {
    child.kill('SIGKILL');
    await new Promise(resolve => setTimeout(resolve, 200));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
    if (stderr) process.stderr.write(stderr);
  }
})().catch(error => { console.error(error); process.exit(1); });