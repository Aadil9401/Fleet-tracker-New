/*
 * UPLOADS A FIGURES FILE WITHOUT ANYBODY PRESSING ANYTHING.
 *
 *   node web/auto-upload.mjs <folder>            look, change nothing
 *   node web/auto-upload.mjs <folder> --write    actually save
 *
 * Aadil: "HOW DO I GET CONNECTIONS TO AUTOMATICALLY UPLOAD" — the file is emailed to
 * him. The mail is Microsoft 365, so a rule there drops the attachment into a OneDrive
 * folder and this walks that folder: identify each file, parse it, write it, move it
 * out of the way. Task Scheduler runs it; nobody opens the portal.
 *
 * IT USES THE PORTAL'S OWN FUNCTIONS, loaded out of index.html through
 * portal-harness.mjs — detectUploadKind to say what a file is, parsePerformanceLines to
 * read it. A second implementation would drift, and the drift would be silent: these
 * files are all the same shape and the parser takes the figure BY POSITION, so a stock
 * file read as connections saves perfectly happily and replaces a month of the wrong
 * thing. That already happened once, to September.
 *
 * WHAT IT WILL NOT DO:
 *   - guess. A file it cannot identify, or one whose heading could be two different
 *     uploads, is moved to needs-a-look and left alone.
 *   - delete anything, ever. Every write is a merge of the figures in the file.
 *   - run silently when it is broken. A failed run leaves the file in the inbox, so a
 *     folder that stops emptying is the symptom.
 *
 * This writes to production outside the security rules, which is why --write is not the
 * default and why every document it touches is named in the log.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, renameSync, appendFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { loadPortal } from './portal-harness.mjs';

const FOLDER = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!FOLDER) {
  console.error('usage: node web/auto-upload.mjs <folder> [--write]');
  process.exit(2);
}

const INBOX = FOLDER;
const DONE = join(FOLDER, 'done');
const STUCK = join(FOLDER, 'needs-a-look');
const LOG = join(FOLDER, 'upload-log.txt');
[DONE, STUCK].forEach(d => mkdirSync(d, { recursive: true }));

const stamp = () => new Date(Date.now() + 2 * 60 * 60 * 1000)
  .toISOString().replace('T', ' ').slice(0, 19);
function say(line) {
  console.log(line);
  try { appendFileSync(LOG, `${stamp()}  ${line}\n`); } catch { /* console is enough */ }
}

/* ---------------- the portal's own brain ---------------- */

// fileURLToPath, not .pathname: this folder has a space in its name, and .pathname
// leaves it as %20 — which fs then goes looking for literally.
const INDEX = fileURLToPath(new URL('./index.html', import.meta.url));

/*
 * THE HARNESS STUBS THE BROWSER, AND fetch IS PART OF THE BROWSER.
 *
 * Loading the portal replaces global URL with a stub good enough for the page, and
 * Node's fetch builds a Request through the real URL constructor — so the first call to
 * Firestore after this line dies with "URL is not a constructor", a long way from the
 * cause. Held and put back.
 */
const RealURL = globalThis.URL;
const portal = await loadPortal(INDEX,
  ['detectUploadKind', 'parsePerformanceLines', 'PERF_UPLOADS', 'perfOnFy',
    'perfFigures', 'teamKey', 'numberKey']);
globalThis.URL = RealURL;

/* ---------------- signing in as the CLI ---------------- */

