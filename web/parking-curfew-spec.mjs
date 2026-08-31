/**
 * Reads parking-curfew-cases.csv — the shared specification for the parking curfew.
 *
 * The portal is tested against it by web/parking-curfew-test.mjs and the phone app by
 * ParkingCurfewTest.kt. Both read the same table, so a disagreement between them can
 * only be about the rule itself.
 */
import { readFileSync } from 'fs';

const COLUMNS = ['name', 'offsetMinutes', 'minutesLate', 'label'];

/**
 * Every case in the table, as an offset from the curfew plus what the rule should say
 * about it. `offsetMinutes` is null for someone who never knocked off at all.
 */
export function specCases(csvPath = 'parking-curfew-cases.csv') {
  const lines = readFileSync(csvPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  const header = lines.shift().split(',');
  if (header.join(',') !== COLUMNS.join(',')) {
    throw new Error(`unexpected columns in ${csvPath}:\n  got  ${header.join(',')}\n  want ${COLUMNS.join(',')}`);
  }

  return lines.map(line => {
    const c = Object.fromEntries(line.split(',').map((v, i) => [COLUMNS[i], v.trim()]));
    return {
      name: c.name,
      offsetMinutes: c.offsetMinutes === 'none' ? null : Number(c.offsetMinutes),
      expect: { minutesLate: Number(c.minutesLate), label: c.label }
    };
  });
}
