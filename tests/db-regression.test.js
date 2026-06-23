const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createTable(name, calls) {
  const query = {
    select(value) {
      calls.push([name, 'select', value]);
      return this;
    },
    eq(column, value) {
      calls.push([name, 'eq', column, value]);
      return this;
    },
    order(column, options) {
      calls.push([name, 'order', column, options]);
      return Promise.resolve({ data: [], error: null });
    },
    upsert(rows, options) {
      calls.push([name, 'upsert', rows, options]);
      return Promise.resolve({ data: rows, error: null });
    }
  };
  return query;
}

function loadNavDb() {
  const calls = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
      onAuthStateChange: () => {}
    },
    from: (name) => createTable(name, calls)
  };
  const context = {
    console,
    window: { location: { href: '', origin: 'https://nav.ehon.cn', pathname: '/' } },
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    supabase: {
      createClient: () => client
    }
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  vm.runInContext(source, context);
  return { NavDB: context.NavDB, calls };
}

async function testFetchAllUsesInitializedClientForSearchEngines() {
  const { NavDB, calls } = loadNavDb();

  NavDB.init();
  await NavDB.getSession();
  const data = await NavDB.fetchAll();

  assert.deepEqual(data, { categories: [], bookmarks: [], searchEngines: [] });
  assert.ok(calls.some((call) => call[0] === 'search_engines' && call[1] === 'select'));
}

async function testPushAllUpsertsSearchEnginesWithInitializedClient() {
  const { NavDB, calls } = loadNavDb();

  NavDB.init();
  await NavDB.getSession();
  await NavDB.pushAll([], [], [
    { id: 'se-1', name: 'Google', url: 'https://www.google.com/search?q=%s', updated_at: '2026-06-01T00:00:00.000Z' }
  ]);

  assert.ok(calls.some((call) => call[0] === 'search_engines' && call[1] === 'upsert'));
}

async function run() {
  await testFetchAllUsesInitializedClientForSearchEngines();
  await testPushAllUpsertsSearchEnginesWithInitializedClient();
  console.log('db regression tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
