'use strict';

const path = require('path');

const UUID_TMP_SUFFIX = /^\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/i;

function exactFile(file, allowedFile) {
  return typeof file === 'string' && path.isAbsolute(file) && file === allowedFile;
}

function exactOrAtomicTemp(file, allowedFile) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return false;
  if (file === allowedFile) return true;
  if (!file.startsWith(`${allowedFile}.`)) return false;
  return UUID_TMP_SUFFIX.test(file.slice(allowedFile.length));
}

function allowedExactFile(file, allowedFiles) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return null;
  return allowedFiles.find(allowed => file === allowed) || null;
}

module.exports = { exactFile, exactOrAtomicTemp, allowedExactFile };
