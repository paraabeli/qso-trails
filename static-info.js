'use strict';

const { decodePng, encodePng } = require('./png-codec');

const BASE_WIDTH = 640;
const BASE_HEIGHT = 500;
const PANEL_TOP = 338;
const PANEL_LEFT = 10;
const PANEL_RIGHT = 630;
const PANEL_BOTTOM = 490;
const NASA_CREDIT_TEXT = 'IMAGE BY NASA EARTH OBSERVATORY / BLUE MARBLE NEXT GENERATION';

const FONT = {
  A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01110'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
  ' ':['00000','00000','00000','00000','00000','00000','00000'],'-':['00000','00000','00000','11111','00000','00000','00000'],'/':['00001','00010','00010','00100','01000','01000','10000'],'.':['00000','00000','00000','00000','00000','00110','00110'],':':['00000','00110','00110','00000','00110','00110','00000'],'?':['01110','10001','00001','00010','00100','00000','00100'],'#':['01010','11111','01010','01010','11111','01010','00000']
};

const clamp = value => Math.max(0, Math.min(255, Math.round(value)));

function pixel(image, x, y, color, alpha = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 4;
  image.data[i] = clamp(image.data[i] * (1 - alpha) + color[0] * alpha);
  image.data[i + 1] = clamp(image.data[i + 1] * (1 - alpha) + color[1] * alpha);
  image.data[i + 2] = clamp(image.data[i + 2] * (1 - alpha) + color[2] * alpha);
  image.data[i + 3] = 255;
}

function rect(image, x, y, width, height, color, alpha = 1) {
  for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) pixel(image, xx, yy, color, alpha);
}

function circle(image, x, y, radius, color, alpha = 1) {
  for (let yy = -radius - 1; yy <= radius + 1; yy++) for (let xx = -radius - 1; xx <= radius + 1; xx++) {
    const blend = Math.max(0, Math.min(1, radius + .6 - Math.hypot(xx, yy)));
    if (blend) pixel(image, x + xx, y + yy, color, alpha * blend);
  }
}

function text(image, value, x, y, scale, color, maxWidth = 600) {
  let cursor = x;
  for (const char of String(value || '').toUpperCase()) {
    if (cursor + 6 * scale > x + maxWidth) break;
    const glyph = FONT[char] || FONT['?'];
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (glyph[row][col] === '1') rect(image, cursor + col * scale, y + row * scale, scale, scale, color);
    }
    cursor += 6 * scale;
  }
  return cursor;
}

function bandHue(band) {
  return ({ '160M':280,'80M':260,'60M':235,'40M':210,'30M':185,'20M':160,'17M':130,'15M':95,'12M':65,'10M':35,'6M':10,'2M':330 })[String(band || '').toUpperCase()] ?? 200;
}

function hsl(h, s = .72, l = .56) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (p, q, t) => { if (t < 0) t++; if (t > 1) t--; if (t < 1/6) return p + (q-p)*6*t; if (t < .5) return q; if (t < 2/3) return p + (q-p)*(2/3-t)*6; return p; };
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [clamp(f(p,q,h+1/3)*255),clamp(f(p,q,h)*255),clamp(f(p,q,h-1/3)*255)];
}

function palette(theme) {
  if (['clean', 'rough', 'earth'].includes(theme)) return { text:[24,41,45], muted:[91,110,112] };
  return { text:[238,245,250], muted:[157,186,190] };
}

function requestedGridPrecision(value) {
  return String(value) === '6' ? 6 : String(value) === '4' ? 4 : 0;
}

function publicGrid(privateSettings = {}, requested = 0) {
  const wanted = requestedGridPrecision(requested);
  if (!wanted) return null;
  const grid = String(privateSettings.homeGrid || '').trim().toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?([0-9]{2})?$/.test(grid)) return null;
  const allowed = privateSettings.homePrecision === 'grid6' || privateSettings.homePrecision === 'exact' ? 6 : 4;
  const length = Math.min(wanted, allowed, grid.length >= 6 ? 6 : 4);
  return { value: grid.slice(0, length), length, requested: wanted, limited: length < wanted };
}

