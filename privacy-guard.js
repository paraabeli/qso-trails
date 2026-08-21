'use strict';

const fs = require('fs/promises');
const path = require('path');
const express = require('express');

const DATA = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const PUBLIC_SNAPSHOT_FILE = path.join(DATA, 'public-snapshot.json');
const originalReadFile = fs.readFile.bind(fs);
const originalWriteFile = fs.writeFile.bind(fs);
const originalGet = express.application.get;
const originalUse = express.application.use;

const NODE_ENV = process.env.NODE_ENV || 'development';
const REQUIRE_ADMIN_ALLOWLIST = process.env.REQUIRE_ADMIN_ALLOWLIST === 'true';
const ADMIN_ALLOWED_IPS = String(process.env.ADMIN_ALLOWED_IPS || '').trim();

if (NODE_ENV === 'production' && REQUIRE_ADMIN_ALLOWLIST && !ADMIN_ALLOWED_IPS) {
  throw new Error('Production privacy policy requires ADMIN_ALLOWED_IPS to be configured.');
}

function isAtomicTarget(target, file) {
  const exact = path.resolve(file);
  return target === exact || target.startsWith(`${exact}.`);
}

async function readSettings() {
  try {
    const parsed = JSON.parse(await originalReadFile(SETTINGS_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.name === 'SyntaxError') return {};
    throw error;
  }
}

function hardenQso(qso, settings) {
  const q = { ...(qso || {}) };
  for (const key of ['source', 'sourceId', 'lotwConfirmed', 'lotwConfirmedAt', 'dxcc', 'country', 'cont']) delete q[key];
  if (settings.showCallsigns !== true) delete q.call;
  if (settings.showMode !== true) delete q.mode;
  if (settings.showDates !== true) delete q.date;
  if (settings.showTimes !== true) delete q.time;
  if (settings.showRemoteGrid !== true) delete q.grid;
  return q;
}

async function hardenPublicSnapshot(serialized) {
  const snapshot = JSON.parse(String(serialized));
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.qsos) || !snapshot.settings) {
    throw new Error('Refusing to publish malformed public snapshot.');
  }

  const settings = await readSettings();
  const lotwFilter = settings.lotwFilter === 'confirmed' ? 'confirmed' : 'all';
  const embedCount = ['qso', 'lotw', 'both'].includes(settings.embedCount) ? settings.embedCount : 'both';

  // A LoTW-confirmed-only policy must only be published by the LoTW-aware v4+
  // transformer. If that transformer fails, reject the write so the previous
  // known-good atomic snapshot remains in place.
  if (lotwFilter === 'confirmed' && (Number(snapshot.version) < 4 || snapshot.settings.lotwFilter !== 'confirmed')) {
    throw new Error('Refusing fail-open snapshot: LoTW-confirmed-only policy was not applied.');
  }

  snapshot.qsos = snapshot.qsos.map(q => hardenQso(q, settings));

  // Internal accounting stays in authenticated Admin state. Public JSON only
  // retains the count(s) explicitly selected for publication.
  const actualQsoCount = Number(snapshot.qsoCount || 0);
  const lotwCount = Number(snapshot.lotwCount || 0);
  delete snapshot.allQsoCount;
  delete snapshot.returnedQsos;
  delete snapshot.lotwCount;
  delete snapshot.qsoCount;

  if (snapshot.settings.showStats === true) {
    if (embedCount === 'lotw') {
      // qsoCount is the generic static-render count. In LoTW-only mode it is
      // intentionally the published LoTW count, not the total QSO count.
      snapshot.qsoCount = lotwCount;
    } else {
      snapshot.qsoCount = actualQsoCount;
      if (embedCount === 'both') snapshot.lotwCount = lotwCount;
    }
  }

  // Do not expose internal filter/configuration detail that public renderers do
  // not need. embedCount remains because the embed needs to label the selected
  // public count correctly.
  snapshot.settings.embedCount = embedCount;
  delete snapshot.settings.lotwFilter;
  delete snapshot.settings.maxPaths;

  if (settings.showDxccStats !== true && snapshot.stats) snapshot.stats.dxcc = null;

  return JSON.stringify(snapshot, null, 2);
}

// Install before static-publish/lotw-feature. Their final atomic snapshot write
// flows through this wrapper. Any privacy-guard error aborts the temp-file write
// and therefore prevents the rename over the previous known-good snapshot.
fs.writeFile = async function privacyCheckedWriteFile(file, data, options) {
  const target = path.resolve(String(file));
  if (isAtomicTarget(target, PUBLIC_SNAPSHOT_FILE) && typeof data === 'string') {
    data = await hardenPublicSnapshot(data);
  }
  return originalWriteFile(file, data, options);
};

function noStore(req, res, next) {
  const originalSet = res.set.bind(res);
  res.set = (field, value) => {
    if (typeof field === 'string' && field.toLowerCase() === 'cache-control') {
      return originalSet('Cache-Control', 'no-store');
    }
    if (field && typeof field === 'object' && Object.keys(field).some(k => k.toLowerCase() === 'cache-control')) {
      return originalSet({ ...field, 'Cache-Control': 'no-store' });
    }
    return originalSet(field, value);
  };
  originalSet('Cache-Control', 'no-store');
  next();
}

const staticBuckets = new Map();
function staticRateLimit(req, res, next) {
  const now = Date.now();
  const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
  let bucket = staticBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= 60_000) bucket = { startedAt: now, count: 0 };
  bucket.count++;
  staticBuckets.set(ip, bucket);
  if (staticBuckets.size > 4096) {
    for (const [key, value] of staticBuckets) if (now - value.startedAt > 120_000) staticBuckets.delete(key);
  }
  if (bucket.count > 60) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.startedAt + 60_000 - now) / 1000))));
    return res.status(429).send('Too many static image requests.');
  }
  next();
}

express.application.get = function privacyGet(route, ...handlers) {
  if (route === '/api/public') return originalGet.call(this, route, noStore, ...handlers);
  if (route === '/static/qrz.png') return originalGet.call(this, route, staticRateLimit, noStore, ...handlers);
  return originalGet.call(this, route, ...handlers);
};

express.application.use = function privacyUse(route, ...handlers) {
  if (route === '/assets') {
    const blockHtml = (req, res, next) => {
      if (/\.html?$/i.test(req.path || '')) return res.status(404).send('Not found.');
      next();
    };
    return originalUse.call(this, route, blockHtml, ...handlers);
  }
  return originalUse.call(this, route, ...handlers);
};

module.exports = { hardenPublicSnapshot };
