/**
 * Tests for "Remove an upload" — the control that undoes one day's uploading.
 *
 *   node web/upload-day-test.mjs web/index.html
 *
 * This is the most dangerous button on the portal. "Remove a month" clears one figure
 * for one month and names both; this one spans every month and all three collections at
 * once, and what it deletes is decided by arithmetic on a timestamp rather than by
 * anything an admin can see on the tab.
 *
 * So the parts that decide WHAT GOES are pure, and they are tested here:
 *
 *   uploadDayRange        where the day starts and ends, in SAST and not in the
 *                         browser's timezone
 *   summariseUploadBatch  the counts that go into the confirmation, which must not
 *                         undercount what is about to be deleted
 *   uploadFieldsMissing   that every figure the portal can upload is one this control
 *                         knows the name of
 */
import { loadPortal } from './portal-harness.mjs';

const portal = await loadPortal(process.argv[2] ?? 'web/index.html', [
  'uploadDayRange', 'summariseUploadBatch', 'uploadBatchMarkup',
  'uploadFieldsMissing', 'UPLOAD_FIELDS', 'uploadHasFigure',
  'uploadAreaLabel', 'UPLOAD_AREAS'
]);

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`
    + (ok ? '' : `  — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

/* ---------------- the day boundary ---------------- */

const sat = portal.uploadDayRange('2026-10-24');
// 2026-10-24 00:00 SAST is 2026-10-23 22:00 UTC. Written as an instant rather than as a
// number so the expectation says what it means.
check('a SAST day starts at 00:00+02:00',
  new Date(sat.start).toISOString(), '2026-10-23T22:00:00.000Z');
check('and runs exactly 24 hours', sat.end - sat.start, 24 * 60 * 60 * 1000);
check('so it ends as the next day begins',
  sat.end, portal.uploadDayRange('2026-10-25').start);

check('a day in the southern summer is the same length — SAST has no daylight saving',
  portal.uploadDayRange('2026-01-15').end - portal.uploadDayRange('2026-01-15').start,
  24 * 60 * 60 * 1000);

check('rubbish is refused', portal.uploadDayRange('24 October'), null);
check('an empty box is refused', portal.uploadDayRange(''), null);
check('undefined is refused', portal.uploadDayRange(undefined), null);
check('a half-written date is refused', portal.uploadDayRange('2026-10'), null);

/* AN UPLOAD AT EIGHT IN THE MORNING IN JOHANNESBURG belongs to that morning. Read on the
   browser's clock from London it would fall on the day before, and the admin would clear
   a day that looks empty while the real batch sat under the next date. */
const eightAm = Date.parse('2026-10-24T08:00:00+02:00');
check('08:00 in Johannesburg falls inside that day',
  eightAm >= sat.start && eightAm < sat.end, true);
const justBefore = Date.parse('2026-10-23T23:59:59+02:00');
check('a minute before midnight belongs to the day before',
  justBefore >= sat.start, false);
const justAfter = Date.parse('2026-10-24T23:59:59+02:00');
check('a minute before the next midnight is still that day',
  justAfter >= sat.start && justAfter < sat.end, true);

/* ---------------- what the confirmation counts ---------------- */

// Shaped like the real thing: FY loaded across two months, one month also carrying a
// payable, and a pay row in the same batch.
const found = {
  perfTeams: [],
  perfMonthly: [
    { _id: '1_2026-09', month: '2026-09', commissionRands: 2880, basicSalaryRands: 3720 },
    { _id: '2_2026-09', month: '2026-09', basicSalaryRands: 3100 }
  ],
  perfFy: [
    { _id: '1_2026-01_MTN', month: '2026-01', fyStock: 100, fyConnections: 40 },
    { _id: '2_2026-01_MTN', month: '2026-01', fyConnections: 0 },
    { _id: '1_2026-02_MTN', month: '2026-02', fyConnections: 12, fyAmountRands: 550 }
  ]
};
const summary = portal.summariseUploadBatch(found);

check('every row in the batch is counted', summary.documents, 5);
check('one line per collection per month', summary.lines.length, 3);

