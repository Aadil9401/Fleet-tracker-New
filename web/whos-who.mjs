/*
 * WHY A FIGURE ON THE PORTAL IS NOT ON SOMEBODY'S PHONE.
 *
 * The portal matches a figure to a person by EMPLOYEE NUMBER. The phone cannot — a
 * security rule cannot normalise a number to compare it — so every uploaded row carries
 * the person's LOGIN ID, worked out at the moment of upload. A row uploaded before that
 * person had a record carries an empty id: the portal shows it, and their phone, which
 * can only ask for rows matching its own id, finds nothing.
 *
 * This prints both sides for one employee number so the mismatch is visible rather than
 * guessed at.
 *
 *   node web/whos-who.mjs T084
 *
 * READS ONLY. It writes nothing, and the access token never leaves this process — only
 * the ids and figures are printed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const PROJECT = 'fleet-tracker-9c05d';
const WANTED = (process.argv[2] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
if (!WANTED) { console.error('usage: node web/whos-who.mjs T084'); process.exit(1); }

// The firebase-tools installed-app credentials, which ship in the CLI itself. The
// private part is your own refresh token and it stays in this process.
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

/*
 * THE LOGIN IS IN ONE OF TWO PLACES, AND THE EMPTY ONE COMES FIRST.
 *
 * firebase-tools used to keep its login in %APPDATA%\configstore and now keeps it in
 * ~/.config/configstore. The old file is still on this machine — 21 bytes, no token —
 * so reading only the first path found reported "not logged in" while a perfectly good
 * login sat in the other, and this script could not be run at all.
 *
 * Every path is tried and the first one carrying a refresh token wins. A failure names
 * all of them, so the next person can see which were looked in.
 */
const cfgPaths = [
  join(process.env.USERPROFILE || process.env.HOME || '', '.config', 'configstore', 'firebase-tools.json'),
  join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json')
];
let refresh;
for (const p of cfgPaths) {
  try {
    const token = JSON.parse(readFileSync(p, 'utf8')).tokens?.refresh_token;
    if (token) { refresh = token; break; }
  } catch { /* try the next one — a missing file here is normal, not a fault */ }
}
if (!refresh) {
  console.error('No stored login found in:\n  ' + cfgPaths.join('\n  ')
    + '\nRun: npx firebase-tools login');
  process.exit(1);
}

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: refresh, grant_type: 'refresh_token'
  })
});
if (!res.ok) { console.error('Login refresh failed:', res.status); process.exit(1); }
const access = (await res.json()).access_token;

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const plain = (f) => {
  const out = {};
  Object.entries(f || {}).forEach(([k, v]) => {
    out[k] = v.stringValue ?? v.integerValue ?? v.doubleValue ?? v.booleanValue ?? '';
  });
  return out;
};

async function all(collectionId) {
  const r = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }] } })
  });
  if (!r.ok) { console.error(`${collectionId}: ${r.status}`); return []; }
  return (await r.json())
    .filter(x => x.document)
    .map(x => ({ id: x.document.name.split('/').pop(), ...plain(x.document.fields) }));
}

const key = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

console.log(`\n=== who holds ${WANTED} ===`);
const users = (await all('users')).filter(u => key(u.employeeNumber) === WANTED);
if (users.length === 0) console.log('  NOBODY — no record with that employee number.');
users.forEach(u => console.log(
  `  ${u.name} ${u.surname}   login id ${u.id}   role ${u.role}   active ${u.active}`
  + `   team "${u.teamName}"   email ${u.email}`));
const theirIds = new Set(users.map(u => u.id));

for (const c of ['perfMonthly', 'perfFy', 'debtLines', 'debtPayments']) {
  const rows = (await all(c)).filter(r => key(r.numberKey || r.employeeNumber) === WANTED);
  console.log(`\n=== ${c} — ${rows.length} row(s) for ${WANTED} ===`);
  rows.forEach(r => {
    const uid = r.uid || '';
    const verdict = uid === ''
      ? 'NO LOGIN ID — the portal shows this, their phone cannot'
      : (theirIds.has(uid) ? 'ok, their phone can read this'
        : `POINTS AT SOMEBODY ELSE (${uid})`);
    const figures = Object.entries(r)
      .filter(([k]) => /^(basicSalary|commission|fy|amount|quantity)/i.test(k))
      .map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`  ${r.month || ''} ${r.network || ''} ${figures}`);
    console.log(`     ${verdict}`);
  });
}
console.log('');
