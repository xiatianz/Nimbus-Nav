(function () {
  'use strict';

  /* ====== State ====== */
  var categories = [];
  var bookmarks = [];
  var currentUser = null;
  var currentEngine = { url: 'https://www.baidu.com/s?wd=' };
  var editingBookmarkId = null;
  var editingCategoryId = null;

  /* ====== DOM refs ====== */
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return document.querySelectorAll(sel); };

  var searchInput, searchBtn, engineTags;
  var categoriesContainer;
  var loginBtn, authModal, authFormView, resetView;
  var userMenu, userAvatar, userAvatarBtn, userName, syncDot;
  var userDropdown, syncBtn, logoutBtn;
  var bookmarkModal, categoryModal;
  var toastContainer;

  /* ====== Init ====== */
  async function init() {
    cacheDom();
    bindEvents();

    // 初始化默认数据（首次使用）
    NavSync.initDefaultData();
    var local = NavSync.loadLocal();
    categories = local.categories;
    bookmarks = local.bookmarks;
    renderAll();

    // 初始化 Supabase 并监听认证状态（含 INITIAL_SESSION）
    NavDB.init();
    NavDB.onAuthChange(function (event, user) {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && user) {
        if (currentUser && currentUser.id === user.id) return; // 避免重复处理
        handleLoggedIn(user);
      } else if (event === 'SIGNED_OUT') {
        handleLoggedOut();
      }
    });

    // 主题
    initTheme();
    // 时钟
    initClock();
  }

  function cacheDom() {
    searchInput = $('#searchInput');
    searchBtn = $('#searchBtn');
    engineTags = $$('.engine-tag');
    categoriesContainer = $('#categoriesContainer');
    loginBtn = $('#loginBtn');
    authModal = $('#authModal');
    authFormView = $('#authFormView');
    resetView = $('#resetView');
    userMenu = $('#userMenu');
    userAvatar = $('#userAvatar');
    userAvatarBtn = $('#userAvatarBtn');
    userName = $('#userName');
    syncDot = $('#syncDot');
    userDropdown = $('#userDropdown');
    syncBtn = $('#syncBtn');
    logoutBtn = $('#logoutBtn');
    bookmarkModal = $('#bookmarkModal');
    categoryModal = $('#categoryModal');
    toastContainer = $('#toastContainer');
  }

  /* ====== Auth handlers ====== */

  async function handleLoggedIn(user) {
    currentUser = user;
    loginBtn.style.display = 'none';
    userMenu.style.display = '';
    closeAuthModal();
    userAvatar.src = user.user_metadata.avatar_url || '';
    userName.textContent = user.user_metadata.preferred_username || user.user_metadata.name || user.email || '用户';

    showToast('正在同步数据…');
    try {
      var data = await NavSync.syncOnLogin();
      categories = data.categories;
      bookmarks = data.bookmarks;
      renderAll();
      showToast('同步完成', 'success');
      syncDot.className = 'sync-dot';
    } catch (e) {
      console.error('同步失败:', e);
      showToast('同步失败，使用本地数据', 'error');
      syncDot.className = 'sync-dot error';
    }
  }

  function handleLoggedOut() {
    currentUser = null;
    loginBtn.style.display = '';
    userMenu.style.display = 'none';
    userDropdown.classList.remove('open');
    NavSync.resetMergeState();
    showToast('已退出登录');
  }

  /* ====== Rendering ====== */

  function renderAll() {
    categoriesContainer.innerHTML = '';
    var sortedCats = categories.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    sortedCats.forEach(function (cat, i) {
      var section = renderCategory(cat, i);
      categoriesContainer.appendChild(section);
    });

    // 添加分类按钮
    var addCatWrap = document.createElement('div');
    addCatWrap.style.textAlign = 'center';
    addCatWrap.style.marginTop = '16px';
    var addCatBtn = document.createElement('button');
    addCatBtn.className = 'add-category-btn';
    addCatBtn.innerHTML = '➕ 添加分类';
    addCatBtn.addEventListener('click', function () { openCategoryModal(); });
    addCatWrap.appendChild(addCatBtn);
    categoriesContainer.appendChild(addCatWrap);
  }

  function renderCategory(cat, index) {
    var section = document.createElement('section');
    section.className = 'category';
    section.dataset.catId = cat.id;
    section.style.animationDelay = (index * 0.05) + 's';

    // Header
    var header = document.createElement('div');
    header.className = 'category-header';

    var title = document.createElement('h2');
    title.className = 'category-title';
    title.textContent = cat.name;

    var actions = document.createElement('div');
    actions.className = 'category-actions';

    var editBtn = document.createElement('button');
    editBtn.className = 'cat-action-btn';
    editBtn.innerHTML = '✏️';
    editBtn.title = '编辑分类';
    editBtn.addEventListener('click', function () { openCategoryModal(cat); });
    actions.appendChild(editBtn);

    header.appendChild(title);
    header.appendChild(actions);
    section.appendChild(header);

    // Card grid
    var grid = document.createElement('div');
    grid.className = 'card-grid';

    var catBookmarks = bookmarks.filter(function (b) {
      return b.category_id === cat.id;
    }).sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    catBookmarks.forEach(function (bm) {
      grid.appendChild(renderBookmarkCard(bm));
    });

    // 添加书签按钮
    var addBtn = document.createElement('button');
    addBtn.className = 'card card-add';
    addBtn.innerHTML = '<div class="card-icon emoji">➕</div><div class="card-title">添加</div><div class="card-desc">新增书签</div>';
    addBtn.addEventListener('click', function () { openBookmarkModal(cat.id); });
    grid.appendChild(addBtn);

    section.appendChild(grid);
    return section;
  }

  function renderBookmarkCard(bm) {
    var a = document.createElement('a');
    a.className = 'card';
    a.href = bm.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = bm.name + (bm.description ? ' - ' + bm.description : '');
    a.dataset.bmId = bm.id;

    // Icon
    var iconWrap = document.createElement('div');
    iconWrap.className = 'card-icon';
    var img = document.createElement('img');
    img.src = faviconUrl(bm.url);
    img.alt = '';
    img.onerror = function () {
      img.style.display = 'none';
      iconWrap.classList.add('emoji');
      iconWrap.textContent = '🔗';
    };
    iconWrap.appendChild(img);

    // Title
    var titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    titleEl.textContent = bm.name;

    // Desc
    var descEl = document.createElement('div');
    descEl.className = 'card-desc';
    descEl.textContent = bm.description || '';

    // Actions
    var actionsEl = document.createElement('div');
    actionsEl.className = 'card-actions';

    var editBtn = document.createElement('button');
    editBtn.className = 'card-action-btn';
    editBtn.innerHTML = '✏️';
    editBtn.title = '编辑';
    editBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openBookmarkModal(null, bm);
    });

    var delBtn = document.createElement('button');
    delBtn.className = 'card-action-btn';
    delBtn.innerHTML = '✕';
    delBtn.title = '删除';
    delBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (confirm('确定删除「' + bm.name + '」？')) {
        NavSync.deleteBookmarkLocal(bm.id);
        bookmarks = bookmarks.filter(function (b) { return b.id !== bm.id; });
        renderAll();
        showToast('已删除「' + bm.name + '」');
      }
    });

    actionsEl.appendChild(editBtn);
    actionsEl.appendChild(delBtn);

    a.appendChild(iconWrap);
    a.appendChild(titleEl);
    a.appendChild(descEl);
    a.appendChild(actionsEl);

    return a;
  }

  /* ====== Search ====== */

  function performSearch() {
    var query = searchInput.value.trim();
    if (!query) return;

    if (/^https?:\/\//.test(query) || /\.(com|cn|org|net|io|dev|ai|app|co)\b/.test(query)) {
      var url = /^https?:\/\//.test(query) ? query : 'https://' + query;
      window.location.href = url;
    } else {
      window.location.href = currentEngine.url + encodeURIComponent(query);
    }
  }

  /* ====== Bookmark Modal ====== */

  function openBookmarkModal(categoryId, existingBm) {
    editingBookmarkId = existingBm ? existingBm.id : null;
    var titleEl = $('#bookmarkModalTitle');
    titleEl.textContent = existingBm ? '编辑书签' : '添加书签';

    // 填充分类下拉
    var select = $('#bmCategory');
    select.innerHTML = '';
    categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      select.appendChild(opt);
    });

    if (existingBm) {
      $('#bmName').value = existingBm.name;
      $('#bmUrl').value = existingBm.url;
      $('#bmDesc').value = existingBm.description || '';
      select.value = existingBm.category_id;
    } else {
      $('#bmName').value = '';
      $('#bmUrl').value = '';
      $('#bmDesc').value = '';
      if (categoryId) select.value = categoryId;
    }

    bookmarkModal.classList.add('active');
    setTimeout(function () { $('#bmName').focus(); }, 100);
  }

  function closeBookmarkModal() {
    bookmarkModal.classList.remove('active');
    editingBookmarkId = null;
  }

  function confirmBookmark() {
    var name = $('#bmName').value.trim();
    var url = $('#bmUrl').value.trim();
    var desc = $('#bmDesc').value.trim();
    var catId = $('#bmCategory').value;

    if (!name || !url) {
      showToast('请填写名称和网址', 'error');
      return;
    }

    if (!/^https?:\/\//.test(url)) {
      url = 'https://' + url;
    }

    if (editingBookmarkId) {
      var updated = NavSync.updateBookmarkLocal(editingBookmarkId, {
        name: name, url: url, description: desc, category_id: catId
      });
      if (updated) {
        var idx = bookmarks.findIndex(function (b) { return b.id === editingBookmarkId; });
        if (idx >= 0) bookmarks[idx] = updated;
      }
      showToast('书签已更新');
    } else {
      var newBm = NavSync.addBookmarkLocal({
        category_id: catId, name: name, url: url, description: desc
      });
      bookmarks.push(newBm);
      showToast('书签已添加');
    }

    renderAll();
    closeBookmarkModal();
  }

  /* ====== Category Modal ====== */

  function openCategoryModal(existingCat) {
    editingCategoryId = existingCat ? existingCat.id : null;
    var titleEl = $('#categoryModalTitle');
    titleEl.textContent = existingCat ? '编辑分类' : '添加分类';

    $('#catName').value = existingCat ? existingCat.name : '';

    var deleteBtn = $('#catDeleteBtn');
    if (existingCat) {
      deleteBtn.style.display = '';
    } else {
      deleteBtn.style.display = 'none';
    }

    categoryModal.classList.add('active');
    setTimeout(function () { $('#catName').focus(); }, 100);
  }

  function closeCategoryModal() {
    categoryModal.classList.remove('active');
    editingCategoryId = null;
  }

  function confirmCategory() {
    var name = $('#catName').value.trim();
    if (!name) {
      showToast('请填写分类名称', 'error');
      return;
    }

    if (editingCategoryId) {
      var updated = NavSync.updateCategoryLocal(editingCategoryId, { name: name });
      if (updated) {
        var idx = categories.findIndex(function (c) { return c.id === editingCategoryId; });
        if (idx >= 0) categories[idx] = updated;
      }
      showToast('分类已更新');
    } else {
      var newCat = NavSync.addCategoryLocal(name);
      categories.push(newCat);
      showToast('分类已添加');
    }

    renderAll();
    closeCategoryModal();
  }

  function deleteCategory() {
    if (!editingCategoryId) return;
    var cat = categories.find(function (c) { return c.id === editingCategoryId; });
    var bmCount = bookmarks.filter(function (b) { return b.category_id === editingCategoryId; }).length;
    var msg = '确定删除分类「' + (cat ? cat.name : '') + '」？';
    if (bmCount > 0) msg += '\n该分类下有 ' + bmCount + ' 个书签将一并删除。';

    if (confirm(msg)) {
      NavSync.deleteCategoryLocal(editingCategoryId);
      categories = categories.filter(function (c) { return c.id !== editingCategoryId; });
      bookmarks = bookmarks.filter(function (b) { return b.category_id !== editingCategoryId; });
      renderAll();
      showToast('分类已删除');
      closeCategoryModal();
    }
  }

  /* ====== Unified Auth Modal ====== */

  function openAuthModal() {
    switchAuthTab('login');
    authFormView.style.display = '';
    resetView.style.display = 'none';
    $('#authEmail').value = '';
    $('#authPassword').value = '';

    // Check WebAuthn support
    var passkeyBtn = $('#passkeyBtn');
    if (!window.PublicKeyCredential) {
      passkeyBtn.style.display = 'none';
    } else {
      passkeyBtn.style.display = '';
    }

    authModal.classList.add('active');
    setTimeout(function () { $('#authEmail').focus(); }, 100);
  }

  function closeAuthModal() {
    authModal.classList.remove('active');
  }

  function switchAuthTab(mode) {
    var tabLogin = $('#tabLogin');
    var tabRegister = $('#tabRegister');
    var submitBtn = $('#authSubmitBtn');
    var forgotLink = $('#forgotLink');

    if (mode === 'register') {
      tabLogin.classList.remove('active');
      tabRegister.classList.add('active');
      submitBtn.textContent = '注册';
      forgotLink.style.display = 'none';
      $('#authPassword').setAttribute('autocomplete', 'new-password');
    } else {
      tabRegister.classList.remove('active');
      tabLogin.classList.add('active');
      submitBtn.textContent = '登录';
      forgotLink.style.display = '';
      $('#authPassword').setAttribute('autocomplete', 'current-password');
    }
  }

  function isRegisterMode() {
    return $('#tabRegister').classList.contains('active');
  }

  async function submitAuth() {
    var email = $('#authEmail').value.trim();
    var password = $('#authPassword').value;

    if (!email || !password) {
      showToast('请填写邮箱和密码', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('密码至少 6 位', 'error');
      return;
    }

    var submitBtn = $('#authSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '处理中…';

    try {
      if (isRegisterMode()) {
        var result = await NavDB.signUpWithEmail(email, password);
        if (result.session) {
          showToast('注册成功', 'success');
        } else {
          showToast('注册成功，请检查邮箱完成验证', 'success');
          closeAuthModal();
        }
      } else {
        await NavDB.signInWithEmail(email, password);
        showToast('登录成功', 'success');
      }
    } catch (e) {
      var msg = e.message || '操作失败';
      if (msg.indexOf('Invalid login credentials') >= 0) msg = '邮箱或密码错误';
      if (msg.indexOf('User already registered') >= 0) msg = '该邮箱已注册，请直接登录';
      showToast(msg, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = isRegisterMode() ? '注册' : '登录';
    }
  }

  function showResetView() {
    authFormView.style.display = 'none';
    resetView.style.display = '';
    var emailVal = $('#authEmail').value.trim();
    $('#resetEmail').value = emailVal;
    setTimeout(function () { $('#resetEmail').focus(); }, 100);
  }

  function showLoginView() {
    resetView.style.display = 'none';
    authFormView.style.display = '';
    switchAuthTab('login');
    setTimeout(function () { $('#authEmail').focus(); }, 100);
  }

  async function submitResetPassword() {
    var email = $('#resetEmail').value.trim();
    if (!email) {
      showToast('请填写邮箱', 'error');
      return;
    }

    var btn = $('#resetSubmitBtn');
    btn.disabled = true;
    btn.textContent = '发送中…';

    try {
      await NavDB.resetPassword(email);
      showToast('重置链接已发送，请检查邮箱', 'success');
      setTimeout(function () { showLoginView(); }, 1500);
    } catch (e) {
      showToast(e.message || '发送失败', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '发送重置链接';
    }
  }

  /* ====== Sync to Cloud ====== */

  async function manualSync() {
    if (!NavDB.isLoggedIn()) {
      showToast('请先登录', 'error');
      return;
    }

    syncDot.className = 'sync-dot syncing';
    showToast('正在同步…');
    try {
      var data = await NavSync.syncOnLogin();
      categories = data.categories;
      bookmarks = data.bookmarks;
      renderAll();
      syncDot.className = 'sync-dot';
      showToast('同步完成', 'success');
    } catch (e) {
      console.error('同步失败:', e);
      syncDot.className = 'sync-dot error';
      showToast('同步失败: ' + e.message, 'error');
    }
  }

  /* ====== Theme ====== */

  function initTheme() {
    var themeBtn = document.createElement('button');
    themeBtn.className = 'theme-toggle';
    themeBtn.title = '切换深色/浅色模式';
    themeBtn.textContent = '🌓';

    var isDark = localStorage.getItem('neumorph_dark') === 'true';
    if (isDark) document.body.classList.add('dark');

    themeBtn.addEventListener('click', function () {
      document.body.classList.toggle('dark');
      localStorage.setItem('neumorph_dark', document.body.classList.contains('dark'));
    });

    // 插入到 header-right 区域最前面
    var headerRight = $('#authArea');
    headerRight.insertBefore(themeBtn, headerRight.firstChild);
  }

  /* ====== Clock ====== */

  function initClock() {
    var clockEl = document.createElement('div');
    clockEl.className = 'footer-neumorph';
    clockEl.style.marginTop = '16px';
    clockEl.style.fontSize = '0.85rem';
    var footer = $('.footer');
    footer.appendChild(clockEl);

    function tick() {
      var now = new Date();
      var h = String(now.getHours()).padStart(2, '0');
      var m = String(now.getMinutes()).padStart(2, '0');
      var s = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = '🕐 ' + h + ':' + m + ':' + s;
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ====== Toast ====== */

  function showToast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    toastContainer.appendChild(el);

    setTimeout(function () {
      el.classList.add('toast-out');
      setTimeout(function () { el.remove(); }, 300);
    }, 2500);
  }

  /* ====== Helpers ====== */

  function getDomain(url) {
    try {
      return url.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  }

  function faviconUrl(url) {
    return 'https://www.google.com/s2/favicons?domain=' + getDomain(url) + '&sz=32';
  }

  /* ====== Events ====== */

  function bindEvents() {
    // Search
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') performSearch();
    });

    // Engine tabs
    engineTags.forEach(function (tag) {
      tag.addEventListener('click', function () {
        engineTags.forEach(function (t) { t.classList.remove('active'); });
        tag.classList.add('active');
        currentEngine.url = tag.getAttribute('data-url');
      });
    });

    // Auth - unified login button opens modal
    loginBtn.addEventListener('click', openAuthModal);

    // Auth modal - tabs
    $('#tabLogin').addEventListener('click', function () { switchAuthTab('login'); });
    $('#tabRegister').addEventListener('click', function () { switchAuthTab('register'); });

    // Auth modal - submit
    $('#authSubmitBtn').addEventListener('click', submitAuth);
    $('#authPassword').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitAuth();
    });

    // Auth modal - GitHub
    $('#githubBtn').addEventListener('click', function () {
      NavDB.signInWithGitHub().catch(function (e) {
        showToast('登录失败: ' + e.message, 'error');
      });
    });

    // Auth modal - Passkey
    $('#passkeyBtn').addEventListener('click', async function () {
      var btn = this;
      btn.disabled = true;
      btn.querySelector('span').textContent = '验证中…';

      // 设置 60 秒超时
      var timeoutId;
      var timeoutPromise = new Promise(function (_, reject) {
        timeoutId = setTimeout(function () {
          reject(new Error('TimeoutError'));
        }, 60000);
      });

      try {
        await Promise.race([
          NavDB.signInWithPasskey(),
          timeoutPromise
        ]);
        clearTimeout(timeoutId);
        showToast('Passkey 登录成功', 'success');
      } catch (e) {
        clearTimeout(timeoutId);
        var msg = e.message || 'Passkey 登录失败';
        if (msg.indexOf('NotAllowedError') >= 0 || msg.indexOf('cancelled') >= 0) {
          msg = 'Passkey 验证已取消';
        } else if (msg.indexOf('TimeoutError') >= 0) {
          msg = '验证超时，请检查设备或确认已注册 Passkey';
        } else if (msg.indexOf('not supported') >= 0 || msg.indexOf('WebAuthn') >= 0) {
          msg = '当前浏览器或环境不支持 Passkey';
        } else if (msg.indexOf('InvalidStateError') >= 0 || msg.indexOf('credential') >= 0) {
          msg = '未找到已注册的 Passkey，请先使用邮箱登录';
        }
        showToast(msg, 'error');
      } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Passkey 登录';
      }
    });

    // Auth modal - forgot password
    $('#forgotLink').addEventListener('click', function () { showResetView(); });
    $('#resetSubmitBtn').addEventListener('click', submitResetPassword);
    $('#backToLogin').addEventListener('click', function () { showLoginView(); });
    $('#resetEmail').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitResetPassword();
    });

    // Auth modal - close
    authModal.addEventListener('click', function (e) {
      if (e.target === authModal) closeAuthModal();
    });

    userAvatarBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      userDropdown.classList.toggle('open');
    });

    document.addEventListener('click', function (e) {
      if (!userMenu.contains(e.target)) {
        userDropdown.classList.remove('open');
      }
    });

    syncBtn.addEventListener('click', function () {
      userDropdown.classList.remove('open');
      manualSync();
    });

    // Register Passkey
    $('#registerPasskeyBtn').addEventListener('click', async function () {
      userDropdown.classList.remove('open');
      try {
        await NavDB.registerPasskey();
        showToast('Passkey 注册成功，下次可用指纹/面容登录', 'success');
      } catch (e) {
        var msg = e.message || 'Passkey 注册失败';
        if (msg.indexOf('NotAllowedError') >= 0 || msg.indexOf('cancelled') >= 0) {
          msg = 'Passkey 注册已取消';
        } else if (msg.indexOf('already registered') >= 0 || msg.indexOf('exists') >= 0) {
          msg = '该设备已注册 Passkey';
        }
        showToast(msg, 'error');
      }
    });

    logoutBtn.addEventListener('click', async function () {
      userDropdown.classList.remove('open');
      try {
        await NavDB.signOut();
      } catch (e) {
        showToast('退出失败', 'error');
      }
    });

    // Bookmark modal
    $('#bmCancelBtn').addEventListener('click', closeBookmarkModal);
    $('#bmConfirmBtn').addEventListener('click', confirmBookmark);
    bookmarkModal.addEventListener('click', function (e) {
      if (e.target === bookmarkModal) closeBookmarkModal();
    });
    $('#bmUrl').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') confirmBookmark();
    });
    $('#bmDesc').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') confirmBookmark();
    });
    $('#bmName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('#bmUrl').focus();
    });

    // Category modal
    $('#catCancelBtn').addEventListener('click', closeCategoryModal);
    $('#catConfirmBtn').addEventListener('click', confirmCategory);
    $('#catDeleteBtn').addEventListener('click', deleteCategory);
    categoryModal.addEventListener('click', function (e) {
      if (e.target === categoryModal) closeCategoryModal();
    });
    $('#catName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') confirmCategory();
    });

    // Escape to close modals
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (bookmarkModal.classList.contains('active')) closeBookmarkModal();
        if (categoryModal.classList.contains('active')) closeCategoryModal();
        if (authModal.classList.contains('active')) closeAuthModal();
        userDropdown.classList.remove('open');
      }
    });
  }

  /* ====== Start ====== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
