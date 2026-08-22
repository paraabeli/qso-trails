'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns/promises');
const net = require('net');
const topojson = require('topojson-client');
const worldAtlas = require('world-atlas/countries-50m.json');
const { allowedExactFile } = require('./safe-files');
const { parseCoord, safeEqual } = require('./security-helpers');
const { distanceKm, maidenheadToLatLon, positionAtPrecision, publicHome, qsoSortKey, qsoTimestamp, sanitizePublicQso } = require('./qso-helpers');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const BASE = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-now';
const CONFIG_ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || '';
const ALLOW_INSECURE_WAVELOG = process.env.ALLOW_INSECURE_WAVELOG === 'true';
const ALLOW_PRIVATE_WAVELOG = process.env.ALLOW_PRIVATE_WAVELOG === 'true';
const ADMIN_ALLOWED_IPS = String(process.env.ADMIN_ALLOWED_IPS || '').split(',').map(v => v.trim()).filter(Boolean);
const EMBED_FRAME_ANCESTORS = String(process.env.EMBED_FRAME_ANCESTORS || "'self' https://qrz.com https://*.qrz.com").trim();

const DATA = path.join(__dirname, 'data');
const PUBLIC = path.join(__dirname, 'public');
const QSO_FILE = path.join(DATA, 'qsos.json');
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const WAVELOG_FILE = path.join(DATA, 'wavelog.json');
const PUBLIC_SNAPSHOT_FILE = path.join(DATA, 'public-snapshot.json');
const READABLE_JSON_FILES = [QSO_FILE, SETTINGS_FILE, WAVELOG_FILE];
const WRITABLE_JSON_FILES = [QSO_FILE, SETTINGS_FILE, WAVELOG_FILE, PUBLIC_SNAPSHOT_FILE];

const defaults = {
  stationName: 'My Station',
  homeGrid: 'KP20',
  bands: [],
  modes: [],
  autoRotate: true,
  showStats: true,
  showCallsigns: false,
  showMode: false,
  showDates: false,
  showTimes: false,
  showRemoteGrid: false,
  showDxccStats: true,
  homePrecision: 'grid4',
  remotePrecision: 'grid4',
  maxPaths: 2500
};

const wavelogDefaults = {
  baseUrl: '',
  stationIds: '',
  autoSyncMinutes: 0,
  lastSyncId: 0,
  lastSyncAt: null,
  lastSyncError: null
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 1,
    fields: 2,
    parts: 3,
    fieldNameSize: 100,
    fieldSize: 2048
  }
});

let syncing = false;
let publicCache = null;

function failFastOnUnsafeProductionConfig() {
  if (NODE_ENV !== 'production') return;
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'change-me-now' || ADMIN_PASSWORD.length < 16) {
    throw new Error('ADMIN_PASSWORD must be a unique password of at least 16 characters in production.');
  }
  if (CONFIG_ENCRYPTION_KEY.length < 32) {
    throw new Error('CONFIG_ENCRYPTION_KEY must contain at least 32 characters in production.');
  }
}

async function readJson(file, fallback) {
  const target = allowedExactFile(file, READABLE_JSON_FILES);
  if (!target) throw new Error('Refusing to read an unexpected application data file.');
  try {
    return JSON.parse(await fs.readFile(target, 'utf8'));
  } catch (error) {
    if (error && error.code !== 'ENOENT' && error.name !== 'SyntaxError') throw error;
    return structuredClone(fallback);
  }
}

