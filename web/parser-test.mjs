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
  'perfFigures', 'perfNetworks', 'FY_NETWORKS', 'perfIsWide', 'perfIsMonthly', 'perfOnFy', 'templateMonths', 'perfMonthOffset', 'normaliseMonth',
  'parseRosterLines', 'normaliseDate', 'normaliseBirthDate', 'rosterRowToStore',
  'staffTemplateRows', 'ROSTER_COLUMNS', 'splitCells', 'parseDebtLines',
  'DEBT_COLUMNS', 'DEBT_SAMPLE', 'ageOn', 'ageLabel'
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
  /*
   * A row of the template is not always a row out of the parser. A WIDE file's row
   * becomes one per network filled in; a MONTHLY file's becomes one per month filled in.
   * Counted off the template's own rows, so a kind with no sample in the table — which a
   * monthly one has, since its rows are generated to fit the columns — is covered too.
   */
  const body = portal.perfTemplateRows(kind).slice(1);
  const expected = portal.perfIsMonthly(kind)
    ? body.reduce((n, row) =>
        n + row.slice(portal.perfMonthOffset(kind))
          .filter(c => String(c ?? '').trim() !== '').length, 0)
    : portal.perfIsWide(kind)
      ? body.reduce((n, row) =>
          n + portal.perfNetworks(kind).filter((_, i) =>
            String(row[2 + i * portal.perfFigures(kind).length] ?? '').trim() !== '').length, 0)
      : body.length;
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
/* WIDE MEANS FY, both ways round. Asserted as the rule rather than as a list of names,
   because the list grew from one to four in two days: the full file, then stock,
   connections and payable each on their own so a month of one can be loaded without
   disturbing the other two. A fifth would break a list and not this. */
check('every wide file is an FY file',
  Object.keys(portal.PERF_UPLOADS).filter(k => portal.perfIsWide(k) && !portal.perfOnFy(k)), []);
check('and every FY file is wide',
  Object.keys(portal.PERF_UPLOADS).filter(k => portal.perfOnFy(k) && !portal.perfIsWide(k)), []);
// Three are OFFERED: stock, connections and payable, each on their own. The combined
// file is still specified — it is the only one that reaches the wide parser's
// multi-figure rules, which the cases above depend on — but it is no longer on the tab.
check('the combined FY file is not offered any more',
  portal.PERF_UPLOADS.fy.hidden, true);
check('and the three single-figure ones are',
  Object.keys(portal.PERF_UPLOADS)
    .filter(k => portal.perfOnFy(k) && !portal.PERF_UPLOADS[k].hidden),
  ['fyStock', 'fyConnections', 'fyPayable']);
/* EVERY FIGURE KEEPS A BOX. Hiding is how an upload is retired, and the risk it carries
   is retiring the last way to load something — which nothing on screen would announce,
   because a missing box looks exactly like a box you have not scrolled to.

   So the guard is not "nothing is hidden" any more, it is that every field some upload
   can write is still writable through a box that is actually on a tab. */
const visibleFields = new Set(Object.keys(portal.PERF_UPLOADS)
  .filter(k => !portal.PERF_UPLOADS[k].hidden)
  .flatMap(k => portal.perfFigures(k).map(f => f.field)));
const everyField = new Set(Object.keys(portal.PERF_UPLOADS)
  .flatMap(k => portal.perfFigures(k).map(f => f.field)));
check('every figure is still loadable from some visible box',
  [...everyField].filter(f => !visibleFields.has(f)), []);
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

/* ---------------- the file says where its columns are ---------------- */
/* THE WORST FAULT OF THE DAY, AND IT WAS SILENT.

   Aadil uploaded the EMPLOYEE EXPORT into the staff list. Its columns are in a different
   order — cell number sixth, date of birth seventh, vehicle registration eleventh — and
   the parser counted columns instead of reading the heading. So his cell numbers were
   stored as vehicle registrations, his dates of birth as cell numbers, and his real
   registrations were never read at all. Every check passed. Nothing looked wrong until he
   opened the list and found his fleet replaced by phone numbers.

   Reading the heading fixes the class, not the instance: any file that names its columns
   is now read by name, whatever order they are in and however many extra ones it carries.
*/
const HIS_EXPORT = [
  'Employee number,First name,Surname,Province,Team,Cell number,Date of birth,Age,'
    + 'Contact email,Login username,Vehicle registration,Assigned vehicle,Status,Role,'
    + 'Last active,Signed up',
  'T030,ALLEN,CHIVERO,Gauteng,SPRINGS,635454030,1992/01/08,,a@b.com,a@b.com,'
    + 'HH 43 YS GP,NISSAN NP200,Active,employee,,2026/09/07'
].join('\n');

const fromExport = portal.parseRosterLines(HIS_EXPORT)[0];
check('the employee export is read by its headings, not by counting',
  [fromExport.employeeNumber, fromExport.name, fromExport.surname,
   fromExport.vehicleRegistration, fromExport.cellNumber, fromExport.dateOfBirth],
  ['T030', 'ALLEN', 'CHIVERO', 'HH 43 YS GP', '0635454030', '1992-01-08']);
