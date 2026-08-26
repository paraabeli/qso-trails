'use strict';

const MAX_ENTRIES = 500;
const entries = [];

function safeValue(value, depth = 0) {
  if (depth > 3) return '[truncated]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    return value
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
      .replace(/(wl2_)[A-Za-z0-9._~-]+/gi, '$1[redacted]')
      .replace(/([?&](?:token|key|password|secret|auth)=)[^&\s]+/gi, '$1[redacted]')
      .slice(0, 1200);
  }
  if (Array.isArray(value)) return value.slice(0, 30).map(item => safeValue(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      if (/token|password|secret|authorization|cookie|csrf/i.test(key)) out[key] = '[redacted]';
      else out[key] = safeValue(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 1200);
}

function add(level, area, message, details = null) {
  const item = {
    time: new Date().toISOString(),
    level: ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info',
    area: String(area || 'app').slice(0, 80),
    message: String(message || '').slice(0, 1200)
  };
  if (details != null) item.details = safeValue(details);
  entries.push(item);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  return item;
}

const debug = (area, message, details) => add('debug', area, message, details);
const info = (area, message, details) => add('info', area, message, details);
const warn = (area, message, details) => add('warn', area, message, details);
const error = (area, message, details) => add('error', area, message, details);

function recent(limit = 200) {
  const size = Math.max(1, Math.min(MAX_ENTRIES, Number(limit) || 200));
  return entries.slice(-size);
}

function clear() {
  entries.length = 0;
}

module.exports = { add, debug, info, warn, error, recent, clear, MAX_ENTRIES, safeValue };
