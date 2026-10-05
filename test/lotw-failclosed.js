'use strict';

const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const isolatedDataDir = !process.env.QSO_TRAILS_DATA_DIR;
if (isolatedDataDir) process.env.QSO_TRAILS_DATA_DIR = require('fs').mkdtempSync(path.join(os.tmpdir(), 'qso-trails-failclosed-'));

const { DATA_DIR: DATA } = require('../data-dir');
const { publishPublicSnapshot, PUBLIC_SNAPSHOT_FILE } = require('../snapshot');

const SETTINGS = path.join(DATA, 'settings.json');

(async () => {
  await fs.mkdir(DATA, { recursive: true });

  // 1. Under a LoTW-confirmed-only policy, a fail-open payload must be rejected
  //    and the previous known-good snapshot left byte-identical.
  await fs.writeFile(SETTINGS, JSON.stringify({ lotwFilter: 'confirmed', showStats: true, embedCount: 'qso' }));
  const good = {
    version: 4,
    settings: { showStats: true, lotwFilter: 'confirmed', embedCount: 'qso' },
    qsoCount: 1, lotwCount: 1,
    stats: { dxcc: null },
    qsos: [{ band: '20M', lat: 1, lon: 2 }]
  };
  await publishPublicSnapshot(good);
  const before = await fs.readFile(PUBLIC_SNAPSHOT_FILE, 'utf8');

  const failOpen = {
    version: 4,
    settings: { showStats: true, lotwFilter: 'all', embedCount: 'qso' },
    qsoCount: 1, lotwCount: 0,
    stats: { dxcc: null },
    qsos: []
  };
  await assert.rejects(() => publishPublicSnapshot(failOpen), /Refusing fail-open snapshot/);
  const after = await fs.readFile(PUBLIC_SNAPSHOT_FILE, 'utf8');
  assert.equal(after, before, 'a rejected publish must preserve the previous snapshot byte-for-byte');

  // 2. A malformed payload is rejected before it can overwrite anything.
  await assert.rejects(() => publishPublicSnapshot({ settings: {} }), /malformed public snapshot/i);

  if (isolatedDataDir) await fs.rm(DATA, { recursive: true, force: true });
  console.log('LoTW fail-closed tests passed.');
})().catch(error => { console.error(error); process.exit(1); });