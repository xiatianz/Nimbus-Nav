const assert = require('assert');
const NavBookmarks = require('../bookmark-utils');

function testInitialUsesNameFirst() {
  assert.strictEqual(NavBookmarks.getBookmarkInitial({
    name: 'Figma',
    url: 'https://figma.com'
  }), 'F');
}

function testFaviconUrlUsesFaviconIco() {
  const url = NavBookmarks.getFaviconUrl('https://example.com/docs');
  // favicon is loaded directly from the site's origin; no third-party service
  assert.strictEqual(url, 'https://example.com/favicon.ico');
}

function testRecentBookmarksSortByLastVisit() {
  const bookmarks = [
    { id: 'a', name: 'Alpha', url: 'https://a.com' },
    { id: 'b', name: 'Beta', url: 'https://b.com' },
    { id: 'c', name: 'Gamma', url: 'https://c.com' }
  ];
  const stats = {
    a: { count: 3, lastVisitedAt: 100 },
    b: { count: 1, lastVisitedAt: 300 },
    c: { count: 9, lastVisitedAt: 200 }
  };

  assert.deepStrictEqual(
    NavBookmarks.getTopVisitedBookmarks(bookmarks, stats, 2).map((bookmark) => bookmark.id),
    ['b', 'c']
  );
}

async function testFaviconLoaderLimitsConcurrency() {
  const started = [];
  const resolvers = [];
  const loader = NavBookmarks.createFaviconLoader({
    maxConcurrent: 2,
    timeoutMs: 100,
    schedule: (callback) => callback(),
    load: (task) => {
      started.push(task.url);
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    }
  });

  loader.enqueue({ url: 'https://favicon.im/a.com' });
  loader.enqueue({ url: 'https://favicon.im/b.com' });
  loader.enqueue({ url: 'https://favicon.im/c.com' });

  assert.deepStrictEqual(started, [
    'https://favicon.im/a.com',
    'https://favicon.im/b.com'
  ]);

  resolvers[0](true);
  await Promise.resolve();

  assert.deepStrictEqual(started, [
    'https://favicon.im/a.com',
    'https://favicon.im/b.com',
    'https://favicon.im/c.com'
  ]);
}

async function testFaviconLoaderTimesOutAndContinues() {
  const started = [];
  const completed = [];
  const loader = NavBookmarks.createFaviconLoader({
    maxConcurrent: 1,
    timeoutMs: 5,
    schedule: (callback) => callback(),
    load: (task) => {
      started.push(task.url);
      return new Promise(() => {});
    }
  });

  loader.enqueue({
    url: 'https://favicon.im/slow.com',
    onComplete: (ok) => completed.push(['slow', ok])
  });
  loader.enqueue({
    url: 'https://favicon.im/next.com',
    onComplete: (ok) => completed.push(['next', ok])
  });

  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepStrictEqual(started, [
    'https://favicon.im/slow.com',
    'https://favicon.im/next.com'
  ]);
  assert.deepStrictEqual(completed[0], ['slow', false]);
}

async function run() {
  testInitialUsesNameFirst();
  testFaviconUrlUsesFaviconIco();
  testRecentBookmarksSortByLastVisit();
  await testFaviconLoaderLimitsConcurrency();
  await testFaviconLoaderTimesOutAndContinues();
  console.log('bookmark utils tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
