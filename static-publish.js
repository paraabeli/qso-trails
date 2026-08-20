'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const topojson = require('topojson-client');
const worldAtlas = require('world-atlas/countries-50m.json');
const { renderStaticPng } = require('./static-render');

const snapshotFile = path.join(__dirname, 'data', 'public-snapshot.json');
const world = topojson.feature(worldAtlas, worldAtlas.objects.countries);
const cache = new Map();

function boolOption(value, fallback = true) {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}

function imageOptions(query) {
  return {
    projection: query.projection === 'mercator' ? 'mercator' : 'globe',
    showName: boolOption(query.name),
    showStats: boolOption(query.stats),
    showLegend: boolOption(query.legend),
    showDxcc: boolOption(query.dxcc),
    showUpdated: boolOption(query.updated)
  };
}

function optionsKey(options) {
  return [options.projection, options.showName, options.showStats, options.showLegend, options.showDxcc, options.showUpdated].join(':');
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
