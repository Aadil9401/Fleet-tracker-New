/**
 * Runs the ADMIN PORTAL's service rules against the shared specification.
 *
 *   node web/service-schedule-test.mjs web/index.html service-schedule-cases.csv
 *
 * The companion tests are functions/service-schedule-test.mjs for the reminder job and
 * ServiceScheduleTest.kt for the phone. All three read the same table, which is the
 * only thing keeping the three implementations honest.
 */
import { loadPortal } from './portal-harness.mjs';
import { specCases } from './service-schedule-spec.mjs';

const htmlPath = process.argv[2] ?? 'web/index.html';
const csvPath = process.argv[3] ?? 'service-schedule-cases.csv';

const portal = await loadPortal(htmlPath, [
  'nextServiceAtKm', 'percentToNextService', 'isServiceDueByKm', 'isServiceDueByDate'
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

for (const { name, vehicle, expect, now } of cases) {
  const results = [
    check(name, 'nextAtKm', portal.nextServiceAtKm(vehicle), expect.nextAtKm),
    check(name, 'percent', portal.percentToNextService(vehicle), expect.percent),
    check(name, 'dueByKm', portal.isServiceDueByKm(vehicle), expect.dueByKm),
    check(name, 'dueByDate', portal.isServiceDueByDate(vehicle, now), expect.dueByDate)
  ];
  if (results.every(Boolean)) console.log(`ok    ${name}`);
}

console.log(failures === 0
  ? `\nPORTAL MATCHES THE SPEC — ${cases.length} cases`
  : `\nPORTAL DOES NOT MATCH THE SPEC — ${failures} mismatch(es)`);
process.exit(failures ? 1 : 0);