function stationLine(data = {}, options = {}, privateSettings = {}) {
  const parts = [];
  if (options.showName !== false) parts.push(String(data.settings?.stationName || 'QSO Trails').trim());
  const grid = publicGrid(privateSettings, options.gridPrecision);
  if (grid?.value) parts.push(grid.value);
  return parts.filter(Boolean).join(' ');
}

function applyStaticInfo(body, data = {}, options = {}, privateSettings = {}, theme = 'clean') {
  const image = decodePng(body, { maxPixels: BASE_WIDTH * BASE_HEIGHT + 32 });
  if (image.width !== BASE_WIDTH || image.height !== BASE_HEIGHT) throw new Error('Static info overlay expects the 640x500 base renderer.');
  const colors = palette(theme);
  const qsoCount = Number(data.qsoCount || 0);
  const lotwCount = Number(data.lotwCount || 0);
  const dxcc = data.stats?.dxcc || null;
  let y = PANEL_TOP + 13;

  if (options.showLegend !== false) {
    let x = PANEL_LEFT + 8;
    for (const band of [...new Set((data.qsos || []).map(qso => qso.band).filter(Boolean))].slice(0, 12)) {
      const label = String(band);
      const itemWidth = Math.max(30, label.length * 6 + 20);
      if (x + itemWidth > PANEL_RIGHT - 8) { x = PANEL_LEFT + 8; y += 14; }
      circle(image, x + 3, y + 3, 3, hsl(bandHue(band)), 1);
      text(image, label, x + 10, y - 1, 1, colors.muted, itemWidth - 10);
      x += itemWidth;
    }
    y += 16;
  }

  const station = stationLine(data, options, privateSettings);
  if (station && y <= PANEL_BOTTOM - 24) {
    text(image, station, PANEL_LEFT + 8, y, 2, colors.text, PANEL_RIGHT - PANEL_LEFT - 20);
    y += 20;
  }

  const counts = [];
  if (options.showStats !== false) counts.push(`${qsoCount.toLocaleString('en-US')} QSOS`);
  if (options.showLotw === true) counts.push(`${lotwCount.toLocaleString('en-US')} LOTW CONFIRMED`);
  if (counts.length && y <= PANEL_BOTTOM - 10) {
    text(image, counts.join(' / '), PANEL_LEFT + 8, y, 1, colors.text, PANEL_RIGHT - PANEL_LEFT - 20);
    y += 12;
  }

  const progress = [];
  if (dxcc?.metadataAvailable && options.showDxcc !== false) progress.push(`${Number(dxcc.entities || 0)} DXCC`);
  if (dxcc?.metadataAvailable && options.showContinents !== false) progress.push(`${Number(dxcc.continents || 0)} CONTINENTS`);
  if (progress.length && y <= PANEL_BOTTOM - 10) {
    text(image, progress.join(' / '), PANEL_LEFT + 8, y, 1, colors.text, PANEL_RIGHT - PANEL_LEFT - 20);
    y += 12;
  }

  if (options.showRarity !== false && dxcc?.rarestWorked?.length && y <= PANEL_BOTTOM - 10) {
    const rare = dxcc.rarestWorked.slice(0, 3).map(item => `#${Number(item.rank)} DXCC ${item.dxcc}`).join(' / ');
    text(image, `RAREST ${rare}`, PANEL_LEFT + 8, y, 1, colors.muted, PANEL_RIGHT - PANEL_LEFT - 20);
    y += 12;
  }

  if (options.showUpdated !== false && y <= PANEL_BOTTOM - 10) {
    text(image, `UPDATED ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC`, PANEL_LEFT + 8, y, 1, colors.muted, PANEL_RIGHT - PANEL_LEFT - 20);
    y += 12;
  }

  if (options.showNasaCredit === true) {
    text(image, NASA_CREDIT_TEXT, PANEL_LEFT + 8, Math.min(PANEL_BOTTOM - 8, y), 1, colors.muted, PANEL_RIGHT - PANEL_LEFT - 20);
  }
  return encodePng(image.width, image.height, image.data);
}

module.exports = { applyStaticInfo, publicGrid, requestedGridPrecision, stationLine, NASA_CREDIT_TEXT };
