'use strict';

const assert = require('assert/strict');
const { createAuthFailureTracker, WINDOW_MS, MAX_ENTRIES_BEFORE_SWEEP } = require('../auth-failures');

const t0 = 1_000_000;

// A large map is swept once entries fall outside the failure window.
const large = createAuthFailureTracker();
for (let i = 0; i < MAX_ENTRIES_BEFORE_SWEEP + 150; i++) large.failures.set(`10.0.0.${i}`, { startedAt: t0, count: 1 });
large.prune(t0 + WINDOW_MS + 1);
assert.equal(large.failures.size, 0, 'stale auth failures must be pruned');

// A small map is a cheap no-op and keeps its in-window entries.
const small = createAuthFailureTracker();
small.state('10.0.0.1', t0).count = 3;
small.prune(t0 + WINDOW_MS + 1);
assert.equal(small.failures.size, 1, 'small maps are not swept');

// state() preserves an in-window entry and resets an expired one.
const tracker = createAuthFailureTracker();
tracker.state('1.2.3.4', t0).count = 5;
assert.equal(tracker.state('1.2.3.4', t0 + 1000).count, 5, 'in-window entry must be preserved');
assert.equal(tracker.state('1.2.3.4', t0 + WINDOW_MS + 1).count, 0, 'expired entry must reset');

console.log('Auth failure tracker tests passed.');