async function writeJson(file, value) {
  const target = allowedExactFile(file, WRITABLE_JSON_FILES);
  if (!target) throw new Error('Refusing to write an unexpected application data file.');
  await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
  const tmp = `${target}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(tmp, target);
}

function requestIp(req) {
  return String(req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function ipv4ToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function ipMatchesRule(ip, rule) {
  ip = ip.replace(/^::ffff:/, '');
  if (!rule.includes('/')) return ip === rule;
  const [network, bitsText] = rule.split('/');
  const bits = Number(bitsText);
  if (net.isIP(ip) !== 4 || net.isIP(network) !== 4 || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const a = ipv4ToInt(ip), b = ipv4ToInt(network);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

function adminNetworkAllowed(req) {
  if (!ADMIN_ALLOWED_IPS.length) return true;
  const ip = requestIp(req);
  return ADMIN_ALLOWED_IPS.some(rule => ipMatchesRule(ip, rule));
}

const authFailures = new Map();
function authFailureState(ip) {
  const now = Date.now();
  const current = authFailures.get(ip);
  if (!current || now - current.startedAt > 15 * 60_000) {
    const fresh = { startedAt: now, count: 0 };
    authFailures.set(ip, fresh);
    return fresh;
  }
  return current;
}

function adminAuth(req, res, next) {
  if (!adminNetworkAllowed(req)) return res.status(403).send('Admin access is not allowed from this address.');
  const ip = requestIp(req);
  const failures = authFailureState(ip);
  if (failures.count >= 10) {
    res.set('Retry-After', String(Math.ceil((failures.startedAt + 15 * 60_000 - Date.now()) / 1000)));
    return res.status(429).send('Too many failed admin authentication attempts.');
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="QSO Trails Admin"');
    return res.status(401).send('Authentication required.');
  }

  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    failures.count++;
    return res.status(401).send('Invalid authorization header.');
  }
  const colon = decoded.indexOf(':');
  const user = colon >= 0 ? decoded.slice(0, colon) : decoded;
  const password = colon >= 0 ? decoded.slice(colon + 1) : '';
  if (!safeEqual(user, ADMIN_USER) || !safeEqual(password, ADMIN_PASSWORD)) {
    failures.count++;
    authFailures.set(ip, failures);
    res.set('WWW-Authenticate', 'Basic realm="QSO Trails Admin"');
    return res.status(401).send('Invalid credentials.');
  }
  authFailures.delete(ip);
  next();
}

const csrfToken = crypto.createHmac('sha256', ADMIN_PASSWORD).update(`qso-trails:${ADMIN_USER}:csrf`).digest('base64url');
function requireCsrf(req, res, next) {
  const fetchSite = String(req.get('sec-fetch-site') || '');
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) return res.status(403).json({ error: 'Cross-site admin request blocked.' });
  if (!safeEqual(req.get('x-csrf-token') || '', csrfToken)) return res.status(403).json({ error: 'Invalid CSRF token.' });
  next();
}

const publicApiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 180,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  identifier: 'public',
  message: { error: 'Too many requests.' }
});
const adminApiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  identifier: 'admin',
  message: { error: 'Too many requests.' }
});

function commonSecurityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.set('X-DNS-Prefetch-Control', 'off');
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (req.secure || String(req.get('x-forwarded-proto')).toLowerCase() === 'https') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

function adminDocumentHeaders(req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
  next();
}

function embedDocumentHeaders(req, res, next) {
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors ${EMBED_FRAME_ANCESTORS}; object-src 'none'; base-uri 'none'; form-action 'none'`);
  next();
}

function qsoPosition(record) {
  const lat = parseCoord(record.LAT ?? record.lat, true);
  const lon = parseCoord(record.LON ?? record.lon, false);
  if (lat !== null && lon !== null) return { lat, lon };
  return maidenheadToLatLon(record.GRIDSQUARE ?? record.gridsquare);
}

function parseAdif(text) {
  const records = [];
  const tag = /<([A-Z0-9_]+):(\d+)(?::[^>]*)?>([^<]*)/ig;
  for (const chunk of String(text).split(/<EOR>/i)) {
    const record = {};
    let match;
    tag.lastIndex = 0;
    while ((match = tag.exec(chunk)) !== null) record[match[1].toUpperCase()] = match[3].slice(0, Number(match[2])).trim();
    if (Object.keys(record).length) records.push(record);
    if (records.length > 500_000) throw new Error('ADIF contains too many records.');
  }
  return records;
}

