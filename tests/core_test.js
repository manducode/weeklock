// node weeklock/tests/core_test.js — the arithmetic behind WeekLock.
//
// Plain node, no framework, exits non-zero on failure. What is worth testing
// here is the stuff that silently produces a wrong number weeks later: week
// boundaries, carrying items forward, and the rolling totals the review shows.
var W = require('../core.js');

var pass = 0, fail = 0;
function is(got, want, label) {
  if (got === want) { pass++; return; }
  fail++;
  console.log('  FAIL ' + label + '\n       got  ' + JSON.stringify(got) +
              '\n       want ' + JSON.stringify(want));
}
function ok(cond, label) { is(!!cond, true, label); }

// ------------------------------------------------------------------ dates
// 2026-09-07 is a Monday; 2026-09-13 the Sunday that closes that week.
console.log('dates and week keys');
is(W.mondayOf('2026-09-07'), '2026-09-07', 'Monday is its own Monday');
is(W.mondayOf('2026-09-08'), '2026-09-07', 'Tuesday belongs to the Monday before');
is(W.mondayOf('2026-09-13'), '2026-09-07', 'Sunday belongs to the Monday before, not the one after');
is(W.mondayOf('2026-09-14'), '2026-09-14', 'the next Monday starts a new week');
is(W.addDays('2026-09-30', 1), '2026-10-01', 'crossing a month');
is(W.addDays('2026-12-31', 1), '2027-01-01', 'crossing a year');
is(W.addDays('2028-02-28', 1), '2028-02-29', 'a leap day is a real day');
is(W.nextWeekKey('2026-09-07'), '2026-09-14', 'next week');
is(W.prevWeekKey('2026-09-07'), '2026-08-31', 'previous week');
is(W.weekDates('2026-09-07').length, 7, 'a week has seven days');
is(W.weekDates('2026-09-07')[6], '2026-09-13', 'and ends on Sunday');
is(W.dayName('2026-09-13'), 'Sun', 'Sunday is named Sunday, not shifted');
is(W.dayName('2026-09-07'), 'Mon', 'and Monday Monday');
ok(W.isInWeek('2026-09-07', '2026-09-07'), 'the Monday is in the week');
ok(W.isInWeek('2026-09-13', '2026-09-07'), 'the Sunday is in the week');
ok(!W.isInWeek('2026-09-14', '2026-09-07'), 'the next Monday is not');
ok(!W.isInWeek('2026-09-06', '2026-09-07'), 'nor the day before');
is(W.weekRelation('2026-09-07', '2026-09-09'), 'This week', 'this week');
is(W.weekRelation('2026-09-14', '2026-09-09'), 'Next week', 'next week');
is(W.weekRelation('2026-08-31', '2026-09-09'), 'Last week', 'last week');
is(W.weekRelation('2026-08-17', '2026-09-09'), '3 weeks ago', 'three weeks back');
is(W.minutesLabel(45), '45m', 'minutes under an hour');
is(W.minutesLabel(60), '1h', 'a round hour');
is(W.minutesLabel(95), '1h 35m', 'an hour and change');
is(W.minutesLabel(0), '', 'no minutes reads as nothing, not "0m"');

// ---------------------------------------------------------------- migrate
console.log('\nreading back whatever is in storage');
var junk = W.migrate(null);
is(junk.logs.length, 0, 'null gives an empty state');
is(Object.keys(junk.weeks).length, 0, 'with no weeks');
var partial = W.migrate({ weeks: { '2026-09-07': { mustMove: [{ id: 'a', text: 'x', done: true }] } },
                          logs: [{ id: 'l1', type: 'korean', subtype: 'solo', date: '2026-09-08', minutes: 30 }] });
