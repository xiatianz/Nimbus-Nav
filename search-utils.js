(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NavSearch = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PREFIX_ENGINES = {
    g: { name: 'Google', url: 'https://www.google.com/search?q=' },
    google: { name: 'Google', url: 'https://www.google.com/search?q=' },
    b: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
    bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
    bd: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
    baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=' },
    dd: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    duck: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' }
  };

  function trimQuery(query) {
    return String(query || '').trim();
  }

  function getDomain(url) {
    try {
      return String(url || '').replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  }

  function isLikelyUrl(query) {
    var value = trimQuery(query);
    if (!value || /\s/.test(value)) return false;
    if (/^https?:\/\//i.test(value)) return true;
    if (/^localhost(?::\d+)?(?:\/.*)?$/i.test(value)) return true;
    if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/.*)?$/.test(value)) return true;
    if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/.*)?$/i.test(value)) return true;
    return false;
  }

  function normalizeUrl(query) {
    var value = trimQuery(query);
    if (/^https?:\/\//i.test(value)) return value;
    if (/^localhost(?::\d+)?(?:\/.*)?$/i.test(value)) return 'http://' + value;
    if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/.*)?$/.test(value)) return 'http://' + value;
    return 'https://' + value;
  }

  function getPrefixedSearch(query) {
    var value = trimQuery(query);
    var match = value.match(/^([a-z]{1,10})\s+(.+)$/i);
    if (!match) return null;
    var engine = PREFIX_ENGINES[match[1].toLowerCase()];
    var term = trimQuery(match[2]);
    if (!engine || !term) return null;
    return {
      type: 'search',
      title: engine.name + ' 搜索',
      label: engine.name + ' 搜索 ' + term,
      url: engine.url + encodeURIComponent(term),
      query: term,
      engine: engine.name
    };
  }

  function getDirectAction(query, currentEngineUrl) {
    var value = trimQuery(query);
    if (!value) return null;

    var prefixed = getPrefixedSearch(value);
    if (prefixed) return prefixed;

    if (isLikelyUrl(value)) {
      var url = normalizeUrl(value);
      return {
        type: 'url',
        title: '打开网址',
        label: '打开 ' + url,
        url: url,
        query: value
      };
    }

    return {
      type: 'search',
      title: '网页搜索',
      label: '搜索 ' + value,
      url: currentEngineUrl + encodeURIComponent(value),
      query: value
    };
  }

  function scoreBookmark(bookmark, query) {
    var q = query.toLowerCase();
    var name = String(bookmark.name || '').toLowerCase();
    var description = String(bookmark.description || '').toLowerCase();
    var domain = getDomain(bookmark.url).toLowerCase();
    var url = String(bookmark.url || '').toLowerCase();

    if (name === q || domain === q) return 100;
    if (name.indexOf(q) === 0 || domain.indexOf(q) === 0) return 80;
    if (name.indexOf(q) >= 0 || domain.indexOf(q) >= 0) return 60;
    if (description.indexOf(q) >= 0 || url.indexOf(q) >= 0) return 40;
    return 0;
  }

  function buildBookmarkSuggestions(query, bookmarks, limit) {
    var value = trimQuery(query);
    if (!value) return [];
    return (bookmarks || []).map(function (bookmark) {
      return { bookmark: bookmark, score: scoreBookmark(bookmark, value) };
    }).filter(function (item) {
      return item.score > 0;
    }).sort(function (a, b) {
      return b.score - a.score || String(a.bookmark.name || '').localeCompare(String(b.bookmark.name || ''));
    }).slice(0, limit || 5).map(function (item) {
      return {
        type: 'bookmark',
        title: item.bookmark.name,
        subtitle: getDomain(item.bookmark.url) + (item.bookmark.description ? ' · ' + item.bookmark.description : ''),
        url: item.bookmark.url,
        bookmark: item.bookmark
      };
    });
  }

  function buildSuggestions(query, bookmarks, currentEngineUrl) {
    var value = trimQuery(query);
    if (!value) return [];
    var suggestions = buildBookmarkSuggestions(value, bookmarks, 5);
    var direct = getDirectAction(value, currentEngineUrl);
    if (direct) suggestions.push(direct);
    return suggestions;
  }

  return {
    getDomain: getDomain,
    isLikelyUrl: isLikelyUrl,
    normalizeUrl: normalizeUrl,
    getDirectAction: getDirectAction,
    buildSuggestions: buildSuggestions
  };
});
