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
  'renderToday', 'data', 'PARK_BY', 'openTileModal', 'renderVehicles',
  'employeeExportRows', 'filteredEmployees', 'filters', 'ALL_PROVINCES',
  'performanceRows', 'unmatchedPerformance', 'ratioPercent', 'percentLabel',
  'visiblePerformanceRows', 'perfFilters', 'performanceTotals', 'TEAM_LEVEL_FIELDS',
  'leaderboardRows', 'teamKey', 'performanceExportRows', 'monthsBack', 'PERF_HISTORY_MONTHS',
  'teamFiguresFor', 'networkKey', 'NETWORKS', 'NETWORK_LABELS', 'lbFilters',
  'tileFigureClass', 'rand', 'num', 'combinedPay',
  'fyRows', 'fyTotals', 'fyExportRows'
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
const body = dayHtml.slice(dayHtml.indexOf('<tbody>'), dayHtml.indexOf('</tbody>'));
const rows = body.split('<tr>').slice(1);
const headerCells = (dayHtml.slice(0, dayHtml.indexOf('<tbody>')).match(/<th[\s>]/g) ?? []).length;
// A cell opens as `<td>`, `<td class=…`, or `<td${…}` — the last is how a figure that
// needs colouring is written, so the pattern has to allow it or the count comes up short.
const cellCounts = rows.map(r => (r.match(/<td[\s>$]/g) ?? []).length);

check('the header defines 8 columns', headerCells, 8);
check('four rows rendered (on time, absent, late, no entry)', rows.length, 4);
check('every row lays out on the header columns', cellCounts, [8, 8, 8, 8]);
check('no row collapses columns with colspan', /colspan/.test(dayHtml), false);

/* The total line is a row like any other and must sit on the same grid. It is the one
   row an admin reads figures off without cross-checking, so a shifted column there is
   worse than a shifted column anywhere else in the table. */
const foot = dayHtml.slice(dayHtml.indexOf('<tfoot>'), dayHtml.indexOf('</tfoot>'));
check('the day table carries a total line', foot.length > 0, true);
check('the total line lays out on the header columns too',
  (foot.match(/<td[\s>$]/g) ?? []).length, headerCells);

/* The arithmetic on that line, against the four fixture rows above:
   Sarah 08:00–17:00 (9h, 50km) and Lerato 08:00–19:15 (11h 15m, 120km) worked,
   John is off, Thabo never logged in. */
check('the total names the group and its headcount', foot.includes('All provinces — 4 people'), true);
// "4 people" alone hides the difference between a province where everyone worked and
// one where half of them never logged in, which is the thing being looked for here.
check('and splits them by what actually happened', foot.includes('2 worked · 1 off · 1 no entry'), true);
check('hours are summed across the group', foot.includes('20h 15m'), true);
check('so is distance', foot.includes('170 km'), true);
// Nobody logged fuel, and a dash says that more honestly than R0,00 would.
check('a figure with nothing behind it shows a dash', /<td>—<\/td>/.test(foot), true);
check('the total shows when the group started', foot.includes('08:00'), true);
check('and when the last of them knocked off', foot.includes('19:15'), true);
// The absent-only case is checked properly at the foot of this file, by rendering it,
// rather than by asserting a whitespace pattern here that could never have matched.

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

/**
 * The markup of one tab, bounded by its own </section>.
 *
 * These used to be sliced up to whichever HTML comment came next, so adding a tab
 * between two sections quietly moved the boundary and a table's header was read from
 * the wrong table entirely — which is how a passing check started failing on a change
 * that touched neither table.
 */
const tabMarkup = (id) => {
  const start = src.indexOf(`<section id="tab-${id}"`);
  return src.slice(start, src.indexOf('</section>', start));
};
const reportsTab = tabMarkup('reports');
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
check('and so is cost per km', /data-sort="cpk"/.test(thead), true);

// The headline cost-per-km tile must divide the two totals, not average the rows'
// rates — the mean of everybody's rate is not the fleet's rate, and it flatters whoever
// drove least. Checked at source because renderReport cannot be driven from here, and
// this is the one figure where the wrong method still looks perfectly plausible.
check('the fleet cost per km divides the totals rather than averaging the rows',
  /\['Cost per km', costPerKmLabel\(totals\.fuel, totals\.km\)/.test(src), true);

/* ---------------- the fuel table's column grid ---------------- */
// Checked from source for the same reason as the reports grid above, and worth checking
// at all because this table lost a column: receipt photos were uploaded and linked here
// until there turned out to be nowhere to keep the images. Dropping a <th> and leaving
// the <td> or the colspan behind renders perfectly happily and misaligns every row.
// Found by its own tbody, then walked back to the nearest <thead> before it — rather
// than by taking the first thead in the tab. Adding a card above this table has moved
// that boundary twice now, and the check then read a different table's header entirely.
const headerAbove = (bodyId) => {
  const body = src.indexOf(`<tbody id="${bodyId}"`);
  const head = src.lastIndexOf('<thead>', body);
  return src.slice(head, src.indexOf('</thead>', head));
};
const fuelHeaders = (headerAbove('fuelRows').match(/<th[\s>]/g) ?? []).length;

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
const fleetTab = tabMarkup('vehicles');
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

/* ---------------- a day with nothing but an absence ---------------- */
// Last, because it replaces the fixtures the checks above read from. An absence has no
// hours and no distance, and must not set either end of the day: a total claiming a
// start time nobody worked would be inventing the shape of the day.
portal.data.employees = [{ id: 'x1', name: 'Solo', surname: 'Absent', province: 'Gauteng' }];
portal.data.todaysLogs = [{ uid: 'x1', employeeName: 'Solo Absent', date: day,
  notWorking: true, notWorkingReason: 'Sick leave' }];
portal.data.dayFuelLogs = [];
portal.renderToday();
const absentFoot = (writes()['dayGroups'] ?? '').slice(
  (writes()['dayGroups'] ?? '').indexOf('<tfoot>'));

check('an absence still counts as one of the group', absentFoot.includes('1 person'), true);
check('and is reported as off rather than as worked', absentFoot.includes('1 off'), true);

// By position, not by counting dashes: the row has four dashes in it either way, so a
// count passes even when the start cell is wrong. The columns are
// [who, start, knock off, hours, distance, fuel, areas, actions].
const footCells = [...absentFoot.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].trim());
check('the absent-only total still fills every column', footCells.length, 8);
check('an absence sets no start time', footCells[1], '—');
check('nor a knock-off time', footCells[2], '—');
check('and contributes no hours', footCells[3], '—');
check('nor any distance', footCells[4], '—');

