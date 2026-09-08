// WeekLock core — dates, state and the arithmetic behind the review.
//
// Pure logic: no DOM, no storage, no network. The browser loads this as a
// plain <script> (it sets window.WeekLock); the node tests require() it.
// Everything here takes the state object and returns or mutates it, so the
// UI layer never has to know how a week is shaped.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WeekLock = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;

  // ---------------------------------------------------------------- dates
  // Local dates only. Every date in the state is a 'YYYY-MM-DD' string and a
  // week is keyed by its Monday. new Date('2026-09-08') parses as UTC and can
  // land on the day before, so dates are always taken apart by hand.

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function parseISO(iso) {
    var p = String(iso).slice(0, 10).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function isoOf(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function todayISO(now) { return isoOf(now || new Date()); }

  function addDays(iso, n) {
    var d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }

  // Monday of the week containing iso. getDay() is 0=Sunday, so shift it.
  function mondayOf(iso) {
    var d = parseISO(iso), back = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - back);
    return isoOf(d);
  }

  function weekKeyOf(iso) { return mondayOf(iso); }
  function nextWeekKey(key) { return addDays(key, 7); }
  function prevWeekKey(key) { return addDays(key, -7); }
  function weekDates(key) {
    var out = [], i;
    for (i = 0; i < 7; i++) out.push(addDays(key, i));
    return out;
  }
  function isInWeek(iso, key) { return iso >= key && iso <= addDays(key, 6); }

  var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dayName(iso) { return DAY_NAMES[(parseISO(iso).getDay() + 6) % 7]; }

  function shortDate(iso) {
    var d = parseISO(iso);
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()];
  }

  function dayLabel(iso) { return dayName(iso) + ' ' + shortDate(iso); }

  function weekLabel(key) {
    return shortDate(key) + ' – ' + shortDate(addDays(key, 6));
  }

  // "This week" / "Next week" / "2 weeks ago", relative to today.
  function weekRelation(key, todayIso) {
    var diff = Math.round((parseISO(key) - parseISO(mondayOf(todayIso || todayISO()))) / 86400000 / 7);
    if (diff === 0) return 'This week';
    if (diff === 1) return 'Next week';
    if (diff === -1) return 'Last week';
    if (diff < 0) return (-diff) + ' weeks ago';
    return 'in ' + diff + ' weeks';
  }

  // ------------------------------------------------------------ vocabulary
  // The lists the UI draws its chips from. Order matters: the first subtype
  // of each type is the default, so one tap is enough for the common case.

  var LOG_TYPES = [
    { id: 'korean', label: 'Korean', minutes: true, subtypes: [
      { id: 'solo', label: 'Solo' },
      { id: 'group', label: 'Group' },
      { id: 'church', label: 'Church' },
      { id: 'meetup', label: 'Meetup' },
      { id: 'conversation', label: 'Conversation' }
    ] },
    { id: 'app', label: 'App session', minutes: true, subtypes: [
      { id: 'work', label: 'Work app' },
      { id: 'language', label: 'Language app' },
      { id: 'planner', label: 'This app' }
    ] },
    { id: 'movement', label: 'Movement', minutes: true, subtypes: [
      { id: 'commute', label: 'Short commute' },
      { id: 'ride', label: 'Longer ride' },
      { id: 'other', label: 'Other' }
    ] },
    { id: 'social', label: 'Social', minutes: false, subtypes: [
      { id: 'spontaneous', label: 'Spontaneous' },
      { id: 'friend', label: 'Friend time' },
      { id: 'organic', label: 'Organic meeting' },
      { id: 'dating-app', label: 'Dating-app date' }
    ] },
    { id: 'admin', label: 'Life admin', minutes: false, subtypes: [
      { id: 'task', label: 'Task done' }
    ] },
    { id: 'checkin', label: 'Note', minutes: false, subtypes: [
      { id: 'morning', label: 'Morning' },
      { id: 'evening', label: 'Evening' }
    ] }
  ];

  var SLOT_KINDS = ['Church', 'Study group', 'Body doubling', 'Meetup',
                    'Language exchange', 'Friend', 'Other'];

  var MINUTE_CHIPS = [15, 30, 45, 60, 90];

  function logType(id) {
    for (var i = 0; i < LOG_TYPES.length; i++) if (LOG_TYPES[i].id === id) return LOG_TYPES[i];
    return null;
  }

  function subtypeLabel(typeId, subId) {
    var t = logType(typeId), i;
    if (!t) return subId || '';
    for (i = 0; i < t.subtypes.length; i++) if (t.subtypes[i].id === subId) return t.subtypes[i].label;
    return subId || '';
  }

  // ----------------------------------------------------------------- state

  var idSeq = 0;
  function uid(prefix) {
    idSeq++;
    return (prefix || 'i') + '-' + Date.now().toString(36) + '-' + idSeq.toString(36) +
           '-' + Math.floor(Math.random() * 1296).toString(36);
  }

  function emptyState() {
    return {
      version: VERSION,
      weeks: {},        // key (Monday ISO) -> week
      tasks: [],        // life admin backlog, promoted into weeks
      parking: [],      // ideas that stay unscheduled, on purpose
      logs: [],         // everything that actually happened
      prefs: { lastSubtype: {} }
    };
  }

  // Tolerate anything: an older export, a hand-edited file, a half-written
  // state from a crashed tab. Missing pieces come back as empty, never null.
  function migrate(state) {
    var s = state && typeof state === 'object' ? state : {};
    var out = emptyState();
    out.version = VERSION;
    if (s.weeks && typeof s.weeks === 'object') {
      Object.keys(s.weeks).forEach(function (k) {
        var w = s.weeks[k] || {};
        out.weeks[k] = {
          key: k,
          startedAt: w.startedAt || null,
          mustMove: Array.isArray(w.mustMove) ? w.mustMove : [],
          slots: Array.isArray(w.slots) ? w.slots : [],
          note: typeof w.note === 'string' ? w.note : ''
        };
      });
    }
    if (Array.isArray(s.tasks)) out.tasks = s.tasks;
    if (Array.isArray(s.parking)) out.parking = s.parking;
    if (Array.isArray(s.logs)) out.logs = s.logs;
    if (s.prefs && typeof s.prefs === 'object') {
      out.prefs.lastSubtype = s.prefs.lastSubtype || {};
    }
    return out;
  }

  function ensureWeek(state, key) {
    if (!state.weeks[key]) {
      state.weeks[key] = { key: key, startedAt: null, mustMove: [], slots: [], note: '' };
    }
    return state.weeks[key];
  }

  function weekExists(state, key) { return !!state.weeks[key]; }

  // ------------------------------------------------------------- must-move

  var MUST_MOVE_SUGGESTED = 3;   // a recommendation the UI mentions, not a limit

  function addMustMove(state, key, text) {
    text = String(text || '').trim();
    if (!text) return null;
    var item = { id: uid('m'), text: text, done: false, carried: false };
    ensureWeek(state, key).mustMove.push(item);
    return item;
  }

  function findIn(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function removeFrom(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list.splice(i, 1)[0];
    }
    return null;
  }

  function toggleMustMove(state, key, id) {
    var item = findIn(ensureWeek(state, key).mustMove, id);
    if (item) item.done = !item.done;
    return item;
  }

  function removeMustMove(state, key, id) {
    return removeFrom(ensureWeek(state, key).mustMove, id);
  }

  // Moving on is a normal move, not a failure: the item keeps its text and
  // arrives in the next week unticked and marked as carried.
  function moveMustMoveToWeek(state, key, id, targetKey) {
    var item = removeMustMove(state, key, id);
    if (!item) return null;
    item.done = false;
    item.carried = true;
    ensureWeek(state, targetKey).mustMove.push(item);
    return item;
  }

  // ----------------------------------------------------------------- slots
  // A scheduled thing with other people in it: church, a study group, body
  // doubling, a meetup. Dated, so it sorts into the week by day.

  function addSlot(state, key, fields) {
    var f = fields || {};
    var date = f.date && isInWeek(f.date, key) ? f.date : key;
    var slot = {
      id: uid('s'),
      date: date,
      time: String(f.time || '').trim(),
      name: String(f.name || '').trim(),
      kind: String(f.kind || '').trim(),
      koreanNote: String(f.koreanNote || '').trim(),
      attended: false
    };
    if (!slot.name) return null;
    ensureWeek(state, key).slots.push(slot);
    return slot;
  }

  function sortedSlots(week) {
    return week.slots.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.time || '') < (b.time || '') ? -1 : (a.time === b.time ? 0 : 1);
    });
  }

  function toggleSlotAttended(state, key, id) {
    var slot = findIn(ensureWeek(state, key).slots, id);
    if (slot) slot.attended = !slot.attended;
    return slot;
  }

  function removeSlot(state, key, id) {
    return removeFrom(ensureWeek(state, key).slots, id);
  }

  function moveSlotToWeek(state, key, id, targetKey) {
    var slot = removeFrom(ensureWeek(state, key).slots, id);
    if (!slot) return null;
    var offset = Math.round((parseISO(slot.date) - parseISO(key)) / 86400000);
    slot.date = addDays(targetKey, Math.max(0, Math.min(6, offset)));
    slot.attended = false;
    ensureWeek(state, targetKey).slots.push(slot);
    return slot;
  }

  // ----------------------------------------------------------------- tasks
  // The life-admin backlog lives outside any week. A task is promoted into a
  // week when it is worth doing now, and can be pushed back out again.

  function addTask(state, text) {
    text = String(text || '').trim();
    if (!text) return null;
    var task = { id: uid('t'), text: text, createdAt: new Date().toISOString(),
                 promotedWeek: null, doneAt: null };
    state.tasks.push(task);
    return task;
  }

  function promoteTask(state, id, key) {
    var task = findIn(state.tasks, id);
    if (task) task.promotedWeek = key;
    return task;
  }

  function unpromoteTask(state, id) {
    var task = findIn(state.tasks, id);
    if (task) task.promotedWeek = null;
    return task;
  }

  function promotedTasks(state, key) {
    return state.tasks.filter(function (t) { return t.promotedWeek === key; });
  }

  function openTasks(state) {
    return state.tasks.filter(function (t) { return !t.doneAt; });
  }

  // Completing a task also writes a log line, so life admin shows up in the
  // review next to everything else that happened.
  function completeTask(state, id, whenIso) {
    var task = findIn(state.tasks, id);
    if (!task || task.doneAt) return null;
    task.doneAt = new Date().toISOString();
    addLog(state, { type: 'admin', subtype: 'task', date: whenIso || todayISO(),
                    note: task.text, taskId: task.id });
    return task;
  }

  function reopenTask(state, id) {
    var task = findIn(state.tasks, id);
    if (!task) return null;
    task.doneAt = null;
    // Drop the log line the completion wrote, so the review does not count a
    // task that was ticked by accident.
    for (var i = state.logs.length - 1; i >= 0; i--) {
      if (state.logs[i].taskId === id) { state.logs.splice(i, 1); break; }
    }
    return task;
  }

  function removeTask(state, id) { return removeFrom(state.tasks, id); }

  // ---------------------------------------------------------- parking lot
  // Ideas go here to be kept, not to be done. Nothing in the parking lot
  // counts towards anything.

  function addParking(state, text) {
    text = String(text || '').trim();
    if (!text) return null;
    var item = { id: uid('p'), text: text, createdAt: new Date().toISOString() };
    state.parking.unshift(item);
    return item;
  }

  function removeParking(state, id) { return removeFrom(state.parking, id); }

  function parkingToTask(state, id) {
    var item = removeParking(state, id);
    return item ? addTask(state, item.text) : null;
  }

  function parkingToMustMove(state, id, key) {
    var item = removeParking(state, id);
    return item ? addMustMove(state, key, item.text) : null;
  }

  // ------------------------------------------------------------------ logs

  function addLog(state, entry) {
    var e = entry || {};
    var type = logType(e.type);
    if (!type) return null;
    var sub = e.subtype || type.subtypes[0].id;
    var minutes = e.minutes === null || e.minutes === undefined || e.minutes === ''
      ? null : Math.max(0, Math.round(+e.minutes) || 0);
    var log = {
      id: uid('l'),
      at: new Date().toISOString(),
      date: e.date || todayISO(),
      type: type.id,
      subtype: sub,
      minutes: type.minutes ? minutes : null,
      note: String(e.note || '').trim()
    };
    if (e.taskId) log.taskId = e.taskId;
    state.logs.push(log);
    state.prefs.lastSubtype[type.id] = sub;
    return log;
  }

  function removeLog(state, id) { return removeFrom(state.logs, id); }

  function logsInWeek(state, key) {
    return state.logs.filter(function (l) { return isInWeek(l.date, key); })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.at < b.at ? 1 : -1;
      });
  }

  function logsOnDay(state, iso) {
    return state.logs.filter(function (l) { return l.date === iso; })
      .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }

  function defaultSubtype(state, typeId) {
    var t = logType(typeId);
    if (!t) return null;
    return state.prefs.lastSubtype[typeId] || t.subtypes[0].id;
  }

  // ----------------------------------------------------- starting a week
  // Opening a new week never loses last week's unfinished business: it is
  // offered, item by item, and the user ticks what still matters.

  function carryCandidates(state, key) {
    var from = prevWeekKey(key), prev = state.weeks[from];
    var out = { from: from, mustMove: [], tasks: [] };
    if (prev) {
      out.mustMove = prev.mustMove.filter(function (m) { return !m.done; })
        .map(function (m) { return { id: m.id, text: m.text }; });
    }
    out.tasks = state.tasks.filter(function (t) {
      return !t.doneAt && t.promotedWeek === from;
    }).map(function (t) { return { id: t.id, text: t.text }; });
    return out;
  }

  // ids is the subset the user kept; pass null to carry everything.
  function startWeek(state, key, ids) {
    var week = ensureWeek(state, key);
    var cand = carryCandidates(state, key);
    var keep = ids === null || ids === undefined
      ? null
      : {};
    if (keep) [].concat(ids).forEach(function (id) { keep[id] = true; });
    var moved = { mustMove: 0, tasks: 0 };

    cand.mustMove.forEach(function (m) {
      if (keep && !keep[m.id]) return;
      if (moveMustMoveToWeek(state, cand.from, m.id, key)) moved.mustMove++;
    });
    cand.tasks.forEach(function (t) {
      if (keep && !keep[t.id]) return;
      if (promoteTask(state, t.id, key)) moved.tasks++;
    });

    if (!week.startedAt) week.startedAt = new Date().toISOString();
    return moved;
  }

  // --------------------------------------------------------------- review

  function emptyTally() { return { count: 0, minutes: 0 }; }

  function tallyLogs(logs) {
    var out = { count: logs.length, byType: {}, bySubtype: {} };
    LOG_TYPES.forEach(function (t) {
      out.byType[t.id] = emptyTally();
      t.subtypes.forEach(function (s) { out.bySubtype[t.id + ':' + s.id] = emptyTally(); });
    });
    logs.forEach(function (l) {
      var t = out.byType[l.type], s = out.bySubtype[l.type + ':' + l.subtype];
      if (!t) { out.byType[l.type] = t = emptyTally(); }
      if (!s) { out.bySubtype[l.type + ':' + l.subtype] = s = emptyTally(); }
      t.count++; s.count++;
      if (l.minutes) { t.minutes += l.minutes; s.minutes += l.minutes; }
    });
    return out;
  }

  // Planned vs logged for one week. Nothing here is scored or judged — it is
  // a count next to a count.
  function weekSummary(state, key) {
    var week = state.weeks[key] || { key: key, mustMove: [], slots: [], startedAt: null },
        logs = logsInWeek(state, key),
        tally = tallyLogs(logs),
        tasks = promotedTasks(state, key);
    return {
      key: key,
      label: weekLabel(key),
      started: !!week.startedAt,
      mustMove: {
        total: week.mustMove.length,
        done: week.mustMove.filter(function (m) { return m.done; }).length
      },
      slots: {
        total: week.slots.length,
        attended: week.slots.filter(function (s) { return s.attended; }).length
      },
      tasks: {
        promoted: tasks.length,
        done: tasks.filter(function (t) { return !!t.doneAt; }).length
      },
      logs: tally,
      counts: weekCounts(week, tally)
    };
  }

  // The five or six numbers the review actually shows, in one shape so the
  // week row and the 4-week row can be drawn by the same code.
  function weekCounts(week, tally) {
    return {
      koreanSessions: tally.byType.korean.count,
      koreanMinutes: tally.byType.korean.minutes,
      appSessions: tally.byType.app.count,
      appMinutes: tally.byType.app.minutes,
      longRides: tally.bySubtype['movement:ride'].count,
      movementSessions: tally.byType.movement.count,
      plannedAttended: week.slots.filter(function (s) { return s.attended; }).length,
      spontaneousSocial: tally.byType.social.count - tally.bySubtype['social:dating-app'].count,
      datingDates: tally.bySubtype['social:dating-app'].count,
      adminDone: tally.byType.admin.count
    };
  }

  function addCounts(a, b) {
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = a[k] + b[k]; });
    return out;
  }

  // The rolling window ends with the week containing endKey and runs back n
  // weeks, oldest first.
  function rollingTotals(state, endKey, n) {
    n = n || 4;
    var weeks = [], key = endKey, i;
    for (i = 0; i < n; i++) { weeks.unshift(key); key = prevWeekKey(key); }
    var rows = weeks.map(function (k) {
      var week = state.weeks[k] || { mustMove: [], slots: [] };
      var counts = weekCounts(week, tallyLogs(logsInWeek(state, k)));
      return { key: k, label: weekLabel(k), counts: counts };
    });
    var totals = rows.reduce(function (acc, r) { return addCounts(acc, r.counts); },
                             weekCounts({ slots: [] }, tallyLogs([])));
    return { weeks: rows, totals: totals };
  }

  // ----------------------------------------------------------------- misc

  function minutesLabel(mins) {
    if (!mins) return '';
    if (mins < 60) return mins + 'm';
    var h = Math.floor(mins / 60), m = mins % 60;
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }

  return {
    VERSION: VERSION,
    MUST_MOVE_SUGGESTED: MUST_MOVE_SUGGESTED,
    LOG_TYPES: LOG_TYPES,
    SLOT_KINDS: SLOT_KINDS,
    MINUTE_CHIPS: MINUTE_CHIPS,

    parseISO: parseISO, isoOf: isoOf, todayISO: todayISO, addDays: addDays,
    mondayOf: mondayOf, weekKeyOf: weekKeyOf, nextWeekKey: nextWeekKey,
    prevWeekKey: prevWeekKey, weekDates: weekDates, isInWeek: isInWeek,
    dayName: dayName, dayLabel: dayLabel, shortDate: shortDate,
    weekLabel: weekLabel, weekRelation: weekRelation, minutesLabel: minutesLabel,

    uid: uid, emptyState: emptyState, migrate: migrate, ensureWeek: ensureWeek,
    weekExists: weekExists,

    logType: logType, subtypeLabel: subtypeLabel, defaultSubtype: defaultSubtype,

    addMustMove: addMustMove, toggleMustMove: toggleMustMove,
    removeMustMove: removeMustMove, moveMustMoveToWeek: moveMustMoveToWeek,

    addSlot: addSlot, sortedSlots: sortedSlots, toggleSlotAttended: toggleSlotAttended,
    removeSlot: removeSlot, moveSlotToWeek: moveSlotToWeek,

    addTask: addTask, promoteTask: promoteTask, unpromoteTask: unpromoteTask,
    promotedTasks: promotedTasks, openTasks: openTasks, completeTask: completeTask,
    reopenTask: reopenTask, removeTask: removeTask,

    addParking: addParking, removeParking: removeParking,
    parkingToTask: parkingToTask, parkingToMustMove: parkingToMustMove,

    addLog: addLog, removeLog: removeLog, logsInWeek: logsInWeek, logsOnDay: logsOnDay,

    carryCandidates: carryCandidates, startWeek: startWeek,
    weekSummary: weekSummary, rollingTotals: rollingTotals, tallyLogs: tallyLogs
  };
}));
