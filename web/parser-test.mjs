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
  'perfColumns', 'perfHasNetwork', 'networkKey', 'NETWORKS', 'NETWORK_LABELS',
  'perfFigures', 'perfNetworks', 'FY_NETWORKS', 'perfIsWide', 'normaliseMonth'
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
/* A row short of its last cell is two different mistakes, and telling them apart is
   the difference between a useful message and a wild goose chase. Somebody working down
   a template and leaving a month blank has a file whose COLUMNS are perfectly correct,
   and used to be told there were fewer columns than there should be. */
const blankFigure = portal.parsePerformanceLines('SOWETO,2026-09,MTN,', 'stock');
check('a blank figure is refused rather than saved as nought', blankFigure.rows.length, 0);
check('and the message names the figure, not the columns',
  blankFigure.errors[0].why, 'Stock is blank');
const blankMoney = portal.parsePerformanceLines('T042,2026-01,', 'commission');
check('the same for a blank amount on a commission row',
  blankMoney.errors[0].why, 'Commission is blank');
// A truly short row still says so — there is nothing better to tell somebody whose row
// is missing both its month and its figure.
check('a row missing more than its figure says the columns are wrong',
  portal.parsePerformanceLines('SOWETO', 'stock').errors[0].why,
  'fewer columns than this file should have');

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
  // A WIDE file's row becomes one row per network, so the parsed count is not the
  // template's row count — it is the number of networks actually filled in.
  const expected = portal.perfIsWide(kind)
    ? portal.PERF_UPLOADS[kind].sample.reduce((n, row) =>
        n + portal.perfNetworks(kind).filter((_, i) =>
          String(row[2 + i * portal.perfFigures(kind).length] ?? '').trim() !== '').length, 0)
    : portal.PERF_UPLOADS[kind].sample.length;
  check(`and yields its sample rows`, back.rows.length, expected);
});

/* ---------------- what a real spreadsheet actually writes ---------------- */
/* Every case below came out of the FY file Aadil tried to upload. All of it was refused,
   and none of it was his fault: a spreadsheet writes months, blanks and trailing rows
   its own way, and a parser that insists otherwise puts the work of being a computer
   onto the person with the data. */

/* MONTHS. Excel formats a date cell as "Jan-26", which is what comes out of a sheet
   somebody actually keeps. Two digits mean this century — a sales figure for "26" is
   2026, not 1926. */
check('a month written the way Excel writes it is a month',
  ['Jan-26', 'Sept-26', 'Aug-26', 'jan-26', 'September-26', 'Jan 2026', '26-Jan']
    .map(portal.normaliseMonth),
  ['2026-01', '2026-09', '2026-08', '2026-01', '2026-09', '2026-01', '2026-01']);
check('and so is the form the templates ask for',
  portal.normaliseMonth('2026-01'), '2026-01');
check('a slash or a single digit is read too',
  [portal.normaliseMonth('2026/1'), portal.normaliseMonth('2026-1')], ['2026-01', '2026-01']);
check('but something that is not a month is still not one',
  ['Rain-26', '13-26', '', 'Smarch-26', '2026-13'].map(portal.normaliseMonth),
  ['', '', '', '', '']);
// Stored normalised, so a file of "Jan-26" is not filed under a month nothing looks for.
check('a named month is STORED as yyyy-mm',
  portal.parsePerformanceLines('T042,Sept-26,1000,400,5600.00,,,', 'fy').rows[0].month,
  '2026-09');
check('and the same for a team file',
  portal.parsePerformanceLines('SOWETO,Jan-26,MTN,600', 'stock').rows[0].month, '2026-01');

/* BLANK CELLS. A count and an amount read differently because they mean differently: a
   count of nothing recorded is none, while money nobody has worked out yet is not R0. */
const blankCount = portal.parsePerformanceLines('T042,Aug-26,1500,,0,,,', 'fy');
check('a blank count reads as nought', blankCount.rows.length, 1);
check('with the stock kept and the connections nought',
  [blankCount.rows[0].values.fyStock, blankCount.rows[0].values.fyConnections,
   blankCount.rows[0].values.fyAmountRands],
  [1500, 0, 0]);
// A blank AMOUNT is refused. Reading it as R0 would tell somebody they earned nothing
// when nobody has calculated it — the difference between a bad month and an unfinished
// sheet, on a screen belonging to the person who did the selling.
check('a blank amount is still refused',
  portal.parsePerformanceLines('T042,Aug-26,2400,2378,,,,', 'fy').errors[0].why,
  'MTN payable is blank');