const PROJECT = 'fleet-tracker-9c05d';
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
// Two places — firebase-tools moved its store and leaves an empty file in the old one.
const cfgPaths = [
  join(process.env.USERPROFILE || process.env.HOME || '', '.config', 'configstore', 'firebase-tools.json'),
  join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json')
];
let refresh;
for (const p of cfgPaths) {
  try {
    const t = JSON.parse(readFileSync(p, 'utf8')).tokens?.refresh_token;
    if (t) { refresh = t; break; }
  } catch { /* next */ }
}
if (!refresh) {
  say('STOPPED: no Firebase login on this machine. Run: npx firebase-tools login');
  process.exit(1);
}
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: refresh, grant_type: 'refresh_token'
  })
});
if (!tokenRes.ok) {
  say(`STOPPED: the Firebase login was refused (${tokenRes.status}). Run: npx firebase-tools login`);
  process.exit(1);
}
const access = (await tokenRes.json()).access_token;
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
const API = `https://firestore.googleapis.com/v1/${DOCS}`;
const H = { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' };

/* ---------------- who is on the books ---------------- */

/**
 * The staff list, for the same two jobs the portal uses it for: resolving an employee
 * number to the uid that lets that person read their own pay, and saying whether a team
 * name on a figures file matches anybody at all.
 */
async function loadPeople() {
  const r = await fetch(`${API}:runQuery`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: { fieldFilter: { field: { fieldPath: 'role' },
        op: 'EQUAL', value: { stringValue: 'employee' } } }
    } })
  });
  if (!r.ok) throw new Error(`could not read the staff list: ${r.status}`);
  const byNumber = {};
  const teams = new Set();
  (await r.json()).filter(x => x.document).forEach(x => {
    const f = x.document.fields || {};
    const get = (k) => f[k]?.stringValue ?? '';
    const key = portal.numberKey(get('employeeNumber'));
    if (key) {
      byNumber[key] = {
        id: x.document.name.split('/').pop(),
        name: `${get('name')} ${get('surname')}`.trim()
      };
    }
    const t = portal.teamKey(get('teamName'));
    if (t) teams.add(t);
  });
  return { byNumber, teams };
}

/* ---------------- turning a parsed row into a Firestore write ---------------- */

function fieldsFor(obj, moneyByField) {
  const out = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    if (typeof v === 'number') {
      out[k] = moneyByField.has(k) ? { doubleValue: v } : { integerValue: String(Math.round(v)) };
    } else {
      out[k] = { stringValue: String(v) };
    }
  });
  return out;
}

/**
 * The same documents savePerformance writes, in the same collections, with the same ids.
 *
 * Merged rather than replaced — an `update` write carrying an updateMask patches those
 * fields and leaves the rest. Loading connections must not wipe the stock already stored
 * against that team and month, which is exactly what a plain set would do.
 */
function writesFor(kind, rows, people) {
  const onFy = portal.perfOnFy(kind);
  const money = new Set(portal.perfFigures(kind)
    .filter(f => f.kind === 'money').map(f => f.field));
  const out = [];
  let matched = 0;

  for (const r of rows) {
    let collection, id, body;
    if (r.keyedOn === 'team') {
      if (people.teams.has(r.key)) matched++;
      collection = 'perfTeams';
      id = `${r.key}_${r.month}_${r.network}`;
      body = { team: r.keyAsTyped, teamKey: r.key, month: r.month, network: r.network,
        ...r.values, uploadedAtMillis: Date.now() };
    } else {
      const person = people.byNumber[r.key];
      if (person) matched++;
      collection = onFy ? 'perfFy' : 'perfMonthly';
      id = onFy ? `${r.key}_${r.month}_${r.network}` : `${r.key}_${r.month}`;
      body = {
        employeeNumber: r.keyAsTyped, numberKey: r.key,
        uid: person ? person.id : '', employeeName: person ? person.name : '',
        month: r.month, ...(onFy ? { network: r.network } : {}),
        ...r.values, uploadedAtMillis: Date.now()
      };
    }
    const fields = fieldsFor(body, money);
    out.push({
      update: { name: `${DOCS}/${collection}/${id}`, fields },
      updateMask: { fieldPaths: Object.keys(fields) }
    });
  }
  return { writes: out, matched };
}

async function commit(writes) {
  for (let start = 0; start < writes.length; start += 400) {
    const r = await fetch(`${API}:commit`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ writes: writes.slice(start, start + 400) })
    });
    if (!r.ok) throw new Error(`write refused (${r.status}): ${(await r.text()).slice(0, 300)}`);
  }
}

/* ---------------- the run ---------------- */

/*
 * ITS OWN FILES ARE NOT UPLOADS.
 *
 * The log and the last-run marker live in this folder, and a plain *.txt sweep picked
 * them both up — in a writing run it would have moved its own log into needs-a-look,
 * then started a fresh one, so the history would vanish every night and nothing would
 * say why.
 */
const MINE = new Set(['upload-log.txt', 'last-run.txt']);
const files = readdirSync(INBOX, { withFileTypes: true })
  .filter(d => d.isFile()
    && /\.(csv|txt)$/i.test(d.name)
    && !MINE.has(d.name.toLowerCase()))
  .map(d => d.name)
  .sort();

