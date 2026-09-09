/**
 * Runs another check with the wall clock pinned to a given day.
 *
 *   node web/at-date.mjs 2028-02-29 web/render-test.mjs web/index.html
 *
 * WHY THIS EXISTS. A test that builds a fixture out of a date somebody typed passes on
 * the day it is written and goes red later for a rule that never changed — quietly, and
 * months after the change that should have caught it. Seven of them had collected in
 * this suite: one went red the morning after it was written, one was three weeks off
 * going red, and four had only ever been green because the current month happened to be
 * the September the figures were keyed to.
 *
 * None of that is visible from a run on one day, which is the whole problem: the suite
 * looks green. Running it as if it were another day is what tells a pinned fixture from
 * a real fault, so `checks.yml` does it on every push. A fixture built off today passes
 * at any date; one with a year typed into it does not.
 *
 * ONLY THE READINGS THAT ASK WHAT TODAY IS are moved — `new Date()` and `Date.now()`.
 * `new Date(2026, 8, 25)` and every other form is left exactly as it is, so a fixture
 * that names a date on purpose still means it, and so does a millisecond stamp on a log.
 */
import { spawnSync } from 'child_process';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const [date, ...command] = process.argv.slice(2);

if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || command.length === 0) {
  console.error('usage: node web/at-date.mjs <yyyy-mm-dd> <script> [args...]');
  process.exit(2);
}

/*
 * Local midday, not midnight. The suite reads the clock through todayString(), which is
 * local, so a pin at midnight UTC lands on the day before for anybody east of Greenwich
 * — including here — and the pinned day would not be the day asked for.
 */
const shim = `
const RealDate = Date;
const [y, m, d] = ${JSON.stringify(date)}.split('-').map(Number);
const fixed = new RealDate(y, m - 1, d, 12, 0, 0, 0).getTime();
class PinnedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(fixed);
    else super(...args);
  }
  static now() { return fixed; }
}
globalThis.Date = PinnedDate;
`;

// Written out rather than passed inline, the same way portal-harness.mjs evaluates the
// portal: --import takes a module, and a temp file is the plainest one to hand it.
const file = join(mkdtempSync(join(tmpdir(), 'at-date-')), 'clock.mjs');
writeFileSync(file, shim);

const run = spawnSync(process.execPath,
  ['--import', pathToFileURL(file).href, ...command], { stdio: 'inherit' });
process.exit(run.status ?? 1);
