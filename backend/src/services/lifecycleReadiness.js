'use strict';

// The HTTP socket may exist before Supabase/local lifecycle restoration has
// completed. Broker routes stay retryable-503 until this latch is released;
// otherwise an early request can make lazy stores cache an empty state.
let state = {
  ready: process.env.NODE_ENV === 'test',
  phase: process.env.NODE_ENV === 'test' ? 'test-ready' : 'booting',
  updatedAt: new Date().toISOString(),
};

function set(ready, phase) {
  state = { ready: ready === true, phase: String(phase || ''), updatedAt: new Date().toISOString() };
  return status();
}

function beginRestore() { return set(false, 'persistence-restore'); }
function completeRestore() { return set(true, 'ready'); }
function failRestore(reason) { return set(false, `restore-failed:${String(reason || 'unknown').slice(0, 120)}`); }
function status() { return { ...state }; }
function isReady() { return state.ready === true; }
function resetForTest(ready = true) { return set(ready === true, ready ? 'test-ready' : 'test-booting'); }

module.exports = { beginRestore, completeRestore, failRestore, status, isReady, resetForTest };
