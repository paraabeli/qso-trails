'use strict';

const path = require('path');

// The single source of truth for the private runtime data directory.
//
// Production mounts the `qso_data` volume at /app/data, which is the default
// below (__dirname is the app root in the image). Tests and alternative
// deployments may override the location with QSO_TRAILS_DATA_DIR so that a test
// run never reads or rewrites an operator's real QSO store, settings or
// snapshot.
const DATA_DIR = process.env.QSO_TRAILS_DATA_DIR
  ? path.resolve(process.env.QSO_TRAILS_DATA_DIR)
  : path.join(__dirname, 'data');

module.exports = { DATA_DIR };