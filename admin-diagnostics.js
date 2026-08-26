'use strict';

const express = require('express');
const diagnostics = require('./diagnostics');
const { earthStatus } = require('./earth-texture');

const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

function textArg(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ''}`;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(diagnostics.safeValue(value)); } catch { return String(value); }
}

for (const [name, level] of [['log', 'info'], ['warn', 'warn'], ['error', 'error']]) {
  console[name] = (...args) => {
    try { diagnostics.add(level, 'console', args.map(textArg).join(' ')); } catch {}
    originalConsole[name](...args);
  };
}

const originalHandle = express.application.handle;
express.application.handle = function diagnosticsHandle(req, res, done) {
  const started = process.hrtime.bigint();
  let pathname = '/';
  try { pathname = new URL(req.originalUrl || req.url || '/', 'http://local').pathname; } catch {}
  const interesting = pathname.startsWith('/api/') || pathname === '/admin' || pathname === '/embed' || pathname === '/static/qrz.png' || pathname === '/assets/earth-blue-marble.png';
  if (interesting && pathname !== '/api/admin/diagnostics') {
    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug';
      diagnostics.add(level, 'http', `${req.method} ${pathname} -> ${res.statusCode}`, { durationMs: Math.round(durationMs) });
    });
  }
  return originalHandle.call(this, req, res, done);
};

const originalListen = express.application.listen;
express.application.listen = function diagnosticsListen(...args) {
  this.get('/api/admin/diagnostics', async (req, res) => {
    try {
      const limit = Math.max(20, Math.min(500, Number(req.query?.limit) || 200));
      res.json({
        generatedAt: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        node: process.version,
        memory: {
          rssBytes: process.memoryUsage().rss,
          heapUsedBytes: process.memoryUsage().heapUsed
        },
        earth: await earthStatus(),
        logs: diagnostics.recent(limit)
      });
    } catch (error) {
      diagnostics.error('diagnostics', 'Failed to build admin diagnostics response.', { error: error?.message || error });
      res.status(500).json({ error: 'Diagnostics unavailable.' });
    }
  });
  diagnostics.info('diagnostics', 'Private admin diagnostics enabled.', { maxEntries: diagnostics.MAX_ENTRIES });
  return originalListen.apply(this, args);
};