function normalizeQso(record, source = 'wavelog') {
  const position = qsoPosition(record);
  if (!position) return null;
  const dateTime = String(record.qso_date || record.QSO_DATE || '');
  const [date, timeFromDate = ''] = dateTime.split(/\s+/, 2);
  return {
    source,
    sourceId: Number(record.id) || 0,
    call: record.call || record.CALL || '?',
    band: String(record.band || record.BAND || '').toUpperCase(),
    mode: String(record.submode || record.SUBMODE || record.mode || record.MODE || '').toUpperCase(),
    date,
    time: timeFromDate.replace(/:/g, '') || record.TIME_ON || '',
    grid: record.gridsquare || record.GRIDSQUARE || '',
    dxcc: String(record.dxcc || record.DXCC || '').trim(),
    country: String(record.country || record.COUNTRY || '').trim().slice(0, 120),
    cont: String(record.cont || record.CONT || '').trim().toUpperCase().slice(0, 2),
    lat: position.lat,
    lon: position.lon
  };
}

const uniqueSorted = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

async function getState() {
  const qsos = await readJson(QSO_FILE, []);
  const settings = { ...defaults, ...await readJson(SETTINGS_FILE, defaults) };
  return {
    qsos,
    settings,
    meta: {
      total: qsos.length,
      bands: uniqueSorted(qsos.map(q => q.band)),
      modes: uniqueSorted(qsos.map(q => q.mode))
    }
  };
}

function sanitizeSettings(input, meta) {
  const homeGrid = String(input.homeGrid || '').trim().toUpperCase();
  if (!maidenheadToLatLon(homeGrid)) throw new Error('Invalid Maidenhead locator.');
  const allowedBands = new Set(meta.bands);
  const allowedModes = new Set(meta.modes);
  const precisionValues = new Set(['grid4', 'grid6', 'exact']);
  return {
    stationName: String(input.stationName || 'My Station').trim().slice(0, 80),
    homeGrid,
    bands: uniqueSorted((Array.isArray(input.bands) ? input.bands : []).map(String).map(v => v.toUpperCase()).filter(v => allowedBands.has(v))),
    modes: uniqueSorted((Array.isArray(input.modes) ? input.modes : []).map(String).map(v => v.toUpperCase()).filter(v => allowedModes.has(v))),
    autoRotate: Boolean(input.autoRotate),
    showStats: Boolean(input.showStats),
    showCallsigns: Boolean(input.showCallsigns),
    showMode: Boolean(input.showMode),
    showDates: Boolean(input.showDates),
    showTimes: Boolean(input.showTimes),
    showRemoteGrid: Boolean(input.showRemoteGrid),
    showDxccStats: input.showDxccStats !== false,
    homePrecision: precisionValues.has(input.homePrecision) ? input.homePrecision : 'grid4',
    remotePrecision: precisionValues.has(input.remotePrecision) ? input.remotePrecision : 'grid4',
    maxPaths: Math.max(100, Math.min(10_000, Number(input.maxPaths) || 2500))
  };
}

function filterAllowedQsos(qsos, settings) {
  const bands = new Set(settings.bands || []);
  const modes = new Set(settings.modes || []);
  return qsos.filter(q => bands.has(q.band) && modes.has(q.mode));
}

