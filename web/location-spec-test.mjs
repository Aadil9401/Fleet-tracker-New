/**
 * Runs the ADMIN PORTAL's location rules against the shared specifications.
 *
 *   node web/location-spec-test.mjs web/index.html location-distance-cases.csv location-filter-cases.csv
 *
 * The companion test is LocationTrackTest.kt for the phone. Both read the same two
 * tables, which is the only thing keeping the two implementations honest — and a
 * disagreement here is not a cosmetic one: these rules decide what a day's travel reads
 * as, against which an odometer is going to be checked.
 */
import { loadPortal } from './portal-harness.mjs';
import { distanceCases, filterCases } from './location-spec.mjs';

const htmlPath = process.argv[2] ?? 'web/index.html';
const distancePath = process.argv[3] ?? 'location-distance-cases.csv';
const filterPath = process.argv[4] ?? 'location-filter-cases.csv';

const portal = await loadPortal(htmlPath, [
  'metresBetween', 'shouldKeepPoint', 'keptPoints', 'routeMetres', 'routeKm',
  'MIN_MOVE_M', 'MAX_ACCURACY_M', 'EARTH_RADIUS_M'
]);

let failures = 0;
function check(caseName, field, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log(`FAIL  ${caseName}  ${field}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  return ok;
}

const distances = distanceCases(distancePath);
const filters = filterCases(filterPath);
if (distances.length === 0 || filters.length === 0) {
  throw new Error('a specification is empty');
}

for (const { name, from, to, metres } of distances) {
  const there = portal.metresBetween(from.lat, from.lng, to.lat, to.lng);
  // Reversed as well, because a distance that depends on which end you started from is
  // wrong in a way no single-direction table would ever show.
  const back = portal.metresBetween(to.lat, to.lng, from.lat, from.lng);
  const results = [
    check(name, 'metres', Math.round(there), metres),
    check(name, 'reversed', Math.round(back), metres)
  ];
  if (results.every(Boolean)) console.log(`ok    ${name}`);
}

for (const { name, first, moveOffset, accuracyOffset, keep } of filters) {
  // Offsets from whatever thresholds this implementation carries — see the CSV.
  const moved = portal.MIN_MOVE_M + moveOffset;
  const accuracy = portal.MAX_ACCURACY_M + accuracyOffset;
  if (check(name, 'keep', portal.shouldKeepPoint(first, moved, accuracy), keep)) {
    console.log(`ok    ${name}`);
  }
}

/*
 * THE RULE THAT MAKES THE FILTER WORK AT ALL, which no row of either table can express:
 * each point is measured against the last one KEPT, never the last one seen. Measured
 * against the last one seen, a phone creeping a metre at a time drops every point for
 * ever and records a driver as having never moved. LocationTrackTest checks the same
 * thing on the phone side.
 */
const creeping = Array.from({ length: 20 }, (_, i) => ({
  lat: -26.2041 + i * 0.00001, lng: 28.0473, t: i * 30000, acc: 10
}));
if (check('creeping a metre at a time still adds up to a journey', 'kept',
  portal.keptPoints(creeping).length > 1, true)) {
  console.log('ok    creeping a metre at a time still adds up to a journey');
}

// And the converse: a phone that never moves records a start and nothing else.
const stationary = Array.from({ length: 50 }, (_, i) => ({
  lat: -26.2041 + (i % 3) * 0.000004, lng: 28.0473, t: i * 30000, acc: 8
}));
const stationaryOk = [
  check('standing still is not a journey', 'kept', portal.keptPoints(stationary).length, 1),
  check('standing still is not a journey', 'metres', Math.round(portal.routeMetres(stationary)), 0)
];
if (stationaryOk.every(Boolean)) console.log('ok    standing still is not a journey');

// A day with nothing in it is a day of no distance, not a crash.
const emptyOk = [
  check('an empty day is zero, not an error', 'kept', portal.keptPoints([]).length, 0),
  check('an empty day is zero, not an error', 'metres', portal.routeMetres([]), 0),
  check('an empty day is zero, not an error', 'undefined', portal.routeMetres(undefined), 0)
];
if (emptyOk.every(Boolean)) console.log('ok    an empty day is zero, not an error');

const total = distances.length + filters.length + 3;
console.log(failures === 0
  ? `\nPORTAL MATCHES THE LOCATION SPEC — ${total} cases`
  : `\nPORTAL DOES NOT MATCH THE LOCATION SPEC — ${failures} mismatch(es)`);
process.exit(failures ? 1 : 0);
