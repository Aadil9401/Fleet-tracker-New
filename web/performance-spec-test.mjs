/**
 * Runs the ADMIN PORTAL's performance rules against the shared specifications.
 *
 * The same two tables are run against the phone app by PerformanceTest.kt. Two
 * implementations, one specification — the fourth rule in this project held that way,
 * after the service schedule, the parking curfew and the plate format.
 *
 *   node web/performance-spec-test.mjs web/index.html \
 *     performance-network-cases.csv performance-rank-cases.csv
 */
import { readFileSync } from 'fs';
import { loadPortal } from './portal-harness.mjs';

const portalPath = process.argv[2] ?? 'web/index.html';
const networkSpec = process.argv[3] ?? 'performance-network-cases.csv';
const rankSpec = process.argv[4] ?? 'performance-rank-cases.csv';

const portal = await loadPortal(portalPath, [
  'data', 'teamFiguresFor', 'leaderboardRows', 'teamKey', 'networkKey',
  'ratioPercent', 'percentLabel'
]);

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`
    + (ok ? '' : `  — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

/** Comment and blank lines dropped; the header checked so a renamed column is caught. */
function rowsOf(path, columns) {
  const lines = readFileSync(path, 'utf8').replace(/^﻿/, '')
    .split(/\r?\n/).map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
  const header = lines[0].split(',');
  if (JSON.stringify(header) !== JSON.stringify(columns)) {
    console.log(`FAIL  unexpected columns in ${path} — got ${JSON.stringify(header)}`);
    failures++;
  }
  return lines.slice(1).map(l => l.split(','));
}

/** "-" in the table means never uploaded, which is null and not zero. */
const figure = (cell) => cell === '-' ? null : Number(cell);

/* ---------------- how a team's month adds up across networks ---------------- */
const MONTH = '2026-09';
const networkCases = rowsOf(networkSpec,
  ['name', 'rows', 'network', 'stock', 'connections', 'activations']);

if (networkCases.length === 0) { console.log('FAIL  no network cases'); failures++; }

for (const c of networkCases) {
  const [name, encoded, network] = c;

  // A field left off the document is how "never uploaded" is really stored, so the
  // fixture leaves it off rather than writing null — otherwise the test would prove the
  // reader handles a shape the uploader never writes.
  portal.data.perfTeams = encoded.split('|').filter(Boolean).map(part => {
    const f = part.split(':');
    const row = {
      teamKey: 'SOWETO', team: 'Soweto', month: MONTH,
      network: f[0] === '-' ? '' : f[0]
    };
    if (f[1] !== '-') row.stock = Number(f[1]);
    if (f[2] !== '-') row.connections = Number(f[2]);
    if (f[3] !== '-') row.activations = Number(f[3]);
    return row;
  });

  const out = portal.teamFiguresFor(MONTH, network === '-' ? '' : network);
  const got = out['SOWETO'];

  if (c[3] === 'ABSENT') {
    check(`${name}: the team is absent`, got === undefined, true);
    continue;
  }
  if (got === undefined) {
    check(`${name}: has figures`, 'nothing at all', 'figures');
    continue;
  }
  check(name,
    [got.stock ?? null, got.connections ?? null, got.activations ?? null],
    [figure(c[3]), figure(c[4]), figure(c[5])]);
}

/* ---------------- how teams are placed ---------------- */
const rankCases = rowsOf(rankSpec, ['name', 'figures', 'expected']);
if (rankCases.length === 0) { console.log('FAIL  no ranking cases'); failures++; }

for (const c of rankCases) {
  const [name, encoded, wanted] = c;
  const figures = encoded.split('|').map(figure);

  // One team per figure, named so the board's tie-break by name cannot change a
  // position — only the order of equals, which the specification does not fix.
  const teams = figures.map((_, i) => `TEAM${String(i + 1).padStart(2, '0')}`);
  portal.data.employees = teams.map((team, i) => ({
    id: `r${i}`, name: 'X', surname: String(i), employeeNumber: `R${i}`,
    province: 'Gauteng', teamName: team
  }));
  portal.data.perfMonthly = [];
  portal.data.perfTeams = figures
    .map((value, i) => value === null ? null : ({
      teamKey: teams[i], team: teams[i], month: MONTH,
      network: 'MTN', connections: value
    }))
    .filter(Boolean);

  const board = portal.leaderboardRows(MONTH, 'connections', '');
  const byTeam = Object.fromEntries(board.rows.map(r => [r.team, r.position]));
  check(name,
    teams.map(t => byTeam[t] ?? null),
    wanted.split('|').map(v => v === '-' ? null : Number(v)));
}

/* ---------------- the two keys, which are identity rather than display ---------------- */
check('a team name keeps its single spaces',
  ['Soweto East', 'SOWETO  EAST', 'soweto-east'].map(portal.teamKey),
  ['SOWETO EAST', 'SOWETO EAST', 'SOWETO EAST']);
check('and a real space still separates two teams',
  portal.teamKey('SOWETO') === portal.teamKey('SOWETO EAST'), false);
check('only the four networks are networks',
  ['Cell C', 'cell-c', 'VOD', 'mtn', 'Telkom', 'Rain', 'VODAOCM', '600', ''].map(portal.networkKey),
  ['CELLC', 'CELLC', 'VODACOM', 'MTN', 'TELKOM', '', '', '', '']);

/* A percentage is unknown rather than zero when a figure is missing, and a comma
   decimal, because that is how it is written here and in the app. */
check('a missing figure gives no percentage',
  [portal.ratioPercent(60, null), portal.ratioPercent(null, 100), portal.ratioPercent(60, 0)],
  [null, null, null]);
check('shown as a dash', portal.percentLabel(portal.ratioPercent(60, null)), '—');
check('but a zero numerator against real stock is a real nought per cent',
  portal.percentLabel(portal.ratioPercent(0, 100)), '0,0%');
check('and a normal one reads with a comma decimal',
  [portal.percentLabel(portal.ratioPercent(300, 400)),
   portal.percentLabel(portal.ratioPercent(380, 600))],
  ['75,0%', '63,3%']);
check('not capped at a hundred', portal.percentLabel(portal.ratioPercent(120, 100)), '120,0%');

console.log(failures === 0
  ? `\nPERFORMANCE SPEC OK — ${networkCases.length} network case(s), ${rankCases.length} ranking case(s)`
  : `\nPERFORMANCE SPEC FAILED — ${failures} case(s)`);
process.exit(failures ? 1 : 0);