function publicDxccStats(qsos, settings) {
  if (!settings.showDxccStats) return null;
  const withMeta = qsos.filter(q => q.dxcc || q.country || q.cont);
  const entities = new Set(withMeta.map(q => String(q.dxcc || '')).filter(Boolean));
  const countries = new Set(withMeta.map(q => String(q.country || '')).filter(Boolean));
  const continents = new Set(withMeta.map(q => String(q.cont || '')).filter(Boolean));
  const countMap = (key, filter = () => true) => {
    const map = new Map();
    for (const q of withMeta) {
      if (!filter(q)) continue;
      const value = String(q[key] || '').trim();
      if (value) map.set(value, (map.get(value) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, qsos]) => ({ name, qsos }));
  };
  const entityMap = new Map();
  const bandMap = new Map();
  const modeMap = new Map();
  const firstWorked = new Map();
  const home = publicHome(settings);
  let farthest = null;
  for (const q of withMeta) {
    const id = String(q.dxcc || '').trim();
    if (id) {
      const current = entityMap.get(id) || { dxcc: id, country: String(q.country || '').trim(), qsos: 0 };
      current.qsos++;
      if (!current.country && q.country) current.country = String(q.country).trim();
      entityMap.set(id, current);
      if (q.band) {
        const b = bandMap.get(q.band) || { qsos: 0, entities: new Set() };
        b.qsos++; b.entities.add(id); bandMap.set(q.band, b);
      }
      if (settings.showMode && q.mode) {
        const m = modeMap.get(q.mode) || { qsos: 0, entities: new Set() };
        m.qsos++; m.entities.add(id); modeMap.set(q.mode, m);
      }
      const ts = qsoTimestamp(q);
      if (settings.showDates && ts) {
        const previous = firstWorked.get(id);
        if (!previous || ts < previous.ts) firstWorked.set(id, { ts, dxcc: id, country: String(q.country || '').trim() });
      }
      if (home) {
        const p = positionAtPrecision(q.lat, q.lon, q.grid, settings.remotePrecision);
        const km = distanceKm(home, p);
        if (!farthest || km > farthest.distanceKm) farthest = { dxcc: id, country: String(q.country || '').trim(), distanceKm: Math.round(km) };
      }
    }
  }
  const topDxcc = [...entityMap.values()].sort((a, b) => b.qsos - a.qsos || a.dxcc.localeCompare(b.dxcc, undefined, { numeric: true })).slice(0, 10);
  const byBand = [...bandMap.entries()].map(([band, value]) => ({ band, qsos: value.qsos, entities: value.entities.size })).sort((a, b) => b.entities - a.entities || b.qsos - a.qsos || a.band.localeCompare(b.band, undefined, { numeric: true }));
  const byMode = settings.showMode ? [...modeMap.entries()].map(([mode, value]) => ({ mode, qsos: value.qsos, entities: value.entities.size })).sort((a, b) => b.entities - a.entities || b.qsos - a.qsos || a.mode.localeCompare(b.mode)) : null;
  const newestFirstWorked = settings.showDates ? [...firstWorked.values()].sort((a, b) => b.ts - a.ts)[0] || null : null;
  return {
    metadataAvailable: withMeta.length > 0,
    entities: entities.size,
    countries: countries.size,
    continents: continents.size,
    byContinent: countMap('cont'),
    topDxcc,
    byBand,
    byMode,
    farthest,
    newestFirstWorked: newestFirstWorked ? { dxcc: newestFirstWorked.dxcc, country: newestFirstWorked.country, date: new Date(newestFirstWorked.ts).toISOString().slice(0, 10) } : null
  };
}

function publicExposureSummary(settings, qsoCount, returnedQsos) {
  return {
    qsoCount,
    returnedQsos,
    required: ['approximate QSO coordinates', 'band'],
    optional: {
      callsign: settings.showCallsigns,
      mode: settings.showMode,
      date: settings.showDates,
      time: settings.showTimes,
      remoteGrid: settings.showRemoteGrid,
      dxccAggregates: settings.showDxccStats
    },
    homePrecision: settings.homePrecision,
    remotePrecision: settings.remotePrecision
  };
}

async function rebuildPublicSnapshot() {
  const { qsos, settings } = await getState();
  const allowed = filterAllowedQsos(qsos, settings).sort((a, b) => qsoSortKey(b).localeCompare(qsoSortKey(a)));
  const limited = allowed.slice(0, settings.maxPaths);
  const payload = {
    version: 3,
    settings: {
      stationName: settings.stationName,
      home: publicHome(settings),
      autoRotate: settings.autoRotate,
      showStats: settings.showStats,
      maxPaths: settings.maxPaths
    },
    qsoCount: allowed.length,
    returnedQsos: limited.length,
    stats: { dxcc: publicDxccStats(allowed, settings) },
    qsos: limited.map(q => sanitizePublicQso(q, settings))
  };
  await writeJson(PUBLIC_SNAPSHOT_FILE, payload);
  const body = JSON.stringify(payload);
  publicCache = {
    data: payload,
    body,
    etag: `"${crypto.createHash('sha256').update(body).digest('base64url')}"`,
    summary: publicExposureSummary(settings, payload.qsoCount, payload.returnedQsos)
  };
  return publicCache;
}

