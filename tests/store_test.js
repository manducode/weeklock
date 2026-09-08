// node weeklock/tests/store_test.js — the localStorage layer.
//
// store.js is browser code: it hangs off a global and talks to localStorage.
// Rather than mock a whole browser, the file is evaluated with `self` bound to
// a fake window, which is exactly the branch a browser takes.
var fs = require('fs'), path = require('path'), vm = require('vm');
var W = require('../core.js');

var pass = 0, fail = 0;
function is(got, want, label) {
  if (got === want) { pass++; return; }
  fail++;
  console.log('  FAIL ' + label + '\n       got  ' + JSON.stringify(got) +
              '\n       want ' + JSON.stringify(want));
}
function ok(cond, label) { is(!!cond, true, label); }

// A localStorage that can be told to start failing, the way a private-mode
// browser or a full quota does.
function fakeWindow(opts) {
  var data = {}, o = opts || {};
  var win = {
    WeekLock: W,
    localStorage: {
      getItem: function (k) {
        if (o.readThrows) throw new Error('denied');
        return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
      },
      setItem: function (k, v) {
        if (o.writeThrows) throw new Error('QuotaExceededError');
        data[k] = String(v);
      }
    },
    _data: data
  };
  win.self = win;
  return win;
}

function loadStore(win) {
  var src = fs.readFileSync(path.join(__dirname, '..', 'store.js'), 'utf8');
  vm.runInNewContext(src, win);
  return win.WeekLockStore;
}

console.log('a state saved is a state loaded');
var win = fakeWindow(), store = loadStore(win);
var s = W.emptyState();
W.addMustMove(s, '2026-09-07', 'Ship the drill screen');
W.addLog(s, { type: 'korean', subtype: 'church', minutes: 90, date: '2026-09-13' });
ok(store.save(s), 'save reports success');
ok(win._data[store.KEY], 'and something landed under the key');

var back = store.load();
is(back.weeks['2026-09-07'].mustMove[0].text, 'Ship the drill screen', 'the plan comes back');
is(back.logs[0].minutes, 90, 'and so does the log');
is(back.version, W.VERSION, 'stamped with the current version');

console.log('\nnothing stored yet');
var fresh = loadStore(fakeWindow()).load();
is(fresh.logs.length, 0, 'an untouched browser gives an empty state');

console.log('\nrubbish in storage does not brick the app');
var win2 = fakeWindow(), store2 = loadStore(win2);
win2._data[store2.KEY] = '{not json at all';
var recovered = store2.load();
is(recovered.logs.length, 0, 'a corrupt blob reads as empty rather than throwing');
ok(recovered.weeks, 'with a usable shape');

var win3 = fakeWindow({ readThrows: true }), store3 = loadStore(win3);
is(store3.load().logs.length, 0, 'a browser that refuses to read storage still starts');

console.log('\na browser that refuses to write');
var win4 = fakeWindow({ writeThrows: true }), store4 = loadStore(win4);
is(store4.save(W.emptyState()), false, 'save reports the failure instead of throwing');
ok(store4.lastError(), 'and keeps the error for the UI to show');

console.log('\nexport and import');
var text = store.exportJSON(s);
ok(text.indexOf('Ship the drill screen') > 0, 'the export carries the content');
var imported = store.importJSON(text);
is(imported.weeks['2026-09-07'].mustMove[0].text, 'Ship the drill screen', 'and round-trips');
is(imported.logs.length, 1, 'with the logs');
ok(/^weeklock-\d{4}-\d{2}-\d{2}\.json$/.test(store.exportFilename(s)), 'the filename is dated');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
