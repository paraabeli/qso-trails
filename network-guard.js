'use strict';

const dns = require('dns/promises');
const net = require('net');
const http = require('http');
const https = require('https');
const express = require('express');

const ALLOW_PRIVATE_WAVELOG = process.env.ALLOW_PRIVATE_WAVELOG === 'true';
const ALLOW_INSECURE_WAVELOG = process.env.ALLOW_INSECURE_WAVELOG === 'true';
const TRUST_PROXY = String(process.env.TRUST_PROXY || '').trim();
const MAX_WAVELOG_RESPONSE_BYTES = Math.max(1024 * 1024, Math.min(64 * 1024 * 1024, Number(process.env.WAVELOG_MAX_RESPONSE_BYTES) || 16 * 1024 * 1024));
const MAX_CONFIRMATION_RECORDS = Math.max(1000, Math.min(2_000_000, Number(process.env.WAVELOG_CONFIRMATION_MAX_RECORDS) || 500_000));

const originalSet = express.application.set;
const originalFetch = global.fetch.bind(global);

function normalizeIp(value) {
  const text = String(value || '').toLowerCase().split('%')[0];
  if (text.startsWith('::ffff:')) {
    const mapped = text.slice(7);
    if (net.isIP(mapped) === 4) return mapped;
  }
  return text;
}

function ipv4Int(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

function inIpv4Range(ip, base, bits) {
  const n = ipv4Int(ip), b = ipv4Int(base);
  if (n === null || b === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (n & mask) === (b & mask);
}

function isRestrictedIp(input) {
  const ip = normalizeIp(input);
  const version = net.isIP(ip);
  if (version === 4) {
    return [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4]
    ].some(([base, bits]) => inIpv4Range(ip, base, bits));
  }
  if (version !== 6) return true;
  return ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') ||
    /^fe[89ab]/.test(ip) || ip.startsWith('2001:db8:') || ip.startsWith('ff');
}

async function resolvePinned(hostname) {
  const host = String(hostname || '').toLowerCase();
  const rows = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true, verbatim: true });
  if (!rows.length) throw new Error('Wavelog hostname did not resolve.');
  const normalized = rows.map(row => ({ address: normalizeIp(row.address), family: net.isIP(normalizeIp(row.address)) })).filter(row => row.family);
  if (!normalized.length) throw new Error('Wavelog hostname did not resolve to an IP address.');
  if (!ALLOW_PRIVATE_WAVELOG && normalized.some(row => isRestrictedIp(row.address))) {
    throw new Error('Wavelog hostname resolves to a private/reserved address; enable ALLOW_PRIVATE_WAVELOG only when intended.');
  }
  return normalized[0];
}

function isWavelogApiUrl(url) {
  return /\/api\/v2\/(?:qso|confirmation)\/?$/i.test(url.pathname);
}

function enforceConfirmationCap(url) {
  if (!/\/api\/v2\/confirmation\/?$/i.test(url.pathname)) return;
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const perPage = Math.max(1, Number(url.searchParams.get('per_page')) || 1000);
  const firstRecord = (page - 1) * perPage + 1;
  if (firstRecord > MAX_CONFIRMATION_RECORDS) {
    throw new Error(`Wavelog confirmation sync exceeded the ${MAX_CONFIRMATION_RECORDS.toLocaleString()} record safety cap.`);
  }
}

async function pinnedRequest(url, init = {}) {
  if (url.protocol !== 'https:' && !(ALLOW_INSECURE_WAVELOG && url.protocol === 'http:')) {
    throw new Error('Wavelog network guard requires HTTPS unless ALLOW_INSECURE_WAVELOG=true.');
  }
  enforceConfirmationCap(url);
  const pinned = await resolvePinned(url.hostname);
  const transport = url.protocol === 'https:' ? https : http;
  const headers = Object.fromEntries(new Headers(init.headers || {}).entries());

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finishReject = error => { if (!settled) { settled = true; reject(error); } };
    const request = transport.request(url, {
      method: init.method || 'GET',
      headers,
      lookup: (_hostname, options, callback) => {
        if (options?.all) return callback(null, [{ address: pinned.address, family: pinned.family }]);
        return callback(null, pinned.address, pinned.family);
      },
      servername: url.protocol === 'https:' ? url.hostname : undefined,
      timeout: 30_000
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        return finishReject(new Error('Wavelog redirects are not allowed.'));
      }
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_WAVELOG_RESPONSE_BYTES) {
          request.destroy(new Error(`Wavelog response exceeded the ${MAX_WAVELOG_RESPONSE_BYTES} byte safety limit.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        settled = true;
        const body = Buffer.concat(chunks);
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) for (const item of value) responseHeaders.append(name, item);
          else if (value != null) responseHeaders.set(name, String(value));
        }
        resolve(new Response(body, { status: response.statusCode || 500, statusText: response.statusMessage || '', headers: responseHeaders }));
      });
    });
    request.on('timeout', () => request.destroy(new Error('Wavelog request timed out.')));
    request.on('error', finishReject);
    if (init.signal) {
      if (init.signal.aborted) request.destroy(new Error('Wavelog request aborted.'));
      else init.signal.addEventListener('abort', () => request.destroy(new Error('Wavelog request aborted.')), { once: true });
    }
    if (init.body) request.write(init.body);
    request.end();
  });
}

express.application.set = function guardedSet(name, value) {
  if (arguments.length === 1) return originalSet.call(this, name);
  if (name === 'trust proxy') {
    if (!TRUST_PROXY || TRUST_PROXY.toLowerCase() === 'false' || TRUST_PROXY === '0') {
      return originalSet.call(this, name, false);
    }
    return originalSet.call(this, name, TRUST_PROXY);
  }
  return originalSet.call(this, name, value);
};

global.fetch = async function guardedFetch(input, init) {
  let url;
  try { url = input instanceof URL ? new URL(input.toString()) : new URL(String(input)); }
  catch { return originalFetch(input, init); }
  if (!isWavelogApiUrl(url)) return originalFetch(input, init);
  return pinnedRequest(url, init || {});
};

module.exports = {
  normalizeIp,
  isRestrictedIp,
  enforceConfirmationCap,
  resolvePinned,
  pinnedRequest,
  MAX_CONFIRMATION_RECORDS,
  MAX_WAVELOG_RESPONSE_BYTES
};