function encryptionKey() {
  if (!CONFIG_ENCRYPTION_KEY) return null;
  return crypto.createHash('sha256').update(CONFIG_ENCRYPTION_KEY).digest();
}

function encryptSecret(value) {
  if (!value) return '';
  const key = encryptionKey();
  if (!key) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

function decryptSecret(value) {
  if (!value) return '';
  if (!value.startsWith('v1:')) return value;
  const key = encryptionKey();
  if (!key) throw new Error('CONFIG_ENCRYPTION_KEY is required to decrypt the stored Wavelog token.');
  const [, ivText, tagText, cipherText] = value.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64url')), decipher.final()]).toString('utf8');
}

async function getWavelogConfig() {
  const raw = await readJson(WAVELOG_FILE, wavelogDefaults);
  const token = raw.tokenEnc ? decryptSecret(raw.tokenEnc) : (raw.token || '');
  return { ...wavelogDefaults, ...raw, token, tokenEnc: undefined };
}

async function saveWavelogConfig(config) {
  const stored = { ...config };
  delete stored.tokenEnc;
  if (CONFIG_ENCRYPTION_KEY) {
    stored.tokenEnc = encryptSecret(config.token || '');
    delete stored.token;
  } else {
    stored.token = config.token || '';
  }
  await writeJson(WAVELOG_FILE, stored);
}

function normalizeWavelogBase(baseValue) {
  let url;
  try { url = new URL(String(baseValue || '').trim()); } catch { throw new Error('Wavelog URL is invalid.'); }
  if (url.username || url.password) throw new Error('Wavelog URL must not contain credentials.');
  if (url.protocol !== 'https:' && !(ALLOW_INSECURE_WAVELOG && url.protocol === 'http:')) throw new Error('Wavelog must use HTTPS unless ALLOW_INSECURE_WAVELOG=true.');
  if (url.search || url.hash) throw new Error('Wavelog base URL must not contain a query string or fragment.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function buildWavelogEndpoint(baseValue) {
  const base = new URL(normalizeWavelogBase(baseValue));
  const current = base.pathname.replace(/\/+$/, '');
  base.pathname = /\/index\.php$/i.test(current) ? `${current}/api/v2/qso` : `${current}/index.php/api/v2/qso`;
  base.search = '';
  base.hash = '';
  return base;
}

function isPrivateIpv4(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  const inRange = (base, bits) => {
    const b = ipv4ToInt(base), mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
  ].some(([base, bits]) => inRange(base, bits));
}

function isPrivateIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version !== 6) return true;
  const value = ip.toLowerCase();
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('2001:db8:');
}

async function assertSafeWavelogTarget(url) {
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    if (!ALLOW_PRIVATE_WAVELOG) throw new Error('Private/local Wavelog hosts require ALLOW_PRIVATE_WAVELOG=true.');
    return;
  }
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length) throw new Error('Wavelog hostname did not resolve.');
  if (!ALLOW_PRIVATE_WAVELOG && addresses.some(({ address }) => isPrivateIp(address))) throw new Error('Wavelog hostname resolves to a private/reserved address; set ALLOW_PRIVATE_WAVELOG=true only if intended.');
}

