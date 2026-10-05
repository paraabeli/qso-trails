'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Isolate the private data directory so a local test run can never read or
// rewrite an operator's real settings.json.
const isolatedDataDir = !process.env.QSO_TRAILS_DATA_DIR;
if (isolatedDataDir) process.env.QSO_TRAILS_DATA_DIR = require('fs').mkdtempSync(path.join(os.tmpdir(), 'qso-trails-defaults-'));

const { DATA_DIR: data } = require('../data-dir');
const settingsFile = path.join(data, 'settings.json');

(async()=>{
  await fs.mkdir(data,{recursive:true});
  await fs.rm(settingsFile,{force:true});

  const defaults = require('../privacy-defaults');
  assert.deepStrictEqual(defaults.privacySettings({}), { publishStationName:false, showDxccStats:false });
  assert.deepStrictEqual(defaults.privacySettings({ publishStationName:true, showDxccStats:true }), { publishStationName:true, showDxccStats:true });

  // The settings write patch persists explicit opt-in defaults alongside any
  // settings write, so the stored file always carries publishStationName and
  // showDxccStats. Their effect on the public snapshot is enforced by
  // privacy-guard.hardenPublicSnapshot (covered by privacy-regression).
  await fs.writeFile(settingsFile, JSON.stringify({ stationName:'SECRET STATION' }));
  const stored = JSON.parse(await fs.readFile(settingsFile,'utf8'));
  assert.strictEqual(stored.publishStationName,false);
  assert.strictEqual(stored.showDxccStats,false);

  await fs.rm(settingsFile,{force:true});
  if (isolatedDataDir) await fs.rm(data,{recursive:true,force:true});
  console.log('Privacy default regression tests passed.');
})().catch(error=>{console.error(error);process.exit(1);});