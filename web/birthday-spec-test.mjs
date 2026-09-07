/**
 * Runs the ADMIN PORTAL's age rule against the shared specification.
 *
 * The same file is run against the phone app by BirthdayTest.kt. Two implementations, one
 * specification — the fifth rule held that way in this project, after the service
 * schedule, the parking curfew, the plate format and the performance figures.
 *
 * Worth a spec file because Aadil sees the SAME PERSON'S AGE on both surfaces, and asked
 * for the phone to show the age and never the date of birth. So on the phone the age is
 * the only thing anybody can check: if the two sides drift, one screen says somebody is
 * 39 while the other says 40, and there is nothing on either to say which is right.
 *
 * The is_birthday column is the phone's alone — the portal greets nobody — so it is read
 * and skipped here, and asserted by the Kotlin test. It lives in the same file because
 * the 29 February rule has to be ONE rule: somebody born on the 29th ages on the 28th in
 * a common year, which is the same day they are greeted, and taking those two facts from
 * different places is how they come apart.
 *
 *   node web/birthday-spec-test.mjs web/index.html birthday-cases.csv
 */
import { readFileSync } from 'fs';
import { loadPortal } from './portal-harness.mjs';

const portalPath = process.argv[2] ?? 'web/index.html';
const specPath = process.argv[3] ?? 'birthday-cases.csv';

const portal = await loadPortal(portalPath, ['ageOn']);

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`
    + (ok ? '' : `  — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

const COLUMNS = ['dob', 'today', 'is_birthday', 'age'];

/**
 * The specification, as rows.
 *
 * Fields are NOT trimmed away to nothing: one case is a blank date of birth, which is the
 * commonest state of all since most records have never had one filled in.
 */
const lines = readFileSync(specPath, 'utf8')
  .split(/\r?\n/)
  .map(l => l.replace(/^﻿/, '').trim())
  .filter(l => l !== '' && !l.startsWith('#'));

const header = lines[0].split(',').map(c => c.trim());
if (JSON.stringify(header) !== JSON.stringify(COLUMNS)) {
  console.error(`unexpected columns in ${specPath}: ${JSON.stringify(header)}`);
  process.exit(1);
}

const cases = lines.slice(1).map(line => {
  const f = line.split(',').map(c => c.trim());
  return { dob: f[0], today: f[1], age: f[3] === 'none' ? null : Number(f[3]) };
});

if (cases.length === 0) {
  console.error('No cases read — check the spec file path.');
  process.exit(1);
}

cases.forEach(c => {
  check(`${c.dob || '(blank)'} on ${c.today || '(blank)'}: age ${c.age ?? 'none'}`,
    portal.ageOn(c.dob, c.today), c.age);
});

console.log(failures === 0
  ? `\nPORTAL MATCHES THE BIRTHDAY SPEC — ${cases.length} cases`
  : `\nPORTAL DOES NOT MATCH THE BIRTHDAY SPEC — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
