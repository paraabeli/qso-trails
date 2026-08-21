'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

process.env.TRUST_PROXY = 'false';
const guard = require('../network-guard');

assert.strictEqual(guard.normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
assert.strictEqual(guard.isRestrictedIp('127.0.0.1'), true);
assert.strictEqual(guard.isRestrictedIp('::ffff:127.0.0.1'), true);
assert.strictEqual(guard.isRestrictedIp('10.1.2.3'), true);
assert.strictEqual(guard.isRestrictedIp('172.16.1.1'), true);
assert.strictEqual(guard.isRestrictedIp('192.168.1.1'), true);
assert.strictEqual(guard.isRestrictedIp('169.254.169.254'), true);
assert.strictEqual(guard.isRestrictedIp('2001:db8::1'), true);
assert.strictEqual(guard.isRestrictedIp('fc00::1'), true);
assert.strictEqual(guard.isRestrictedIp('fe80::1'), true);
assert.strictEqual(guard.isRestrictedIp('8.8.8.8'), false);
assert.strictEqual(guard.isRestrictedIp('2606:4700:4700::1111'), false);

const allowed = new URL('https://example.invalid/index.php/api/v2/confirmation?type=lotw&page=500&per_page=1000');
guard.enforceConfirmationCap(allowed);
const denied = new URL('https://example.invalid/index.php/api/v2/confirmation?type=lotw&page=501&per_page=1000');
assert.throws(() => guard.enforceConfirmationCap(denied), /record safety cap/i);

function runChild(script, extraEnv = {}) {
  return spawnSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv }
  });
}

function proxySetting(envValue) {
  const script = `process.env.TRUST_PROXY=${JSON.stringify(envValue)}; require('./network-guard'); const express=require('express'); const app=express(); app.set('trust proxy',1); const v=app.get('trust proxy'); console.log(typeof v==='function'?'function':String(v));`;
  const result = runChild(script);
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
}

assert.strictEqual(proxySetting('false'), 'false');
assert.strictEqual(proxySetting('loopback,uniquelocal'), 'loopback,uniquelocal');

const fetchScript = String.raw`
const http=require('http');
process.env.ALLOW_PRIVATE_WAVELOG='true';
process.env.ALLOW_INSECURE_WAVELOG='true';
process.env.TRUST_PROXY='false';
require('./network-guard');
const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,path:req.url,auth:req.headers.authorization||''}));});
server.listen(0,'127.0.0.1',async()=>{
  try {
    const port=server.address().port;
    const r=await fetch('http://localhost:'+port+'/index.php/api/v2/qso?page=1',{headers:{Authorization:'Bearer test-token'}});
    const j=await r.json();
    if(!r.ok||j.ok!==true||j.auth!=='Bearer test-token') process.exitCode=2;
  } catch(e) { console.error(e); process.exitCode=3; }
  finally { server.close(); }
});
`;
const fetchResult = runChild(fetchScript, { ALLOW_PRIVATE_WAVELOG: 'true', ALLOW_INSECURE_WAVELOG: 'true', TRUST_PROXY: 'false' });
assert.strictEqual(fetchResult.status, 0, fetchResult.stderr);

console.log('Network guard regression tests passed.');
