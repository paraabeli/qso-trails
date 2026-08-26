'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { decodePng, encodePng } = require('./png-codec');

const DATA = path.join(__dirname, 'data');
const CACHE = path.join(DATA, 'earth-blue-marble-ng-200412.png');
const SOURCE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.png';
const SOURCE_PAGE = 'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/';
const CREDIT = 'NASA Earth Observatory';
const TITLE = 'Blue Marble: Next Generation — December, topography and bathymetry';
const MAX_DOWNLOAD = 20 * 1024 * 1024;
const TARGET_W = 4096;
const TARGET_H = 2048;
const GLOBE_W = 2048;
const GLOBE_H = 1024;
let texturePromise = null;
let globePromise = null;

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

async function fetchBounded() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(SOURCE, { redirect: 'error', signal: controller.signal });
    if (!response.ok) throw new Error(`NASA Earth texture request failed (${response.status}).`);
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
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
  }
}

async function loadTexture() {
  try {
    const cached = await fs.readFile(CACHE);
    const decoded = decodePng(cached, { maxPixels: TARGET_W * TARGET_H + 1 });
    if (decoded.width === TARGET_W && decoded.height === TARGET_H) return cached;
    await fs.rm(CACHE, { force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') await fs.rm(CACHE, { force: true }).catch(() => {});
  }

  const original = await fetchBounded();
  const decoded = decodePng(original, { maxPixels: 16_000_000 });
  const png = downsample(decoded, TARGET_W, TARGET_H);
  await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
  const tmp = `${CACHE}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, png, { mode: 0o600 });
  await fs.rename(tmp, CACHE);
  return png;
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

const originalListen = express.application.listen;
express.application.listen = function earthTextureListen(...args) {
  this.get('/assets/earth-blue-marble.png', async (req, res) => {
    try {
      const body = await globeEarthPng();
      res.set('Cache-Control', 'public, max-age=86400');
      res.set('X-Imagery-Credit', CREDIT);
      res.type('image/png').send(body);
    } catch {
      res.status(503).type('text/plain').send('Earth imagery is temporarily unavailable.');
    }
  });
  return originalListen.apply(this, args);
};

module.exports = {
  earthPng,
  globeEarthPng,
  SOURCE,
  SOURCE_PAGE,
  CREDIT,
  TITLE,
  CACHE,
  TARGET_W,
  TARGET_H
};
