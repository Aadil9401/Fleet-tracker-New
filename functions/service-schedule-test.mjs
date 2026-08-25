/**
 * Runs the REMINDER JOB's service rules against the shared specification.
 *
 *   node functions/service-schedule-test.mjs
 *
 * Requires ./service-schedule directly, which is why that module carries no
 * firebase-admin import — requiring index.js would initialise an app and want
 * credentials.
 */
import { createRequire } from 'module';
import { specCases } from '../web/service-schedule-spec.mjs';

const require = createRequire(import.meta.url);
const rules = require('./service-schedule.js');

const csvPath = process.argv[2] ?? 'service-schedule-cases.csv';
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
    check(name, 'nextAtKm', rules.nextServiceAtKm(vehicle), expect.nextAtKm),
    check(name, 'percent', rules.percentToNextService(vehicle), expect.percent),
    check(name, 'dueByKm', rules.isServiceDueByKm(vehicle), expect.dueByKm),
    check(name, 'dueByDate', rules.isServiceDueByDate(vehicle, now), expect.dueByDate)
  ];
  if (results.every(Boolean)) console.log(`ok    ${name}`);
}

console.log(failures === 0
  ? `\nREMINDER JOB MATCHES THE SPEC — ${cases.length} cases`
  : `\nREMINDER JOB DOES NOT MATCH THE SPEC — ${failures} mismatch(es)`);
process.exit(failures ? 1 : 0);
