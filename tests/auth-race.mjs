import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function authHarness() {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function handleAuth(');
  const end = source.indexOf("window.addEventListener('rovocar-cloud'", start);
  let resolveSync;
  const pending = new Promise(resolve => { resolveSync = resolve; });
  const state = { cloudUser: null, decks: [], registry: {}, storageKey: 'guest', registryKey: 'guest-registry', dataVersion: 0 };
  const writes = [], renders = [];
  const context = vm.createContext({ state, pendingCsvMakerTransfer: null, STORAGE_KEY: 'guest', REGISTRY_KEY: 'guest-registry',
    loadFromStorage() { return false; }, ensureRegistryNumbers() {}, applyCsvMakerTransfer() {},
    RoVoCloud: { sync: () => state.cloudUser?.id === 'B' ? Promise.resolve({decks:[{id:'private-B'}],registry:{}}) : pending, flush: () => pending },
    handleSyncResult(result) { if (result) state.decks = result.decks; },
    save() { writes.push({ key: state.storageKey, decks: state.decks }); },
    async loadData() { state.decks = []; }, renderAccount() { renders.push(state.cloudUser?.id ?? null); }, showView() {}, toast() {},
  });
  // Keep the production auth-generation declaration alongside the actual handler.
  const declaration = source.match(/let authRevision\s*=\s*0;/)?.[0] ?? '';
  vm.runInContext(declaration + source.slice(start, end), context);
  return { state, writes, renders, resolveSync, auth: user => { context.nextUser = user; return vm.runInContext('handleAuth(nextUser)', context); } };
}

test('late signed-in sync cannot restore the account after sign-out or write into guest storage', async () => {
  const h = authHarness();
  const login = h.auth({ id: 'A' });
  await h.auth(null);
  h.resolveSync({ decks: [{ id: 'private-A' }], registry: {} });
  await login;
  assert.equal(h.state.cloudUser, null);
  assert.deepEqual(h.state.decks, []);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.renders, [null]);
});

test('a superseded login cannot apply its remote decks to another account', async () => {
  const h = authHarness();
  const first = h.auth({ id: 'A' });
  // B has its own immediate sync result; A is still waiting.
  const contextResult = h.auth({ id: 'B' });
  h.resolveSync({decks:[{id:'private-A'}],registry:{}});
  await Promise.all([first, contextResult]);
  assert.equal(h.state.cloudUser.id, 'B');
  assert.equal(h.state.decks[0].id, 'private-B');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].key, 'guest:B');
  assert.deepEqual(h.renders, ['B']);
});
