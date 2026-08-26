'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const topojson = require('topojson-client');
const worldAtlas = require('world-atlas/countries-50m.json');
const { renderStaticPng } = require('./static-render');
const { applyStaticInfo } = require('./static-info');
const { parseStaticPreset, parseStaticWidth, staticDimensions, resizePng } = require('./static-size');
const { exactFile } = require('./safe-files');

const settingsFile = path.join(__dirname, 'data', 'settings.json');
const settingsDefaults = {
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
const baseReadFile = fs.readFile.bind(fs);
fs.readFile = async function readFileWithSettingsDefault(file, ...args) {
  try {
    return await baseReadFile(file, ...args);
  } catch (error) {
    if (error?.code !== 'ENOENT' || !exactFile(file, settingsFile)) throw error;
    const json = JSON.stringify(settingsDefaults);
    const option = args[0];
    const encoding = typeof option === 'string' ? option : option?.encoding;
    return encoding ? json : Buffer.from(json);
  }
};

const { install: installLotwFeature } = require('./lotw-feature');
installLotwFeature();

const snapshotFile = path.join(__dirname, 'data', 'public-snapshot.json');
const world = topojson.feature(worldAtlas, worldAtlas.objects.countries);
const cache = new Map();
const STATIC_THEMES = new Set(['retro', 'clean', 'futuristic', 'rough']);
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
let cacheBytes = 0;

function boolOption(value, fallback = true) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}

function imageOptions(query) {
  const requestedTheme = String(query.theme || '').toLowerCase();
  const legacyDxcc = boolOption(query.dxcc);
  return {
    projection: query.projection === 'mercator' ? 'mercator' : 'globe',
    theme: STATIC_THEMES.has(requestedTheme) ? requestedTheme : 'retro',
    preset: parseStaticPreset(query.size),
    width: parseStaticWidth(query.width),
    showName: boolOption(query.name),
    showStats: boolOption(query.stats),
    showLotw: boolOption(query.lotw, false),
    showLegend: boolOption(query.legend),
    showDxcc: legacyDxcc,
    showContinents: query.continents == null ? legacyDxcc : boolOption(query.continents),
    showRarity: query.rarity == null ? legacyDxcc : boolOption(query.rarity),
    gridPrecision: ['4', '6'].includes(String(query.grid)) ? String(query.grid) : 'none',
    showUpdated: boolOption(query.updated)
  };
}

function optionsKey(options) {
  return [
    options.projection, options.theme, options.preset, options.width,
    options.showName, options.showStats, options.showLotw, options.showLegend,
    options.showDxcc, options.showContinents, options.showRarity,
    options.gridPrecision, options.showUpdated
  ].join(':');
}

function remember(key, value) {
  const previous = cache.get(key);
  if (previous) cacheBytes -= previous.body.length;
  cache.set(key, value);
  cacheBytes += value.body.length;
  while (cache.size > 16 || cacheBytes > MAX_CACHE_BYTES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = cache.get(oldestKey);
    cache.delete(oldestKey);
    cacheBytes -= oldest?.body?.length || 0;
  }
}

async function staticImage(options) {
  const stat = await fs.stat(snapshotFile);
  const key = optionsKey(options);
  const existing = cache.get(key);
  if (existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) return existing;
  const [snapshot, privateSettings] = await Promise.all([
    fs.readFile(snapshotFile, 'utf8').then(JSON.parse),
    fs.readFile(settingsFile, 'utf8').then(JSON.parse)
  ]);
  const blank = renderStaticPng(snapshot, world, {
    ...options,
    showName: false,
    showStats: false,
    showLegend: false,
    showDxcc: false,
    showUpdated: false,
    showNasaCredit: false
  });
  const decorated = applyStaticInfo(blank, snapshot, options, privateSettings, options.theme);
  const dimensions = staticDimensions(options.width, options.theme, options.preset);
  const png = resizePng(decorated, dimensions.width, dimensions.height);
  const value = {
    body: png,
    etag: `"${crypto.createHash('sha256').update(png).digest('base64url')}"`,
    mtimeMs: stat.mtimeMs,
    size: stat.size
  };
  remember(key, value);
  return value;
}

const originalListen = express.application.listen;
express.application.listen = function staticPublishListen(...args) {
  this.get('/static/qrz.png', async (req, res, next) => {
    try {
      const rendered = await staticImage(imageOptions(req.query || {}));
      res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
      res.set('ETag', rendered.etag);
      if (req.get('if-none-match') === rendered.etag) return res.status(304).end();
      res.type('image/png').send(rendered.body);
    } catch (error) {
      if (error?.code === 'ENOENT') return res.status(503).type('text/plain').send('Static map is not available yet.');
      next(error);
    }
  });
  return originalListen.apply(this, args);
};

module.exports = { imageOptions };
