'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { decodePng, encodePng } = require('./png-codec');

const DATA = path.join(__dirname, 'data');
const CACHE = path.join(DATA, 'earth-blue-marble.png');
// NASA Visible Earth: The Blue Marble — Land Surface, Ocean Color and Sea Ice.
// Fixed 2048x1024 PNG (~2 MiB). NASA content is generally not subject to U.S.
// copyright; attribution/usage notes are documented in docs/OPERATIONS.md.
const SOURCE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.png';
const MAX_DOWNLOAD = 4 * 1024 * 1024;
const TARGET_W = 1024, TARGET_H = 512;
let texturePromise = null;

function downsample(img) {
  const out = Buffer.alloc(TARGET_W * TARGET_H * 4);
  for (let y = 0; y < TARGET_H; y++) for (let x = 0; x < TARGET_W; x++) {
    const sx = Math.min(img.width - 1, Math.floor((x + .5) * img.width / TARGET_W));
    const sy = Math.min(img.height - 1, Math.floor((y + .5) * img.height / TARGET_H));
    const si = (sy * img.width + sx) * 4, di = (y * TARGET_W + x) * 4;
    out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]; out[di + 3] = 255;
  }
  return encodePng(TARGET_W, TARGET_H, out);
}

async function fetchBounded() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const r = await fetch(SOURCE, { redirect: 'error', signal: controller.signal });
    if (!r.ok) throw new Error(`NASA Earth texture request failed (${r.status}).`);
    const reader = r.body.getReader();
    const chunks = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_DOWNLOAD) throw new Error('NASA Earth texture exceeded download safety limit.');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); }
}

async function loadTexture() {
  try {
    const cached = await fs.readFile(CACHE);
    decodePng(cached, { maxPixels: 1_000_000 });
    return cached;
  } catch (e) {
    if (e?.code !== 'ENOENT') await fs.rm(CACHE, { force: true }).catch(() => {});
  }
  const original = await fetchBounded();
  const decoded = decodePng(original, { maxPixels: 3_000_000 });
  const png = downsample(decoded);
  await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
  const tmp = `${CACHE}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, png, { mode: 0o600 });
  await fs.rename(tmp, CACHE);
  return png;
}

async function earthPng() {
  if (!texturePromise) texturePromise = loadTexture().catch(error => { texturePromise = null; throw error; });
  return texturePromise;
}

const originalListen = express.application.listen;
express.application.listen = function earthListen(...args) {
  this.get('/assets/earth-blue-marble.png', async (req, res) => {
    try {
      const body = await earthPng();
      res.set('Cache-Control', 'public, max-age=86400');
      res.type('image/png').send(body);
    } catch {
      res.status(503).type('text/plain').send('Earth imagery is temporarily unavailable.');
    }
  });
  return originalListen.apply(this, args);
};

module.exports = { earthPng, SOURCE, CACHE };
