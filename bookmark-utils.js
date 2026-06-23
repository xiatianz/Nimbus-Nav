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

  function getFaviconCandidates(url) {
    try {
      var value = normalizeBookmarkUrl(url);
      var parsed = new URL(value);
      if (!/^https?:$/.test(parsed.protocol)) return [];

      return [
        parsed.origin + '/favicon.ico'
      ];
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
