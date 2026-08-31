/**
 * Runs the ADMIN PORTAL's parking curfew against the shared specification.
 *
 *   node web/parking-curfew-test.mjs web/index.html parking-curfew-cases.csv
 *
 * The companion test is ParkingCurfewTest.kt for the phone. Both read the same table,
 * which is the only thing keeping the two implementations honest.
 */
import { loadPortal } from './portal-harness.mjs';
import { specCases } from './parking-curfew-spec.mjs';

const htmlPath = process.argv[2] ?? 'web/index.html';
const csvPath = process.argv[3] ?? 'parking-curfew-cases.csv';

const portal = await loadPortal(htmlPath, [
  'PARK_BY', 'minutesParkedLate', 'isParkedLate', 'lateLabel', 'millisFor'
]);

const cases = specCases(csvPath);
if (cases.length === 0) throw new Error('the specification is empty');

let failures = 0;
function check(caseName, field, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log(`FAIL  ${caseName}  ${field}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  return ok;
}

// Any ordinary working day. Cases are offsets from this day's own curfew, so the zone
// the portal resolves it in does not have to match the phone's for both to be right.
const DAY = '2026-03-16';
const curfew = portal.millisFor(DAY, portal.PARK_BY);

for (const { name, offsetMinutes, expect } of cases) {
  // "Never knocked off" is an unset timestamp, not an offset from anything.
  const log = { date: DAY, endTimeMillis: offsetMinutes === null ? 0 : curfew + offsetMinutes * 60000 };
  const minutes = portal.minutesParkedLate(log);
  const results = [
    check(name, 'minutesLate', minutes, expect.minutesLate),
    check(name, 'isParkedLate', portal.isParkedLate(log), expect.minutesLate > 0),
    check(name, 'label', portal.lateLabel(minutes), expect.label)
  ];
  if (results.every(Boolean)) console.log(`ok    ${name}`);
}

console.log(failures === 0
  ? `\nPORTAL MATCHES THE CURFEW SPEC — ${cases.length} cases`
  : `\nPORTAL DOES NOT MATCH THE CURFEW SPEC — ${failures} mismatch(es)`);
process.exit(failures ? 1 : 0);
