const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createLocalStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); }
  };
}

function loadNavSync(navDb) {
  const context = {
    console,
    localStorage: createLocalStorage(),
    DEFAULT_DATA: [],
    NavDB: navDb,
    crypto: { randomUUID() { return Math.random().toString(36).substr(2, 9); } }
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'sync.js'), 'utf8');
  vm.runInContext(source, context);
  return { NavSync: context.NavSync, localStorage: context.localStorage };
}

async function testDeduplicationOnMerge() {
  const localData = {
    categories: [
      { id: 'cat-local', name: '常用工具', sort_order: 0, updated_at: '2026-06-01T00:00:00.000Z' }
    ],
    bookmarks: [
      { id: 'bm-local', category_id: 'cat-local', name: 'GitHub', url: 'https://github.com', updated_at: '2026-06-01T00:00:00.000Z' }
    ]
  };

  const remoteData = {
    categories: [
      { id: 'cat-remote', name: '常用工具', sort_order: 0, updated_at: '2026-06-02T00:00:00.000Z' } // remote version is newer
    ],
    bookmarks: [
      { id: 'bm-remote', category_id: 'cat-remote', name: 'GitHub', url: 'https://github.com', updated_at: '2026-06-02T00:00:00.000Z' }
    ]
  };

  const navDb = {
    isLoggedIn: () => true,
    fetchAll: async () => remoteData,
    pushAll: async () => {},
    deleteBookmark: async () => {},
    deleteCategory: async () => {}
  };
  
  const { NavSync } = loadNavSync(navDb);
  NavSync.saveLocal(localData);

  const synced = await NavSync.syncOnLogin();

  assert.strictEqual(synced.categories.length, 1, 'Should deduplicate categories by name');
  assert.strictEqual(synced.categories[0].id, 'cat-remote', 'Should keep the newer category ID');
  
  assert.strictEqual(synced.bookmarks.length, 1, 'Should deduplicate bookmarks by URL and resolved category');
  assert.strictEqual(synced.bookmarks[0].id, 'bm-remote', 'Should keep the newer bookmark ID');
}

async function run() {
  await testDeduplicationOnMerge();
  console.log('dedupe tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