/* A stray nought in the payable column of a network somebody was never on. ",,0" is a
   formula filling a cell nobody meant to fill, and storing it would put a row of noughts
   on the tab and on their phone for an incentive they were not part of. */
const strayNought = portal.parsePerformanceLines('T042,Aug-26,4000,2103,3155,,,0', 'fy');
check('a network of blanks and a stray nought is not a network', strayNought.rows.length, 1);
check('leaving only the one they were actually on',
  strayNought.rows[0].network, 'MTN');
// But 0, 0, 0 typed deliberately IS a fact about the month: given nothing, sold nothing.
const realNoughts = portal.parsePerformanceLines('T042,Aug-26,4000,2103,3155,0,0,0', 'fy');
check('while noughts typed on purpose are kept', realNoughts.rows.length, 2);
check('as a real nought rather than an absence',
  realNoughts.rows[1].values, { fyStock: 0, fyConnections: 0, fyAmountRands: 0 });

/* TRAILING BLANK ROWS. Excel writes a tail of them after the last real row. A file
   ending in eighteen "no employee number" errors reads as eighteen problems when there
   are none. */
const withTail = portal.parsePerformanceLines(
  'T042,Aug-26,1000,400,5600.00,,,\n,,,,,,,\n,,,,,,,\n,,,,,,,\n', 'fy');
check('a wholly blank row is skipped in silence',
  [withTail.rows.length, withTail.errors.length], [1, 0]);
// Every upload benefits, not just FY.
check('and on the other files too',
  portal.parsePerformanceLines('T042,2026-09,6200.00\n,,\n,,\n', 'basic').errors.length, 0);
// A row with SOME of its cells filled is still a row, and still reported if it is wrong.
check('but a row with something in it is still judged',
  portal.parsePerformanceLines(',Aug-26,1000,400,5600.00,,,', 'fy').errors[0].why,
  'no employee number');

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
/* Three shapes of id, and each one has to be what it is.
   A team's is team + month + network. FY is person + month + network, because the same
   person is paid on two networks. Basic and commission are person + month only, and
   share one document so loading one never wipes the other. */
check('FY is written per person, month AND network',
  source.includes('? `${r.key}_${r.month}_${r.network}`'), true);
check('and pay per person and month, which has no network',
  source.includes(': `${r.key}_${r.month}`;'), true);
check('FY goes to its own collection, apart from pay',
  source.includes("doc(db, onFy ? 'perfFy' : 'perfMonthly', id)"), true);
// The whole values object is written, which is what lets one file carry three figures
// without the writer knowing anything about FY in particular.
check('and every figure on the row is written, not just the first',
  (source.match(/\.\.\.r\.values,/g) || []).length, 2);

/* ---------------- FY: one wide row, two networks ---------------- */
/* FY is the only WIDE upload: one row per person per month, with each network's three
   figures as its own columns, so both payables sit side by side on a line somebody can
   check at a glance. It is stored per network all the same, so ONE row here becomes TWO
   documents — and that expansion is the thing worth pinning, because nothing downstream
   knows it happened. */
check('FY is a wide file and the others are not',
  Object.keys(portal.PERF_UPLOADS).filter(k => portal.perfIsWide(k)), ['fy']);
check('its columns carry each network by name',
  portal.perfColumns('fy'),
  ['Employee number', 'Month',
   'MTN stock', 'MTN connections', 'MTN payable',
   'Telkom stock', 'Telkom connections', 'Telkom payable']);
// A wide file has NO network column: its networks are in the headings.
check('and it has no network column of its own', portal.perfHasNetwork('fy'), false);
check('while the team figures still do', portal.perfHasNetwork('stock'), true);
check('it is keyed on an employee', portal.perfKeyLabel('fy'), 'Employee number');
check('and still runs on two networks only', portal.perfNetworks('fy'), ['MTN', 'TELKOM']);

const fy = portal.parsePerformanceLines(
  portal.perfColumns('fy').join(',') + '\n'
  + 'T042,2026-08,1000,400,5600.00,600,210,2940.00\n', 'fy');
check('one wide row becomes one row per network', fy.rows.length, 2);
check('with no errors', fy.errors.length, 0);
check('each carrying its own network', fy.rows.map(r => r.network), ['MTN', 'TELKOM']);
check('and its own three figures',
  fy.rows.map(r => r.values),
  [{ fyStock: 1000, fyConnections: 400, fyAmountRands: 5600 },
   { fyStock: 600, fyConnections: 210, fyAmountRands: 2940 }]);
