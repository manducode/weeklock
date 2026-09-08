// WeekLock storage — localStorage, and nothing else.
//
// There is no backend. The whole state is one JSON blob under one key, saved
// on every change. Export/import is the backup story: a file the user keeps.
(function (root) {
  'use strict';
  var KEY = 'weeklock.v1';
  var W = root.WeekLock;

  function load() {
    var raw;
    try { raw = root.localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return W.emptyState();
    try { return W.migrate(JSON.parse(raw)); } catch (e) { return W.emptyState(); }
  }

  // Private browsing and a full quota both throw here. Losing a log line is
  // annoying; a dead app is worse, so the failure is reported and swallowed.
  var lastError = null;
  function save(state) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
      lastError = null;
      return true;
    } catch (e) {
      lastError = e;
      return false;
    }
  }

  function exportJSON(state) { return JSON.stringify(state, null, 2); }

  function importJSON(text) { return W.migrate(JSON.parse(text)); }

  function exportFilename(state) {
    return 'weeklock-' + W.todayISO() + '.json';
  }

  root.WeekLockStore = {
    KEY: KEY,
    load: load,
    save: save,
    exportJSON: exportJSON,
    importJSON: importJSON,
    exportFilename: exportFilename,
    lastError: function () { return lastError; }
  };
}(typeof self !== 'undefined' ? self : this));
