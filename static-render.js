'use strict';

const zlib = require('zlib');

const WIDTH = 640;
const HEIGHT = 500;
const CX = 320;
const CY = 238;
const RADIUS = 205;

function clampByte(value) { return Math.max(0, Math.min(255, Math.round(value))); }

function makeRaster() {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 4;
      const dx = (x - CX) / RADIUS, dy = (y - CY) / RADIUS, d = Math.sqrt(dx * dx + dy * dy);
      let r = 4, g = 10, b = 18;
      if (d <= 1) {
        const light = Math.max(0, 1 - Math.hypot(dx + .28, dy + .32));
        r = 7 + light * 30; g = 24 + light * 55; b = 43 + light * 72;
      }
      pixels[i] = clampByte(r); pixels[i + 1] = clampByte(g); pixels[i + 2] = clampByte(b); pixels[i + 3] = 255;
    }
  }
  return pixels;
}

function blend(pixels, x, y, color, alpha = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const i = (y * WIDTH + x) * 4, a = Math.max(0, Math.min(1, alpha));
  pixels[i] = clampByte(pixels[i] * (1 - a) + color[0] * a);
  pixels[i + 1] = clampByte(pixels[i + 1] * (1 - a) + color[1] * a);
  pixels[i + 2] = clampByte(pixels[i + 2] * (1 - a) + color[2] * a);
}

function line(pixels, a, b, color, alpha = 1, width = 1) {
  if (!a || !b || a.z <= 0 || b.z <= 0) return;
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let n = 0; n <= steps; n++) {
    const t = n / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    for (let oy = -width; oy <= width; oy++) for (let ox = -width; ox <= width; ox++) if (ox * ox + oy * oy <= width * width) blend(pixels, x + ox, y + oy, color, alpha);
  }
}

function circle(pixels, x, y, radius, color, alpha = 1) {
  const r = Math.max(1, Math.round(radius));
  for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (ox * ox + oy * oy <= r * r) blend(pixels, x + ox, y + oy, color, alpha);
}

function rotatePoint(lat, lon, centerLat, centerLon) {
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  let x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
  const ry = -centerLon * Math.PI / 180, cy = Math.cos(ry), sy = Math.sin(ry);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  const rx = centerLat * Math.PI / 180 * .72, cx = Math.cos(rx), sx = Math.sin(rx);
  return { x: x1, y: y * cx - z1 * sx, z: y * sx + z1 * cx };
}

function project(lat, lon, centerLat, centerLon) {
  const p = rotatePoint(lat, lon, centerLat, centerLon);
  return { x: CX + p.x * RADIUS, y: CY - p.y * RADIUS, z: p.z };
}

function greatCircle(a, b, t) {
  const vector = p => { const la = p.lat * Math.PI / 180, lo = p.lon * Math.PI / 180; return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]; };
  const u = vector(a), v = vector(b), dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
  const omega = Math.acos(dot), sinOmega = Math.sin(omega);
  let q = u;
  if (sinOmega >= 1e-6) {
    const s0 = Math.sin((1 - t) * omega) / sinOmega, s1 = Math.sin(t * omega) / sinOmega;
    q = [u[0] * s0 + v[0] * s1, u[1] * s0 + v[1] * s1, u[2] * s0 + v[2] * s1];
  }
  return { lat: Math.asin(q[1]) * 180 / Math.PI, lon: Math.atan2(q[0], q[2]) * 180 / Math.PI };
}

function hslToRgb(h, s = .78, l = .64) {
  h = ((h % 360) + 360) % 360 / 360;
  const hue = (p, q, t) => { if (t < 0) t++; if (t > 1) t--; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [clampByte(hue(p, q, h + 1 / 3) * 255), clampByte(hue(p, q, h) * 255), clampByte(hue(p, q, h - 1 / 3) * 255)];
}

function bandColor(band) {
  const hue = ({ '160M': 280, '80M': 260, '60M': 235, '40M': 210, '30M': 185, '20M': 160, '17M': 130, '15M': 95, '12M': 65, '10M': 35, '6M': 10, '2M': 330 })[String(band || '').toUpperCase()] ?? 200;
  return hslToRgb(hue);
}

function drawWorld(pixels, world, centerLat, centerLon) {
  for (const feature of world.features || []) {
    const polygons = feature.geometry?.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry?.coordinates || [];
    for (const polygon of polygons) for (const ring of polygon) {
      let previous = null;
      for (const coord of ring) {
        const current = project(coord[1], coord[0], centerLat, centerLon);
        if (previous && previous.z > 0 && current.z > 0 && Math.hypot(current.x - previous.x, current.y - previous.y) < 80) line(pixels, previous, current, [112, 160, 132], .45, 1);
        previous = current;
      }
    }
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(pixels) {
  const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) { const offset = y * (WIDTH * 4 + 1); raw[offset] = 0; pixels.copy(raw, offset + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(WIDTH, 0); ihdr.writeUInt32BE(HEIGHT, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function renderStaticPng(payload, world) {
  const pixels = makeRaster(), home = payload?.settings?.home || { lat: 20, lon: 0 };
  const centerLat = Number(home.lat) || 0, centerLon = Number(home.lon) || 0;
  drawWorld(pixels, world, centerLat, centerLon);
  for (const q of (payload?.qsos || []).slice(0, 2500)) {
    let previous = null;
    for (let n = 0; n <= 20; n++) {
      const point = greatCircle(home, q, n / 20), current = project(point.lat, point.lon, centerLat, centerLon);
      if (previous) line(pixels, previous, current, bandColor(q.band), .34, 0);
      previous = current;
    }
    const endpoint = project(q.lat, q.lon, centerLat, centerLon); if (endpoint.z > 0) circle(pixels, endpoint.x, endpoint.y, 2, bandColor(q.band), .9);
  }
  const hp = project(home.lat, home.lon, centerLat, centerLon); circle(pixels, hp.x, hp.y, 5, [255, 255, 255], 1); circle(pixels, hp.x, hp.y, 2, [255, 200, 80], 1);
  return encodePng(pixels);
}

module.exports = { renderStaticPng, WIDTH, HEIGHT };
