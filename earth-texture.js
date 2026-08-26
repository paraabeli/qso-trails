'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { decodePng, encodePng } = require('./png-codec');
const diagnostics = require('./diagnostics');

const DATA = path.join(__dirname, 'data');
const CACHE = path.join(DATA, 'earth-blue-marble-ng-200412.png');
const SOURCE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.png';
const SOURCE_PAGE = 'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/';
const CREDIT = 'NASA Earth Observatory';
const TITLE = 'Blue Marble: Next Generation — December, topography and bathymetry';
const MAX_DOWNLOAD = 24 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 90_000;
const DOWNLOAD_ATTEMPTS = 3;
const TARGET_W = 4096;
const TARGET_H = 2048;
const GLOBE_W = 2048;
const GLOBE_H = 1024;
let texturePromise = null;
let globePromise = null;
let lastAttemptAt = null;
let lastSuccessAt = null;
let lastError = null;
let lastSourceBytes = null;

function downsample(img, width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y + 0.5) * img.height / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x + 0.5) * img.width / width));
      const si = (sy * img.width + sx) * 4;
      const di = (y * width + x) * 4;
      out[di] = img.data[si];
      out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2];
      out[di + 3] = 255;
    }
  }
  return encodePng(width, height, out);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchOnce(attempt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  lastAttemptAt = new Date().toISOString();
  diagnostics.info('earth', 'NASA Blue Marble download started.', { attempt, timeoutMs: DOWNLOAD_TIMEOUT_MS, maxBytes: MAX_DOWNLOAD });
  try {
    const response = await fetch(SOURCE, {
      redirect: 'error',
      cache: 'no-store',
      headers: { Accept: 'image/png', 'User-Agent': 'QSO-Trails/0.2 (+self-hosted Earth texture cache)' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`NASA Earth texture request failed (${response.status}).`);
    const type = String(response.headers.get('content-type') || '').toLowerCase();
    const contentLength = Number(response.headers.get('content-length')) || null;
    if (contentLength && contentLength > MAX_DOWNLOAD) throw new Error(`NASA Earth texture content-length ${contentLength} exceeds safety limit.`);
    if (type && !type.includes('image/png') && !type.includes('application/octet-stream')) throw new Error(`NASA Earth texture returned unexpected content type ${type}.`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('NASA Earth texture response was empty.');
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_DOWNLOAD) throw new Error('NASA Earth texture exceeded download safety limit.');
      chunks.push(Buffer.from(value));
    }
    if (total < 1024 * 1024) throw new Error(`NASA Earth texture was unexpectedly small (${total} bytes).`);
    lastSourceBytes = total;
    diagnostics.info('earth', 'NASA Blue Marble source downloaded.', { attempt, bytes: total, contentType: type || 'unknown' });
    return Buffer.concat(chunks);
  } catch (error) {
    const message = error?.name === 'AbortError' ? `NASA Earth texture download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s.` : String(error?.message || error);
    diagnostics.warn('earth', 'NASA Blue Marble download attempt failed.', { attempt, error: message });
    throw new Error(message);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBounded() {
  let error;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    try { return await fetchOnce(attempt); }
    catch (current) {
      error = current;
      if (attempt < DOWNLOAD_ATTEMPTS) await wait(attempt * 1000);
    }
  }
  throw error || new Error('NASA Earth texture download failed.');
}

async function validCachedTexture() {
  try {
    const cached = await fs.readFile(CACHE);
    const decoded = decodePng(cached, { maxPixels: TARGET_W * TARGET_H + 1 });
    if (decoded.width === TARGET_W && decoded.height === TARGET_H) return cached;
    diagnostics.warn('earth', 'Cached Blue Marble texture had unexpected dimensions.', { width: decoded.width, height: decoded.height });
  } catch (error) {
    if (error?.code !== 'ENOENT') diagnostics.warn('earth', 'Cached Blue Marble texture could not be read.', { error: error.message || error });
  }
  return null;
}

async function downloadAndCache() {
  const original = await fetchBounded();
  diagnostics.info('earth', 'Decoding NASA Blue Marble PNG.', { sourceBytes: original.length });
  const decoded = decodePng(original, { maxPixels: 16_000_000 });
  if (decoded.width !== 5400 || decoded.height !== 2700) {
    diagnostics.warn('earth', 'NASA Blue Marble source dimensions changed.', { width: decoded.width, height: decoded.height });
  }
  const png = downsample(decoded, TARGET_W, TARGET_H);
  await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
  const tmp = `${CACHE}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, png, { mode: 0o600 });
  await fs.rename(tmp, CACHE);
  lastSuccessAt = new Date().toISOString();
  lastError = null;
  diagnostics.info('earth', 'NASA Blue Marble cache refreshed successfully.', { width: TARGET_W, height: TARGET_H, cacheBytes: png.length });
  return png;
}

async function loadTexture() {
  const cached = await validCachedTexture();
  if (cached) {
    diagnostics.debug('earth', 'Using locally cached NASA Blue Marble texture.', { cacheBytes: cached.length });
    return cached;
  }
  try { return await downloadAndCache(); }
  catch (error) {
    lastError = String(error?.message || error);
    diagnostics.error('earth', 'NASA Blue Marble texture unavailable.', { error: lastError });
    throw error;
  }
}

async function earthPng() {
  if (!texturePromise) texturePromise = loadTexture().catch(error => {
    texturePromise = null;
    throw error;
  });
  return texturePromise;
}

async function globeEarthPng() {
  if (!globePromise) globePromise = earthPng().then(body => {
    const image = decodePng(body, { maxPixels: TARGET_W * TARGET_H + 1 });
    return downsample(image, GLOBE_W, GLOBE_H);
  }).catch(error => {
    globePromise = null;
    throw error;
  });
  return globePromise;
}

async function refreshEarthTexture() {
  diagnostics.info('earth', 'Admin requested a Blue Marble cache refresh.');
  try {
    const body = await downloadAndCache();
    texturePromise = Promise.resolve(body);
    globePromise = null;
    await globeEarthPng();
    return await earthStatus();
  } catch (error) {
    lastError = String(error?.message || error);
    diagnostics.error('earth', 'Admin Blue Marble refresh failed; existing cache was preserved.', { error: lastError });
    throw error;
  }
}

async function earthStatus() {
  let cache = null;
  try {
    const stat = await fs.stat(CACHE);
    cache = { available: true, bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
  } catch (error) {
    if (error?.code !== 'ENOENT') cache = { available: false, error: String(error?.message || error) };
    else cache = { available: false };
  }
  return {
    available: Boolean(cache.available),
    sourceHost: new URL(SOURCE).hostname,
    sourcePage: SOURCE_PAGE,
    cache,
    lastAttemptAt,
    lastSuccessAt,
    lastSourceBytes,
    lastError,
    downloadTimeoutSeconds: DOWNLOAD_TIMEOUT_MS / 1000,
    downloadAttempts: DOWNLOAD_ATTEMPTS,
    target: { width: TARGET_W, height: TARGET_H },
    browser: { width: GLOBE_W, height: GLOBE_H }
  };
}

const originalListen = express.application.listen;
express.application.listen = function earthTextureListen(...args) {
  this.get('/assets/earth-blue-marble.png', async (req, res) => {
    try {
      const body = await globeEarthPng();
      res.set('Cache-Control', 'public, max-age=86400');
      res.set('X-Imagery-Credit', CREDIT);
      res.type('image/png').send(body);
    } catch (error) {
      diagnostics.warn('earth', 'Browser Earth texture request returned 503.', { error: error?.message || error });
      res.status(503).type('text/plain').send('Earth imagery is temporarily unavailable.');
    }
  });
  return originalListen.apply(this, args);
};

module.exports = {
  earthPng,
  globeEarthPng,
  refreshEarthTexture,
  earthStatus,
  SOURCE,
  SOURCE_PAGE,
  CREDIT,
  TITLE,
  CACHE,
  TARGET_W,
  TARGET_H,
  DOWNLOAD_TIMEOUT_MS,
  DOWNLOAD_ATTEMPTS,
  MAX_DOWNLOAD
};
