/**
 * Runs the ADMIN PORTAL's odometer rule against the shared specification.
 *
 *   node web/odometer-test.mjs web/index.html odometer-cases.csv
 *
 * The companion is OdometerSpecTest.kt for the phone. Both read the same table, which
 * is the only thing keeping the two implementations honest — a ceiling held on one side
 * only is a ceiling the other side does not have, and the side without it is the way a
 * bad reading gets in.
 */
import { readFileSync } from 'fs';
import { loadPortal } from './portal-harness.mjs';
import { specCases } from './odometer-spec.mjs';

const htmlPath = process.argv[2] ?? 'web/index.html';
const csvPath = process.argv[3] ?? 'odometer-cases.csv';

const portal = await loadPortal(htmlPath, [
  'odometerVerdict', 'odometerAllowed', 'odometerCorrection', 'odoFormat',
  'ODO_MOST_KM', 'ODO_MOST_DIGITS', 'parseVehicleLines'
]);

const cases = specCases(csvPath);
if (cases.length === 0) throw new Error('the specification is empty');

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; console.log(`FAIL  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
  return ok;
}

for (const { name, typed, ok, value } of cases) {
  const verdict = portal.odometerVerdict(typed);
  if (!check(`${name} — "${typed}" accepted?`, verdict.ok, ok)) continue;
  if (ok) check(`${name} — "${typed}" value`, verdict.km, value);
  else if (!verdict.why) { failures++; console.log(`FAIL  ${name}: refused with no reason`); }
}
console.log(`${cases.length} case(s) from the specification`);

/* ---------------- the ceiling itself ---------------- */

check('the ceiling is six digits', portal.ODO_MOST_KM, 999999);
check('and is described as six', portal.ODO_MOST_DIGITS, 6);
check('and really is six digits long', String(portal.ODO_MOST_KM).length, 6);

check('a refusal for too many digits names the limit',
  /6 digits/.test(portal.odometerVerdict('1234567').why)
  && /999 999/.test(portal.odometerVerdict('1234567').why), true);

/* ---------------- odometerAllowed agrees with the verdict ---------------- */

[0, 1, 85000, 999999].forEach(v =>
  check(`${v} is allowed`, portal.odometerAllowed(v), true));
[-1, 1000000, 354898355008].forEach(v =>
  check(`${v} is not allowed`, portal.odometerAllowed(v), false));

/* ---------------- Correct the odometer goes through it ---------------- */

/* The modal that exists specifically to FIX a bad reading must not be able to write
   another one. It was the only path that wrote a value exactly as typed. */
check('correcting an odometer refuses seven digits',
  portal.odometerCorrection({ currentOdometerKm: 85000 }, '1234567').ok, false);
check('and says why', /6 digits/.test(
  portal.odometerCorrection({ currentOdometerKm: 85000 }, '1234567').why), true);
check('while a sane correction still goes through',
  portal.odometerCorrection({ currentOdometerKm: 850000 }, '85000'),
  { ok: true, value: 85000, drop: 765000 });
/* The rule it already had has to survive the new one being put in front of it. */
check('and a reading below the last service is still refused',
  portal.odometerCorrection({ lastServiceOdometerKm: 90000 }, '85000').ok, false);

/* ---------------- the bulk upload ---------------- */

/* THE DOOR WITH NO LOCK ON IT. A seventh digit in a spreadsheet pins a vehicle overdue
   just as surely as one typed at knock off, and this path took whatever it was given. */
const upload = portal.parseVehicleLines(
  'CA111111,Bakkie,85000,,80000,15000\n'
  + 'CA222222,Van,1234567,,80000,15000\n'
  + 'CA333333,Truck,85000,,9999999,15000');
check('a good reading is kept',
  upload.vehicles.find(v => v.registrationNumber === 'CA111111').currentOdometerKm, 85000);
check('a seven-digit current reading is not stored',
  upload.vehicles.find(v => v.registrationNumber === 'CA222222').currentOdometerKm, 0);
check('nor a seven-digit last-service reading',
  upload.vehicles.find(v => v.registrationNumber === 'CA333333').lastServiceOdometerKm, 0);
/* NAMED, not silently zeroed — a reading dropped without a word looks like a vehicle
   nobody has read yet, which is a different problem with a different fix. */
check('and both are reported back', upload.ignoredOdometers.length, 2);
check('naming the registration and the column',
  upload.ignoredOdometers.map(i => `${i.reg} ${i.column}`).sort(),
  ['CA222222 current odometer', 'CA333333 last service odometer']);
check('the vehicle itself is still added',
  upload.vehicles.length, 3);

/* ---------------- grouping ---------------- */

check('999999 reads as 999 999', portal.odoFormat(999999), '999 999');
check('85000 reads as 85 000', portal.odoFormat(85000), '85 000');
check('0 reads as 0', portal.odoFormat(0), '0');

console.log(failures === 0
  ? '\nPORTAL MATCHES THE ODOMETER SPEC'
  : `\nPORTAL FAILED THE ODOMETER SPEC — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
