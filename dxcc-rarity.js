'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DATA = path.join(__dirname, 'data');
const CACHE = path.join(DATA, 'clublog-most-wanted.json');
const SOURCE = 'https://clublog.org/mostwanted.php?api=1';
const SOURCE_DOC = 'https://clublog.freshdesk.com/support/solutions/articles/76225-most-wanted-list-json-api';
const SOURCE_NAME = 'Club Log Most Wanted';
const REFRESH_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 256 * 1024;
const MAX_RANK = 1000;
let memory = null;
let loading = null;

function normalizeRanks(raw) {
  const ranks = {};
  const add = (rankValue, dxccValue) => {
    const rank = Number(rankValue);
    const dxcc = Number(dxccValue);
    if (!Number.isInteger(rank) || rank < 1 || rank > MAX_RANK) return;
    if (!Number.isInteger(dxcc) || dxcc < 1 || dxcc > 9999) return;
    const key = String(dxcc);
    if (!ranks[key] || rank < ranks[key]) ranks[key] = rank;
  };

  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (Array.isArray(row)) add(row[0], row[1]);
      else if (row && typeof row === 'object') add(row.rank ?? row.position, row.dxcc ?? row.adif ?? row.entity);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [rank, dxcc] of Object.entries(raw)) add(rank, dxcc);
  }
  return ranks;
}

function validSnapshot(value) {
  if (!value || typeof value !== 'object' || !value.ranks || typeof value.ranks !== 'object') return null;
  const ranks = normalizeRanks(Object.fromEntries(Object.entries(value.ranks).map(([dxcc, rank]) => [rank, dxcc])));
  if (!Object.keys(ranks).length) return null;
  return {
    source: SOURCE_NAME,
    sourceUrl: SOURCE,
    sourceDoc: SOURCE_DOC,
    fetchedAt: typeof value.fetchedAt === 'string' ? value.fetchedAt : null,
    ranks,
    stale: Boolean(value.stale)
  };
}

async function readCache() {
  try {
    const parsed = validSnapshot(JSON.parse(await fs.readFile(CACHE, 'utf8')));
    return parsed;
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') throw error;
    return null;
  }
}

async function writeCache(snapshot) {
  await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
  const tmp = `${CACHE}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  await fs.rename(tmp, CACHE);
}

function cacheFresh(snapshot) {
  const time = snapshot?.fetchedAt ? Date.parse(snapshot.fetchedAt) : NaN;
  return Number.isFinite(time) && Date.now() - time < REFRESH_MS;
}

async function fetchRanking() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(SOURCE, {
      headers: { Accept: 'application/json', 'User-Agent': 'QSO-Trails/1.0' },
      redirect: 'error',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Club Log Most Wanted request failed (${response.status}).`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Club Log Most Wanted response was empty.');
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) throw new Error('Club Log Most Wanted response exceeded the safety limit.');
      chunks.push(Buffer.from(value));
    }
    let json;
    try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('Club Log Most Wanted returned invalid JSON.'); }
    const ranks = normalizeRanks(json);
    if (Object.keys(ranks).length < 10) throw new Error('Club Log Most Wanted response did not contain a usable ranking.');
    const snapshot = {
      source: SOURCE_NAME,
      sourceUrl: SOURCE,
      sourceDoc: SOURCE_DOC,
      fetchedAt: new Date().toISOString(),
      ranks,
      stale: false
    };
    await writeCache(snapshot);
    return snapshot;
  } finally {
    clearTimeout(timer);
  }
}

async function loadMostWanted() {
  const cached = memory || await readCache();
  if (cached && cacheFresh(cached)) return { ...cached, stale: false };
  try {
    const fresh = await fetchRanking();
    memory = fresh;
    return fresh;
  } catch (error) {
    if (cached) {
      memory = { ...cached, stale: true };
      return memory;
    }
    return null;
  }
}

async function getMostWanted() {
  if (memory && cacheFresh(memory)) return { ...memory, stale: false };
  if (!loading) loading = loadMostWanted().finally(() => { loading = null; });
  return loading;
}

function topRarestWorked(qsos, ranking, limit = 3) {
  const ranks = ranking?.ranks || ranking || {};
  const entities = new Map();
  for (const q of qsos || []) {
    const dxcc = String(q?.dxcc || '').trim();
    const rank = Number(ranks[dxcc]);
    if (!dxcc || !Number.isInteger(rank) || rank < 1) continue;
    const current = entities.get(dxcc) || {
      dxcc,
      country: String(q?.country || '').trim().slice(0, 120),
      rank,
      qsos: 0
    };
    current.qsos++;
    if (!current.country && q?.country) current.country = String(q.country).trim().slice(0, 120);
    entities.set(dxcc, current);
  }
  return [...entities.values()]
    .sort((a, b) => a.rank - b.rank || b.qsos - a.qsos || a.dxcc.localeCompare(b.dxcc, undefined, { numeric: true }))
    .slice(0, Math.max(0, Math.min(10, Number(limit) || 3)));
}

module.exports = {
  CACHE,
  SOURCE,
  SOURCE_DOC,
  SOURCE_NAME,
  REFRESH_MS,
  normalizeRanks,
  getMostWanted,
  topRarestWorked
};