/* ---------------- the employee CSV export ---------------- */
// This is the copy of the staff list that leaves the system, so what it contains and
// who it covers both matter more than usual.
portal.data.employees = [
  { id: 'e2', name: 'Zanele', surname: 'Buthelezi', province: 'Gauteng', teamName: 'Midrand',
    employeeNumber: '1002', cellNumber: '0821234567', contactEmail: 'z@example.com',
    email: 'zanele.buthelezi@cspc.local', vehicleRegistration: 'bc45dfgp',
    assignedVehicleId: 'v9', active: true, createdAt: 1756000000000 },
  { id: 'e1', name: 'Andile', surname: 'Adams', province: 'Western Cape', teamName: 'Cape Town',
    employeeNumber: '1001', cellNumber: '', contactEmail: '', email: 'andile.adams@cspc.local',
    vehicleRegistration: '', assignedVehicleId: '', active: false, createdAt: 0 }
];
portal.data.vehicles = [{ id: 'v9', registrationNumber: 'BC 45 DF GP', name: 'Magnite' }];
portal.data.lastActive = { e2: '2026-08-30' };
portal.filters.province = portal.ALL_PROVINCES;
portal.filters.query = '';

const exported = portal.employeeExportRows();
const exportHeader = exported[0];

check('the export has a header and a row per employee', exported.length, 3);
check('every row has as many fields as the header',
  exported.slice(1).map(r => r.length), [exportHeader.length, exportHeader.length]);
// Sorted by name, so two exports of the same list are comparable rather than arriving in
// whatever order Firestore handed them over.
check('rows are ordered by name', [exported[1][1], exported[2][1]], ['Andile', 'Zanele']);

// A Firestore document id means nothing in a spreadsheet; the vehicle's name does.
const zanele = exported[2];
check('the assigned vehicle is named, not given as an id',
  zanele[exportHeader.indexOf('Assigned vehicle')], 'Magnite');
check('the registration is spaced as it is shown everywhere else',
  zanele[exportHeader.indexOf('Vehicle registration')], 'BC 45 DF GP');
check('last active comes through', zanele[exportHeader.indexOf('Last active')], '2026-08-30');
check('an inactive account says so', exported[1][exportHeader.indexOf('Status')], 'Inactive');
// createdAt of 0 means it was never recorded, which is not the same as 1970.
check('a missing sign-up date is left blank, not dated 1970',
  exported[1][exportHeader.indexOf('Signed up')], '');

// Nothing secret should ever be in here. No password is stored anywhere — a generated one
// is shown once and discarded — so this guards against a future column reintroducing it.
check('no secret is exported',
  exportHeader.some(h => /password|secret|token|otp/i.test(h)), false);

// The export must cover exactly the list on screen. Exporting a different set than the
// table shows would be invisible to the person doing it.
portal.filters.province = 'Gauteng';
const filteredExport = portal.employeeExportRows();
check('the export follows the province filter', filteredExport.length, 2);
check('and covers exactly who the table shows',
  filteredExport.length - 1, portal.filteredEmployees().length);
portal.filters.province = portal.ALL_PROVINCES;

/* ---------------- performance figures ---------------- */
// A team's stock, connections and activations come from perfTeams and are looked up by
// team name; commission comes from perfMonthly and is the person's own. The ratios are
// the part that can go quietly wrong: a missing figure must read as unknown rather than
// as a conversion of nothing, and a team rate must divide totals, not average rates.
portal.data.employees = [
  { id: 'p1', name: 'Nomsa', surname: 'Dlamini', employeeNumber: 'T042',
    province: 'Gauteng', teamName: 'Midrand' },
  { id: 'p2', name: 'Sipho', surname: 'Khumalo', employeeNumber: 't-099',
    province: 'Western Cape', teamName: 'Cape Town' },
  // No team, so no team figures can reach them.
  { id: 'p3', name: 'Nothing', surname: 'Uploaded', employeeNumber: 'T105' }
];
portal.data.perfTeams = [
  // Uploaded as "midrand" — the team name matches however it was typed.
  { teamKey: 'MIDRAND', team: 'midrand', month: '2026-09',
    stock: 600, connections: 450, activations: 380 },
  // Stock and connections in, activations not yet — separate files.
  { teamKey: 'CAPE TOWN', team: 'Cape Town', month: '2026-09', stock: 500, connections: 0 },
  // A team name nobody on the staff list is on.
  { teamKey: 'GHOST TOWN', team: 'Ghost Town', month: '2026-09', stock: 100 }
];
portal.data.perfMonthly = [
  { numberKey: 'T042', employeeNumber: 'T042', uid: 'p1', month: '2026-09',
    commissionRands: 12500.5, basicSalaryRands: 6200 },
  // Basic pay with no commission: a real case, and it must not read as no pay at all.
  { numberKey: 'T099', employeeNumber: 't-099', uid: 'p2', month: '2026-09',
    basicSalaryRands: 6200 },
  // Uploaded against an employee number nobody has.
  { numberKey: 'GHOST9', employeeNumber: 'GHOST9', uid: '', month: '2026-09',
    commissionRands: 99 }
];

const perf = portal.performanceRows('2026-09');
const byName = Object.fromEntries(perf.map(r => [r.name, r]));
const nomsa = byName['Nomsa Dlamini'];

check('all four figures are read off the month',
  [nomsa.stock, nomsa.connections, nomsa.activations, nomsa.commissionRands],
  [600, 450, 380, 12500.5]);

/* Basic pay, which arrives in its own file and shares the person's document with
   commission — so loading one must never look like it wiped the other. */
check('basic pay is read alongside commission', nomsa.basicSalaryRands, 6200);
check('and basic with no commission is basic, not nothing',
  [byName['Sipho Khumalo'].basicSalaryRands, byName['Sipho Khumalo'].commissionRands],
  [6200, null]);
