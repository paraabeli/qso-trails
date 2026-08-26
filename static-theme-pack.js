'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const topojson = require('topojson-client');
const worldAtlas = require('world-atlas/countries-50m.json');
const { renderStaticPng, WIDTH: BASE_W, HEIGHT: BASE_H } = require('./static-render');
const { decodePng, encodePng } = require('./png-codec');
const { earthPng } = require('./earth-texture');
const { parseStaticWidth, staticDimensions, resizePng } = require('./static-size');

const SNAPSHOT = path.join(__dirname, 'data', 'public-snapshot.json');
const world = topojson.feature(worldAtlas, worldAtlas.objects.countries);
const EXTRA = new Set(['midnight', 'aurora', 'amber', 'mono', 'ice', 'earth']);
const cache = new Map();
const EARTH_FALLBACK_RETRY_MS = 60_000;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const LIM = 85.05112878;
let cacheBytes = 0;

function bool(value, fallback = true) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}

function opts(query) {
  return {
    projection: query.projection === 'mercator' ? 'mercator' : 'globe',
    theme: String(query.theme || '').toLowerCase(),
    width: parseStaticWidth(query.width),
    showName: bool(query.name),
    showStats: bool(query.stats),
    showLegend: bool(query.legend),
    showDxcc: bool(query.dxcc),
    showUpdated: bool(query.updated)
  };
}

const clamp = value => Math.max(0, Math.min(255, Math.round(value)));

function transformedColor(theme, r, g, b) {
  if (theme === 'midnight') return [clamp(r * .32), clamp(g * .5), clamp(b * .82 + 18)];
  if (theme === 'aurora') return [clamp(r * .48), clamp(g * .92 + 16), clamp(b * .8 + 24)];
  if (theme === 'amber') return [clamp(r * .92 + 28), clamp(g * .62 + 16), clamp(b * .27)];
  if (theme === 'mono') {
    const y = clamp(r * .299 + g * .587 + b * .114);
    return [y, y, y];
  }
  if (theme === 'ice') return [clamp(r * .64 + 34), clamp(g * .82 + 26), clamp(b * .98 + 28)];
  return [r, g, b];
}

function transform(body, theme) {
  const image = decodePng(body, { maxPixels: BASE_W * BASE_H + 10 });
  for (let i = 0; i < image.data.length; i += 4) {
    const color = transformedColor(theme, image.data[i], image.data[i + 1], image.data[i + 2]);
    image.data[i] = color[0];
    image.data[i + 1] = color[1];
    image.data[i + 2] = color[2];
  }
  return encodePng(image.width, image.height, image.data);
}

function sample(texture, lat, lon) {
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  const x = Math.max(0, Math.min(texture.width - 1, Math.floor((lon + 180) / 360 * texture.width)));
  const y = Math.max(0, Math.min(texture.height - 1, Math.floor((90 - lat) / 180 * texture.height)));
  const i = (y * texture.width + x) * 4;
  return [texture.data[i], texture.data[i + 1], texture.data[i + 2]];
}

function rot(lat, lon, centerLat, centerLon) {
  const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
  const x = Math.cos(a) * Math.sin(b), y = Math.sin(a), z = Math.cos(a) * Math.cos(b);
  const ry = -centerLon * Math.PI / 180, cy = Math.cos(ry), sy = Math.sin(ry);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  const rx = centerLat * Math.PI / 180 * .72, cx = Math.cos(rx), sx = Math.sin(rx);
  return { x: x1, y: y * cx - z1 * sx, z: y * sx + z1 * cx };
}

function inv(x1, y2, z2, centerLat, centerLon) {
  const ry = -centerLon * Math.PI / 180, cy = Math.cos(ry), sy = Math.sin(ry);
  const rx = centerLat * Math.PI / 180 * .72, cx = Math.cos(rx), sx = Math.sin(rx);
  const y = y2 * cx + z2 * sx, z1 = -y2 * sx + z2 * cx;
  const x = x1 * cy - z1 * sy, z = x1 * sy + z1 * cy;
  return {
    lat: Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI,
    lon: Math.atan2(x, z) * 180 / Math.PI
  };
}

