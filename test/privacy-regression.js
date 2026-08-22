'use strict';

const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const SETTINGS = path.join(DATA, 'settings.json');
const { hardenPublicSnapshot, staticRateLimit } = require('../privacy-guard');

async function writeSettings(overrides = {}) {
  await fs.mkdir(DATA, { recursive: true });
  await fs.writeFile(SETTINGS, JSON.stringify({
    showCallsigns: false,
    showMode: false,
    showDates: false,
    showTimes: false,
    showRemoteGrid: false,
    showDxccStats: false,
    showStats: true,
    lotwFilter: 'all',
    embedCount: 'qso',
    ...overrides
  }));
}

function fixture(overrides = {}) {
  return {
    version: 4,
    settings: {
      stationName: 'PUBLIC STATION',
      home: { lat: 60, lon: 24 },
      autoRotate: true,
      showStats: true,
      maxPaths: 2500,
      lotwFilter: 'all',
      embedCount: 'qso'
    },
    allQsoCount: 12,
    qsoCount: 10,
    lotwCount: 4,
    returnedQsos: 1,
    stats: { dxcc: { metadataAvailable: true, topDxcc: [{ country: 'SECRET_COUNTRY', dxcc: '999' }] } },
    qsos: [{
      band: '20M',
      lat: 61,
      lon: 25,
      call: 'SECRET_CALLSIGN',
      mode: 'SECRET_MODE',
      date: '20991231',
      time: '235959',
      grid: 'AA00AA00',
      source: 'wavelog',
      sourceId: 987654321,
      lotwConfirmed: true,
      lotwConfirmedAt: '2099-12-31',
      dxcc: '999',
      country: 'SECRET_COUNTRY',
      cont: 'XX'
    }],
    ...overrides
  };
}

async function hardened(payload) {
  return JSON.parse(await hardenPublicSnapshot(JSON.stringify(payload)));
}

function runStaticRateLimit(req) {
  const result = { statusCode: 200, nextCalled: false, body: '' };
  const res = {
    set() { return res; },
    status(code) { result.statusCode = code; return res; },
    send(body) { result.body = body; return res; }
  };
  staticRateLimit(req, res, () => { result.nextCalled = true; });
  return result;
}

(async () => {
  let previous = null;
  try { previous = await fs.readFile(SETTINGS); } catch (error) { if (error.code !== 'ENOENT') throw error; }

  try {
    const limiterIp = '198.51.100.77';
    for (let i = 0; i < 60; i++) {
      const req = { ip: limiterIp, socket: { remoteAddress: limiterIp } };
      assert.equal(runStaticRateLimit(req).nextCalled, true, `static request ${i + 1} should be allowed`);
      assert.equal(runStaticRateLimit(req).nextCalled, true, 'fallthrough handler must not charge the same request twice');
    }
    const blocked = runStaticRateLimit({ ip: limiterIp, socket: { remoteAddress: limiterIp } });
    assert.equal(blocked.nextCalled, false);
    assert.equal(blocked.statusCode, 429, 'the 61st logical static request should be throttled');

    await writeSettings({ embedCount: 'qso' });
    let out = await hardened(fixture());
    const serialized = JSON.stringify(out);
    for (const sentinel of ['SECRET_CALLSIGN', 'SECRET_MODE', '20991231', '235959', 'AA00AA00', '987654321', '2099-12-31', 'SECRET_COUNTRY']) {
      assert.equal(serialized.includes(sentinel), false, `private sentinel leaked: ${sentinel}`);
    }
    assert.equal(out.qsoCount, 10);
    assert.equal('lotwCount' in out, false);
    assert.equal('allQsoCount' in out, false);
    assert.equal('returnedQsos' in out, false);
    assert.equal(out.stats.dxcc, null);
    assert.equal('lotwFilter' in out.settings, false);
    assert.equal('maxPaths' in out.settings, false);

    await writeSettings({ embedCount: 'lotw' });
    out = await hardened(fixture({ settings: { ...fixture().settings, embedCount: 'lotw' } }));
    assert.equal(out.qsoCount, 4, 'LoTW-only public generic count must equal LoTW count');
    assert.equal('lotwCount' in out, false, 'LoTW-only mode must not expose a second count');

    await writeSettings({ embedCount: 'both' });
    out = await hardened(fixture({ settings: { ...fixture().settings, embedCount: 'both' } }));
    assert.equal(out.qsoCount, 10);
    assert.equal(out.lotwCount, 4);

    await writeSettings({ showStats: false, embedCount: 'both' });
    out = await hardened(fixture({ settings: { ...fixture().settings, showStats: false, embedCount: 'both' } }));
    assert.equal('qsoCount' in out, false);
    assert.equal('lotwCount' in out, false);

    await writeSettings({ lotwFilter: 'confirmed', embedCount: 'qso' });
    await assert.rejects(
      () => hardenPublicSnapshot(JSON.stringify(fixture({ version: 3, settings: { ...fixture().settings, lotwFilter: 'all' } }))),
      /Refusing fail-open snapshot/
    );

    out = await hardened(fixture({ settings: { ...fixture().settings, lotwFilter: 'confirmed' } }));
    assert.equal(Array.isArray(out.qsos), true);

    console.log('privacy regression tests passed');
  } finally {
    if (previous) await fs.writeFile(SETTINGS, previous);
    else await fs.rm(SETTINGS, { force: true });
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
