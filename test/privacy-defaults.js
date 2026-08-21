'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const path = require('path');

const root = path.join(__dirname, '..');
const data = path.join(root, 'data');
const settingsFile = path.join(data, 'settings.json');
const snapshotFile = path.join(data, 'public-snapshot.json');

(async()=>{
  await fs.mkdir(data,{recursive:true});
  await fs.rm(settingsFile,{force:true});
  await fs.rm(snapshotFile,{force:true});

  const defaults = require('../privacy-defaults');
  assert.deepStrictEqual(defaults.privacySettings({}), { publishStationName:false, showDxccStats:false });
  assert.deepStrictEqual(defaults.privacySettings({ publishStationName:true, showDxccStats:true }), { publishStationName:true, showDxccStats:true });

  await fs.writeFile(settingsFile, JSON.stringify({ stationName:'SECRET STATION' }));
  const stored = JSON.parse(await fs.readFile(settingsFile,'utf8'));
  assert.strictEqual(stored.publishStationName,false);
  assert.strictEqual(stored.showDxccStats,false);

  await fs.writeFile(snapshotFile, JSON.stringify({
    settings:{stationName:'SECRET STATION'},
    stats:{dxcc:{entities:123}},
    qsos:[]
  }));
  const hidden = JSON.parse(await fs.readFile(snapshotFile,'utf8'));
  assert.strictEqual(Object.hasOwn(hidden.settings,'stationName'),false);
  assert.strictEqual(hidden.stats.dxcc,null);

  await fs.writeFile(settingsFile, JSON.stringify({ publishStationName:true, showDxccStats:true, stationName:'PUBLIC STATION' }));
  await fs.writeFile(snapshotFile, JSON.stringify({ settings:{stationName:'PUBLIC STATION'}, stats:{dxcc:{entities:5}}, qsos:[] }));
  const published = JSON.parse(await fs.readFile(snapshotFile,'utf8'));
  assert.strictEqual(published.settings.stationName,'PUBLIC STATION');
  assert.strictEqual(published.stats.dxcc.entities,5);

  await fs.rm(settingsFile,{force:true});
  await fs.rm(snapshotFile,{force:true});
  console.log('Privacy default regression tests passed.');
})().catch(error=>{console.error(error);process.exit(1);});
