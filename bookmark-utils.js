(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NavBookmarks = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function getDomain(url) {
    try {
      var value = normalizeBookmarkUrl(url);
      return new URL(value).hostname.replace(/^www\./, '');
    } catch (e) {
      try {
        return String(url || '').replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
      } catch (err) {
        return '';
      }
    }
  }

  function normalizeBookmarkUrl(url) {
    var value = String(url || '').trim();
    if (!value) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      value = 'https://' + value;
    }
    return value;
  }

  var COMMON_FAVICON_PATHS = [
    '/favicon.ico',
    '/favicon.svg',
    '/favicon.png',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png',
    '/front-static/favicon.ico',
    '/front-static/logo-ios.png',
    '/images/favicon.ico',
    '/assets/favicon.ico',
    '/static/favicon.ico'
  ];

  var KNOWN_FAVICON_CANDIDATES = {
    'figma.com': [
      'https://static.figma.com/app/icon/2/favicon.svg',
      'https://static.figma.com/app/icon/2/favicon.png',
      'https://static.figma.com/app/icon/2/favicon.ico',
      'https://cdn.simpleicons.org/figma/F24E1E'
    ],
    'notion.so': ['https://cdn.simpleicons.org/notion/000000'],
    'notion.com': ['https://cdn.simpleicons.org/notion/000000'],
    'npmjs.com': ['https://cdn.simpleicons.org/npm/CB3837'],
    'youtube.com': ['https://cdn.simpleicons.org/youtube/FF0000'],
    'x.com': ['https://cdn.simpleicons.org/x/000000'],
    'twitter.com': ['https://cdn.simpleicons.org/x/000000']
  };

  function getKnownFaviconCandidates(hostname) {
    var host = String(hostname || '').replace(/^www\./, '');
    var candidates = [];
    Object.keys(KNOWN_FAVICON_CANDIDATES).forEach(function (domain) {
      if (host === domain || host.slice(-(domain.length + 1)) === '.' + domain) {
        candidates = candidates.concat(KNOWN_FAVICON_CANDIDATES[domain]);
      }
    });
    return candidates;
  }

  function getFaviconCandidates(url) {
    try {
      var value = normalizeBookmarkUrl(url);
      var parsed = new URL(value);
      if (!/^https?:$/.test(parsed.protocol)) return [];

      var seen = {};
      var candidates = getKnownFaviconCandidates(parsed.hostname);
      COMMON_FAVICON_PATHS.forEach(function (path) {
        candidates.push(parsed.origin + path);
      });
      candidates.push('https://unavatar.io/' + parsed.hostname.replace(/^www\./, ''));
      return candidates.filter(function (candidate) {
        if (seen[candidate]) return false;
        seen[candidate] = true;
        return true;
      });
    } catch (e) {
      return [];
    }
  }

  function getBookmarkInitial(bookmark) {
    var source = (bookmark && (bookmark.name || getDomain(bookmark.url))) || '?';
    return String(source).trim().charAt(0).toUpperCase() || '?';
  }

  function getTopVisitedBookmarks(bookmarks, stats, limit) {
    var byId = {};
    (bookmarks || []).forEach(function (bookmark) {
      byId[bookmark.id] = bookmark;
    });
    return Object.keys(stats || {}).map(function (id) {
      return {
        bookmark: byId[id],
        count: stats[id].count || 0,
        lastVisitedAt: stats[id].lastVisitedAt || 0
      };
    }).filter(function (item) {
      return item.bookmark;
    }).sort(function (a, b) {
      return b.lastVisitedAt - a.lastVisitedAt || b.count - a.count;
    }).slice(0, limit || 6).map(function (item) {
      return item.bookmark;
    });
  }

  return {
    getDomain: getDomain,
    getFaviconCandidates: getFaviconCandidates,
    getBookmarkInitial: getBookmarkInitial,
    getTopVisitedBookmarks: getTopVisitedBookmarks
  };
});