// The exact three confusions that did the damage, stated as their own cases.
check('a cell number is not stored as a registration',
  fromExport.vehicleRegistration.includes('635454030'), false);
check('a date of birth is not stored as a cell number',
  fromExport.cellNumber, '0635454030');
check('and the registration eleven columns in is actually read',
  fromExport.vehicleRegistration, 'HH 43 YS GP');
/* EXCEL EATS THE LEADING ZERO of a cell number, writing 0635454030 as 635454030, which
   is not a number anybody can ring. Nine digits starting 6, 7 or 8 is unambiguously a
   South African cell with its zero stripped. */
check('a stripped leading zero is put back',
  ['635454030', '842598749', '712278545'].map(c =>
    portal.parseRosterLines('number,cell\nT1,' + c)[0].cellNumber),
  ['0635454030', '0842598749', '0712278545']);
check('and anything that is not one is left exactly as typed',
  ['0635454030', '00', '0', '27821234567', '123'].map(c =>
    portal.parseRosterLines('number,cell\nT1,' + c)[0].cellNumber),
  ['0635454030', '00', '0', '27821234567', '123']);

/* NAMES ARE MATCHED EXACTLY, never by substring. "Contact email" must not be taken for a
   cell number and "Assigned vehicle" must not be taken for a registration — that kind of
   near-miss is how a file gets read confidently and wrongly. */
const decoys = portal.parseRosterLines(
  'Employee number,Contact email,Assigned vehicle,Login username\n'
  + 'T042,a@b.com,NISSAN NP200,a@b.com');
check('a decoy heading matches nothing',
  [decoys[0].cellNumber, decoys[0].vehicleRegistration], ['', '']);
check('and the row is still read for what it does name', decoys[0].employeeNumber, 'T042');

/* Our own template still reads exactly as it did. */
const ourTemplate = portal.parseRosterLines(
  portal.ROSTER_COLUMNS.join(',') + '\nT042,Ayanda,Ncube,Gauteng,Soweto,ND123456,0821234567,1986-09-07');
check('the portal own template is unaffected',
  portal.rosterRowToStore(ourTemplate[0]),
  { key: 'T042', employeeNumber: 'T042', name: 'Ayanda', surname: 'Ncube',
    province: 'Gauteng', teamName: 'Soweto', vehicleRegistration: 'ND123456',
    cellNumber: '0821234567', dateOfBirth: '1986-09-07' });

/* NO HEADING ROW, which is what pasting a few rows out of Excel gives: the documented
   order still applies, and a stray heading line is still skipped. */
const pasted = portal.parseRosterLines(
  'T042,Ayanda,Ncube,Gauteng,Soweto,ND123456,0821234567,1986-09-07');
check('a headless file keeps the documented order',
  [pasted[0].vehicleRegistration, pasted[0].cellNumber, pasted[0].dateOfBirth],
  ['ND123456', '0821234567', '1986-09-07']);
check('and a heading pasted in with the rows is still skipped',
  portal.parseRosterLines('employee number\nT042,Ayanda').length, 1);

/* A ROW OF DATA IS NOT A HEADING. The test is that it names the employee number and at
   least two other fields — a real row names nothing, so it can never be eaten. */
check('a first row of real data is kept, not read as headings',
  portal.parseRosterLines('T042,Ayanda,Ncube,Gauteng,Soweto,ND123456,0821234567,1986-09-07')
    .length, 1);
// The number ALONE is not enough — 'Nonsense' names nothing — so the file falls back to
// positions and the heading row is dropped by the old first-cell test. One recognised
// column beside the number IS enough, which is what makes a bare
// 'employee number, date of birth' file work.
check('a heading that names only the employee number is not trusted',
  portal.parseRosterLines('Employee number,Nonsense\nT042,Ayanda').length, 1);

// Headings however they were capitalised or punctuated: "D.O.B" is the spelling in his
// own workbook.
check('a heading is matched however it was written',
  ['EMPLOYEE NUMBER,D.O.B', 'employee no,dob', 'Employee  Number , Date Of Birth']
    .map(h => portal.parseRosterLines(h + '\nT042,1986-09-07')[0].dateOfBirth),
  ['1986-09-07', '1986-09-07', '1986-09-07']);

/* ---------------- a file uploaded in the wrong box ---------------- */
/* THIS ONE COST A MONTH OF FIGURES.

   Every team file is the same shape — team, month, network, then a figure — and the
   parser takes the figure BY POSITION. So the stock file loaded through the connections
   box was accepted in silence: September's connections were replaced by September's
   stock, 65 rows of it, and the only clue was that the numbers came out suspiciously
   round. I handed over both files minutes apart, differing in one heading and which box
   to use, which made it a trap rather than a mistake.

   The heading row already had to be recognised so it could be skipped. It is now READ.
   The whole file is refused, because a month half-loaded into the wrong figure is worse
   than a month not loaded at all. */
