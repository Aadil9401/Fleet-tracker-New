/**
 * Reads the two shared specifications for a recorded route:
 * `location-distance-cases.csv` and `location-filter-cases.csv`.
 *
 * The portal is tested against them by web/location-spec-test.mjs and the phone app by
 * LocationTrackTest.kt. Both read the same tables, so a disagreement between the two
 * implementations can only be about the rule itself.
 */
import { readFileSync } from 'fs';

const DISTANCE_COLUMNS = ['name', 'lat1', 'lng1', 'lat2', 'lng2', 'metres'];
const FILTER_COLUMNS = ['name', 'first', 'moveOffset', 'accuracyOffset', 'keep'];

function rows(csvPath, columns) {
  const lines = readFileSync(csvPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  const header = lines.shift().split(',');
  if (header.join(',') !== columns.join(',')) {
    throw new Error(`unexpected columns in ${csvPath}:\n  got  ${header.join(',')}\n  want ${columns.join(',')}`);
  }
  return lines.map(line =>
    Object.fromEntries(line.split(',').map((v, i) => [columns[i], v.trim()])));
}

/** Two points and how far apart they are, in whole metres. */
export function distanceCases(csvPath = 'location-distance-cases.csv') {
  return rows(csvPath, DISTANCE_COLUMNS).map(c => ({
    name: c.name,
    from: { lat: Number(c.lat1), lng: Number(c.lng1) },
    to: { lat: Number(c.lat2), lng: Number(c.lng2) },
    metres: Number(c.metres)
  }));
}

/**
 * Whether a fix is kept. The two numbers are OFFSETS FROM THE THRESHOLDS rather than
 * metres, so that tuning either threshold leaves every case correct — see the head of
 * the CSV. The caller adds them to whichever constants the implementation carries.
 */
export function filterCases(csvPath = 'location-filter-cases.csv') {
  return rows(csvPath, FILTER_COLUMNS).map(c => ({
    name: c.name,
    first: c.first === 'yes',
    moveOffset: Number(c.moveOffset),
    accuracyOffset: Number(c.accuracyOffset),
    keep: c.keep === 'yes'
  }));
}