// Both rows are the same person and month, differing only in the network — which is
// what makes them two documents rather than one written twice.
check('both belong to the same person and month',
  new Set(fy.rows.map(r => r.key + '_' + r.month)).size, 1);
check('and become two records',
  new Set(fy.rows.map(r => `${r.key}_${r.month}_${r.network}`)).size, 2);

/* A network left entirely blank is somebody who only sold the other one — a normal file,
   not a mistake. This is the case that would be maddening if it were refused. */
const mtnOnly = portal.parsePerformanceLines('T099,2026-08,500,125,1750.00,,,', 'fy');
check('a network left blank is skipped, not refused', mtnOnly.rows.length, 1);
check('leaving the network that was filled in', mtnOnly.rows[0].network, 'MTN');
check('and no error for the blank one', mtnOnly.errors.length, 0);
const telkomOnly = portal.parsePerformanceLines('T099,2026-08,,,,600,210,2940.00', 'fy');
check('either way round', [telkomOnly.rows.length, telkomOnly.rows[0].network], [1, 'TELKOM']);

/* But a network with SOME of its cells filled is half an incentive, and is refused by
   name — storing it would pay an amount with no figures behind it, or figures with no
   amount. */
check('a network missing one of its three is refused',
  portal.parsePerformanceLines('T042,2026-08,1000,400,,600,210,2940.00', 'fy').rows.length, 0);
check('naming the network and the figure',
  portal.parsePerformanceLines('T042,2026-08,1000,400,,600,210,2940.00', 'fy').errors[0].why,
  'MTN payable is blank');
check('and the same for the other network',
  portal.parsePerformanceLines('T042,2026-08,1000,400,5600.00,600,210', 'fy').errors[0].why,
  'Telkom payable is blank');
check('a figure that is not a number says which one',
  portal.parsePerformanceLines('T042,2026-08,abc,400,5600.00,,,', 'fy').errors[0].why,
  'MTN stock must be a whole number');
// A row with nothing on it at all is reported rather than silently producing no rows.
check('a row blank on every network is reported',
  portal.parsePerformanceLines('T042,2026-08,,,,,,', 'fy').errors[0].why,
  'no figures on this row for any network');
check('and a bad month is still a bad month',
  portal.parsePerformanceLines('T042,2026-13,1000,400,5600.00,,,', 'fy').errors[0].why,
  'month must be yyyy-mm');
// A real zero is a real result: stock allocated, nothing connected, nothing payable.
check('a real zero loads',
  portal.parsePerformanceLines('T042,2026-08,1000,0,0.00,,,', 'fy').rows[0].values,
  { fyStock: 1000, fyConnections: 0, fyAmountRands: 0 });
check('while a real extra column is not',
  portal.parsePerformanceLines('T042,2026-08,1000,400,5600.00,600,210,2940.00,9', 'fy').errors[0].why,
  'more columns than this file should have');

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

/* ---------------- removing a month of one figure ---------------- */
/* There was no way to take a figure back before this, and the only thing available was
   uploading zeros — which replaces "not counted" with "earned nothing", worse than the
   mistake being corrected. Asserted against the source, because the harness stubs
   Firestore and nothing here can observe the real writes.

   The danger is breadth: a removal that took the whole document would take basic away
   with commission, since the two share one document per person per month. */
check('a removal clears only THIS file\'s fields',
  source.includes('fields.forEach(f => { delete rest[f]; });'), true);
check('and the fields come from the file being removed, not all of them',
  source.includes('const fields = perfFigures(kind).map(f => f.field);'), true);
check('it is scoped to one month by an equality on the month',
  source.includes("where('month', '==', month)"), true);
// A document left with no figures at all is removed rather than kept as an empty shell
// that still costs a read every time the month is loaded.
check('a document with nothing left is deleted outright',
  source.includes('batch.delete(doc(db, collectionName, d.id));'), true);
check('and one with figures left is rewritten without them',
  source.includes('batch.set(doc(db, collectionName, d.id), rest);'), true);
// Typing the month, not a yes/no box: this deletes somebody's pay.
check('it is confirmed by typing the month',
  source.includes("if (typed.trim() !== month) {"), true);
check('and the cached month is dropped so the tab re-reads what is left',
  source.includes('perfMonthsLoaded.delete(month);'), true);
// Each of the six files gets its own button, so a month of one figure can go without
// disturbing the other five.
check('every upload has a remove button',
  (source.match(/perfClear-/g) || []).length >= 2, true);
check('and it goes to the right collection for the kind',
  source.includes("const collectionName = kind === 'fy' ? 'perfFy'"), true);

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
