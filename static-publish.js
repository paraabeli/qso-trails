'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const topojson = require('topojson-client');
const worldAtlas = require('world-atlas/countries-50m.json');
const { renderStaticPng } = require('./static-render');

// Keep the LoTW snapshot layer aligned with server.js on a brand-new data volume.
// server.js supplies these values through readJson(..., defaults) when settings.json
// does not exist; the preload layer also reads settings directly, so expose the same
// fallback without creating a settings file solely for the feature.
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
    if (error?.code !== 'ENOENT' || path.resolve(String(file)) !== path.resolve(settingsFile)) throw error;
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

function boolOption(value, fallback = true) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}

function imageOptions(query) {
  const requestedTheme = String(query.theme || '').toLowerCase();
  return {
    projection: query.projection === 'mercator' ? 'mercator' : 'globe',
    theme: STATIC_THEMES.has(requestedTheme) ? requestedTheme : 'retro',
    showName: boolOption(query.name),
    showStats: boolOption(query.stats),
    showLegend: boolOption(query.legend),
    showDxcc: boolOption(query.dxcc),
    showUpdated: boolOption(query.updated)
  };
}

function optionsKey(options) {
  return [options.projection, options.theme, options.showName, options.showStats, options.showLegend, options.showDxcc, options.showUpdated].join(':');
}

async function staticImage(options) {
  const stat = await fs.stat(snapshotFile);
  const key = optionsKey(options);
  const existing = cache.get(key);
  if (existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) return existing;
  const snapshot = JSON.parse(await fs.readFile(snapshotFile, 'utf8'));
  const body = renderStaticPng(snapshot, world, options);
  const image = {
    body,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    etag: `"${crypto.createHash('sha256').update(body).digest('base64url')}"`
  };
  cache.set(key, image);
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return image;
}

const originalListen = express.application.listen;
express.application.listen = function patchedListen(...args) {
  this.get('/static/qrz.png', async (req, res, next) => {
    try {
      const image = await staticImage(imageOptions(req.query || {}));
      res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
      res.set('ETag', image.etag);
      if (req.get('if-none-match') === image.etag) return res.status(304).end();
      res.type('image/png').send(image.body);
    } catch (error) {
      next(error);
    }
  });
  return originalListen.apply(this, args);
};
