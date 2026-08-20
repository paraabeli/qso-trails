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
let cache = null;

async function staticImage() {
  const stat = await fs.stat(snapshotFile);
  if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache;
  const snapshot = JSON.parse(await fs.readFile(snapshotFile, 'utf8'));
  const body = renderStaticPng(snapshot, world);
  cache = {
    body,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    etag: `"${crypto.createHash('sha256').update(body).digest('base64url')}"`
  };
  return cache;
}

const originalListen = express.application.listen;
express.application.listen = function patchedListen(...args) {
  this.get('/static/qrz.png', async (req, res, next) => {
    try {
      const image = await staticImage();
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
