/**
 * The Notes tab: what it shows, and what it must never do.
 *
 *   node web/notes-test.mjs web/index.html
 *
 * A note is a record both the rep and the office rely on, so the things worth holding
 * are not about layout:
 *
 *   it is shown as written        line breaks kept, nothing re-wrapped into a paragraph
 *   it cannot be edited here      no write of any kind against the notes collection
 *   the old name sticks           a note keeps the team its writer had that day
 */
import { readFileSync } from 'fs';
import { loadPortal, writes, setValue } from './portal-harness.mjs';

const portal = await loadPortal(process.argv[2] ?? 'web/index.html', [
  'allNotes', 'visibleNotes', 'renderNotes', 'noteFilters', 'noteStamp',
  'noteExportRows', 'data'
]);

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`
    + (ok ? '' : `  — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

// 09:35 and 14:10 SAST on 14 September 2026, and one the month before.
const T0935 = Date.parse('2026-09-14T09:35:00+02:00');
const T1410 = Date.parse('2026-09-14T14:10:00+02:00');
const T_AUG = Date.parse('2026-08-03T08:00:00+02:00');

portal.data.notes = [
  { id: 'u1_2', uid: 'u1', employeeName: 'Zanele Buthelezi', employeeNumber: 'T042',
    team: 'Midrand', province: 'Gauteng', writtenOn: '2026-09-14', writtenAtMillis: T1410,
    text: 'Second note of the day.' },
  { id: 'u1_1', uid: 'u1', employeeName: 'Zanele Buthelezi', employeeNumber: 'T042',
    team: 'Midrand', province: 'Gauteng', writtenOn: '2026-09-14', writtenAtMillis: T0935,
    text: 'Spoke to the office.\n\n- new stock Monday\n- leave approved' },
  { id: 'u2_1', uid: 'u2', employeeName: 'Sipho Dlamini', employeeNumber: 'T099',
    team: 'Mthatha', province: 'Eastern Cape', writtenOn: '2026-08-03', writtenAtMillis: T_AUG,
    text: 'Vehicle making a noise, booked it in.' }
];

/* ---------------- order ---------------- */

check('newest first', portal.allNotes().map(n => n.id), ['u1_2', 'u1_1', 'u2_1']);
/* TWO NOTES ON ONE AFTERNOON stay in the order they happened — sorted on the
   millisecond, not the day, or the morning's note would float above the afternoon's
   depending on which came back from Firestore first. */
check('and two on one day are in the order they were written',
  portal.allNotes().filter(n => n.writtenOn === '2026-09-14').map(n => n.millis),
  [T1410, T0935]);

/* ---------------- filters ---------------- */

const reset = () => Object.assign(portal.noteFilters,
  { province: '', team: '', from: '', to: '', query: '' });

reset();
check('everything, unfiltered', portal.visibleNotes().length, 3);

reset(); portal.noteFilters.province = 'Eastern Cape';
check('by province', portal.visibleNotes().map(n => n.id), ['u2_1']);

reset(); portal.noteFilters.team = 'Midrand';
check('by team', portal.visibleNotes().length, 2);

/* BOTH ENDS INCLUSIVE. Somebody asking for the 3rd to the 14th means those days. */
reset(); portal.noteFilters.from = '2026-08-03'; portal.noteFilters.to = '2026-08-03';
check('a single-day range includes that day', portal.visibleNotes().map(n => n.id), ['u2_1']);
reset(); portal.noteFilters.from = '2026-09-01';
check('from a date leaves the later ones', portal.visibleNotes().length, 2);
reset(); portal.noteFilters.to = '2026-08-31';
check('up to a date leaves the earlier ones', portal.visibleNotes().map(n => n.id), ['u2_1']);

/* THE SEARCH READS THE NOTE ITSELF. "what did we say about the vehicle" is the question
   somebody actually arrives with, and a search over names only cannot answer it. */
reset(); portal.noteFilters.query = 'noise';
check('the search reads the words of the note', portal.visibleNotes().map(n => n.id), ['u2_1']);
reset(); portal.noteFilters.query = 'zanele';
check('and the name, whatever the case', portal.visibleNotes().length, 2);
reset(); portal.noteFilters.query = 'T099';
check('and the employee number', portal.visibleNotes().map(n => n.id), ['u2_1']);

