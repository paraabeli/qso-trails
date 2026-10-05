'use strict';

const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const { exactOrAtomicTemp } = require('./safe-files');

const DATA = require('./data-dir').DATA_DIR;
const { publicQsoFields } = require('./qso-helpers');
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const PUBLIC_SNAPSHOT_FILE = path.join(DATA, 'public-snapshot.json');
const originalReadFile = fs.readFile.bind(fs);
const originalWriteFile = fs.writeFile.bind(fs);
// Captured before any preload patch is installed, so this is the true native
// writer. snapshot.js uses it for the explicit publication pipeline; the
// patched fs.writeFile below stays installed as a fail-closed backstop.
const nativeWriteFile = originalWriteFile;
const originalGet = express.application.get;
const originalUse = express.application.use;

const NODE_ENV = process.env.NODE_ENV || 'development';
const REQUIRE_ADMIN_ALLOWLIST = process.env.REQUIRE_ADMIN_ALLOWLIST === 'true';
const ADMIN_ALLOWED_IPS = String(process.env.ADMIN_ALLOWED_IPS || '').trim();

if (NODE_ENV === 'production' && REQUIRE_ADMIN_ALLOWLIST && !ADMIN_ALLOWED_IPS) {
  throw new Error('Production privacy policy requires ADMIN_ALLOWED_IPS to be configured.');
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

// Fail-closed whitelist: rebuild the QSO from the shared public field allowlist
// rather than blacklisting known-private keys, so a newly added private field
// can never leak by omission.
function hardenQso(qso, settings) {
  const source = qso || {};
  const out = {};
  for (const field of publicQsoFields(settings)) if (field in source) out[field] = source[field];
  return out;
}

async function hardenPublicSnapshot(serialized) {
  const snapshot = JSON.parse(String(serialized));
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.qsos) || !snapshot.settings) {
    throw new Error('Refusing to publish malformed public snapshot.');
  }

  const settings = await readSettings();
  const lotwFilter = settings.lotwFilter === 'confirmed' ? 'confirmed' : 'all';
  const embedCount = ['qso', 'lotw', 'both'].includes(settings.embedCount) ? settings.embedCount : 'both';

  if (lotwFilter === 'confirmed' && (Number(snapshot.version) < 4 || snapshot.settings.lotwFilter !== 'confirmed')) {
    throw new Error('Refusing fail-open snapshot: LoTW-confirmed-only policy was not applied.');
  }

  snapshot.qsos = snapshot.qsos.map(q => hardenQso(q, settings));

  const actualQsoCount = Number(snapshot.qsoCount || 0);
  const lotwCount = Number(snapshot.lotwCount || 0);
  delete snapshot.allQsoCount;
  delete snapshot.returnedQsos;
  delete snapshot.lotwCount;
  delete snapshot.qsoCount;

  if (snapshot.settings.showStats === true) {
    if (embedCount === 'lotw') {
      snapshot.qsoCount = lotwCount;
    } else {
      snapshot.qsoCount = actualQsoCount;
      if (embedCount === 'both') snapshot.lotwCount = lotwCount;
    }
  }

  snapshot.settings.embedCount = embedCount;
  delete snapshot.settings.lotwFilter;
  delete snapshot.settings.maxPaths;

  if (settings.showDxccStats !== true && snapshot.stats) snapshot.stats.dxcc = null;

  // Station/callsign label is opt-in; the private label never reaches the
  // public snapshot unless publishStationName is explicitly true.
  if (settings.publishStationName !== true && snapshot.settings) delete snapshot.settings.stationName;

  return JSON.stringify(snapshot, null, 2);
}

fs.writeFile = async function privacyCheckedWriteFile(file, data, options) {
  if (exactOrAtomicTemp(file, PUBLIC_SNAPSHOT_FILE) && typeof data === 'string') {
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
const STATIC_RATE_LIMIT_APPLIED = Symbol('qsoTrailsStaticRateLimitApplied');
function staticRateLimit(req, res, next) {
  if (req[STATIC_RATE_LIMIT_APPLIED]) return next();
  req[STATIC_RATE_LIMIT_APPLIED] = true;

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
    const protectAssets = (req, res, next) => {
      const assetPath = String(req.path || '');
      if (/\.html?$/i.test(assetPath)) return res.status(404).send('Not found.');
      if (/^\/admin(?:-[a-z0-9-]+)?\.js$/i.test(assetPath)) return noStore(req, res, next);
      next();
    };
    return originalUse.call(this, route, protectAssets, ...handlers);
  }
  return originalUse.call(this, route, ...handlers);
};

module.exports = { hardenPublicSnapshot, staticRateLimit, nativeWriteFile };
