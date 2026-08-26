'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { exactOrAtomicTemp } = require('./safe-files');
const { distanceKm, maidenheadToLatLon, positionAtPrecision, publicHome, qsoSortKey, qsoTimestamp, sanitizePublicQso } = require('./qso-helpers');
const { getMostWanted, topRarestWorked } = require('./dxcc-rarity');

const DATA = path.join(__dirname, 'data');
const QSO_FILE = path.join(DATA, 'qsos.json');
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const PUBLIC_SNAPSHOT_FILE = path.join(DATA, 'public-snapshot.json');
const LOTW_FILE = path.join(DATA, 'lotw-confirmations.json');

const originalReadFile = fs.readFile.bind(fs);
const originalWriteFile = fs.writeFile.bind(fs);
const originalFetch = global.fetch.bind(global);
const originalGet = express.application.get;
const originalPost = express.application.post;

const lotwDefaults = { version: 1, lastSyncAt: null, confirmations: {} };
let installed = false;
let lotwState = null;
let pendingSettings = null;
let lastConfirmationError = null;
let confirmationAvailable = false;
let lastMetrics = { allQsoCount: 0, lotwCount: 0, qsoCount: 0, returnedQsos: 0 };

function jsonClone(value) { return JSON.parse(JSON.stringify(value)); }
function validLotwFilter(value) { return value === 'confirmed' ? 'confirmed' : 'all'; }
function validEmbedCount(value) { return ['qso', 'lotw', 'both'].includes(value) ? value : 'both'; }
function normalizedLotwSettings(value = {}) {
  return { lotwFilter: validLotwFilter(value.lotwFilter), embedCount: validEmbedCount(value.embedCount) };
}
async function readJsonOriginal(file, fallback) {
  try { return JSON.parse(await originalReadFile(file, 'utf8')); }
  catch (error) { if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') throw error; return jsonClone(fallback); }
}
async function writeJsonOriginal(file, value) {
  await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  await originalWriteFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
}
async function ensureLotwState() {
  if (lotwState) return lotwState;
  const raw = await readJsonOriginal(LOTW_FILE, lotwDefaults);
  lotwState = {
    version: 1,
    lastSyncAt: raw.lastSyncAt || null,
    confirmations: raw.confirmations && typeof raw.confirmations === 'object' ? raw.confirmations : {}
  };
  confirmationAvailable = Object.keys(lotwState.confirmations).length > 0 || Boolean(lotwState.lastSyncAt);
  return lotwState;
}
function dateFloor(iso) {
  const time = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(time)) return null;
  return new Date(time - 2 * 86400000).toISOString().slice(0, 10);
}
function confirmationUrlFromQso(qsoUrl, page, full, state) {
  const url = new URL(qsoUrl.toString());
  url.pathname = url.pathname.replace(/\/api\/v2\/qso\/?$/i, '/api/v2/confirmation');
  url.search = '';
  url.searchParams.set('type', 'lotw');
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', '1000');
  const station = qsoUrl.searchParams.get('station_id');
  if (station) url.searchParams.set('station_id', station);
  if (!full) {
    const since = dateFloor(state.lastSyncAt);
    if (since) url.searchParams.set('since', since);
  }
  return url;
}
async function refreshLotwConfirmations(qsoUrl, requestInit, full) {
  const state = await ensureLotwState();
  const fetched = {};
  let page = 1;
  try {
    for (;;) {
      const url = confirmationUrlFromQso(qsoUrl, page, full, state);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      let response;
      try {
        response = await originalFetch(url, {
          headers: requestInit?.headers || {},
          redirect: 'error',
          signal: controller.signal
        });
      } finally { clearTimeout(timer); }
      const text = await response.text();
      let json = {};
      if (text) { try { json = JSON.parse(text); } catch { throw new Error('Wavelog confirmation API returned invalid JSON.'); } }
      if (!response.ok) throw new Error(json?.error?.message || json?.message || `Wavelog confirmation request failed (${response.status}).`);
      const rows = Array.isArray(json.data) ? json.data : [];
      for (const row of rows) {
        const id = Number(row.qso_id) || 0;
        if (id && String(row.type || '').toLowerCase() === 'lotw') fetched[id] = String(row.confirmation_date || '');
      }
      if (!json.meta?.has_more) break;
      if (++page > 5000) throw new Error('Wavelog confirmation pagination exceeded the safety limit.');
    }
    state.confirmations = full ? fetched : { ...state.confirmations, ...fetched };
    state.lastSyncAt = new Date().toISOString();
    lotwState = state;
    confirmationAvailable = true;
    lastConfirmationError = null;
    await writeJsonOriginal(LOTW_FILE, state);
  } catch (error) {
    lastConfirmationError = String(error?.message || error);
    confirmationAvailable = Boolean(state.lastSyncAt);
  }
}