async function requestWavelogJson(url, config) {
  await assertSafeWavelogTarget(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal
    });
    const text = await response.text();
    let json = {};
    if (text) {
      try { json = JSON.parse(text); } catch { throw new Error('Wavelog returned invalid JSON.'); }
    }
    if (!response.ok) throw new Error(json?.error?.message || json?.message || `Wavelog request failed (${response.status}).`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function syncWavelog(full = false) {
  if (syncing) throw new Error('Sync already running.');
  syncing = true;
  try {
    let config = await getWavelogConfig();
    if (!config.baseUrl || !config.token) throw new Error('Configure the Wavelog URL and read-only API token first.');
    if (!config.token.startsWith('wl2_')) throw new Error('Use a Wavelog API v2 token (wl2_...) with qso:read only.');
    const since = full ? 0 : Number(config.lastSyncId) || 0;
    let page = 1, maxId = since;
    const rows = [];
    for (;;) {
      const url = buildWavelogEndpoint(config.baseUrl);
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', '5000');
      if (since) url.searchParams.set('since_id', String(since));
      if (config.stationIds) url.searchParams.set('station_id', config.stationIds);
      const result = await requestWavelogJson(url, config);
      const data = Array.isArray(result.data) ? result.data : [];
      rows.push(...data);
      if (rows.length > 500_000) throw new Error('Wavelog sync exceeded the safety record limit.');
      for (const row of data) maxId = Math.max(maxId, Number(row.id) || 0);
      if (!result.meta?.has_more) break;
      page++;
      if (page > 1000) throw new Error('Wavelog pagination exceeded the safety limit.');
    }

    const normalized = rows.map(row => normalizeQso(row)).filter(Boolean);
    const existing = full ? [] : await readJson(QSO_FILE, []);
    const map = new Map(existing.map(q => [q.sourceId ? `w:${q.sourceId}` : crypto.createHash('sha1').update(JSON.stringify(q)).digest('hex'), q]));
    for (const q of normalized) map.set(`w:${q.sourceId}`, q);
    const all = [...map.values()];
    await writeJson(QSO_FILE, all);
    config = { ...config, lastSyncId: maxId, lastSyncAt: new Date().toISOString(), lastSyncError: null };
    await saveWavelogConfig(config);
    await rebuildPublicSnapshot();
    return { fetched: rows.length, usable: normalized.length, stored: all.length, lastSyncId: maxId };
  } catch (error) {
    try {
      const config = await getWavelogConfig();
      await saveWavelogConfig({ ...config, lastSyncError: String(error.message || error) });
    } catch {}
    throw error;
  } finally {
    syncing = false;
  }
}

async function autoSync() {
  try {
    const config = await getWavelogConfig();
    const minutes = Number(config.autoSyncMinutes) || 0;
    if (!minutes || !config.baseUrl || !config.token || syncing) return;
    const last = config.lastSyncAt ? Date.parse(config.lastSyncAt) : 0;
    if (Date.now() - last < minutes * 60_000) return;
    await syncWavelog(false);
  } catch (error) {
    console.error('Automatic Wavelog sync failed:', error.message);
  }
}

const worldGeoJson = topojson.feature(worldAtlas, worldAtlas.objects.countries);
const worldBody = JSON.stringify(worldGeoJson);
const worldEtag = `"${crypto.createHash('sha256').update(worldBody).digest('base64url')}"`;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '128kb', strict: true }));
app.use(commonSecurityHeaders);
app.use('/assets', express.static(PUBLIC, { index: false, maxAge: '1h', etag: true }));

app.get('/', (req, res) => res.redirect('/embed'));
app.get('/embed', publicApiRateLimit, embedDocumentHeaders, (req, res) => res.sendFile(path.join(PUBLIC, 'embed.html')));
app.get('/admin', adminApiRateLimit, adminAuth, adminDocumentHeaders, (req, res) => res.sendFile(path.join(PUBLIC, 'admin.html')));

app.get('/api/world', publicApiRateLimit, (req, res) => {
  res.set('Cache-Control', 'public, max-age=604800, immutable');
  res.set('ETag', worldEtag);
  if (req.get('if-none-match') === worldEtag) return res.status(304).end();
  res.type('application/geo+json').send(worldBody);
});

app.get('/api/public', publicApiRateLimit, async (req, res) => {
  if (!publicCache) await rebuildPublicSnapshot();
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  res.set('ETag', publicCache.etag);
  if (req.get('if-none-match') === publicCache.etag) return res.status(304).end();
  res.type('application/json').send(publicCache.body);
});

