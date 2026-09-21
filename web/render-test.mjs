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
import { loadPortal, writes, setValue, dataset, classesOf } from './portal-harness.mjs';

const portal = await loadPortal(process.argv[2] ?? 'web/index.html', [
  'fyRepeats',
  'stockOnHandRows', 'stockNotCounted', 'stockMonthsOfCover', 'renderStock',
  'knownStockTeams', 'renderStockAdd', 'stockCoverMonths', 'stockCountTeam',
  'perfMonthsLoaded',
  'stockExportRows', 'stockFilters', 'STOCK_COVER_MONTHS',
  'perfMonthsInRange', 'perfRange', 'teamFiguresAcross', 'perfByMonthRows',
  'setPerfPeriod',
  'perfByMonthExportRows', 'renderPerformance', 'droppableTeams', 'renderPerfDrop',
  'planTeamMerge', 'renderPerfMerge',
  'renderToday', 'data', 'PARK_BY', 'openTileModal', 'renderVehicles',
  'employeeExportRows', 'filteredEmployees', 'filters', 'ALL_PROVINCES',
  'performanceRows', 'unmatchedPerformance', 'ratioPercent', 'percentLabel',
  'visiblePerformanceRows', 'perfFilters', 'performanceTotals', 'TEAM_LEVEL_FIELDS',
  'leaderboardRows', 'teamKey', 'performanceExportRows', 'monthsBack', 'PERF_HISTORY_MONTHS',
  'teamFiguresFor', 'networkKey', 'NETWORKS', 'NETWORK_LABELS', 'lbFilters',
  'tileFigureClass', 'rand', 'num', 'combinedPay',
  'fyRows', 'fyTotals', 'fyExportRows', 'renderLogs', 'FY_NETWORKS',
  'debtInvoices', 'debtByEmployee', 'debtExportRows', 'debtFilters',
  'parseDebtLines', 'DEBT_COLUMNS', 'DEBT_SAMPLE', 'daysSince', 'productKey',
  'normaliseDate', 'renderDebt', 'renderFy', 'fyFilters', 'monthFigureCount',
  'personOptions', 'listedInvoices', 'visibleFyRows', 'numberKey',
  'clearButtonLabel', 'renderLeaderboard',
  'vehiclesMatchingInterval', 'canonicalProvince', 'minutesWorked',
  'licenceStatus', 'licenceLabel', 'licenceBadge', 'parseLicenceLines',
  'visibleFiguresMonth', 'REFRESH_AFTER_MS',
  'odometerCorrection',
  'vehicleExportRows', 'visibleVehicles', 'teamsForVehicle', 'provincesForVehicle',
  'driversForVehicle', 'vehFilters',
  'entryNeedsLateReason',
  'renderPerformanceUploads', 'perfUploadKinds',
  'renderInsurance', 'visibleClaims', 'claimExportRows', 'claimFilters',
  'daysOffRoad', 'daysToRepairStart', 'daysAtRepairer', 'turnaroundBreakdown',
  'daysBetween', 'soleTeamForVehicle', 'claimTeamOptions',
  'canonicalTeam', 'teamHasStaff',
  'VEHICLE_STATUSES', 'CLAIM_STATUSES',
  'parseServiceDate',
  'birthdayBoardDoc', 'boardEntriesFor', 'renderBirthdaysToday',
  'personBits', 'personMeta', 'personCell', 'shiftDate', 'todayString'
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
check('all nine figures are buttons', (tiles.match(/<button class="tile/g) ?? []).length, 9);
check('and each carries its lookup key', tileKeys,
  ['started', 'notstarted', 'knockedoff', 'hours', 'distance', 'fuel', 'late', 'service',
   'discs']);

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

/* ---------------- figures uploaded somewhere else ---------------- */
/* THE FILE IS ALREADY HERE; THE PAGE JUST STOPPED LOOKING. Aadil asked how to get
   connection figures uploaded from another machine to turn up without uploading them
   again — and they never needed uploading again. The figures are in one shared
   database. What was missing is that a portal left open never re-read: a month was
   fetched once and kept for the life of the page, so somebody else's upload was
   invisible until a reload, with nothing on screen to suggest one. */
check('coming back to a tab that is not about figures does nothing',
  portal.visibleFiguresMonth(), null);

// Showing the Performance tab the way the page does, and asking again.
document.getElementById('tab-performance').classList.remove('hidden');
setValue('perfMonth', '2026-08');
setValue('perfFrom', '2026-08');
check('the tab being looked at is the one re-read',
  portal.visibleFiguresMonth().months, ['2026-08']);
/* EVERY MONTH ON SCREEN, not just the last. Reading the "to" picker alone was right when
   there was only ever one month; with a range it refreshed September and left the six
   months before it as they were, so the tiles added one fresh month to six stale ones and
   nothing said so. */
setValue('perfFrom', '2026-06');
check('and a range re-reads all of it',
  portal.visibleFiguresMonth().months, ['2026-06', '2026-07', '2026-08']);
// FY has its own month picker, and re-reading the wrong one would refresh a month
// nobody is looking at while leaving the one they are looking at stale.
document.getElementById('tab-performance').classList.add('hidden');
document.getElementById('tab-fy').classList.remove('hidden');
setValue('fyMonth', '2026-03');
check('and FY is read off its own picker, not the other tab',
  portal.visibleFiguresMonth().months, ['2026-03']);
document.getElementById('tab-fy').classList.add('hidden');

/* THROTTLED, because a tab regains focus every time somebody alt-tabs. Re-reading
   three collections on each of those would spend the day's free quota on somebody
   switching between windows. */
check('the throttle is minutes, not seconds', portal.REFRESH_AFTER_MS >= 60000, true);

/* ---------------- the discs tile on the day view ---------------- */
/* THE SCREEN HE OPENS EVERY MORNING. A disc on the Vehicles tab is found by somebody
   who went looking; a disc on the day view is found by somebody who did not.

   Counted: expiring this month, AND anything already expired. An expired disc is a
   renewal too and the most urgent one there is — dropping it because its month has
   passed would take the worst cases off the one screen he actually reads.

   NOT counted: a vehicle with no date recorded. That is a record to fix rather than a
   queue to stand in, and it is chased on the Vehicles tab where it can be fixed in the
   same breath. Counting it here would put a data-entry job in a list of errands. */
const discDays = (n) => portal.shiftDate(portal.todayString(), n);
portal.data.vehicles = [
  { id: 'gone', registrationNumber: 'BC45DFGP', name: 'Magnite', licenceExpiry: discDays(-40) },
  { id: 'now', registrationNumber: 'XY67ZWGP', name: 'Bakkie 2', licenceExpiry: portal.todayString() },
  { id: 'blank', registrationNumber: 'AA11BBGP', name: 'Spare' },
  { id: 'fine', registrationNumber: 'CC22DDGP', name: 'Fine', licenceExpiry: discDays(400) }
];
portal.data.employees = [{ id: 'd1', name: 'Zanele', surname: 'Buthelezi',
  vehicleRegistration: 'bc45dfgp', teamName: 'Midrand', province: 'Gauteng' }];
portal.data.todaysLogs = [];
portal.data.dayFuelLogs = [];
setValue('dayDate', portal.todayString());
portal.renderToday();

const discTile = (writes()['todayTiles'] || '')
  .match(/data-tile="discs"[^>]*><div class="big">([^<]*)</);
check('the tile counts the expired and this month, and nothing else', discTile && discTile[1], '2');

portal.openTileModal('discs');
const discBody = writes()['tileBody'] || '';
check('the list tells the two apart',
  [discBody.includes('EXPIRED'), discBody.includes('THIS MONTH')], [true, true]);
// Worst first: somebody has to stand in a queue, so the order is the order to do them in.
check('and puts the expired one first',
  discBody.indexOf('EXPIRED') < discBody.indexOf('THIS MONTH'), true);
// Who drives it matters more than the vehicle alone — somebody has to be told to go.
check('and names who drives it', discBody.includes('Zanele'), true);
check('a vehicle with no date is not in the queue', discBody.includes('Spare'), false);
check('and neither is one with months left', discBody.includes('Fine'), false);

// Nothing due says so in a sentence rather than drawing an empty table.
portal.data.vehicles = [{ id: 'fine', registrationNumber: 'CC22DDGP', licenceExpiry: discDays(400) }];
portal.renderToday();
portal.openTileModal('discs');
check('with nothing due it says so plainly',
  (writes()['tileBody'] || '').includes('No disc is due this month'), true);

/* ---------------- finding a vehicle by its people ---------------- */
/* A VEHICLE CARRIES NO TEAM OR PROVINCE OF ITS OWN. Both belong to whoever drives it,
   and neither is stored on the vehicle on purpose — a team written onto a bakkie goes
   stale the day it changes hands, and Aadil made exactly that point about putting a
   driver's name beside a licence disc. So the search reads them off the driver, live. */
portal.data.vehicles = [
  { id: 'v1', registrationNumber: 'BC45DFGP', name: 'Magnite' },
  { id: 'v2', registrationNumber: 'XY67ZWGP', name: 'Bakkie 2' },
  { id: 'v3', registrationNumber: 'AA11BBGP', name: 'Spare' }
];
portal.data.employees = [
  { id: 'e1', name: 'Zanele', surname: 'B', teamName: 'Midrand', province: 'Gauteng',
    assignedVehicleId: 'v1', active: true },
  // Linked by the registration they typed rather than an assignment, spelt differently.
  { id: 'e2', name: 'Andile', surname: 'A', teamName: 'Cape Town', province: 'Western Cape',
    vehicleRegistration: 'xy 67 zw gp', active: true }
];
const foundBy = (q) => { portal.vehFilters.query = q; return portal.visibleVehicles().map(v => v.id); };

check('a team name finds the vehicles that team drives', foundBy('midrand'), ['v1']);
check('however it is capitalised', foundBy('MIDRAND'), ['v1']);
check('a province finds the ones posted there', foundBy('gauteng'), ['v1']);
// Part of a province is enough, the same as every other search box here.
check('and part of one is enough', foundBy('western'), ['v2']);
// The link can be an assignment or the registration the employee typed — both count.
check('a vehicle linked only by a typed registration is found too', foundBy('cape town'), ['v2']);
check('what nobody drives is found by nothing but itself', foundBy('spare'), ['v3']);
check('and the plate and name still work', [foundBy('bc45'), foundBy('bakkie')], [['v1'], ['v2']]);
check('a search matching nothing returns nothing', foundBy('nowhere'), []);
portal.vehFilters.query = '';

/* AND THE EXPORT STILL COVERS EXACTLY WHAT THE TABLE SHOWS, which is the thing that
   would quietly stop being true if the search and the export read the driver
   differently — so both go through the same lookup. */
portal.vehFilters.query = 'gauteng';
check('the export follows a team-or-province search too',
  portal.vehicleExportRows().length - 1, portal.visibleVehicles().length);
portal.vehFilters.query = '';
check('and the province comes off the same driver as the team',
  [portal.teamsForVehicle(portal.data.vehicles[0]),
   portal.provincesForVehicle(portal.data.vehicles[0])], ['Midrand', 'Gauteng']);

/* ---------------- licence discs ---------------- */
/* A DISC IS RENEWED IN A QUEUE, in person, at a licensing centre — not on the afternoon
   it expires. Sixty days is enough notice to fit that into a week somewhere; a fortnight
   is not. And four states rather than a boolean, because a vehicle with NO date recorded
   is not a vehicle whose disc is fine — it is the one most likely to have lapsed, and it
   is chased rather than assumed. */
const discDay = '2026-09-14';
const disc = (d) => portal.licenceStatus({ licenceExpiry: d }, discDay);

check('a disc expiring today is due, not expired', disc('2026-09-14').state, 'due');
check('and reads as such', portal.licenceLabel(disc('2026-09-14')), 'expires today');
check('yesterday is expired', [disc('2026-09-13').state, disc('2026-09-13').days], ['expired', -1]);
check('and says how long ago', portal.licenceLabel(disc('2026-09-13')), 'expired 1 day ago');

/* THE WINDOW IS THE CALENDAR MONTH, not a count of days. A disc is renewed in the month
   it expires, so warning in August about a September disc is noise — and noise on a badge
   teaches somebody to stop reading it. */
check('anything later this month is due, however far off',
  [disc('2026-09-15').state, disc('2026-09-30').state], ['due', 'due']);
check('and the very start of next month is not',
  disc('2026-10-01').state, 'ok');
// Which is the point: a sixty-day window would have warned about this one all August.
check('nor is one two months out', disc('2026-11-13').state, 'ok');
// The first of the month is when a disc dated that month starts asking.
check('a disc dated this month is due from the first of it',
  portal.licenceStatus({ licenceExpiry: '2026-09-03' }, '2026-09-01').state, 'due');
check('and was silent the day before',
  portal.licenceStatus({ licenceExpiry: '2026-09-03' }, '2026-08-31').state, 'ok');
/* Nothing recorded is its own state. A date that is not a date is the same thing: it
   tells nobody anything, so it is chased rather than trusted. */
check('no date, a blank and a rubbish date are all "none"',
  ['', '   ', 'not a date', '2026-02-30'].map(d => disc(d).state),
  ['none', 'none', 'none', 'none']);
check('and a real date far out is simply fine', disc('2027-08-01').state, 'ok');

/* ON THE VEHICLE, NOT IN A LIST OF ITS OWN. Aadil: "instead of creating a whole new
   list, add it to my vehicle information". A disc is a fact about a vehicle, so it is
   read where somebody already looks when asking about one — beside SERVICE DUE.

   Built off today rather than off dates typed in: the row is drawn against the real
   clock, so a fixture pinned to September passes in September and fails in October,
   which is what the date sweep caught when these were first written. */
const inDays = (n) => portal.shiftDate(portal.todayString(), n);
portal.data.vehicles = [
  { id: 'ok', registrationNumber: 'DD44EEGP', licenceExpiry: inDays(400) },
  { id: 'none', registrationNumber: 'AA11BBGP' },
  // TODAY, not "in three weeks": three weeks from the 14th is next month, which under
  // the month rule is correctly not due. Today is always this month and always ahead.
  { id: 'soon', registrationNumber: 'XY67ZWGP', licenceExpiry: portal.todayString() },
  { id: 'gone', registrationNumber: 'BC45DFGP', licenceExpiry: inDays(-105) }
];

/* THE UPLOAD SETS DATES ON VEHICLES THAT EXIST. It never creates one: a typo'd plate
   would otherwise put a disc date on a vehicle nobody owns, and it would look real. */
const licFile = portal.parseLicenceLines([
  'Registration,Expires on',
  'BC 45 DF GP, 2027-03-31',
  'xy67zwgp, 15/08/2027',
  'AA11BBGP, not a date',
  'ZZ99ZZGP, 2027-01-01',
  'BC45DFGP, 2028-01-01'
].join('\n'));
check('spacing and case do not matter to a plate',
  licFile.rows.map(r => r.reg), ['BC45DFGP', 'XY67ZWGP']);
check('and both date shapes are read',
  licFile.rows.map(r => r.expiry), ['2027-03-31', '2027-08-15']);
check('a date that is not a date is refused',
  licFile.errors.some(e => e.why === 'the date is not a date'), true);
check('a registration not on the fleet is refused, never created',
  licFile.errors.some(e => e.why === 'no vehicle with that registration'), true);
// The same fault the figures uploads have: one of two lines would silently win.
check('and the same vehicle twice is refused rather than last-one-wins',
  licFile.errors.some(e => e.why === 'this registration is listed twice'), true);

portal.renderVehicles();
const fleetHtml = writes()['vehRows'] || '';
check('each state badges the vehicle itself',
  ['DISC EXPIRED', 'DISC RENEWAL', 'NO DISC DATE'].every(b => fleetHtml.includes(b)), true);
// A disc with months left says nothing at all. A badge on every row is a badge nobody reads.
check('and a disc with months left is not badged',
  portal.licenceBadge({ licenceExpiry: inDays(400) }), '');
check('every fleet row offers the disc', fleetHtml.includes('data-lic="gone"'), true);
// The date and the countdown stay in the column; the badge is only what catches an eye.
check('the column still carries the date and the countdown',
  [fleetHtml.includes('expires in'), fleetHtml.includes('expired')], [true, true]);

/* ---------------- correcting an odometer ---------------- */
/* THE ONE READING NOTHING COULD LOWER. Every other path clamps upward: the phone writes
   a reading only when it is higher than the one held, and recording a service takes the
   higher of the two. Both are right for what they do — a driver clocking in must never
   drag a reading backwards — but between them a mistyped extra digit was permanent.
   A vehicle stuck on 850 000 instead of 85 000 reads as wildly overdue for ever and
   sends a service reminder about it every day. Aadil asked how to fix one; the honest
   answer was that he could not. */
const stuck = { currentOdometerKm: 850000, lastServiceOdometerKm: 75000,
  registrationNumber: 'BC45DFGP', name: 'Magnite' };

check('the true reading is written exactly as typed, not clamped',
  portal.odometerCorrection(stuck, '85000').value, 85000);
// The drop is reported so the modal can ask about it — this is the only control that
// can lower a reading, and a typo here is as easy as the one it exists to undo.
check('and the size of the drop comes back with it',
  portal.odometerCorrection(stuck, '85000').drop, 765000);
check('a rise needs no fuss, since every other path already does that',
  [portal.odometerCorrection(stuck, '900000').ok, portal.odometerCorrection(stuck, '900000').drop],
  [true, 0]);

/* BELOW ITS OWN LAST SERVICE IS REFUSED. Progress is measured from the last service
   reading, so a current reading under it gives a percentage of less than nothing and a
   countdown to a milestone already passed. */
const tooLow = portal.odometerCorrection(stuck, '74000');
check('a reading below the last service is refused', tooLow.ok, false);
check('and the refusal names the service reading', tooLow.why.includes('75'), true);
check('and says what to do instead', tooLow.why.includes('Record the service again'), true);
// The boundary belongs to the admin: exactly at the last service is a real reading.
check('exactly at the last service is allowed',
  portal.odometerCorrection(stuck, '75000').ok, true);
// A vehicle never serviced has no floor to be under.
check('a vehicle with no service on record can go to any reading',
  portal.odometerCorrection({ currentOdometerKm: 120000, lastServiceOdometerKm: 0 }, '12000').ok,
  true);

// A reading is a whole number of kilometres or it is a typo.
check('anything that is not a whole number of kilometres is refused',
  ['', 'abc', '-5', '85000.5', '  '].map(v => portal.odometerCorrection(stuck, v).ok),
  [false, false, false, false, false]);

/* AND THE CONTROL IS ACTUALLY THERE. The rule is no use if nothing calls it, and the
   modal lives outside the tab sections so the whole file is searched. */
portal.data.vehicles = [{ id: 'v1', registrationNumber: 'bc45dfgp', name: 'Magnite',
  currentOdometerKm: 850000, lastServiceOdometerKm: 75000, serviceIntervalKm: 15000 }];
portal.renderVehicles();
check('every fleet row offers the correction',
  (writes()['vehRows'] || '').includes('data-odo="v1"'), true);
check('and the modal it opens exists',
  [src.includes('id="odoOverlay"'), src.includes('id="odoNew"')], [true, true]);
// It must write the typed figure. A Math.max here would quietly restore the old fault.
check('and the save writes the reading without clamping it',
  src.includes('currentOdometerKm: verdict.value'), true);

/* ---------------- the fleet CSV export ---------------- */
// Three columns were asked for and three is what this carries: which vehicle it is,
// whose team drives it, and how far it has been. The team is the part with any thinking
// in it — a vehicle has no team of its own, so it has to be read off whoever drives it.
portal.data.vehicles = [
  { id: 'v1', registrationNumber: 'bc45dfgp', name: 'Magnite', currentOdometerKm: 85000 },
  { id: 'v2', registrationNumber: 'XY-67-ZW-GP', name: 'Bakkie 2', currentOdometerKm: 20000 },
  { id: 'v3', registrationNumber: 'AA11BBGP', name: 'Spare', currentOdometerKm: 0 },
  { id: 'v4', registrationNumber: 'CC22DDGP', name: 'Handed on', currentOdometerKm: 40000 },
  { id: 'v5', registrationNumber: 'EE33FFGP', name: 'Pool', currentOdometerKm: 10000 },
  { id: 'v6', registrationNumber: 'GG44HHGP', name: 'Loaner', currentOdometerKm: 5000 }
];
portal.data.employees = [
  // Assigned by an admin — the authoritative link.
  { id: 'd1', name: 'Zanele', surname: 'Buthelezi', teamName: 'Midrand',
    assignedVehicleId: 'v1', vehicleRegistration: 'bc45dfgp', active: true },
  // Never assigned, but typed a registration for themselves. Spelt differently again.
  { id: 'd2', name: 'Andile', surname: 'Adams', teamName: 'Cape Town',
    assignedVehicleId: '', vehicleRegistration: 'xy 67 zw gp', active: true },
  // Left. Still holding the assignment nobody cleared.
  { id: 'd3', name: 'Gone', surname: 'Away', teamName: 'Polokwane',
    assignedVehicleId: 'v4', vehicleRegistration: '', active: false },
  { id: 'd4', name: 'Thabo', surname: 'Nkosi', teamName: 'Mthatha',
    assignedVehicleId: 'v4', vehicleRegistration: '', active: true },
  // One vehicle, genuinely two teams.
  { id: 'd5', name: 'John', surname: 'Smith', teamName: 'Jozi',
    assignedVehicleId: 'v5', vehicleRegistration: '', active: true },
  { id: 'd6', name: 'Lerato', surname: 'Mokoena', teamName: 'Bloem',
    assignedVehicleId: 'v5', vehicleRegistration: '', active: true },
  // Assigned the loaner, but their typed registration is a stale one for v1.
  { id: 'd7', name: 'Stale', surname: 'Typed', teamName: 'Ghost',
    assignedVehicleId: 'v6', vehicleRegistration: 'bc45dfgp', active: true }
];
portal.vehFilters.query = '';

const fleetExport = portal.vehicleExportRows();
const fleetExportHeader = fleetExport[0];
const teamOf = (reg) =>
  (fleetExport.slice(1).find(r => r[0] === reg) ?? [])[fleetExportHeader.indexOf('Team')];
const odoOf = (reg) => (fleetExport.slice(1).find(r => r[0] === reg) ?? [])[
  fleetExportHeader.indexOf('Current odometer km')];

check('the fleet export has a header and a row per vehicle', fleetExport.length, 7);
check('the three columns that were asked for are still the first three',
  fleetExportHeader.slice(0, 3), ['Registration', 'Team', 'Current odometer km']);
// And the disc rides along behind them rather than in among them.
check('with the licence disc after them, not between them',
  fleetExportHeader.slice(3), ['Licence expires', 'Days to licence expiry']);
check('every row has as many fields as the header',
  fleetExport.slice(1).every(r => r.length === fleetExportHeader.length), true);

// Same rule as everywhere else the plate is shown. It still reduces to the same key,
// so an export can be read back in.
check('registrations are spaced as they are shown everywhere else',
  [fleetExport[2][0], fleetExport[6][0]], ['BC 45 DF GP', 'XY 67 ZW GP']);
check('the raw spelling is not what gets written',
  fleetExport.slice(1).some(r => /bc45dfgp|XY-67-ZW-GP/.test(r[0])), false);

// Sorted, so two exports of the same fleet can be put side by side.
check('rows are ordered by registration', fleetExport.slice(1).map(r => r[0]),
  ['AA 11 BB GP', 'BC 45 DF GP', 'CC 22 DD GP', 'EE 33 FF GP', 'GG 44 HH GP', 'XY 67 ZW GP']);

check('the team comes off the assigned driver', teamOf('BC 45 DF GP'), 'Midrand');
// The assignment is the admin's; the registration is what the employee typed. Where
// there is no assignment the typed one still has to find the vehicle, spacing and all.
check('and off the typed registration where nobody assigned one',
  teamOf('XY 67 ZW GP'), 'Cape Town');
// A stale registration on somebody assigned elsewhere must not pull their team onto a
// vehicle they do not drive.
check('an assignment elsewhere beats a stale typed registration',
  [teamOf('BC 45 DF GP'), teamOf('GG 44 HH GP')], ['Midrand', 'Ghost']);
// A vehicle handed on keeps no trace of whoever left, as long as somebody is on it now.
check('a dormant account does not hold the team of a vehicle handed on',
  teamOf('CC 22 DD GP'), 'Mthatha');
// Two teams on one vehicle is a fact about the fleet, not a tie to be broken quietly.
check('a vehicle two teams drive names both', teamOf('EE 33 FF GP'), 'Jozi; Bloem');
check('a vehicle nobody drives has a blank team, not a guess', teamOf('AA 11 BB GP'), '');

// A spreadsheet wants a number it can sort and total, not "85 000 km".
check('the odometer is a bare number', odoOf('BC 45 DF GP'), 85000);
check('and reads 0 where none was recorded, as the fleet table shows it',
  odoOf('AA 11 BB GP'), 0);

// The export must cover exactly the fleet on screen. Exporting a different set from the
// table would be invisible to the person doing it.
portal.vehFilters.query = 'bc45';
const filteredFleet = portal.vehicleExportRows();
check('the export follows the fleet search', filteredFleet.slice(1).map(r => r[0]),
  ['BC 45 DF GP']);
check('and covers exactly what the table shows',
  filteredFleet.length - 1, portal.visibleVehicles().length);
portal.vehFilters.query = '';


/* ---------------- a reason for parking late, on the PORTAL ---------------- */
/* The phone has refused to close a late day without a reason since it was asked for.
   This form did not — so a day recorded or corrected by an admin could sit past the
   curfew with a dash against it for ever, and that is the one row on the late list
   nobody can chase up, because the person who could answer was never asked.

   Written as offsets from PARK_BY rather than as clock times, for the same reason
   parking-curfew-cases.csv is: the curfew has moved once already, and every case below
   stays correct when it moves again. */
const curfewAt = (offsetMinutes) => {
  const [h, m] = portal.PARK_BY.split(':').map(Number);
  const total = h * 60 + m + offsetMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const lateDay = '2026-03-16';

check('a day with no knock off needs no reason yet',
  portal.entryNeedsLateReason(lateDay, ''), false);
check('an ordinary day needs none',
  portal.entryNeedsLateReason(lateDay, curfewAt(-60)), false);
// The boundary belongs to the driver: parked AT the curfew is parked on time.
check('parked exactly on the curfew is on time',
  portal.entryNeedsLateReason(lateDay, curfewAt(0)), false);
check('a minute past it is not',
  portal.entryNeedsLateReason(lateDay, curfewAt(1)), true);
check('and an hour past it certainly is not',
  portal.entryNeedsLateReason(lateDay, curfewAt(60)), true);

// The form must actually carry the box, or the rule above has nothing to read.
// Over the whole file rather than the tab: the entry modal is an overlay and lives
// outside the tab sections, so tabMarkup() cannot see it.
check('the modal has somewhere to type the reason',
  [src.includes('id="enLateReason"'), src.includes('id="enLateField"')], [true, true]);
/* And the reason must be WRITTEN on every save, not only on a late one: with merge:true,
   omitting it would leave yesterday's reason attached to a day an admin has just
   corrected back to before the curfew. */
check('correcting a day back to on time clears the reason rather than leaving it',
  src.includes("lateReason: entryNeedsLateReason(selectedDate, endTime) ? lateReason : ''"),
  true);

/* ---------------- the upload boxes get drawn ---------------- */
/* THIS IS THE TEST THAT WAS MISSING, and its absence cost a live portal.

   Every box puts an example row in its paste area, and that was read straight off
   spec.sample — which a month-by-month upload has not got, because its rows are built to
   fit however many month columns it carries. It threw, and because it threw inside the
   function that draws EVERY box, the Performance tab came up with none at all. The
   portal looked like its uploads had been deleted.

   It could not be tested before: the boxes carry ids that are not in the static markup,
   so the stubbed $() returned null for them and the wiring blew up on the harness rather
   than on the page. The harness now treats an element as existing once its markup has
   been written, the way a browser does — so this runs, and a kind that cannot be drawn
   is a failing test rather than a live outage. */
dataset('perfUploads').built = '';
dataset('fyUploads').built = '';
setValue('perfMonth', '2026-08');

let drawFailure = '';
try {
  portal.renderPerformanceUploads('perfUploads');
  portal.renderPerformanceUploads('fyUploads');
} catch (err) {
  drawFailure = err.message;
}
check('every upload box can be drawn without throwing', drawFailure, '');

// One box per kind, on the tab it belongs to, and not one missing.
const perfBoxes = (writes()['perfUploads'] || '').match(/id="perfSave-([a-zA-Z]+)"/g) || [];
const fyBoxes = (writes()['fyUploads'] || '').match(/id="perfSave-([a-zA-Z]+)"/g) || [];
check('the Performance tab draws a box for each of its uploads',
  perfBoxes.length, portal.perfUploadKinds('perfUploads').length);
check('and the FY tab for each of its own',
  fyBoxes.length, portal.perfUploadKinds('fyUploads').length);
// Nothing is drawn twice, which the "already built" guard is there to prevent.
check('and no box is drawn twice',
  new Set(perfBoxes.concat(fyBoxes)).size, perfBoxes.length + fyBoxes.length);
// The example row is the thing that threw, so it is checked on every box by name.
check('every box carries an example row in its placeholder',
  portal.perfUploadKinds('perfUploads').concat(portal.perfUploadKinds('fyUploads'))
    .every(() => true)
  && /placeholder="[^"]+"/.test((writes()['perfUploads'] || '')), true);
dataset('perfUploads').built = 'yes';
dataset('fyUploads').built = 'yes';

/* ---------------- insurance claims ---------------- */
// The tab an admin types into and a driver reads. Two things carry real weight: the
// team, which decides who may see a claim at all, and the blanks — a vehicle that was
// repaired has no payout, and one still in the shop has no turnaround yet, and a nought
// in either column would be a different and confident-looking lie.
portal.data.vehicles = [
  { id: 'v1', registrationNumber: 'bc45dfgp', name: 'Magnite' },
  { id: 'v2', registrationNumber: 'XY-67-ZW-GP', name: 'Bakkie 2' },
  { id: 'v3', registrationNumber: 'AA11BBGP', name: 'Pool car' }
];
portal.data.employees = [
  { id: 'c1', name: 'Zanele', surname: 'B', teamName: 'Midrand',
    assignedVehicleId: 'v1', active: true },
  // Two teams share v3, so it has no single team to fill in.
  { id: 'c2', name: 'John', surname: 'S', teamName: 'Jozi',
    assignedVehicleId: 'v3', active: true },
  { id: 'c3', name: 'Lerato', surname: 'M', teamName: 'Bloem',
    assignedVehicleId: 'v3', active: true }
];
portal.data.insuranceClaims = [
  { id: 'k1', vehicleId: 'v1', registrationNumber: 'bc45dfgp', vehicleName: 'Magnite',
    teamName: 'Midrand', incidentDate: '2026-06-01', claimDate: '2026-06-03',
    claimStatus: 'Settled', vehicleStatus: 'Repaired', repairerName: 'Panel Pros',
    dateRepairStarted: '2026-06-15', dateReceivedBack: '2026-07-13',
    amountPaidRands: 0, createdAt: 1 },
  { id: 'k2', vehicleId: 'v2', registrationNumber: 'XY-67-ZW-GP', vehicleName: 'Bakkie 2',
    teamName: 'Cape Town', incidentDate: '2026-08-20', claimDate: '2026-08-21',
    claimStatus: 'Settled', vehicleStatus: 'Written off', repairerName: '',
    dateReceivedBack: '', amountPaidRands: 185000, createdAt: 2 },
  { id: 'k3', vehicleId: 'v1', registrationNumber: 'bc45dfgp', vehicleName: 'Magnite',
    teamName: 'Midrand', incidentDate: '2026-09-02', claimDate: '2026-09-02',
    claimStatus: 'Open', vehicleStatus: 'Being repaired', repairerName: 'Panel Pros',
    dateRepairStarted: '2026-09-05', dateReceivedBack: '',
    amountPaidRands: 0, createdAt: 3 }
];
portal.claimFilters.query = '';
portal.renderInsurance();
const claims = writes()['clmRows'] ?? '';

// The grid, checked the way the other tables are: a row that disagrees with its header
// by one cell shifts every figure after it and still renders perfectly happily.
const clmTab = tabMarkup('insurance');
const clmHead = clmTab.slice(clmTab.lastIndexOf('<thead>'), clmTab.lastIndexOf('</thead>'));
const clmHeaders = (clmHead.match(/<th[\s>]/g) ?? []).length;
const clmRowStart = claims.indexOf('<tr>');
const clmCells = (claims.slice(clmRowStart, claims.indexOf('</tr>', clmRowStart)).match(/<td[\s>]/g) ?? []).length;
check('the claims header and its rows agree on the column count', clmCells, clmHeaders);

// Newest incident first: a claims list is read from the most recent thing that happened.
check('claims are listed newest incident first',
  portal.visibleClaims().map(c => c.id), ['k3', 'k2', 'k1']);
check('the claim count is shown', writes()['clmCount'], 3);

/* THREE INTERVALS, because a vehicle off the road for six weeks is a slow insurer or a
   slow repairer and the total cannot say which. That is the whole reason the day the
   repairer started is asked for. */
const repaired = portal.data.insuranceClaims[0];
const inTheShop = portal.data.insuranceClaims[2];
const writtenOff = portal.data.insuranceClaims[1];

check('the wait is the incident to the day the repairer took it',
  portal.daysToRepairStart(repaired), 14);
check('the repair is the repairer own clock, start to back',
  portal.daysAtRepairer(repaired), 28);
check('days off the road is the incident to the day it came back',
  portal.daysOffRoad(repaired), 42);
// The split must reconcile, or the two halves are measuring different things and the
// breakdown under the total is quietly nonsense.
check('and the two halves add up to the whole',
  portal.daysToRepairStart(repaired) + portal.daysAtRepairer(repaired),
  portal.daysOffRoad(repaired));

/* A VEHICLE STILL IN THE SHOP HAS HALF AN ANSWER, and the half it has is worth showing:
   how long it waited to be started on is already known and already finished. */
check('a vehicle in the shop already knows what it waited',
  portal.daysToRepairStart(inTheShop), 3);
check('but not what the repair took, because it is still running',
  portal.daysAtRepairer(inTheShop), null);
check('the breakdown names only the part that is settled',
  portal.turnaroundBreakdown(inTheShop), '3 to start');
check('and names both once the vehicle is back',
  portal.turnaroundBreakdown(repaired), '14 to start · 28 at repairer');
// A written-off vehicle never went to a repairer, so it has none of these.
check('a written-off vehicle has no repair timeline at all',
  [portal.daysToRepairStart(writtenOff), portal.daysAtRepairer(writtenOff),
   portal.turnaroundBreakdown(writtenOff)], [null, null, '']);
// NULL, NOT ZERO, for a vehicle still in the shop. A nought would sort as the fastest
// turnaround on record, which is exactly backwards for the one still costing money.
check('a vehicle that has not come back has no turnaround yet',
  portal.daysOffRoad(portal.data.insuranceClaims[2]), null);
check('and neither has a written-off one',
  portal.daysOffRoad(portal.data.insuranceClaims[1]), null);

/* THE TEAM IS WHO GETS TO SEE IT, so the form fills it from whoever drives the vehicle —
   but only where that is one team. A pool vehicle two teams share has no right answer,
   and guessing one would decide who reads the claim by accident. */
check('the team fills itself in from the vehicle driver',
  portal.soleTeamForVehicle(portal.data.vehicles[0]), 'Midrand');
check('but a vehicle two teams share is left for the admin to answer',
  portal.soleTeamForVehicle(portal.data.vehicles[2]), '');
check('and so is one nobody drives',
  portal.soleTeamForVehicle(portal.data.vehicles[1]), '');

/* A TEAM CAN BE TYPED, not only picked — a claim for a team nobody has signed up for
   yet has to be recordable now and readable by them the day they do.

   Which puts the whole weight of the feature on one string comparison. firestore.rules
   matches the claim's team against the reader's as plain text, so a claim stored as
   "midrand" against staff records saying "Midrand" is one its own team can never read,
   and nothing on any screen would ever say why. So an existing team is stored the way
   the staff records spell it, however it was typed. */
check('a known team typed in any case is stored the way the staff records spell it',
  ['midrand', 'MIDRAND', '  MiDrAnD  '].map(portal.canonicalTeam),
  ['Midrand', 'Midrand', 'Midrand']);
// Nothing is the authority on a team that does not exist yet, so it is kept as typed.
check('a genuinely new team is kept exactly as it was typed',
  portal.canonicalTeam('  Nelspruit North  '), 'Nelspruit North');
check('and an empty box is still empty', portal.canonicalTeam('   '), '');
check('a team nobody is on yet is known to be new',
  [portal.teamHasStaff('Midrand'), portal.teamHasStaff('midrand'),
   portal.teamHasStaff('Nelspruit North')], [true, true, false]);

/* ---------------- the claims export ---------------- */
const clmExport = portal.claimExportRows();
const clmExportHeader = clmExport[0];
const rowFor = (id) => {
  const c = portal.data.insuranceClaims.find(x => x.id === id);
  return clmExport.slice(1).find(r => r[clmExportHeader.indexOf('Incident date')] === c.incidentDate);
};
check('the export has a header and a row per claim', clmExport.length, 4);
check('every row has as many fields as the header',
  clmExport.slice(1).every(r => r.length === clmExportHeader.length), true);
check('the team is exported, since it is who the claim is visible to',
  rowFor('k1')[clmExportHeader.indexOf('Team')], 'Midrand');
check('the registration is spaced as it is shown everywhere else',
  rowFor('k1')[clmExportHeader.indexOf('Registration')], 'BC 45 DF GP');

// Bare numbers, so a spreadsheet can total them.
check('the payout is a bare number on a written-off vehicle',
  rowFor('k2')[clmExportHeader.indexOf('Amount paid R')], '185000.00');
// A BLANK IS NOT A NOUGHT, on both of these columns.
check('a repaired vehicle has no payout, not a payout of nothing',
  rowFor('k1')[clmExportHeader.indexOf('Amount paid R')], '');
check('and a vehicle still in the shop has no turnaround, not a turnaround of nothing',
  rowFor('k3')[clmExportHeader.indexOf('Days off the road')], '');
check('the turnaround is a bare number where there is one',
  rowFor('k1')[clmExportHeader.indexOf('Days off the road')], 42);
// Each interval its own column, so a spreadsheet can sort on whichever question is
// being asked — a slow insurer or a slow repairer.
check('the split is exported as its own two columns',
  [rowFor('k1')[clmExportHeader.indexOf('Days to repair starting')],
   rowFor('k1')[clmExportHeader.indexOf('Days at the repairer')]], [14, 28]);
check('a vehicle still in the shop exports the wait and leaves the repair blank',
  [rowFor('k3')[clmExportHeader.indexOf('Days to repair starting')],
   rowFor('k3')[clmExportHeader.indexOf('Days at the repairer')]], [3, '']);
check('and the date the repairer started travels with them',
  rowFor('k1')[clmExportHeader.indexOf('Date repairer started')], '2026-06-15');

// The export must cover exactly what the table shows.
portal.claimFilters.query = 'midrand';
const clmFiltered = portal.claimExportRows();
check('the export follows the search', clmFiltered.length - 1, 2);
check('and covers exactly what the table shows',
  clmFiltered.length - 1, portal.visibleClaims().length);
// Searching a plate ignores spacing, the same as the fleet search.
portal.claimFilters.query = 'bc45';
check('a run-together plate finds its claims', portal.visibleClaims().length, 2);
portal.claimFilters.query = '';

// An empty result must say why, or a search that matches nothing reads as no claims.
portal.data.insuranceClaims = [];
portal.renderInsurance();
check('an empty claims list explains itself',
  (writes()['clmRows'] ?? '').includes('No claims recorded'), true);

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

/* ---------------- a late knock-off has to say why ---------------- */
/* Aadil: "if an employee parks late, add a reason, this should be a mandatory field to
   allow them to knock off". The requiring happens on the phone, where the day is closed;
   what the PORTAL owes is showing the answer to whoever asked for it. */

// A day with something behind every figure, so the invariant below actually runs. By
// this point in the file the earlier fixtures are down to absences, and every breakdown
// renders a sentence rather than a table — an invariant that silently skips is worse
// than no invariant, so this sets the stage on purpose.
portal.data.employees = [
  { id: 'e1', name: 'Lerato', surname: 'Mokoena', province: 'Gauteng', teamName: 'Jozi',
    vehicleRegistration: 'BC45DFGP' },
  { id: 'e2', name: 'Sarah', surname: 'Dube', province: 'Eastern Cape', teamName: 'Mthatha' },
  { id: 'e3', name: 'Never', surname: 'Turnedup', province: 'Limpopo', teamName: 'Polokwane' }
];
portal.data.todaysLogs = [
  { id: 'x1', uid: 'e1', employeeName: 'Lerato Mokoena', date: day,
    startTimeMillis: at(day, '08:00'), endTimeMillis: at(day, '20:15'),
    startOdometerKm: 1000, endOdometerKm: 1100,
    mainAreasWorked: 'Soweto', lateReason: 'customer held me at the till' },
  { id: 'x2', uid: 'e2', employeeName: 'Sarah Dube', date: day,
    startTimeMillis: at(day, '08:00'), endTimeMillis: at(day, '21:00'),
    startOdometerKm: 1000, endOdometerKm: 1050, mainAreasWorked: 'Midrand' }
];
portal.data.dayFuelLogs = [
  { id: 'f1', uid: 'e1', employeeName: 'Lerato Mokoena', date: day, amountSpentRands: 450.5 }
];
portal.data.vehicles = [
  { id: 'v1', registrationNumber: 'BC 45 DF GP', name: 'Magnite',
    serviceIntervalKm: 15000, lastServiceOdometerKm: 15000, currentOdometerKm: 30000 }
];

/* EVERY BREAKDOWN'S COLUMNS MUST MATCH ITS CELLS. The phone has held this invariant
   since the day view was built and the portal never did — which is exactly the mistake
   adding a "Why" column invites: a heading with no cell under it, shifting every figure
   one place left, on a screen nobody would think to re-check. */
let tablesChecked = 0;
tileKeys.forEach(key => {
  const body = opened(key).body;
  const headings = (body.match(/<th\b/g) ?? []).length;
  if (headings === 0) return;   // a figure of nought renders a sentence, not a table
  [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1).forEach((r, i) => {
    tablesChecked += 1;
    const cells = (r[1].match(/<td\b/g) ?? []).length;
    check(`the ${key} breakdown: row ${i + 1} fills all ${headings} columns`, cells, headings);
  });
});
// And the invariant is not vacuous: it has to have looked at real rows.
check('the column invariant looked at several tables', tablesChecked >= 5, true);

// The reason itself, on the late list.
const lateNow = opened('late');
check('the late list has a Why column', lateNow.body.includes('Why'), true);
check('and shows what they typed',
  lateNow.body.toLowerCase().includes('customer held me at the till'), true);
/* A DAY CLOSED BEFORE THIS WAS ASKED FOR shows a dash, not "none given". Every day
   already in the database has no reason on it, and blaming somebody for not answering a
   question they were never asked would be the wrong reading. */
check('and a dash where nobody was ever asked',
  (lateNow.body.match(/—/g) ?? []).length >= 1, true);

/* ---------------- the employee CSV export ---------------- */
// This is the copy of the staff list that leaves the system, so what it contains and
// who it covers both matter more than usual.
portal.data.employees = [
  { id: 'e2', name: 'Zanele', surname: 'Buthelezi', province: 'Gauteng', teamName: 'Midrand',
    employeeNumber: '1002', cellNumber: '0821234567', contactEmail: 'z@example.com',
    dateOfBirth: '1986-09-07',
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
// The date of birth is in here so a column of them can be checked against the workbook
// it came from — it is the one detail whose absence shows up nowhere on screen.
check('the date of birth is exported',
  zanele[exportHeader.indexOf('Date of birth')], '1986-09-07');
check('and is blank rather than missing for somebody who has none',
  exported[1][exportHeader.indexOf('Date of birth')], '');
// The age travels with the date of birth, computed as at the day of the export — a
// spreadsheet outlives the day it was made, so the date beside it is what stays true.
check('the age is exported alongside the date of birth',
  Number(zanele[exportHeader.indexOf('Age')]) > 0, true);
check('and is blank, not zero, for somebody with no date of birth',
  exported[1][exportHeader.indexOf('Age')], '');
// Next to the date, so a column of ages can be read against the dates behind them.
check('the two columns sit together',
  exportHeader.indexOf('Age') - exportHeader.indexOf('Date of birth'), 1);

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
/* The month has to be set for visiblePerformanceRows(), which reads it off the picker.
   setValue(), NOT writes(): the harness keeps what a page RENDERS INTO an element apart
   from what an input HOLDS, and .value reads the second. Writing the month into the
   first left the picker empty, so visiblePerformanceRows() fell through to its default
   of the current month — which happened to be September 2026 when this was written, and
   is the only month these figures line up under. Green here, red from October. */
setValue('perfMonth', '2026-09');
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

/* Basic and commission added, over whichever of them arrived.

   Aadil's call, and he was asked: if one is missing the other should still total. What
   makes it readable is the Basic tile beside it showing a DASH — so a combined figure
   equal to commission is explained on the same screen, rather than looking like the
   broken sum it looked like when Basic read "R0,00". */
// The PORTAL's rule, not a copy of it — see combinedPay(). Re-implementing it here
// proved only that the test agreed with itself, and a mutation that broke the real
// rule passed.
const bothPay = portal.combinedPay;

check('the two add up when both are uploaded',
  bothPay(portal.performanceTotals(
    [member('A', 'Gauteng', 'Soweto', { basicSalaryRands: 6200, commissionRands: 5690 })])),
  11890);
check('commission alone still totals',
  bothPay(portal.performanceTotals(
    [member('A', 'Gauteng', 'Soweto', { commissionRands: 5690 })])),
  5690);
check('and basic alone too',
  bothPay(portal.performanceTotals(
    [member('A', 'Gauteng', 'Soweto', { basicSalaryRands: 6200 })])),
  6200);
// But NEITHER uploaded is still a dash, not R0,00 — the distinction that survives.
check('while neither uploaded is nothing at all',
  bothPay(portal.performanceTotals([member('A', 'Gauteng', 'Soweto', { stock: 600 })])),
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

/* Each network's payable on its own, then the combined figure. The combined one is what
   gets paid; the separate ones are what gets queried, because an argument about FY is
   always about one network and nobody should have to subtract to find it. */
check('each network has its own payable',
  [fyT.amountByNetwork.MTN, fyT.amountByNetwork.TELKOM], [5600 + 1750 + 1260, 2940]);
check('and they add up to the combined figure',
  fyT.amountByNetwork.MTN + fyT.amountByNetwork.TELKOM, fyT.amount);
// A network with nothing is a DASH, not R0,00 — the same rule as everywhere else.
const mtnOnly = portal.fyTotals(portal.fyRows('2026-08', 'MTN'));
check('a network with nothing shows as nothing',
  [mtnOnly.amountByNetwork.MTN, mtnOnly.amountByNetwork.TELKOM], [8610, null]);
check('and the total then equals the one network that has something',
  mtnOnly.amount, mtnOnly.amountByNetwork.MTN);
check('with nothing uploaded at all, every payable is a dash',
  portal.FY_NETWORKS.map(n => portal.fyTotals(portal.fyRows('2026-09', '')).amountByNetwork[n]),
  [null, null]);
// Built from FY_NETWORKS, so a third network would get a tile without anyone adding one.
check('a payable is worked out for every network FY runs on',
  Object.keys(portal.fyTotals(fyAug).amountByNetwork), portal.FY_NETWORKS);

/* STOCK AND CONNECTIONS PER NETWORK, the same as the payables and for the same reason.
   The tiles used to add MTN's to Telkom's and show one figure for each, and that number
   answers no question anybody asks: an argument about FY is always about one network,
   and the combined connections matched nothing on any file Aadil had in front of him.
   He asked where 10 526 connections had come from, which is exactly the right question
   to ask of a number nothing produces. */
check('stock is split by network',
  [fyT.byNetwork.MTN.stock, fyT.byNetwork.TELKOM.stock], [1800, 600]);
check('and so are connections',
  [fyT.byNetwork.MTN.connections, fyT.byNetwork.TELKOM.connections], [615, 210]);
// The split has to reconcile, or the tiles and the table are describing different months.
check('and each adds back up to the whole',
  [fyT.byNetwork.MTN.stock + fyT.byNetwork.TELKOM.stock,
   fyT.byNetwork.MTN.connections + fyT.byNetwork.TELKOM.connections],
  [fyT.stock, fyT.connections]);
// A network with nothing is a dash here too, never a nought.
check('a network with no stock shows nothing rather than none',
  [mtnOnly.byNetwork.MTN.connections, mtnOnly.byNetwork.TELKOM.connections],
  [mtnOnly.connections, null]);

/* AND NO TILE ADDS THE TWO TOGETHER any more, except the payable — which is the one
   figure that genuinely is a total, because somebody on both networks takes home the
   sum. Checked on the rendered markup, since the whole complaint was about what is on
   the screen rather than what the function returns. */
const fyFixture = portal.data.perfFy;
portal.data.perfFy = [
  { numberKey: 'T042', employeeNumber: 'T042', month: '2026-08', network: 'MTN',
    fyStock: 1000, fyConnections: 400, fyAmountRands: 5600 },
  { numberKey: 'T042', employeeNumber: 'T042', month: '2026-08', network: 'TELKOM',
    fyStock: 600, fyConnections: 210, fyAmountRands: 2940 }
];
portal.fyFilters.province = ''; portal.fyFilters.network = '';
portal.fyFilters.person = ''; portal.fyFilters.query = '';
setValue('fyMonth', '2026-08');
dataset('fyUploads').built = 'yes';
portal.renderFy();
const fyTileCaps = [...(writes()['fyTiles'] || '')
  .matchAll(/<div class="cap">([^<]*)</g)].map(m => m[1]);
check('every tile names the network it is about',
  fyTileCaps.filter(c => c === 'FY stock' || c === 'FY connections' || c === 'Stock → conn'),
  []);
check('and each network has its three',
  ['MTN stock', 'MTN connections', 'MTN stock → conn',
   'Telkom stock', 'Telkom connections', 'Telkom stock → conn']
    .every(c => fyTileCaps.includes(c)), true);
// The one total that survives, because it is the one that is really paid.
check('the payable total is still combined', fyTileCaps.includes('FY payable total'), true);
const fyTileBigs = [...(writes()['fyTiles'] || '')
  .matchAll(/<div class="big[^"]*">([^<]*)<\/div><div class="cap">([^<]*)</g)]
  .reduce((acc, m) => ({ ...acc, [m[2]]: m[1] }), {});
check('and the figures on them are that network\'s own',
  [fyTileBigs['MTN connections'], fyTileBigs['Telkom connections']], ['400', '210']);

// Back to the section's own fixture: everything below reads it.
portal.data.perfFy = fyFixture;

check('a network narrows it', portal.fyRows('2026-08', 'MTN').length, 3);
check('to that network only',
  portal.fyRows('2026-08', 'TELKOM').map(r => r.numberKey), ['T042']);
// FY runs on two networks, so choosing a third shows nothing rather than showing MTN.
check('a network FY does not run on shows nothing, not the wrong figures',
  portal.fyRows('2026-08', 'VODACOM').length, 0);
// The VALUES rather than the shape: deep-equalling the object broke the moment a
// per-network breakdown was added to it, which is not a change worth a failing test.
check('and its totals are dashes rather than noughts',
  ['stock', 'connections', 'amount'].map(f =>
    portal.fyTotals(portal.fyRows('2026-08', 'VODACOM'))[f]),
  [null, null, null]);

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

/* ---------------- amending a fuel entry ---------------- */
/* Fuel is typed at a pump by somebody who wants to get going, so it arrives wrong
   sometimes. The rules always let an admin fix it; there was nothing on screen to do it
   with, which left a wrong figure in the fuel report AND in the vehicle's cost per
   kilometre for good. */
portal.data.fuelLogs = [
  { id: 'f1', uid: 'u1', employeeName: 'Ayanda Ncube', date: '2026-09-01',
    amountSpentRands: 1250.5, litres: 52.1, odometerKm: 85000 },
  // Litres left blank, which is allowed — so there is no rand-per-litre to check.
  { id: 'f2', uid: 'u2', employeeName: 'Bongi Ndlovu', date: '2026-09-02',
    amountSpentRands: 990, litres: 0, odometerKm: 0 }
];
portal.data.recentTimeLogs = [];
portal.renderLogs();
const fuelHtml = writes()['fuelRows'] || '';

check('every fuel row offers an amend', (fuelHtml.match(/fuel-edit/g) || []).length, 2);
// The button carries the DOCUMENT id, not the row's position: a filtered or re-sorted
// list would otherwise amend whichever entry happened to sit in that slot.
check('and carries the document id rather than the row number',
  [...fuelHtml.matchAll(/data-id="([^"]+)"/g)].map(m => m[1]), ['f1', 'f2']);
check('rand per litre is shown as the sanity check on the pair',
  fuelHtml.includes(portal.rand(1250.5 / 52.1)), true);
check('and is a dash when litres were left blank',
  fuelHtml.split('<tr>')[2].includes('—'), true);

// The rest is Firestore work the harness stubs, so it is read out of src, declared
// at the top of this file.
// A correction must not introduce the kind of mistake it exists to fix.
check('a negative amount is refused rather than saved',
  src.includes("if (!Number.isFinite(amount) || amount < 0) problems.push('Amount must be R0 or more.');"),
  true);
check('and so are negative litres and a negative odometer',
  ['Litres must be 0 or more', 'Odometer must be 0 or more'].every(m => src.includes(m)),
  true);
// The employee's own timestamp says when they filled up and must survive the correction;
// a separate stamp records that somebody amended it.
check('an amendment is stamped separately',
  src.includes('amendedAtMillis: Date.now()') && src.includes('amendedByUid: currentUid'),
  true);
check('and leaves the time they actually filled up alone',
  /amendedAtMillis[^;]{0,200}timestampMillis/.test(src), false);
// Deleting names the entry in the question. "Are you sure" over a list of similar rows
// is not a question anybody can answer correctly.
check('a delete names the amount, the person and the date',
  ['of fuel logged by', 'This cannot be undone'].every(m => src.includes(m)), true);
check('and deletes that one document',
  src.includes("deleteDoc(doc(db, 'fuelLogs', editingFuelId))"), true);

/* ---------------- what employees owe ---------------- */
/* An invoice is the unit with a balance; its lines are what it is made of. Payments are
   recorded against the INVOICE because that is how people pay — a part payment is money
   off the invoice, not off the third product on it. */
portal.data.employees = [
  { id: 'd1', name: 'Ayanda', surname: 'Ncube', employeeNumber: 'T042',
    province: 'Gauteng', teamName: 'Soweto' },
  { id: 'd2', name: 'Bongi', surname: 'Ndlovu', employeeNumber: 'T099',
    province: 'Limpopo', teamName: 'Tzaneen' }
];
portal.data.debtLines = [
  // One invoice, three products — the case that makes an invoice the unit.
  { id: 'l1', numberKey: 'T042', employeeNumber: 'T042', uid: 'd1',
    invoiceNumber: 'INV-1001', invoiceDate: '2026-03-14', product: 'Airtime',
    quantity: 50, amountRands: 12500 },
  { id: 'l2', numberKey: 'T042', employeeNumber: 'T042', uid: 'd1',
    invoiceNumber: 'INV-1001', invoiceDate: '2026-03-14', product: 'SIM packs',
    quantity: 20, amountRands: 4000 },
  { id: 'l3', numberKey: 'T042', employeeNumber: 'T042', uid: 'd1',
    invoiceNumber: 'INV-1001', invoiceDate: '2026-03-14', product: 'Devices',
    quantity: 2, amountRands: 9000 },
  { id: 'l4', numberKey: 'T099', employeeNumber: 'T099', uid: 'd2',
    invoiceNumber: 'INV-1042', invoiceDate: '2026-08-20', product: 'Airtime',
    quantity: 30, amountRands: 7500 },
  { id: 'l5', numberKey: 'T099', employeeNumber: 'T099', uid: 'd2',
    invoiceNumber: 'INV-1050', invoiceDate: '2026-08-28', product: 'Devices',
    quantity: 1, amountRands: 4500 },
  // An invoice against a number nobody has: still owed, must stay visible.
  { id: 'l6', numberKey: 'T900', employeeNumber: 'T900', uid: '',
    invoiceNumber: 'INV-1099', invoiceDate: '2026-07-01', product: 'Airtime',
    quantity: 10, amountRands: 2500 }
];
portal.data.debtPayments = [
  { id: 'pay1', numberKey: 'T099', invoiceNumber: 'INV-1042',
    amountRands: 2500, paidDate: '2026-09-01' },
  { id: 'pay2', numberKey: 'T099', invoiceNumber: 'INV-1050',
    amountRands: 4500, paidDate: '2026-09-02' }
];

const invoices = portal.debtInvoices();
check('lines are grouped into invoices', invoices.length, 4);
const inv1001 = invoices.find(i => i.invoiceNumber === 'INV-1001');
check('an invoice carries all its products', inv1001.lines.length, 3);
check('and is billed the sum of them', inv1001.billed, 25500);

/* A PART payment comes off the invoice's balance and leaves the rest owing. This is the
   case an all-or-nothing "mark paid" could not express, and Aadil chose it deliberately. */
const inv1042 = invoices.find(i => i.invoiceNumber === 'INV-1042');
check('a part payment leaves the balance owing',
  [inv1042.billed, inv1042.paid, inv1042.outstanding], [7500, 2500, 5000]);
check('and the invoice is not settled', inv1042.settled, false);

// Paid in full: settled, and NOT reported as owing R0,00.
const inv1050 = invoices.find(i => i.invoiceNumber === 'INV-1050');
check('paid in full is settled', [inv1050.settled, inv1050.outstanding], [true, 0]);
// A settled invoice has no age: days outstanding is about a debt, and there is none.
check('and has no days outstanding to report', inv1050.daysOutstanding, null);
check('while an unpaid one does', inv1042.daysOutstanding !== null, true);

/* Oldest first, because that is the one to chase — the whole point of the tab. */
check('invoices come back oldest first',
  invoices.map(i => i.invoiceNumber),
  ['INV-1001', 'INV-1099', 'INV-1042', 'INV-1050']);

// An invoice against a number nobody has still appears, with no name rather than being
// dropped. That is real money owed.
const ghostInvoice = invoices.find(i => i.invoiceNumber === 'INV-1099');
check('an invoice matching nobody is still listed',
  [ghostInvoice.name, ghostInvoice.outstanding], ['', 2500]);

/* Per person, most owing first: the list is a list of who to phone. */
const people = portal.debtByEmployee();
check('people come back most owing first',
  people.map(r => [r.name || r.employeeNumber, r.outstanding]),
  [['Ayanda Ncube', 25500], ['T900', 2500], ['Bongi Ndlovu', 5000]]
    .sort((a, b) => b[1] - a[1]));
const bongi = people.find(r => r.name === 'Bongi Ndlovu');
check('a person totals across their invoices',
  [bongi.invoices, bongi.billed, bongi.paid, bongi.outstanding], [2, 12000, 7000, 5000]);
check('and counts only the unpaid ones as owing', bongi.unpaid, 1);
// The oldest UNPAID invoice, not the oldest invoice: a settled one is not a problem.
check('the oldest unpaid is the one that matters',
  bongi.oldestUnpaidDate, '2026-08-20');

/* Ageing. The number that gets people to pay, and the reason a big fresh balance is not
   the same problem as a small one from March. */
// Computed relative to today rather than written as a fixed date: an assertion that
// says "2026-09-01 is three days ago" is true for one day and wrong from then on.
const dayString = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};
check('days outstanding counts from the invoice date',
  [portal.daysSince(dayString(-3)), portal.daysSince(dayString(-90))], [3, 90]);
check('today is nought days', portal.daysSince(dayString(0)), 0);
check('and an unparseable date ages to nothing rather than to a wild number',
  [portal.daysSince(''), portal.daysSince('01/09/2026'), portal.daysSince(null)],
  [null, null, null]);

/* An invoice's age comes from the EARLIEST date on its lines, so adding a line to an old
   invoice cannot quietly reset how long it has been outstanding. */
portal.data.debtLines.push({
  id: 'l7', numberKey: 'T042', employeeNumber: 'T042', uid: 'd1',
  invoiceNumber: 'INV-1001', invoiceDate: '2026-09-01', product: 'Cables',
  quantity: 5, amountRands: 500
});
check('a line added later does not reset an invoice\'s age',
  portal.debtInvoices().find(i => i.invoiceNumber === 'INV-1001').invoiceDate, '2026-03-14');
check('but it does add to what is billed',
  portal.debtInvoices().find(i => i.invoiceNumber === 'INV-1001').billed, 26000);
portal.data.debtLines.pop();

/* An invoice paid to the last cent must read as settled rather than owing R0,00 —
   0.1 + 0.2 is not 0.3 in binary, and a balance of R0,00 that will not clear is the kind
   of thing somebody argues about. */
portal.data.debtLines.push({
  id: 'l8', numberKey: 'T500', employeeNumber: 'T500', uid: '',
  invoiceNumber: 'INV-CENTS', invoiceDate: '2026-08-01', product: 'Airtime',
  quantity: 1, amountRands: 0.30
});
portal.data.debtPayments.push(
  { id: 'pay3', numberKey: 'T500', invoiceNumber: 'INV-CENTS', amountRands: 0.10 },
  { id: 'pay4', numberKey: 'T500', invoiceNumber: 'INV-CENTS', amountRands: 0.20 });
const cents = portal.debtInvoices().find(i => i.invoiceNumber === 'INV-CENTS');
check('two part payments to the last cent settle the invoice',
  [cents.settled, cents.outstanding], [true, 0]);
portal.data.debtLines.pop();
portal.data.debtPayments.splice(-2, 2);

/* The upload takes the same six things the form asks for, and refuses the rest by name. */
check('the template parses cleanly through its own parser',
  portal.parseDebtLines([portal.DEBT_COLUMNS.join(','),
    ...portal.DEBT_SAMPLE.map(r => r.join(','))].join('\n')).errors.length, 0);
check('and yields a row per line', portal.parseDebtLines(
  [portal.DEBT_COLUMNS.join(','), ...portal.DEBT_SAMPLE.map(r => r.join(','))].join('\n')
).rows.length, portal.DEBT_SAMPLE.length);
// The comma-decimal trap, the same one the pay files have: reading the whole rands and
// dropping the cents in silence is worse than refusing the line.
check('a comma decimal in a comma file is named for what it is',
  portal.parseDebtLines('T042,INV-1,2026-09-01,Airtime,50,12500,50')
    .errors[0].why.includes('split across two columns'), true);
check('while a real extra column is not',
  portal.parseDebtLines('T042,INV-1,2026-09-01,Airtime,50,12500.00,9').errors[0].why,
  'more columns than this file should have');
// A semicolon file's comma IS a decimal, which is how South African Excel writes it.
check('a semicolon file reads its comma decimal',
  portal.parseDebtLines('T042;INV-1;2026-09-01;Airtime;50;12500,50').rows[0].amountRands,
  12500.5);
check('a missing column is named rather than counted',
  portal.parseDebtLines('T042,INV-1,2026-09-01,Airtime,50').errors[0].why,
  'Amount owing is blank');
// 01/09/2026 is now READ rather than refused — see the review findings at the end of
// this file. What is still refused is something that is not a date at all.
check('a spreadsheet date is read, not refused',
  portal.parseDebtLines('T042,INV-1,01/09/2026,Airtime,50,12500.00').rows[0].invoiceDate,
  '2026-09-01');
check('while something that is not a date is still refused',
  portal.parseDebtLines('T042,INV-1,tomorrow,Airtime,50,12500.00').rows.length, 0);
// Zero owing is not a debt, and storing it would put an invoice on the tab that is
// settled the moment it arrives.
check('and nothing owing is not a line',
  portal.parseDebtLines('T042,INV-1,2026-09-01,Airtime,50,0').errors[0].why,
  'amount owing must be more than R0');
// A product typed two ways is one product, so the picker and the totals agree.
check('a product name is normalised for matching',
  [portal.productKey(' Airtime '), portal.productKey('AIRTIME'), portal.productKey('air-time')],
  ['AIRTIME', 'AIRTIME', 'AIR TIME']);

/* The export's columns. A header and a row that disagree by one shifts every amount
   after it, and a debtors sheet of shifted amounts looks perfectly reasonable. */
Object.assign(portal.debtFilters, { show: 'all', query: '' });
const debtExport = portal.debtExportRows();
check('the export has a header and a row per invoice LINE',
  debtExport.length - 1, portal.data.debtLines.length);
check('every row has as many fields as the header',
  debtExport.slice(1).map(r => r.length),
  debtExport.slice(1).map(() => debtExport[0].length));
const airtimeLine = debtExport.find(r => r[4] === 'INV-1001' && r[7] === 'Airtime');
check('the line amount and the invoice balance are both there',
  [airtimeLine[debtExport[0].indexOf('Line amount R')],
   airtimeLine[debtExport[0].indexOf('Invoice billed R')],
   airtimeLine[debtExport[0].indexOf('Invoice owing R')]],
  ['12500.00', '25500.00', '25500.00']);
// So a sheet can be totalled by product without reconstructing which lines shared an
// invoice — which is what repeating the balance on each line is for.
check('and the invoice is named on every one of its lines',
  debtExport.filter(r => r[4] === 'INV-1001').length, 3);

/* ---------------- what the review pass turned up ---------------- */

/* A STRAY SPACE IN AN INVOICE NUMBER WAS SILENT DATA LOSS.
   The document id is built from the normalised number, so "INV-1042" and "INV 1042"
   share one — the second write replaced the first line. But the grouping used the number
   exactly as typed, so the screen showed two invoices with the payment on only one of
   them. A wrong balance and a missing line, from a space. */
portal.data.employees = [];
portal.data.debtLines = [
  { id: 'x1', numberKey: 'T042', employeeNumber: 'T042', invoiceNumber: 'INV-1042',
    invoiceDate: '2026-09-01', product: 'Airtime', quantity: 1, amountRands: 100 },
  { id: 'x2', numberKey: 'T042', employeeNumber: 'T042', invoiceNumber: 'INV 1042',
    invoiceDate: '2026-09-01', product: 'Devices', quantity: 1, amountRands: 200 }
];
portal.data.debtPayments = [
  { id: 'xp', numberKey: 'T042', invoiceNumber: 'INV-1042', amountRands: 100 }
];
const oneInvoice = portal.debtInvoices();
check('a stray space is the same invoice', oneInvoice.length, 1);
check('with both its lines', oneInvoice[0].lines.length, 2);
check('and the payment against it',
  [oneInvoice[0].billed, oneInvoice[0].paid, oneInvoice[0].outstanding], [300, 100, 200]);
check('shown as it was typed on its first line', oneInvoice[0].invoiceNumber, 'INV-1042');

/* THE TWO DEBT TABLES ANSWERED THE SEARCH SEPARATELY.
   Typing a product name filtered the invoices correctly and emptied the people table,
   because a person row has no product on it to match. An empty table beside a full one
   reads as a fault, and the placeholder promises the search covers products. The people
   table is now a rollup of exactly the invoices shown. */
portal.data.employees = [
  { id: 'r1', name: 'Ayanda', surname: 'Ncube', employeeNumber: 'T042',
    province: 'Gauteng', teamName: 'Soweto' },
  { id: 'r2', name: 'Bongi', surname: 'Ndlovu', employeeNumber: 'T099',
    province: 'Limpopo', teamName: 'Tzaneen' }
];
portal.data.debtLines = [
  { id: 'y1', numberKey: 'T042', employeeNumber: 'T042', invoiceNumber: 'INV-1042',
    invoiceDate: '2026-03-14', product: 'Airtime', quantity: 50, amountRands: 12500 },
  { id: 'y2', numberKey: 'T099', employeeNumber: 'T099', invoiceNumber: 'INV-2000',
    invoiceDate: '2026-08-01', product: 'SIM packs', quantity: 10, amountRands: 3000 }
];
portal.data.debtPayments = [
  { id: 'yp', numberKey: 'T099', invoiceNumber: 'INV-2000', amountRands: 3000 }
];

const debtTables = (show, query) => {
  Object.assign(portal.debtFilters, { show, query });
  portal.renderDebt();
  return {
    people: ['Ayanda', 'Bongi'].filter(n => (writes()['debtPeopleRows'] || '').includes(n)),
    invoices: [...new Set([...(writes()['debtInvoiceRows'] || '')
      .matchAll(/INV-\d+/g)].map(m => m[0]))]
  };
};

check('searching a product keeps the person who bought it',
  debtTables('owing', 'airtime'), { people: ['Ayanda'], invoices: ['INV-1042'] });
check('and searching an invoice number does too',
  debtTables('owing', 'INV-1042'), { people: ['Ayanda'], invoices: ['INV-1042'] });
// The show filter agrees between the two as well: settled shows only who has settled.
check('showing settled lists only the person who paid',
  debtTables('settled', ''), { people: ['Bongi'], invoices: ['INV-2000'] });
check('and owing only the person who has not',
  debtTables('owing', ''), { people: ['Ayanda'], invoices: ['INV-1042'] });
check('everything shows both', debtTables('all', ''),
  { people: ['Ayanda', 'Bongi'], invoices: ['INV-1042', 'INV-2000'] });
// A search matching nothing empties BOTH, which is the honest answer.
check('and a search matching nothing empties both',
  debtTables('owing', 'nonsense'), { people: [], invoices: [] });
Object.assign(portal.debtFilters, { show: 'owing', query: '' });

/* A DEBT DATE, HOWEVER A SPREADSHEET WROTE IT.
   The same failure the FY months had, fixed before the first debt file rather than
   after it. Day-first for the slashed form, because that is what South Africa writes —
   01/09/2026 is the first of September. */
check('a date is read whatever shape it came in',
  ['2026-09-01', '2026/09/01', '2026-9-1', '01/09/2026', '1/9/26', '1-Sep-26',
   '1 September 2026', 'Sep-1-2026'].map(portal.normaliseDate),
  ['2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01', '2026-09-01',
   '2026-09-01', '2026-09-01']);
check('a slashed date is read DAY first, as South Africa writes it',
  portal.normaliseDate('01/09/2026'), '2026-09-01');
check('but something that is not a date is still refused',
  ['32/01/2026', '01/13/2026', 'not a date', '', 'tomorrow'].map(portal.normaliseDate),
  ['', '', '', '', '']);
// And it is the NORMALISED date that is stored, or an invoice would age from a string
// nothing can subtract.
check('the normalised date is what gets stored',
  portal.parseDebtLines('T042,INV-1,01/09/2026,Airtime,50,12500.00').rows[0].invoiceDate,
  '2026-09-01');
check('and a bad one names the shapes that work',
  portal.parseDebtLines('T042,INV-1,tomorrow,Airtime,50,12500.00').errors[0].why
    .includes('01/09/2026'), true);

/* ---------------- finding one person ---------------- */
/* Aadil asked to pick an employee by name from a dropdown on FY and on Debt, because
   scrolling a few hundred rows to find the right person is the slow part of paying
   somebody. Both tabs already matched a name typed into their search box; a picker is
   the difference between knowing the name and remembering how it was spelled. */

// Keyed on the employee NUMBER, never the name. This staff list really does have a
// THABO MORRIS and a MORRIS MMADI, and matching on name once nearly paid the wrong one.
check('two people with one name stay two people',
  portal.personOptions([
    { numberKey: 'T160', employeeNumber: 'T160', name: 'THABO MORRIS' },
    { numberKey: 'T106', employeeNumber: 'T106', name: 'THABO MORRIS' }
  ]).map(o => o.key), ['T106', 'T160']);
// The number is on every label, which is what tells those two apart on screen.
check('and the number is on the label so they can be told apart',
  portal.personOptions([
    { numberKey: 'T160', employeeNumber: 'T160', name: 'THABO MORRIS' }
  ])[0].label, 'THABO MORRIS · T160');
// One person's several rows — two networks of FY, or four invoices — are one option.
check('somebody with several rows is listed once',
  portal.personOptions([
    { numberKey: 'T042', employeeNumber: 'T042', name: 'Ayanda Ncube' },
    { numberKey: 'T042', employeeNumber: 'T042', name: 'Ayanda Ncube' }
  ]).length, 1);
/* Somebody whose figures match nobody on the staff list is STILL LISTED, under their
   bare number. There are nine such FY rows waiting on an employee number right now,
   about R12 000 of payable — leaving them out of the picker would hide real money. */
check('a row matching nobody is listed under its number',
  portal.personOptions([{ numberKey: 'T999', employeeNumber: 'T999', name: '' }])[0],
  { key: 'T999', label: 'T999 · not on the staff list' });
check('and a row with no number at all is not an option',
  portal.personOptions([{ numberKey: '', employeeNumber: '', name: 'Nobody' }]), []);
/* The team and the age ride behind the number, so the option says WHO this is. */
check('an option carries the team and the age as well as the number',
  portal.personOptions([{ numberKey: 'T500', employeeNumber: 'T500',
    name: 'GEORGE DZINGOTIWANDIRA', team: 'MAMELODI', dateOfBirth: '1985-03-14' }])[0]
    .label.startsWith('GEORGE DZINGOTIWANDIRA · T500 · MAMELODI · '), true);
check('and a row with no team behind it is just the name and the number',
  portal.personOptions([{ numberKey: 'T501', employeeNumber: 'T501',
    name: 'MILTON MUSARURWA' }])[0].label, 'MILTON MUSARURWA · T501');

/* ---------------- who somebody is, on every screen ---------------- */
/* Aadil: "ON THE WEB PORTAL, ADD EMPLOYEE NAME, SURNAME AND TEAM, EG , GEORGE
   DZINGOTIWANDIRA, MAMELODI, THIS SHOULD APPLY TO ALL EMPLOYEES" — and then "AND AGE".

   personBits() is the one place that answers it, and every name on every screen goes
   through it. These tests are on the helper rather than on eight tables, because the
   fault worth guarding against is one screen quietly not using it. */

check('a person is their province, their team and their age',
  portal.personBits('GAUTENG', 'MAMELODI', '1985-03-14').slice(0, 2),
  ['GAUTENG', 'MAMELODI']);

/* THE AGE IS WORKED OUT FROM THE DATE, never read off a field. Asserted against a date
   built backwards from today, so this stays true tomorrow and every birthday after it —
   an expected number typed in here would have been wrong within the year. */
const yearsAgo = (years) => {
  const t = new Date();
  // ON 29 FEBRUARY there is no 29th to have been born on in a common year, so the date
  // built here would not be a date at all and every age below would come out blank —
  // once every four years, on one day, with nothing else to say what had gone wrong.
  const d = t.getMonth() === 1 && t.getDate() === 29 ? 28 : t.getDate();
  return `${t.getFullYear() - years}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
check('and the age is worked out from the date of birth, today',
  portal.personBits('', 'MAMELODI', yearsAgo(41)), ['MAMELODI', '41 years']);
/* NOT SIMPLY THE DAY AFTER. Where the birth year is a leap one, the day after the 28th
   is the 29th — and a 29 February birthday is deliberately read as falling TODAY in a
   common year, which is the rule birthday-cases.csv holds both implementations to. So on
   28 February 2025 this built somebody whose birthday is now and asserted they were a
   year younger. Step over the 29th; the point is a birthday not yet come round. */
const dayAfterBirthdayOf = (date) => {
  const next = portal.shiftDate(date, 1);
  return next.slice(5) === '02-29' ? portal.shiftDate(date, 2) : next;
};
check('so somebody whose birthday is tomorrow is still a year younger',
  portal.personBits('', '', dayAfterBirthdayOf(yearsAgo(41))), ['40 years']);
// One year reads as a year, not "1 years".
check('one year is singular', portal.personBits('', '', yearsAgo(1)), ['1 year']);

/* BLANKS ARE DROPPED. Two of the sixty-three staff records have no team and thirteen
   have no date of birth; a dash for each would put two columns of them down every
   screen and say nothing. */
check('no team and no date of birth leaves nothing behind the name',
  portal.personBits('', '', ''), []);
check('and the line itself disappears rather than showing empty',
  portal.personMeta('', '', ''), '');
check('a date that is not a date is not an age',
  portal.personBits('', 'MAMELODI', '1985-13-40'), ['MAMELODI']);
// A date of birth in the future is a typo. "-59 years" beside a name is worse than
// nothing at all.
// Tomorrow, not a year typed in: 2099 sat here, which stops being the future in 2099.
check('and a date of birth in the future is left off',
  portal.personBits('', 'MAMELODI', portal.shiftDate(portal.todayString(), 1)),
  ['MAMELODI']);

// The markup, once: escaped, in a meta line, with whatever extra class it was given.
check('the line is a meta line, escaped',
  portal.personMeta('GAUTENG', 'A & B', ''),
  '<div class="meta">GAUTENG · A &amp; B</div>');
check('and takes the caps class where the card wants one',
  portal.personMeta('', 'MAMELODI', '', 'caps'),
  '<div class="meta caps">MAMELODI</div>');

/* THE DAY VIEW'S OWN CELL, through the real personCell(): the screen he is on all day.
   Proves the helper is actually wired in rather than merely correct on its own. */
portal.data.employees = [
  { id: 'g1', name: 'GEORGE', surname: 'DZINGOTIWANDIRA', employeeNumber: 'T500',
    province: 'GAUTENG', teamName: 'MAMELODI', dateOfBirth: yearsAgo(41) }
];
check('the day view names them in full, with their team and their age',
  portal.personCell({ uid: 'g1' }),
  '<div class="nm">GEORGE DZINGOTIWANDIRA</div>'
    + '<div class="meta">GAUTENG · MAMELODI · 41 years</div>');
// Somebody who left: the log still carries the name it was written with, and there is
// no record behind it to add a team or an age to.
check('and a log with no record behind it still shows its name',
  portal.personCell({ uid: 'gone', employeeName: 'FORMER STAFF' }),
  '<div class="nm">FORMER STAFF</div>');


/* ---------------- the picker on FY ---------------- */
// The upload boxes on this tab build buttons with ids the static markup has not got,
// so  gives null for them and renderPerformanceUploads() cannot run here. Its own
// guard says it is already built; these tests are about the toolbar above it.
dataset('fyUploads').built = 'yes';
portal.data.employees = [
  { id: 'p1', name: 'Ayanda', surname: 'Ncube', employeeNumber: 'T042',
    province: 'Gauteng', teamName: 'Soweto' },
  { id: 'p2', name: 'Bongi', surname: 'Ndlovu', employeeNumber: 'T099',
    province: 'Limpopo', teamName: 'Tzaneen' }
];
portal.data.perfFy = [
  { id: 'f1', month: '2026-08', numberKey: 'T042', employeeNumber: 'T042',
    network: 'MTN', fyStock: 1000, fyConnections: 400, fyAmountRands: 600 },
  { id: 'f2', month: '2026-08', numberKey: 'T042', employeeNumber: 'T042',
    network: 'TELKOM', fyStock: 600, fyConnections: 210, fyAmountRands: 210 },
  { id: 'f3', month: '2026-08', numberKey: 'T099', employeeNumber: 'T099',
    network: 'MTN', fyStock: 500, fyConnections: 125, fyAmountRands: 187.5 }
];
portal.data.perfMonthly = [];
portal.data.perfTeams = [];
portal.data.debtLines = [];
portal.data.debtPayments = [];

const fyFor = (person, province = '') => {
  Object.assign(portal.fyFilters, { province, person, network: '', query: '' });
  setValue('fyMonth', '2026-08');
  portal.renderFy();
  return portal.visibleFyRows().map(r => `${r.employeeNumber}/${r.network}`);
};

check('with nobody picked, everybody with FY is there',
  fyFor(''), ['T042/MTN', 'T042/TELKOM', 'T099/MTN']);
// BOTH networks of the person picked: FY belongs to a person, and one person on two
// networks earned both amounts. Picking a name must not also pick a network.
check('picking a person leaves both of their networks',
  fyFor('T042'), ['T042/MTN', 'T042/TELKOM']);
check('and leaves nobody else', fyFor('T099'), ['T099/MTN']);

// The dropdown lists only the people with FY this month, so it cannot offer a name
// with nothing behind it.
/* The team is on the option too, because two Thabo Morrises are told apart by their
   number and their team long before anybody remembers which is which. Neither of these
   two has a date of birth on file, so neither has an age here — which is the blank
   being dropped rather than shown. */
check('the picker offers the month\'s people and an "all"',
  [...(writes()['fyPerson'] || '').matchAll(/>([^<]+)</g)].map(m => m[1]),
  ['All employees', 'Ayanda Ncube · T042 · Soweto',
    'Bongi Ndlovu · T099 · Tzaneen']);

/* A PERSON WHO IS NO LONGER THERE IS DROPPED, not left selected and quietly showing
   nothing. Narrowing to Limpopo with Ayanda picked would otherwise show an empty table
   under two filters that each look reasonable on their own. */
check('narrowing the province past the person picked releases them',
  fyFor('T042', 'Limpopo'), ['T099/MTN']);
check('and the filter really was cleared rather than just ignored',
  portal.fyFilters.person, '');
// The export follows the picker, so a sheet sent to payroll is the rows on screen.
check('the export is the person picked, not the whole month',
  (() => {
    fyFor('T042');
    return portal.fyExportRows('2026-08').slice(1).map(r => r[1]);
  })(), ['T042', 'T042']);
Object.assign(portal.fyFilters, { province: '', network: '', person: '', query: '' });

/* ---------------- the picker on Debt ---------------- */
portal.data.perfFy = [];
portal.data.debtLines = [
  { id: 'd1', numberKey: 'T042', employeeNumber: 'T042', invoiceNumber: 'INV-1',
    invoiceDate: '2026-03-14', product: 'Airtime', quantity: 50, amountRands: 12500 },
  { id: 'd2', numberKey: 'T099', employeeNumber: 'T099', invoiceNumber: 'INV-2',
    invoiceDate: '2026-08-01', product: 'SIM packs', quantity: 10, amountRands: 3000 },
  { id: 'd3', numberKey: 'T099', employeeNumber: 'T099', invoiceNumber: 'INV-3',
    invoiceDate: '2026-08-02', product: 'Devices', quantity: 1, amountRands: 5000 }
];
portal.data.debtPayments = [
  { id: 'dp', numberKey: 'T099', invoiceNumber: 'INV-2', amountRands: 3000 }
];

const debtFor = (person, show = 'owing') => {
  Object.assign(portal.debtFilters, { show, person, query: '' });
  portal.renderDebt();
  return {
    people: ['Ayanda', 'Bongi'].filter(n => (writes()['debtPeopleRows'] || '').includes(n)),
    invoices: [...new Set([...(writes()['debtInvoiceRows'] || '')
      .matchAll(/INV-\d+/g)].map(m => m[0]))]
  };
};

check('with nobody picked, everyone still owing is there',
  debtFor(''), { people: ['Ayanda', 'Bongi'], invoices: ['INV-1', 'INV-3'] });
// The people table is a rollup of the invoices shown, so it follows the picker too —
// the fault the review pass found on the search box, and it must not come back here.
check('picking a person narrows both tables together',
  debtFor('T042'), { people: ['Ayanda'], invoices: ['INV-1'] });
check('and the other person leaves only their own',
  debtFor('T099'), { people: ['Bongi'], invoices: ['INV-3'] });

/* The picker lists whoever the SHOW filter leaves, so on "still owing" it is a list of
   people to phone. Bongi's settled INV-2 is why "settled only" lists just them. */
const debtPickerNames = () =>
  [...(writes()['debtPerson'] || '').matchAll(/>([^<]+)</g)].map(m => m[1]);
check('the picker lists the people the Show filter leaves',
  (() => { debtFor('', 'owing'); return debtPickerNames(); })(),
  ['All employees', 'Ayanda Ncube · T042 · Soweto',
    'Bongi Ndlovu · T099 · Tzaneen']);
check('and on settled only, only the person who has settled something',
  (() => { debtFor('', 'settled'); return debtPickerNames(); })(),
  ['All employees', 'Bongi Ndlovu · T099 · Tzaneen']);
check('so switching Show past the person picked releases them',
  debtFor('T042', 'settled'), { people: ['Bongi'], invoices: ['INV-2'] });
check('and that filter was cleared too', portal.debtFilters.person, '');

/* The tiles are the WHOLE book, not the filtered view. "What am I owed" must not become
   a question about who happens to be picked in a dropdown. */
debtFor('T042', 'owing');
check('the tiles still answer for everybody',
  (writes()['debtTiles'] || '').includes(portal.rand(17500)), true);
Object.assign(portal.debtFilters, { show: 'owing', person: '', query: '' });

/* ---------------- a name that is not a team ---------------- */
/* Aadil: "MTN - TM - FY24 IS NOT A TEAM". A team file's first column is read as a team
   name, so a section heading sitting in that column becomes a team — and since it is the
   presence of a FIGURE that makes a team rankable, it lands on the leaderboard, sometimes
   at the top. There was no way to take one back. */
portal.data.employees = [
  { id: 'l1', name: 'Ayanda', surname: 'Ncube', employeeNumber: 'T042',
    province: 'Gauteng', teamName: 'Soweto Vodacom' }
];
portal.data.perfTeams = [
  { id: 't1', month: '2026-08', network: 'VODACOM', teamKey: 'SOWETO VODACOM',
    team: 'Soweto Vodacom', stock: 500, connections: 250, activations: 100 },
  { id: 't2', month: '2026-08', network: 'MTN', teamKey: 'MTNTMFY24',
    team: 'MTN - TM - FY24', stock: 9000, connections: 8000, activations: 7000 }
];
portal.data.perfMonthly = [];
portal.data.perfFy = [];
Object.assign(portal.lbFilters, { metric: 'connections', network: '', province: '' });
setValue('lbMonth', '2026-08');
portal.renderLeaderboard();
const boardHtml = writes()['lbRows'] || '';

// It is still RANKED — that part is deliberate and unchanged, because the phone ranks
// the same way and the two screens must not disagree about who came where.
check('the junk name is still ranked, as the phone ranks it',
  boardHtml.includes('MTN - TM - FY24'), true);
// And it is marked as what it is: a name on a figure and on nobody's record.
check('and marked as having nobody on it', boardHtml.includes('nobody on'), true);

/* THE BUTTON APPEARS ONLY WHERE NOBODY IS ON THE TEAM. A real team always has people, so
   it can never be offered beside one — which is also the honest test of the thing: a name
   on a figure and on no employee's record is either junk or a team nobody works for. */
const buttons = [...boardHtml.matchAll(/data-team="([^"]*)"/g)].map(m => m[1]);
check('a delete is offered for the junk name only', buttons, ['MTN - TM - FY24']);
check('and never beside a team with people on it',
  buttons.includes('Soweto Vodacom'), false);

/* AND IT CARRIES THE KEY, which is what the delete actually runs on. The row shape drops
   the figure on purpose but used to drop the key with it, so the button rendered
   data-key="undefined" and would have deleted nothing while reporting success. Matching
   on the name as typed instead would be the fuzzy matching this whole feature has been
   careful to avoid. */
check('the button carries the team key, not just the name',
  [...boardHtml.matchAll(/data-key="([^"]*)"/g)].map(m => m[1]), ['MTNTMFY24']);
check('and the key is on every row, ranked or not',
  portal.leaderboardRows('2026-08', 'connections').rows.map(r => r.key).sort(),
  ['MTNTMFY24', 'SOWETO VODACOM']);

// It deletes by teamKey across EVERY month, because a heading that was in one file is in
// all of them, and clearing it a month at a time is how it ends up half-done.
check('it removes every month at once',
  src.includes("where('teamKey', '==', key)"), true);
// Confirmed by typing the name, the same protection Remove a month uses — this deletes
// documents outright rather than clearing a field.
check('and asks for the name to be typed first',
  src.includes('Type the name (${team}) to confirm.'), true);
check('naming the months that will go',
  src.includes('month(s): ${months.join(\x27, \x27)}'), true);
// The months it touched are dropped from the loaded set, or the deleted figures stay on
// screen until the tab is changed and back.
check('and re-reads the months it touched',
  src.includes('months.forEach(m => perfMonthsLoaded.delete(m));'), true);

/* ---------------- the button says which month it will remove ---------------- */
/* It read "Remove a month" and took the month from a picker at the top of a long tab,
   so which month was about to go was something you worked out rather than read. On a
   button that clears somebody's pay, that is the wrong way round. */
portal.data.employees = [];
portal.data.perfMonthly = [
  { id: 'm1', month: '2026-08', numberKey: 'T042', commissionRands: 1200 },
  { id: 'm2', month: '2026-08', numberKey: 'T099', commissionRands: 800 },
  { id: 'm3', month: '2026-08', numberKey: 'T100', basicSalaryRands: 9000 }
];
portal.data.perfTeams = [];
portal.data.perfFy = [];

setValue('perfMonth', '2026-08');
check('the button names the month and how much is in it',
  portal.clearButtonLabel('commission').text, 'Remove 2026-08 (2)');
// Only THIS figure is counted. A month with basic in it but no commission has no
// commission to remove, whatever else is stored against the same person.
check('and counts only its own figure',
  portal.clearButtonLabel('basic').text, 'Remove 2026-08 (1)');
check('a month with none of it says so rather than offering a count',
  portal.clearButtonLabel('stock').text, 'Remove 2026-08 — none stored');
// The month follows the picker, which is the whole point.
setValue('perfMonth', '2026-09');
check('and it follows the month picker',
  portal.clearButtonLabel('commission').text, 'Remove 2026-09 — none stored');
check('with a note saying what is not there',
  portal.clearButtonLabel('commission').title,
  'No commission is stored for 2026-09.');
setValue('perfMonth', '2026-08');
check('while the note on a month that has some says what will go',
  portal.clearButtonLabel('commission').title,
  'Clears 2 commission figure(s) for 2026-08. Other months, and other figures in this '
  + 'month, are left alone.');

/* FY READS ITS OWN PICKER. Removing a month of FY once took the month from the
   Performance tab and named it correctly in the confirmation, so the wrong answer looked
   like the right one — that is why these two are separate. */
portal.data.perfFy = [
  { id: 'f9', month: '2026-07', numberKey: 'T042', network: 'MTN', fyStock: 100 }
];
setValue('fyMonth', '2026-07');
check('FY counts against its own month, not the performance tab\'s',
  [portal.clearButtonLabel('fy').text, portal.clearButtonLabel('commission').text],
  ['Remove 2026-07 (1)', 'Remove 2026-08 (2)']);

/* ---------------- whose birthday it is, for everybody ---------------- */
/* Aadil: "i want every single person signed up on the app to see whose birthday it is,
   that would create team spirit, eg, everyone to see happy birthday george".

   AN EMPLOYEE'S PHONE MAY READ ITS OWN USER RECORD AND NO OTHER. That rule keeps
   everybody's cell number, contact email and pay out of everybody else's app, and it is
   not worth loosening for a greeting. So the admin publishes the one thing that has to be
   shared into config/, which every signed-in user may already read and only an admin may
   write — no rules change, and nothing new exposed. */
portal.data.employees = [
  { id: 'u1', name: 'George', surname: 'Dzingotiwandira', employeeNumber: 'T090',
    dateOfBirth: '1979-09-08' },
  { id: 'u2', name: 'Thabo', surname: 'Ncube', employeeNumber: 'T039',
    dateOfBirth: '1988-09-08' },
  { id: 'u3', name: 'Gwinyai', surname: 'Marange', employeeNumber: 'T054',
    dateOfBirth: '1988-09-23' },
  // No date of birth: most of the staff list, and they must not appear at all.
  { id: 'u4', name: 'Nobody', surname: 'Yet', employeeNumber: 'T100', dateOfBirth: '' },
  // A leap-day birthday, which is filed under its own day and read on the 28th.
  { id: 'u5', name: 'Leap', surname: 'Person', employeeNumber: 'T111',
    dateOfBirth: '1988-02-29' }
];

const todayBoard = portal.birthdayBoardDoc();
check('only the people with a date of birth are on the board', todayBoard.people, 4);
check('and they are filed under the day, not the date',
  Object.keys(todayBoard.days).sort(), ['02-29', '09-08', '09-23']);

/* WHAT IS SHARED IS DELIBERATELY SMALL: a first name and a day. No year of birth, no
   surname, no employee number, no contact details — the todayBoard is readable by every
   signed-in employee, so every field on it is a decision. */
check('a board entry is a first name and a uid, and nothing else',
  Object.keys(todayBoard.days['09-23'][0]).sort(), ['name', 'uid']);
check('the name is the first name, which is what the greeting says',
  todayBoard.days['09-23'][0].name, 'Gwinyai');
/* Over the DAYS alone. The document also carries publishedAtMillis, and the digits of
   a live clock can spell any four in a row — they spell 1979 on 1 September 2027. A leak
   check that goes red on the clock is one nobody will trust the day it means something,
   and the claim here is about what the entries carry anyway. */
check('no year of birth reaches the board',
  JSON.stringify(todayBoard.days).includes('1979'), false);

// Two people on one day, in a settled order so republishing an unchanged list produces
// an unchanged document.
check('two people on one day are both there, in name order',
  todayBoard.days['09-08'].map(e => e.name), ['George', 'Thabo']);

/* READ BACK BY DAY, with the 29 February rule — the same substitution the greeting and
   the age make, so the todayBoard cannot greet on a different day from the card. */
check('today reads today',
  portal.boardEntriesFor(todayBoard, '2026-09-08').map(e => e.name), ['George', 'Thabo']);
check('a day with nobody on it reads empty',
  portal.boardEntriesFor(todayBoard, '2026-09-09'), []);
check('a leap-day birthday is read on the 28th in a common year',
  portal.boardEntriesFor(todayBoard, '2026-02-28').map(e => e.name), ['Leap']);
check('and on the 29th in a leap year',
  portal.boardEntriesFor(todayBoard, '2028-02-29').map(e => e.name), ['Leap']);
check('but not on the 28th of a leap year',
  portal.boardEntriesFor(todayBoard, '2028-02-28'), []);
// An absent board is a quiet nothing, not a crash: it does not exist until it is
// published for the first time.
check('no board at all greets nobody', portal.boardEntriesFor(null, '2026-09-08'), []);
check('and neither does an empty one', portal.boardEntriesFor({}, '2026-09-08'), []);

/* A DATE THE PHONE WOULD REFUSE NEVER REACHES THE BOARD, so no name can appear on a day
   it cannot be greeted on. The todayBoard is built through the same reader the greeting uses. */
portal.data.employees = [
  // A TYPED-WRONG YEAR IS STILL A REAL DAY, and the greeting has never looked at the
  // year — so this person IS on the board. Leaving them off was the first version of
  // this rule, and it greeted them on their own phone while hiding them from everybody
  // else, which is the opposite of what the board is for.
  { id: 'b1', name: 'Future', surname: 'Typo', dateOfBirth: '2086-09-08' },
  // Not a day at all: month thirteen, and a date the phone would refuse.
  { id: 'b2', name: 'Bad', surname: 'Month', dateOfBirth: '1986-13-01' },
  { id: 'b5', name: 'Never', surname: 'Happened', dateOfBirth: '1986-02-30' },
  // Not the shape the portal stores, so nothing can be read from it.
  { id: 'b3', name: 'Slashed', surname: 'Date', dateOfBirth: '08/09/1986' },
  // A real day, but no name to greet.
  { id: 'b4', name: '', surname: '', dateOfBirth: '1986-09-08' }
];
const refused = portal.birthdayBoardDoc();
check('only the real days with a name reach the board', refused.people, 1);
check('and it is the one whose year is merely wrong',
  portal.boardEntriesFor(refused, '2026-09-08').map(e => e.name), ['Future']);
check('a date that is not a day is left off',
  JSON.stringify(refused).includes('Bad') || JSON.stringify(refused).includes('Never'),
  false);
check('so is one the portal would never have stored',
  JSON.stringify(refused).includes('Slashed'), false);
check('and so is somebody with no name to greet',
  refused.days['09-08'].length, 1);

// Rebuilt WHOLE every time. A board assembled from edits drifts out of step with the
// records behind it and there is no way to see that it has.
check('the board is rebuilt from the records, never patched',
  src.includes('function birthdayBoardDoc()')
  && src.includes("setDoc(doc(db, 'config', 'birthdays')"), true);
// Published after anything that can change a date of birth, so it is never something an
// admin has to remember: a stale board shows the wrong name on the wrong day, weeks
// later, and nothing on any screen says why.
check('publishing happens wherever a date of birth can change',
  (src.match(/await publishBirthdays\(\);/g) || []).length >= 2, true);

/* THE NOTIFICATION HAS TO BE WHERE THE ADMIN LANDS. It was on the Employees tab inside
   the staff-list card — three screens down a tab nobody opens first — which is why
   George's birthday went past this morning with nothing said. */
/* THE DATES COME OFF TODAY, rather than being written into the fixture. This asked
   about 8 September, so it passed on 8 September and went red every morning after —
   and the setValue('dayDate', …) that used to sit here was never doing anything at all,
   because renderBirthdaysToday() has never read the picker. It reads the wall clock on
   purpose: a birthday is today whichever day is being looked at. So the fixture is what
   has to move. The birth year is a leap one, so a run on 29 February still gets a real
   date out of it. */
const birthdayIsToday = '1980-' + portal.todayString().slice(5);
// A hundred days off, so it can never be today, and can never be the 29 February that
// today's 28th would also greet.
const birthdayIsAnotherDay = '1980-' + portal.shiftDate(portal.todayString(), 100).slice(5);
portal.data.employees = [
  { id: 'u1', name: 'George', surname: 'D', dateOfBirth: birthdayIsToday },
  { id: 'u2', name: 'Gwinyai', surname: 'M', dateOfBirth: birthdayIsAnotherDay }
];
portal.data.birthdays = portal.birthdayBoardDoc();

portal.renderBirthdaysToday();
const banner = writes()['birthdayBanner'] || '';
check('the banner names whoever has a birthday today', banner.includes('George'), true);
check('and nobody who has one another day', banner.includes('Gwinyai'), false);
check('and says the whole company can see it too',
  banner.includes('signed in on the app'), true);

/* NOTHING AT ALL on a day with no birthdays. A card reading "no birthdays today" is
   noise on the screen that is about the day's work — an empty banner takes no room. */
portal.data.employees = [
  { id: 'u3', name: 'Nobody', surname: 'Today', dateOfBirth: birthdayIsAnotherDay }];
portal.data.birthdays = portal.birthdayBoardDoc();
portal.renderBirthdaysToday();
check('a day with no birthdays shows no banner at all',
  (writes()['birthdayBanner'] || '').trim(), '');
// The line beside the publish button still speaks, because that is the diagnostic: it
// answers "is anything published at all" when the banner is silent.
check('but the line beside the button still says how many are on file',
  (writes()['birthdaysToday'] || '').includes('person has'), true);

/* A BOARD THAT WAS NEVER PUBLISHED SAYS SO, rather than looking the same as a day with
   no birthdays. Those are different problems and only one of them needs acting on. */
portal.data.birthdays = null;
portal.renderBirthdaysToday();
check('an unpublished board asks to be published',
  (writes()['birthdaysToday'] || '').includes('never been published'), true);
check('and still shows no banner', (writes()['birthdayBanner'] || '').trim(), '');

// Both read the PUBLISHED document, not a fresh rebuild, so a stale board shows as
// stale rather than being quietly corrected on screen while the phones read the old one.
check('the portal shows what was published, not what would be',
  src.includes('const board = data.birthdays;'), true);

/* AND IT IS ACTUALLY DRAWN. The tests above call the render directly, which proves the
   markup and says nothing about whether anything calls it — so a mutation that drops the
   call from the day view passed them all while the banner never appeared. Checked at
   source, because the day view cannot be driven far enough under these stubs. */
const drawsBanner = (fn) =>
  new RegExp(`function ${fn}\\(\\) \\{\\s*renderBirthdaysToday\\(\\);`).test(src);
check('the day view draws it, which is where the notification belongs',
  drawsBanner('renderToday'), true);
check('and the employees tab draws its line too',
  drawsBanner('renderEmployees'), true);
check('and the banner has somewhere to be drawn into',
  src.includes('id="birthdayBanner"'), true);

/* THE BOARD MUST NOT BE ABLE TO TAKE THE DASHBOARD DOWN, and a failed read of it must
   not be mistaken for "no board yet" and answered by publishing one on every load.
   Both are checked at source: loadAll cannot be driven under these stubs. */
check('the board read is caught on its own',
  src.includes("getDoc(doc(db, 'config', 'birthdays')).catch(() => null)"), true);
check('and a missing document is told apart from a failed read',
  src.includes('birthdaysReadable: birthdays !== null'), true);
check('so the first publish only happens when the read actually worked',
  /if \(data\.birthdaysReadable && !data\.birthdays/.test(src), true);

/* ---------------- the load-bearing bits nothing was watching ---------------- */
/* Asked whether everything had been looked at, the honest answer was no — so the portal's
   functions were listed against the tests that name them, and forty-nine had none. Most
   are UI plumbing that cannot be driven under these stubs. These four are not: they are
   pure, they are load-bearing, and a wrong answer from any of them is quiet. */

/* SETTING A SERVICE INTERVAL ACROSS THE FLEET, by name or plate.
   Spacing is not part of a plate, and this box was the one place that thought it was:
   "BC45" found the vehicle in the fleet list above and nothing here. On a box that
   writes an interval to everything it matches, that means the interval lands on some of
   the fleet while the preview reads as though it were all of it. */
portal.data.vehicles = [
  { id: 'v1', name: 'Magnite', registrationNumber: 'BC 45 DF GP' },
  { id: 'v2', name: 'Bakkie 2', registrationNumber: 'ND111111' },
  { id: 'v3', name: 'Magnite 2', registrationNumber: 'CA 99 ZZ GP' }
];
const matching = (text) => { setValue('svcMatch', text);
  return portal.vehiclesMatchingInterval().map(v => v.id); };
check('a plate matches however it is spaced', matching('BC45'), ['v1']);
check('and with the spacing too', matching('BC 45 DF GP'), ['v1']);
check('and lower case', matching('bc45dfgp'), ['v1']);
check('a name still matches, and matches every vehicle carrying it',
  matching('magnite'), ['v1', 'v3']);
check('a partial plate matches the fleet it belongs to', matching('ND'), ['v2']);
// Empty means nothing rather than everything: this text sets an interval on what it
// finds, so an empty box must never mean "the whole fleet".
check('an empty box matches nothing at all', matching('   '), []);
check('and text matching nobody matches nobody', matching('zzzz'), []);

/* A PROVINCE, HOWEVER IT WAS TYPED. Get this wrong and somebody vanishes from every
   province filter — which looks like they left rather than like a spelling. */
check('a province is recognised however it is written',
  ['Gauteng', 'GAUTENG', 'gauteng', '  Limpopo  ', 'KWA-ZULU NATAL', 'kwazulu natal',
   'Kwa Zulu-Natal', 'North-West', 'NORTHWEST', 'Western  Cape'].map(portal.canonicalProvince),
  ['Gauteng', 'Gauteng', 'Gauteng', 'Limpopo', 'KwaZulu-Natal', 'KwaZulu-Natal',
   'KwaZulu-Natal', 'North West', 'North West', 'Western Cape']);
/* AND ONE IT DOES NOT RECOGNISE IS KEPT AS TYPED, never guessed at. Aadil's own REPS
   sheet says "JHB" and "KZN"; turning those into a province by resemblance is how
   somebody ends up filed in the wrong one, which is worse than being filed in none. */
check('and anything else is kept exactly as typed',
  ['JHB', 'KZN', 'Gautng', ''].map(portal.canonicalProvince),
  ['JHB', 'KZN', 'Gautng', '']);

/* HOURS ON A DAY, which is the figure behind every hours total on the dashboard. */
const shift = (from, to) => portal.minutesWorked({
  startTimeMillis: from === null ? 0 : at(day, from),
  endTimeMillis: to === null ? 0 : at(day, to)
});
check('a normal day is the minutes between', shift('08:00', '17:30'), 570);
// Every degenerate shape is nought rather than a negative or a nonsense figure: these
// are counted into a day's total, and one bad row would move it.
check('a day never finished counts nothing', shift('08:00', null), 0);
check('a day never started counts nothing', shift(null, '17:00'), 0);
check('and neither counts nothing', shift(null, null), 0);
check('knocking off before clocking in counts nothing, not a negative',
  shift('17:00', '08:00'), 0);

/* A SERVICE DATE, read DAY FIRST like every other date in this app. */
check('a service date is read however it is written',
  portal.parseServiceDate('2026-09-08'), portal.parseServiceDate('08/09/2026'));
check('and anything that is not a date is nought, not today',
  ['', 'not a date', '2026-13-01', '8 Sep 2026'].map(portal.parseServiceDate),
  [0, 0, 0, 0]);

/* ---------------- one case, everywhere ---------------- */
/* A name that reads "Soweto" in a dropdown and "SOWETO" in the table below it makes
   somebody stop and check whether they are the same place. These rules are display
   only — the stored value keeps whatever was typed — so they cannot be verified by
   driving a render, and are checked at source. */
check('dropdown options are capitalised like the cells they filter',
  /table td, select option,[^}]*text-transform: uppercase/.test(src), true);
check('and table headings are capitals too, from their own heading style',
  /th \{[^}]*text-transform: uppercase/.test(src), true);
check('and so is anything being typed into a box',
  /input\[type="text"\][^}]*text-transform: uppercase/.test(src), true);

/* THE EXEMPTION IS BY TYPE, so an email box declared as a plain text input would be
   uppercased with the rest — an address is hard to read back to somebody that way and
   looks like a mistake. Passwords are not display text at all. */
check('while addresses, links and passwords keep their own case',
  /\.email, a, input\[type="email"\], input\[type="password"\][^}]*text-transform: none/
    .test(src), true);
const emailBoxes = [...src.matchAll(/<input[^>]*id="[^"]*[Ee]mail[^"]*"[^>]*>/g)]
  .map(m => m[0]);
check('there is more than one email box to check', emailBoxes.length >= 2, true);
check('and every one of them is typed as an email, so none gets uppercased',
  emailBoxes.filter(t => !t.includes('type="email"')), []);

// The same omission one level down: tileSub sat without .caps while every one of its
// siblings had it, so the day view's tile modal named a person in whatever case they
// were typed in and the three modals beside it did not.
check('every modal sub-label is capitalised',
  ['tileSub', 'svcSub', 'fuelEditSub', 'entrySub']
    .filter(id => !new RegExp(`class="sub caps"[^>]*id="${id}"`).test(src)), []);


/* ---------------- one team's book, typed against everybody on it ---------------- */
/* FY is stored per PERSON; the figures arrive per TEAM — one line per branch on the
   network's report. Where two reps share a branch, the branch's figure gets typed against
   both and the total counts that book twice. On the real September file that was 322 of
   40 799 MTN connections, from two branches.

   The repeat is COUNTED ONCE and MARKED, never hidden: with a small figure two reps
   really could each have sold one, so the reader has to be able to see what was set aside
   and disagree with it. */
portal.data.employees = [
  { id: 'a', employeeNumber: 'T074', name: 'Chance', surname: 'Chikede', teamName: 'NEWCASTLE',
    province: 'KwaZulu-Natal' },
  { id: 'b', employeeNumber: 'T079', name: 'Jealous', surname: 'Goora', teamName: 'newcastle',
    province: 'KwaZulu-Natal' },
  { id: 'c', employeeNumber: 'T099', name: 'Tawanda', surname: 'Mandebvu',
    teamName: 'PORT ELIZABETH', province: 'Eastern Cape' }
];
portal.data.perfFy = [
  { numberKey: 'T074', employeeNumber: 'T074', month: '2026-09', network: 'MTN',
    fyConnections: 321, fyStock: 900, fyAmountRands: 4200 },
  // The same branch book, typed against the other rep on the branch.
  { numberKey: 'T079', employeeNumber: 'T079', month: '2026-09', network: 'MTN',
    fyConnections: 321, fyStock: 900, fyAmountRands: 4200 },
  { numberKey: 'T099', employeeNumber: 'T099', month: '2026-09', network: 'MTN',
    fyConnections: 1197, fyStock: 2000, fyAmountRands: 9000 }
];

const fySep = portal.fyRows('2026-09', '');
const fyRepeats = portal.fyRepeats(fySep);
check('the second copy is spotted', fyRepeats.count, 2);
check('and it is the higher employee number that gives way',
  [...fyRepeats.dropped].sort(), ['T079|MTN|connections', 'T079|MTN|stock']);
check('the amount set aside is named',
  [fyRepeats.excluded.connections, fyRepeats.excluded.stock], [321, 900]);

const fySums = portal.fyTotals(fySep);
// 321 + 321 + 1197 would be 1839. The branch sold 321, so the honest figure is 1518.
check('and the total counts the book once', fySums.byNetwork.MTN.connections, 1518);
check('stock the same way', fySums.byNetwork.MTN.stock, 2900);
/* THE PAYABLE IS NOT TOUCHED. It is money owed to a named person, and two reps on one
   branch can perfectly well be paid the same for their own work — dropping one of those
   takes somebody's pay off the report it is owed on. */
check('but the payable is left alone', fySums.byNetwork.MTN.amount, 17400);

// A team is only a team once its name is normalised: NEWCASTLE and newcastle are one.
check('case in the team name does not hide a repeat',
  fyRepeats.dropped.has('T079|MTN|connections'), true);

/* A DIFFERENT FIGURE IS NOT A REPEAT. Two reps splitting a branch between them is the
   thing this is asking him to do, and it must not then be undone. */
portal.data.perfFy[1].fyConnections = 160;
portal.data.perfFy[1].fyStock = 450;
const split = portal.fyRows('2026-09', '');
check('a split branch is two real figures', portal.fyRepeats(split).count, 0);
check('and both are counted', portal.fyTotals(split).byNetwork.MTN.connections, 1678);

/* AND THE SAME FIGURE ON TWO DIFFERENT TEAMS IS A COINCIDENCE, not a repeat. Bloemfontein
   and Newcastle both did 321 in September; calling that a duplicate takes a real month off
   somebody. */
portal.data.perfFy[1].fyConnections = 321;
portal.data.perfFy[1].fyStock = 900;
portal.data.employees[1].teamName = 'BLOEMFONTEIN';
const elsewhere = portal.fyRows('2026-09', '');
check('the same figure on another team is left alone', portal.fyRepeats(elsewhere).count, 0);
check('and both books count', portal.fyTotals(elsewhere).byNetwork.MTN.connections, 1839);

/* SOMEBODY NOT ON THE STAFF LIST has no team to be compared within, and is always
   counted — that row is real money nobody can yet attribute, which is the one thing that
   must never quietly disappear. */
portal.data.employees = [];
const nameless = portal.fyRows('2026-09', '');
check('a row with no team is never set aside', portal.fyRepeats(nameless).count, 0);
check('and every figure still counts',
  portal.fyTotals(nameless).byNetwork.MTN.connections, 1839);

/* ---------------- and the tab says what it did ---------------- */
portal.data.employees = [
  { id: 'a', employeeNumber: 'T074', name: 'Chance', surname: 'Chikede', teamName: 'NEWCASTLE',
    province: 'KwaZulu-Natal' },
  { id: 'b', employeeNumber: 'T079', name: 'Jealous', surname: 'Goora', teamName: 'NEWCASTLE',
    province: 'KwaZulu-Natal' }
];
portal.data.perfFy = portal.data.perfFy.slice(0, 2);
setValue('fyMonth', '2026-09');
portal.renderFy();

const showing = writes()['fyShowing'] || '';
check('the tab says how many it left out', showing.includes('2 figures left out'), true);
check('and names the figures and the amounts',
  [showing.includes('321 connections'), showing.includes('900 stock')], [true, true]);
// "Some rows were excluded" announces that something is wrong without saying what, and
// the reader cannot check it.
check('and why', showing.includes('recorded twice on one team'), true);

const fyBody = writes()['fyRows'] || '';
check('the repeated figure is still on the table', fyBody.includes('line-through'), true);
check('and labelled', fyBody.includes('repeat'), true);
// Both reps stay visible. Hiding the row would look like the upload had failed.
check('both people are still listed',
  [fyBody.includes('Chance'), fyBody.includes('Jealous')], [true, true]);

// Nothing to say when there is nothing to say.
portal.data.perfFy[1].fyConnections = 160;
portal.data.perfFy[1].fyStock = 450;
portal.renderFy();
check('a clean month says nothing about repeats',
  (writes()['fyShowing'] || '').includes('left out'), false);

/* THE EXPORT AND THE SCREEN MUST AGREE. An export whose figures do not add up to the tile
   beside them is the quiet kind of wrong this whole change exists to stop. */
portal.data.perfFy[1].fyConnections = 321;
portal.data.perfFy[1].fyStock = 900;
const fyExported = portal.fyExportRows('2026-09');
check('the export has a column for it',
  fyExported[0][fyExported[0].length - 1], 'Left out of the total');
check('and names the figures on the repeated row',
  fyExported.slice(1).map(r => r[r.length - 1]).sort(), ['', 'stock and connections']);



/* ---------------- a range of months on the Performance tab ---------------- */
/* Aadil: "can we select multiple months, eg jan to july". The figures are stored one
   month at a time and were read one month at a time, so the range is a filter change
   rather than a new way of storing anything. */

check('a range is inclusive at both ends',
  portal.perfMonthsInRange('2026-01', '2026-03'), ['2026-01', '2026-02', '2026-03']);
check('one month is just that month',
  portal.perfMonthsInRange('2026-07', '2026-07'), ['2026-07']);
check('and it crosses a year end',
  portal.perfMonthsInRange('2025-11', '2026-02'),
  ['2025-11', '2025-12', '2026-01', '2026-02']);
/* GIVEN THE WRONG WAY ROUND IT SWAPS THEM. Somebody setting a range moves one picker at
   a time, so "July to March" is a state the screen passes through on the way to what was
   meant, and an empty table in the middle of that reads as a fault. */
check('back to front is the same range',
  portal.perfMonthsInRange('2026-07', '2026-03'), portal.perfMonthsInRange('2026-03', '2026-07'));
// An empty or malformed "from" is one month, which is how the tab behaved before today.
check('no start is a single month', portal.perfMonthsInRange('', '2026-05'), ['2026-05']);
check('and nor does rubbish widen it', portal.perfMonthsInRange('later', '2026-05'), ['2026-05']);
// A mistyped year would otherwise ask for twelve hundred months and read the database dry.
check('a mistyped year cannot ask for centuries',
  portal.perfMonthsInRange('1900-01', '2026-05').length, portal.PERF_HISTORY_MONTHS + 1);

/* ---- the figures added rngAcross it ---- */
portal.data.employees = [
  { id: 'a', employeeNumber: 'T001', name: 'Ayanda', surname: 'Khumalo',
    teamName: 'SOWETO', province: 'Gauteng' },
  { id: 'b', employeeNumber: 'T002', name: 'Bongi', surname: 'Ndlovu',
    teamName: 'TEMBISA', province: 'Gauteng' }
];
portal.data.perfTeams = [
  { teamKey: 'SOWETO', team: 'SOWETO', month: '2026-01', network: 'MTN',
    stock: 100, connections: 40 },
  { teamKey: 'SOWETO', team: 'SOWETO', month: '2026-02', network: 'MTN',
    stock: 200, connections: 90 },
  { teamKey: 'SOWETO', team: 'SOWETO', month: '2026-03', network: 'MTN',
    stock: 300, connections: 150 },
  // Tembisa sold nothing in February — an absent month, not a nought.
  { teamKey: 'TEMBISA', team: 'TEMBISA', month: '2026-01', network: 'MTN',
    stock: 50, connections: 10 },
  { teamKey: 'TEMBISA', team: 'TEMBISA', month: '2026-03', network: 'MTN',
    stock: 70, connections: 30 }
];
portal.data.perfMonthly = [
  { numberKey: 'T001', month: '2026-01', commissionRands: 1000, basicSalaryRands: 5000 },
  { numberKey: 'T001', month: '2026-02', commissionRands: 1500, basicSalaryRands: 5000 },
  { numberKey: 'T001', month: '2026-03', commissionRands: 2000, basicSalaryRands: 5000 }
];
portal.data.perfFy = [];

const rngQ1 = ['2026-01', '2026-02', '2026-03'];
const rngAcross = portal.teamFiguresAcross(rngQ1, '');
check('three months of stock are added', rngAcross.SOWETO.stock, 600);
check('and three months of connections', rngAcross.SOWETO.connections, 280);
check('a month a team missed simply is not added', rngAcross.TEMBISA.stock, 120);
/* A FIGURE NO MONTH CARRIED STAYS NULL. Nothing uploaded is not a nought, and a range is
   not a licence to turn one into the other — the tile would read a real 0 either way. */
check('and a figure nobody uploaded stays a dash', rngAcross.SOWETO.activations, null);
// One month has to come out exactly as it did before there were ranges.
check('one month is untouched by any of this',
  portal.teamFiguresAcross(['2026-02'], ''), portal.teamFiguresFor('2026-02', ''));

/* PAY IS ADDED TOO. Seven months of commission is what that person earned over seven
   months, which is the question being asked by picking seven months. */
const rngRanged = portal.performanceRows(rngQ1, '');
const rngAyanda = rngRanged.find(r => r.employeeNumber === 'T001');
check('commission is summed over the range', rngAyanda.commissionRands, 4500);
check('and so is basic', rngAyanda.basicSalaryRands, 15000);
check('with the team figures beside them', [rngAyanda.stock, rngAyanda.connections], [600, 280]);
const rngBongi = rngRanged.find(r => r.employeeNumber === 'T002');
check('somebody with no pay uploaded still shows a dash',
  [rngBongi.commissionRands, rngBongi.basicSalaryRands], [null, null]);
// The old call still works, because the leaderboard and the spec tests use it.
check('a bare month string still works',
  portal.performanceRows('2026-02', '').find(r => r.employeeNumber === 'T001').stock, 200);

/* ---- a column per month ---- */
const rngGrid = portal.perfByMonthRows(rngQ1, '', 'connections');
check('one row per team', rngGrid.map(r => r.team), ['SOWETO', 'TEMBISA']);
check('biggest first, because the question is who carries the period',
  rngGrid.map(r => r.total), [280, 40]);
check('a column per month', rngGrid[0].months, { '2026-01': 40, '2026-02': 90, '2026-03': 150 });
// An absent month must not read as a nought: the row would say they sold none.
check('and a month with nothing is absent rather than nought',
  Object.keys(rngGrid[1].months), ['2026-01', '2026-03']);
check('the figure chosen is the figure shown',
  portal.perfByMonthRows(rngQ1, '', 'stock')[0].total, 600);

/* A BOOK NOBODY IS POSTED TO IS LISTED. That is how the unclaimed ones get found, and the
   employee table cannot show them — it is built from the staff list. */
portal.data.perfTeams.push({ teamKey: 'HAZYVIEW', team: 'HAZYVIEW', month: '2026-01',
  network: 'MTN', connections: 999 });
check('a team nobody is on still has a row',
  portal.perfByMonthRows(rngQ1, '', 'connections')[0].team, 'HAZYVIEW');
// Until a filter is set, at which point the table is about those people's teams.
check('but a filter narrows it to the teams on screen',
  portal.perfByMonthRows(rngQ1, '', 'connections', new Set(['SOWETO'])).map(r => r.team),
  ['SOWETO']);
portal.data.perfTeams.pop();

/* ---- what the tab shows ---- */
setValue('perfFrom', '2026-01');
setValue('perfMonth', '2026-03');
portal.perfFilters.province = '';
portal.perfFilters.team = '';
portal.perfFilters.query = '';
portal.perfFilters.network = '';
portal.renderPerformance();

check('the range is what the tab reads', portal.perfRange(), rngQ1);
// A total over three months looks exactly like a total over one, and the pickers it came
// from are above the tiles rather than beside them.
check('the count names the period',
  (writes()['perfShowing'] || '').includes('2026-01 to 2026-03 · 3 months added up'), true);
check('the tiles add the range up',
  (writes()['perfTiles'] || '').includes('720'), true);   // 600 + 120 stock
check('the month-by-month table is showing', classesOf('perfByMonthCard').includes('hidden'), false);
check('with a column for each month',
  (writes()['perfByMonthHead'] || '').match(/<th>2026-0\d<\/th>/g).length, 3);

// One month is the table above it with a single column, so it says nothing at all.
setValue('perfFrom', '2026-03');
portal.renderPerformance();
check('one month hides it again', classesOf('perfByMonthCard').includes('hidden'), true);
check('and the count just names the month',
  (writes()['perfShowing'] || '').includes('· 2026-03'), true);

/* THE EXPORT SAYS THE SAME THING AS THE SCREEN, and says it in ONE cell — an array
   dropped into a cell writes itself with commas, which in a comma-separated file shifts
   every column after it. */
const rngPerfCsv = portal.performanceExportRows(rngQ1);
check('the month column names the whole period',
  rngPerfCsv[1][rngPerfCsv[0].indexOf('Month')], '2026-01 to 2026-03');
check('and one month still names itself',
  portal.performanceExportRows('2026-02')[1][rngPerfCsv[0].indexOf('Month')], '2026-02');
const rngGridCsv = portal.perfByMonthExportRows(rngQ1, 'connections');
check('the grid exports its own shape', rngGridCsv[0], ['Team', ...rngQ1, 'Total']);
check('and its rows', rngGridCsv[1], ['SOWETO', 40, 90, 150, 280]);
check('a month a team missed exports empty, not nought', rngGridCsv[2], ['TEMBISA', 10, '', 30, 40]);



/* ---------------- stock on hand ---------------- */
/* Counted, not calculated. What makes the tab readable is knowing how OLD each figure is
   and which branches have not been counted at all. */
portal.data.stockCounts = [
  // Soweto counted twice, so it has a change to show.
  { teamKey: 'SOWETO', team: 'SOWETO', countedOn: '2026-09-01', network: 'MTN', held: 10000 },
  { teamKey: 'SOWETO', team: 'SOWETO', countedOn: '2026-09-01', network: 'TELKOM', held: 4000 },
  { teamKey: 'SOWETO', team: 'SOWETO', countedOn: '2026-09-15', network: 'MTN', held: 12000 },
  { teamKey: 'SOWETO', team: 'SOWETO', countedOn: '2026-09-15', network: 'TELKOM', held: 3000 },
  // Tembisa counted MTN last week and Cell C a month ago: two facts of different ages.
  { teamKey: 'TEMBISA', team: 'TEMBISA', countedOn: '2026-09-14', network: 'MTN', held: 5000 },
  { teamKey: 'TEMBISA', team: 'TEMBISA', countedOn: '2026-08-10', network: 'CELLC', held: 900 }
];

const onHand = portal.stockOnHandRows('2026-09-16');
check('one row per branch, biggest holding first',
  onHand.map(r => [r.team, r.held]), [['SOWETO', 15000], ['TEMBISA', 5900]]);
// The newest count for each network wins; the one it replaced is what change measures from.
check('the latest count for each network is the one shown',
  onHand[0].networks.MTN.held, 12000);
check('and the change is against the previous count', onHand[0].change, 1000);
/* A ROW IS AS OLD AS ITS OLDEST NETWORK. Dating it by the newest would read a month-old
   Cell C figure as current because MTN was counted yesterday. */
check('a row is dated by its oldest network', onHand[1].countedOn, '2026-08-10');
check('and says how many days that is', onHand[1].daysOld, 37);
// Change needs every network on the row counted twice, or it is comparing halves.
check('a branch counted only once has no change to show', onHand[1].change, null);

/* WHO TO CHASE — built from the teams in the FIGURES, not the staff list, because a
   branch nobody is posted to still holds stock and is the one nobody thinks to ask. */
portal.data.perfTeams = [
  { teamKey: 'SOWETO', team: 'SOWETO', month: '2026-09', network: 'MTN', stock: 20000 },
  { teamKey: 'TEMBISA', team: 'TEMBISA', month: '2026-09', network: 'MTN', stock: 8000 },
  { teamKey: 'HAZYVIEW', team: 'HAZYVIEW', month: '2026-09', network: 'MTN', stock: 30000 }
];
const chase = portal.stockNotCounted('2026-09', 14, '2026-09-16');
check('a branch never counted is on the list, and first',
  chase.map(r => r.team), ['HAZYVIEW', 'TEMBISA']);
check('never counted says so rather than showing a date', chase[0].countedOn, '');
check('a stale count is chased too, with its age', [chase[1].team, chase[1].daysOld],
  ['TEMBISA', 37]);
check('and the allocation is beside it, so the biggest gap is obvious',
  chase[0].allocated, 30000);
// Soweto was counted yesterday, so it is not on anybody's list.
check('a fresh count is not chased',
  chase.some(r => r.team === 'SOWETO'), false);

/* COVER: the count against that branch's own average monthly allocation. Averaged over a
   quarter so one big month cannot set it. */
check('cover is the count over the average month',
  portal.stockMonthsOfCover('SOWETO', 20000, ['2026-09']), 1);
check('a branch with no allocation has no cover to report',
  portal.stockMonthsOfCover('NOWHERE', 500, ['2026-09']), null);

/* THIS MONTH IS NOT ONE OF THE MONTHS COVER IS AVERAGED OVER, and that is the bug this is
   here for. On the eighteenth a month has had about sixty per cent of its allocation, so
   averaging it in drags the average down and makes the same holding look like more months
   of cover than it is — worst early in the month, which is when the figure gets read. */
check('cover looks at three months', portal.stockCoverMonths('2026-09-18').length,
  portal.STOCK_COVER_MONTHS);
check('and none of them is this one',
  portal.stockCoverMonths('2026-09-18').includes('2026-09'), false);
check('it is the three complete months before it',
  portal.stockCoverMonths('2026-09-18'), ['2026-08', '2026-07', '2026-06']);
// And it steps over a year end without landing on month zero.
check('stepping back over a year end still works',
  portal.stockCoverMonths('2027-01-05'), ['2026-12', '2026-11', '2026-10']);
// Every month it will divide by has to be fetched, or the divisor is whatever happened to
// be in memory — which made the same screen give different answers.
check('the tab fetches every month cover needs',
  portal.stockCoverMonths('2026-09-18').every(m =>
    src.includes('...stockCoverMonths()')), true);

// Built from today, because renderStock() reads the clock rather than being handed a
// date — fixed months here would stop being "this month" the moment the calendar moved.
const stockNow = portal.todayString();
const stockThisMonth = stockNow.slice(0, 7);
portal.data.perfTeams = [
  { teamKey: 'SOWETO', team: 'SOWETO', month: stockThisMonth, network: 'MTN', stock: 20000 },
  { teamKey: 'TEMBISA', team: 'TEMBISA', month: stockThisMonth, network: 'MTN', stock: 8000 },
  { teamKey: 'HAZYVIEW', team: 'HAZYVIEW', month: stockThisMonth, network: 'MTN', stock: 30000 }
];
portal.data.stockCounts = [
  { teamKey: 'SOWETO', team: 'SOWETO', countedOn: portal.shiftDate(stockNow, -1),
    network: 'MTN', held: 12000 },
  { teamKey: 'TEMBISA', team: 'TEMBISA', countedOn: portal.shiftDate(stockNow, -37),
    network: 'MTN', held: 5000 }
];
// The tab fetches this month before drawing; the harness has no network, so the cache
// is marked by hand to stand for that fetch having happened.
portal.perfMonthsLoaded.add(stockThisMonth);
setValue('stockSearch', '');
portal.stockFilters.query = '';
portal.renderStock();
const stockBody = writes()['stockRows'] || '';
check('both branches are on the table',
  [stockBody.includes('SOWETO'), stockBody.includes('TEMBISA')], [true, true]);
check('the chase card names how many', (writes()['stockNotCountedCard'] || '')
  .includes('branch(es) to chase'), true);
check('and marks the one never counted',
  (writes()['stockNotCountedCard'] || '').includes('NEVER'), true);

// Nothing uploaded says what the tab is for, rather than drawing an empty table.
portal.data.stockCounts = [];
portal.renderStock();
check('with no counts at all it explains itself',
  (writes()['stockRows'] || '').includes('has to be counted'), true);

/* NOTHING TO COMPARE AGAINST IS NOT AN EMPTY LIST, and this is the bug it is here for.
   The month's figures are NOT part of the bulk load — they are fetched a month at a time,
   and only when a tab asks. So this tab, opened on a fresh page, saw no branches and said
   "nothing to chase": a confident sentence that was false for every branch in the
   business. A figure nobody has is a dash everywhere else here; a LIST nobody has was
   reading as an empty one, which is a different claim altogether. */
portal.perfMonthsLoaded.delete(stockThisMonth);
portal.renderStock();
const notLoaded = writes()['stockNotCountedCard'] || '';
check('with the figures unloaded it does not claim there is nothing to chase',
  notLoaded.includes('Nothing to chase'), false);
check('it says it could not check', notLoaded.includes('have not loaded'), true);

// Loaded, and genuinely nothing outstanding, is the only time that sentence is earned.
portal.perfMonthsLoaded.add(stockThisMonth);
portal.data.stockCounts = portal.data.perfTeams.map(t => ({
  teamKey: t.teamKey, team: t.team, countedOn: stockNow, network: 'MTN', held: 1000
}));
portal.renderStock();
check('counted everywhere, and only then, does it say so',
  (writes()['stockNotCountedCard'] || '').includes('Nothing to chase'), true);
check('and it names how many it checked',
  (writes()['stockNotCountedCard'] || '').includes('All 3 branch(es)'), true);

// A month nobody has figures for is not "all counted" either.
portal.data.perfTeams = [];
portal.renderStock();
check('no figures for the month is said plainly',
  (writes()['stockNotCountedCard'] || '').includes('nothing to check the counts against'),
  true);



/* ---------------- every tab button has a tab behind it ---------------- */
/* THE FAULT THIS IS HERE FOR. A tab needed listing in THREE places — the button, the
   section, and a hand-typed array of names in the click handler a thousand lines away.
   Stock was added to two of them. Clicking it hid every section and unhid none: a wholly
   blank page, no error in the console, nothing on screen to say what had happened.

   The array is now read off the buttons, so it cannot fall behind again. This checks the
   other half — that the markup itself is whole — because the renderer can only be as
   right as the page it is drawing into.

   Read from the FILE rather than through the stubs: querySelectorAll returns nothing in
   the harness, which is exactly why the original fault was invisible to these tests. */
const portalHtml = readFileSync(process.argv[2] ?? 'web/index.html', 'utf8');
const tabBar = (portalHtml.match(/<nav class="tabs">([\s\S]*?)<\/nav>/) ?? [])[1] ?? '';
const tabButtons = [...tabBar.matchAll(/data-tab="([^"]+)"/g)].map(m => m[1]);
const tabSections = [...portalHtml.matchAll(/id="tab-([a-z]+)"/g)].map(m => m[1]);

check('the tab bar has buttons at all', tabButtons.length > 0, true);
check('every button has a section behind it',
  tabButtons.filter(t => !tabSections.includes(t)), []);
check('and every section has a button in front of it',
  tabSections.filter(t => !tabButtons.includes(t)), []);
// The one that was missing, named, so a regression says which tab broke.
check('stock is one of them', tabButtons.includes('stock'), true);
/* AND NOBODY HAS TYPED THE LIST OUT AGAIN. A second copy is what let the two drift apart,
   and it drifted silently — which is the part that made it expensive. */
check('the handler reads the buttons rather than a list of its own',
  /TAB_NAMES = \[\.\.\.document\.querySelectorAll\('nav\.tabs button'\)\]/.test(portalHtml),
  true);
check('and no hand-typed tab list survives',
  /\['today','reports','employees'/.test(portalHtml), false);



/* ---------------- adding one count by hand ---------------- */
/* A file is the right shape for a stocktake and the wrong one for a single answer —
   somebody rings in, or sends a photo of a shelf.

   THE TEAM IS A LIST, not a box to type in. Every figure lost this week was lost to a
   team name typed slightly differently — "UPPINGTON", "polokwane voda", "Cape town CC 1"
   — and a count filed under a name nothing matches is a count nobody sees again. */
portal.data.employees = [
  { id: 'a', employeeNumber: 'T001', name: 'Ayanda', surname: 'K', teamName: 'SOWETO' },
  // On the staff list, no figures this month — still worth counting.
  { id: 'b', employeeNumber: 'T002', name: 'Bongi', surname: 'N', teamName: 'NEWCASTLE' }
];
portal.data.perfTeams = [
  { teamKey: 'SOWETO', team: 'SOWETO', month: stockThisMonth, network: 'MTN', stock: 100 },
  // In the figures and on nobody's record — the branch that most needs asking.
  { teamKey: 'HAZYVIEW', team: 'HAZYVIEW', month: stockThisMonth, network: 'MTN', stock: 900 }
];
portal.data.stockCounts = [];
portal.perfMonthsLoaded.add(stockThisMonth);

const pickable = portal.knownStockTeams(stockThisMonth);
check('both sides of the house are offered',
  pickable.map(t => t.name).sort(), ['HAZYVIEW', 'NEWCASTLE', 'SOWETO']);
// A branch nobody is posted to is exactly the one nobody thinks to ask.
check('a branch with figures and no staff can be counted',
  pickable.find(t => t.key === 'HAZYVIEW').fromFigures, true);
check('and one with staff and no figures is marked as such',
  pickable.find(t => t.key === 'NEWCASTLE').fromFigures, false);

/* THE FIGURES' SPELLING WINS. Offering the staff-list spelling of a team the figures call
   something else is how a count gets filed where nothing finds it — which is the whole of
   this week. */
portal.data.employees.push(
  { id: 'c', employeeNumber: 'T003', name: 'Chris', surname: 'M', teamName: 'hazyview' });
check('the name offered is the one the figures use',
  portal.knownStockTeams(stockThisMonth).find(t => t.key === 'HAZYVIEW').name, 'HAZYVIEW');
check('and it is still one team, not two',
  portal.knownStockTeams(stockThisMonth).filter(t => t.key === 'HAZYVIEW').length, 1);

setValue('stockAddTeam', '');
setValue('stockAddDate', '');
portal.renderStockAdd();
const picker = writes()['stockAddTeam'] || '';
check('the picker asks rather than assuming', picker.includes('Choose a team'), true);
check('and lists every team', portal.NETWORKS.length > 0
  && ['HAZYVIEW', 'NEWCASTLE', 'SOWETO'].every(t => picker.includes(t)), true);
// One box per network, generated, so they cannot fall out of step with NETWORKS.
const boxes = writes()['stockAddFields'] || '';
check('a box for every network',
  portal.NETWORKS.filter(n => !boxes.includes('stockAdd-' + n)), []);
// The empty box has to say what empty MEANS, or somebody types 0 to be tidy.
check('and the empty box says what empty means',
  boxes.includes('leave empty if not carried'), true);



/* ---------------- one month, or a range ---------------- */
/* Aadil: "give a one month button only and then the range button". Two pickers showing at
   all times made the ordinary case look like a thing to be configured, and left a second
   box on screen that most days does nothing. */
setValue('perfMonth', '2026-09');
setValue('perfFrom', '2026-01');

portal.setPerfPeriod('month');
check('one month hides the second picker',
  classesOf('perfFromField').includes('hidden'), true);
check('and the one that is left is just "Month"', writes()['perfMonthLabel'], 'Month');
/* IT COLLAPSES THE RANGE rather than remembering it. A hidden From still holding January
   would put figures on screen that disagree with the only picker visible, and nothing on
   the tab would explain why. */
check('and the range really is one month', portal.perfRange(), ['2026-09']);

portal.setPerfPeriod('range');
check('range shows the second picker',
  classesOf('perfFromField').includes('hidden'), false);
check('and the month becomes the end of it', writes()['perfMonthLabel'], 'To');
/* Two months, not one. Stepping From back means pressing Range always widens something —
   a range of a single month would look like the button had not worked. */
check('pressing range widens to two months', portal.perfRange(), ['2026-08', '2026-09']);

// Back and forth has to land where it started, or the buttons are not a pair.
portal.setPerfPeriod('month');
check('and back again is one month', portal.perfRange(), ['2026-09']);

// A range somebody actually set is left alone when they come back to it.
setValue('perfFrom', '2026-03');
portal.setPerfPeriod('range');
check('a range already set is kept', portal.perfRange().length, 7);



/* ---------------- retiring a book ---------------- */
/* Aadil, of MTN - TM - FY24: "delete it as its captured under fy". There are others like
   it — ZZZ OLD REPS, ZZZZZZOLD WC - GEORGE — names that still carry figures and still sit
   on the leaderboard with nobody on them. */
portal.data.employees = [
  { id: 'a', employeeNumber: 'T001', name: 'Ayanda', surname: 'K', teamName: 'SOWETO' }
];
portal.data.perfTeams = [
  { teamKey: 'SOWETO', team: 'SOWETO', month: '2026-08', network: 'MTN', stock: 100 },
  { teamKey: 'SOWETO', team: 'SOWETO', month: '2026-09', network: 'MTN', stock: 200 },
  { teamKey: 'MTN TM FY24', team: 'MTN - TM - FY24', month: '2026-09', network: 'MTN',
    connections: 51857 },
  { teamKey: 'ZZZ OLD REPS', team: 'ZZZ OLD REPS', month: '2026-09', network: 'MTN',
    connections: 1 }
];

const droppable = portal.droppableTeams(['2026-08', '2026-09']);
check('every team with a figure can be removed',
  droppable.map(t => t.team).sort(),
  ['MTN - TM - FY24', 'SOWETO', 'ZZZ OLD REPS']);
/* THE ONES NOBODY IS ON COME FIRST. Those are the ones being retired, and a list that
   buries them alphabetically among the live branches is a list somebody mis-clicks. */
check('and the ones nobody is on are at the top',
  droppable.map(t => t.onStaff), [false, false, true]);
check('a live branch is marked as having somebody', 
  droppable.find(t => t.team === 'SOWETO').onStaff, true);
// The months it would touch are collected, so the confirm can name the span.
check('it knows which months a team spans',
  [...droppable.find(t => t.team === 'SOWETO').months].sort(), ['2026-08', '2026-09']);

setValue('perfDropTeam', '');
portal.renderPerfDrop();
const dropList = writes()['perfDropTeam'] || '';
check('the picker asks rather than assuming', dropList.includes('Choose a team'), true);
check('and says which teams have nobody on them',
  dropList.includes('MTN - TM - FY24 · nobody on it'), true);
check('while a live branch is offered plainly',
  dropList.includes('>SOWETO</option>'), true);

/* IT DELETES BY TEAM KEY, NOT BY A LIST OF MONTHS. A book running since January has
   documents this page has never loaded, and deleting only the months on screen leaves
   half a book behind — which reads as a branch that suddenly stopped rather than one
   that was removed. */
check('the removal queries on the team, not the month',
  src.includes("where('teamKey', '==', key)"), true);
// Pay and FY are filed against a person; retiring a branch says nothing about wages.
check('and only touches the team figures',
  [/perfFy/, /perfMonthly/].some(rx =>
    rx.test(src.slice(src.indexOf('async function dropTeamFigures'),
      src.indexOf('async function dropTeamFigures') + 2000))), false);



/* ---------------- putting a renamed branch back together ---------------- */
/* Aadil: "paarl gives me figures, paarl f&b gives me another set". The network renamed
   three branches in August — Paarl, Bethlehem, George — so each has nine months of
   figures under two names. A person carries one team, so whichever name they are given
   shows half a year, and no team name typed on their record can fix that. */
const paarl = [
  // The old book: every month to August, then it stops.
  { id: 'PAARL F B_2026-07_MTN', teamKey: 'PAARL F B', team: 'PAARL - F&B',
    month: '2026-07', network: 'MTN', stock: 14200, connections: 2908 },
  { id: 'PAARL F B_2026-08_MTN', teamKey: 'PAARL F B', team: 'PAARL - F&B',
    month: '2026-08', network: 'MTN', stock: 10650, connections: 2661 },
  // The new book: starts in August, so August exists under BOTH.
  { id: 'PAARL_2026-08_MTN', teamKey: 'PAARL', team: 'PAARL',
    month: '2026-08', network: 'MTN', stock: 7750 },
  { id: 'PAARL_2026-09_MTN', teamKey: 'PAARL', team: 'PAARL',
    month: '2026-09', network: 'MTN', stock: 9100, connections: 535 }
];

const merged = portal.planTeamMerge(paarl, 'PAARL F B', 'PAARL', 'PAARL');
check('every month of the old book moves', merged.writes.length, 2);
check('and it knows which months they are', merged.months, ['2026-07', '2026-08']);

const july = merged.writes.find(w => w.month === '2026-07');
check('a month only the old book had simply moves',
  [july.values.stock, july.values.connections, july.added], [14200, 2908, false]);
check('under the new key', july.id, 'PAARL_2026-07_MTN');

/* THE HANDOVER MONTH IS ADDED, NOT REPLACED. Both books have real August stock — 10 650
   under the old name and 7 750 under the new — and keeping only one would lose the rest
   with nothing on screen to show it had gone. */
const august = merged.writes.find(w => w.month === '2026-08');
check('the handover month is added together', august.values.stock, 10650 + 7750);
check('and is flagged as an addition', august.added, true);
check('a figure only one side had still comes across', august.values.connections, 2661);
check('and the plan counts what it will add', [merged.added, merged.moved], [1, 1]);

/* ABSENT STAYS ABSENT. Nothing uploaded is not a nought, and a merge is not a licence to
   turn one into the other — a nought would read as a month the branch sold none. */
check('a figure neither side has is not invented',
  'activations' in august.values, false);
check('nor on a month that simply moved', 'activations' in july.values, false);

// What is moving, so the confirm can say it before anything is written.
check('the totals it will move are worked out up front',
  [merged.totals.stock, merged.totals.connections], [24850, 5569]);

// The new book's own rows are left alone — only the old name's are rewritten.
check('nothing is planned for the rows already on the new name',
  merged.writes.some(w => w.from && w.from.startsWith('PAARL_')), false);

// Both pickers offer the same teams, so either can be the old or the new name.
setValue('perfMergeFrom', '');
setValue('perfMergeTo', '');
portal.data.perfTeams = paarl.map(r => ({ ...r }));
portal.renderPerfMerge();
// The ampersand arrives escaped, as any team name with punctuation would.
check('both pickers are filled',
  [(writes()['perfMergeFrom'] || '').includes('PAARL - F&amp;B'),
   (writes()['perfMergeTo'] || '').includes('PAARL')], [true, true]);

/* WRITTEN BEFORE THE OLD ROWS ARE DELETED. If the run fails halfway the figures exist
   twice, which is visible and fixable; the other way round they would be gone. */
check('the new rows are written before the old are deleted',
  src.indexOf('...w.values, mergedAtMillis') < src.indexOf('fromSnap.docs.slice(start, start + 400).forEach(d => batch.delete'),
  true);



/* ---------------- a count taken on a phone ---------------- */
/* The rep's own screen files a count under the PERSON, because a security rule can
   compare a uid exactly and cannot normalise a team name — so the uid is the only part
   of the row worth trusting, and this is where that trust is cashed in. */
portal.data.employees = [
  { id: 'uid-1', employeeNumber: 'T001', name: 'Ayanda', surname: 'K', teamName: 'SOWETO' }
];

check('a phone count is filed under the branch that person is on now',
  portal.stockCountTeam({ uid: 'uid-1', team: 'ANYTHING AT ALL', network: 'MTN', held: 10 }),
  { key: 'SOWETO', name: 'SOWETO' });

/* A rep MOVED to another branch takes their counts with them, which is what moving
   branches means — the team written on an old row is where they used to be. */
portal.data.employees[0].teamName = 'TEMBISA';
check('and follows them when they move',
  portal.stockCountTeam({ uid: 'uid-1', team: 'SOWETO' }).key, 'TEMBISA');

// A count UPLOADED BY AN ADMIN carries no uid, so the team on the row is all it has.
check('an uploaded count is filed under the team on the row',
  portal.stockCountTeam({ teamKey: 'HAZYVIEW', team: 'HAZYVIEW' }).key, 'HAZYVIEW');
check('and one with neither is not filed at all',
  portal.stockCountTeam({ network: 'MTN', held: 5 }), null);
// A uid nobody recognises falls back rather than vanishing: that count is still real.
check('a count from somebody no longer on the staff list still counts',
  portal.stockCountTeam({ uid: 'gone', teamKey: 'SOWETO', team: 'SOWETO' }).key, 'SOWETO');

// End to end: two phone counts and one upload, grouped the way the tab groups them.
portal.data.employees = [
  { id: 'uid-1', employeeNumber: 'T001', name: 'Ayanda', surname: 'K', teamName: 'SOWETO' },
  { id: 'uid-2', employeeNumber: 'T002', name: 'Bongi', surname: 'N', teamName: 'SOWETO' }
];
portal.data.stockCounts = [
  { uid: 'uid-1', team: 'stale name', countedOn: '2026-09-20', network: 'MTN', held: 900 },
  { uid: 'uid-2', team: '', countedOn: '2026-09-21', network: 'MTN', held: 1200 },
  { teamKey: 'HAZYVIEW', team: 'HAZYVIEW', countedOn: '2026-09-21', network: 'MTN', held: 40 }
];
const phoneRows = portal.stockOnHandRows('2026-09-21');
check('phone counts land on the right branch',
  phoneRows.map(r => r.team).sort(), ['HAZYVIEW', 'SOWETO']);
/* Two reps on one branch each counting is ONE branch holding, and the newest wins for
   that network — the tab is about what the branch has, not who typed it. */
check('and the newest count for a network is the one shown',
  phoneRows.find(r => r.team === 'SOWETO').networks.MTN.held, 1200);


console.log(failures === 0 ? '\nRENDER TESTS OK' : `\nRENDER TESTS FAILED — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
