/* ====== sync.js — 离线优先同步引擎 ====== */
var NavSync = (function () {
  var LEGACY_KEYS = {
    categories: 'nav_categories',
    bookmarks: 'nav_bookmarks',
    search_engines: 'nav_search_engines',
    sync_time: 'nav_last_sync',
    merged: 'nav_cloud_merged',
    deleted_categories: 'nav_deleted_categories',
    deleted_bookmarks: 'nav_deleted_bookmarks'
  };
  var STORAGE_VERSION_KEY = 'nav_storage_v2_migrated';
  var DATA_VERSION_KEY = 'nav_data_version';
  var CURRENT_DATA_VERSION = 1;
  var GUEST_OWNER = 'guest';
  var currentOwner = GUEST_OWNER;
  // 墓碑保留时长（毫秒）。云端删除已成功且超过该阈值的墓碑将从本地丢弃，
  // 避免每次登录都重放所有历史删除。
  var TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

  function ownerKey(owner, suffix) {
    return 'nav_data_' + encodeURIComponent(owner || GUEST_OWNER) + '_' + suffix;
  }

  function key(suffix) {
    return ownerKey(currentOwner, suffix);
  }

  function migrateLegacyStorage() {
    if (localStorage.getItem(STORAGE_VERSION_KEY) === 'true') return;
    var hasLegacyData = Object.keys(LEGACY_KEYS).some(function (suffix) {
      return localStorage.getItem(LEGACY_KEYS[suffix]) !== null;
    });
    if (hasLegacyData) {
      Object.keys(LEGACY_KEYS).forEach(function (suffix) {
        var value = localStorage.getItem(LEGACY_KEYS[suffix]);
        if (value !== null) localStorage.setItem(ownerKey(GUEST_OWNER, suffix), value);
      });
      localStorage.setItem(ownerKey(GUEST_OWNER, 'initialized'), 'true');
    }
    Object.keys(LEGACY_KEYS).forEach(function (suffix) {
      localStorage.removeItem(LEGACY_KEYS[suffix]);
    });
    localStorage.setItem(STORAGE_VERSION_KEY, 'true');
  }

  function copyOwnerData(sourceOwner, targetOwner) {
    [
      'categories', 'bookmarks', 'search_engines', 'sync_time', 'merged',
      'deleted_categories', 'deleted_bookmarks', 'deleted_search_engines',
      'initialized', 'dirty'
    ].forEach(function (suffix) {
      var value = localStorage.getItem(ownerKey(sourceOwner, suffix));
      if (value !== null) localStorage.setItem(ownerKey(targetOwner, suffix), value);
    });
  }

  function clearOwnerData(owner) {
    [
      'categories', 'bookmarks', 'search_engines', 'sync_time', 'merged',
      'deleted_categories', 'deleted_bookmarks', 'deleted_search_engines',
      'dirty'
    ].forEach(function (suffix) {
      localStorage.removeItem(ownerKey(owner, suffix));
    });
  }

  function setOwner(ownerId, options) {
    migrateLegacyStorage();
    var nextOwner = ownerId || GUEST_OWNER;
    options = options || {};
    if (options.adoptGuest && nextOwner !== GUEST_OWNER
        && localStorage.getItem(ownerKey(nextOwner, 'initialized')) !== 'true'
        && localStorage.getItem(ownerKey(GUEST_OWNER, 'initialized')) === 'true') {
      copyOwnerData(GUEST_OWNER, nextOwner);
      clearOwnerData(GUEST_OWNER);
    }
    currentOwner = nextOwner;
    return currentOwner;
  }

  function getOwner() {
    return currentOwner;
  }

  /* ---- 本地存储 ---- */

  function parseStoredArray(storageKey) {
    try {
      var value = localStorage.getItem(storageKey);
      if (!value) return [];
      var parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      localStorage.removeItem(storageKey);
      return [];
    }
  }

  function validateEntity(item, type) {
    if (!item || typeof item !== 'object') return false;
    if (!item.id || typeof item.id !== 'string') return false;
    if (type === 'category' || type === 'bookmark') {
      if (typeof item.name !== 'string' && typeof item.name !== 'undefined') return false;
    }
    if (type === 'bookmark') {
      if (!item.category_id && typeof item.category_id !== 'string') return false;
    }
    if (type === 'searchEngine') {
      if (typeof item.url !== 'string' || !item.url) return false;
    }
    return true;
  }

  function validateAndClean(data) {
    var clean = {
      categories: (data.categories || []).filter(function (c) { return validateEntity(c, 'category'); }),
      bookmarks: (data.bookmarks || []).filter(function (b) { return validateEntity(b, 'bookmark'); }),
      searchEngines: (data.searchEngines || []).filter(function (e) { return validateEntity(e, 'searchEngine'); })
    };
    if (clean.categories.length !== (data.categories || []).length
        || clean.bookmarks.length !== (data.bookmarks || []).length
        || clean.searchEngines.length !== (data.searchEngines || []).length) {
      saveLocal(clean);
    }
    return clean;
  }

  function checkDataVersion() {
    var storedVersion = parseInt(localStorage.getItem(DATA_VERSION_KEY), 10) || 0;
    if (storedVersion < CURRENT_DATA_VERSION) {
      // Future: run migrations here when schema changes
      localStorage.setItem(DATA_VERSION_KEY, String(CURRENT_DATA_VERSION));
    }
  }

  function loadLocal() {
    migrateLegacyStorage();
    checkDataVersion();
    var cats = parseStoredArray(key('categories'));
    var bms = parseStoredArray(key('bookmarks'));
    var raw = parseStoredArray(key('search_engines'));
    // Deduplicate by URL on every load to self-heal previously accumulated duplicates
    // Sort by updated_at descending first to keep the newest version
    raw.sort(function(a, b) {
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    });
    var seenUrls = {};
    var se = raw.filter(function(e) {
      var u = (e.url || '').trim();
      if (!u || seenUrls[u]) return false;
      seenUrls[u] = true;
      return true;
    });
    if (se.length !== raw.length) {
      // Persist the cleaned list immediately
      localStorage.setItem(key('search_engines'), JSON.stringify(se));
    }
    var data = { categories: cats, bookmarks: bms, searchEngines: se };
    return validateAndClean(data);
  }

  function saveLocal(data) {
    var current = loadLocal();
    var next = {
      categories: Array.isArray(data.categories) ? data.categories : current.categories,
      bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : current.bookmarks,
      searchEngines: Array.isArray(data.searchEngines) ? data.searchEngines : current.searchEngines
    };
    localStorage.setItem(key('categories'), JSON.stringify(next.categories));
    localStorage.setItem(key('bookmarks'), JSON.stringify(next.bookmarks));
    localStorage.setItem(key('search_engines'), JSON.stringify(next.searchEngines));
    localStorage.setItem(key('initialized'), 'true');
  }

  function getLocalSyncTime() {
    return localStorage.getItem(key('sync_time')) || '0';
  }

  function setLocalSyncTime(time) {
    localStorage.setItem(key('sync_time'), time);
  }

  function hasMerged() {
    return localStorage.getItem(key('merged')) === 'true';
  }

  function setMerged() {
    localStorage.setItem(key('merged'), 'true');
  }

  function isDirty() {
    return localStorage.getItem(key('dirty')) === 'true';
  }

  function setDirty(value) {
    localStorage.setItem(key('dirty'), value ? 'true' : 'false');
  }

  function markDirty() {
    setDirty(true);
  }

  function loadDeleted(storageKey) {
    try {
      var raw = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
      // 顺带清理过期的墓碑，避免无限膨胀。
      var now = Date.now();
      var pruned = {};
      var changed = false;
      Object.keys(raw).forEach(function (id) {
        var ts = new Date(raw[id] || 0).getTime();
        if (!ts || (now - ts) < TOMBSTONE_TTL_MS) {
          pruned[id] = raw[id];
        } else {
          changed = true;
        }
      });
      if (changed) localStorage.setItem(storageKey, JSON.stringify(pruned));
      return pruned;
    } catch (e) {
      return {};
    }
  }

  function saveDeleted(storageKey, value) {
    localStorage.setItem(storageKey, JSON.stringify(value || {}));
  }

  function markDeleted(storageKey, id) {
    if (!id) return;
    var deleted = loadDeleted(storageKey);
    deleted[id] = new Date().toISOString();
    saveDeleted(storageKey, deleted);
  }

  function clearTombstone(storageKey, id) {
    if (!id) return;
    var deleted = loadDeleted(storageKey);
    if (deleted[id]) {
      delete deleted[id];
      saveDeleted(storageKey, deleted);
    }
  }

  function filterDeleted(data) {
    var deletedCats = loadDeleted(key('deleted_categories'));
    var deletedBms = loadDeleted(key('deleted_bookmarks'));
    var deletedEngines = loadDeleted(key('deleted_search_engines'));
    return {
      categories: data.categories.filter(function (cat) {
        return !deletedCats[cat.id];
      }),
      bookmarks: data.bookmarks.filter(function (bm) {
        return !deletedBms[bm.id] && !deletedCats[bm.category_id];
      }),
      searchEngines: (data.searchEngines || []).filter(function (engine) {
        return !deletedEngines[engine.id];
      })
    };
  }

  async function flushPendingDeletes(remoteData) {
    var bmKey = key('deleted_bookmarks');
    var catKey = key('deleted_categories');
    var engineKey = key('deleted_search_engines');
    var deletedCats = loadDeleted(catKey);
    var deletedBms = loadDeleted(bmKey);
    var deletedEngines = loadDeleted(engineKey);
    var filteredRemote = filterDeleted(remoteData);

    if (!NavDB.isLoggedIn()) return filteredRemote;

    // 云端删除成功后立即清理墓碑，避免每次登录都重放所有历史删除。
    // 仅在请求失败（网络问题、5xx 等）时保留墓碑等待下次同步补偿；过期墓碑
    // 由 loadDeleted 的 TTL 自动兜底清理。
    var bmIds = Object.keys(deletedBms);
    var bmSuccessIds = [];
    for (var i = 0; i < bmIds.length; i++) {
      try {
        await NavDB.deleteBookmark(bmIds[i]);
        bmSuccessIds.push(bmIds[i]);
      } catch (e) {
        console.warn('云端删除书签请求失败:', e.message);
      }
    }
    bmSuccessIds.forEach(function (id) { delete deletedBms[id]; });

    var catIds = Object.keys(deletedCats);
    var catSuccessIds = [];
    for (var j = 0; j < catIds.length; j++) {
      try {
        await NavDB.deleteCategory(catIds[j]);
        catSuccessIds.push(catIds[j]);
      } catch (e2) {
        console.warn('云端删除分类请求失败:', e2.message);
      }
    }
    catSuccessIds.forEach(function (id) { delete deletedCats[id]; });

    var engineIds = Object.keys(deletedEngines);
    var engineSuccessIds = [];
    for (var k = 0; k < engineIds.length; k++) {
      try {
        await NavDB.deleteSearchEngine(engineIds[k]);
        engineSuccessIds.push(engineIds[k]);
      } catch (e3) {
        console.warn('云端删除搜索引擎请求失败:', e3.message);
      }
    }
    engineSuccessIds.forEach(function (id) { delete deletedEngines[id]; });

    saveDeleted(bmKey, deletedBms);
    saveDeleted(catKey, deletedCats);
    saveDeleted(engineKey, deletedEngines);
    return filteredRemote;
  }

  /* ---- 生成 UUID ---- */

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isUUID(s) { return UUID_RE.test(s); }

  function isSharedDefaultEngineId(id) {
    return /^00000000-0000-4000-8000-00000000000[1-4]$/i.test(String(id || ''));
  }

  /* ---- 初始化默认数据 ---- */

  function migrateEntityIds(data) {
    var changed = false;
    var categoryIdMap = {};
    data.categories.forEach(function (category) {
      var oldId = category.id;
      if (!isUUID(oldId)) {
        category.id = uuid();
        changed = true;
      }
      categoryIdMap[oldId] = category.id;
    });
    data.bookmarks.forEach(function (bookmark) {
      if (categoryIdMap[bookmark.category_id]) {
        if (bookmark.category_id !== categoryIdMap[bookmark.category_id]) changed = true;
        bookmark.category_id = categoryIdMap[bookmark.category_id];
      }
      if (!isUUID(bookmark.id)) {
        bookmark.id = uuid();
        changed = true;
      }
    });
    data.searchEngines.forEach(function (engine) {
      if (!isUUID(engine.id) || isSharedDefaultEngineId(engine.id)) {
        engine.id = uuid();
        changed = true;
      }
    });
    if (changed) saveLocal(data);
    return data;
  }

  function initDefaultData() {
    var existing = loadLocal();
    if (localStorage.getItem(key('initialized')) === 'true') {
      return migrateEntityIds(existing);
    }

    var cats = [];
    var bms = [];

    DEFAULT_DATA.forEach(function (def, ci) {
      var catId = uuid();
      cats.push({
        id: catId,
        name: def.name,
        sort_order: ci,
        updated_at: null, // 不设置时间戳，作为“未改动默认数据”的标记
        _default: true,
        _local: true
      });
      def.bookmarks.forEach(function (bm, bi) {
        bms.push({
          id: uuid(),
          category_id: catId,
          name: bm.name,
          url: bm.url,
          description: bm.description,
          sort_order: bi,
          updated_at: null,
          _default: true,
          _local: true
        });
      });
    });

    var engines = (typeof DEFAULT_SEARCH_ENGINES !== 'undefined' ? DEFAULT_SEARCH_ENGINES : []).map(function (engine, index) {
      return {
        id: uuid(),
        name: engine.name,
        url: engine.url,
        sort_order: typeof engine.sort_order === 'number' ? engine.sort_order : index,
        updated_at: null,
        _default: true
      };
    });
    var data = { categories: cats, bookmarks: bms, searchEngines: engines };
    saveLocal(data);
    setDirty(false);
    return data;
  }

  /* ---- 去重保护：清理同名、同URL的重复数据 ---- */
  function deduplicate(data) {
    var uniqueCats = [];
    var catNameMap = {};
    var oldToNewCatId = {};

    // 1. 分类去重 (保留最新的)
    data.categories.sort(function(a, b) {
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    }).forEach(function(c) {
      var key = c.name.trim();
      if (!catNameMap[key]) {
        catNameMap[key] = c;
        uniqueCats.push(c);
        oldToNewCatId[c.id] = c.id;
      } else {
        oldToNewCatId[c.id] = catNameMap[key].id; // 记录映射
      }
    });

    var uniqueBms = [];
    var bmUrlMap = {};

    // 2. 书签去重 (基于 URL + 分类，保留最新的)
    data.bookmarks.sort(function(a, b) {
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    }).forEach(function(b) {
      var newCatId = oldToNewCatId[b.category_id];
      if (!newCatId) {
        // 孤立书签：移动到第一个有效分类或保留原 category_id
        if (uniqueCats.length > 0) {
          newCatId = uniqueCats[0].id;
        } else {
          return;
        }
      }

      // 修正挂载的 category_id
      var mappedBm = Object.assign({}, b, { category_id: newCatId });
      var key = mappedBm.url.trim() + '||' + newCatId;
      
      if (!bmUrlMap[key]) {
        bmUrlMap[key] = mappedBm;
        uniqueBms.push(mappedBm);
      }
    });

    // Search engine dedup by URL (same engine may have accumulated multiple UUIDs)
    var uniqueEngines = [];
    var engineUrlMap = {};
    (data.searchEngines || []).sort(function(a, b) {
      return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    }).forEach(function(e) {
      var key = (e.url || '').trim();
      if (key && !engineUrlMap[key]) {
        engineUrlMap[key] = e;
        uniqueEngines.push(e);
      }
    });
    return { categories: uniqueCats, bookmarks: uniqueBms, searchEngines: uniqueEngines };
  }

  /* ---- 合并策略：时间戳对比，最后写入胜出 ---- */

  function mergeData(localData, remoteData) {
    var mergedCats = [];
    var mergedBms = [];
    var mergedEngines = [];


    // 建索引
    var localCatMap = {};
    localData.categories.forEach(function (c) { localCatMap[c.id] = c; });
    var remoteCatMap = {};
    remoteData.categories.forEach(function (c) { remoteCatMap[c.id] = c; });

    // 合并分类：取两边并集，同 ID 比较 updated_at
    var allCatIds = {};
    localData.categories.forEach(function (c) { allCatIds[c.id] = true; });
    remoteData.categories.forEach(function (c) { allCatIds[c.id] = true; });

    Object.keys(allCatIds).forEach(function (id) {
      var local = localCatMap[id];
      var remote = remoteCatMap[id];
      if (local && remote) {
        var lt = local.updated_at ? new Date(local.updated_at).getTime() : 0;
        var rt = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
        // 优先使用服务器时间戳（remote），本地时钟可能不准
        // 仅当本地明确更新且远端时间比本地旧超过 5 秒时才用本地
        if (lt > rt + 5000) {
          mergedCats.push(local);
        } else {
          mergedCats.push(remote);
        }
      } else {
        mergedCats.push(local || remote);
      }
    });

    // 合并书签
    var localBmMap = {};
    localData.bookmarks.forEach(function (b) { localBmMap[b.id] = b; });
    var remoteBmMap = {};
    remoteData.bookmarks.forEach(function (b) { remoteBmMap[b.id] = b; });

    var allBmIds = {};
    localData.bookmarks.forEach(function (b) { allBmIds[b.id] = true; });
    remoteData.bookmarks.forEach(function (b) { allBmIds[b.id] = true; });

    // 收集合并后的分类 ID 集合，用于清理孤立书签
    var validCatIds = {};
    mergedCats.forEach(function (c) { validCatIds[c.id] = true; });

    Object.keys(allBmIds).forEach(function (id) {
      var local = localBmMap[id];
      var remote = remoteBmMap[id];
      var merged;
      if (local && remote) {
        var lt = local.updated_at ? new Date(local.updated_at).getTime() : 0;
        var rt = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
        if (lt > rt + 5000) {
          merged = local;
        } else {
          merged = remote;
        }
      } else {
        merged = local || remote;
      }
      // 只保留分类还存在的书签
      if (merged && validCatIds[merged.category_id]) {
        mergedBms.push(merged);
      }
    });

    // 排序
    mergedCats.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

    var localEngineMap = {};
    (localData.searchEngines || []).forEach(function (e) { localEngineMap[e.id] = e; });
    var remoteEngineMap = {};
    (remoteData.searchEngines || []).forEach(function (e) { remoteEngineMap[e.id] = e; });
    var allEngineIds = {};
    (localData.searchEngines || []).forEach(function (e) { allEngineIds[e.id] = true; });
    (remoteData.searchEngines || []).forEach(function (e) { allEngineIds[e.id] = true; });
    Object.keys(allEngineIds).forEach(function (id) {
      var local = localEngineMap[id];
      var remote = remoteEngineMap[id];
      if (local && remote) {
        var lt = local.updated_at ? new Date(local.updated_at).getTime() : 0;
        var rt = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
        if (lt > rt + 5000) {
          mergedEngines.push(local);
        } else {
          mergedEngines.push(remote);
        }
      } else {
        mergedEngines.push(local || remote);
      }
    });
    mergedEngines.sort(function(a, b) { return a.sort_order - b.sort_order; });

    // Secondary dedup by URL in case same engine exists with different IDs
    var seenUrls = {};
    mergedEngines = mergedEngines.filter(function(e) {
      var u = (e.url || '').trim();
      if (!u || seenUrls[u]) return false;
      seenUrls[u] = true;
      return true;
    });

    return { categories: mergedCats, bookmarks: mergedBms, searchEngines: mergedEngines };
  }

  /* ---- 核心同步流程 ---- */

  async function syncOnLogin() {
    if (!NavDB.isLoggedIn()) return loadLocal();

    var localData = loadLocal();
    var remoteData = await NavDB.fetchAll();
    remoteData = await flushPendingDeletes(remoteData);

    // 在合并之前，如果本地数据全是默认且未被改过，直接用云端数据覆盖
    var isLocalDefaultOnly = !isDirty()
      && localData.categories.length > 0
      && localData.categories.every(function (c) { return c._default && !c.updated_at; })
      && localData.bookmarks.every(function (b) { return b._default && !b.updated_at; });

    var remoteHasData = remoteData.categories.length > 0
      || remoteData.bookmarks.length > 0
      || (remoteData.searchEngines && remoteData.searchEngines.length > 0);

    if (isLocalDefaultOnly && remoteHasData) {
      localData = { categories: [], bookmarks: [], searchEngines: [] };
    }

    // 远端无数据 → 把本地推上去
    if (remoteData.categories.length === 0 && remoteData.bookmarks.length === 0 && (!remoteData.searchEngines || remoteData.searchEngines.length === 0)) {
      if (localData.categories.length > 0 || localData.bookmarks.length > 0 || localData.searchEngines.length > 0) {
        try {
          await NavDB.pushAll(localData.categories, localData.bookmarks, localData.searchEngines);
        } catch (e) {
          console.warn('pushAll 失败（下次同步补偿）:', e.message);
        }
      }
      setMerged();
      setLocalSyncTime(new Date().toISOString());
      setDirty(false);
      return localData;
    }

    // 本地无数据 (或被识别为纯粹的未改动默认数据) → 拉远端
    if (localData.categories.length === 0 && localData.bookmarks.length === 0 && (!localData.searchEngines || localData.searchEngines.length === 0)) {
      // 拉取远端时也做一次去重保护，清理历史遗留重复
      var dedupedRemote = deduplicate(remoteData);
      saveLocal(dedupedRemote);
      setMerged();
      setLocalSyncTime(new Date().toISOString());
      setDirty(false);
      return dedupedRemote;
    }

    // 两边都有 → 合并 & 终极去重
    var merged = deduplicate(mergeData(localData, remoteData));
    saveLocal(merged);
    try {
      await NavDB.pushAll(merged.categories, merged.bookmarks, merged.searchEngines);
    } catch (e) {
      console.warn('pushAll 失败（下次同步补偿）:', e.message);
    }
    setMerged();
    setLocalSyncTime(new Date().toISOString());
    setDirty(false);
    return merged;
  }

  /* ---- 单项操作：先写本地，再异步推云端 ---- */

  function addCategoryLocal(name) {
    var data = loadLocal();
    var maxOrder = data.categories.reduce(function (m, c) { return Math.max(m, c.sort_order || 0); }, -1);
    var cat = {
      id: uuid(),
      name: name,
      sort_order: maxOrder + 1,
      updated_at: new Date().toISOString(),
      _local: true
    };
    data.categories.push(cat);
    saveLocal(data);
    markDirty();
    pushCategoryAsync(cat);
    return cat;
  }

  function updateCategoryLocal(id, updates) {
    var data = loadLocal();
    var cat = data.categories.find(function (c) { return c.id === id; });
    if (!cat) return null;
    Object.keys(updates).forEach(function (k) { cat[k] = updates[k]; });
    cat.updated_at = new Date().toISOString();
    cat._default = false;
    saveLocal(data);
    markDirty();
    pushCategoryAsync(cat);
    return cat;
  }

  function deleteCategoryLocal(id) {
    var data = loadLocal();
    markDeleted(key('deleted_categories'), id);
    data.bookmarks.forEach(function (b) {
      if (b.category_id === id) markDeleted(key('deleted_bookmarks'), b.id);
    });
    data.categories = data.categories.filter(function (c) { return c.id !== id; });
    data.bookmarks = data.bookmarks.filter(function (b) { return b.category_id !== id; });
    saveLocal(data);
    markDirty();
    deleteCategoryAsync(id);
  }

  function addBookmarkLocal(bmData) {
    var data = loadLocal();
    var siblings = data.bookmarks.filter(function (b) { return b.category_id === bmData.category_id; });
    var maxOrder = siblings.reduce(function (m, b) { return Math.max(m, b.sort_order || 0); }, -1);
    var bm = {
      id: uuid(),
      category_id: bmData.category_id,
      name: bmData.name,
      url: bmData.url,
      description: bmData.description || '',
      sort_order: maxOrder + 1,
      updated_at: new Date().toISOString(),
      _local: true
    };
    data.bookmarks.push(bm);
    saveLocal(data);
    markDirty();
    pushBookmarkAsync(bm);
    return bm;
  }

  function updateBookmarkLocal(id, updates) {
    var data = loadLocal();
    var bm = data.bookmarks.find(function (b) { return b.id === id; });
    if (!bm) return null;
    Object.keys(updates).forEach(function (k) { bm[k] = updates[k]; });
    bm.updated_at = new Date().toISOString();
    bm._default = false;
    saveLocal(data);
    markDirty();
    pushBookmarkAsync(bm);
    return bm;
  }

  function deleteBookmarkLocal(id) {
    var data = loadLocal();
    markDeleted(key('deleted_bookmarks'), id);
    data.bookmarks = data.bookmarks.filter(function (b) { return b.id !== id; });
    saveLocal(data);
    markDirty();
    deleteBookmarkAsync(id);
  }

  function deleteSearchEngineLocal(id) {
    var data = loadLocal();
    markDeleted(key('deleted_search_engines'), id);
    data.searchEngines = data.searchEngines.filter(function (engine) { return engine.id !== id; });
    saveLocal(data);
    markDirty();
    deleteSearchEngineAsync(id);
    return data.searchEngines;
  }

  /* ---- 批量重排 API（避免拖拽时 N 次 upsert）---- */

  // 把传入的数组按新顺序写回本地 sort_order，并批量推云。仅推发生实际
  // 变化的条目，尽量减少无意义的 upsert。
  function reorderCategoriesLocal(orderedIds) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;
    var data = loadLocal();
    var byId = {};
    data.categories.forEach(function (c) { byId[c.id] = c; });
    var now = new Date().toISOString();
    var changed = [];
    orderedIds.forEach(function (id, index) {
      var cat = byId[id];
      if (!cat) return;
      if (cat.sort_order !== index) {
        cat.sort_order = index;
        cat.updated_at = now;
        cat._default = false;
        changed.push(cat);
      }
    });
    if (changed.length === 0) return;
    saveLocal(data);
    markDirty();
    if (NavDB.isLoggedIn()) {
      NavDB.upsertCategories(changed).catch(function (e) {
        console.warn('云端批量同步分类失败:', e.message);
      });
    }
  }

  // orderedByCategory: { catId: [按新顺序排好的书签 ID 数组] }
  // catAssignments 可选：{ bmId: newCategoryId } 用于跨分类移动。
  function reorderBookmarksLocal(orderedByCategory, catAssignments) {
    if (!orderedByCategory) return;
    var data = loadLocal();
    var byId = {};
    data.bookmarks.forEach(function (b) { byId[b.id] = b; });
    var now = new Date().toISOString();
    var changed = [];
    Object.keys(orderedByCategory).forEach(function (catId) {
      (orderedByCategory[catId] || []).forEach(function (bmId, index) {
        var bm = byId[bmId];
        if (!bm) return;
        var newCatId = catAssignments && catAssignments[bmId] ? catAssignments[bmId] : catId;
        var moved = false;
        if (bm.category_id !== newCatId) { bm.category_id = newCatId; moved = true; }
        if (bm.sort_order !== index) { bm.sort_order = index; moved = true; }
        if (moved) {
          bm.updated_at = now;
          bm._default = false;
          changed.push(bm);
        }
      });
    });
    if (changed.length === 0) return;
    saveLocal(data);
    markDirty();
    if (NavDB.isLoggedIn()) {
      NavDB.upsertBookmarks(changed).catch(function (e) {
        console.warn('云端批量同步书签失败:', e.message);
      });
    }
  }

  // 搜索引擎没有分类概念，传入已按新顺序排好的引擎数组即可。
  function reorderSearchEnginesLocal(orderedEngines) {
    if (!Array.isArray(orderedEngines) || orderedEngines.length === 0) return;
    var data = loadLocal();
    var now = new Date().toISOString();
    var changed = [];
    var orderMap = {};
    orderedEngines.forEach(function (engine, index) {
      if (!engine || !engine.id) return;
      orderMap[engine.id] = index;
    });
    data.searchEngines.forEach(function (engine) {
      if (orderMap.hasOwnProperty(engine.id) && engine.sort_order !== orderMap[engine.id]) {
        engine.sort_order = orderMap[engine.id];
        engine.updated_at = now;
        changed.push(engine);
      }
    });
    if (changed.length === 0) return;
    data.searchEngines.sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
    saveLocal(data);
    markDirty();
    if (changed.length > 0 && NavDB.isLoggedIn() && NavDB.upsertSearchEngines) {
      NavDB.upsertSearchEngines(changed).catch(function (e) {
        console.warn('云端批量同步搜索引擎失败:', e.message);
      });
    }
  }

  // 完整同步一次本地搜索引擎数组（新增 / 编辑 / 删除后使用）。
  function saveSearchEnginesLocal(engines) {
    if (!Array.isArray(engines)) return;
    saveLocal({ searchEngines: engines });
    markDirty();
    if (NavDB.isLoggedIn() && NavDB.upsertSearchEngines) {
      NavDB.upsertSearchEngines(engines).catch(function (e) {
        console.warn('云端同步搜索引擎失败:', e.message);
      });
    }
  }

  /* ---- 异步推送（静默失败，下次同步时补偿） ---- */

  function pushCategoryAsync(cat) {
    if (!NavDB.isLoggedIn()) return;
    NavDB.upsertCategories([cat]).catch(function (e) {
      console.warn('云端同步分类失败:', e.message);
    });
  }

  function pushBookmarkAsync(bm) {
    if (!NavDB.isLoggedIn()) return;
    NavDB.upsertBookmarks([bm]).catch(function (e) {
      console.warn('云端同步书签失败:', e.message);
    });
  }

  function deleteBookmarkAsync(id) {
    if (!NavDB.isLoggedIn()) return;
    NavDB.deleteBookmark(id).catch(function (e) {
      console.warn('云端删除书签失败:', e.message);
    });
  }

  function deleteCategoryAsync(id) {
    if (!NavDB.isLoggedIn()) return;
    NavDB.deleteCategory(id).catch(function (e) {
      console.warn('云端删除分类失败:', e.message);
    });
  }

  function deleteSearchEngineAsync(id) {
    if (!NavDB.isLoggedIn()) return;
    NavDB.deleteSearchEngine(id).catch(function (e) {
      console.warn('云端删除搜索引擎失败:', e.message);
    });
  }

  /* ---- 登出清理 ---- */

  function resetMergeState() {
    localStorage.removeItem(key('merged'));
    localStorage.removeItem(key('sync_time'));
  }

  async function requestSync() {
    if (!NavDB.isLoggedIn()) return loadLocal();
    var data = loadLocal();
    try {
      await NavDB.pushAll(data.categories, data.bookmarks, data.searchEngines);
      setLocalSyncTime(new Date().toISOString());
      setDirty(false);
    } catch (e) {
      console.warn('requestSync push failed:', e.message);
    }
    return data;
  }

  return {
    setOwner: setOwner,
    getOwner: getOwner,
    loadLocal: loadLocal,
    saveLocal: saveLocal,
    markDirty: markDirty,
    initDefaultData: initDefaultData,
    syncOnLogin: syncOnLogin,
    addCategoryLocal: addCategoryLocal,
    updateCategoryLocal: updateCategoryLocal,
    deleteCategoryLocal: deleteCategoryLocal,
    addBookmarkLocal: addBookmarkLocal,
    updateBookmarkLocal: updateBookmarkLocal,
    deleteBookmarkLocal: deleteBookmarkLocal,
    deleteSearchEngineLocal: deleteSearchEngineLocal,
    reorderCategoriesLocal: reorderCategoriesLocal,
    reorderBookmarksLocal: reorderBookmarksLocal,
    reorderSearchEnginesLocal: reorderSearchEnginesLocal,
    saveSearchEnginesLocal: saveSearchEnginesLocal,
    resetMergeState: resetMergeState,
    requestSync: requestSync,
    uuid: uuid
  };
})();
