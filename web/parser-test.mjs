/**
 * Behavioural tests for the portal's pure logic — the parts where a wrong answer is
 * written to Firestore or emailed out, rather than merely looking odd on screen.
 *
 *   node web/parser-test.mjs web/index.html
 *
 * Two things are pinned here:
 *
 * 1. The vehicle upload's service-interval floor. A 0 in that column used to be
 *    written straight through, and the phone app reads a 0 interval as "don't judge
 *    this vehicle by kilometres" while this portal and the reminder emails read it as
 *    "use the fleet standard" — so the same vehicle was both tracked and untracked.
 *
 * 2. The 18:30 parking curfew.
 *
 * 3. Cost per kilometre. Not written anywhere, but it is a money figure an admin would
 *    act on, and the two ways of getting it wrong are both silent: dividing by a zero
 *    that means "unknown", and averaging everybody's rate instead of dividing the
 *    totals.
 *
 * The service milestone rules are deliberately absent: those belong to
 * service-schedule-cases.csv, which all three implementations are tested against.
 */
import { loadPortal } from './portal-harness.mjs';

const portal = await loadPortal(process.argv[2] ?? 'web/index.html', [
  'parseVehicleLines', 'MIN_SERVICE_INTERVAL_KM', 'SERVICE_INTERVAL_KM',
  'nextServiceAtKm', 'percentToNextService', 'isServiceDue',
  'hasUsableInterval', 'vehiclesWithBadInterval', 'data',
  'PARK_BY', 'minutesParkedLate', 'isParkedLate',
  'costPerKm', 'costPerKmLabel', 'sortReportRows', 'reportSort',
  'vehicleCostPerKm', 'MAX_KM_BETWEEN_FILLS'
]);

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}` + (ok ? '' : `  — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

/* ---------------- the upload's interval floor ---------------- */
// registration, name, odometer, last service date, last service odometer, interval
const uploadCases = [
  ['CA111111,Suzuki Magnite,90000,,85000,10000', 10000, 0, 'a real interval is honoured'],
  ['CA222222,Bakkie 1,90000,,85000,1000',         1000,  0, 'exactly the floor is accepted'],
  ['CA333333,Bakkie 2,90000,,85000,0',            15000, 1, '0 is refused and flagged'],
  ['CA444444,Bakkie 3,90000,,85000,5',            15000, 1, '5 is refused and flagged'],
  ['CA555555,Bakkie 4,90000,,85000,',             15000, 0, 'a blank column is not a complaint'],
  ['CA666666,Bakkie 5,90000,,85000',              15000, 0, 'a missing column is not a complaint'],
];
for (const [line, wantKm, wantFlagged, label] of uploadCases) {
  const { vehicles, ignoredIntervals } = portal.parseVehicleLines(line);
  check(label, [vehicles[0].serviceIntervalKm, ignoredIntervals.length], [wantKm, wantFlagged]);
}

// Whatever the column said, nothing unusable may reach Firestore.
const everything = portal.parseVehicleLines(uploadCases.map(c => c[0]).join('\n'));
check('nothing is written below the floor',
  everything.vehicles.filter(v => v.serviceIntervalKm < portal.MIN_SERVICE_INTERVAL_KM).length, 0);
check('a flagged row still carries its registration',
  everything.ignoredIntervals.map(i => i.reg), ['CA333333', 'CA444444']);

/* ---------------- finding intervals already in the database ---------------- */
// The floor only guards new uploads. Anything stored before it needs finding, and
// intervalOf() hides it everywhere else in the portal.
for (const [stored, want, label] of [
  [15000,     true,  'the fleet standard is usable'],
  [1000,      true,  'exactly the floor is usable'],
  [10000,     true,  'a Magnite interval is usable'],
  [0,         false, '0 is caught'],
  [5,         false, '5 is caught'],
  [undefined, false, 'a missing interval is caught'],
  [null,      false, 'a null interval is caught'],
]) {
  check(`stored interval ${JSON.stringify(stored)}: ${label}`,
    portal.hasUsableInterval({ serviceIntervalKm: stored }), want);
}

portal.data.vehicles = [
  { id: 'a', registrationNumber: 'CA111111', serviceIntervalKm: 15000 },
  { id: 'b', registrationNumber: 'CA222222', serviceIntervalKm: 0 },
  { id: 'c', registrationNumber: 'CA333333', serviceIntervalKm: 10000 },
  { id: 'd', registrationNumber: 'CA444444' },
];
check('only the unusable ones are listed for fixing',
  portal.vehiclesWithBadInterval().map(v => v.id), ['b', 'd']);

