'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { distanceKm, publicHome, positionAtPrecision, qsoSortKey, qsoTimestamp, sanitizePublicQso } = require('./qso-helpers');
const { getMostWanted, topRarestWorked } = require('./dxcc-rarity');
const { DATA_DIR } = require('./data-dir');
const { hardenPublicSnapshot, nativeWriteFile } = require('./privacy-guard');

const PUBLIC_SNAPSHOT_FILE = path.join(DATA_DIR, 'public-snapshot.json');
const MIN_PATHS = 100;
const MAX_PATHS = 10_000;
const DEFAULT_PATHS = 2500;

// Metrics for the current published selection, shared with the Admin API
// response shaping in lotw-feature.js. This is presentation state, never
// written to the public snapshot.
let lastMetrics = { allQsoCount: 0, lotwCount: 0, qsoCount: 0, returnedQsos: 0 };

function validLotwFilter(value) { return value === 'confirmed' ? 'confirmed' : 'all'; }
function validEmbedCount(value) { return ['qso', 'lotw', 'both'].includes(value) ? value : 'both'; }

function normalizedLotwSettings(value = {}) {
  return { lotwFilter: validLotwFilter(value.lotwFilter), embedCount: validEmbedCount(value.embedCount) };
}

function clampMaxPaths(value) {
  return Math.max(MIN_PATHS, Math.min(MAX_PATHS, Number(value) || DEFAULT_PATHS));
}

function getMetrics() { return { ...lastMetrics }; }
function setMetrics(next) { lastMetrics = { ...lastMetrics, ...next }; }

// Single implementation of the public DXCC aggregate statistics. Replaces the
// two near-identical copies that previously lived in server.js and
// lotw-feature.js.
function publicDxccStats(qsos, settings, rarityRanking = null) {
  if (settings.showDxccStats !== true) return null;
  const withMeta = qsos.filter(q => q.dxcc || q.country || q.cont);
  const entities = new Set(withMeta.map(q => String(q.dxcc || '')).filter(Boolean));
  const countries = new Set(withMeta.map(q => String(q.country || '')).filter(Boolean));
  const continents = new Set(withMeta.map(q => String(q.cont || '')).filter(Boolean));
  const countMap = key => {
    const map = new Map();
    for (const q of withMeta) {
      const value = String(q[key] || '').trim();
      if (value) map.set(value, (map.get(value) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, qsos]) => ({ name, qsos }));
  };
  const entityMap = new Map(), bandMap = new Map(), modeMap = new Map(), firstWorked = new Map();
  const home = publicHome(settings);
  let farthest = null;
  for (const q of withMeta) {
    const id = String(q.dxcc || '').trim();
    if (!id) continue;
    const current = entityMap.get(id) || { dxcc: id, country: String(q.country || '').trim(), qsos: 0 };
    current.qsos++;
    if (!current.country && q.country) current.country = String(q.country).trim();
    entityMap.set(id, current);
    if (q.band) {
      const b = bandMap.get(q.band) || { qsos: 0, entities: new Set() };
      b.qsos++; b.entities.add(id); bandMap.set(q.band, b);
    }
    if (settings.showMode === true && q.mode) {
      const m = modeMap.get(q.mode) || { qsos: 0, entities: new Set() };
      m.qsos++; m.entities.add(id); modeMap.set(q.mode, m);
    }
    const ts = qsoTimestamp(q);
    if (settings.showDates === true && ts) {
      const previous = firstWorked.get(id);
      if (!previous || ts < previous.ts) firstWorked.set(id, { ts, dxcc: id, country: String(q.country || '').trim() });
    }
    if (home) {
      const p = positionAtPrecision(q.lat, q.lon, q.grid, settings.remotePrecision);
      const km = distanceKm(home, p);
      if (!farthest || km > farthest.distanceKm) farthest = { dxcc: id, country: String(q.country || '').trim(), distanceKm: Math.round(km) };
    }
  }
  const newestFirstWorked = settings.showDates === true ? [...firstWorked.values()].sort((a, b) => b.ts - a.ts)[0] || null : null;
  return {
    metadataAvailable: withMeta.length > 0,
    entities: entities.size,
    countries: countries.size,
    continents: continents.size,
    byContinent: countMap('cont'),
    topDxcc: [...entityMap.values()].sort((a, b) => b.qsos - a.qsos || a.dxcc.localeCompare(b.dxcc, undefined, { numeric: true })).slice(0, 10),
    rarestWorked: topRarestWorked(withMeta, rarityRanking, 3),
    raritySource: rarityRanking ? {
      name: rarityRanking.source,
      fetchedAt: rarityRanking.fetchedAt,
      stale: rarityRanking.stale === true
    } : null,
    byBand: [...bandMap.entries()].map(([band, value]) => ({ band, qsos: value.qsos, entities: value.entities.size })).sort((a, b) => b.entities - a.entities || b.qsos - a.qsos || a.band.localeCompare(b.band, undefined, { numeric: true })),
    byMode: settings.showMode === true ? [...modeMap.entries()].map(([mode, value]) => ({ mode, qsos: value.qsos, entities: value.entities.size })).sort((a, b) => b.entities - a.entities || b.qsos - a.qsos || a.mode.localeCompare(b.mode)) : null,
    farthest,
    newestFirstWorked: newestFirstWorked ? { dxcc: newestFirstWorked.dxcc, country: newestFirstWorked.country, date: new Date(newestFirstWorked.ts).toISOString().slice(0, 10) } : null
  };
}