const fyJan = summary.lines.find(l => l.collection === 'perfFy' && l.month === '2026-01');
check('a month names its figures and their counts', fyJan.figures,
  [{ label: 'FY stock', count: 1 }, { label: 'FY connections', count: 2 }]);
check('and its row count', fyJan.rows, 2);

/* A ZERO IS A FIGURE. "Sold none" is a result somebody uploaded on purpose, and a
   confirmation that skipped it would promise to delete fewer rows than it deletes. */
check('zero counts as a figure',
  fyJan.figures.find(f => f.label === 'FY connections').count, 2);
check('and uploadHasFigure says so', portal.uploadHasFigure({ fyConnections: 0 }, 'fyConnections'), true);
check('while an absent field is not a figure', portal.uploadHasFigure({}, 'fyConnections'), false);
check('nor is a blank one', portal.uploadHasFigure({ fyConnections: '' }, 'fyConnections'), false);
check('nor is null', portal.uploadHasFigure({ fyConnections: null }, 'fyConnections'), false);

const pay = summary.lines.find(l => l.collection === 'perfMonthly');
check('a figure missing from some rows is counted only where it is', pay.figures,
  [{ label: 'Commission', count: 1 }, { label: 'Basic salary', count: 2 }]);

check('a figure nothing carries is not listed',
  summary.lines.find(l => l.month === '2026-02').figures,
  [{ label: 'FY connections', count: 1 }, { label: 'FY payable', count: 1 }]);

check('an empty day summarises to nothing',
  portal.summariseUploadBatch({ perfTeams: [], perfMonthly: [], perfFy: [] }).documents, 0);
check('a collection the query never reached is not an error',
  portal.summariseUploadBatch({}).documents, 0);

/* ---------------- the listing an admin reads before confirming ---------------- */

const markup = portal.uploadBatchMarkup('2026-10-24', summary);
check('the listing names the day', markup.includes('2026-10-24'), true);
check('and the total it is about to delete', markup.includes('<b>5 row(s)</b>'), true);
check('and names the figures in words', markup.includes('FY connections 2'), true);
check('an empty day says so plainly',
  portal.uploadBatchMarkup('2026-10-24', portal.summariseUploadBatch({})),
  '<span class="meta">Nothing was uploaded on 2026-10-24.</span>');

/* ---------------- nothing uploadable is unnamed ---------------- */

/* THE DRIFT THIS CATCHES: a sixth figure added to PERF_UPLOADS and not to UPLOAD_FIELDS
   would be deleted by this button without ever being named in the confirmation — the
   admin agrees to four figures and loses five. */
check('every figure PERF_UPLOADS can upload is one this control names',
  portal.uploadFieldsMissing(), []);

check('the three performance collections are all covered',
  Object.keys(portal.UPLOAD_FIELDS).sort(), ['perfFy', 'perfMonthly', 'perfTeams']);

/* ---------------- choosing which areas go ---------------- */

/* THE 23rd OF OCTOBER carried the team figures AND the pay, and only the pay was a
   dummy file. A control that could only take the whole day would have taken ten months
   of real team figures with it. */
check('the three areas are the three collections',
  Object.keys(portal.UPLOAD_AREAS).sort(), ['perfFy', 'perfMonthly', 'perfTeams']);
check('one area reads as itself', portal.uploadAreaLabel(['perfMonthly']), 'pay');
check('two are joined with and',
  portal.uploadAreaLabel(['perfTeams', 'perfMonthly']), 'team figures and pay');
check('three are comma then and',
  portal.uploadAreaLabel(['perfTeams', 'perfMonthly', 'perfFy']),
  'team figures, pay and FY');
check('none says so rather than reading as an empty sentence',
  portal.uploadAreaLabel([]), 'nothing');
check('an area the map does not know is dropped, not printed as undefined',
  portal.uploadAreaLabel(['perfMonthly', 'nonsense']), 'pay');

/* The summary already copes with a collection that was never queried — that is what a
   narrowed selection produces, so it is the same path as an empty day. */
check('a narrowed selection summarises only what it asked for',
  portal.summariseUploadBatch({ perfMonthly: found.perfMonthly }).documents, 2);

console.log(failures === 0
  ? '\nUPLOAD DAY TESTS OK'
  : `\nUPLOAD DAY TESTS FAILED — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
