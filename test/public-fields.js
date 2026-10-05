'use strict';

const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const isolatedDataDir = !process.env.QSO_TRAILS_DATA_DIR;
if (isolatedDataDir) process.env.QSO_TRAILS_DATA_DIR = require('fs').mkdtempSync(path.join(os.tmpdir(), 'qso-trails-fields-'));

const { DATA_DIR: DATA } = require('../data-dir');
const { publicQsoFields, sanitizePublicQso } = require('../qso-helpers');
const { hardenPublicSnapshot } = require('../privacy-guard');

const SETTINGS = path.join(DATA, 'settings.json');

// Every field a private QSO record can carry, including the ones that must
// never be public.
const fullQso = {
  band: '20M', lat: 60.51, lon: 24.12,
  mode: 'FT8', call: 'CALL', date: '20240102', time: '030405', grid: 'KP20',
  source: 'wavelog', sourceId: 123, lotwConfirmed: true, lotwConfirmedAt: '2024-01-02',
  dxcc: '999', country: 'SECRET COUNTRY', cont: 'EU'
};

const BASE = ['band', 'lat', 'lon'];

(async () => {
  await fs.mkdir(DATA, { recursive: true });
  assert.deepEqual(publicQsoFields({}), BASE, 'band + coordinates are always public');

  for (let mask = 0; mask < 32; mask++) {
    const settings = {
      remotePrecision: 'grid4',
      showMode: !!(mask & 1),
      showCallsigns: !!(mask & 2),
      showDates: !!(mask & 4),
      showTimes: !!(mask & 8),
      showRemoteGrid: !!(mask & 16)
    };
    const expected = publicQsoFields(settings).slice().sort();

    const sanitizedKeys = Object.keys(sanitizePublicQso(fullQso, settings)).sort();
    assert.deepEqual(sanitizedKeys, expected, `sanitizePublicQso keys must equal publicQsoFields (mask ${mask})`);

    await fs.writeFile(SETTINGS, JSON.stringify({ showStats: true, embedCount: 'qso', ...settings }));
    const payload = {
      version: 4,
      settings: { showStats: true, lotwFilter: 'all', embedCount: 'qso' },
      qsoCount: 1,
      lotwCount: 0,
      stats: { dxcc: null },
      qsos: [{ ...fullQso }]
    };
    const hardened = JSON.parse(await hardenPublicSnapshot(JSON.stringify(payload)));
    assert.deepEqual(Object.keys(hardened.qsos[0]).sort(), expected, `hardenQso keys must equal publicQsoFields (mask ${mask})`);
    for (const leak of ['source', 'sourceId', 'lotwConfirmed', 'lotwConfirmedAt', 'dxcc', 'country', 'cont']) {
      assert.equal(leak in hardened.qsos[0], false, `${leak} must never reach the public snapshot (mask ${mask})`);
    }
  }

  if (isolatedDataDir) await fs.rm(DATA, { recursive: true, force: true });
  console.log('Public field allowlist tests passed.');
})().catch(error => { console.error(error); process.exit(1); });