is(partial.weeks['2026-09-07'].mustMove.length, 1, 'a half-written week keeps its items');
is(partial.weeks['2026-09-07'].slots.length, 0, 'and gains the fields it was missing');
is(partial.logs.length, 1, 'logs survive');
is(partial.tasks.length, 0, 'a missing task list is empty, not undefined');
ok(partial.prefs && partial.prefs.lastSubtype, 'prefs are always there');

// --------------------------------------------------------------- planning
console.log('\nthe plan: must-move, slots, tasks, parking');
var s = W.emptyState(), wk = '2026-09-07', next = '2026-09-14';

var m1 = W.addMustMove(s, wk, 'Ship the Korean drill screen');
var m2 = W.addMustMove(s, wk, '  Book the bike service  ');
is(s.weeks[wk].mustMove.length, 2, 'two must-moves');
is(m2.text, 'Book the bike service', 'text is trimmed');
is(W.addMustMove(s, wk, '   '), null, 'blank text adds nothing');
W.toggleMustMove(s, wk, m1.id);
ok(s.weeks[wk].mustMove[0].done, 'ticking marks it done');
W.moveMustMoveToWeek(s, wk, m2.id, next);
is(s.weeks[wk].mustMove.length, 1, 'moving takes it out of this week');
is(s.weeks[next].mustMove[0].text, 'Book the bike service', 'and puts it in the next');
ok(s.weeks[next].mustMove[0].carried, 'marked as carried, not as failed');
ok(!s.weeks[next].mustMove[0].done, 'and unticked');

var slot = W.addSlot(s, wk, { name: 'FIA Church', kind: 'Church', date: '2026-09-13',
                              time: '11:00', koreanNote: 'sermon in Korean' });
ok(slot, 'a slot with a name is added');
is(W.addSlot(s, wk, { name: '' }), null, 'a slot without a name is not');
is(W.addSlot(s, wk, { name: 'Study group', date: '2026-10-01' }).date, wk,
   'a date outside the week falls back to the Monday');
is(W.sortedSlots(s.weeks[wk])[0].name, 'Study group', 'slots sort by day then time');
W.toggleSlotAttended(s, wk, slot.id);
ok(s.weeks[wk].slots[0].attended, 'attendance ticks');
W.moveSlotToWeek(s, wk, slot.id, next);
is(s.weeks[next].slots[0].date, '2026-09-20', 'a Sunday slot moves to the next Sunday');
ok(!s.weeks[next].slots[0].attended, 'and arrives unattended');

var t1 = W.addTask(s, 'Bike brake pads');
var t2 = W.addTask(s, 'Try the café on Yeonmujang-gil');
W.promoteTask(s, t1.id, wk);
is(W.promotedTasks(s, wk).length, 1, 'one task pulled into the week');
is(W.openTasks(s).length, 2, 'both are still open');
W.completeTask(s, t1.id, '2026-09-09');
ok(t1.doneAt, 'completing stamps the task');
is(W.openTasks(s).length, 1, 'and takes it off the open list');
is(s.logs.filter(function (l) { return l.type === 'admin'; }).length, 1,
   'completing a task writes a log line, so life admin shows up in the review');
W.reopenTask(s, t1.id);
is(s.logs.filter(function (l) { return l.type === 'admin'; }).length, 0,
   'reopening removes that line again — an accidental tick costs nothing');
ok(!t1.doneAt, 'and clears the stamp');
W.completeTask(s, t1.id, '2026-09-09');

var p = W.addParking(s, 'A tiny app that times my rides');
is(s.parking.length, 1, 'parked');
W.parkingToTask(s, p.id);
is(s.parking.length, 0, 'promoting empties it out of the lot');
is(W.openTasks(s).length, 2, 'and it becomes a task');
var p2 = W.addParking(s, 'Learn to make kimchi');
W.parkingToMustMove(s, p2.id, wk);
is(s.weeks[wk].mustMove.length, 2, 'or a must-move');