function greatCircle(a, b, t) {
  const vector = point => {
    const lat = point.lat * Math.PI / 180, lon = point.lon * Math.PI / 180;
    return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
  };
  const u = vector(a), v = vector(b);
  const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
  const omega = Math.acos(dot), sine = Math.sin(omega);
  if (sine < 1e-6) return a;
  const a0 = Math.sin((1 - t) * omega) / sine, a1 = Math.sin(t * omega) / sine;
  const q = [u[0] * a0 + v[0] * a1, u[1] * a0 + v[1] * a1, u[2] * a0 + v[2] * a1];
  return { lat: Math.asin(q[1]) * 180 / Math.PI, lon: Math.atan2(q[0], q[2]) * 180 / Math.PI };
}

function hsl(h, s = .72, l = .53) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (p, q, t) => {
    if (t < 0) t++;
    if (t > 1) t--;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < .5) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [clamp(f(p, q, h + 1 / 3) * 255), clamp(f(p, q, h) * 255), clamp(f(p, q, h - 1 / 3) * 255)];
}

function bandColor(band) {
  const hue = ({ '160M': 280, '80M': 260, '60M': 235, '40M': 210, '30M': 185, '20M': 160, '17M': 130, '15M': 95, '12M': 65, '10M': 35, '6M': 10, '2M': 330 })[String(band || '').toUpperCase()] ?? 200;
  return hsl(hue);
}

function pixel(buffer, width, height, x, y, color, alpha = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  buffer[i] = clamp(buffer[i] * (1 - alpha) + color[0] * alpha);
  buffer[i + 1] = clamp(buffer[i + 1] * (1 - alpha) + color[1] * alpha);
  buffer[i + 2] = clamp(buffer[i + 2] * (1 - alpha) + color[2] * alpha);
  buffer[i + 3] = 255;
}

function line(buffer, width, height, a, b, color, alpha = .7, radius = 0) {
  if (!a || !b) return;
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let i = 0; i <= steps; i++) {
    const q = i / steps, x = a.x + (b.x - a.x) * q, y = a.y + (b.y - a.y) * q;
    for (let yy = -radius; yy <= radius; yy++) for (let xx = -radius; xx <= radius; xx++) {
      if (xx * xx + yy * yy <= radius * radius + .2) pixel(buffer, width, height, x + xx, y + yy, color, alpha);
    }
    if (!radius) pixel(buffer, width, height, x, y, color, alpha);
  }
}

function circle(buffer, width, height, x, y, radius, color, alpha = 1) {
  for (let yy = -radius - 1; yy <= radius + 1; yy++) for (let xx = -radius - 1; xx <= radius + 1; xx++) {
    const distance = Math.hypot(xx, yy), blend = Math.max(0, Math.min(1, radius + .6 - distance));
    if (blend) pixel(buffer, width, height, x + xx, y + yy, color, alpha * blend);
  }
}

function darkBackground(buffer) {
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = 2; buffer[i + 1] = 7; buffer[i + 2] = 13; buffer[i + 3] = 255;
  }
}

function fillEarthMercator(buffer, width, height, texture) {
  for (let y = 0; y < height; y++) {
    const v = (1 - 2 * ((y + .5) / height)) * Math.PI;
    const lat = Math.atan(Math.sinh(v)) * 180 / Math.PI;
    for (let x = 0; x < width; x++) {
      const color = sample(texture, lat, (x + .5) / width * 360 - 180);
      const i = (y * width + x) * 4;
      buffer[i] = color[0]; buffer[i + 1] = color[1]; buffer[i + 2] = color[2]; buffer[i + 3] = 255;
    }
  }
}

function globeProjection(width, height, home) {
  const centerLat = Number(home?.lat) || 0, centerLon = Number(home?.lon) || 0;
  const radius = height * .44, cx = width / 2, cy = height / 2;
  return {
    radius,
    project(lat, lon) {
      const q = rot(lat, lon, centerLat, centerLon);
      return { x: cx + q.x * radius, y: cy - q.y * radius, z: q.z };
    },
    inverse(nx, ny, z) { return inv(nx, ny, z, centerLat, centerLon); }
  };
}