const stockInWrongBox = [portal.perfColumns('stock').join(','),
  'ALEXANDRA,2026-09,MTN,2400', 'ALEXANDRA,2026-09,Vodacom,1200'].join('\n');
const connInWrongBox = [portal.perfColumns('connections').join(','),
  'ALEXANDRA,2026-09,MTN,60', 'ALEXANDRA,2026-09,Vodacom,251'].join('\n');

const asStock = portal.parsePerformanceLines(stockInWrongBox, 'connections');
check('the stock file is refused by the connections box', asStock.rows.length, 0);
check('and the complaint names the box it belongs in',
  asStock.errors[0].why.includes('Stock'), true);
// Both boxes that heading could mean, since there are two stock files now.
check('and names every box it could be, not one picked at random',
  asStock.errors[0].why.includes('Stock by month'), true);
check('and names the box it was given to, so both are on screen',
  asStock.errors[0].why.includes('Connections'), true);

// Both directions: the same trap works the other way round.
const asConn = portal.parsePerformanceLines(connInWrongBox, 'stock');
check('and the connections file is refused by the stock box', asConn.rows.length, 0);
check('with the boxes the other way round',
  asConn.errors[0].why.includes('Connections'), true);

// EVERY FILE STILL LOADS IN ITS OWN BOX. A guard that refuses good files is worse than
// no guard, so this is driven from the upload table: a seventh figure cannot be added
// without being covered.
Object.keys(portal.PERF_UPLOADS).forEach(kind => {
  const own = portal.perfTemplateRows(kind).map(r => r.join(',')).join('\n');
  const parsed = portal.parsePerformanceLines(own, kind);
  check('the ' + kind + ' file still loads in its own box', parsed.errors, []);
  check('and still produces rows: ' + kind, parsed.rows.length > 0, true);
});

/* AND EVERY WRONG PAIRING IS REFUSED. Driven from the table too, so the guard cannot
   quietly stop covering a pair. Only files keyed the same way are comparable — a team
   file in the commission box already fails on "no employee number". */
Object.keys(portal.PERF_UPLOADS).forEach(mine => {
  Object.keys(portal.PERF_UPLOADS).forEach(theirs => {
    if (mine === theirs) return;
    if (portal.PERF_UPLOADS[mine].keyedOn !== portal.PERF_UPLOADS[theirs].keyedOn) return;
    const file = portal.perfTemplateRows(theirs).map(r => r.join(',')).join('\n');
    const parsed = portal.parsePerformanceLines(file, mine);
    check(`the ${theirs} file is refused by the ${mine} box`, parsed.rows.length, 0);
  });
});

/* ---------------- FY connections, on their own ---------------- */
/* THE WHOLE POINT OF THIS FILE IS WHAT IT DOES NOT CARRY. Aadil wanted to load FY
   connections "without interfering with stock figures", and the full FY file cannot do
   that: a blank COUNT is read as nought, correctly, because on a file that carries a
   stock column an empty cell means none was issued. So blanking the stock columns on the
   wide file writes nought over every stock figure it does not mention, and the conversion
   percentages behind them follow it down.

   A file with no stock column cannot do that. These pin that it never writes one — the
   writer merges, so a field absent here is a field left alone in the database. */
const fyConnFile = [portal.perfColumns('fyConnections').join(','),
  ...portal.PERF_UPLOADS.fyConnections.sample.map(r => r.join(','))].join('\n');
const fyConnParsed = portal.parsePerformanceLines(fyConnFile, 'fyConnections');

check('the connections-only file loads', fyConnParsed.errors, []);
// One row per person per network, the same expansion the wide FY file does.
check('and one row per network it names', fyConnParsed.rows.length, 3);
check('its columns name each network and nothing else',
  portal.perfColumns('fyConnections'),
  ['Employee number', 'Month', 'MTN connections', 'Telkom connections']);

// THE PIN. Every field this file is capable of writing, across every row.
check('it writes connections and nothing else, ever',
  [...new Set(fyConnParsed.rows.flatMap(r => Object.keys(r.values)))], ['fyConnections']);
check('and never a stock or a payable field',
  fyConnParsed.rows.some(r => 'fyStock' in r.values || 'fyAmountRands' in r.values), false);

/* THE SAME PIN ON ALL THREE. Aadil asked for stock, connections and payable as three
   separate files so a month of one can be loaded "to rule out" — which only means
   anything if each file is incapable of touching the other two figures. The writer
   merges, so a field absent from a row is a field left alone in the database; these
   check the parser never produces one it should not.

   Driven from the table, so a fourth single-figure FY file is covered the day it is
   added rather than the day somebody remembers to write a case for it. */
