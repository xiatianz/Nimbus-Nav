const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

function loadNavSync(navDb) {
  const context = {
    console,
    localStorage: createLocalStorage(),
    DEFAULT_DATA: [],
    NavDB: navDb,
    crypto: {
      randomUUID() {
        return '00000000-0000-4000-8000-000000000000';
      }
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'sync.js'), 'utf8');
  vm.runInContext(source, context);
  return { NavSync: context.NavSync, localStorage: context.localStorage };
}

async function testDeletedBookmarkDoesNotResurrectOnSync() {
  const deleted = [];
  const remoteData = {
    categories: [{ id: 'cat-1', name: '工具', sort_order: 0, updated_at: '2026-06-01T00:00:00.000Z' }],
    bookmarks: [{
      id: 'bm-1',
      category_id: 'cat-1',
      name: 'GitHub',
      url: 'https://github.com',
      description: '',
      sort_order: 0,
      updated_at: '2026-06-01T00:00:00.000Z'
    }]
  };
  const navDb = {
    isLoggedIn: () => true,
    fetchAll: async () => remoteData,
    pushAll: async () => {},
    deleteBookmark: async (id) => {
      deleted.push(id);
    },
    deleteCategory: async () => {}
  };
  const { NavSync } = loadNavSync(navDb);

  NavSync.saveLocal(remoteData);
  NavSync.deleteBookmarkLocal('bm-1');

  const synced = await NavSync.syncOnLogin();

  assert.ok(deleted.includes('bm-1'));
  assert.strictEqual(synced.bookmarks.length, 0);
  assert.strictEqual(NavSync.loadLocal().bookmarks.length, 0);
}

function testSavingOnlySearchEnginesKeepsExistingBookmarks() {
  const { NavSync } = loadNavSync({
    isLoggedIn: () => false
  });
  const original = {
    categories: [{ id: 'cat-1', name: '工具', sort_order: 0 }],
    bookmarks: [{ id: 'bm-1', category_id: 'cat-1', name: 'GitHub', url: 'https://github.com' }],
    searchEngines: [{ id: 'se-1', name: 'Google', url: 'https://www.google.com/search?q=%s', sort_order: 0 }]
  };

  NavSync.saveLocal(original);
  NavSync.saveLocal({
    searchEngines: [{ id: 'se-2', name: 'Bing', url: 'https://www.bing.com/search?q=%s', sort_order: 0 }]
  });

  const saved = NavSync.loadLocal();
  assert.deepEqual(saved.categories, original.categories);
  assert.deepEqual(saved.bookmarks, original.bookmarks);
  assert.strictEqual(saved.searchEngines.length, 1);
  assert.strictEqual(saved.searchEngines[0].id, 'se-2');
}

async function testRequestSyncPushesCurrentLocalData() {
  let pushed = null;
  const { NavSync } = loadNavSync({
    isLoggedIn: () => true,
    pushAll: async (categories, bookmarks, searchEngines) => {
      pushed = { categories, bookmarks, searchEngines };
    }
  });
  const localData = {
    categories: [{ id: 'cat-1', name: '工具', sort_order: 0 }],
    bookmarks: [{ id: 'bm-1', category_id: 'cat-1', name: 'GitHub', url: 'https://github.com' }],
    searchEngines: [{ id: 'se-1', name: 'Google', url: 'https://www.google.com/search?q=%s', sort_order: 0 }]
  };

  NavSync.saveLocal(localData);
  await NavSync.requestSync();

  assert.deepEqual(pushed, localData);
}

async function testDefaultLocalDataIsKeptWhenRemoteIsEmpty() {
  let pushed = null;
  const { NavSync } = loadNavSync({
    isLoggedIn: () => true,
    fetchAll: async () => ({ categories: [], bookmarks: [], searchEngines: [] }),
    pushAll: async (categories, bookmarks, searchEngines) => {
      pushed = { categories, bookmarks, searchEngines };
    },
    deleteBookmark: async () => {},
    deleteCategory: async () => {}
  });
  const defaultLocalData = {
    categories: [{ id: 'def-cat-1', name: '常用工具', sort_order: 0, updated_at: null }],
    bookmarks: [{
      id: 'def-bm-1-1',
      category_id: 'def-cat-1',
      name: 'GitHub',
      url: 'https://github.com',
      sort_order: 0,
      updated_at: null
    }],
    searchEngines: [{ id: 'se-1', name: 'Google', url: 'https://www.google.com/search?q=', sort_order: 0 }]
  };

  NavSync.saveLocal(defaultLocalData);
  const synced = await NavSync.syncOnLogin();

  assert.strictEqual(synced.categories.length, 1);
  assert.strictEqual(synced.bookmarks.length, 1);
  assert.deepEqual(pushed, defaultLocalData);
}

async function run() {
  await testDeletedBookmarkDoesNotResurrectOnSync();
  testSavingOnlySearchEnginesKeepsExistingBookmarks();
  await testRequestSyncPushesCurrentLocalData();
  await testDefaultLocalDataIsKeptWhenRemoteIsEmpty();
  console.log('sync regression tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
