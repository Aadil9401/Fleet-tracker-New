/**
 * Smoke test for the portal script.
 *
 * `node --check` only proves the syntax parses. It cannot catch a runtime fault like
 * calling a function before its declaration is initialised, which silently kills the
 * whole module and leaves the page inert. This actually EVALUATES the script against
 * stubbed browser and Firebase APIs, so that class of bug surfaces here instead of in
 * the user's browser.
 *
 *   node web/smoke-test.mjs web/index.html
 */
import { loadPortal } from './portal-harness.mjs';

const htmlPath = process.argv[2];

try {
  await loadPortal(htmlPath);
  console.log('SMOKE OK — module evaluated with no runtime errors');
} catch (err) {
  console.log('SMOKE FAILED — the page would be dead in the browser:');
  console.log('  ' + err.name + ': ' + err.message);
  process.exit(1);
}