app.use('/api/admin', adminApiRateLimit, adminAuth, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get('/api/admin/state', async (req, res) => {
  const state = await getState();
  const wavelog = await getWavelogConfig();
  if (!publicCache) await rebuildPublicSnapshot();
  res.json({
    meta: state.meta,
    settings: state.settings,
    wavelog: {
      baseUrl: wavelog.baseUrl,
      stationIds: wavelog.stationIds,
      autoSyncMinutes: wavelog.autoSyncMinutes,
      lastSyncId: wavelog.lastSyncId,
      lastSyncAt: wavelog.lastSyncAt,
      lastSyncError: wavelog.lastSyncError,
      tokenConfigured: Boolean(wavelog.token),
      tokenEncrypted: Boolean(CONFIG_ENCRYPTION_KEY),
      syncing
    },
    csrfToken,
    publicExposure: publicCache.summary,
    publicBaseUrl: BASE,
    iframeHtml: `<iframe src="${BASE}/embed" width="100%" height="620" style="border:0" loading="lazy"></iframe>`
  });
});

app.post('/api/admin/settings', requireCsrf, async (req, res) => {
  try {
    const state = await getState();
    const settings = sanitizeSettings(req.body, state.meta);
    await writeJson(SETTINGS_FILE, settings);
    const snapshot = await rebuildPublicSnapshot();
    res.json({ ok: true, visibleQsos: snapshot.data.qsoCount, returnedQsos: snapshot.data.returnedQsos, publicExposure: snapshot.summary });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Invalid settings.' });
  }
});

app.post('/api/admin/upload', requireCsrf, upload.single('adif'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose an ADIF file.' });
    const name = String(req.file.originalname || '').toLowerCase();
    if (!name.endsWith('.adi') && !name.endsWith('.adif')) return res.status(400).json({ error: 'Only .adi or .adif files are accepted.' });
    const text = req.file.buffer.toString('utf8');
    if (!/<EOR>/i.test(text)) return res.status(400).json({ error: 'The uploaded file does not look like ADIF.' });
    const records = parseAdif(text);
    const qsos = records.map(row => normalizeQso(row, 'adif')).filter(Boolean);
    await writeJson(QSO_FILE, qsos);
    await rebuildPublicSnapshot();
    res.json({ importedRecords: records.length, usableQsos: qsos.length });
  } catch (error) {
    res.status(error instanceof multer.MulterError ? 413 : 400).json({ error: error.message || 'Upload failed.' });
  }
});

app.post('/api/admin/wavelog/config', requireCsrf, async (req, res) => {
  try {
    const old = await getWavelogConfig();
    const baseUrl = req.body.baseUrl ? normalizeWavelogBase(req.body.baseUrl) : '';
    const token = String(req.body.token || '').trim() || old.token;
    if (token && !token.startsWith('wl2_')) throw new Error('Use a Wavelog API v2 token (wl2_...) with qso:read only.');
    const stationIds = String(req.body.stationIds || '').trim();
    if (stationIds && !/^\d+(,\d+)*$/.test(stationIds)) throw new Error('Station IDs must be comma-separated numbers.');
    const autoSyncMinutes = Math.max(0, Math.min(1440, Number(req.body.autoSyncMinutes) || 0));
    const next = { ...old, baseUrl, token, stationIds, autoSyncMinutes };
    await saveWavelogConfig(next);
    res.json({ ok: true, tokenEncrypted: Boolean(CONFIG_ENCRYPTION_KEY) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Invalid Wavelog configuration.' });
  }
});

app.post('/api/admin/wavelog/test', requireCsrf, async (req, res) => {
  try {
    const config = await getWavelogConfig();
    if (!config.baseUrl || !config.token) throw new Error('Configure Wavelog URL and token first.');
    const url = buildWavelogEndpoint(config.baseUrl);
    url.searchParams.set('per_page', '1');
    await requestWavelogJson(url, config);
    res.json({ ok: true, host: url.hostname });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Connection test failed.' });
  }
});

app.post('/api/admin/wavelog/sync', requireCsrf, async (req, res) => {
  try {
    res.json({ ok: true, ...await syncWavelog(Boolean(req.body?.full)) });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Sync failed.' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) return res.status(413).json({ error: 'Upload rejected by safety limits.' });
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Internal server error.' });
});

async function start() {
  failFastOnUnsafeProductionConfig();
  await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
  await rebuildPublicSnapshot();
  app.listen(PORT, '0.0.0.0', () => console.log(`QSO Trails listening on ${BASE}`));
  setInterval(autoSync, 60_000).unref();
}

start().catch(error => {
  console.error('QSO Trails failed to start:', error.message);
  process.exit(1);
});