// Both are a person's own pay, so both are simply summed — no team de-duplication.
const payTotals = portal.performanceTotals(portal.performanceRows('2026-09'));
check('both are summed across people', [payTotals.basic, payTotals.commission],
  [12400, 12500.5]);
check('and neither moves when a network is chosen',
  [portal.performanceTotals(portal.performanceRows('2026-09', 'MTN')).basic,
   portal.performanceTotals(portal.performanceRows('2026-09', 'MTN')).commission],
  [12400, 12500.5]);

/* The three ratios. Each divides a figure by the earlier one it came from. */
check('stock to connections', portal.ratioPercent(nomsa.connections, nomsa.stock).toFixed(1), '75.0');
check('connections to activations', portal.ratioPercent(nomsa.activations, nomsa.connections).toFixed(1), '84.4');
// Named the way the column is: "from → to", showing to ÷ from. So stock → act is
// activations over stock — the end-to-end conversion. The label used to read the other
// way round and claimed to be stock over activations, which is not what it computes.
check('stock to activations, the end to end figure',
  portal.ratioPercent(nomsa.activations, nomsa.stock).toFixed(1), '63.3');
check('and written out for reading', portal.percentLabel(63.333), '63,3%');

/* Zero connections against real stock is a genuine 0% — stock was issued and nothing
   came of it. That is information, and it must not be hidden as unknown. */
const sipho = byName['Sipho Khumalo'];
check('a real zero converts to a real 0%', portal.ratioPercent(sipho.connections, sipho.stock), 0);
check('which reads as 0,0% rather than a dash', portal.percentLabel(0), '0,0%');

/* But a missing figure is unknown, and 0% would read as "converted nothing" when it
   means "nobody has sent the file". */
check('a ratio with a figure not yet uploaded is unknown',
  portal.ratioPercent(sipho.activations, sipho.connections), null);
check('and shows a dash', portal.percentLabel(null), '—');
check('dividing by zero is unknown, not infinite', portal.ratioPercent(50, 0), null);
check('and so is dividing by a figure never uploaded', portal.ratioPercent(50, null), null);

/* Not capped: more connections than stock means the stock figure is understated or
   carried over, which is worth seeing rather than rounding away to a neat 100%. */
check('over a hundred per cent is shown as it is',
  portal.percentLabel(portal.ratioPercent(120, 100)), '120,0%');

/* A team ratio divides the two totals. The mean of everybody's conversion rate is not
   the team's, and it flatters whoever was given least stock. */
const heavy = { activations: 380, stock: 600 };   // 63,3%
const light = { activations: 9, stock: 10 };      // 90,0%
const meanOfRates = (portal.ratioPercent(heavy.activations, heavy.stock) +
  portal.ratioPercent(light.activations, light.stock)) / 2;
const teamRate = portal.ratioPercent(heavy.activations + light.activations, heavy.stock + light.stock);
check('the mean of the rates is not the team rate', meanOfRates.toFixed(1), '76.7');
check('the team rate divides the totals', teamRate.toFixed(1), '63.8');

// Somebody with nothing at all still has to appear, or an incomplete upload looks
// complete and the person is simply invisible.
check('an employee with no figures still appears',
  [byName['Nothing Uploaded'].stock, byName['Nothing Uploaded'].connections], [null, null]);

// A number matching nobody belongs to nobody and nobody can see it, so the admin must.
const ghosts = portal.unmatchedPerformance('2026-09');
check('figures against an unknown employee number are surfaced', ghosts.map(g => g.key), ['GHOST9']);
check('with how many rows are affected', ghosts[0].count, 1);

// Another month must not inherit September's figures.
check('another month is empty rather than inheriting',
  portal.performanceRows('2026-10').every(r => r.stock === null), true);

/* Posting comes off the employee record, not the upload — the figures arrive with an
   employee number and nothing else, and a posting typed into a spreadsheet would go
   stale the moment somebody moved province. */
check('the posting is read from the employee record',
  [nomsa.province, nomsa.team], ['Gauteng', 'Midrand']);

/* The filters. An export covering a different set than the table shows would be
   invisible to whoever ran it, so both go through visiblePerformanceRows(). */
// The month has to be set for visiblePerformanceRows(), which reads it off the picker.
writes()['perfMonth'] = '2026-09';
const allRows = portal.visiblePerformanceRows().length;
// Three people on the staff list. The GHOST9 figures are NOT a fourth row: they belong
// to nobody, so they are reported on their own card rather than as a phantom employee.
check('unfiltered, everyone on the staff list appears and nobody else', allRows, 3);

portal.perfFilters.province = 'Gauteng';
check('filtering by province narrows the table',
  portal.visiblePerformanceRows().map(r => r.name), ['Nomsa Dlamini']);

portal.perfFilters.province = '';
portal.perfFilters.team = 'Cape Town';
check('and so does filtering by team',
  portal.visiblePerformanceRows().map(r => r.name), ['Sipho Khumalo']);

portal.perfFilters.team = '';
// Matching is a substring of the normalised number, so "t042" and "42" both find T042.
// "t42" deliberately does not: skipping the leading zero would mean guessing, and a
// search that quietly matches the wrong person is worse than one that finds nobody.
portal.perfFilters.query = 't042';
check('the search matches an employee number as typed',
  portal.visiblePerformanceRows().map(r => r.name), ['Nomsa Dlamini']);
portal.perfFilters.query = '42';
check('and matches part of one', portal.visiblePerformanceRows().map(r => r.name), ['Nomsa Dlamini']);
portal.perfFilters.query = 't42';
check('but does not invent a match across a leading zero',
  portal.visiblePerformanceRows().length, 0);

portal.perfFilters.query = 'midrand';
check('and matches a team name too',
  portal.visiblePerformanceRows().map(r => r.name), ['Nomsa Dlamini']);

portal.perfFilters.query = '';
check('clearing the filters restores everyone', portal.visiblePerformanceRows().length, allRows);

/* The export's columns. A header and a row that disagree by one shifts every figure
   after it, and a spreadsheet of shifted percentages looks perfectly reasonable. */
const perfExport = portal.performanceExportRows('2026-09');
check('the export has a header and a row per person', perfExport.length, 4);
// Against the header's own width, not a literal: the check is that they AGREE.
check('every row has as many fields as the header',
  perfExport.slice(1).map(r => r.length),
  perfExport.slice(1).map(() => perfExport[0].length));
