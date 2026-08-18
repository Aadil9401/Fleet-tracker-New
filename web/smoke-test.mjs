/**
 * Smoke test for the portal script.
 *
 * `node --check` only proves the syntax parses. It cannot catch a runtime fault like
 * calling a function before its declaration is initialised, which silently kills the
 * whole module and leaves the page inert. This actually EVALUATES the script against
 * stubbed browser and Firebase APIs, so that class of bug surfaces here instead of in
 * the user's browser.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const htmlPath = process.argv[2];
const html = readFileSync(htmlPath, 'utf8');

const script = html
  .split('<script type="module">')[1]
  .split('</script>')[0];

// Element ids the real page provides, so $() returns a stub rather than null.
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);

const harness = `
const __ids = ${JSON.stringify(ids)};
const __stubEl = () => ({
  addEventListener() {}, querySelectorAll: () => [], classList: { toggle() {}, add() {}, remove() {} },
  set innerHTML(v) {}, get innerHTML() { return ''; },
  set textContent(v) {}, get textContent() { return ''; },
  set value(v) {}, get value() { return ''; },
  set disabled(v) {}, get disabled() { return false; },
  style: {}, files: [], focus() {}, click() {}, appendChild() {}, removeChild() {}
});
globalThis.document = {
  getElementById: (id) => __ids.includes(id) ? __stubEl() : null,
  querySelectorAll: () => [],
  createElement: () => __stubEl(),
  body: __stubEl()
};
globalThis.window = globalThis;
globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
globalThis.Blob = class {};
globalThis.confirm = () => false;
globalThis.alert = () => {};
`;

// Replace the CDN + local imports with local stubs so nothing hits the network.
const stubbed = script
  .replace(/^import[\s\S]*?from\s+'[^']*';\s*$/gm, '')
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']*';\s*$/gm, '');

const firebaseStubs = `
const firebaseConfig = { apiKey: 'test', authDomain: 'x', projectId: 'x' };
const initializeApp = () => ({});
const getAuth = () => ({ currentUser: null });
const getFirestore = () => ({});
const signInWithEmailAndPassword = async () => {};
const signOut = async () => {};
const onAuthStateChanged = () => {};
const collection = () => ({}), doc = () => ({}), getDoc = async () => ({ exists: () => false });
const getDocs = async () => ({ docs: [] }), query = () => ({}), where = () => ({});
const setDoc = async () => {}, updateDoc = async () => {}, deleteDoc = async () => {};
const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
const orderBy = () => ({}), limit = () => ({});
`;

const dir = mkdtempSync(join(tmpdir(), 'portal-smoke-'));
const file = join(dir, 'run.mjs');
writeFileSync(file, harness + firebaseStubs + stubbed);

try {
  await import('file://' + file.replace(/\\/g, '/'));
  console.log('SMOKE OK — module evaluated with no runtime errors');
} catch (err) {
  console.log('SMOKE FAILED — the page would be dead in the browser:');
  console.log('  ' + err.name + ': ' + err.message);
  process.exit(1);
}