function publicDxccStats(qsos, settings, rarityRanking = null) {
  if (settings.showDxccStats === false) return null;
  const withMeta = qsos.filter(q => q.dxcc || q.country || q.cont);
  const entities = new Set(withMeta.map(q => String(q.dxcc || '')).filter(Boolean));
  const countries = new Set(withMeta.map(q => String(q.country || '')).filter(Boolean));
  const continents = new Set(withMeta.map(q => String(q.cont || '')).filter(Boolean));
  const countMap = key => {
    const map = new Map();
    for (const q of withMeta) { const value = String(q[key] || '').trim(); if (value) map.set(value, (map.get(value) || 0) + 1); }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, qsos]) => ({ name, qsos }));
  };
  const entityMap = new Map(), bandMap = new Map(), modeMap = new Map(), firstWorked = new Map();
  const home = publicHome(settings); let farthest = null;
  for (const q of withMeta) {
    const id = String(q.dxcc || '').trim(); if (!id) continue;
    const current = entityMap.get(id) || { dxcc: id, country: String(q.country || '').trim(), qsos: 0 };
    current.qsos++; if (!current.country && q.country) current.country = String(q.country).trim(); entityMap.set(id, current);
    if (q.band) { const b = bandMap.get(q.band) || { qsos: 0, entities: new Set() }; b.qsos++; b.entities.add(id); bandMap.set(q.band, b); }
    if (settings.showMode && q.mode) { const m = modeMap.get(q.mode) || { qsos: 0, entities: new Set() }; m.qsos++; m.entities.add(id); modeMap.set(q.mode, m); }
    const ts = qsoTimestamp(q); if (settings.showDates && ts) { const old = firstWorked.get(id); if (!old || ts < old.ts) firstWorked.set(id, { ts, dxcc: id, country: String(q.country || '').trim() }); }
    if (home) { const p = positionAtPrecision(q.lat, q.lon, q.grid, settings.remotePrecision); const km = distanceKm(home, p); if (!farthest || km > farthest.distanceKm) farthest = { dxcc: id, country: String(q.country || '').trim(), distanceKm: Math.round(km) }; }
  }
  const newest = settings.showDates ? [...firstWorked.values()].sort((a, b) => b.ts - a.ts)[0] || null : null;
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
    byBand: [...bandMap.entries()].map(([band, v]) => ({ band, qsos: v.qsos, entities: v.entities.size })).sort((a, b) => b.entities - a.entities || b.qsos - a.qsos),
    byMode: settings.showMode ? [...modeMap.entries()].map(([mode, v]) => ({ mode, qsos: v.qsos, entities: v.entities.size })).sort((a, b) => b.entities - a.entities || b.qsos - a.qsos) : null,
    farthest,
    newestFirstWorked: newest ? { dxcc: newest.dxcc, country: newest.country, date: new Date(newest.ts).toISOString().slice(0, 10) } : null
  };
}
async function buildSnapshot(serverPayload = {}) {
  const [qsos, settingsRaw, confirmations, rarityRanking] = await Promise.all([
    readJsonOriginal(QSO_FILE, []),
    readJsonOriginal(SETTINGS_FILE, {}),
    ensureLotwState(),
    getMostWanted()
  ]);
  const lotwSettings = normalizedLotwSettings(settingsRaw);
  const settings = { ...settingsRaw, ...lotwSettings };
  const bands = new Set(settings.bands || []), modes = new Set(settings.modes || []);
  const selected = qsos.filter(q => bands.has(q.band) && modes.has(q.mode)).sort((a, b) => qsoSortKey(b).localeCompare(qsoSortKey(a)));
  const isConfirmed = q => q.lotwConfirmed === true || (q.source === 'wavelog' && Number(q.sourceId) > 0 && Boolean(confirmations.confirmations[String(Number(q.sourceId))]));
  const confirmed = selected.filter(isConfirmed);
  const shown = settings.lotwFilter === 'confirmed' ? confirmed : selected;
  const limited = shown.slice(0, Math.max(100, Math.min(10000, Number(settings.maxPaths) || 2500)));
  lastMetrics = { allQsoCount: selected.length, lotwCount: confirmed.length, qsoCount: shown.length, returnedQsos: limited.length };
  return {
    ...serverPayload,
    version: Math.max(4, Number(serverPayload.version) || 0),
    settings: {
      ...(serverPayload.settings || {}),
      stationName: settings.stationName,
      home: publicHome(settings),
      autoRotate: settings.autoRotate !== false,
      showStats: settings.showStats !== false,
      maxPaths: Math.max(100, Math.min(10000, Number(settings.maxPaths) || 2500)),
      lotwFilter: settings.lotwFilter,
      embedCount: settings.embedCount
    },
    allQsoCount: selected.length,
    lotwCount: confirmed.length,
    qsoCount: shown.length,
    returnedQsos: limited.length,
    stats: { dxcc: publicDxccStats(shown, settings, rarityRanking) },
    qsos: limited.map(q => sanitizePublicQso(q, settings))
  };
}
function exposureFrom(body = {}) {
  const lotw = normalizedLotwSettings(body.settings || {});
  return {
    ...(body.publicExposure || {}),
    qsoCount: lastMetrics.qsoCount,
    returnedQsos: lastMetrics.returnedQsos,
    allQsoCount: lastMetrics.allQsoCount,
    lotwCount: lastMetrics.lotwCount,
    lotwFilter: lotw.lotwFilter,
    embedCount: lotw.embedCount
  };
}
function patchJsonResponse(res, mutator) {
  const originalJson = res.json.bind(res);
  res.json = body => originalJson(mutator(body));
}
function installExpressPatches() {
  express.application.get = function patchedGet(route, ...handlers) {
    if (route === '/admin' || route === '/embed') {
      const inject = (req, res, next) => {
        const originalSendFile = res.sendFile.bind(res);
        res.sendFile = (file, ...args) => {
          const script = route === '/admin' ? '/assets/admin-lotw.js' : '/assets/embed-lotw.js';
          void originalReadFile(file, 'utf8').then(html => {
            const body = html.includes(script) ? html : html.replace('</body>', `<script src=\"${script}\"></script></body>`);
            res.type('html').send(body);
          }).catch(next);
          return res;
        };
        next();
      };
      return originalGet.call(this, route, inject, ...handlers);
    }
    if (route === '/api/public') {
      const middleware = handlers.slice(0, -1);
      const originalPublicHandler = handlers.at(-1);
      return originalGet.call(this, route, ...middleware, async (req, res, next) => {
        const sendSnapshot = async () => {
          const body = await originalReadFile(PUBLIC_SNAPSHOT_FILE, 'utf8');
          const etag = `\"${crypto.createHash('sha256').update(body).digest('base64url')}\"`;
          res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
          res.set('ETag', etag);
          if (req.get('if-none-match') === etag) return res.status(304).end();
          return res.type('application/json').send(body);
        };
        try {
          return await sendSnapshot();
        } catch (error) {
          if (error?.code !== 'ENOENT' || typeof originalPublicHandler !== 'function') return next(error);
          const originalSend = res.send.bind(res);
          res.send = payload => {
            void originalReadFile(PUBLIC_SNAPSHOT_FILE, 'utf8').then(body => {
              const etag = `\"${crypto.createHash('sha256').update(body).digest('base64url')}\"`;
              res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
              res.set('ETag', etag);
              res.type('application/json');
              originalSend(body);
            }).catch(next);
            return res;
          };
          return originalPublicHandler(req, res, next);
        }
      });
    }
    if (route === '/api/admin/state') {
      const middleware = (req, res, next) => {
        patchJsonResponse(res, body => {
          if (!body || typeof body !== 'object') return body;
          const lotw = normalizedLotwSettings(body.settings || {});
          body.settings = { ...(body.settings || {}), ...lotw };
          body.meta = { ...(body.meta || {}), lotwConfirmed: lastMetrics.lotwCount };
          body.wavelog = {
            ...(body.wavelog || {}),
            lotwConfirmationSyncAt: lotwState?.lastSyncAt || null,
            lotwConfirmationAvailable: confirmationAvailable,
            lotwConfirmationError: lastConfirmationError
          };
          body.publicExposure = exposureFrom(body);
          return body;
        });
        next();
      };
      return originalGet.call(this, route, middleware, ...handlers);
    }
    return originalGet.call(this, route, ...handlers);
  };
  express.application.post = function patchedPost(route, ...handlers) {
    if (route === '/api/admin/settings') {
      const before = (req, res, next) => {
        const requestLotwSettings = normalizedLotwSettings(req.body || {});
        pendingSettings = requestLotwSettings;
        res.on('finish', () => { if (pendingSettings === requestLotwSettings) pendingSettings = null; });
        patchJsonResponse(res, body => body && typeof body === 'object' ? {
          ...body,
          visibleQsos: lastMetrics.qsoCount,
          returnedQsos: lastMetrics.returnedQsos,
          allQsoCount: lastMetrics.allQsoCount,
          lotwCount: lastMetrics.lotwCount,
          publicExposure: exposureFrom({ settings: requestLotwSettings, publicExposure: body.publicExposure })
        } : body);
        next();
      };
      return originalPost.call(this, route, before, ...handlers);
    }
    if (route === '/api/admin/wavelog/sync') {
      const before = (req, res, next) => {
        patchJsonResponse(res, body => body && typeof body === 'object' ? {
          ...body,
          lotwCount: lastMetrics.lotwCount,
          lotwConfirmationSyncAt: lotwState?.lastSyncAt || null,
          lotwConfirmationAvailable: confirmationAvailable,
          lotwConfirmationError: lastConfirmationError
        } : body);
        next();
      };
      return originalPost.call(this, route, before, ...handlers);
    }
    return originalPost.call(this, route, ...handlers);
  };
}
function installFsPatches() {
  fs.writeFile = async function patchedWriteFile(file, data, options) {
    if (exactOrAtomicTemp(file, QSO_FILE) && typeof data === 'string') {
      try {
        const state = await ensureLotwState();
        if (confirmationAvailable) {
          const rows = JSON.parse(data);
          if (Array.isArray(rows)) {
            for (const q of rows) {
              if (q?.source === 'wavelog' && Number(q.sourceId)) {
                const date = state.confirmations[String(Number(q.sourceId))] || state.confirmations[Number(q.sourceId)] || null;
                q.lotwConfirmed = Boolean(date);
                q.lotwConfirmedAt = date || null;
              }
            }
            data = JSON.stringify(rows, null, 2);
          }
        }
      } catch (error) { lastConfirmationError = `Could not apply LoTW confirmations: ${error.message || error}`; }
    } else if (exactOrAtomicTemp(file, SETTINGS_FILE) && typeof data === 'string' && pendingSettings) {
      try { data = JSON.stringify({ ...JSON.parse(data), ...pendingSettings }, null, 2); }
      finally { pendingSettings = null; }
    } else if (exactOrAtomicTemp(file, PUBLIC_SNAPSHOT_FILE) && typeof data === 'string') {
      try { data = JSON.stringify(await buildSnapshot(JSON.parse(data)), null, 2); }
      catch (error) { lastConfirmationError = `Could not build LoTW-aware public snapshot: ${error.message || error}`; }
    }
    return originalWriteFile(file, data, options);
  };
}
function installFetchPatch() {
  global.fetch = async function patchedFetch(input, init) {
    const url = input instanceof URL ? new URL(input.toString()) : new URL(String(input));
    if (/\/api\/v2\/qso\/?$/i.test(url.pathname) && url.searchParams.get('per_page') === '5000' && url.searchParams.get('page') === '1') {
      const full = !url.searchParams.has('since_id');
      await refreshLotwConfirmations(url, init || {}, full);
    }
    return originalFetch(input, init);
  };
}
function install() {
  if (installed) return;
  installed = true;
  installExpressPatches();
  installFsPatches();
  installFetchPatch();
  ensureLotwState().catch(error => { lastConfirmationError = String(error?.message || error); });
}

module.exports = { install, normalizedLotwSettings };
