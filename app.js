// WeekLock UI. Plain DOM, no framework, no build step.
//
// Three views over one state object: Log (the default, because logging is the
// thing that has to be instant), Plan, Review. Every mutation goes through
// core.js, then save(), then a re-render of the current view.
(function () {
  'use strict';

  var W = window.WeekLock, S = window.WeekLockStore;
  var state = S.load();

  var ui = {
    view: 'log',
    day: W.todayISO(),
    week: W.mondayOf(W.todayISO()),
    revWeek: W.mondayOf(W.todayISO()),
    panel: null,          // which log category is open
    panelSub: null,       // the subtype chosen in that panel
    slotFormOpen: false,
    showCarry: false      // the pull-forward offer, reopened mid-week
  };

  function $(id) { return document.getElementById(id); }

  function save() {
    if (!S.save(state)) {
      $('storage-note').textContent =
        'This browser refused to save (private mode, or storage is full). ' +
        'Export your data before closing the tab.';
    }
  }

  // Small DOM builder. Everything user-typed goes in as text, never as HTML.
  function h(tag, opts, kids) {
    var n = document.createElement(tag);
    opts = opts || {};
    Object.keys(opts).forEach(function (k) {
      var v = opts[k];
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'on') Object.keys(v).forEach(function (ev) { n.addEventListener(ev, v[ev]); });
      else if (v === true) n.setAttribute(k, '');
      else if (v !== false && v !== null && v !== undefined) n.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function fill(node, kids) {
    node.textContent = '';
    (kids || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function emptyLine(msg) { return h('li', { class: 'empty', text: msg }); }

  // ------------------------------------------------------------- toast

  var toastTimer = null, toastUndo = null;
  function toast(message, undo) {
    var box = $('toast');
    $('toast-text').textContent = message;
    toastUndo = undo || null;
    $('toast-undo').hidden = !undo;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; toastUndo = null; }, 5000);
  }
  $('toast-undo').addEventListener('click', function () {
    if (toastUndo) toastUndo();
    $('toast').hidden = true;
    toastUndo = null;
    render();
  });

  // -------------------------------------------------------------- views

  var VIEWS = ['log', 'plan', 'review', 'data'];

  function setView(name) {
    ui.view = name;
    VIEWS.forEach(function (v) { $('view-' + v).hidden = v !== name; });
    Array.prototype.forEach.call($('tabbar').children, function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    window.scrollTo(0, 0);
    render();
  }

  Array.prototype.forEach.call($('tabbar').children, function (b) {
    b.addEventListener('click', function () { setView(b.dataset.view); });
  });
  $('data-btn').addEventListener('click', function () {
    setView(ui.view === 'data' ? 'log' : 'data');
    $('data-btn').textContent = ui.view === 'data' ? 'Close' : 'Data';
  });

  function render() {
    if (ui.view === 'log') renderLog();
    else if (ui.view === 'plan') renderPlan();
    else if (ui.view === 'review') renderReview();
    else if (ui.view === 'data') renderData();
  }

  // ================================================================= LOG

  function dayWord(iso) {
    var today = W.todayISO();
    if (iso === today) return 'Today';
    if (iso === W.addDays(today, -1)) return 'Yesterday';
    return W.dayLabel(iso);
  }

  $('day-prev').addEventListener('click', function () {
    ui.day = W.addDays(ui.day, -1); closePanel(); renderLog();
  });
  $('day-next').addEventListener('click', function () {
    if (ui.day >= W.todayISO()) return;
    ui.day = W.addDays(ui.day, 1); closePanel(); renderLog();
  });

  function renderLog() {
    $('day-label').textContent = dayWord(ui.day);
    $('day-sub').textContent = ui.day === W.todayISO() ? W.dayLabel(ui.day) : '';
    $('day-next').disabled = ui.day >= W.todayISO();
    $('log-day-word').textContent = dayWord(ui.day).toLowerCase();

    fill($('cat-grid'), W.LOG_TYPES.map(function (t) {
      var last = W.subtypeLabel(t.id, W.defaultSubtype(state, t.id));
      return h('button', {
        type: 'button',
        class: 'cat' + (ui.panel === t.id ? ' open' : ''),
        on: { click: function () { togglePanel(t.id); } }
      }, [t.label, h('small', { text: last })]);
    }));

    renderPanel();
    renderDayLogs();
  }

  function closePanel() { ui.panel = null; ui.panelSub = null; }

  function togglePanel(typeId) {
    if (ui.panel === typeId) closePanel();
    else { ui.panel = typeId; ui.panelSub = W.defaultSubtype(state, typeId); }
    renderLog();
  }

  function renderPanel() {
    var box = $('log-panel');
    if (!ui.panel) { box.hidden = true; box.textContent = ''; return; }
    var type = W.logType(ui.panel);
    box.hidden = false;

    var noteInput = h('input', {
      type: 'text', id: 'panel-note',
      placeholder: type.id === 'checkin' ? 'One line — energy, anxiety, anything'
                                         : 'Note (optional)'
    });

    function commit(minutes) {
      var log = W.addLog(state, {
        type: type.id, subtype: ui.panelSub, date: ui.day,
        minutes: minutes, note: noteInput.value
      });
      save();
      closePanel();
      renderLog();
      toast('Logged ' + type.label + ' · ' +
            W.subtypeLabel(type.id, log.subtype) +
            (log.minutes ? ' · ' + W.minutesLabel(log.minutes) : ''),
            function () { W.removeLog(state, log.id); save(); });
    }

    var subChips = h('div', { class: 'chips' }, type.subtypes.map(function (s) {
      return h('button', {
        type: 'button',
        class: 'chip' + (ui.panelSub === s.id ? ' on' : ''),
        text: s.label,
        on: { click: function () { ui.panelSub = s.id; renderPanel(); } }
      });
    }));

    var kids = [h('h3', { text: type.label + (ui.day === W.todayISO() ? '' : ' · ' + dayWord(ui.day)) }),
                subChips];

    if (type.minutes) {
      var custom = h('input', { type: 'number', min: '0', step: '5', placeholder: 'min' });
      custom.style.maxWidth = '90px';
      kids.push(h('p', { class: 'label', text: 'How long? Tapping a number logs it.' }));
      kids.push(h('div', { class: 'chips' },
        W.MINUTE_CHIPS.map(function (m) {
          return h('button', { type: 'button', class: 'chip go', text: m + 'm',
                               on: { click: function () { commit(m); } } });
        }).concat([
          h('button', { type: 'button', class: 'chip', text: 'Did it',
                        on: { click: function () { commit(null); } } })
        ])));
      kids.push(h('div', { class: 'row', style: 'margin-top:8px' }, [
        custom,
        h('button', { type: 'button', class: 'ghost', text: 'Log that',
                      on: { click: function () { commit(custom.value || null); } } })
      ]));
    }

    kids.push(h('p', { class: 'label', text: 'Note' }));
    kids.push(noteInput);
    if (!type.minutes) {
      kids.push(h('div', { class: 'row end', style: 'margin-top:10px' }, [
        h('button', { type: 'button', class: 'ghost', text: 'Cancel',
                      on: { click: function () { closePanel(); renderLog(); } } }),
        h('button', { type: 'button', text: 'Log it', on: { click: function () { commit(null); } } })
      ]));
    }

    fill(box, kids);
  }

  function logLine(log) {
    var bits = [W.logType(log.type) ? W.logType(log.type).label : log.type,
                W.subtypeLabel(log.type, log.subtype)];
    if (log.minutes) bits.push(W.minutesLabel(log.minutes));
    return h('li', {}, [
      h('div', { class: 'body' }, [
        h('span', { text: bits.join(' · ') }),
        log.note ? h('span', { class: 'meta', text: log.note }) : null
      ]),
      h('button', {
        type: 'button', class: 'iconbtn', text: 'Remove', 'aria-label': 'Remove log entry',
        on: { click: function () {
          var removed = W.removeLog(state, log.id);
          save(); render();
          toast('Removed', function () { state.logs.push(removed); save(); });
        } }
      })
    ]);
  }

  function renderDayLogs() {
    var logs = W.logsOnDay(state, ui.day);
    fill($('day-logs'), logs.length
      ? logs.map(logLine)
      : [emptyLine('Nothing logged yet. Two taps above is enough.')]);
  }

  // ================================================================ PLAN

  function goWeek(key) {
    ui.week = key;
    ui.slotFormOpen = false;
    ui.showCarry = false;
    renderPlan();
  }
  $('week-prev').addEventListener('click', function () { goWeek(W.prevWeekKey(ui.week)); });
  $('week-next').addEventListener('click', function () { goWeek(W.nextWeekKey(ui.week)); });

  function renderPlan() {
    $('week-rel').textContent = W.weekRelation(ui.week);
    $('week-label').textContent = W.weekLabel(ui.week);
    renderCarry();
    renderMustMove();
    renderSlots();
    renderTasks();
    renderParking();
  }

  // The one guided moment: opening a week offers last week's loose ends. It
  // can be asked for again later — a week is refreshable, not a one-shot.
  function renderCarry() {
    var box = $('carry-box');
    box.textContent = '';
    var week = state.weeks[ui.week];
    var cand = W.carryCandidates(state, ui.week);
    var waiting = cand.mustMove.length + cand.tasks.length;

    if (week && week.startedAt && !ui.showCarry) {
      if (waiting) {
        box.appendChild(h('button', {
          type: 'button', class: 'ghost wide', style: 'margin-bottom:12px',
          text: 'Pull forward from last week (' + waiting + ')',
          on: { click: function () { ui.showCarry = true; renderPlan(); } }
        }));
      }
      return;
    }
    var items = cand.mustMove.map(function (m) { return { id: m.id, text: m.text, kind: 'Must-move' }; })
      .concat(cand.tasks.map(function (t) { return { id: t.id, text: t.text, kind: 'Life admin' }; }));

    if (!items.length) {
      box.appendChild(h('div', { class: 'carry' }, [
        h('h2', { text: 'Open this week' }),
        h('p', { class: 'hint', text: 'Nothing is waiting from ' + W.weekLabel(cand.from) +
                                      '. Add what matters and stop there.' }),
        h('button', { type: 'button', class: 'wide', text: 'Start the week',
                      on: { click: function () { startWeekWith([]); } } })
      ]));
      return;
    }

    var picked = {};
    items.forEach(function (i) { picked[i.id] = true; });

    var list = h('ul', { class: 'list' }, items.map(function (i) {
      var tick = h('button', { type: 'button', class: 'tick on', text: '✓',
                               'aria-label': 'Carry this forward' });
      tick.addEventListener('click', function () {
        picked[i.id] = !picked[i.id];
        tick.classList.toggle('on', picked[i.id]);
        tick.textContent = picked[i.id] ? '✓' : '';
      });
      return h('li', {}, [tick, h('div', { class: 'body' }, [
        h('span', { text: i.text }), h('span', { class: 'meta', text: i.kind })
      ])]);
    }));

    box.appendChild(h('div', { class: 'carry' }, [
      h('h2', { text: 'Bring anything forward?' }),
      h('p', { class: 'hint', text: 'Left over from ' + W.weekLabel(cand.from) +
                                    '. Untick what has stopped mattering.' }),
      list,
      h('div', { class: 'row end', style: 'margin-top:10px' }, [
        h('button', { type: 'button', class: 'ghost', text: ui.showCarry ? 'Not now' : 'None of it',
                      on: { click: function () { startWeekWith([]); } } }),
        h('button', { type: 'button', text: ui.showCarry ? 'Bring these over' : 'Start the week',
                      on: { click: function () {
          startWeekWith(Object.keys(picked).filter(function (k) { return picked[k]; }));
        } } })
      ])
    ]));
  }

  function startWeekWith(keep) {
    var moved = W.startWeek(state, ui.week, keep);
    ui.showCarry = false;
    save();
    renderPlan();
    var n = moved.mustMove + moved.tasks;
    if (n) toast('Carried ' + n + ' item' + (n === 1 ? '' : 's') + ' forward');
  }

  function moveButton(label, fn) {
    return h('button', { type: 'button', class: 'iconbtn', text: label, on: { click: fn } });
  }

  function renderMustMove() {
    var week = W.ensureWeek(state, ui.week), items = week.mustMove;
    var over = items.length > W.MUST_MOVE_SUGGESTED;
    $('must-hint').textContent = over
      ? items.length + ' on the list. Three usually holds; the rest can be parked.'
      : 'Three is usually enough.';

    fill($('must-list'), items.length ? items.map(function (m) {
      return h('li', {}, [
        h('button', {
          type: 'button', class: 'tick' + (m.done ? ' on' : ''), text: m.done ? '✓' : '',
          'aria-label': m.done ? 'Mark not done' : 'Mark done',
          on: { click: function () { W.toggleMustMove(state, ui.week, m.id); save(); renderPlan(); } }
        }),
        h('div', { class: 'body' }, [
          h('span', { class: m.done ? 'done' : '', text: m.text }),
          m.carried ? h('span', { class: 'meta', text: 'carried forward' }) : null
        ]),
        h('div', { class: 'actions' }, [
          moveButton('→ next week', function () {
            W.moveMustMoveToWeek(state, ui.week, m.id, W.nextWeekKey(ui.week));
            save(); renderPlan(); toast('Moved to next week');
          }),
          moveButton('Remove', function () {
            var removed = W.removeMustMove(state, ui.week, m.id);
            save(); renderPlan();
            toast('Removed', function () { W.ensureWeek(state, ui.week).mustMove.push(removed); save(); });
          })
        ])
      ]);
    }) : [emptyLine('Nothing yet. One or two is a real week.')]);
  }

  $('must-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (W.addMustMove(state, ui.week, $('must-input').value)) {
      $('must-input').value = '';
      save(); renderPlan();
    }
  });

  function renderSlots() {
    var week = W.ensureWeek(state, ui.week), slots = W.sortedSlots(week);
    fill($('slot-list'), slots.length ? slots.map(function (s) {
      var when = W.dayLabel(s.date) + (s.time ? ' · ' + s.time : '');
      var meta = [when, s.kind].filter(Boolean).join(' · ');
      return h('li', {}, [
        h('button', {
          type: 'button', class: 'tick' + (s.attended ? ' on' : ''), text: s.attended ? '✓' : '',
          'aria-label': 'Attended',
          on: { click: function () { W.toggleSlotAttended(state, ui.week, s.id); save(); renderPlan(); } }
        }),
        h('div', { class: 'body' }, [
          h('span', { class: s.attended ? 'done' : '', text: s.name }),
          h('span', { class: 'meta', text: meta }),
          s.koreanNote ? h('span', { class: 'meta', text: 'Korean: ' + s.koreanNote }) : null
        ]),
        h('div', { class: 'actions' }, [
          moveButton('→ next week', function () {
            W.moveSlotToWeek(state, ui.week, s.id, W.nextWeekKey(ui.week));
            save(); renderPlan(); toast('Moved to next week');
          }),
          moveButton('Remove', function () {
            var removed = W.removeSlot(state, ui.week, s.id);
            save(); renderPlan();
            toast('Removed', function () { W.ensureWeek(state, ui.week).slots.push(removed); save(); });
          })
        ])
      ]);
    }) : [emptyLine('No slots yet. Groups cancel; that is fine, add them anyway.')]);

    $('slot-form').hidden = !ui.slotFormOpen;
    $('slot-toggle').hidden = ui.slotFormOpen;
    if (ui.slotFormOpen) {
      fill($('slot-kind'), [h('option', { value: '', text: 'Kind' })].concat(
        W.SLOT_KINDS.map(function (k) { return h('option', { value: k, text: k }); })));
      fill($('slot-day'), W.weekDates(ui.week).map(function (d) {
        return h('option', { value: d, text: W.dayLabel(d) });
      }));
    }
  }

  $('slot-toggle').addEventListener('click', function () {
    ui.slotFormOpen = true; renderPlan(); $('slot-name').focus();
  });
  $('slot-cancel').addEventListener('click', function () {
    ui.slotFormOpen = false; renderPlan();
  });
  $('slot-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var added = W.addSlot(state, ui.week, {
      name: $('slot-name').value,
      kind: $('slot-kind').value,
      date: $('slot-day').value,
      time: $('slot-time').value,
      koreanNote: $('slot-korean').value
    });
    if (!added) { $('slot-name').focus(); return; }
    ['slot-name', 'slot-time', 'slot-korean'].forEach(function (id) { $(id).value = ''; });
    ui.slotFormOpen = false;
    save(); renderPlan();
  });

  function renderTasks() {
    var promoted = W.promotedTasks(state, ui.week);
    fill($('promoted-list'), promoted.length ? promoted.map(function (t) {
      return h('li', {}, [
        h('button', {
          type: 'button', class: 'tick' + (t.doneAt ? ' on' : ''), text: t.doneAt ? '✓' : '',
          'aria-label': 'Mark done',
          on: { click: function () {
            if (t.doneAt) W.reopenTask(state, t.id); else W.completeTask(state, t.id);
            save(); renderPlan();
          } }
        }),
        h('div', { class: 'body' }, [h('span', { class: t.doneAt ? 'done' : '', text: t.text })]),
        h('div', { class: 'actions' }, [
          moveButton('Put back', function () { W.unpromoteTask(state, t.id); save(); renderPlan(); })
        ])
      ]);
    }) : [emptyLine('Nothing pulled in. Zero is a valid week.')]);

    var open = W.openTasks(state).filter(function (t) { return t.promotedWeek !== ui.week; });
    $('backlog-count').textContent = open.length ? '(' + open.length + ')' : '(none)';
    fill($('backlog-list'), open.length ? open.map(function (t) {
      return h('li', {}, [
        h('div', { class: 'body' }, [
          h('span', { text: t.text }),
          t.promotedWeek ? h('span', { class: 'meta', text: 'in ' + W.weekLabel(t.promotedWeek) }) : null
        ]),
        h('div', { class: 'actions' }, [
          moveButton('Into this week', function () {
            W.promoteTask(state, t.id, ui.week); save(); renderPlan();
          }),
          moveButton('Remove', function () {
            var removed = W.removeTask(state, t.id);
            save(); renderPlan();
            toast('Removed', function () { state.tasks.push(removed); save(); });
          })
        ])
      ]);
    }) : [emptyLine('No open tasks.')]);
  }

  $('task-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (W.addTask(state, $('task-input').value)) {
      $('task-input').value = '';
      $('backlog-details').open = true;
      save(); renderPlan();
    }
  });

  function renderParking() {
    fill($('parking-list'), state.parking.length ? state.parking.map(function (p) {
      return h('li', {}, [
        h('div', { class: 'body' }, [h('span', { text: p.text })]),
        h('div', { class: 'actions' }, [
          moveButton('→ must-move', function () {
            W.parkingToMustMove(state, p.id, ui.week); save(); renderPlan();
          }),
          moveButton('→ task', function () { W.parkingToTask(state, p.id); save(); renderPlan(); }),
          moveButton('Remove', function () {
            var removed = W.removeParking(state, p.id);
            save(); renderPlan();
            toast('Removed', function () { state.parking.unshift(removed); save(); });
          })
        ])
      ]);
    }) : [emptyLine('Empty. Ideas can live here without becoming plans.')]);
  }

  $('parking-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (W.addParking(state, $('parking-input').value)) {
      $('parking-input').value = '';
      save(); renderPlan();
    }
  });

  // ============================================================== REVIEW

  $('rev-prev').addEventListener('click', function () {
    ui.revWeek = W.prevWeekKey(ui.revWeek); renderReview();
  });
  $('rev-next').addEventListener('click', function () {
    ui.revWeek = W.nextWeekKey(ui.revWeek); renderReview();
  });

  function kv(label, value) {
    return h('li', {}, [h('span', { text: label }), h('span', { class: 'val', text: String(value) })]);
  }

  function renderReview() {
    $('rev-rel').textContent = W.weekRelation(ui.revWeek);
    $('rev-label').textContent = W.weekLabel(ui.revWeek);

    var sum = W.weekSummary(state, ui.revWeek), c = sum.counts;

    fill($('rev-planned'), [
      kv('Must-move done', sum.mustMove.done + ' of ' + sum.mustMove.total),
      kv('Slots attended', sum.slots.attended + ' of ' + sum.slots.total),
      kv('Life admin pulled in', sum.tasks.done + ' of ' + sum.tasks.promoted)
    ]);

    fill($('rev-logged'), [
      kv('Korean sessions', c.koreanSessions + (c.koreanMinutes ? '  ·  ' + W.minutesLabel(c.koreanMinutes) : '')),
      kv('App sessions', c.appSessions + (c.appMinutes ? '  ·  ' + W.minutesLabel(c.appMinutes) : '')),
      kv('Movement', c.movementSessions + (c.longRides ? '  ·  ' + c.longRides + ' longer ride' + (c.longRides === 1 ? '' : 's') : '')),
      kv('Spontaneous / organic social', c.spontaneousSocial),
      kv('Dating-app dates', c.datingDates),
      kv('Life admin logged', c.adminDone)
    ]);

    renderRolling();

    var logs = W.logsInWeek(state, ui.revWeek);
    fill($('rev-logs'), logs.length ? logs.map(function (l) {
      var li = logLine(l);
      li.querySelector('.body').appendChild(h('span', { class: 'meta', text: W.dayLabel(l.date) }));
      return li;
    }) : [emptyLine('Nothing logged this week.')]);
  }

  var ROLL_COLS = [
    { key: 'koreanSessions', head: 'Korean' },
    { key: 'appSessions', head: 'App' },
    { key: 'longRides', head: 'Rides' },
    { key: 'plannedAttended', head: 'Slots' },
    { key: 'spontaneousSocial', head: 'Social' },
    { key: 'datingDates', head: 'Dates' },
    { key: 'adminDone', head: 'Admin' }
  ];

  function renderRolling() {
    var roll = W.rollingTotals(state, ui.revWeek, 4);
    var head = h('thead', {}, [h('tr', {},
      [h('th', { text: 'Week' })].concat(ROLL_COLS.map(function (col) {
        return h('th', { text: col.head });
      })))]);
    var body = h('tbody', {}, roll.weeks.map(function (r) {
      return h('tr', {}, [h('td', { text: W.shortDate(r.key) })].concat(ROLL_COLS.map(function (col) {
        return h('td', { text: String(r.counts[col.key]) });
      })));
    }));
    var foot = h('tfoot', {}, [h('tr', {},
      [h('td', { text: 'Total' })].concat(ROLL_COLS.map(function (col) {
        return h('td', { text: String(roll.totals[col.key]) });
      })))]);
    fill($('rev-rolling'), [head, body, foot]);
  }

  // ================================================================ DATA

  function renderData() {
    var bytes = 0;
    try { bytes = (localStorage.getItem(S.KEY) || '').length; } catch (e) { bytes = 0; }
    var weeks = Object.keys(state.weeks).length;
    function n(count, one, many) { return count + ' ' + (count === 1 ? one : many); }
    $('storage-note').textContent =
      [n(state.logs.length, 'log entry', 'log entries'),
       n(weeks, 'week', 'weeks'),
       n(state.tasks.length, 'task', 'tasks'),
       state.parking.length + ' parked'].join(', ') +
      ' — about ' + Math.max(1, Math.round(bytes / 1024)) + ' KB.';
  }

  $('export-btn').addEventListener('click', function () {
    var blob = new Blob([S.exportJSON(state)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: S.exportFilename(state) });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  $('import-btn').addEventListener('click', function () { $('import-file').click(); });

  $('import-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var incoming;
      try { incoming = S.importJSON(String(reader.result)); }
      catch (err) { toast('That file could not be read'); return; }
      if (!window.confirm('Replace everything in this browser with the file? ' +
                          'Export first if you are not sure.')) return;
      state = incoming;
      save();
      render();
      toast('Imported');
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  $('reset-btn').addEventListener('click', function () {
    if (!window.confirm('Delete every week, task and log in this browser?')) return;
    state = W.emptyState();
    save();
    render();
    toast('Cleared');
  });

  // ================================================================ boot

  // A tab left open overnight should not still say "Today" about yesterday.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    var today = W.todayISO();
    if (ui.day > today) ui.day = today;
    render();
  });

  setView('log');
}());
