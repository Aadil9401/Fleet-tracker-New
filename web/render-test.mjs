/**
 * Rendering tests for the day view.
 *
 *   node web/render-test.mjs web/index.html
 *
 * The day table has several row shapes — a worked day, a day parked late, a reported
 * absence, and no entry at all — and they must all lay out on the same columns as the
 * header. They used to not: the absence and no-entry rows collapsed six columns into
 * one `colspan` cell, so a list of forty people alternated between eight-column and
 * three-column rows.
 *
 * That is invisible to a syntax check and to logic tests, because the page renders
 * perfectly happily either way. So this drives the real render function against stub
 * data and counts the cells.
 */
import { readFileSync } from 'fs';
import { loadPortal, writes } from './portal-harness.mjs';

const portal = await loadPortal(process.argv[2] ?? 'web/index.html', [
  'renderToday', 'data', 'PARK_BY', 'openTileModal', 'renderVehicles'
]);

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`
    + (ok ? '' : `  — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

/* Local time, matching millisFor() in the page. */
const at = (date, hhmm) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
};
const day = '2026-08-25';

/* One of each row shape: worked on time, absent, never turned up, parked late. */
portal.data.employees = [
  { id: 'u1', name: 'Sarah', surname: 'Dube', province: 'Eastern Cape', teamName: 'Mthatha' },
  { id: 'u2', name: 'John', surname: 'Smith', province: 'Gauteng', teamName: 'Jozi' },
  { id: 'u3', name: 'Thabo', surname: 'Nkosi', province: 'Limpopo', teamName: 'Polokwane' },
  { id: 'u4', name: 'Lerato', surname: 'Mokoena', province: 'Free State', teamName: 'Bloem' },
];
portal.data.todaysLogs = [
  { uid: 'u1', employeeName: 'Sarah Dube', date: day,
    startTimeMillis: at(day, '08:00'), endTimeMillis: at(day, '17:00'),
    startOdometerKm: 100, endOdometerKm: 150, mainAreasWorked: 'Umlazi' },
  { uid: 'u2', employeeName: 'John Smith', date: day,
    notWorking: true, notWorkingReason: 'Sick leave' },
  { uid: 'u4', employeeName: 'Lerato Mokoena', date: day,
    // 45 minutes past whatever the curfew is, so the badge text below is stable
    // when the curfew moves.
    startTimeMillis: at(day, '08:00'), endTimeMillis: at(day, portal.PARK_BY) + 45 * 60000,
    startOdometerKm: 200, endOdometerKm: 320, mainAreasWorked: 'Botshabelo' },
];
portal.data.dayFuelLogs = [];
portal.data.vehicles = [];

portal.renderToday();

const dayHtml = writes()['dayGroups'] ?? '';
// Body rows only — the <tr> in <thead> holds <th>, and counting it as a row would make
// the comparison below meaningless.
const body = dayHtml.slice(dayHtml.indexOf('<tbody>'));
const rows = body.split('<tr>').slice(1);
const headerCells = (dayHtml.slice(0, dayHtml.indexOf('<tbody>')).match(/<th[\s>]/g) ?? []).length;
// A cell opens as `<td>`, `<td class=…`, or `<td${…}` — the last is how a figure that
// needs colouring is written, so the pattern has to allow it or the count comes up short.
const cellCounts = rows.map(r => (r.match(/<td[\s>$]/g) ?? []).length);

check('the header defines 8 columns', headerCells, 8);
check('four rows rendered (on time, absent, late, no entry)', rows.length, 4);
check('every row lays out on the header columns', cellCounts, [8, 8, 8, 8]);
check('no row collapses columns with colspan', /colspan/.test(dayHtml), false);

/* The status of an exceptional row is carried by a badge in the name cell. */
check('the absence row is badged', dayHtml.includes('<span class="badge">Not working</span>'), true);
check('the no-entry row is badged', dayHtml.includes('<span class="badge off">No entry</span>'), true);
check('the absence reason survives', dayHtml.includes('Sick leave'), true);
check('a no-entry row still offers Record day', /data-entry="u3"/.test(dayHtml), true);

/* Name over detail, rather than one comma-run that reads as a wall in capitals. */
check('the name is its own line', dayHtml.includes('<div class="nm">Sarah Dube</div>'), true);
check('province and team sit under it',
  dayHtml.includes('<div class="meta">Eastern Cape · Mthatha</div>'), true);

