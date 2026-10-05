'use strict';

const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const { exactOrAtomicTemp } = require('./safe-files');

const DATA = require('./data-dir').DATA_DIR;
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const originalWriteFile = fs.writeFile.bind(fs);
const originalGet = express.application.get;
const originalPost = express.application.post;

let pendingPrivacy = null;

function privacySettings(value = {}) {
  return {
    publishStationName: value.publishStationName === true,
    showDxccStats: value.showDxccStats === true
  };
}

// Persist the opt-in privacy defaults alongside every settings write so the
// stored settings always carry an explicit publishStationName/showDxccStats
// value. The public-snapshot consequence of these flags is enforced by
// privacy-guard.hardenPublicSnapshot on the explicit publication path; this
// write patch only guarantees the defaults are stored.
fs.writeFile = async function privacyDefaultsWrite(file, data, options) {
  if (exactOrAtomicTemp(file, SETTINGS_FILE) && typeof data === 'string') {
    const parsed = JSON.parse(data);
    const current = privacySettings(parsed);
    data = JSON.stringify({ ...parsed, ...current, ...(pendingPrivacy || {}) }, null, 2);
    pendingPrivacy = null;
  }
  return originalWriteFile(file, data, options);
};

express.application.get = function privacyDefaultsGet(route, ...handlers) {
  if (route === '/api/admin/state') {
    const before = (req, res, next) => {
      const originalJson = res.json.bind(res);
      res.json = body => {
        if (body && typeof body === 'object') {
          body.settings = { ...(body.settings || {}), ...privacySettings(body.settings || {}) };
          if (body.publicExposure && typeof body.publicExposure === 'object') {
            body.publicExposure.optional = {
              ...(body.publicExposure.optional || {}),
              stationName: body.settings.publishStationName === true,
              dxccAggregates: body.settings.showDxccStats === true
            };
          }
        }
        return originalJson(body);
      };
      next();
    };
    return originalGet.call(this, route, before, ...handlers);
  }
  return originalGet.call(this, route, ...handlers);
};

express.application.post = function privacyDefaultsPost(route, ...handlers) {
  if (route === '/api/admin/settings') {
    const before = (req, res, next) => {
      pendingPrivacy = privacySettings(req.body || {});
      req.body.showDxccStats = pendingPrivacy.showDxccStats;
      res.on('finish', () => { pendingPrivacy = null; });
      next();
    };
    return originalPost.call(this, route, before, ...handlers);
  }
  return originalPost.call(this, route, ...handlers);
};

module.exports = { privacySettings };