const SINGLE_FY = { fyStock: 'fyStock', fyConnections: 'fyConnections', fyPayable: 'fyAmountRands' };
Object.entries(SINGLE_FY).forEach(([kind, field]) => {
  const spec = portal.PERF_UPLOADS[kind];
  const text = [portal.perfColumns(kind).join(','),
    ...spec.sample.map(r => r.join(','))].join('\n');
  const parsed = portal.parsePerformanceLines(text, kind);
  check(kind + ' loads in its own box', parsed.errors, []);
  check(kind + ' writes only ' + field,
    [...new Set(parsed.rows.flatMap(r => Object.keys(r.values)))], [field]);
  // And never the other two figures, which is the whole reason it exists.
  const others = Object.values(SINGLE_FY).filter(f => f !== field);
  check(kind + ' never carries ' + others.join(' or '),
    parsed.rows.some(r => others.some(f => f in r.values)), false);
});

/* AND NO TWO OF THEM ARE INTERCHANGEABLE. Every wrong pairing is refused by the
   generated matrix further down; this pins the reason, which is that each file's
   heading names the figure it carries. Getting that wrong is how a month of payables
   lands in the stock column and reads as a perfectly plausible number. */
check('each single-figure FY file has its own columns',
  Object.keys(SINGLE_FY).map(k => portal.perfColumns(k).slice(2).join(',')),
  ['MTN stock,Telkom stock', 'MTN connections,Telkom connections',
   'MTN payable,Telkom payable']);
// Which is only safe because the writer merges rather than replaces.
check('and the writer merges, so an absent field is one left alone',
  source.includes('...r.values,') && source.includes('{ merge: true }'), true);

// It lands in the FY collection beside the full file, on the same document per person
// per month per network — which is what lets one update the other's rows.
check('it stores in perfFy, like the full FY file',
  [portal.perfOnFy('fyConnections'), portal.perfOnFy('fy'), portal.perfOnFy('commission')],
  [true, true, false]);

/* AND THE WRONG BOX NAMES EVERY BOX IT COULD BE. "MTN connections" is a column of both
   FY files, so naming one of them at random would send somebody to the wrong tab with an
   instruction that sounds certain. */
const fyConnInCommission = portal.parsePerformanceLines(fyConnFile, 'commission');
check('the connections-only file is refused by the commission box',
  fyConnInCommission.rows.length, 0);
check('and the complaint names both FY boxes, since the heading fits either',
  [fyConnInCommission.errors[0].why.includes('FY incentive'),
   fyConnInCommission.errors[0].why.includes('FY connections only')], [true, true]);

/* FY'S COLUMNS ARE NOT THE STOCK FILE'S. "MTN stock" belongs to FY and must not be read
   as the stock file's "Stock" — matching on part of a heading is how a guard starts
   refusing files that were perfectly correct. */
check('a heading is matched whole, never in part',
  portal.parsePerformanceLines(
    [portal.perfColumns('fy').join(','), portal.PERF_UPLOADS.fy.sample[0].join(',')].join('\n'),
    'fy').errors, []);

/* A FILE WITH NO HEADING IS UNTOUCHED, which is what pasting a few rows out of Excel
   gives, and a heading naming a figure nobody knows is left alone — being unhelpful
   about an unfamiliar file is better than refusing a good one. */
check('a headless file is not second-guessed',
  portal.parsePerformanceLines('ALEXANDRA,2026-09,MTN,60', 'connections').errors, []);
check('and an unfamiliar heading is not refused',
  portal.parsePerformanceLines(
    'Team name,Month,Network,Widgets\nALEXANDRA,2026-09,MTN,60', 'connections').errors, []);

/* EVERY UPLOAD CAN BE DRAWN. The box for each kind puts an example row in the paste
   area's placeholder, and it used to read spec.sample[0] — which a monthly kind does not
   have, because its rows are generated to fit however many month columns it carries.

   That threw inside renderPerformanceUploads, and the whole function died with it: not
   one upload box appeared on the Performance tab, for any figure. The portal looked
   like its uploads had been deleted.

   Nothing caught it. The smoke test evaluates the module and never calls this, and the
   render tests set the "already built" flag to skip it — so the one harness run that
   did hit it was dismissed as a stub artefact. This is the cheap check that would have
   said otherwise: every kind must have a first data row to show. */
Object.keys(portal.PERF_UPLOADS).forEach(kind => {
  const rows = portal.perfTemplateRows(kind);
  check('the ' + kind + ' box has an example row to show', Array.isArray(rows[1]), true);
  check('and it is not empty: ' + kind, rows[1].length > 1, true);
});

/* ---------------- every template the portal hands out, uploaded back into it ---------------- */
/* THIS IS THE TEST THAT SHOULD ALWAYS HAVE BEEN HERE.

   downloadCsv() wraps every cell it writes in quotes, and none of the parsers took them
   off — so no template the portal offered could be uploaded back into the portal. The
   heading row arrived as a person whose employee number was literally "employee number",
   and every value kept its quote marks: a name stored as "Ayanda", a date of birth as
   "1986-09-07", which no date reader accepts.

   It had never bitten because the files actually uploaded were written elsewhere. It
   turned up the first time a template was produced by the portal's own code and read
   straight back.

   csvAsWritten() below is downloadCsv()'s encoding, exactly. Testing against anything
   easier to write is what let this through: the earlier round-trip test joined the cells
   with a bare comma, which is not the file the button produces. */