/* The curfew, flagged on the knock-off itself. */
check('a knock-off past the curfew is badged, with how late it was',
  dayHtml.includes(`<span class="badge late" title="45 minutes after ${portal.PARK_BY}">Parked late</span>`), true);
check('only the late row is badged', (dayHtml.match(/badge late/g) ?? []).length, 1);
check('the on-time knock-off still shows its time', dayHtml.includes('17:00'), true);

/* Tiles state: one person of four has no entry, so it must not read as settled. */
const tiles = writes()['todayTiles'] ?? '';
check('parking late is flagged amber, not left in the resting colour',
  /class="tile warn"[\s\S]*?Parked late/.test(tiles), true);
check('a shortfall is flagged, not shown in the resting colour',
  /class="tile bad"[\s\S]*?Not started/.test(tiles), true);
check('nothing due renders calm rather than green',
  /class="tile calm"[\s\S]*?Service due/.test(tiles), true);

/* The exception card repeats the detail and the action, so it is not a dead end. */
const card = writes()['notStartedCard'] ?? '';
check('the no-entry card names the person', card.includes('Thabo Nkosi'), true);
check('the no-entry card carries their posting', card.includes('Limpopo · Polokwane'), true);
check('the no-entry card offers the same action', /data-entry="u3"/.test(card), true);

