'use strict';

// Bounded in-memory tracker for failed Admin Basic-auth attempts.
//
// A plain Map keyed by client IP grows without bound: entries for addresses that
// try a few passwords and never return would otherwise live for the whole
// process lifetime. The sweep below mirrors the one used for static image rate
// limits, so a distributed scan cannot grow the map indefinitely.

const WINDOW_MS = 15 * 60_000;
const MAX_ENTRIES_BEFORE_SWEEP = 256;

function createAuthFailureTracker() {
  const failures = new Map();

  function state(ip, now = Date.now()) {
    const current = failures.get(ip);
    if (!current || now - current.startedAt > WINDOW_MS) {
      const fresh = { startedAt: now, count: 0 };
      failures.set(ip, fresh);
      return fresh;
    }
    return current;
  }

  function prune(now = Date.now()) {
    if (failures.size <= MAX_ENTRIES_BEFORE_SWEEP) return;
    for (const [ip, value] of failures) {
      if (now - value.startedAt > WINDOW_MS) failures.delete(ip);
    }
  }

  return { failures, state, prune };
}

module.exports = { createAuthFailureTracker, WINDOW_MS, MAX_ENTRIES_BEFORE_SWEEP };