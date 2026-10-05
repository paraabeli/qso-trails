'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { exactOrAtomicTemp } = require('./safe-files');
const { DATA_DIR: DATA } = require('./data-dir');
const { normalizedLotwSettings, getMetrics } = require('./snapshot');

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

function jsonClone(value) { return JSON.parse(JSON.stringify(value)); }
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

async function getLotwState() { return await ensureLotwState(); }

// Compact LoTW health for the authenticated diagnostics endpoint. Never
// includes confirmation contents, only availability/timestamps/last error.
function lotwStatus() {
  return {
    confirmationAvailable,
    lastSyncAt: lotwState?.lastSyncAt || null,
    error: lastConfirmationError
  };
}

function exposureFrom(body = {}) {
  const lotw = normalizedLotwSettings(body.settings || {});
  const metrics = getMetrics();
  return {
    ...(body.publicExposure || {}),
    qsoCount: metrics.qsoCount,
    returnedQsos: metrics.returnedQsos,
    allQsoCount: metrics.allQsoCount,
    lotwCount: metrics.lotwCount,
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
            const body = html.includes(script) ? html : html.replace('</body>', `<script src="${script}"></script></body>`);
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
          const etag = `"${crypto.createHash('sha256').update(body).digest('base64url')}"`;
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
              const etag = `"${crypto.createHash('sha256').update(body).digest('base64url')}"`;
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
          body.meta = { ...(body.meta || {}), lotwConfirmed: getMetrics().lotwCount };
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
        patchJsonResponse(res, body => {
          if (!body || typeof body !== 'object') return body;
          const metrics = getMetrics();
          return {
            ...body,
            visibleQsos: metrics.qsoCount,
            returnedQsos: metrics.returnedQsos,
            allQsoCount: metrics.allQsoCount,
            lotwCount: metrics.lotwCount,
            publicExposure: exposureFrom({ settings: requestLotwSettings, publicExposure: body.publicExposure })
          };
        });
        next();
      };
      return originalPost.call(this, route, before, ...handlers);
    }
    if (route === '/api/admin/wavelog/sync') {
      const before = (req, res, next) => {
        patchJsonResponse(res, body => body && typeof body === 'object' ? {
          ...body,
          lotwCount: getMetrics().lotwCount,
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
// The public snapshot is no longer rebuilt here: the explicit publication
// pipeline in snapshot.js owns it. This write patch remains for the data files
// it still enriches: QSO records gain their resolved LoTW confirmation state on
// write, and settings gain the submitted LoTW filter/count choices.
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

module.exports = { install, normalizedLotwSettings, getLotwState, lotwStatus };