// ------------------------------------------------------------------- logs
console.log('\nlogging');
var l1 = W.addLog(s, { type: 'korean', subtype: 'church', date: '2026-09-13', minutes: '90' });
is(l1.minutes, 90, 'minutes given as a string are stored as a number');
is(s.prefs.lastSubtype.korean, 'church', 'the last subtype is remembered for next time');
is(W.addLog(s, { type: 'korean', date: '2026-09-08' }).subtype, 'solo',
   'no subtype falls back to the first one');
is(W.addLog(s, { type: 'social', subtype: 'friend', date: '2026-09-08', minutes: 60 }).minutes, null,
   'a type that does not measure time ignores minutes');
is(W.addLog(s, { type: 'nonsense' }), null, 'an unknown type logs nothing');
is(W.addLog(s, { type: 'korean', date: '2026-09-08', minutes: -5 }).minutes, 0,
   'negative minutes clamp to zero rather than subtracting');
var stray = W.addLog(s, { type: 'app', subtype: 'work', date: '2026-09-06', minutes: 30 });
is(W.logsInWeek(s, wk).filter(function (l) { return l.id === stray.id; }).length, 0,
   'a log from the Sunday before is not in this week');
is(W.logsOnDay(s, '2026-09-08').length, 3, 'three entries on the Tuesday');
W.removeLog(s, stray.id);
is(s.logs.filter(function (l) { return l.id === stray.id; }).length, 0, 'undo removes the entry');

// ------------------------------------------------------- starting a week
console.log('\nstarting a week carries the loose ends');
var s2 = W.emptyState();
var keepMe = W.addMustMove(s2, wk, 'Keep this one');
var dropMe = W.addMustMove(s2, wk, 'Let this one go');
var doneOne = W.addMustMove(s2, wk, 'Already done');
W.toggleMustMove(s2, wk, doneOne.id);
var carryTask = W.addTask(s2, 'Still needs doing');
var doneTask = W.addTask(s2, 'Handled');
W.promoteTask(s2, carryTask.id, wk);
W.promoteTask(s2, doneTask.id, wk);
W.completeTask(s2, doneTask.id, '2026-09-10');

var cand = W.carryCandidates(s2, next);
is(cand.from, wk, 'candidates come from the week before');
is(cand.mustMove.length, 2, 'only the unfinished must-moves are offered');
is(cand.tasks.length, 1, 'and only the tasks still open');

var moved = W.startWeek(s2, next, [keepMe.id, carryTask.id]);
is(moved.mustMove, 1, 'one must-move carried');
is(moved.tasks, 1, 'one task carried');
is(s2.weeks[next].mustMove.length, 1, 'the new week has just what was kept');
is(s2.weeks[next].mustMove[0].text, 'Keep this one', 'the right one');
is(s2.weeks[wk].mustMove.length, 2, 'the dropped one stays where it was, not deleted');
is(carryTask.promotedWeek, next, 'the task follows into the new week');
ok(s2.weeks[next].startedAt, 'the week is marked as started, so it stops asking');
is(W.startWeek(s2, next, []).mustMove, 0, 'refreshing and keeping nothing carries nothing');
is(W.startWeek(s2, next, null).mustMove, 1,
   'but a later refresh can still pull the rest forward — a week can be reopened');
is(s2.weeks[wk].mustMove.length, 1, 'leaving only the finished item behind');
is(W.carryCandidates(s2, '2026-09-21').mustMove.length, 2,
   'and the week after is offered both of the ones still unticked');

// ---------------------------------------------------------------- review
console.log('\nthe review counts what happened, and nothing else');
var s3 = W.emptyState();
W.addSlot(s3, wk, { name: 'FIA Church', date: '2026-09-13' });
W.addSlot(s3, wk, { name: 'Study group', date: '2026-09-09' });
var missed = W.addSlot(s3, wk, { name: 'Meetup that got cancelled', date: '2026-09-10' });
W.toggleSlotAttended(s3, wk, s3.weeks[wk].slots[0].id);
W.toggleSlotAttended(s3, wk, s3.weeks[wk].slots[1].id);
var mm = W.addMustMove(s3, wk, 'Ship it');
W.addMustMove(s3, wk, 'Not this week after all');
W.toggleMustMove(s3, wk, mm.id);
var task = W.addTask(s3, 'Bike service');
W.promoteTask(s3, task.id, wk);
W.completeTask(s3, task.id, '2026-09-09');

