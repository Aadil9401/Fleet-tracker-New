/**
 * Loads the portal's module for testing, against stubbed browser and Firebase APIs.
 *
 * index.html is one file with the whole admin portal inline, so there is nothing to
 * import in the normal way. This lifts the <script type="module"> body out, replaces
 * the CDN imports with local stubs so nothing touches the network, and evaluates it.
 *
 * Extracted so smoke-test.mjs and parser-test.mjs share one set of stubs — two copies
 * would drift, and a stub that quietly stops resembling the browser makes a passing
 * test worthless.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** Element ids the real page provides, so $() returns a stub rather than null. */
function browserStubs(html) {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  return `
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
}

const FIREBASE_STUBS = `
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

/**
 * Evaluates the portal script and returns its module namespace.
 *
 * `expose` names top-level bindings to re-export, so a test can call them directly.
 * Everything in the script shares one module scope, so any function or const in it
 * can be named here.
 *
 * Throws if the module fails to evaluate — which is the whole point: a fault like
 * calling a function before its declaration initialises kills the module silently and
 * leaves the real page inert, and `node --check` cannot see it.
 */
export async function loadPortal(htmlPath, expose = []) {
  const html = readFileSync(htmlPath, 'utf8');
  const script = html.split('<script type="module">')[1].split('</script>')[0];
  const withoutImports = script.replace(/^import[\s\S]*?from\s+'[^']*';\s*$/gm, '');
  const exports = expose.length ? `\nexport { ${expose.join(', ')} };\n` : '';

  const dir = mkdtempSync(join(tmpdir(), 'portal-'));
  const file = join(dir, 'run.mjs');
  writeFileSync(file, browserStubs(html) + FIREBASE_STUBS + withoutImports + exports);

  return import('file://' + file.replace(/\\/g, '/'));
}
