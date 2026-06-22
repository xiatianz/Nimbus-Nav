/* ====== sync.js — 离线优先同步引擎 ====== */
var NavSync = (function () {
  var LS_CATEGORIES = 'nav_categories';
  var LS_BOOKMARKS = 'nav_bookmarks';
  var LS_SYNC_TIME = 'nav_last_sync';
  var LS_MERGED = 'nav_cloud_merged';
  var LS_DELETED_CATEGORIES = 'nav_deleted_categories';
  var LS_DELETED_BOOKMARKS = 'nav_deleted_bookmarks';

  /* ---- 本地存储 ---- */

  function loadLocal() {
    var cats = JSON.parse(localStorage.getItem(LS_CATEGORIES) || '[]');
    var bms = JSON.parse(localStorage.getItem(LS_BOOKMARKS) || '[]');
    return { categories: cats, bookmarks: bms };
  }

  function saveLocal(data) {
    localStorage.setItem(LS_CATEGORIES, JSON.stringify(data.categories));
    localStorage.setItem(LS_BOOKMARKS, JSON.stringify(data.bookmarks));
  }

  function getLocalSyncTime() {
    return localStorage.getItem(LS_SYNC_TIME) || '0';
  }

  function setLocalSyncTime(time) {
    localStorage.setItem(LS_SYNC_TIME, time);
  }

  function hasMerged() {
    return localStorage.getItem(LS_MERGED) === 'true';
  }

  function setMerged() {
    localStorage.setItem(LS_MERGED, 'true');
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

  function markDeleted(key, id) {
    if (!id) return;
    var deleted = loadDeleted(key);
    deleted[id] = new Date().toISOString();
    saveDeleted(key, deleted);
  }

  function filterDeleted(data) {
    var deletedCats = loadDeleted(LS_DELETED_CATEGORIES);
    var deletedBms = loadDeleted(LS_DELETED_BOOKMARKS);
    return {
      categories: data.categories.filter(function (cat) {
        return !deletedCats[cat.id];
      }),
      bookmarks: data.bookmarks.filter(function (bm) {
        return !deletedBms[bm.id] && !deletedCats[bm.category_id];
      })
    };
  }

  async function flushPendingDeletes(remoteData) {
    var deletedCats = loadDeleted(LS_DELETED_CATEGORIES);
    var deletedBms = loadDeleted(LS_DELETED_BOOKMARKS);
    var filteredRemote = filterDeleted(remoteData);

    if (!NavDB.isLoggedIn()) return filteredRemote;

    var bmIds = Object.keys(deletedBms);
    for (var i = 0; i < bmIds.length; i++) {
      try {
        await NavDB.deleteBookmark(bmIds[i]);
        delete deletedBms[bmIds[i]];
      } catch (e) {
        console.warn('云端删除书签失败，保留下次重试:', e.message);
      }
    }

    var catIds = Object.keys(deletedCats);
    for (var j = 0; j < catIds.length; j++) {
      try {
        await NavDB.deleteCategory(catIds[j]);
        delete deletedCats[catIds[j]];
      } catch (e2) {
        console.warn('云端删除分类失败，保留下次重试:', e2.message);
      }
    }

    saveDeleted(LS_DELETED_BOOKMARKS, deletedBms);
    saveDeleted(LS_DELETED_CATEGORIES, deletedCats);
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

  /* ---- 初始化默认数据 ---- */

  function initDefaultData() {
    var existing = loadLocal();
    if (existing.categories.length > 0) return existing;

    var cats = [];
    var bms = [];

    DEFAULT_DATA.forEach(function (def, ci) {
      var catId = def.id || uuid();
      cats.push({
        id: catId,
        name: def.name,
        sort_order: ci,
        updated_at: null, // 不设置时间戳，作为“未改动默认数据”的标记
        _local: true
      });
      def.bookmarks.forEach(function (bm, bi) {
        bms.push({
          id: bm.id || uuid(),
          category_id: catId,
          name: bm.name,
          url: bm.url,
          description: bm.description,
          sort_order: bi,
          updated_at: null,
          _local: true
        });
      });
    });

    var data = { categories: cats, bookmarks: bms };
    saveLocal(data);
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

    return { categories: uniqueCats, bookmarks: uniqueBms };
  }

  /* ---- 合并策略：时间戳对比，最后写入胜出 ---- */

  function mergeData(localData, remoteData) {
    var mergedCats = [];
    var mergedBms = [];

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

    return { categories: mergedCats, bookmarks: mergedBms };
  }

  /* ---- 核心同步流程 ---- */

  async function syncOnLogin() {
    if (!NavDB.isLoggedIn()) return loadLocal();

    var localData = loadLocal();
    var remoteData = await NavDB.fetchAll();
    remoteData = await flushPendingDeletes(remoteData);

    // 在合并之前，如果本地数据全是默认且未被改过，直接用云端数据覆盖
    var isLocalDefaultOnly = localData.categories.length > 0 && localData.categories.every(function (c) {
      return c.id.startsWith('def-cat-') && !c.updated_at;
    });

    if (isLocalDefaultOnly) {
      localData = { categories: [], bookmarks: [] };
    }

    // 远端无数据 → 把本地推上去
    if (remoteData.categories.length === 0 && remoteData.bookmarks.length === 0) {
      if (localData.categories.length > 0) {
        await NavDB.pushAll(localData.categories, localData.bookmarks);
      }
      setMerged();
      setLocalSyncTime(new Date().toISOString());
      return localData;
    }

    // 本地无数据 (或被识别为纯粹的未改动默认数据) → 拉远端
    if (localData.categories.length === 0 && localData.bookmarks.length === 0) {
      // 拉取远端时也做一次去重保护，清理历史遗留重复
      var dedupedRemote = deduplicate(remoteData);
      saveLocal(dedupedRemote);
      setMerged();
      setLocalSyncTime(new Date().toISOString());
      return dedupedRemote;
    }

    // 两边都有 → 合并 & 终极去重
    var merged = deduplicate(mergeData(localData, remoteData));
    saveLocal(merged);
    await NavDB.pushAll(merged.categories, merged.bookmarks);
    setMerged();
    setLocalSyncTime(new Date().toISOString());
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
    pushCategoryAsync(cat);
    return cat;
  }

  function updateCategoryLocal(id, updates) {
    var data = loadLocal();
    var cat = data.categories.find(function (c) { return c.id === id; });
    if (!cat) return null;
    Object.keys(updates).forEach(function (k) { cat[k] = updates[k]; });
    cat.updated_at = new Date().toISOString();
    saveLocal(data);
    pushCategoryAsync(cat);
    return cat;
  }

  function deleteCategoryLocal(id) {
    var data = loadLocal();
    markDeleted(LS_DELETED_CATEGORIES, id);
    data.bookmarks.forEach(function (b) {
      if (b.category_id === id) markDeleted(LS_DELETED_BOOKMARKS, b.id);
    });
    data.categories = data.categories.filter(function (c) { return c.id !== id; });
    data.bookmarks = data.bookmarks.filter(function (b) { return b.category_id !== id; });
    saveLocal(data);
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
    pushBookmarkAsync(bm);
    return bm;
  }

  function updateBookmarkLocal(id, updates) {
    var data = loadLocal();
    var bm = data.bookmarks.find(function (b) { return b.id === id; });
    if (!bm) return null;
    Object.keys(updates).forEach(function (k) { bm[k] = updates[k]; });
    bm.updated_at = new Date().toISOString();
    saveLocal(data);
    pushBookmarkAsync(bm);
    return bm;
  }

  function deleteBookmarkLocal(id) {
    var data = loadLocal();
    markDeleted(LS_DELETED_BOOKMARKS, id);
    data.bookmarks = data.bookmarks.filter(function (b) { return b.id !== id; });
    saveLocal(data);
    deleteBookmarkAsync(id);
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

  /* ---- 登出清理 ---- */

  function resetMergeState() {
    localStorage.removeItem(LS_MERGED);
    localStorage.removeItem(LS_SYNC_TIME);
  }

  return {
    loadLocal: loadLocal,
    saveLocal: saveLocal,
    initDefaultData: initDefaultData,
    syncOnLogin: syncOnLogin,
    addCategoryLocal: addCategoryLocal,
    updateCategoryLocal: updateCategoryLocal,
    deleteCategoryLocal: deleteCategoryLocal,
    addBookmarkLocal: addBookmarkLocal,
    updateBookmarkLocal: updateBookmarkLocal,
    deleteBookmarkLocal: deleteBookmarkLocal,
    resetMergeState: resetMergeState,
    uuid: uuid
  };
})();
