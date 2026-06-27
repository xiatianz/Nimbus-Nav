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

  function getFaviconUrl(url) {
    try {
      var value = normalizeBookmarkUrl(url);
      var parsed = new URL(value);
      if (!/^https?:$/.test(parsed.protocol)) return '';
      return 'https://favicon.im/' + parsed.hostname.replace(/^www\./, '');
    } catch (e) {
      return '';
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

  function defaultSchedule(callback) {
    if (typeof window !== 'undefined' && window.requestIdleCallback) {
      window.requestIdleCallback(callback, { timeout: 1000 });
    } else {
      setTimeout(callback, 0);
    }
  }

  function defaultLoadFavicon(task) {
    return new Promise(function (resolve) {
      var img = task && task.img;
      if (!img || !task.url) {
        resolve(false);
        return;
      }
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = task.url;
    });
  }

  function createFaviconLoader(options) {
    options = options || {};
    var maxConcurrent = Math.max(1, Number(options.maxConcurrent) || 6);
    var timeoutMs = Math.max(1, Number(options.timeoutMs) || 2500);
    var schedule = options.schedule || defaultSchedule;
    var load = options.load || defaultLoadFavicon;
    var queue = [];
    var active = 0;
    var scheduled = false;

    function finish(task, ok) {
      if (task.img) {
        task.img.onload = null;
        task.img.onerror = null;
        if (!ok && task.img.removeAttribute) {
          task.img.removeAttribute('src');
        }
      }
      if (typeof task.onComplete === 'function') {
        task.onComplete(!!ok);
      }
      active -= 1;
      drain();
    }

    function runTask(task) {
      active += 1;
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        finish(task, false);
      }, timeoutMs);

      Promise.resolve(load(task, timeoutMs)).then(function (ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        finish(task, ok !== false);
      }, function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        finish(task, false);
      });
    }

    function drain() {
      scheduled = false;
      while (active < maxConcurrent && queue.length > 0) {
        runTask(queue.shift());
      }
    }

    function requestDrain() {
      if (scheduled) return;
      scheduled = true;
      schedule(drain);
    }

    function enqueue(task) {
      if (!task || !task.url) return;
      queue.push(task);
      requestDrain();
    }

    return {
      enqueue: enqueue,
      size: function () { return queue.length; },
      active: function () { return active; }
    };
  }

  return {
    getDomain: getDomain,
    getFaviconUrl: getFaviconUrl,
    getBookmarkInitial: getBookmarkInitial,
    getTopVisitedBookmarks: getTopVisitedBookmarks,
    createFaviconLoader: createFaviconLoader
  };
});
