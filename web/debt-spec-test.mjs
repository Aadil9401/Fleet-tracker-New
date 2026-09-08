/**
 * Runs the ADMIN PORTAL's debt rules against the shared specification.
 *
 * The same file is run against the phone app by DebtSpecTest. Two implementations, one
 * specification — the sixth rule held that way here, after the service schedule, the
 * parking curfew, the plate format, the performance figures and the birthdays.
 *
 * It was the last rule implemented twice with nothing tying the two together, and writing
 * the file found them already disagreeing about the order invoices are listed in: the
 * phone lifted unsettled ones to the top, the portal sorted purely by date and buried
 * what was owed among what was paid.
 *
 *   node web/debt-spec-test.mjs web/index.html debt-cases.csv
 */
import { readFileSync } from 'fs';
import { loadPortal } from './portal-harness.mjs';

const portalPath = process.argv[2] ?? 'web/index.html';
const specPath = process.argv[3] ?? 'debt-cases.csv';

const portal = await loadPortal(portalPath, [
  'data', 'debtInvoices', 'productKey', 'daysSince', 'daysLabel'
]);

let failures = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`
    + (ok ? '' : `  — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}

const COLUMNS = ['written', 'key', 'lines', 'payments', 'invoice_date', 'today',
  'billed', 'paid', 'outstanding', 'settled', 'days'];

const lines = readFileSync(specPath, 'utf8')
  .split(/\r?\n/)
  .map(l => l.replace(/^﻿/, ''))
  .filter(l => l.trim() !== '' && !l.trim().startsWith('#'));

const header = lines[0].split(',').map(c => c.trim());
if (JSON.stringify(header) !== JSON.stringify(COLUMNS)) {
  console.error(`unexpected columns in ${specPath}: ${JSON.stringify(header)}`);
  process.exit(1);
}

/**
 * Fields are NOT trimmed. One case is an invoice number written "INV - 1042", and the
 * whole point of it is the spacing.
 */
const cases = lines.slice(1).map(line => {
  const f = line.split(',');
  const amounts = (s) => s.trim() === '' ? []
    : s.split('|').map(x => Number(x.trim()));
  return {
    written: f[0],
    key: f[1],
    lines: amounts(f[2]),
    payments: amounts(f[3]),
    invoiceDate: f[4].trim(),
    today: f[5].trim(),
    billed: Number(f[6]),
    paid: Number(f[7]),
    outstanding: Number(f[8]),
    settled: f[9].trim() === 'yes',
    days: f[10].trim() === 'none' ? null : Number(f[10])
  };
});

if (cases.length === 0) {
  console.error('No cases read — check the spec file path.');
  process.exit(1);
}

/*
 * daysSince() reads the clock for "today", which a specification cannot. The rule is
 * pinned by feeding it dates a known distance apart and asserting the distance, so the
 * cases stay true whatever day this runs on.
 */
const shiftDays = (date, by) => {
  const [y, m, d] = date.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + by * 86400000;
  return new Date(t).toISOString().slice(0, 10);
};

cases.forEach(c => {
  const where = `${c.written.trim() || '(blank)'} on ${c.today}`;

  // THE KEY, on its own.
  check(`${where}: key "${c.key}"`, portal.productKey(c.written), c.key);

  /*
   * The invoice, through the portal's real debtInvoices(). Built as the upload would
   * have written it: one document per product line, payments in their own collection,
   * both keyed on the normalised number.
   */
  portal.data.employees = [];
  portal.data.debtLines = c.lines.map((amount, i) => ({
    id: `l${i}`, numberKey: 'T042', employeeNumber: 'T042',
    invoiceNumber: c.written, invoiceDate: c.invoiceDate,
    product: `p${i}`, quantity: 1, amountRands: amount
  }));
  portal.data.debtPayments = c.payments.map((amount, i) => ({
    id: `p${i}`, numberKey: 'T042', invoiceNumber: c.written, amountRands: amount
  }));

  const invoices = portal.debtInvoices();
  // Every line of one invoice is ONE invoice, however the number was written.
  const expected = c.lines.length === 0 ? 0 : 1;
  check(`${where}: ${expected} invoice(s)`, invoices.length, expected);
  if (expected === 0) return;

  const invoice = invoices[0];
  check(`${where}: billed ${c.billed.toFixed(2)}`,
    Number(invoice.billed.toFixed(2)), c.billed);
  check(`${where}: paid ${c.paid.toFixed(2)}`,
    Number(invoice.paid.toFixed(2)), c.paid);
  check(`${where}: outstanding ${c.outstanding.toFixed(2)}`,
    invoice.outstanding, c.outstanding);
  check(`${where}: ${c.settled ? 'settled' : 'still owing'}`, invoice.settled, c.settled);

  // The age, against the clock the portal actually reads.
  if (c.days === null) {
    check(`${where}: no age`,
      c.settled ? invoice.daysOutstanding : portal.daysSince(c.invoiceDate), null);
  } else {
    const issued = shiftDays(portal_today(), -c.days);
    check(`${where}: ${c.days} day(s) old`, portal.daysSince(issued), c.days);
  }
});

/** Today, as the portal's own daysSince measures from. */
function portal_today() {
  // Found by asking daysSince about a date it must call nought days ago.
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/* ---------------- the order they are listed in ---------------- */
/* NOT IN THE TABLE, because it is about a list rather than an invoice. The rule, from the
   specification: unsettled first, then oldest, then by number.

   This is the one the two sides already disagreed about. The portal sorted purely by
   date, so on "everything, paid included" an invoice still owing from March sat below
   settled ones from April — and somebody opening that screen wants to know what they owe.
*/
portal.data.employees = [];
portal.data.debtLines = [
  { id: 'a', numberKey: 'T042', employeeNumber: 'T042', invoiceNumber: 'INV-1',
    invoiceDate: '2026-04-01', product: 'x', quantity: 1, amountRands: 100 },
  { id: 'b', numberKey: 'T042', employeeNumber: 'T042', invoiceNumber: 'INV-2',
    invoiceDate: '2026-03-01', product: 'x', quantity: 1, amountRands: 100 },
  { id: 'c', numberKey: 'T042', employeeNumber: 'T042', invoiceNumber: 'INV-3',
    invoiceDate: '2026-05-01', product: 'x', quantity: 1, amountRands: 100 }
];
// INV-2 is the OLDEST and is settled, so it must drop below the two still owing.
portal.data.debtPayments = [
  { id: 'q', numberKey: 'T042', invoiceNumber: 'INV-2', amountRands: 100 }
];
check('unsettled come first, then oldest, then by number',
  portal.debtInvoices().map(i => i.invoiceNumber), ['INV-1', 'INV-3', 'INV-2']);

/* ---------------- how an age is written out ---------------- */
check('one day is singular', portal.daysLabel(1), '1 day');
check('and everything else is not',
  [0, 2, 178].map(portal.daysLabel), ['0 days', '2 days', '178 days']);
check('and no age at all is a dash', portal.daysLabel(null), '—');

console.log(failures === 0
  ? `\nPORTAL MATCHES THE DEBT SPEC — ${cases.length} cases`
  : `\nPORTAL DOES NOT MATCH THE DEBT SPEC — ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