if (files.length === 0) {
  /*
   * NOT process.exit(0) — which is how this ends on most nights.
   *
   * Loading the portal leaves a handle open, and exiting on top of it made Windows
   * print "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" and return 127.
   * Task Scheduler reads 127 as a failed job, so the one outcome that means everything
   * is fine would have been the one that looked broken every single night.
   */
  say(`nothing to do — no files in ${INBOX}`);
  process.exitCode = 0;
}

let saved = 0, moved = 0;
if (files.length > 0) {
  /*
   * NO STAFF LIST, NO WRITING.
   *
   * A pay or FY row carries the person's uid, and that uid is the only thing that lets
   * them read their own figures on their phone — a security rule cannot normalise an
   * employee number to compare it. Writing those rows with an empty uid would save
   * perfectly happily and leave a month of pay nobody can see, which is the worst kind of
   * failure this has: silent, and only noticed by the person not being paid attention to.
   *
   * Looking is different: the detection and the parse are worth seeing even when the read
   * failed, so a look-only run carries on and says the counts are not to be trusted.
   */
  let people;
  try {
    people = await loadPeople();
    say(`${files.length} file(s); ${Object.keys(people.byNumber).length} staff, `
      + `${people.teams.size} team(s) on the books${WRITE ? '' : '   [LOOK ONLY]'}`);
  } catch (err) {
    if (WRITE) { say(`STOPPED: ${err.message}. Nothing was written.`); process.exit(1); }
    people = { byNumber: {}, teams: new Set() };
    say(`${files.length} file(s)   [LOOK ONLY]`);
    say(`the staff list could not be read (${err.message}) — `
      + 'the "matching nobody" counts below mean nothing this run');
  }

  let saved = 0, moved = 0;
  for (const name of files) {
    const path = join(INBOX, name);
    let text;
    try { text = readFileSync(path, 'utf8'); }
    catch (err) { say(`${name}: could not be read — ${err.message}`); continue; }

    const found = portal.detectUploadKind(text);
    if (!found.kind) {
      say(`${name}: NOT SAVED — ${found.why}`);
      if (WRITE) { renameSync(path, join(STUCK, name)); moved++; }
      continue;
    }

    const label = portal.PERF_UPLOADS[found.kind].label;
    const { rows, errors } = portal.parsePerformanceLines(text, found.kind);
    if (rows.length === 0) {
      say(`${name}: NOT SAVED — looks like ${label}, but no line could be read `
        + `(${errors.length} bad line(s): ${errors.slice(0, 2).map(e => e.why).join('; ')})`);
      if (WRITE) { renameSync(path, join(STUCK, name)); moved++; }
      continue;
    }

    const { writes, matched } = writesFor(found.kind, rows, people);
    const months = [...new Set(rows.map(r => r.month))].sort().join(', ');
    const unmatched = rows.length - matched;
    say(`${name}: ${label} — ${rows.length} row(s) for ${months}`
      + (errors.length ? `, ${errors.length} line(s) skipped` : '')
      + (unmatched ? `, ${unmatched} matching nobody on the books` : ''));

    if (!WRITE) {
      // The first document, in full. A dry run can prove the parse; without this it
      // cannot prove the thing that actually matters, which is where the figures land.
      const first = writes[0];
      if (first) {
        say(`    would write ${first.update.name.split('/documents/')[1]}`);
        say(`    fields: ${Object.entries(first.update.fields)
          .map(([k, v]) => `${k}=${Object.values(v)[0]}`).join('  ')}`);
      }
      continue;
    }
    try {
      await commit(writes);
      renameSync(path, join(DONE, `${new Date().toISOString().slice(0, 10)}-${name}`));
      saved++;
      say(`${name}: saved.`);
    } catch (err) {
      // LEFT IN THE INBOX ON PURPOSE. A folder that stops emptying is the symptom
      // somebody notices; a file quietly moved to one side is not.
      say(`${name}: WRITE FAILED, left in the inbox — ${err.message}`);
    }
  }

}

const summary = WRITE
  ? `${saved} file(s) saved, ${moved} moved to needs-a-look`
  : `${files.length} file(s) looked at, nothing written (pass --write)`;
say(summary);
try {
  writeFileSync(join(FOLDER, 'LAST-RUN.txt'),
    `${stamp()} SAST\n${summary}\n\nFull history is in upload-log.txt\n`);
} catch { /* the log already has it */ }
