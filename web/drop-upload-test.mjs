/**
 * Tests for the one-box uploader — the thing that decides which upload a file IS.
 *
 *   node web/drop-upload-test.mjs web/index.html
 *
 * Getting this wrong is the exact fault the portal already learned the hard way: these
 * files are all the same shape and the parser takes the figure by POSITION, so a stock
 * file routed to connections is accepted in silence and a month of connections is
 * replaced by a month of stock. That happened to September, and it was only caught
 * because the numbers looked suspiciously round.
 *
 * So detection is tested against the REAL template files rather than invented headers.
 * If a template's columns change, this fails rather than the routing going quietly
 * wrong.
 */
import { readFileSync } from 'fs';
import { loadPortal } from './portal-harness.mjs';

const portal = await loadPortal(process.argv[2] ?? 'web/index.html', [
  'detectUploadKind', 'droppableKinds', 'droppedRowCount', 'PERF_UPLOADS'
]);

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`
    + (ok ? '' : `  — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

console.log('boxes available: ' + portal.droppableKinds().join(', ') + '\n');

/* ---------------- every real template lands in its own box ---------------- */

const TEMPLATES = [
  ['performance-stock-template.csv', 'stock'],
  ['performance-connections-template.csv', 'connections'],
  ['performance-activations-template.csv', 'activations'],
  ['performance-commission-template.csv', 'commission'],
  ['performance-basic-template.csv', 'basic'],
  ['performance-fy-stock-template.csv', 'fyStock'],
  ['performance-fy-connections-template.csv', 'fyConnections'],
  ['performance-fy-payable-template.csv', 'fyPayable']
];

for (const [file, want] of TEMPLATES) {
  const text = readFileSync(file, 'utf8');
  const got = portal.detectUploadKind(text);
  check(`${file} goes to ${want}`, got.kind, want);
}

/* THE NARROW FILE MUST BEAT THE WIDE ONE. An FY-stock file shares both its headings
   with the full FY upload; on raw matches the wide one wins and four figures go missing
   without a word. */
const fyStock = readFileSync('performance-fy-stock-template.csv', 'utf8');
check('an FY stock file is not mistaken for a full FY upload',
  portal.detectUploadKind(fyStock).kind, 'fyStock');

/* ---------------- a file it cannot place says so ---------------- */

check('an empty file is refused, not guessed',
  portal.detectUploadKind('').kind, '');
check('and says why', portal.detectUploadKind('').why, 'the file is empty');

const unknown = 'Employee number,Month,Biscuits\nT042,2026-08,12';
check('a heading naming no known figure is not routed',
  portal.detectUploadKind(unknown).kind, '');
check('and says what it could not find',
  portal.detectUploadKind(unknown).why,
  'nothing in the heading row names a figure this portal knows');

/* A HEADING CARRYING TWO FIGURES is a real ambiguity, and guessing one would put half
   the file somewhere nobody looked. */
const both = 'Team name,Month,Network,Stock,Connections\nSOWETO,2026-08,MTN,100,40';
const ambiguous = portal.detectUploadKind(both);
check('a file claiming two figures is not routed', ambiguous.kind, '');
check('and names the candidates',
  /could be/.test(ambiguous.why) && /Stock/.test(ambiguous.why)
    && /Connections/.test(ambiguous.why), true);

/* ---------------- delimiters and tidiness ---------------- */

check('a semicolon file is read the same way',
  portal.detectUploadKind('Team name;Month;Network;Stock\nSOWETO;2026-08;MTN;100').kind,
  'stock');
check('a tab-separated paste out of Excel is read the same way',
  portal.detectUploadKind('Team name\tMonth\tNetwork\tStock\nSOWETO\t2026-08\tMTN\t100').kind,
  'stock');
check('case and punctuation in the heading do not matter',
  portal.detectUploadKind('Team name,Month,Network,  STOCK  \nSOWETO,2026-08,MTN,100').kind,
  'stock');
check('a blank line above the heading is skipped',
  portal.detectUploadKind('\n\nTeam name,Month,Network,Stock\nSOWETO,2026-08,MTN,100').kind,
  'stock');

/* ---------------- the row count shown beside each file ---------------- */

check('the heading is not counted as a row',
  portal.droppedRowCount('Team name,Month,Network,Stock\na,b,c,1\nd,e,f,2'), 2);
check('trailing blank lines are not rows',
  portal.droppedRowCount('head\na,1\n\n\n'), 1);
check('a heading on its own is no rows, not minus one',
  portal.droppedRowCount('head'), 0);
check('nothing at all is no rows', portal.droppedRowCount(''), 0);

console.log(failures === 0
  ? '\nDROP UPLOAD TESTS OK'
  : `\nDROP UPLOAD TESTS FAILED — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