check('and the network the figures are for is one of the columns',
  perfExport[0].includes('Network'), true);
check('basic salary is its own column, next to commission',
  [perfExport[0].includes('Basic salary R'), perfExport[0].includes('Commission R')],
  [true, true]);
const payRow = perfExport.find(r => r[0] === 'Nomsa Dlamini');
check('and lands under its own heading',
  [payRow[perfExport[0].indexOf('Basic salary R')],
   payRow[perfExport[0].indexOf('Commission R')]],
  ['6200.00', '12500.50']);
check('which says so plainly when no single network is chosen',
  perfExport[1][perfExport[0].indexOf('Network')], 'All networks');

// Positions matter as much as the count, so the three percentages are checked where the
// header says they are.
const perfHeader = perfExport[0];
const nomsaRow = perfExport.find(r => r[0] === 'Nomsa Dlamini');
check('stock to connection lands under its own heading',
  nomsaRow[perfHeader.indexOf('Stock to connection %')], '75.0');
check('connection to activation too',
  nomsaRow[perfHeader.indexOf('Connection to activation %')], '84.4');
check('and stock to activation, named the way it is calculated',
  nomsaRow[perfHeader.indexOf('Stock to activation %')], '63.3');
check('the posting is exported as its own columns',
  [nomsaRow[perfHeader.indexOf('Province')], nomsaRow[perfHeader.indexOf('Team')]],
  ['Gauteng', 'Midrand']);
// Blank, not 0 — a spreadsheet would average a nought in as though it were a figure.
const emptyRow = perfExport.find(r => r[0] === 'Nothing Uploaded');
check('a figure nobody uploaded exports blank rather than zero',
  [emptyRow[perfHeader.indexOf('Stock')], emptyRow[perfHeader.indexOf('Stock to connection %')]],
  ['', '']);

/* The read window. Both collections used to be read whole on every page load, which
   grows for ever; the pickers are bounded to what is actually loaded. */
check('the window is two years', portal.PERF_HISTORY_MONTHS, 24);
check('and names a month, not a date', /^\d{4}-(0[1-9]|1[0-2])$/.test(portal.monthsBack(24)), true);
check('zero months back is this month', portal.monthsBack(0), new Date().toISOString().slice(0, 7));

// Counted independently, as months since year zero, so the assertion does not just
// restate the implementation. Ordering alone was not enough: a version that took the
// count modulo 12 still produced an earlier month and sailed through.
const monthIndex = (m) => {
  const [year, month] = m.split('-').map(Number);
  return year * 12 + (month - 1);
};
const thisMonth = monthIndex(portal.monthsBack(0));
check('n months back really is n months back — including across a year boundary',
  [1, 11, 12, 13, 24].map(n => thisMonth - monthIndex(portal.monthsBack(n))),
  [1, 11, 12, 13, 24]);

/* ---------------- a team's figure counted once ---------------- */
// Every member of a team carries the same stock, connections and activations, because
// those belong to the team. Summing the rows would count a two-person team twice.
// Commission is each person's own pay and is always summed — getting that backwards
// misreports money, which is why it is asserted first.
check('commission is not treated as a team figure',
  portal.TEAM_LEVEL_FIELDS.includes('commissionRands'), false);

// A row as performanceRows() builds one: the team's figures looked up, plus own pay.
const member = (name, provinceName, teamName, over) => ({
  numberKey: name, name, province: provinceName,
  team: teamName, teamKey: portal.teamKey(teamName),
  stock: null, connections: null, activations: null, commissionRands: null, ...over
});

// Two people in one team, both carrying their team's figures.
const shared = [
  member('A', 'Gauteng', 'Soweto',
    { stock: 600, connections: 450, activations: 380, commissionRands: 5000 }),
  member('B', 'Gauteng', 'Soweto',
    { stock: 600, connections: 450, activations: 380, commissionRands: 5000 })
];
const sharedTotals = portal.performanceTotals(shared);
check('the team figure counts once, not once per member',
  [sharedTotals.stock, sharedTotals.connections, sharedTotals.activations], [600, 450, 380]);
check('but both commissions count, because that is their own pay',
  sharedTotals.commission, 10000);

// A third member adds nothing to the team figures, which is the whole point.
const three = [...shared, member('C', 'Gauteng', 'Soweto',
  { stock: 600, connections: 450, activations: 380, commissionRands: 4000 })];
check('a third member of the same team adds no team figures',
  portal.performanceTotals(three).stock, 600);
check('but does add their commission', portal.performanceTotals(three).commission, 14000);

// Two teams are two figures.
const twoTeams = [
  member('A', 'Gauteng', 'Soweto', { stock: 600 }),
  member('B', 'Gauteng', 'Tembisa', { stock: 500 })
];
check('two different teams are both counted', portal.performanceTotals(twoTeams).stock, 1100);

// Team figures are keyed on the team NAME, so the same name is the same team wherever
// its people are posted. Checked against the real staff list before settling on this:
// 39 distinct teams, no name used in two provinces. If that ever changes, the two would
// share a figure, and the template would need a province column.
const sameNameTwoProvinces = [
  member('A', 'Gauteng', 'Central', { stock: 600 }),
  member('B', 'Western Cape', 'Central', { stock: 600 })
];
check('one team name is one team, wherever its people are posted',
  portal.performanceTotals(sameNameTwoProvinces).stock, 600);

// Somebody with no team can carry no team figures, so contributes nothing to those three
// — but their own commission still counts.
const noTeam = [member('A', 'Gauteng', '', { commissionRands: 3000 })];
check('a person with no team adds no team figures',
  portal.performanceTotals(noTeam).stock, null);
check('but their commission is still theirs', portal.performanceTotals(noTeam).commission, 3000);

/* A figure nobody uploaded is NULL, so the tile shows a dash.
   This pair of assertions used to want 0 — under this very name. The totals started at
   zero and were added to, so a file that had not arrived came out as 0 and the tile read
   "R0,00" or "0", which says the team sold none rather than that nothing was counted
   yet. The table directly beneath showed a dash for the same figure, so one screen gave
   two answers and the confident-looking one was wrong. */
