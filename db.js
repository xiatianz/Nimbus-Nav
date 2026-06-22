/* ====== db.js — Supabase 客户端封装 ====== */
var NavDB = (function () {
  var client = null;
  var currentUser = null;

  function init() {
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        experimental: {
          passkey: true
        }
      }
    });
    return client;
  }

  function getClient() {
    if (!client) init();
    return client;
  }

  /* ---- 认证 ---- */

  async function getSession() {
    var sb = getClient();
    var _ref = await sb.auth.getSession(), data = _ref.data;
    currentUser = data.session ? data.session.user : null;
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
  }

  async function signUpWithEmail(email, password) {
    var sb = getClient();
    var _ref = await sb.auth.signUp({ email: email, password: password });
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

  async function registerPasskey() {
    var sb = getClient();
    var _ref = await sb.auth.registerPasskey();
    if (_ref.error) throw _ref.error;
    return _ref.data;
  }

  async function signInWithPasskey() {
    var sb = getClient();
    var _ref = await sb.auth.signInWithPasskey();
    if (_ref.error) throw _ref.error;
    return _ref.data;
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
    await sb.from('categories').upsert(rows, { onConflict: 'id' });
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
    return _ref.data;
  }

  async function updateCategory(id, updates) {
    if (!isLoggedIn()) return;
    var sb = getClient();
    await sb.from('categories').update(updates).eq('id', id).eq('user_id', currentUser.id);
  }

  async function deleteCategory(id) {
    if (!isLoggedIn()) return;
    var sb = getClient();
    await sb.from('categories').delete().eq('id', id).eq('user_id', currentUser.id);
  }

  /* ---- 书签 CRUD ---- */

  async function fetchBookmarks() {
    if (!isLoggedIn()) return [];
    var sb = getClient();
    var _ref = await sb.from('bookmarks')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('sort_order', { ascending: true });
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
    await sb.from('bookmarks').upsert(rows, { onConflict: 'id' });
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
    return _ref.data;
  }

  async function updateBookmark(id, updates) {
    if (!isLoggedIn()) return;
    var sb = getClient();
    await sb.from('bookmarks').update(updates).eq('id', id).eq('user_id', currentUser.id);
  }

  async function deleteBookmark(id) {
    if (!isLoggedIn()) return;
    var sb = getClient();
    await sb.from('bookmarks').delete().eq('id', id).eq('user_id', currentUser.id);
  }

  /* ---- 批量操作 ---- */

  async function fetchAll() {
    var cats = await fetchCategories();
    var bms = await fetchBookmarks();
    return { categories: cats, bookmarks: bms };
  }

  async function pushAll(cats, bms) {
    await upsertCategories(cats);
    await upsertBookmarks(bms);
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
    pushAll: pushAll
  };
})();
