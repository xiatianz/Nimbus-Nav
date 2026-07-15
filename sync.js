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
  var GUEST_OWNER = 'guest';
  var currentOwner = GUEST_OWNER;

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
      'initialized', 'dirty'
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

  function loadLocal() {
    migrateLegacyStorage();
    var cats = parseStoredArray(key('categories'));
    var bms = parseStoredArray(key('bookmarks'));
    var se = parseStoredArray(key('search_engines'));
    return { categories: cats, bookmarks: bms, searchEngines: se };
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

  function loadDeleted(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function saveDeleted(key, value) {
    localStorage.setItem(key, JSON.stringify(value || {}));
  }

  function markDeleted(storageKey, id) {
    if (!id) return;
    var deleted = loadDeleted(storageKey);
    deleted[id] = new Date().toISOString();
    saveDeleted(storageKey, deleted);
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
    var deletedCats = loadDeleted(key('deleted_categories'));
    var deletedBms = loadDeleted(key('deleted_bookmarks'));
    var deletedEngines = loadDeleted(key('deleted_search_engines'));
    var filteredRemote = filterDeleted(remoteData);

    if (!NavDB.isLoggedIn()) return filteredRemote;

    var bmIds = Object.keys(deletedBms);
    for (var i = 0; i < bmIds.length; i++) {
      try {
        // 尝试推送到云端删除
        await NavDB.deleteBookmark(bmIds[i]);
        // 注意：我们不再从 deletedBms 中删除该墓碑标记，
        // 永远保留墓碑，防止由于云端竞态条件导致幽灵数据复活。
      } catch (e) {
        console.warn('云端删除书签请求失败:', e.message);
      }
    }

    var catIds = Object.keys(deletedCats);
    for (var j = 0; j < catIds.length; j++) {
      try {
        await NavDB.deleteCategory(catIds[j]);
      } catch (e2) {
        console.warn('云端删除分类请求失败:', e2.message);
      }
    }

    var engineIds = Object.keys(deletedEngines);
    for (var k = 0; k < engineIds.length; k++) {
      try {
        await NavDB.deleteSearchEngine(engineIds[k]);
      } catch (e3) {
        console.warn('云端删除搜索引擎请求失败:', e3.message);
      }
    }

    // 重新保存墓碑，确保持续生效
    saveDeleted(key('deleted_bookmarks'), deletedBms);
    saveDeleted(key('deleted_categories'), deletedCats);
    saveDeleted(key('deleted_search_engines'), deletedEngines);
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
      if (!newCatId) return; // 孤立书签丢弃

      // 修正挂载的 category_id
      var mappedBm = Object.assign({}, b, { category_id: newCatId });
      var key = mappedBm.url.trim() + '||' + newCatId;
      
      if (!bmUrlMap[key]) {
        bmUrlMap[key] = mappedBm;
        uniqueBms.push(mappedBm);
      }
    });

    return { categories: uniqueCats, bookmarks: uniqueBms, searchEngines: data.searchEngines || [] };
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
        var lt = new Date(local.updated_at || 0).getTime();
        var rt = new Date(remote.updated_at || 0).getTime();
        mergedCats.push(rt >= lt ? remote : local);
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
        var lt = new Date(local.updated_at || 0).getTime();
        var rt = new Date(remote.updated_at || 0).getTime();
        merged = rt >= lt ? remote : local;
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
        var lt = new Date(local.updated_at || 0).getTime();
        var rt = new Date(remote.updated_at || 0).getTime();
        mergedEngines.push(lt >= rt ? local : remote);
      } else {
        mergedEngines.push(local || remote);
      }
    });
    mergedEngines.sort(function(a, b) { return a.sort_order - b.sort_order; });

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
        await NavDB.pushAll(localData.categories, localData.bookmarks, localData.searchEngines);
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
    await NavDB.pushAll(merged.categories, merged.bookmarks, merged.searchEngines);
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
    resetMergeState: resetMergeState,
    requestSync: requestSync,
    uuid: uuid
  };
})();
