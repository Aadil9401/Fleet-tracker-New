/**
 * Runs the ADMIN PORTAL's plate formatting against the shared specification.
 *
 *   node web/plate-format-test.mjs web/index.html plate-format-cases.csv
 *
 * The companion test is PlateFormatTest.kt for the phone. Both read the same table,
 * which is the only thing keeping the two implementations honest.
 */
import { loadPortal } from './portal-harness.mjs';
import { specCases } from './plate-format-spec.mjs';

const htmlPath = process.argv[2] ?? 'web/index.html';
const csvPath = process.argv[3] ?? 'plate-format-cases.csv';

const portal = await loadPortal(htmlPath, ['plate', 'plateMatches', 'normReg']);

const cases = specCases(csvPath);
if (cases.length === 0) throw new Error('the specification is empty');

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log(`FAIL  ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  return ok;
}

for (const { name, input, display } of cases) {
  if (check(name, portal.plate(input), display)) console.log(`ok    ${name}`);
}

/* Formatting must not change what a plate IS, or a vehicle stops matching its driver. */
for (const { name, input, display } of cases) {
  check(`${name} — formatting does not change identity`,
    portal.normReg(portal.plate(input)), portal.normReg(input));
}

/* Searching has to work whether you type the plate as shown or as it was stored. */
check('a search ignores spacing', portal.plateMatches('BC 45 DF GP', 'bc45'), true);
check('a search matches the displayed spacing too', portal.plateMatches('BC45DFGP', 'BC 45'), true);
check('a search matches the middle of a plate', portal.plateMatches('BC 45 DF GP', 'DFGP'), true);
check('a search that matches nothing says so', portal.plateMatches('BC 45 DF GP', 'ZZ'), false);
// Otherwise an empty box would "match" every vehicle through this path rather than
// through the caller deciding not to filter at all.
check('an empty search matches nothing through this path', portal.plateMatches('BC 45 DF GP', ''), false);

console.log(failures === 0
  ? `\nPORTAL MATCHES THE PLATE SPEC — ${cases.length} cases`
  : `\nPORTAL DOES NOT MATCH THE PLATE SPEC — ${failures} mismatch(es)`);
process.exit(failures ? 1 : 0);
