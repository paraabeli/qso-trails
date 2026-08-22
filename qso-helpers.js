'use strict';

function maidenheadToLatLon(gridValue) {
  const g = String(gridValue || '').trim().toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?([0-9]{2})?$/.test(g)) return null;
  let lon = (g.charCodeAt(0) - 65) * 20 - 180 + Number(g[2]) * 2;
  let lat = (g.charCodeAt(1) - 65) * 10 - 90 + Number(g[3]);
  let lonSize = 2, latSize = 1;
  if (g.length >= 6) {
    lonSize = 2 / 24; latSize = 1 / 24;
    lon += (g.charCodeAt(4) - 65) * lonSize;
    lat += (g.charCodeAt(5) - 65) * latSize;
  }
  if (g.length >= 8) {
    lonSize /= 10; latSize /= 10;
    lon += Number(g[6]) * lonSize;
    lat += Number(g[7]) * latSize;
  }
  return { lat: lat + latSize / 2, lon: lon + lonSize / 2 };
}

function positionAtPrecision(lat, lon, gridValue, precision) {
  if (precision === 'exact') return { lat, lon };
  const length = precision === 'grid6' ? 6 : 4;
  const gridText = String(gridValue || '').trim().toUpperCase();
  if (gridText.length >= length) {
    const p = maidenheadToLatLon(gridText.slice(0, length));
    if (p) return p;
  }
  if (precision === 'grid6') return { lat: Math.round(lat * 20) / 20, lon: Math.round(lon * 10) / 10 };
  return { lat: Math.round(lat), lon: Math.round(lon / 2) * 2 };
}

function publicHome(settings) {
  const exact = maidenheadToLatLon(settings.homeGrid);
  return exact ? positionAtPrecision(exact.lat, exact.lon, settings.homeGrid, settings.homePrecision) : null;
}

function qsoSortKey(q) {
  return `${String(q.date || '').padStart(8, '0')}${String(q.time || '').padStart(6, '0')}${String(q.sourceId || 0).padStart(12, '0')}`;
}

function qsoTimestamp(q) {
  const d = String(q.date || '').replace(/\D/g, '').slice(0, 8);
  const t = String(q.time || '').replace(/\D/g, '').padEnd(6, '0').slice(0, 6);
  if (!/^\d{8}$/.test(d)) return 0;
  return Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)), Number(t.slice(0, 2)), Number(t.slice(2, 4)), Number(t.slice(4, 6)));
}

function distanceKm(a, b) {
  const toRad = value => value * Math.PI / 180;
  const p1 = toRad(a.lat), p2 = toRad(b.lat), dp = toRad(b.lat - a.lat), dl = toRad(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function sanitizePublicQso(q, settings) {
  const p = positionAtPrecision(q.lat, q.lon, q.grid, settings.remotePrecision);
  const out = { band: q.band, lat: p.lat, lon: p.lon };
  if (settings.showMode) out.mode = q.mode;
  if (settings.showCallsigns) out.call = q.call;
  if (settings.showDates) out.date = q.date;
  if (settings.showTimes) out.time = q.time;
  if (settings.showRemoteGrid) out.grid = q.grid;
  return out;
}

module.exports = {
  distanceKm,
  maidenheadToLatLon,
  positionAtPrecision,
  publicHome,
  qsoSortKey,
  qsoTimestamp,
  sanitizePublicQso
};