const partly = [member('A', 'Gauteng', 'Soweto', { stock: 600 })];
check('a figure never uploaded is null rather than counted as 0',
  [portal.performanceTotals(partly).stock, portal.performanceTotals(partly).connections],
  [600, null]);

/* And the distinction that makes it worth the trouble: a REAL zero survives. Stock
   issued and nothing sold is a result and must not read as a missing file. */
const soldNothing = [member('A', 'Gauteng', 'Soweto', { stock: 600, connections: 0 })];
check('but a real zero is kept as a zero',
  [portal.performanceTotals(soldNothing).stock, portal.performanceTotals(soldNothing).connections],
  [600, 0]);

// The same rule for pay, which is where it was noticed: a month with no pay file must
// not read as a month nobody was paid.
const noPay = [member('A', 'Gauteng', 'Soweto', { stock: 600 })];
check('no pay uploaded is null, not R0,00',
  [portal.performanceTotals(noPay).basic, portal.performanceTotals(noPay).commission],
  [null, null]);
const basicOnly = [member('A', 'Gauteng', 'Soweto', { basicSalaryRands: 6200 })];
check('basic uploaded without commission gives basic and a dash',
  [portal.performanceTotals(basicOnly).basic, portal.performanceTotals(basicOnly).commission],
  [6200, null]);
const zeroPaid = [member('A', 'Gauteng', 'Soweto', { basicSalaryRands: 0, commissionRands: 0 })];
check('and a real nought paid is still nought',
  [portal.performanceTotals(zeroPaid).basic, portal.performanceTotals(zeroPaid).commission],
  [0, 0]);

/* Basic and commission added, and only when BOTH are there.

   Adding a known figure to an absent one made the combined tile equal the commission
   tile exactly, which is what a broken sum looks like — two tiles side by side showing
   the same amount. The rule is the same one the phone already applied, so this is the
   pair of assertions that stops the two disagreeing again. */
// The PORTAL's rule, not a copy of it — see combinedPay(). Re-implementing it here
// proved only that the test agreed with itself, and a mutation that broke the real
// rule passed.
const bothPay = portal.combinedPay;

check('the two add up when both are uploaded',
  bothPay(portal.performanceTotals(
    [member('A', 'Gauteng', 'Soweto', { basicSalaryRands: 6200, commissionRands: 5690 })])),
  11890);
check('but commission alone does not become a combined total',
  bothPay(portal.performanceTotals(
    [member('A', 'Gauteng', 'Soweto', { commissionRands: 5690 })])),
  null);
check('nor does basic alone',
  bothPay(portal.performanceTotals(
    [member('A', 'Gauteng', 'Soweto', { basicSalaryRands: 6200 })])),
  null);
// Two real noughts still add to a real nought, which is not the same as nothing.
check('and two real noughts add to nought', bothPay(portal.performanceTotals(zeroPaid)), 0);

/* A tile's figure is drawn smaller when it is long.

   rand() joins its thousands with a NON-BREAKING space, so a long amount can neither
   wrap nor shrink on its own: "R264 689,00" at the full size was wider than the tile and
   sat on top of the one beside it, with its last digit hidden. CSS cannot measure text,
   so the size comes off the string's length. */
check('a short figure is drawn at full size',
  ['761 350', '20,0%', '—', 'R0,00'].map(portal.tileFigureClass), ['', '', '', '']);
check('an amount that would overflow is drawn smaller',
  portal.tileFigureClass(portal.rand(264689)), ' long');
check('and a very long one smaller still',
  portal.tileFigureClass(portal.rand(3686330.5)), ' longer');
// The thing that caused it, stated so nobody "tidies" the separator away and wonders
// why the tiles break: this space cannot be broken across lines.
check('money really does carry a non-breaking space',
  portal.rand(264689).includes(String.fromCharCode(160)), true);
// And so does a count: en-ZA groups with a non-breaking space of its own, so num()'s
// replace of commas never fires. Neither kind of figure can wrap, which is why the
// sizing has to cover both rather than money alone.
check('and so does a count, for the same reason',
  portal.num(761350).includes(String.fromCharCode(160)), true);
check('so neither kind can wrap, and both are sized by length',
  [portal.tileFigureClass(portal.num(12345678)),
   portal.tileFigureClass(portal.rand(264689))],
  [' long', ' long']);

/* A ratio over a figure that was never uploaded is unknown, not 0% — which follows for
   free once the total is null, and is the reason it has to be null rather than 0. */
check('and a percentage over a missing figure is unknown',
  portal.percentLabel(portal.ratioPercent(
    portal.performanceTotals(partly).connections,
    portal.performanceTotals(partly).stock)),
  '—');

/* ---------------- the leaderboard ---------------- */
// By team, ranked highest first, positions only. The figures are hidden, so nobody can
// check the board against them — which makes every rule below one that has to be right.
portal.data.employees = [
  { id: 'l1', name: 'A', surname: 'One', employeeNumber: 'T001', province: 'Gauteng', teamName: 'Soweto' },
  { id: 'l2', name: 'B', surname: 'Two', employeeNumber: 'T002', province: 'Gauteng', teamName: 'Soweto' },
  { id: 'l3', name: 'C', surname: 'Three', employeeNumber: 'T003', province: 'Gauteng', teamName: 'Tembisa' },
  { id: 'l4', name: 'D', surname: 'Four', employeeNumber: 'T004', province: 'Limpopo', teamName: 'Polokwane' },
  { id: 'l5', name: 'E', surname: 'Five', employeeNumber: 'T005', province: 'Limpopo', teamName: 'Tzaneen' },
  { id: 'l7', name: 'G', surname: 'Seven', employeeNumber: 'T007', province: 'Mpumalanga', teamName: 'Nelspruit' },
  // No team recorded: cannot be placed among teams.
  { id: 'l6', name: 'F', surname: 'Six', employeeNumber: 'T006', province: 'Limpopo' }
];
portal.data.perfTeams = [
  // One figure per team, so Soweto's two members share it without anything having to
  // work out that they do.
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-09', connections: 500, activations: 100 },
  { teamKey: 'TEMBISA', team: 'Tembisa', month: '2026-09', connections: 700, activations: 100 },
  { teamKey: 'POLOKWANE', team: 'Polokwane', month: '2026-09', connections: 500, activations: 400 },
  // Nelspruit sits BELOW the tie on purpose — see the ranking check further down.
  { teamKey: 'NELSPRUIT', team: 'Nelspruit', month: '2026-09', connections: 300, activations: 50 },
  // Tzaneen: a real team with nothing uploaded.
  // And a figure against a team nobody is on, which counts towards nothing.
  { teamKey: 'GHOST TOWN', team: 'Ghost Town', month: '2026-09', connections: 900 }
];
portal.data.perfMonthly = [];