/* ---------------- every figure opens onto its rows ---------------- */
// Each tile is a button carrying the key its detail is looked up by. A tile whose key
// has no case in tileDetail() opens nothing at all, silently, so the set is pinned here.
const tileKeys = [...tiles.matchAll(/data-tile="([^"]+)"/g)].map(m => m[1]);
check('all eight figures are buttons', (tiles.match(/<button class="tile/g) ?? []).length, 8);
check('and each carries its lookup key', tileKeys,
  ['started', 'notstarted', 'knockedoff', 'hours', 'distance', 'fuel', 'late', 'service']);

/** Open a tile and hand back what it rendered. */
function opened(key) {
  portal.openTileModal(key);
  return { title: writes()['tileTitle'] ?? '', sub: writes()['tileSub'] ?? '', body: writes()['tileBody'] ?? '' };
}

const late = opened('late');
check('the late figure opens on the curfew', late.title, `Parked after ${portal.PARK_BY}`);
check('and names only the person who was late',
  [late.body.includes('Lerato Mokoena'), late.body.includes('Sarah Dube')], [true, false]);
check('with how late they were', late.body.includes('45 min'), true);

const missing = opened('notstarted');
check('no-entry opens on the person with no entry',
  [missing.body.includes('Thabo Nkosi'), missing.body.includes('Sarah Dube')], [true, false]);
check('and counts one person, not one row', missing.sub.includes('1 person'), true);

const started = opened('started');
check('started names everyone who clocked in',
  [started.body.includes('Sarah Dube'), started.body.includes('Lerato Mokoena'),
    started.body.includes('Thabo Nkosi')], [true, true, false]);

const hours = opened('hours');
check('hours ranks the longest day first',
  hours.body.indexOf('Lerato Mokoena') < hours.body.indexOf('Sarah Dube'), true);

// An absence is neither a start nor a distance, so it appears in neither.
check('an absence is not counted as a day worked',
  opened('distance').body.includes('John Smith'), false);

check('a figure of zero explains itself rather than showing an empty table',
  opened('service').body.includes('Nothing due.'), true);

/* ---------------- the reports table's column grid ---------------- */
// renderReport can't be driven from here — its rows live in a module-level `let` that
// an importer is not allowed to assign. So this checks the source instead, which is
// still enough to catch the way that grid actually drifts: a column added to the
// header without a matching cell in the row, or a stale colspan on the empty row.
const src = readFileSync(process.argv[2] ?? 'web/index.html', 'utf8');
const reportsTab = src.slice(src.indexOf('<section id="tab-reports"'), src.indexOf('<!-- EMPLOYEES'));
const thead = reportsTab.slice(reportsTab.indexOf('<thead>'), reportsTab.indexOf('</thead>'));
const repHeaders = (thead.match(/<th[\s>]/g) ?? []).length;

const repRowsAt = src.indexOf("$('repRows').innerHTML");
const rowStart = src.indexOf('rows.map(r => `<tr>', repRowsAt);
const rowCells = (src.slice(rowStart, src.indexOf('</tr>', rowStart)).match(/<td[\s>$]/g) ?? []).length;
const colspan = Number((src.slice(repRowsAt).match(/colspan="(\d+)"/) ?? [])[1]);

check('the report header and its row agree on the column count', rowCells, repHeaders);
check('the empty-report row spans every column', colspan, repHeaders);
check('every report column is sortable', (thead.match(/data-sort=/g) ?? []).length, repHeaders);
check('Parked late is one of them', /data-sort="late"/.test(thead), true);

/* ---------------- the fuel table's column grid ---------------- */
// Checked from source for the same reason as the reports grid above, and worth checking
// at all because this table lost a column: receipt photos were uploaded and linked here
// until there turned out to be nowhere to keep the images. Dropping a <th> and leaving
// the <td> or the colspan behind renders perfectly happily and misaligns every row.
const logsTab = src.slice(src.indexOf('<section id="tab-logs"'));
const fuelHead = logsTab.slice(logsTab.indexOf('<thead>'), logsTab.indexOf('</thead>'));
const fuelHeaders = (fuelHead.match(/<th[\s>]/g) ?? []).length;

const fuelRowsAt = src.indexOf("$('fuelRows').innerHTML");
const fuelRowStart = src.indexOf('<tr>', src.indexOf('return', fuelRowsAt));
const fuelCells = (src.slice(fuelRowStart, src.indexOf('</tr>', fuelRowStart)).match(/<td[\s>$]/g) ?? []).length;
const fuelColspan = Number((src.slice(fuelRowsAt).match(/colspan="(\d+)"/) ?? [])[1]);

check('the fuel header and its row agree on the column count', fuelCells, fuelHeaders);
check('the empty-fuel row spans every column', fuelColspan, fuelHeaders);
// The export shared the column, so it had to lose it too.
check('the receipt column is gone from the fuel export', /'Receipt'/.test(src), false);

/* ---------------- the fleet table ---------------- */
// Registrations are typed by hand in three places, so the same car arrives spelt three
// ways. The fleet list is where that shows most, and it is the list an admin scans.
portal.data.vehicles = [
  { id: 'v1', registrationNumber: 'bc45dfgp', name: '', currentOdometerKm: 30000,
    lastServiceOdometerKm: 15000, serviceIntervalKm: 15000, serviceIntervalMonths: 0 },
  { id: 'v2', registrationNumber: 'XY-67-ZW-GP', name: 'Bakkie 2', currentOdometerKm: 20000,
    lastServiceOdometerKm: 15000, serviceIntervalKm: 15000, serviceIntervalMonths: 0 }
];
portal.renderVehicles();
const fleet = writes()['vehRows'] ?? '';

check('a run-together plate is spaced out', fleet.includes('BC 45 DF GP'), true);
check('and so is a dashed one', fleet.includes('XY 67 ZW GP'), true);
check('the raw spelling is not what gets shown',
  [fleet.includes('bc45dfgp'), fleet.includes('XY-67-ZW-GP')], [false, false]);
// A vehicle with no name falls back to its plate, which should be the tidy one.
check('an unnamed vehicle is titled by its formatted plate',
  /class="nm">BC 45 DF GP</.test(fleet), true);
check('the fleet count is shown', writes()['vehCount'], 2);

// The grid, checked the same way as the other two tables.
const fleetTab = src.slice(src.indexOf('<section id="tab-vehicles"'), src.indexOf('<!-- LOGS'));
const fleetHead = fleetTab.slice(fleetTab.lastIndexOf('<thead>'), fleetTab.lastIndexOf('</thead>'));
const fleetHeaders = (fleetHead.match(/<th[\s>]/g) ?? []).length;
const fleetRowStart = fleet.indexOf('<tr>');
const fleetCells = (fleet.slice(fleetRowStart, fleet.indexOf('</tr>', fleetRowStart)).match(/<td[\s>]/g) ?? []).length;
check('the fleet header and its rows agree on the column count', fleetCells, fleetHeaders);

// An empty result must say why, or a search that matches nothing reads as an empty fleet.
portal.data.vehicles = [];
portal.renderVehicles();
check('an empty fleet explains itself',
  (writes()['vehRows'] ?? '').includes('No vehicles yet'), true);

console.log(failures === 0 ? '\nRENDER TESTS OK' : `\nRENDER TESTS FAILED — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
