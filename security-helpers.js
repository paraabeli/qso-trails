'use strict';

const crypto = require('crypto');

// Node's default maximum HTTP header size is 16 KiB. Padding comparisons to the
// same fixed size therefore supports any Basic Auth credential that can arrive
// through a default Node HTTP server without making comparison time depend on
// the configured credential length.
const SAFE_COMPARE_BYTES = 16 * 1024;

function safeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length > SAFE_COMPARE_BYTES || right.length > SAFE_COMPARE_BYTES) return false;

  const leftPadded = Buffer.alloc(SAFE_COMPARE_BYTES);
  const rightPadded = Buffer.alloc(SAFE_COMPARE_BYTES);
  left.copy(leftPadded);
  right.copy(rightPadded);

  return crypto.timingSafeEqual(leftPadded, rightPadded) && left.length === right.length;
}

function parseCoord(value, isLat) {
  if (value == null || value === '') return null;
  const text = String(value).trim().toUpperCase();
  const limit = isLat ? 90 : 180;
  if (!text || text.length > 64) return null;

  const direct = Number(text);
  if (Number.isFinite(direct) && Math.abs(direct) <= limit) return direct;

  let body = text;
  let leadingHemisphere = '';
  let trailingHemisphere = '';

  if ('NSEW'.includes(body[0])) {
    leadingHemisphere = body[0];
    body = body.slice(1).trim();
  }
  if (body && 'NSEW'.includes(body[body.length - 1])) {
    trailingHemisphere = body[body.length - 1];
    body = body.slice(0, -1).trim();
  }
  if (leadingHemisphere && trailingHemisphere && leadingHemisphere !== trailingHemisphere) return null;

  const hemisphere = leadingHemisphere || trailingHemisphere;
  if (hemisphere && (isLat ? !'NS'.includes(hemisphere) : !'EW'.includes(hemisphere))) return null;

  const parts = body.includes(':') ? body.split(':') : body.split(/\s+/);
  if (parts.length !== 2) return null;
  const [degreeText, minuteText] = parts;
  if (!/^\d{1,3}$/.test(degreeText) || !/^\d{1,2}(?:\.\d+)?$/.test(minuteText)) return null;

  const degrees = Number(degreeText);
  const minutes = Number(minuteText);
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || degrees > limit || minutes >= 60) return null;

  let result = degrees + minutes / 60;
  if (hemisphere === 'S' || hemisphere === 'W') result = -result;
  return Math.abs(result) <= limit ? result : null;
}

module.exports = { parseCoord, safeEqual };