const board = portal.leaderboardRows('2026-09', 'connections');

check('a two-person team is one row, not two',
  board.rows.filter(r => r.team === 'Soweto').length, 1);
check('and its people are counted',
  board.rows.find(r => r.team === 'Soweto').people, 2);

/* Ghost Town 900, Tembisa 700, Polokwane and Soweto tied on 500, Nelspruit 300, Tzaneen
   unranked.

   Ghost Town is in the figures and on nobody's record, and it is RANKED — it has the
   month's best figure and it takes first. Ranking only the teams somebody is posted to
   was the obvious reading and it is wrong: an employee may read their own user document
   and no others, so the phone app cannot know which teams are on the staff list. The
   only set both implementations can agree on is "teams with a figure this month", and
   without that agreement the same team in the same month would show one position here
   and another on the phone, with the figures hidden so nobody could tell which was
   right. */
check('teams run highest first',
  board.rows.map(r => r.team),
  ['Ghost Town', 'Tembisa', 'Polokwane', 'Soweto', 'Nelspruit', 'Tzaneen']);
check('a team with a figure and nobody on it is ranked, not set aside',
  board.rows.find(r => r.team === 'Ghost Town').position, 1);
check('and carries no people, which is what says its figure counts towards nothing',
  board.rows.find(r => r.team === 'Ghost Town').people, 0);
// Competition ranking: the tie for second is followed by FOURTH, not third. Dense
// ranking would say third, which reads as though somebody came third when nobody did.
// Nelspruit sits below the tie precisely so the two schemes give different answers here.
check('equal figures share a position and the next one skips',
  board.rows.map(r => r.position), [1, 2, 3, 3, 5, null]);

// The one thing a leaderboard must not get wrong: a missing upload is not last place.
check('a team with nothing uploaded has no position, rather than being placed last',
  board.rows.find(r => r.team === 'Tzaneen').position, null);
check('and it is listed after the ranked teams',
  board.rows[board.rows.length - 1].team, 'Tzaneen');

// Somebody with no team cannot be placed, and the count is reported rather than the
// person quietly vanishing off a board nobody could then reconcile.
check('employees with no team are counted, not silently dropped', board.withoutTeam, 1);

// No figure may reach the caller — not on screen, and not in the export either.
check('no figure is carried on a board row',
  board.rows.every(r => !('figure' in r) && !('connections' in r) && !('activations' in r)), true);

// Ranking on the other metric reorders it: Polokwane's 400 activations beat the rest.
const byActivations = portal.leaderboardRows('2026-09', 'activations');
check('ranking on activations gives a different order',
  byActivations.rows.map(r => r.team),
  ['Polokwane', 'Soweto', 'Tembisa', 'Nelspruit', 'Ghost Town', 'Tzaneen']);
check('with its own tie for second, and a fourth below it',
  byActivations.rows.map(r => r.position), [1, 2, 2, 4, null, null]);
/* Ghost Town led on connections and has no activations at all, so it drops to unranked
   rather than to last. Being top of one board is not evidence about the other. */
check('a team that led one board is unranked on the other rather than placed last',
  byActivations.rows.find(r => r.team === 'Ghost Town').position, null);

// The board and the Performance tiles must agree on what a team carries.
// Soweto once (not twice for its two members), plus Tembisa, Polokwane and Nelspruit.
// Tzaneen has nothing uploaded and adds nothing. Ghost Town's 900 counts towards
// NOTHING, because nobody is on it — which is precisely why the board reports it by
// name instead of letting it quietly inflate a total.
/* The board and the tiles now cover deliberately different sets, and this is the pair of
   assertions that says so out loud. The board ranks every team with a figure, Ghost Town
   included. The tiles are built from the EMPLOYEE rows, so a team nobody is on
   contributes nothing to them — its 900 connections are real, and they belong to no one
   on the staff list. The board naming it is what keeps that visible rather than letting
   the two numbers quietly disagree. */
check('the tiles count only teams somebody is posted to',
  portal.performanceTotals(portal.performanceRows('2026-09')).connections,
  500 + 700 + 500 + 300);
// Four teams make up that total; five are ranked. The fifth is Ghost Town.
check('while the board ranks one more team than the tiles count',
  portal.leaderboardRows('2026-09', 'connections').rows
    .filter(r => r.position !== null).length,
  5);
check('and that team is the one nobody is posted to',
  portal.leaderboardRows('2026-09', 'connections').rows
    .filter(r => r.position !== null && r.people === 0).map(r => r.team),
  ['Ghost Town']);
check('and a figure against a team nobody is on is reported, not counted',
  portal.leaderboardRows('2026-09', 'connections').unknownTeams, ['Ghost Town']);

/* ---------------- figures split by network ---------------- */
/* A team's month is now several rows, one per network. Two things can go quietly wrong
   and both read as a good month rather than as an error, so both are pinned here:
   summing a network twice, and summing figures uploaded before networks existed
   alongside the ones that replaced them. */
portal.data.employees = [
  { id: 'n1', name: 'Ayanda', surname: 'Ncube', employeeNumber: 'N001',
    province: 'Gauteng', teamName: 'Soweto' },
  { id: 'n2', name: 'Bongi', surname: 'Ndlovu', employeeNumber: 'N002',
    province: 'Gauteng', teamName: 'Tembisa' },
  // Only ever sold Telkom, so has nothing at all on the other three.
  { id: 'n3', name: 'Cebo', surname: 'Nkosi', employeeNumber: 'N003',
    province: 'Limpopo', teamName: 'Tzaneen' }
];
portal.data.perfMonthly = [];
portal.data.perfTeams = [
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-09', network: 'MTN',
    stock: 100, connections: 60, activations: 30 },
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-09', network: 'VODACOM',
    stock: 300, connections: 240, activations: 120 },
  { teamKey: 'TEMBISA', team: 'Tembisa', month: '2026-09', network: 'MTN',
    stock: 500, connections: 100, activations: 40 },
  // One network only: its figure must survive, not be treated as no figure at all.
  { teamKey: 'TZANEEN', team: 'Tzaneen', month: '2026-09', network: 'TELKOM',
    stock: 200, connections: 150, activations: 90 }
];