portal.data.vehicles = [{ id: 'a', registrationNumber: 'CA111111', serviceIntervalKm: 15000 }];
check('a clean fleet reports nothing to fix', portal.vehiclesWithBadInterval().length, 0);

/* ---------------- the parking curfew ---------------- */
// Cases are expressed as offsets from PARK_BY rather than against a literal clock
// time, so moving the curfew stays the one-line change it is meant to be.
check('the curfew is a HH:MM time', /^\d{1,2}:\d{2}$/.test(portal.PARK_BY), true);

// Local time, matching millisFor() in the page — the admin's clock is the reference.
const at = (date, hhmm) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
};
const day = '2026-08-25';
const shift = (o) => ({ date: day, startTimeMillis: at(day, '08:00'), ...o });
const curfew = at(day, portal.PARK_BY);
const past = (mins) => curfew + mins * 60000;

for (const [log, want, label] of [
  [shift({ endTimeMillis: past(-60) }), 0,  'an hour before the curfew is on time'],
  [shift({ endTimeMillis: past(-1) }),  0,  'a minute before the curfew is on time'],
  [shift({ endTimeMillis: curfew }),    0,  'exactly on the curfew is on time, not late'],
  [shift({ endTimeMillis: past(1) }),   1,  'one minute past counts'],
  [shift({ endTimeMillis: past(45) }),  45, '45 minutes past reads as 45 late'],
  [shift({ endTimeMillis: 0 }), 0, 'never knocking off is a different fault, not lateness'],
  [{ endTimeMillis: past(30) }, 0, 'a log with no date cannot be judged'],
]) {
  check(label, portal.minutesParkedLate(log), want);
}

// The case an hour-of-day check gets backwards: 00:30 reads as hour 0, so the latest
// knock-off of all scores as the earliest. Stated as a comparison rather than a
// figure, so it tests the ordering instead of restating the arithmetic.
const afterMidnight = shift({ endTimeMillis: at('2026-08-26', '00:30') });
const lateEvening = shift({ endTimeMillis: at(day, '23:00') });
check('a knock-off after midnight is late at all', portal.isParkedLate(afterMidnight), true);
check('and later than one just before midnight',
  portal.minutesParkedLate(afterMidnight) > portal.minutesParkedLate(lateEvening), true);

check('isParkedLate agrees with the minutes on time',
  portal.isParkedLate(shift({ endTimeMillis: past(-1) })), false);
check('isParkedLate agrees with the minutes when late',
  portal.isParkedLate(shift({ endTimeMillis: past(30) })), true);

/* The service milestone rules are NOT tested here. They live in
   service-schedule-cases.csv and are run against all three implementations — the
   portal, the reminder job and the phone app — by their own tests. A second copy of
   those cases here would have made this a fourth place the rules are written down,
   which is the whole problem that file exists to solve. */

/* ---------------- cost per kilometre ---------------- */

check('fuel over distance', portal.costPerKm(4550, 1950).toFixed(2), '2.33');
check('and written out with the unit', portal.costPerKmLabel(4550, 1950), 'R2,33/km');

/* Zero is not an answer. Nobody logging a fill does not make the driving free, and
   money spent going nowhere has no per-kilometre cost — it has a problem. Returning 0
   for either would put whoever logged no fuel at the top of "cheapest". */
check('no fuel logged is unknown, not free', portal.costPerKm(0, 1200), null);
check('no distance is unknown, not infinite', portal.costPerKm(900, 0), null);
check('and both show a dash rather than a number',
  [portal.costPerKmLabel(0, 1200), portal.costPerKmLabel(900, 0)], ['—', '—']);

/* THE fleet figure must be total fuel over total distance, never the mean of the rows.
   Two people, wildly different mileage: the mean of their rates says R5,50/km and the
   fleet actually spent R1,09/km. The mean flatters whoever drove least. */
const heavy = { fuel: 1000, km: 1000 };   // R1,00/km over a long month
const light = { fuel: 100, km: 10 };      // R10,00/km over almost no driving
const meanOfRates =
  (portal.costPerKm(heavy.fuel, heavy.km) + portal.costPerKm(light.fuel, light.km)) / 2;
