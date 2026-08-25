/**
 * Reads service-schedule-cases.csv — the shared specification for the service rules.
 *
 * Both JS implementations are tested against it (the portal and the reminder job), as
 * is the Kotlin one. Sharing the parser means all of them agree on what the table
 * says, so a disagreement can only be about the rules themselves.
 */
import { readFileSync } from 'fs';

const COLUMNS = ['name', 'intervalKm', 'lastServiceOdoKm', 'currentOdoKm',
  'intervalMonths', 'lastServiceDaysAgo', 'nextAtKm', 'percent', 'dueByKm', 'dueByDate'];

const DAY_MILLIS = 24 * 60 * 60 * 1000;

/**
 * Every case in the table, as a vehicle plus what the rules should say about it.
 *
 * `lastServiceDaysAgo` is relative rather than a fixed date so the table never goes
 * stale, so each case carries the `now` it should be judged against.
 */
export function specCases(csvPath = 'service-schedule-cases.csv', now = 1_760_000_000_000) {
  const lines = readFileSync(csvPath, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  const header = lines.shift().split(',');
  if (header.join(',') !== COLUMNS.join(',')) {
    throw new Error(`unexpected columns in ${csvPath}:\n  got  ${header.join(',')}\n  want ${COLUMNS.join(',')}`);
  }

  return lines.map(line => {
    const c = Object.fromEntries(line.split(',').map((v, i) => [COLUMNS[i], v.trim()]));
    const daysAgo = Number(c.lastServiceDaysAgo);
    return {
      name: c.name,
      now,
      vehicle: {
        serviceIntervalKm: Number(c.intervalKm),
        lastServiceOdometerKm: Number(c.lastServiceOdoKm),
        currentOdometerKm: Number(c.currentOdoKm),
        serviceIntervalMonths: Number(c.intervalMonths),
        // -1 means no service date on record, which is stored as 0 millis.
        lastServiceDateMillis: daysAgo < 0 ? 0 : now - daysAgo * DAY_MILLIS
      },
      expect: {
        nextAtKm: Number(c.nextAtKm),
        percent: c.percent === 'none' ? null : Number(c.percent),
        dueByKm: c.dueByKm === 'true',
        dueByDate: c.dueByDate === 'true'
      }
    };
  });
}