const allNet = portal.teamFiguresFor('2026-09', '');
check('with no network chosen a team is the sum of its networks',
  [allNet['SOWETO'].stock, allNet['SOWETO'].connections, allNet['SOWETO'].activations],
  [400, 300, 150]);
check('and a team selling one network keeps that one figure',
  allNet['TZANEEN'].stock, 200);

const mtn = portal.teamFiguresFor('2026-09', 'MTN');
check('choosing a network gives that network alone', mtn['SOWETO'].stock, 100);
check('and leaves out a team with nothing on it', 'TZANEEN' in mtn, false);
check('however the network was written',
  portal.teamFiguresFor('2026-09', 'mtn')['SOWETO'].stock, 100);

const telkom = portal.teamFiguresFor('2026-09', 'TELKOM');
check('a different network gives different figures', telkom['TZANEEN'].connections, 150);
check('and Soweto, which sells none of it, is absent', 'SOWETO' in telkom, false);

/* The ratios must divide within the chosen network. Soweto on Vodacom converted 240 of
   300; across all networks it converted 300 of 400. Dividing one network's connections
   by every network's stock would report 60%, which is nobody's number. */
check('a ratio divides within the network it is shown for',
  portal.ratioPercent(portal.teamFiguresFor('2026-09', 'VODACOM')['SOWETO'].connections,
    portal.teamFiguresFor('2026-09', 'VODACOM')['SOWETO'].stock).toFixed(1), '80.0');
check('and across all of them uses both totals',
  portal.ratioPercent(allNet['SOWETO'].connections, allNet['SOWETO'].stock).toFixed(1), '75.0');

/* Figures uploaded before networks existed carry no network. Alone they still read, so
   nothing already uploaded disappears. */
portal.data.perfTeams = [
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-09', stock: 400, connections: 300 }
];
check('a figure from before networks existed is still read',
  portal.teamFiguresFor('2026-09', '')['SOWETO'].stock, 400);
check('but belongs to no network, so a network filter excludes it',
  'SOWETO' in portal.teamFiguresFor('2026-09', 'MTN'), false);

/* And the guard that matters: once networked figures arrive for that team and month,
   the old network-free row is DROPPED. Counting both would report 800 stock for a team
   that has 400, and a doubled total reads as a good month rather than as a fault. */
portal.data.perfTeams = [
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-09', stock: 400, connections: 300 },
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-09', network: 'MTN',
    stock: 100, connections: 60 },
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-09', network: 'VODACOM',
    stock: 300, connections: 240 }
];
check('a networked upload replaces the network-free figure rather than adding to it',
  portal.teamFiguresFor('2026-09', '')['SOWETO'].stock, 400);
check('and its connections likewise',
  portal.teamFiguresFor('2026-09', '')['SOWETO'].connections, 300);
// Deliberately stated: 500 is what summing all three rows would give.
check('which is not the sum of every row present',
  portal.teamFiguresFor('2026-09', '')['SOWETO'].stock === 800, false);