// Build the pre-hardening public snapshot from already-read inputs. This is the
// single owner of the LoTW-aware selection, statistics and per-QSO projection.
async function buildPublicSnapshot({ qsos = [], settings = {}, confirmations = {} } = {}) {
  const lotwSettings = normalizedLotwSettings(settings);
  const merged = { ...settings, ...lotwSettings };
  const maxPaths = clampMaxPaths(merged.maxPaths);
  const bands = new Set(merged.bands || []), modes = new Set(merged.modes || []);
  const selected = qsos
    .filter(q => bands.has(q.band) && modes.has(q.mode))
    .sort((a, b) => qsoSortKey(b).localeCompare(qsoSortKey(a)));
  const isConfirmed = q => q.lotwConfirmed === true
    || (q.source === 'wavelog' && Number(q.sourceId) > 0 && Boolean(confirmations[String(Number(q.sourceId))]));
  const confirmed = selected.filter(isConfirmed);
  const shown = merged.lotwFilter === 'confirmed' ? confirmed : selected;
  const limited = shown.slice(0, maxPaths);
  const rarityRanking = merged.showDxccStats === true ? await getMostWanted() : null;
  const payload = {
    version: 4,
    settings: {
      stationName: merged.stationName,
      home: publicHome(merged),
      autoRotate: merged.autoRotate !== false,
      showStats: merged.showStats !== false,
      maxPaths,
      lotwFilter: merged.lotwFilter,
      embedCount: merged.embedCount
    },
    allQsoCount: selected.length,
    lotwCount: confirmed.length,
    qsoCount: shown.length,
    returnedQsos: limited.length,
    stats: { dxcc: publicDxccStats(shown, merged, rarityRanking) },
    qsos: limited.map(q => sanitizePublicQso(q, merged))
  };
  lastMetrics = {
    allQsoCount: payload.allQsoCount,
    lotwCount: payload.lotwCount,
    qsoCount: payload.qsoCount,
    returnedQsos: payload.returnedQsos
  };
  return payload;
}

function publicExposureSummary(settings, qsoCount, returnedQsos) {
  return {
    qsoCount,
    returnedQsos,
    required: ['approximate QSO coordinates', 'band'],
    optional: {
      callsign: settings.showCallsigns,
      mode: settings.showMode,
      date: settings.showDates,
      time: settings.showTimes,
      remoteGrid: settings.showRemoteGrid,
      dxccAggregates: settings.showDxccStats
    },
    homePrecision: settings.homePrecision,
    remotePrecision: settings.remotePrecision
  };
}

// Publish a built payload: run the fail-closed privacy guard exactly once, then
// write the hardened serialization with the native (un-patched) writer so the
// privacy boundary is an explicit call rather than an implicit fs.writeFile
// interception. The fs.writeFile guard remains installed as a last-resort
// backstop for any stray writer.
async function publishPublicSnapshot(payload) {
  const serialized = await hardenPublicSnapshot(JSON.stringify(payload));
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${PUBLIC_SNAPSHOT_FILE}.${crypto.randomUUID()}.tmp`;
  await nativeWriteFile(tmp, serialized, { mode: 0o600 });
  await fs.rename(tmp, PUBLIC_SNAPSHOT_FILE);
  return serialized;
}

module.exports = {
  PUBLIC_SNAPSHOT_FILE,
  clampMaxPaths,
  getMetrics,
  setMetrics,
  normalizedLotwSettings,
  publicDxccStats,
  publicExposureSummary,
  buildPublicSnapshot,
  publishPublicSnapshot
};