# WeekLock

A weekly planning and light-tracking page for one person. It holds a small
amount of structure around a week — a few things that must move, the slots that
put you around other people, a short life-admin list, and a parking lot for
everything else — and makes logging what actually happened take seconds.

No account, no server, no build step. Open `index.html` and it works.

```
open index.html                   # or drag it into a browser
python3 -m http.server 8000       # if you'd rather have a URL
```

On a phone, "Add to Home Screen" gives it an icon and a full-screen window.

## What it does

**Log** — the tab it opens on, because logging is the part that has to be
instant. Six categories: Korean, App session, Movement, Social, Life admin,
Note. Each one remembers the sub-type you used last, so the common case is two
taps: open the category, tap the minutes. `Did it` records a session with no
minutes when you don't know or don't care. Every entry can be removed, and the
toast after each one offers a straight undo. The `‹ ›` arrows log for an
earlier day.

**Plan** — one week at a time, opened whenever you feel like it, not on a
Sunday.

- *Must-move this week* — the hint says three is usually enough; nothing stops
  you adding more, and nothing scolds you if they don't get done. Any item can
  be ticked, moved to next week, or removed.
- *Scheduled slots* — church, study groups, body doubling, meetups: name, kind,
  day, time, and a Korean-practice note. Attendance is a tick, and a slot that
  got cancelled just stays unticked. Groups are inconsistent; the plan doesn't
  have to be.
- *Life admin* — a backlog that lives outside any week. Pull one or two into
  the week when they're worth doing; the rest sits there quietly. Ticking one
  writes a log entry, so life admin shows up in the review with everything else.
- *Parking lot* — ideas kept on purpose without becoming plans. Nothing here
  counts towards anything. An item can be promoted to a must-move or a task
  later, or just live there.

Opening a week you haven't started asks once whether to bring last week's loose
ends forward, with everything ticked and any of it easy to untick. That is the
whole "weekly planning session" — it takes about a minute, and skipping it costs
nothing.

**Review** — plain numbers, no charts. This week's plan next to what was
logged, then a four-week table: Korean sessions, app sessions, longer rides,
slots attended, spontaneous/organic social, dating-app dates, life admin. The
last two sit side by side on purpose.

**Data** — everything lives in this browser's `localStorage` under one key.
Export writes a dated JSON file; import replaces what's there. Clearing site
data deletes everything, which is the one real risk of a local-first app, so
export now and then.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole page: three views and a tab bar. |
| `core.js` | Dates, state, and the arithmetic behind the review. Pure — no DOM, no storage. Sets `window.WeekLock`, and `require()`s cleanly in node. |
| `store.js` | `localStorage` load/save, export/import. Sets `window.WeekLockStore`. |
| `app.js` | The UI. Plain DOM, no framework. Every change goes through `core.js`, then saves, then re-renders. |
| `styles.css` | One accent colour, big tap targets, light and dark. |
| `tests/` | Plain node tests. |

Three `<script>` tags in order, no modules — so the page works over `file://`
as well as over http, with nothing installed.

## Tests

```bash
node tests/core_test.js     # dates, carrying forward, the review totals
node tests/store_test.js    # the localStorage layer, against a fake window
```

Both exit non-zero on failure, and need nothing installed — plain node, no
framework.

## Deliberately not here

Calendar sync, notifications, streaks, scores, charts, AI suggestions, accounts,
sharing. Each one is a reason to stop using the thing.
