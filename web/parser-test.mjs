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
import { readFileSync } from 'fs';
import { loadPortal } from './portal-harness.mjs';

const portal = await loadPortal(process.argv[2] ?? 'web/index.html', [
  'parseVehicleLines', 'MIN_SERVICE_INTERVAL_KM', 'SERVICE_INTERVAL_KM',
  'nextServiceAtKm', 'percentToNextService', 'isServiceDue',
  'hasUsableInterval', 'vehiclesWithBadInterval', 'data',
  'PARK_BY', 'minutesParkedLate', 'isParkedLate',
  'costPerKm', 'costPerKmLabel', 'sortReportRows', 'reportSort',
  'vehicleCostPerKm', 'MAX_KM_BETWEEN_FILLS',
  'parsePerformanceLines', 'perfTemplateRows', 'PERF_UPLOADS', 'teamKey', 'perfKeyLabel',
  'perfColumns', 'perfHasNetwork', 'networkKey', 'NETWORKS', 'NETWORK_LABELS'
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

/* ---------------- the four performance uploads ---------------- */

// Stock, connections and activations are keyed on TEAM; commission on employee number.
check('the team files ask for a team name',
  ['stock', 'connections', 'activations'].map(k => portal.perfKeyLabel(k)),
  ['Team name', 'Team name', 'Team name']);
check('and commission asks for an employee number',
  portal.perfKeyLabel('commission'), 'Employee number');

// The team files gained a network column; commission did not, because commission is a
// person's pay rather than a figure against a product.
check('a team file has four columns, in this order',
  portal.perfColumns('stock'), ['Team name', 'Month', 'Network', 'Stock']);
check('and commission still has three',
  portal.perfColumns('commission'), ['Employee number', 'Month', 'Commission']);

/* One of four networks, or nothing. A CLOSED list: a figure filed under a name nobody
   filters to would appear to have saved while being invisible everywhere. */
check('case, spaces and punctuation are ignored',
  ['Cell C', 'CELLC', 'cell-c'].map(portal.networkKey), ['CELLC', 'CELLC', 'CELLC']);
check('the four networks all key to themselves',
  ['MTN', 'Vodacom', 'Telkom', 'CellC'].map(portal.networkKey),
  ['MTN', 'VODACOM', 'TELKOM', 'CELLC']);
check('a shorthand people actually write is accepted',
  [portal.networkKey('VOD'), portal.networkKey('CC')], ['VODACOM', 'CELLC']);
check('a network that is not one of the four keys to nothing',
  [portal.networkKey('Rain'), portal.networkKey(''), portal.networkKey('VODAOCM')],
  ['', '', '']);

const conn = portal.parsePerformanceLines(
  'Team name,Month,Network,Connections\nSOWETO,2026-09,MTN,450\nsoweto-east,2026-09,Vodacom,380\n',
  'connections');
check('the header is skipped and both rows load', conn.rows.length, 2);
check('no errors on a clean file', conn.errors.length, 0);
check('the team name is normalised for matching',
  conn.rows.map(r => r.key), ['SOWETO', 'SOWETO EAST']);
check('but kept as typed for display', conn.rows[1].keyAsTyped, 'soweto-east');
check('and the figure lands on the right field',
  [conn.rows[0].field, conn.rows[0].value], ['connections', 450]);
check('the row says what it is keyed on', conn.rows[0].keyedOn, 'team');
check('and which network the figure is for, normalised',
  conn.rows.map(r => r.network), ['MTN', 'VODACOM']);

/* One team's month is several rows, one per network, and they must stay several rows —
   collapsing them would make one network's figure look like the team's whole month. */
const twoNetworks = portal.parsePerformanceLines(
  ['SOWETO,2026-09,MTN,320', 'SOWETO,2026-09,VODACOM,410'].join('\n'), 'connections');
check('two networks for one team and month are two rows', twoNetworks.rows.length, 2);
check('differing only in the network',
  twoNetworks.rows.map(r => [r.key, r.month, r.network, r.value]),
  [['SOWETO', '2026-09', 'MTN', 320], ['SOWETO', '2026-09', 'VODACOM', 410]]);

// An unrecognised network is a bad line, not a fifth network.
const badNetwork = portal.parsePerformanceLines('SOWETO,2026-09,Rain,450', 'connections');
check('an unknown network is refused', badNetwork.rows.length, 0);
check('and the message names the four that are accepted',
  ['MTN', 'Vodacom', 'Cell C', 'Telkom'].every(n => badNetwork.errors[0].why.includes(n)), true);

/* A team file saved before networks existed has three columns and its figure sitting
   where the network now goes. "Network must be one of" against SOWETO,2026-09,600 tells
   an admin nothing about what to do, so it says what to do. */
const oldShape = portal.parsePerformanceLines('SOWETO,2026-09,600', 'stock');
check('a team file in the old three-column shape is refused', oldShape.rows.length, 0);
check('with the fix rather than the symptom',
  oldShape.errors[0].why.includes('needs a Network column'), true);
check('and its figure is never read as a network',
  portal.networkKey('600'), '');

/* Team names are typed twice — once in the staff list, once in the figures file — so
   they will not match on the nose. Single spaces are kept on purpose, or SOWETO and
   SOWETO EAST would collapse into one team. */
check('case, punctuation and repeated spaces are ignored',
  [portal.teamKey('Soweto East'), portal.teamKey('SOWETO  EAST'), portal.teamKey('soweto-east')],
  ['SOWETO EAST', 'SOWETO EAST', 'SOWETO EAST']);
check('but a real space still separates two teams',
  portal.teamKey('SOWETO') === portal.teamKey('SOWETO EAST'), false);
check('and a name with nothing in it keys to nothing', portal.teamKey('  -- '), '');

const stockFile = portal.parsePerformanceLines('SOWETO,2026-09,TELKOM,600', 'stock');
check('stock is a team count against a month and a network',
  [stockFile.rows[0].field, stockFile.rows[0].month,
   stockFile.rows[0].network, stockFile.rows[0].value],
  ['stock', '2026-09', 'TELKOM', 600]);

const act = portal.parsePerformanceLines('SOWETO,2026-09,MTN,380', 'activations');
check('so are activations', [act.rows[0].month, act.rows[0].value], ['2026-09', 380]);

const comm = portal.parsePerformanceLines('T042,2026-09,12500.00', 'commission');
check('commission is money', [comm.rows[0].field, comm.rows[0].value],
  ['commissionRands', 12500]);

/* A file of forty rows with three mistakes must load the thirty-seven and name the
   three, rather than failing whole and leaving the admin to hunt for them. */
const messy = portal.parsePerformanceLines(
  [',2026-09,MTN,450',            // no team name
   'TEMBISA,2026-13,MTN,380',     // month 13 is not a month
   'PMB,2026-09,Rain,410',        // not one of the four networks
   'GIYANI,2026-09,MTN,forty',    // not a number
   'MTHATHA,2026-09,MTN,410'      // fine
  ].join('\n'), 'connections');
check('only the good row loads', messy.rows.map(r => r.key), ['MTHATHA']);
check('and each bad one is reported', messy.errors.length, 4);
check('with a reason that says what to fix',
  messy.errors.map(e => ['team name', 'month', 'network', 'whole number']
    .some(fragment => e.why.includes(fragment))),
  [true, true, true, true]);
check('and the line itself, so it can be found in the file',
  messy.errors[3].line, 'GIYANI,2026-09,MTN,forty');

/* South African Excel exports semicolons and comma decimals. In a semicolon file the
   comma is safely a decimal; in a comma file it splits the column, which is a real
   mistake and has to be reported as one rather than guessed at. */
const semi = portal.parsePerformanceLines(
  'Employee number;Month;Commission\nEMP001;2026-09;12500,50', 'commission');
check('a semicolon file reads a comma decimal', semi.rows[0].value, 12500.5);
const splitDecimal = portal.parsePerformanceLines('T042,2026-09,12500,50', 'commission');
check('a comma decimal in a comma file is refused', splitDecimal.rows.length, 0);
check('and the message says why', splitDecimal.errors[0].why.includes('split across two columns'), true);

// Rejecting the split decimal is the point: reading the whole rands and dropping the
// cents in silence recorded R12 500,50 as R12 500 with nothing to say so.
check('the cents are never silently dropped', splitDecimal.rows.length, 0);
// But a spreadsheet writes trailing empty cells, and those mean nothing.
check('trailing empty columns are tolerated',
  portal.parsePerformanceLines('SOWETO,2026-09,MTN,38,,', 'activations').rows[0].value, 38);
check('while a real extra column is refused',
  portal.parsePerformanceLines('SOWETO,2026-09,MTN,38,99', 'activations').errors.length, 1);

check('an R and grouping spaces are tolerated',
  portal.parsePerformanceLines('T042,2026-09,R 12 500.50', 'commission').rows[0].value, 12500.5);
check('a whole-rand amount needs no decimals',
  portal.parsePerformanceLines('T042,2026-09,12500', 'commission').rows[0].value, 12500);
check('a negative figure is not a count',
  portal.parsePerformanceLines('SOWETO,2026-09,MTN,-5', 'activations').rows.length, 0);

/* The templates an admin downloads are generated from the same table the parser reads,
   so a column cannot be added to one without the other. Feeding each template back
   through its own parser is the check that they still agree. */
Object.keys(portal.PERF_UPLOADS).forEach(kind => {
  const csv = portal.perfTemplateRows(kind).map(r => r.join(',')).join('\n');
  const back = portal.parsePerformanceLines(csv, kind);
  check(`the ${kind} template parses cleanly through its own parser`, back.errors.length, 0);
  check(`and yields its sample rows`, back.rows.length, portal.PERF_UPLOADS[kind].sample.length);
});

/* ---------------- several months in one file ---------------- */
// Eight months of history is one file with a Month column that changes per row, not
// eight files. The parser reads the month per row, so nothing has to be split up.
const eightMonths = [];
for (let m = 1; m <= 8; m++) {
  const month = `2026-0${m}`;
  ['SOWETO', 'TEMBISA', 'PMB'].forEach(t =>
    portal.NETWORKS.forEach(n => eightMonths.push(`${t},${month},${n},100`)));
}
const many = portal.parsePerformanceLines(eightMonths.join(String.fromCharCode(10)), 'connections');
check('every row of a multi-month file loads', many.rows.length, 8 * 3 * 4);
check('with no errors', many.errors.length, 0);
check('and eight distinct months come through',
  [...new Set(many.rows.map(r => r.month))].length, 8);
check('and all four networks', [...new Set(many.rows.map(r => r.network))].sort(),
  [...portal.NETWORKS].sort());
check('each row keeping its own month', many.rows[12].month, '2026-02');

/* A row's document id is its team, its month AND its network. Leaving the network out
   would make a team's four networks one record overwritten four times, so a month would
   show whichever network happened to be written last as the team's whole figure. */
const ids = new Set(many.rows.map(r => `${r.key}_${r.month}_${r.network}`));
check('each team, month and network is its own record', ids.size, 8 * 3 * 4);
const withoutNetwork = new Set(many.rows.map(r => `${r.key}_${r.month}`));
check('and dropping the network from the id would collide', withoutNetwork.size, 8 * 3);

/* The id above is RECONSTRUCTED from a parsed row, which proves the parts are all
   present but not that the upload writes them. The id that matters is the one in
   savePerformance, so it is read out of the source — the same way the chunk size below
   is. Reconstructing it here and getting it wrong there is exactly the mistake that
   would show one network's figure as a team's whole month. */
const source = readFileSync(process.argv[2] ?? 'web/index.html', 'utf8');
check('the upload writes a team document per team, month AND network',
  source.includes('doc(db, \'perfTeams\', `${r.key}_${r.month}_${r.network}`)'), true);
check('and commission per person and month, which has no network',
  source.includes('const id = `${r.key}_${r.month}`;'), true);

/* Reads, which networks made four times as expensive.
   Eighty-eight team names on four networks is around 350 documents a month. Reading two
   years of that on every page load would be over eight thousand reads before the day
   view had drawn, against the free plan's fifty thousand a day — six page loads. Both
   tabs show ONE month, so one month is what is fetched. Asserted against the source
   because the harness stubs Firestore, so nothing here can observe the real query. */
check('the figures are read one month at a time',
  source.includes("collection(db, 'perfTeams'), where('month', '==', month)"), true);
check('and commission likewise',
  source.includes("collection(db, 'perfMonthly'), where('month', '==', month)"), true);
check('so neither is part of the bulk load',
  /getDocs\(query\(collection\(db, 'perf(Teams|Monthly)'\),\s*where\('month', '>='/.test(source),
  false);
// A month already fetched is not fetched again, and an upload clears that so the figures
// it just wrote are the ones shown.
check('a month already in hand is not read twice',
  source.includes('if (!month || perfMonthsLoaded.has(month)) return;'), true);
check('and an upload invalidates what was cached',
  source.includes('perfMonthsLoaded.clear();'), true);

/* Firestore commits at most 500 writes per batch, and a batch is a cliff rather than a
   slope: one row over and the whole upload fails with an error about batch size, saying
   nothing about the file. So the upload chunks, and the chunk size has to stay under the
   cap.

   Networks multiplied the row count by four. Nine months across the 88 team names in
   the figures, on four networks, is 3 168 rows in one file — eight chunks, where before
   networks it was one. That is the number the chunking now has to carry. */
const CHUNK = 400;
const chunkCount = (n) => Math.ceil(n / CHUNK);
check('the chunk size is under Firestore\'s cap', CHUNK < 500, true);
check('a year of one network for 39 teams still fits in one chunk',
  chunkCount(39 * 8), 1);
check('but nine months of four networks across 88 teams does not',
  chunkCount(88 * 9 * 4), 8);
check('and a file that would breach the cap is split', chunkCount(648), 2);
// Checked against the source, because the number that matters is the one in the code.
check('the upload really does chunk at that size',
  source.includes(`rows.slice(start, start + ${CHUNK})`), true);

console.log(failures === 0
  ? '\nPARSER TESTS OK'
  : `\nPARSER TESTS FAILED — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