const csvAsWritten = (rows) => rows
  .map(r => r.map(cell => '"' + String(cell ?? '').replace(/"/g, '""') + '"').join(','))
  .join('\r\n');

/* The cell splitter, on its own. */
check('a quoted cell comes out without its quotes',
  portal.splitCells('"T042","Ayanda","1986-09-07"'), ['T042', 'Ayanda', '1986-09-07']);
check('an unquoted line is unaffected',
  portal.splitCells('T042, Ayanda , 1986-09-07'), ['T042', 'Ayanda', '1986-09-07']);
check('a blank quoted cell is blank', portal.splitCells('"T042","",""'), ['T042', '', '']);
/* A QUOTED CELL MAY CONTAIN THE DELIMITER. A team written "Soweto, Vodacom" split into
   two cells before, silently, shifting every column after it — the figures then landed
   on neither team. */
check('a comma inside quotes does not split the cell',
  portal.splitCells('"T042","Soweto, Vodacom","1986-09-07"'),
  ['T042', 'Soweto, Vodacom', '1986-09-07']);
// Doubled quotes inside a quoted cell are one quote, as CSV has it.
check('a doubled quote is one quote',
  portal.splitCells('"T042","O""Brien"'), ['T042', 'O"Brien']);
// A quote only opens a cell, so an inch mark in the middle of one is left alone.
check('a quote in the middle of a cell is left where it is',
  portal.splitCells('T042,5" spanner'), ['T042', '5" spanner']);
// Tabs count as a delimiter whatever the delimiter is, because pasting cells straight
// out of Excel is the documented way to use these boxes.
check('a pasted row of tabs still splits',
  portal.splitCells('T042\tAyanda\t1986-09-07'), ['T042', 'Ayanda', '1986-09-07']);
check('and a semicolon file splits on its own delimiter',
  portal.splitCells('"T042";"Ayanda"', ';'), ['T042', 'Ayanda']);

/* THE STAFF LIST, as the button writes it. */
portal.data.employees = [
  { id: 'r1', name: 'Ayanda', surname: 'Ncube', employeeNumber: 'T042',
    province: 'Gauteng', teamName: 'Soweto Vodacom', vehicleRegistration: 'ND123456',
    cellNumber: '0821234567', dateOfBirth: '1986-09-07' }
];
portal.data.roster = [];
const staffCsv = csvAsWritten(portal.staffTemplateRows());
const staffBack = portal.parseRosterLines(staffCsv);
// One person, not two: the heading row is recognised through its quotes.
check('the staff list download parses back to exactly its people', staffBack.length, 1);
check('and the heading row is not read as a person',
  staffBack.some(r => /employee/i.test(r.employeeNumber)), false);
check('with every value free of quote marks',
  portal.rosterRowToStore(staffBack[0]),
  { key: 'T042', employeeNumber: 'T042', name: 'Ayanda', surname: 'Ncube',
    province: 'Gauteng', teamName: 'Soweto Vodacom', vehicleRegistration: 'ND123456',
    cellNumber: '0821234567', dateOfBirth: '1986-09-07' });

/* EVERY PERFORMANCE TEMPLATE. Driven from PERF_UPLOADS so a seventh upload cannot be
   added without this covering it. */
Object.keys(portal.PERF_UPLOADS).forEach(kind => {
  const rows = portal.perfTemplateRows(kind);
  const parsed = portal.parsePerformanceLines(csvAsWritten(rows), kind);
  check('the ' + kind + ' template uploads back with no errors', parsed.errors, []);
  // A wide file expands one row per network, so the count is not the row count.
  check('and the ' + kind + ' template is not empty once parsed', parsed.rows.length > 0, true);
});

/* THE DEBT BULK FILE. */
const debtCsv = csvAsWritten([portal.DEBT_COLUMNS, ...portal.DEBT_SAMPLE]);
const debtBack = portal.parseDebtLines(debtCsv);
check('the debt template uploads back with no errors', debtBack.errors, []);
check('and its lines survive', debtBack.rows.length, portal.DEBT_SAMPLE.length);
// The date is the field that quoting broke most quietly: "2026-09-01" with the quote
// marks on is not a date, so every invoice would have been refused or left unaged.
check('with the dates read as dates',
  debtBack.rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.invoiceDate)), true);

/* ---------------- the staff list, downloaded to be filled in and sent back ---------------- */
/* Aadil asked for a template built from his own database rather than from a spreadsheet.
   The point of it is one column: most records have no date of birth, and typing a few
   hundred into the employee form one at a time is not a plan. */
portal.data.employees = [
  // In both lists. The user record is the one an admin has been correcting by hand.
  { id: 'u1', name: 'Ayanda', surname: 'Ncube', employeeNumber: 'T042',
    province: 'Gauteng', teamName: 'Soweto Vodacom', vehicleRegistration: 'ND123456',
    cellNumber: '0821234567', dateOfBirth: '1986-09-07' },
  // Signed up, never on the official list.
  { id: 'u2', name: 'Bongi', surname: 'Ndlovu', employeeNumber: 'T099',
    province: 'Limpopo', teamName: 'Tzaneen', vehicleRegistration: '',
    cellNumber: '', dateOfBirth: '' },
  // No employee number at all.
  { id: 'u3', name: 'Nobody', surname: 'Here', employeeNumber: '' }
];
portal.data.roster = [
  { key: 'T042', employeeNumber: 'T042', name: 'AYANDA', surname: 'NCUBE',
    province: 'Gauteng', teamName: 'Soweto', vehicleRegistration: 'ND 123 456',
    cellNumber: '0111111111', dateOfBirth: '' },
  // On the official list, has not signed up. Still worth a row: a date of birth put on
  // it now attaches the moment they do.
  { key: 'T160', employeeNumber: 'T160', name: 'Thabo', surname: 'Magape',
    province: 'Gauteng', teamName: 'Krugersdorp', vehicleRegistration: '',
    cellNumber: '', dateOfBirth: '1979-03-11' }
];

const template = portal.staffTemplateRows();

// The header IS the parser's column list, not a second copy of it that can drift.
check('the download is headed with the columns the parser reads',
  template[0], portal.ROSTER_COLUMNS);
check('and every row is as wide as the header',
  template.slice(1).map(r => r.length),
  template.slice(1).map(() => portal.ROSTER_COLUMNS.length));

// Everybody with a number, from either side, exactly once.
check('everyone the system knows about, once each',
  template.slice(1).map(r => r[0]), ['T042', 'T099', 'T160']);
check('and somebody with no employee number is left out',
  template.slice(1).some(r => r[1] === 'Nobody'), false);

/* WHERE SOMEBODY IS IN BOTH, THE USER RECORD WINS. It is the one being corrected by
   hand and the one the app actually shows — "Soweto Vodacom" is the team the performance
   figures are keyed on, and the roster's older "Soweto" would undo that correction on
   the next upload. */
check('the user record wins over the older list',
  template.slice(1).find(r => r[0] === 'T042'),
  ['T042', 'Ayanda', 'Ncube', 'Gauteng', 'Soweto Vodacom', 'ND123456',
   '0821234567', '1986-09-07']);
// Field by field, though: a blank on the user record does not throw away something the
// official list supplied. T042's date of birth is on the user record; their cell number
// is on both and the user's wins; nothing is lost either way.
check('but a blank on the user record does not discard what the list has',
  portal.staffTemplateRows().slice(1).find(r => r[0] === 'T042')[6], '0821234567');

/* THE FILE IT PRODUCES MUST BE A FILE IT CAN READ. A template whose own parser refuses
   it is worse than no template — this is the check that caught the FY one. */
const asCsv = template.map(r => r.join(',')).join('\r\n');
const roundTripped = portal.parseRosterLines(asCsv);
check('the download parses straight back in', roundTripped.length, template.length - 1);
check('with the same people on it',
  roundTripped.map(r => r.employeeNumber), ['T042', 'T099', 'T160']);
check('and the dates of birth survive the trip',
  roundTripped.map(r => r.dateOfBirth), ['1986-09-07', '', '1979-03-11']);
// And uploading it back changes nothing for the person whose row was already right.
check('a row that came out of the system goes back in unchanged',
  portal.rosterRowToStore(roundTripped.find(r => r.employeeNumber === 'T042')),
  { key: 'T042', employeeNumber: 'T042', name: 'Ayanda', surname: 'Ncube',
    province: 'Gauteng', teamName: 'Soweto Vodacom', vehicleRegistration: 'ND123456',
    cellNumber: '0821234567', dateOfBirth: '1986-09-07' });
// Sorted by name, so two downloads of the same list can be compared to each other.
check('rows come out in name order',
  template.slice(1).map(r => r[1]), ['Ayanda', 'Bongi', 'Thabo']);

portal.data.roster = [];
portal.data.employees = [];
check('nothing to download is a header and nothing else',
  portal.staffTemplateRows().length, 1);

/* ---------------- how old they are ---------------- */
/* Derived, never stored. An age in the database is wrong for up to a year and nobody
   notices which part of the year it is wrong in; the date of birth is the fact. Today is
   passed in, so this is not a test that changes its answer overnight. */
check('an age is the years since, on the day',
  portal.ageOn('1986-09-07', '2026-09-07'), 40);
// The day before and the day after, which is where an off-by-one lives.
check('the day before their birthday they are still a year younger',
  portal.ageOn('1986-09-07', '2026-09-06'), 39);
check('and the day after they are not a year older again',
  portal.ageOn('1986-09-07', '2026-09-08'), 40);
// Month boundaries either way round, the case a naive month compare gets wrong.
check('a birthday later in the year has not happened yet',
  portal.ageOn('1986-12-31', '2026-09-07'), 39);
check('and one earlier in the year has',
  portal.ageOn('1986-01-01', '2026-09-07'), 40);

/* 29 FEBRUARY TURNS A YEAR OLDER ON THE 28th in a common year — the same day they get
   their greeting. The two have to agree: a card saying "happy birthday" beside an age
   that has not moved reads as a bug. */
check('somebody born on 29 February ages on the 28th in a common year',
  [portal.ageOn('1988-02-29', '2026-02-27'), portal.ageOn('1988-02-29', '2026-02-28')],
  [37, 38]);
check('and on the 29th in a leap year',
  [portal.ageOn('1988-02-29', '2028-02-28'), portal.ageOn('1988-02-29', '2028-02-29')],
  [39, 40]);

/* NOTHING RATHER THAN A GUESS, everywhere the date is not a date. Most records have no
   date of birth at all, and a 0 or a blank age on those would be read as fact. */
check('no date of birth is no age',
  ['', '   ', '07/09/1986', 'not a date', '1986-13-01'].map(d => portal.ageOn(d, '2026-09-07')),
  [null, null, null, null, null]);
/* A DATE IN THE FUTURE IS A TYPO, NOT A PERSON. "-59 years" on a staff record is worse
   than a blank — and this is the exact mistake the two-digit-year rule exists to catch,
   so the two guard the same ground from different sides. */
check('a date in the future gives nothing, not a negative age',
  [portal.ageOn('2086-09-07', '2026-09-07'), portal.ageOn('2026-09-08', '2026-09-07')],
  [null, null]);
check('and neither does an implausibly old one',
  portal.ageOn('1850-09-07', '2026-09-07'), null);

// The label, since it is what actually reaches the screen.
check('the label reads as years', portal.ageLabel('1986-09-07').endsWith('years'), true);
check('and a dash where there is nothing to show', portal.ageLabel(''), '—');

/* ---------------- a date of birth on the staff list ---------------- */
/* Aadil asked for a birthday message on every employee's main screen. The date has to
   get onto the record first, and the staff list is how a few hundred people get loaded
   at once — his own workbook has a D.O.B column. */
const roster = (line) => portal.parseRosterLines(line)[0];

check('the staff list carries a date of birth',
  roster('T042, Ayanda, Ncube, Gauteng, Soweto, ND123456, 0821234567, 1986-09-07')
    .dateOfBirth, '1986-09-07');
// However a spreadsheet wrote it, the same way the debt dates are read — day first for
// the slashed form, because that is what South Africa writes.
check('however the spreadsheet wrote it',
  ['1986-09-07', '07/09/1986', '7-Sep-86', '7 September 1986']
    .map(d => roster(`T042,A,N,Gauteng,Soweto,,,${d}`).dateOfBirth),
  ['1986-09-07', '1986-09-07', '1986-09-07', '1986-09-07']);

/* A TWO-DIGIT YEAR IS THE PREVIOUS CENTURY when this one would put it in the future.
   "7-Sep-86" is 1986 — nobody on the staff list was born in 2086 — while the same two
   digits on an invoice mean 2026 and must go on meaning that. */
/* THE THIRD CASE IS BUILT FROM NEXT YEAR, because "would be in the future" stops being
   true of any year you type in here. It was 26, expecting 1926, which is right until
   31 December 2026 and wrong every day after — this test would have gone red four months
   from now for a rule that had not changed. Next year is future whichever year it is run.
   (86 above is left as it is: it is the readable case, and it holds until 2086.) */
const yearAhead = new Date().getFullYear() + 1;
const twoDigitsAhead = String(yearAhead % 100).padStart(2, '0');
check('a two-digit birth year that would be in the future goes back a century',
  ['7-Sep-86', '07/09/86', `31/12/${twoDigitsAhead}`].map(portal.normaliseBirthDate),
  ['1986-09-07', '1986-09-07', `${yearAhead - 100}-12-31`]);
// Still in the past this century, so it is left where it is: a sixteen-year-old is
// likelier on a staff list than a hundred-and-sixteen-year-old.
check('and one that is already in the past is left alone',
  portal.normaliseBirthDate('1/9/10'), '2010-09-01');
/* A YEAR SPELLED OUT IN FULL IS TAKEN AS GIVEN, however implausible. Shifting it would
   be a silent hundred-year error on the one part of the date somebody was explicit
   about, and there is no way to tell from the result that it happened. */
check('a four-digit year is never moved',
  ['2086-09-07', '1986-09-07', '7-Sep-2086'].map(portal.normaliseBirthDate),
  ['2086-09-07', '1986-09-07', '2086-09-07']);
// The invoice dates it is built on are untouched by any of this.
check('an invoice date still reads a two-digit year as this century',
  portal.normaliseDate('7-Sep-26'), '2026-09-07');
check('and nothing readable is still nothing', portal.normaliseBirthDate('someday'), '');

/* SOMETHING UNREADABLE BECOMES BLANK, not a guess. A greeting on the wrong day is worse
   than no greeting, and the phone reads only yyyy-MM-dd — so anything that would not
   normalise must not be stored at all. It is counted instead, and named in the report. */
check('and something unreadable is left blank rather than guessed at',
  roster('T042,A,N,Gauteng,Soweto,,,sometime in 1986').dateOfBirth, '');
check('but what was in that column is kept so it can be counted',
  roster('T042,A,N,Gauteng,Soweto,,,sometime in 1986').dobCell, 'sometime in 1986');
check('a blank column is not counted as a failure',
  [roster('T042,A,N,Gauteng,Soweto,,,').dobCell,
   roster('T042,A,N,Gauteng,Soweto').dobCell], ['', '']);
// The report says how many read and how many did not, because this is the one column
// whose absence is invisible: no screen looks wrong, the person simply never gets
// greeted, and nobody finds out for a year.
check('the upload reports both counts',
  source.includes('have a date of birth')
  && source.includes('could not be read and were left blank'), true);

/* A PARTIAL LIST MUST NOT WIPE WHAT THE FULL ONE PUT THERE.
   Uploading a column of dates of birth against employee numbers used to write '' over
   the team and registration the authoritative list had already supplied. Nothing looked
   wrong — the damage only showed up later, when Fill from staff list had nothing left to
   correct anybody with. Blank columns are now dropped rather than stored. */
check('a blank column is not stored at all',
  Object.keys(portal.rosterRowToStore(
    portal.parseRosterLines('T042,,,,,,,1986-09-07')[0])).sort(),
  ['dateOfBirth', 'employeeNumber', 'key']);
check('and what the row does carry is all there',
  portal.rosterRowToStore(portal.parseRosterLines(
    'T042, Ayanda, Ncube, Gauteng, Soweto, ND123456, 0821234567, 1986-09-07')[0]),
  { key: 'T042', employeeNumber: 'T042', name: 'Ayanda', surname: 'Ncube',
    province: 'Gauteng', teamName: 'Soweto', vehicleRegistration: 'ND123456',
    cellNumber: '0821234567', dateOfBirth: '1986-09-07' });
// The counting field never reaches the document.
check('and the counting field is dropped with them',
  'dobCell' in portal.rosterRowToStore(
    portal.parseRosterLines('T042,A,N,,,,,sometime')[0]), false);

// Filling from the staff list carries it across, and only when the list has one — a
// blank column must never wipe a date already captured by hand.
check('filling from the staff list carries the date across',
  source.includes('if (entry.dateOfBirth && entry.dateOfBirth !== e.dateOfBirth)'), true);

/* ---------------- re-linking what belongs to somebody ---------------- */
/* The portal matches a figure to a person by EMPLOYEE NUMBER, so it attaches the moment
   they appear on the staff list. The phone cannot — a security rule cannot normalise an
   employee number to compare it, so each row carries the uid, resolved at upload time.
   A row uploaded BEFORE somebody signed up keeps an empty uid: the admin sees their pay
   and they do not. Asserted against the source, because the harness stubs Firestore. */
check('every uid-linked collection is covered',
  ['perfMonthly', 'perfFy', 'debtLines', 'debtPayments']
    .every(c => source.includes(`collection: '${c}'`)), true);

/* THE GUARD THAT MATTERS. Only EMPTY uids are filled. Overwriting one that already
   points at a person would move their pay onto a colleague — a far worse mistake than
   the one this fixes, and a silent one. */
check('it only looks at rows belonging to nobody',
  source.includes("where('uid', '==', '')"), true);
check('and there is no path that overwrites a uid already set',
  /uid: f\.person\.id/.test(source) && !/where\('uid', '!=', ''\)/.test(source), true);
// Merged rather than written whole, so linking a row cannot drop the figure on it.
check('the figures on the row survive being linked',
  source.includes('relinkedAtMillis: Date.now()') && source.includes('{ merge: true }'), true);

// Queried on equality rather than read whole: an equality filter needs no composite
// index and returns only the unlinked rows, so this stays cheap however many months
// have built up behind it.
check('it does not read every month to find them',
  source.includes("getDocs(query(collection(db, name), where('uid', '==', '')))"), true);

// Named in the question. "Link 34 rows" tells an admin nothing about whose they are.
check('the confirmation names the people',
  source.includes('people.join'), true);
check('and it says nothing when there is nothing to do',
  source.includes('Nothing to link'), true);
// Chunked for Firestore's batch cap like every other write here.
check('the writes chunk at the same size as the rest',
  source.includes('start += 400') , true);

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
  source.includes("const collectionName = perfOnFy(kind) ? 'perfFy'"), true);

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
