'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const topojson = require('topojson-client');
const worldAtlas = require('world-atlas/countries-50m.json');
const { renderStaticPng } = require('./static-render');
const { decodePng, encodePng } = require('./png-codec');
const { earthPng } = require('./earth-texture');

const SNAPSHOT = path.join(__dirname, 'data', 'public-snapshot.json');
const world = topojson.feature(worldAtlas, worldAtlas.objects.countries);
const EXTRA = new Set(['midnight', 'aurora', 'amber', 'mono', 'ice', 'earth']);
const cache = new Map();
const W = 640, H = 500, GX = 320, GY = 170, GR = 154, MX = 16, MY = 16, MW = 608, MH = 306;

function boolOption(value, fallback = true) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}
function options(q) {
  return {
    projection: q.projection === 'mercator' ? 'mercator' : 'globe',
    theme: String(q.theme || '').toLowerCase(),
    showName: boolOption(q.name), showStats: boolOption(q.stats), showLegend: boolOption(q.legend),
    showDxcc: boolOption(q.dxcc), showUpdated: boolOption(q.updated)
  };
}
const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
function transformPixel(theme, r, g, b) {
  if (theme === 'midnight') return [clamp(r * .32), clamp(g * .5), clamp(b * .82 + 18)];
  if (theme === 'aurora') return [clamp(r * .48), clamp(g * .92 + 16), clamp(b * .8 + 24)];
  if (theme === 'amber') return [clamp(r * .92 + 28), clamp(g * .62 + 16), clamp(b * .27)];
  if (theme === 'mono') { const y = clamp(r * .299 + g * .587 + b * .114); return [y, y, y]; }
  if (theme === 'ice') return [clamp(r * .64 + 34), clamp(g * .82 + 26), clamp(b * .98 + 28)];
  return [r, g, b];
}
function transformPng(body, theme) {
  const img = decodePng(body, { maxPixels: W * H + 10 });
  for (let i = 0; i < img.data.length; i += 4) {
    const c = transformPixel(theme, img.data[i], img.data[i + 1], img.data[i + 2]);
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2];
  }
  return encodePng(img.width, img.height, img.data);
}
function sample(texture, lat, lon) {
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  const x = Math.max(0, Math.min(texture.width - 1, Math.floor((lon + 180) / 360 * texture.width)));
  const y = Math.max(0, Math.min(texture.height - 1, Math.floor((90 - lat) / 180 * texture.height)));
  const i = (y * texture.width + x) * 4;
  return [texture.data[i], texture.data[i + 1], texture.data[i + 2]];
}
function invGlobe(nx, ny, z2, clat, clon) {
  const ry = -clon * Math.PI / 180, cy = Math.cos(ry), sy = Math.sin(ry), rx = clat * Math.PI / 180 * .72;
  const cx = Math.cos(rx), sx = Math.sin(rx), y = ny * cx + z2 * sx, z1 = -ny * sx + z2 * cx;
  const x = nx * cy - z1 * sy, z = nx * sy + z1 * cy;
  return { lat: Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI, lon: Math.atan2(x, z) * 180 / Math.PI };
}
function blendEarth(baseBody, textureBody, projection, home) {
  const base = decodePng(baseBody, { maxPixels: W * H + 10 });
  const tex = decodePng(textureBody, { maxPixels: 1_000_000 });
  const blend = (x, y, color, a = .62) => {
    const i = (y * W + x) * 4;
    base.data[i] = clamp(base.data[i] * (1 - a) + color[0] * a);
    base.data[i + 1] = clamp(base.data[i + 1] * (1 - a) + color[1] * a);
    base.data[i + 2] = clamp(base.data[i + 2] * (1 - a) + color[2] * a);
  };
  if (projection === 'mercator') {
    for (let y = MY; y < MY + MH; y++) {
      const v = (1 - 2 * ((y - MY) / MH)) * Math.PI, lat = Math.atan(Math.sinh(v)) * 180 / Math.PI;
      for (let x = MX; x < MX + MW; x++) blend(x, y, sample(tex, lat, (x - MX) / MW * 360 - 180), .7);
    }
  } else {
    const clat = Number(home?.lat) || 0, clon = Number(home?.lon) || 0;
    for (let y = GY - GR; y <= GY + GR; y++) for (let x = GX - GR; x <= GX + GR; x++) {
      const nx = (x - GX) / GR, ny = (GY - y) / GR, d = nx * nx + ny * ny;
      if (d > 1) continue;
      const geo = invGlobe(nx, ny, Math.sqrt(1 - d), clat, clon);
      blend(x, y, sample(tex, geo.lat, geo.lon), .68);
    }
  }
  return encodePng(W, H, base.data);
}
async function image(o) {
  const stat = await fs.stat(SNAPSHOT), key = [o.projection, o.theme, o.showName, o.showStats, o.showLegend, o.showDxcc, o.showUpdated].join(':');
  const old = cache.get(key);
  if (old && old.mtimeMs === stat.mtimeMs && old.size === stat.size) return old;
  const data = JSON.parse(await fs.readFile(SNAPSHOT, 'utf8'));
  const baseTheme = o.theme === 'earth' ? 'clean' : o.theme === 'amber' ? 'rough' : o.theme === 'ice' ? 'clean' : 'futuristic';
  let body = renderStaticPng(data, world, { ...o, theme: baseTheme });
  if (o.theme === 'earth') {
    try { body = blendEarth(body, await earthPng(), o.projection, data.settings?.home); }
    catch { /* Safe vector fallback if upstream/cache unavailable. */ }
  } else body = transformPng(body, o.theme);
  const item = { body, mtimeMs: stat.mtimeMs, size: stat.size, etag: `"${crypto.createHash('sha256').update(body).digest('base64url')}"` };
  cache.set(key, item); if (cache.size > 64) cache.delete(cache.keys().next().value);
  return item;
}

const originalListen = express.application.listen;
express.application.listen = function themeListen(...args) {
  this.get('/static/qrz.png', async (req, res, next) => {
    const o = options(req.query || {});
    if (!EXTRA.has(o.theme)) return next();
    try {
      const item = await image(o);
      res.set('ETag', item.etag);
      if (req.get('if-none-match') === item.etag) return res.status(304).end();
      return res.type('image/png').send(item.body);
    } catch (error) { return next(error); }
  });
  return originalListen.apply(this, args);
};

module.exports = { EXTRA };