/* ---------------- how it is shown ---------------- */

reset();
portal.renderNotes();
const drawn = writes()['noteRows'] || '';

/* SHOWN AS WRITTEN. A note typed as three points must not come back as one paragraph:
   the cell is pre-wrap and the text is never collapsed. */
check('the line breaks the writer typed survive to the table',
  drawn.includes('- new stock Monday\n- leave approved'), true);
check('and the cell is set to keep them', drawn.includes('class="note-text"'), true);

check('the time of day is shown, not just the date', /09:35/.test(drawn), true);
check('and in SAST rather than UTC', /07:35/.test(drawn), false);

check('who wrote it', drawn.includes('Zanele Buthelezi'), true);
/* THE TEAM ON THE NOTE, not the writer's current one. data.employees deliberately says
   Zanele is somewhere else now; the note still reads Midrand, because that is where she
   was when she wrote it and that is part of what is being traced back. */
portal.data.employees = [{ id: 'u1', name: 'Zanele', surname: 'Buthelezi',
  teamName: 'Polokwane', province: 'Limpopo' }];
portal.renderNotes();
const afterMove = writes()['noteRows'] || '';
check('the note keeps the team its writer had that day',
  afterMove.includes('Midrand'), true);
check('and is not relabelled with where they are now',
  afterMove.includes('Polokwane'), false);

const showing = writes()['noteShowing'] || '';
check('the count says how many of how many', showing.includes('3 of 3'), true);

portal.data.notes = [];
portal.renderNotes();
check('no notes at all says so rather than showing an empty table',
  (writes()['noteShowing'] || '').includes('No notes'), true);

/* ---------------- the export ---------------- */

portal.data.notes = [
  { id: 'u2_1', uid: 'u2', employeeName: 'Sipho Dlamini', employeeNumber: 'T099',
    team: 'Mthatha', province: 'Eastern Cape', writtenOn: '2026-08-03',
    writtenAtMillis: T_AUG, text: 'Vehicle making a noise, booked it in.' }
];
reset();
const csv = portal.noteExportRows();
check('the export is headed', csv[0],
  ['When', 'Employee', 'Employee number', 'Team', 'Province', 'Note']);
check('and carries the note text itself', csv[1][5], 'Vehicle making a noise, booked it in.');
check('and one row per note', csv.length, 2);

/* ---------------- it is read-only, and must stay that way ---------------- */

/* THE ONE THING THIS TAB MUST NEVER DO. The rules refuse an update to a note from
   anybody, the admin included — a record both sides rely on is worth nothing if either
   can quietly edit it. This fails if a write against notes is ever added here. */
const src = readFileSync(process.argv[2] ?? 'web/index.html', 'utf8');
const portalWritesNotes = [
  /setDoc\(\s*doc\(\s*db\s*,\s*['"]notes['"]/,
  /updateDoc\(\s*doc\(\s*db\s*,\s*['"]notes['"]/,
  /deleteDoc\(\s*doc\(\s*db\s*,\s*['"]notes['"]/,
  /addDoc\(\s*collection\(\s*db\s*,\s*['"]notes['"]/
].some(rx => rx.test(src));
check('the portal never writes to a note', portalWritesNotes, false);

const rules = readFileSync('firestore.rules', 'utf8');
const notesRule = rules.slice(rules.indexOf('match /notes/'),
  rules.indexOf('match /debtLines/'));
check('and the rules refuse an update outright',
  /allow update:\s*if false;/.test(notesRule), true);
check('while only an admin may delete',
  /allow delete:\s*if isAdmin\(\);/.test(notesRule), true);
/* THE ID IS BOUND TO THE WRITER, so a rep cannot file a note that reads as a
   colleague's — the same arrangement a stock count uses. */
check('and a note id must start with the writer uid',
  /noteId\.matches\(request\.auth\.uid/.test(notesRule), true);

console.log(failures === 0 ? '\nNOTES TESTS OK' : `\nNOTES TESTS FAILED — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