const fleetRate = portal.costPerKm(heavy.fuel + light.fuel, heavy.km + light.km);
check('the mean of the rates is not the fleet rate', meanOfRates.toFixed(2), '5.50');
check('the fleet rate divides the totals', fleetRate.toFixed(2), '1.09');

/* Sorting by the column must not treat "unknown" as cheap. */
const rows = [
  { name: 'Known dear', cpk: 3.0 },
  { name: 'Unknown', cpk: null },
  { name: 'Known cheap', cpk: 1.0 }
];
portal.reportSort.key = 'cpk';
portal.reportSort.dir = 1;
check('ascending puts the cheapest first and the unknown last',
  portal.sortReportRows(rows).map(r => r.name), ['Known cheap', 'Known dear', 'Unknown']);
portal.reportSort.dir = -1;
check('descending puts the dearest first and STILL the unknown last',
  portal.sortReportRows(rows).map(r => r.name), ['Known dear', 'Known cheap', 'Unknown']);
portal.reportSort.key = 'name';
portal.reportSort.dir = 1;

/* ---------------- tank to tank, per vehicle ---------------- */
// The fill at B pays for the distance A→B. Getting that backwards shifts every figure
// by one interval and is completely invisible in the output.
const fill = (t, odo, amount) => ({ timestampMillis: t, odometerKm: odo, amountSpentRands: amount });

const fourFills = [
  fill(1, 100000, 1200),   // the first is unusable: nothing earlier to measure from
  fill(2, 100620, 1150),   // 620 km
  fill(3, 101250, 300),    // 630 km on a splash
  fill(4, 101900, 1900)    // 650 km, the catch-up fill
];
const tank = portal.vehicleCostPerKm(fourFills);
check('three intervals from four fills', tank.intervals, 3);
check('the first fill is not counted as distance', tank.distance, 1900);
check('nor is its money counted', tank.spend, 3350);
check('the rate averages the splash and the catch-up out', tank.rate.toFixed(2), '1.76');

// Order comes from the clock, not the odometer: sorting by the reading would repair a
// typo into a plausible-looking order and hide the very thing being guarded against.
check('fills out of time order are still read in time order',
  portal.vehicleCostPerKm([fourFills[3], fourFills[0], fourFills[2], fourFills[1]]).rate.toFixed(2),
  '1.76');

check('one fill gives no rate', portal.vehicleCostPerKm([fill(1, 100000, 1000)]).rate, null);
check('no fills gives no rate', portal.vehicleCostPerKm([]).rate, null);

/* A mistyped odometer has to take its own money out with it. Keeping the spend while
   discarding the kilometres it bought would inflate every interval that remains. */
const withTypo = portal.vehicleCostPerKm([
  fill(1, 100000, 1000),
  fill(2, 100500, 900),    // 500 km, good
  fill(3, 900000, 800),    // a dropped digit: 799 500 km is not a month's driving
  fill(4, 901000, 700)     // 1000 km on from the bad reading, plausible on its own
]);
check('the impossible jump is discarded', withTypo.discarded, 1);
check('and its money goes with it', withTypo.spend, 1600);
check('leaving only the intervals that stand up', withTypo.intervals, 2);

check('an odometer that goes backwards is discarded too',
  portal.vehicleCostPerKm([fill(1, 100000, 900), fill(2, 99000, 900)]).discarded, 1);
check('and a fill with no amount on it',
  portal.vehicleCostPerKm([fill(1, 100000, 900), fill(2, 100400, 0)]).discarded, 1);

// A reading of 0 is "not recorded", not "the odometer is at zero", so it cannot anchor
// an interval. This is why the boundary cases below start from a real reading.
check('a fill with no odometer reading anchors nothing',
  portal.vehicleCostPerKm([fill(1, 0, 100), fill(2, 500, 100)]).intervals, 0);

// The boundary itself, so moving the constant cannot quietly change what is accepted.
const base = 100000;
check('exactly at the limit is still accepted',
  portal.vehicleCostPerKm([fill(1, base, 100),
    fill(2, base + portal.MAX_KM_BETWEEN_FILLS, 100)]).intervals, 1);
check('one kilometre past it is not',
  portal.vehicleCostPerKm([fill(1, base, 100),
    fill(2, base + portal.MAX_KM_BETWEEN_FILLS + 1, 100)]).intervals, 0);

console.log(failures === 0
  ? '\nPARSER TESTS OK'
  : `\nPARSER TESTS FAILED — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