// The month is part of it: a different month's network-free row is untouched.
portal.data.perfTeams.push(
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-08', stock: 999 });
check('the replacement applies to that month only',
  portal.teamFiguresFor('2026-08', '')['SOWETO'].stock, 999);

/* The leaderboard reads the same helper, so a network changes the order. Across all
   networks Soweto has 300 connections to Tembisa's 100; on MTN alone Tembisa's 100
   beats Soweto's 60. */
portal.data.perfTeams = [
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-09', network: 'MTN', connections: 60 },
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-09', network: 'VODACOM', connections: 240 },
  { teamKey: 'TEMBISA', team: 'Tembisa', month: '2026-09', network: 'MTN', connections: 100 },
  { teamKey: 'TZANEEN', team: 'Tzaneen', month: '2026-09', network: 'TELKOM', connections: 150 }
];
check('across all networks the board runs on the totals',
  portal.leaderboardRows('2026-09', 'connections', '').rows.map(r => [r.team, r.position]),
  [['Soweto', 1], ['Tzaneen', 2], ['Tembisa', 3]]);
check('and one network reorders it',
  portal.leaderboardRows('2026-09', 'connections', 'MTN').rows.map(r => [r.team, r.position]),
  [['Tembisa', 1], ['Soweto', 2], ['Tzaneen', null]]);
// A team with nothing on the chosen network is unranked, NOT last: a network it does
// not sell is not a bad month, and the board hides the figures so nobody can check.
check('a team that does not sell it is unranked rather than placed last',
  portal.leaderboardRows('2026-09', 'connections', 'MTN').rows
    .find(r => r.team === 'Tzaneen').position, null);

// The tab's totals move with the filter too, since they count each team once off the
// same rows the table shows.
Object.assign(portal.perfFilters, { province: '', team: '', network: '', query: '' });
check('the tiles total every network when none is chosen',
  portal.performanceTotals(portal.performanceRows('2026-09', '')).connections,
  60 + 240 + 100 + 150);
check('and one network when one is',
  portal.performanceTotals(portal.performanceRows('2026-09', 'MTN')).connections,
  60 + 100);

// And the export says which network its figures are, on every row.
portal.perfFilters.network = 'VODACOM';
const vodExport = portal.performanceExportRows('2026-09');
check('the export names the chosen network on each row',
  vodExport[1][vodExport[0].indexOf('Network')], 'Vodacom');
portal.perfFilters.network = '';

/* ---------------- FY, the incentive paid per person per network ---------------- */
/* Its own collection and its own card, and the point of both is separation: FY
   connections are NOT the team's connections. If the two ever met, an incentive's
   figures would land in the team conversion percentages and on the leaderboard, where
   they would look like sales nobody could account for. */
portal.data.employees = [
  { id: 'f1', name: 'Ayanda', surname: 'Ncube', employeeNumber: 'T042',
    province: 'Gauteng', teamName: 'Soweto' },
  { id: 'f2', name: 'Bongi', surname: 'Ndlovu', employeeNumber: 'T099',
    province: 'Limpopo', teamName: 'Tzaneen' }
];
portal.data.perfTeams = [
  { teamKey: 'SOWETO', team: 'Soweto', month: '2026-08', network: 'MTN',
    stock: 100, connections: 60, activations: 30 }
];
portal.data.perfMonthly = [
  { numberKey: 'T042', uid: 'f1', month: '2026-08', basicSalaryRands: 6200,
    commissionRands: 5000 }
];
portal.data.perfFy = [
  { numberKey: 'T042', employeeNumber: 'T042', uid: 'f1', month: '2026-08',
    network: 'MTN', fyStock: 1000, fyConnections: 400, fyAmountRands: 5600 },
  { numberKey: 'T042', employeeNumber: 'T042', uid: 'f1', month: '2026-08',
    network: 'TELKOM', fyStock: 600, fyConnections: 210, fyAmountRands: 2940 },
  { numberKey: 'T099', employeeNumber: 'T099', uid: 'f2', month: '2026-08',
    network: 'MTN', fyStock: 500, fyConnections: 125, fyAmountRands: 1750 },
  // An FY row against a number nobody has: real money, and it must stay visible.
  { numberKey: 'T900', employeeNumber: 'T900', uid: '', month: '2026-08',
    network: 'MTN', fyStock: 300, fyConnections: 90, fyAmountRands: 1260 },
  { numberKey: 'T042', employeeNumber: 'T042', uid: 'f1', month: '2026-07',
    network: 'MTN', fyStock: 900, fyConnections: 300, fyAmountRands: 4200 }
];

const fyAug = portal.fyRows('2026-08', '');
check('one row per person per network', fyAug.length, 4);
check('the same person appears once per network',
  fyAug.filter(r => r.numberKey === 'T042').map(r => r.network), ['MTN', 'TELKOM']);
check('each row carries its own three figures',
  [fyAug[0].stock, fyAug[0].connections, fyAug[0].amount], [1000, 400, 5600]);

/* The conversion divides WITHIN a network. Ayanda converted 400 of 1 000 on MTN and 210
   of 600 on Telkom; mixing them would report neither. */
check('the conversion is that network\'s connections over its own stock',
  fyAug.filter(r => r.numberKey === 'T042')
    .map(r => portal.percentLabel(portal.ratioPercent(r.connections, r.stock))),
  ['40,0%', '35,0%']);

// Totals are summed over every row with NO de-duplication: FY belongs to a person, and
// one person on two networks earned both amounts.
const fyT = portal.fyTotals(fyAug);
check('totals sum every row', [fyT.stock, fyT.connections, fyT.amount],
  [2400, 825, 11550]);
check('and the total conversion divides the two totals',
  portal.percentLabel(portal.ratioPercent(fyT.connections, fyT.stock)), '34,4%');

check('a network narrows it', portal.fyRows('2026-08', 'MTN').length, 3);
check('to that network only',
  portal.fyRows('2026-08', 'TELKOM').map(r => r.numberKey), ['T042']);
// FY runs on two networks, so choosing a third shows nothing rather than showing MTN.
check('a network FY does not run on shows nothing, not the wrong figures',
  portal.fyRows('2026-08', 'VODACOM').length, 0);
check('and its totals are dashes rather than noughts',
  portal.fyTotals(portal.fyRows('2026-08', 'VODACOM')),
  { stock: null, connections: null, amount: null });

check('a month is its own', portal.fyRows('2026-07', '').length, 1);
check('and a month with nothing uploaded is empty', portal.fyRows('2026-09', '').length, 0);

// A row matching nobody still shows, with no name rather than being dropped.
const ghost = fyAug.find(r => r.numberKey === 'T900');
check('an FY row against an unknown number is still listed', ghost !== undefined, true);
check('with no name on it', [ghost.name, ghost.amount], ['', 1260]);

/* THE SEPARATION, asserted rather than assumed. Soweto's team connections are 60. FY
   added 400 on MTN for somebody on that team, and the team figure must not budge. */
check('FY does not touch the team figures',
  portal.performanceTotals(portal.performanceRows('2026-08', '')).connections, 60);
check('nor the team conversion',
  portal.percentLabel(portal.ratioPercent(
    portal.performanceTotals(portal.performanceRows('2026-08', '')).connections,
    portal.performanceTotals(portal.performanceRows('2026-08', '')).stock)), '60,0%');
check('nor the leaderboard',
  portal.leaderboardRows('2026-08', 'connections', '').rows
    .find(r => r.team === 'Soweto').position, 1);
// And pay is untouched too: FY is its own figure, not part of basic or commission.
check('and FY is not folded into pay',
  [portal.performanceTotals(portal.performanceRows('2026-08', '')).basic,
   portal.performanceTotals(portal.performanceRows('2026-08', '')).commission],
  [6200, 5000]);

/* The export's columns. A header and a row that disagree by one shifts every amount
   after it, and a payroll sheet of shifted amounts looks perfectly reasonable. */
Object.assign(portal.perfFilters, { province: '', team: '', network: '', query: '' });
const fyExport = portal.fyExportRows('2026-08');
check('the FY export has a header and a row per FY row', fyExport.length, 5);
check('every row has as many fields as the header',
  fyExport.slice(1).map(r => r.length), fyExport.slice(1).map(() => fyExport[0].length));
check('the conversion is written out alongside the figures behind it',
  ['FY stock', 'FY connections', 'Stock to connection %', 'FY payable R']
    .every(h => fyExport[0].includes(h)), true);
const ayandaMtn = fyExport.find(r => r[1] === 'T042' && r[5] === 'MTN');
check('and each lands under its own heading',
  [ayandaMtn[fyExport[0].indexOf('FY stock')],
   ayandaMtn[fyExport[0].indexOf('Stock to connection %')],
   ayandaMtn[fyExport[0].indexOf('FY payable R')]],
  [1000, '40.0', '5600.00']);

console.log(failures === 0 ? '\nRENDER TESTS OK' : `\nRENDER TESTS FAILED — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