function fillEarthGlobe(buffer, width, height, texture, home) {
  darkBackground(buffer);
  const globe = globeProjection(width, height, home), radius = globe.radius, cx = width / 2, cy = height / 2;
  const minX = Math.max(0, Math.floor(cx - radius)), maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius)), maxY = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const nx = (x - cx) / radius, ny = (cy - y) / radius, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const z = Math.sqrt(1 - d), geo = globe.inverse(nx, ny, z), color = sample(texture, geo.lat, geo.lon);
    const shade = .74 + .26 * z, i = (y * width + x) * 4;
    buffer[i] = clamp(color[0] * shade); buffer[i + 1] = clamp(color[1] * shade); buffer[i + 2] = clamp(color[2] * shade); buffer[i + 3] = 255;
  }
  return globe;
}

function mercatorProject(width, height, lat, lon) {
  const value = Math.max(-LIM, Math.min(LIM, Number(lat) || 0)) * Math.PI / 180;
  const v = Math.log(Math.tan(Math.PI / 4 + value / 2));
  return { x: (Number(lon) + 180) / 360 * width, y: (1 - (v / Math.PI + 1) / 2) * height, z: 1 };
}

function drawEarthPaths(buffer, width, height, data, projection) {
  const home = data.settings?.home;
  if (!home) return;
  const globe = projection !== 'mercator';
  const globeState = globe ? globeProjection(width, height, home) : null;
  const project = globe ? (lat, lon) => globeState.project(lat, lon) : (lat, lon) => mercatorProject(width, height, lat, lon);
  const strokeRadius = width >= 2400 ? 2 : width >= 1200 ? 1 : 0;
  const qsoRadius = Math.max(2, Math.round(width / 1000));
  const homeRadius = Math.max(4, Math.round(width / 520));
  for (const qso of (data.qsos || []).slice(0, 2500)) {
    let previous = null;
    for (let i = 0; i <= 28; i++) {
      const geo = greatCircle(home, qso, i / 28), current = project(geo.lat, geo.lon);
      if (previous && (!globe || previous.z > 0 && current.z > 0) && Math.abs(current.x - previous.x) < width * .3) {
        line(buffer, width, height, previous, current, bandColor(qso.band), .7, strokeRadius);
      }
      previous = current;
    }
    const endpoint = project(qso.lat, qso.lon);
    if (!globe || endpoint.z > 0) circle(buffer, width, height, endpoint.x, endpoint.y, qsoRadius, bandColor(qso.band), .95);
  }
  const station = project(home.lat, home.lon);
  if (!globe || station.z > 0) {
    circle(buffer, width, height, station.x, station.y, homeRadius, [255, 255, 255], .95);
    circle(buffer, width, height, station.x, station.y, Math.max(2, Math.round(homeRadius * .42)), [28, 111, 135], 1);
  }
}

function compositeFooter(buffer, width, height, basePng) {
  const base = decodePng(basePng, { maxPixels: BASE_W * BASE_H + 10 });
  const sourceX = 10, sourceY = 338, sourceWidth = 620, sourceHeight = 152;
  const margin = Math.max(6, Math.round(width * .012));
  let targetHeight = Math.max(72, Math.round(height * .26));
  let targetWidth = Math.round(targetHeight * sourceWidth / sourceHeight);
  if (targetWidth > width - margin * 2) {
    targetWidth = Math.max(1, width - margin * 2);
    targetHeight = Math.round(targetWidth * sourceHeight / sourceWidth);
  }
  targetHeight = Math.min(targetHeight, Math.max(1, height - margin * 2));
  const startX = margin, startY = height - margin - targetHeight;
  for (let y = 0; y < targetHeight; y++) {
    const sy = sourceY + Math.min(sourceHeight - 1, Math.floor((y + .5) * sourceHeight / targetHeight));
    for (let x = 0; x < targetWidth; x++) {
      const sx = sourceX + Math.min(sourceWidth - 1, Math.floor((x + .5) * sourceWidth / targetWidth));
      const si = (sy * base.width + sx) * 4, di = ((startY + y) * width + startX + x) * 4;
      const alpha = (base.data[si + 3] ?? 255) / 255;
      buffer[di] = clamp(buffer[di] * (1 - alpha) + base.data[si] * alpha);
      buffer[di + 1] = clamp(buffer[di + 1] * (1 - alpha) + base.data[si + 1] * alpha);
      buffer[di + 2] = clamp(buffer[di + 2] * (1 - alpha) + base.data[si + 2] * alpha);
      buffer[di + 3] = 255;
    }
  }
}

