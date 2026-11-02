/**
 * Reads odometer-cases.csv — the shared odometer specification.
 *
 * Its own module so the portal's test and anything else that wants the table read it
 * the same way, rather than each growing its own parser and disagreeing about what a
 * case means.
 *
 * The `typed` column is wrapped in pipes so that leading and trailing spaces survive a
 * spreadsheet and are visible to anyone reading the file. Everything between the first
 * pipe and the last is the input, exactly as it stands — including commas, which is
 * why the line cannot simply be split on them.
 */
import { readFileSync } from 'fs';

export function specCases(csvPath) {
  return readFileSync(csvPath, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .slice(1)
    .map(line => {
      const name = line.slice(0, line.indexOf('|')).replace(/,$/, '');
      const typed = line.slice(line.indexOf('|') + 1, line.lastIndexOf('|'));
      const rest = line.slice(line.lastIndexOf('|') + 1).replace(/^,/, '').split(',');
      return {
        name,
        typed,
        ok: rest[0].trim() === 'yes',
        value: rest[1] !== undefined && rest[1].trim() !== '' ? Number(rest[1].trim()) : null
      };
    });
}
