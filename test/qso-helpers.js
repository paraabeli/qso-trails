'use strict';

const assert = require('node:assert/strict');
const {
  distanceKm,
  maidenheadToLatLon,
  positionAtPrecision,
  publicHome,
  qsoSortKey,
  qsoTimestamp,
  sanitizePublicQso
} = require('../qso-helpers');

assert.deepEqual(maidenheadToLatLon('KP20'), { lat: 60.5, lon: 25 });
assert.equal(maidenheadToLatLon('not-a-grid'), null);

assert.deepEqual(
  positionAtPrecision(60.51, 24.12, 'KP20', 'exact'),
  { lat: 60.51, lon: 24.12 }
);
assert.deepEqual(
  positionAtPrecision(60.51, 24.12, '', 'grid6'),
  { lat: 60.5, lon: 24.1 }
);
assert.deepEqual(
  publicHome({ homeGrid: 'KP20', homePrecision: 'grid4' }),
  { lat: 60.5, lon: 25 }
);

const earlier = { date: '20240102', time: '030405', sourceId: 7 };
const later = { date: '20240103', time: '030405', sourceId: 7 };
assert.equal(qsoSortKey(earlier) < qsoSortKey(later), true);
assert.equal(qsoTimestamp(earlier), Date.UTC(2024, 0, 2, 3, 4, 5));
assert.equal(qsoTimestamp({ date: 'invalid', time: 'invalid' }), 0);

const home = { lat: 60, lon: 24 };
const remote = { lat: 61, lon: 25 };
assert.equal(distanceKm(home, home), 0);
assert.equal(distanceKm(home, remote), distanceKm(remote, home));
assert.equal(distanceKm(home, remote) > 0, true);

const qso = {
  band: '20M',
  lat: 60.51,
  lon: 24.12,
  grid: 'KP20',
  mode: 'FT8',
  call: 'PUBLIC-CALL',
  date: '20240102',
  time: '030405',
  source: 'wavelog',
  sourceId: 123,
  lotwConfirmed: true,
  dxcc: '999',
  country: 'PRIVATE COUNTRY',
  cont: 'XX'
};

const privateSettings = {
  remotePrecision: 'grid4',
  showMode: false,
  showCallsigns: false,
  showDates: false,
  showTimes: false,
  showRemoteGrid: false
};
const privateOutput = sanitizePublicQso(qso, privateSettings);
assert.deepEqual(privateOutput, { band: '20M', lat: 60.5, lon: 25 });
for (const privateField of ['source', 'sourceId', 'lotwConfirmed', 'dxcc', 'country', 'cont']) {
  assert.equal(privateField in privateOutput, false, `${privateField} must stay private`);
}

const publicOutput = sanitizePublicQso(qso, {
  ...privateSettings,
  showMode: true,
  showCallsigns: true,
  showDates: true,
  showTimes: true,
  showRemoteGrid: true
});
assert.deepEqual(publicOutput, {
  band: '20M',
  lat: 60.5,
  lon: 25,
  mode: 'FT8',
  call: 'PUBLIC-CALL',
  date: '20240102',
  time: '030405',
  grid: 'KP20'
});

console.log('QSO helper tests passed.');