[['korean', 'church', 90, '2026-09-13'],
 ['korean', 'solo', 25, '2026-09-08'],
 ['korean', 'meetup', 60, '2026-09-11'],
 ['app', 'work', 45, '2026-09-08'],
 ['app', 'language', 30, '2026-09-10'],
 ['movement', 'commute', 15, '2026-09-08'],
 ['movement', 'ride', 70, '2026-09-12'],
 ['movement', 'ride', 80, '2026-09-13'],
 ['social', 'spontaneous', null, '2026-09-11'],
 ['social', 'organic', null, '2026-09-12'],
 ['social', 'dating-app', null, '2026-09-09'],
 ['checkin', 'morning', null, '2026-09-08']
].forEach(function (r) {
  W.addLog(s3, { type: r[0], subtype: r[1], minutes: r[2], date: r[3] });
});

var sum = W.weekSummary(s3, wk);
is(sum.mustMove.done + '/' + sum.mustMove.total, '1/2', 'must-move: one of two');
is(sum.slots.attended + '/' + sum.slots.total, '2/3', 'slots: two of three attended');
is(sum.tasks.done + '/' + sum.tasks.promoted, '1/1', 'the promoted task was done');
is(sum.counts.koreanSessions, 3, 'three Korean sessions');
is(sum.counts.koreanMinutes, 175, 'and 175 minutes of them');
is(sum.counts.appSessions, 2, 'two app sessions');
is(sum.counts.appMinutes, 75, 'and 75 minutes');
is(sum.counts.movementSessions, 3, 'three movement entries');
is(sum.counts.longRides, 2, 'two of them longer rides');
is(sum.counts.spontaneousSocial, 2, 'two organic/spontaneous social entries');
is(sum.counts.datingDates, 1, 'the dating-app date is counted apart from them');
is(sum.counts.adminDone, 1, 'one life-admin task logged');
is(sum.counts.plannedAttended, 2, 'planned events attended');
ok(missed, 'the cancelled meetup stays on the plan and simply is not attended');

var empty = W.weekSummary(s3, '2026-06-01');
is(empty.counts.koreanSessions, 0, 'a week that never happened reads as zeros, not an error');
is(empty.slots.total, 0, 'with no slots');

console.log('\nrolling four weeks');
W.addLog(s3, { type: 'korean', subtype: 'solo', minutes: 20, date: '2026-08-25' }); // week of Aug 24
W.addLog(s3, { type: 'korean', subtype: 'solo', minutes: 20, date: '2026-08-31' }); // week of Aug 31
var roll = W.rollingTotals(s3, wk, 4);
is(roll.weeks.length, 4, 'four weeks');
is(roll.weeks[3].key, wk, 'ending with the week asked for');
is(roll.weeks[0].key, '2026-08-17', 'and starting three weeks before it');
is(roll.weeks[3].counts.koreanSessions, 3, 'the current week keeps its three');
is(roll.weeks[2].counts.koreanSessions, 1, 'the week before had one');
is(roll.weeks[0].counts.koreanSessions, 0, 'the oldest week had none');
is(roll.totals.koreanSessions, 5, 'five Korean sessions across the window');
is(roll.totals.koreanMinutes, 215, 'and 215 minutes');
is(roll.totals.datingDates, 1, 'one dating-app date in four weeks');
is(roll.totals.longRides, 2, 'two longer rides');
is(roll.totals.plannedAttended, 2, 'two planned events attended');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
