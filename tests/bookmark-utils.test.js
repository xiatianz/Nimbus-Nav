const assert = require('assert');
const NavBookmarks = require('../bookmark-utils');

function testInitialUsesNameFirst() {
  assert.strictEqual(NavBookmarks.getBookmarkInitial({
    name: 'Figma',
    url: 'https://figma.com'
  }), 'F');
}

function testFaviconCandidatesTryCommonSiteIconPaths() {
  const candidates = NavBookmarks.getFaviconCandidates('github.com/explore');

  assert.deepStrictEqual(candidates.slice(0, 5), [
    'https://github.com/favicon.ico',
    'https://github.com/favicon.svg',
    'https://github.com/favicon.png',
    'https://github.com/apple-touch-icon.png',
    'https://github.com/apple-touch-icon-precomposed.png'
  ]);
  assert(!candidates.some((url) => url.includes('google.com/s2/favicons')));
}

function testFaviconCandidatesIncludeKnownExternalIconHost() {
  assert.strictEqual(
    NavBookmarks.getFaviconCandidates('https://www.figma.com/files')[0],
    'https://static.figma.com/app/icon/2/favicon.svg'
  );
}

function testFaviconCandidatesIncludeKnownBrandIconFallback() {
  assert(
    NavBookmarks.getFaviconCandidates('https://www.npmjs.com/package/react')
      .includes('https://cdn.simpleicons.org/npm/CB3837')
  );
}

function testFaviconCandidatesIncludeUnavatarFallback() {
  const candidates = NavBookmarks.getFaviconCandidates('https://example.com/docs');

  assert(candidates.includes('https://unavatar.io/example.com'));
  assert(!candidates.some((url) => url.includes('google.com/s2/favicons')));
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
  testFaviconCandidatesTryCommonSiteIconPaths();
  testFaviconCandidatesIncludeKnownExternalIconHost();
  testFaviconCandidatesIncludeKnownBrandIconFallback();
  testFaviconCandidatesIncludeUnavatarFallback();
  testRecentBookmarksSortByLastVisit();
  console.log('bookmark utils tests passed');
}

run();
