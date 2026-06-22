const assert = require('assert');
const NavBookmarks = require('../bookmark-utils');

function testInitialUsesNameFirst() {
  assert.strictEqual(NavBookmarks.getBookmarkInitial({
    name: 'Figma',
    url: 'https://figma.com'
  }), 'F');
}

function testFaviconCandidatesPreferSiteFavicon() {
  assert.deepStrictEqual(
    NavBookmarks.getFaviconCandidates('github.com/explore'),
    [
      'https://github.com/favicon.ico',
      'https://www.google.com/s2/favicons?domain=github.com&sz=32&default=404'
    ]
  );
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

function run() {
  testInitialUsesNameFirst();
  testFaviconCandidatesPreferSiteFavicon();
  testRecentBookmarksSortByLastVisit();
  console.log('bookmark utils tests passed');
}

run();
