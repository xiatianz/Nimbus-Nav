/* ====== db.js — Supabase 客户端封装 ====== */
var NavDB = (function () {
  var client = null;
  var currentUser = null;
  var sessionAbortController = null;

  function init() {
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: 'implicit',
        experimental: {
          passkey: true
        }
      },
      realtime: {
        enabled: false
      }
    });
    return client;
  }

  function getClient() {
    if (!client) init();
    return client;
  }

  function dataOrThrow(response) {
    if (response && response.error) throw response.error;
    return response ? response.data : null;
  }

  function redirectIfNeeded(data) {
    if (data && data.url) {
      window.location.href = data.url;
    }
  }

  /* ---- 认证 ---- */

  async function getSession() {
    var sb = getClient();
    // 取消上一次未完成的 session 请求，避免 fetch 挂起导致 spinner 不停止
    if (sessionAbortController) {
      sessionAbortController.abort();
    }
    sessionAbortController = new AbortController();
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 4000); });
    var fetchPromise = sb.auth.getSession().then(function (r) { return r; });
    // 超时时主动 abort 底层 fetch，释放浏览器 pending 请求
    var raceResult = await Promise.race([
      fetchPromise,
      timeout.then(function () {
        sessionAbortController.abort();
        return null;
      })
    ]);
    sessionAbortController = null;
    if (!raceResult || !raceResult.data) {
      currentUser = null;
      return null;
    }
    currentUser = raceResult.data.session ? raceResult.data.session.user : null;
    return currentUser;
  }

  async function signInWithGitHub() {
    var sb = getClient();
    var _ref = await sb.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    if (_ref.error) {
      console.error('GitHub 登录失败:', _ref.error.message);
      throw _ref.error;
    }
    redirectIfNeeded(_ref.data);
  }

  async function signUpWithEmail(email, password) {
    var sb = getClient();
    var _ref = await sb.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname
      }
    });
    if (_ref.error) throw _ref.error;
    return _ref.data;
  }

  async function signInWithEmail(email, password) {
    var sb = getClient();
    var _ref = await sb.auth.signInWithPassword({ email: email, password: password });
    if (_ref.error) throw _ref.error;
    return _ref.data;
  }

  async function signOut() {
    var sb = getClient();
    await sb.auth.signOut();
    currentUser = null;
  }

  async function resetPassword(email) {
    var sb = getClient();
    var _ref = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (_ref.error) throw _ref.error;
    return _ref.data;
  }

  // Supabase-js Beta 的通行密匙 API 位于 sb.auth.registerPasskey / signInWithPasskey / passkey.list|update|delete（>= 2.105）。
  // 下面封装仅针对官方 API，缺失时直接报错提示升级 supabase-js。
  function passkeyUnavailable(reason) {
    var err = new Error(reason || '当前 supabase-js 未启用通行密匙，请升级到 >= 2.105 并开启 experimental.passkey');
    err.code = 'passkey_disabled';
    return err;
  }

  async function registerPasskey() {
    var sb = getClient();
    if (typeof sb.auth.registerPasskey !== 'function') throw passkeyUnavailable();
    return dataOrThrow(await sb.auth.registerPasskey());
  }

  async function signInWithPasskey() {
    var sb = getClient();
    if (typeof sb.auth.signInWithPasskey !== 'function') throw passkeyUnavailable();
    return dataOrThrow(await sb.auth.signInWithPasskey());
  }

  async function listPasskeys() {
    var sb = getClient();
    if (!sb.auth.passkey || typeof sb.auth.passkey.list !== 'function') throw passkeyUnavailable();
    return dataOrThrow(await sb.auth.passkey.list());
  }

  async function deletePasskey(credentialId) {
    var sb = getClient();
    if (!sb.auth.passkey || typeof sb.auth.passkey.delete !== 'function') throw passkeyUnavailable();
    return dataOrThrow(await sb.auth.passkey.delete({ passkeyId: credentialId }));
  }

  async function updatePasskey(credentialId, data) {
    var sb = getClient();
    if (!sb.auth.passkey || typeof sb.auth.passkey.update !== 'function') throw passkeyUnavailable();
    var friendlyName = data.friendlyName || data.friendly_name;
    return dataOrThrow(await sb.auth.passkey.update({
      passkeyId: credentialId,
      friendlyName: friendlyName
    }));
  }

  async function exchangeCodeForSession(code) {
    var sb = getClient();
    var _ref = await sb.auth.exchangeCodeForSession(code);
    if (_ref.error) throw _ref.error;
    return _ref.data;
  }

  async function setSession(accessToken, refreshToken) {
    var sb = getClient();
    var _ref = await sb.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (_ref.error) throw _ref.error;
    return _ref.data;
  }

  async function linkIdentity(provider) {
    var sb = getClient();
    var _ref = await sb.auth.linkIdentity({
      provider: provider,
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    if (_ref.error) throw _ref.error;
    redirectIfNeeded(_ref.data);
    return _ref.data;
  }

  async function updateUser(data) {
    var sb = getClient();
    var _ref = await sb.auth.updateUser(data);
    if (_ref.error) throw _ref.error;
    return _ref.data;
  }

  function getIdentities() {
    var sb = getClient();
    return sb.auth.getUserIdentities();
  }

  function getUser() {
    return currentUser;
  }

  function isLoggedIn() {
    return !!currentUser;
  }

  function onAuthChange(callback) {
    var sb = getClient();
    sb.auth.onAuthStateChange(function (event, session) {
      currentUser = session ? session.user : null;
      callback(event, currentUser);
    });
  }

  /* ---- 分类 CRUD ---- */

  async function fetchCategories() {
    if (!isLoggedIn()) return [];
    var sb = getClient();
    var _ref = await sb.from('categories')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('sort_order', { ascending: true });
    if (_ref.error) throw _ref.error;
    return _ref.data || [];
  }

  async function upsertCategories(cats) {
    if (!isLoggedIn() || !cats.length) return;
    var sb = getClient();
    var rows = cats.map(function (c) {
      return {
        id: c.id,
        user_id: currentUser.id,
        name: c.name,
        sort_order: c.sort_order,
        updated_at: new Date().toISOString()
      };
    });
    dataOrThrow(await sb.from('categories').upsert(rows, { onConflict: 'id' }));
  }

  async function insertCategory(cat) {
    if (!isLoggedIn()) return null;
    var sb = getClient();
    var _ref = await sb.from('categories').insert({
      id: cat.id,
      user_id: currentUser.id,
      name: cat.name,
      sort_order: cat.sort_order
    }).select().single();
    return dataOrThrow(_ref);
  }

  async function updateCategory(id, updates) {
    if (!isLoggedIn()) return;
    var sb = getClient();
    dataOrThrow(await sb.from('categories').update(updates).eq('id', id).eq('user_id', currentUser.id));
  }

  async function deleteCategory(id) {
    if (!isLoggedIn()) return;
    var sb = getClient();
    dataOrThrow(await sb.from('categories').delete().eq('id', id).eq('user_id', currentUser.id));
  }

  /* ---- 书签 CRUD ---- */

  async function fetchBookmarks() {
    if (!isLoggedIn()) return [];
    var sb = getClient();
    var _ref = await sb.from('bookmarks')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('sort_order', { ascending: true });
    if (_ref.error) throw _ref.error;
    return _ref.data || [];
  }

  async function upsertBookmarks(bms) {
    if (!isLoggedIn() || !bms.length) return;
    var sb = getClient();
    var rows = bms.map(function (b) {
      return {
        id: b.id,
        user_id: currentUser.id,
        category_id: b.category_id,
        name: b.name,
        url: b.url,
        description: b.description || '',
        sort_order: b.sort_order,
        updated_at: new Date().toISOString()
      };
    });
    dataOrThrow(await sb.from('bookmarks').upsert(rows, { onConflict: 'id' }));
  }

  async function insertBookmark(bm) {
    if (!isLoggedIn()) return null;
    var sb = getClient();
    var _ref = await sb.from('bookmarks').insert({
      id: bm.id,
      user_id: currentUser.id,
      category_id: bm.category_id,
      name: bm.name,
      url: bm.url,
      description: bm.description || '',
      sort_order: bm.sort_order
    }).select().single();
    return dataOrThrow(_ref);
  }

  async function updateBookmark(id, updates) {
    if (!isLoggedIn()) return;
    var sb = getClient();
    dataOrThrow(await sb.from('bookmarks').update(updates).eq('id', id).eq('user_id', currentUser.id));
  }

  async function deleteBookmark(id) {
    if (!isLoggedIn()) return;
    var sb = getClient();
    dataOrThrow(await sb.from('bookmarks').delete().eq('id', id).eq('user_id', currentUser.id));
  }

  /* ---- 批量操作 ---- */

  async function fetchAll() {
    var cats = await fetchCategories();
    var bms = await fetchBookmarks();
    var sb = getClient();
    var _ref3 = await sb.from('search_engines')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('sort_order', { ascending: true });
    var engines = dataOrThrow(_ref3) || [];
    return { categories: cats, bookmarks: bms, searchEngines: engines };

  }

  async function upsertSearchEngines(engines) {
    if (!currentUser) return;
    if (!engines || engines.length === 0) return;
    var sb = getClient();
    var rows = engines.map(function(e, i) {
      return {
        id: e.id,
        user_id: currentUser.id,
        name: e.name,
        url: e.url,
        sort_order: i,
        updated_at: e.updated_at || new Date().toISOString()
      };
    });
    dataOrThrow(await sb.from('search_engines').upsert(rows, { onConflict: 'id' }));
  }

  async function deleteSearchEngine(id) {
    if (!isLoggedIn()) return;
    var sb = getClient();
    dataOrThrow(await sb.from('search_engines').delete().eq('id', id).eq('user_id', currentUser.id));
  }

  async function pushAll(cats, bms, engines) {
    await upsertCategories(cats);
    await upsertBookmarks(bms);
    await upsertSearchEngines(engines);

  }

  return {
    init: init,
    getClient: getClient,
    getSession: getSession,
    signInWithGitHub: signInWithGitHub,
    signUpWithEmail: signUpWithEmail,
    signInWithEmail: signInWithEmail,
    signOut: signOut,
    resetPassword: resetPassword,
    registerPasskey: registerPasskey,
    signInWithPasskey: signInWithPasskey,
    listPasskeys: listPasskeys,
    deletePasskey: deletePasskey,
    updatePasskey: updatePasskey,
    exchangeCodeForSession: exchangeCodeForSession,
    setSession: setSession,
    linkIdentity: linkIdentity,
    updateUser: updateUser,
    getIdentities: getIdentities,
    getUser: getUser,
    isLoggedIn: isLoggedIn,
    onAuthChange: onAuthChange,
    fetchCategories: fetchCategories,
    upsertCategories: upsertCategories,
    insertCategory: insertCategory,
    updateCategory: updateCategory,
    deleteCategory: deleteCategory,
    fetchBookmarks: fetchBookmarks,
    upsertBookmarks: upsertBookmarks,
    insertBookmark: insertBookmark,
    updateBookmark: updateBookmark,
    deleteBookmark: deleteBookmark,
    fetchAll: fetchAll,
    upsertSearchEngines: upsertSearchEngines,
    deleteSearchEngine: deleteSearchEngine,
    pushAll: pushAll
  };
})();
