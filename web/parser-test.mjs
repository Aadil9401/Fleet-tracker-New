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
 * 2. The service milestone maths. The same rules exist three times over (here, in
 *    Vehicle.kt, and in the reminder function), and nothing but this makes them agree.
 *    If a case below changes, the other two copies need the same change.
 */
import { loadPortal } from './portal-harness.mjs';

const portal = await loadPortal(process.argv[2] ?? 'web/index.html', [
  'parseVehicleLines', 'MIN_SERVICE_INTERVAL_KM', 'SERVICE_INTERVAL_KM',
  'nextServiceAtKm', 'percentToNextService', 'isServiceDue',
  'hasUsableInterval', 'vehiclesWithBadInterval', 'data',
  'PARK_BY', 'minutesParkedLate', 'isParkedLate'
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

/* ---------------- the 18:00 parking curfew ---------------- */
check('the curfew is 18:00', portal.PARK_BY, '18:00');

// Local time, matching millisFor() in the page — the admin's clock is the reference.
const at = (date, hhmm) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
};
const day = '2026-08-25';
const shift = (o) => ({ date: day, startTimeMillis: at(day, '08:00'), ...o });

for (const [log, want, label] of [
  [shift({ endTimeMillis: at(day, '17:30') }), 0,   'knocking off at 17:30 is on time'],
  [shift({ endTimeMillis: at(day, '18:00') }), 0,   'exactly 18:00 is on time, not late'],
  [shift({ endTimeMillis: at(day, '18:01') }), 1,   'one minute past counts'],
  [shift({ endTimeMillis: at(day, '18:45') }), 45,  '18:45 is 45 minutes late'],
  [shift({ endTimeMillis: at(day, '23:59') }), 359, 'just before midnight'],
  // The case an hour-of-day check gets backwards: 00:30 reads as hour 0, so the
  // latest knock-off of all would have scored as the earliest.
  [shift({ endTimeMillis: at('2026-08-26', '00:30') }), 390, 'after midnight is the latest, not the earliest'],
  [shift({ endTimeMillis: 0 }), 0, 'never knocking off is a different fault, not lateness'],
  [{ endTimeMillis: at(day, '19:00') }, 0, 'a log with no date cannot be judged'],
]) {
  check(label, portal.minutesParkedLate(log), want);
}

check('isParkedLate agrees with the minutes on time',
  portal.isParkedLate(shift({ endTimeMillis: at(day, '17:59') })), false);
check('isParkedLate agrees with the minutes when late',
  portal.isParkedLate(shift({ endTimeMillis: at(day, '18:30') })), true);

/* ---------------- service milestones ---------------- */
const v = (o) => ({ serviceIntervalKm: 15000, currentOdometerKm: 0,
  lastServiceOdometerKm: 0, lastServiceDateMillis: 0, serviceIntervalMonths: 0, ...o });

check('no history: next milestone above the current reading',
  portal.nextServiceAtKm(v({ currentOdometerKm: 90000 })), 105000);
check('no history: no percentage to show',
  portal.percentToNextService(v({ currentOdometerKm: 90000 })), null);

// Servicing at 149 000 counts as the 150 000 service, so the next is 165 000.
check('an early service still satisfies its milestone',
  portal.nextServiceAtKm(v({ currentOdometerKm: 152000, lastServiceOdometerKm: 149000 })), 165000);
check('percentage measures from the service, not the milestone',
  portal.percentToNextService(v({ currentOdometerKm: 152000, lastServiceOdometerKm: 149000 })), 19);

check('a service exactly on a milestone steps to the next one',
  portal.nextServiceAtKm(v({ currentOdometerKm: 150000, lastServiceOdometerKm: 150000 })), 165000);
check('freshly serviced reads 0%',
  portal.percentToNextService(v({ currentOdometerKm: 150000, lastServiceOdometerKm: 150000 })), 0);

check('a custom interval is respected',
  portal.nextServiceAtKm(v({ serviceIntervalKm: 10000, currentOdometerKm: 100000, lastServiceOdometerKm: 85000 })), 100000);
check('reaching the milestone is due',
  portal.isServiceDue(v({ serviceIntervalKm: 10000, currentOdometerKm: 100000, lastServiceOdometerKm: 85000 })), true);

// An odometer below the last service reading is a typo, not -50% of a window.
check('percentage never goes below 0',
  portal.percentToNextService(v({ currentOdometerKm: 90000, lastServiceOdometerKm: 100000 })), 0);
check('percentage never goes above 100',
  portal.percentToNextService(v({ currentOdometerKm: 200000, lastServiceOdometerKm: 100000 })), 100);

console.log(failures === 0
  ? '\nPARSER TESTS OK'
  : `\nPARSER TESTS FAILED — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