function renderEarth(data, texture, options) {
  const dimensions = staticDimensions(options.width, 'earth');
  const { width, height } = dimensions;
  const buffer = Buffer.alloc(width * height * 4);
  if (options.projection === 'mercator') fillEarthMercator(buffer, width, height, texture);
  else fillEarthGlobe(buffer, width, height, texture, data.settings?.home);
  drawEarthPaths(buffer, width, height, data, options.projection);
  const footer = renderStaticPng(data, world, { ...options, theme: 'clean', showNasaCredit: true });
  compositeFooter(buffer, width, height, footer);
  return encodePng(width, height, buffer);
}

function remember(key, item) {
  const previous = cache.get(key);
  if (previous) cacheBytes -= previous.body.length;
  cache.set(key, item);
  cacheBytes += item.body.length;
  while (cache.size > 16 || cacheBytes > MAX_CACHE_BYTES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = cache.get(oldestKey);
    cache.delete(oldestKey);
    cacheBytes -= oldest?.body?.length || 0;
  }
}

async function image(options) {
  const stat = await fs.stat(SNAPSHOT);
  const key = [options.projection, options.theme, options.width, options.showName, options.showStats, options.showLegend, options.showDxcc, options.showUpdated].join(':');
  const old = cache.get(key), now = Date.now();
  if (old && old.mtimeMs === stat.mtimeMs && old.size === stat.size && (!old.earthFallback || now - old.createdAt < EARTH_FALLBACK_RETRY_MS)) return old;

  const data = JSON.parse(await fs.readFile(SNAPSHOT, 'utf8'));
  let body, earthFallback = false;
  if (options.theme === 'earth') {
    try {
      const texture = decodePng(await earthPng(), { maxPixels: 9_000_000 });
      body = renderEarth(data, texture, options);
    } catch {
      earthFallback = true;
      const fallback = renderStaticPng(data, world, { ...options, theme: 'clean' });
      const dimensions = staticDimensions(options.width, 'earth');
      body = resizePng(fallback, dimensions.width, dimensions.height);
    }
  } else {
    const baseTheme = options.theme === 'amber' ? 'rough' : options.theme === 'ice' ? 'clean' : 'futuristic';
    const base = renderStaticPng(data, world, { ...options, theme: baseTheme });
    const transformed = transform(base, options.theme);
    const dimensions = staticDimensions(options.width, options.theme);
    body = resizePng(transformed, dimensions.width, dimensions.height);
  }

  const item = {
    body,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    etag: `"${crypto.createHash('sha256').update(body).digest('base64url')}"`,
    earthFallback,
    createdAt: now
  };
  remember(key, item);
  return item;
}

const originalListen = express.application.listen;
express.application.listen = function staticThemeListen(...args) {
  this.get('/static/qrz.png', async (req, res, next) => {
    const options = opts(req.query || {});
    if (!EXTRA.has(options.theme)) return next();
    try {
      const item = await image(options);
      res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
      res.set('ETag', item.etag);
      if (req.get('if-none-match') === item.etag) return res.status(304).end();
      return res.type('image/png').send(item.body);
    } catch (error) {
      return next(error);
    }
  });
  return originalListen.apply(this, args);
};

module.exports = { EXTRA, opts, renderEarth };
