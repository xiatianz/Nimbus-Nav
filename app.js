(function () {
  'use strict';

  /* ====== State ====== */
  var categories = [];
  var bookmarks = [];
  var currentUser = null;
  var currentEngine = { url: 'https://www.baidu.com/s?wd=' };
  var editingBookmarkId = null;
  var editingCategoryId = null;
  var confirmCallback = null;
  var hasRenderedOnce = false;
  var searchSuggestions = [];
  var selectedSuggestionIndex = -1;
  var visitStats = {};
  var openMode = 'new';
  var draggedBookmarkId = null;
  var draggedCategoryId = null;

  var LS_VISIT_STATS = 'nav_visit_stats';
  var LS_OPEN_MODE = 'nav_open_mode';

  /* ====== DOM refs ====== */
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return document.querySelectorAll(sel); };

  var searchInput, searchBtn, searchSuggestionsEl, engineTags;
  var categoriesContainer;
  var loginBtn, authModal, authFormView, resetView, confirmView;
  var openModeBtn;
  var userMenu, userAvatar, userAvatarBtn, userName, syncDot;
  var userDropdown, logoutBtn;
  var bookmarkModal, categoryModal;
  var confirmModal, confirmMessage, confirmOkBtn, confirmCancelBtn;
  var passkeyModal, passkeyListEl;
  var toastContainer;

  /* ====== Init ====== */
  async function init() {
    cacheDom();
    bindEvents();

    // 加载本地数据并立即渲染（避免空白闪烁）
    NavSync.initDefaultData();
    var local = NavSync.loadLocal();
    categories = local.categories;
    bookmarks = local.bookmarks;
    visitStats = loadVisitStats();
    openMode = localStorage.getItem(LS_OPEN_MODE) || 'new';
    updateOpenModeButtons();
    renderAll();

    // 初始化 Supabase
    NavDB.init();

    // 监听认证状态变化
    NavDB.onAuthChange(function (event, user) {
      if (event === 'PASSWORD_RECOVERY') {
        setTimeout(function() {
          openUpdatePasswordView();
        }, 500);
      } else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && user) {
        if (currentUser && currentUser.id === user.id) return;
        handleLoggedIn(user);
      } else if (event === 'SIGNED_OUT') {
        handleLoggedOut();
      }
    });

    // 处理邮箱验证回跳 / OAuth 回调
    var rawHash = window.location.hash;
    var rawSearch = window.location.search;
    var paramStr = rawHash ? rawHash.substring(1) : (rawSearch ? rawSearch.substring(1) : '');

    if (paramStr) {
      var params = new URLSearchParams(paramStr);
      var code = params.get('code');
      var accessToken = params.get('access_token');
      var refreshToken = params.get('refresh_token');

      if (code) {
        try {
          await NavDB.exchangeCodeForSession(code);
          // 在 PKCE 流程中如果 URL 中有 type=recovery 或 recovery_code，显式调起弹窗
          if (paramStr.indexOf('type=recovery') >= 0 || params.get('type') === 'recovery') {
            setTimeout(function() {
              openUpdatePasswordView();
            }, 500);
          }
        } catch (e) {
          console.error('Code exchange 失败:', e);
        }
      } else if (accessToken && refreshToken) {
        // Implicit 流程：token 直接在 URL 里，手动建立 session
        try {
          await NavDB.setSession(accessToken, refreshToken);
          
          // 如果是密码重置回跳
          if (params.get('type') === 'recovery') {
            setTimeout(function() {
              openUpdatePasswordView();
            }, 500);
          }
        } catch (e) {
          console.error('Set session 失败:', e);
        }
      }

      // 清除 URL 中的 auth 参数
      window.history.replaceState(null, '', window.location.pathname);
    }

    // 获取当前 session
    var user = await NavDB.getSession();
    if (user) {
      handleLoggedIn(user);
    }

    // 主题
    initTheme();
    // 时钟
    initClock();
  }

  function cacheDom() {
    searchInput = $('#searchInput');
    searchBtn = $('#searchBtn');
    searchSuggestionsEl = $('#searchSuggestions');
    engineTags = $$('.engine-tag');
    categoriesContainer = $('#categoriesContainer');
    openModeBtn = $('#openModeBtn');
    loginBtn = $('#loginBtn');
    authModal = $('#authModal');
    authFormView = $('#authFormView');
    resetView = $('#resetView');
    confirmView = $('#confirmView');
    userMenu = $('#userMenu');
    userAvatar = $('#userAvatar');
    userAvatarBtn = $('#userAvatarBtn');
    userName = $('#userName');
    syncDot = $('#syncDot');
    userDropdown = $('#userDropdown');
    logoutBtn = $('#logoutBtn');
    bookmarkModal = $('#bookmarkModal');
    categoryModal = $('#categoryModal');
    confirmModal = $('#confirmModal');
    confirmMessage = $('#confirmMessage');
    confirmOkBtn = $('#confirmOkBtn');
    confirmCancelBtn = $('#confirmCancelBtn');
    passkeyModal = $('#passkeyModal');
    passkeyListEl = $('#passkeyList');
    toastContainer = $('#toastContainer');
  }

  /* ====== Auth handlers ====== */

  async function handleLoggedIn(user) {
    currentUser = user;
    loginBtn.style.display = 'none';
    userMenu.style.display = '';
    
    // 如果正在修改密码界面，不要关闭弹窗
    var pwdView = document.querySelector('#updatePasswordView');
    if (!pwdView || pwdView.style.display === 'none') {
      closeAuthModal();
    }
    
    syncDot.className = 'sync-dot syncing';

    var metadata = user.user_metadata || {};
    var avatarUrl = metadata.avatar_url;
    if (avatarUrl) {
      userAvatar.src = avatarUrl;
      userAvatar.style.display = '';
    } else {
      var name = metadata.preferred_username || metadata.name || user.email || 'U';
      var initial = name.charAt(0).toUpperCase();
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36">'
        + '<rect width="36" height="36" rx="18" fill="#3b82f6"/>'
        + '<text x="18" y="24" text-anchor="middle" fill="#fff" font-size="16" font-weight="600" font-family="sans-serif">' + initial + '</text>'
        + '</svg>';
      userAvatar.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
    }
    userName.textContent = metadata.preferred_username || metadata.name || user.email || '用户';

    try {
      var data = await NavSync.syncOnLogin();
      categories = data.categories;
      bookmarks = data.bookmarks;
      renderAll();
      syncDot.className = 'sync-dot';
    } catch (e) {
      console.error('同步失败:', e);
      syncDot.className = 'sync-dot error';
      showToast('同步失败，请检查网络', 'error');
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
    var animate = !hasRenderedOnce;
    categoriesContainer.classList.toggle('categories-stable', !animate);
    categoriesContainer.innerHTML = '';
    var sortedCats = categories.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    sortedCats.forEach(function (cat, i) {
      var section = renderCategory(cat, i, animate);
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
    hasRenderedOnce = true;
    applyCardSearchState(searchInput ? searchInput.value.trim() : '');
  }

  function renderCategory(cat, index, animate) {
    var section = document.createElement('section');
    section.className = 'category';
    section.dataset.catId = cat.id;
    if (animate) {
      section.style.animationDelay = (index * 0.05) + 's';
    } else {
      section.classList.add('no-animation');
    }

    // Header
    var header = document.createElement('div');
    header.className = 'category-header';
    header.draggable = true;
    header.title = '拖拽调整分类顺序';
    header.addEventListener('dragstart', function (e) {
      draggedCategoryId = cat.id;
      e.dataTransfer.effectAllowed = 'move';
      section.classList.add('dragging');
    });
    header.addEventListener('dragend', function () {
      draggedCategoryId = null;
      section.classList.remove('dragging');
    });
    header.addEventListener('dragover', function (e) {
      if (draggedCategoryId && draggedCategoryId !== cat.id) e.preventDefault();
    });
    header.addEventListener('drop', function (e) {
      if (!draggedCategoryId || draggedCategoryId === cat.id) return;
      e.preventDefault();
      moveCategory(draggedCategoryId, cat.id);
    });

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
    grid.dataset.catId = cat.id;
    grid.addEventListener('dragover', function (e) {
      if (draggedBookmarkId) e.preventDefault();
    });
    grid.addEventListener('drop', function (e) {
      if (!draggedBookmarkId) return;
      e.preventDefault();
      moveBookmark(draggedBookmarkId, null, cat.id);
    });

    var catBookmarks = bookmarks.filter(function (b) {
      return b.category_id === cat.id;
    }).sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    catBookmarks.forEach(function (bm) {
      grid.appendChild(renderBookmarkCard(bm));
    });

    if (catBookmarks.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'category-empty';
      empty.textContent = '这个分类还没有书签';
      grid.appendChild(empty);
    }

    // 添加书签按钮
    var addBtn = document.createElement('button');
    addBtn.className = 'card card-add';
    addBtn.innerHTML = '<div class="card-icon emoji">➕</div><div class="card-title">添加</div><div class="card-desc">新增书签</div>';
    addBtn.addEventListener('click', function () { openBookmarkModal(cat.id); });
    grid.appendChild(addBtn);

    section.appendChild(grid);
    return section;
  }

  function renderBookmarkCard(bm, options) {
    options = options || {};
    var a = document.createElement('a');
    a.className = 'card' + (options.recent ? ' card-recent' : '');
    a.href = bm.url;
    a.target = openMode === 'current' ? '_self' : '_blank';
    if (openMode !== 'current') a.rel = 'noopener';
    a.title = bm.name + (bm.description ? ' - ' + bm.description : '');
    a.dataset.bmId = bm.id;
    a.dataset.name = bm.name || '';
    a.dataset.domain = NavBookmarks.getDomain(bm.url);
    a.dataset.description = bm.description || '';
    a.draggable = !options.readonly;
    a.addEventListener('click', function () {
      recordBookmarkVisit(bm.id);
    });
    if (!options.readonly) {
      a.addEventListener('dragstart', function (e) {
        draggedBookmarkId = bm.id;
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        a.classList.add('dragging');
      });
      a.addEventListener('dragend', function () {
        draggedBookmarkId = null;
        a.classList.remove('dragging');
      });
      a.addEventListener('dragover', function (e) {
        if (draggedBookmarkId && draggedBookmarkId !== bm.id) e.preventDefault();
      });
      a.addEventListener('drop', function (e) {
        if (!draggedBookmarkId || draggedBookmarkId === bm.id) return;
        e.preventDefault();
        e.stopPropagation();
        moveBookmark(draggedBookmarkId, bm.id, bm.category_id);
      });
    }

    // Icon
    var iconWrap = document.createElement('div');
    iconWrap.className = 'card-icon';
    var fallback = document.createElement('span');
    fallback.className = 'card-icon-fallback';
    fallback.textContent = NavBookmarks.getBookmarkInitial(bm);
    var img = document.createElement('img');
    img.src = faviconUrl(bm.url);
    img.alt = '';
    img.style.display = 'none';
    img.onload = function () {
      fallback.style.display = 'none';
      img.style.display = 'block';
    };
    img.onerror = function () {
      img.style.display = 'none';
      fallback.style.display = '';
    };
    iconWrap.appendChild(fallback);
    iconWrap.appendChild(img);

    // Title
    var titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    titleEl.textContent = bm.name;

    // Desc
    var descEl = document.createElement('div');
    descEl.className = 'card-desc';
    descEl.textContent = bm.description || '';

    if (!options.readonly) {
      // Actions
      var actionsEl = document.createElement('div');
      actionsEl.className = 'card-actions';

      var editBtn = document.createElement('button');
      editBtn.className = 'card-action-btn';
      editBtn.innerHTML = '✎';
      editBtn.title = '编辑';
      editBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openBookmarkModal(null, bm);
      });

      var delBtn = document.createElement('button');
      delBtn.className = 'card-action-btn danger';
      delBtn.innerHTML = '×';
      delBtn.title = '删除';
      delBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        showConfirmDialog('确定删除「' + bm.name + '」？', async function () {
          NavSync.deleteBookmarkLocal(bm.id);
          bookmarks = bookmarks.filter(function (b) { return b.id !== bm.id; });
          renderAll();
          showToast('已删除「' + bm.name + '」');
        });
      });

      actionsEl.appendChild(editBtn);
      actionsEl.appendChild(delBtn);
      a.appendChild(actionsEl);
    }

    a.appendChild(iconWrap);
    a.appendChild(titleEl);
    a.appendChild(descEl);

    return a;
  }

  /* ====== Custom Confirm Dialog ====== */

  function showConfirmDialog(msg, onConfirm) {
    confirmMessage.textContent = msg;
    confirmCallback = onConfirm;
    document.body.appendChild(confirmModal);
    confirmModal.classList.add('active');
    confirmOkBtn.focus();
  }

  function closeConfirmModal() {
    confirmModal.classList.remove('active');
    confirmCallback = null;
  }

  function passConfirmCallback() {
    var cb = confirmCallback;
    closeConfirmModal();
    if (cb) cb();
  }

  /* ====== Search ====== */

  function performSearch() {
    var query = searchInput.value.trim();
    if (!query) return;

    if (searchSuggestions.length > 0 && selectedSuggestionIndex >= 0) {
      openSearchSuggestion(searchSuggestions[selectedSuggestionIndex]);
      return;
    }

    openSearchSuggestion(NavSearch.getDirectAction(query, currentEngine.url));
  }

  function updateSearchSuggestions() {
    var query = searchInput.value.trim();
    searchSuggestions = NavSearch.buildSuggestions(query, bookmarks, currentEngine.url);
    selectedSuggestionIndex = searchSuggestions.length > 0 ? 0 : -1;
    applyCardSearchState(query);
    renderSearchSuggestions();
  }

  function renderSearchSuggestions() {
    if (!searchSuggestions.length) {
      closeSearchSuggestions();
      return;
    }

    searchSuggestionsEl.innerHTML = '';
    searchSuggestions.forEach(function (suggestion, index) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'search-suggestion' + (index === selectedSuggestionIndex ? ' active' : '');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', index === selectedSuggestionIndex ? 'true' : 'false');
      item.dataset.index = String(index);

      var icon = document.createElement('span');
      icon.className = 'search-suggestion-icon';
      icon.textContent = suggestion.type === 'bookmark' ? '↗' : (suggestion.type === 'url' ? '⌘' : '⌕');

      var copy = document.createElement('span');
      copy.className = 'search-suggestion-copy';
      var title = document.createElement('span');
      title.className = 'search-suggestion-title';
      title.textContent = suggestion.type === 'bookmark' ? suggestion.title : suggestion.label;
      var subtitle = document.createElement('span');
      subtitle.className = 'search-suggestion-subtitle';
      subtitle.textContent = suggestion.type === 'bookmark' ? suggestion.subtitle : suggestion.title;
      copy.appendChild(title);
      copy.appendChild(subtitle);

      item.appendChild(icon);
      item.appendChild(copy);
      item.addEventListener('mouseenter', function () {
        selectedSuggestionIndex = index;
        renderSearchSuggestions();
      });
      item.addEventListener('mousedown', function (e) {
        e.preventDefault();
        openSearchSuggestion(suggestion);
      });

      searchSuggestionsEl.appendChild(item);
    });
    searchSuggestionsEl.hidden = false;
  }

  function closeSearchSuggestions() {
    searchSuggestions = [];
    selectedSuggestionIndex = -1;
    searchSuggestionsEl.innerHTML = '';
    searchSuggestionsEl.hidden = true;
    if (!searchInput.value.trim()) applyCardSearchState('');
  }

  function moveSearchSelection(delta) {
    if (!searchSuggestions.length) return;
    selectedSuggestionIndex = (selectedSuggestionIndex + delta + searchSuggestions.length) % searchSuggestions.length;
    renderSearchSuggestions();
  }

  function openSearchSuggestion(suggestion) {
    if (!suggestion || !suggestion.url) return;
    window.location.href = suggestion.url;
  }

  function applyCardSearchState(query) {
    var value = (query || '').trim().toLowerCase();
    var cards = $$('.card[data-bm-id]');
    if (!value) {
      cards.forEach(function (card) {
        card.classList.remove('card-search-match', 'card-search-dim');
      });
      return;
    }
    cards.forEach(function (card) {
      var haystack = [
        card.dataset.name,
        card.dataset.domain,
        card.dataset.description
      ].join(' ').toLowerCase();
      var match = haystack.indexOf(value) >= 0;
      card.classList.toggle('card-search-match', match);
      card.classList.toggle('card-search-dim', !match);
    });
  }

  function loadVisitStats() {
    try {
      return JSON.parse(localStorage.getItem(LS_VISIT_STATS) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function saveVisitStats() {
    localStorage.setItem(LS_VISIT_STATS, JSON.stringify(visitStats));
  }

  function recordBookmarkVisit(id) {
    if (!id) return;
    var stat = visitStats[id] || { count: 0, lastVisitedAt: 0 };
    stat.count += 1;
    stat.lastVisitedAt = Date.now();
    visitStats[id] = stat;
    saveVisitStats();
  }

  function setOpenMode(mode) {
    openMode = mode === 'current' ? 'current' : 'new';
    localStorage.setItem(LS_OPEN_MODE, openMode);
    updateOpenModeButtons();
    renderAll();
  }

  function updateOpenModeButtons() {
    if (!openModeBtn) return;
    var isCurrent = openMode === 'current';
    var label = isCurrent ? '打开方式：当前页' : '打开方式：新标签';
    openModeBtn.classList.toggle('is-current', isCurrent);
    openModeBtn.title = label;
    openModeBtn.setAttribute('aria-label', label);
    openModeBtn.innerHTML = isCurrent
      ? '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M9 9h6v6H9z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
  }

  function moveCategory(sourceId, targetId) {
    var sorted = categories.slice().sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    var sourceIndex = sorted.findIndex(function (cat) { return cat.id === sourceId; });
    var targetIndex = sorted.findIndex(function (cat) { return cat.id === targetId; });
    if (sourceIndex < 0 || targetIndex < 0) return;
    var moved = sorted.splice(sourceIndex, 1)[0];
    sorted.splice(targetIndex, 0, moved);
    sorted.forEach(function (cat, index) {
      cat.sort_order = index;
      NavSync.updateCategoryLocal(cat.id, { sort_order: index });
    });
    categories = sorted;
    renderAll();
  }

  function moveBookmark(sourceId, targetId, targetCategoryId) {
    var moving = bookmarks.find(function (bm) { return bm.id === sourceId; });
    if (!moving) return;

    var sourceCategoryId = moving.category_id;
    moving.category_id = targetCategoryId || moving.category_id;

    var siblings = bookmarks.filter(function (bm) {
      return bm.category_id === moving.category_id && bm.id !== moving.id;
    }).sort(function (a, b) {
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    var targetIndex = targetId ? siblings.findIndex(function (bm) { return bm.id === targetId; }) : siblings.length;
    if (targetIndex < 0) targetIndex = siblings.length;
    siblings.splice(targetIndex, 0, moving);

    siblings.forEach(function (bm, index) {
      bm.sort_order = index;
      NavSync.updateBookmarkLocal(bm.id, {
        category_id: bm.category_id,
        sort_order: index
      });
    });

    if (sourceCategoryId !== moving.category_id) {
      bookmarks.filter(function (bm) {
        return bm.category_id === sourceCategoryId;
      }).sort(function (a, b) {
        return (a.sort_order || 0) - (b.sort_order || 0);
      }).forEach(function (bm, index) {
        bm.sort_order = index;
        NavSync.updateBookmarkLocal(bm.id, { sort_order: index });
      });
    }

    renderAll();
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
    var catId = editingCategoryId;
    var cat = categories.find(function (c) { return c.id === editingCategoryId; });
    var bmCount = bookmarks.filter(function (b) { return b.category_id === editingCategoryId; }).length;
    var msg = '确定删除分类「' + (cat ? cat.name : '') + '」？';
    if (bmCount > 0) msg += '\n该分类下有 ' + bmCount + ' 个书签将一并删除。';

    closeCategoryModal();
    showConfirmDialog(msg, async function () {
      NavSync.deleteCategoryLocal(catId);
      categories = categories.filter(function (c) { return c.id !== catId; });
      bookmarks = bookmarks.filter(function (b) { return b.category_id !== catId; });
      renderAll();
      showToast('分类已删除');
    });
  }

  /* ====== Unified Auth Modal ====== */

  function openAuthModal() {
    switchAuthTab('login');
    authFormView.style.display = '';
    resetView.style.display = 'none';
    confirmView.style.display = 'none';
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
    var titleEl = $('#authTitle');
    var subtitleEl = $('#authSubtitle');

    if (mode === 'register') {
      tabLogin.classList.remove('active');
      tabRegister.classList.add('active');
      submitBtn.textContent = '注册';
      forgotLink.style.display = 'none';
      titleEl.textContent = '创建账号';
      subtitleEl.textContent = '保存书签并在设备之间同步';
      $('#authPassword').setAttribute('autocomplete', 'new-password');
    } else {
      tabRegister.classList.remove('active');
      tabLogin.classList.add('active');
      submitBtn.textContent = '登录';
      forgotLink.style.display = '';
      titleEl.textContent = '欢迎回来';
      subtitleEl.textContent = '同步你的私人导航和常用网站';
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
          showConfirmView(email);
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
    confirmView.style.display = 'none';
    authFormView.style.display = '';
    switchAuthTab('login');
    setTimeout(function () { $('#authEmail').focus(); }, 100);
  }

  function showConfirmView(email) {
    authFormView.style.display = 'none';
    resetView.style.display = 'none';
    if ($('#updatePasswordView')) $('#updatePasswordView').style.display = 'none';
    confirmView.style.display = '';
    $('#confirmEmail').textContent = email;
  }

  function openUpdatePasswordView() {
    authFormView.style.display = 'none';
    resetView.style.display = 'none';
    confirmView.style.display = 'none';
    if ($('#updatePasswordView')) $('#updatePasswordView').style.display = '';
    authModal.classList.add('active');
    setTimeout(function () { if ($('#updatePasswordInput')) $('#updatePasswordInput').focus(); }, 100);
  }

  async function submitUpdatePassword() {
    var pwdInput = $('#updatePasswordInput');
    if (!pwdInput) return;
    var newPassword = pwdInput.value;
    
    if (newPassword.length < 6) {
      showToast('新密码至少 6 位', 'error');
      return;
    }

    var btn = $('#updatePasswordBtn');
    btn.disabled = true;
    btn.textContent = '修改中…';

    try {
      await NavDB.updateUser({ password: newPassword });
      showToast('密码已成功修改', 'success');
      setTimeout(function () {
        closeAuthModal();
        pwdInput.value = '';
      }, 1000);
    } catch (e) {
      showToast('密码修改失败: ' + (e.message || ''), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '确认修改';
    }
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

  /* ====== Passkey Management ====== */

  function openPasskeyModal() {
    userDropdown.classList.remove('open');
    passkeyModal.classList.add('active');
    loadPasskeyList();
  }

  function closePasskeyModal() {
    passkeyModal.classList.remove('active');
  }

  async function loadPasskeyList() {
    passkeyListEl.innerHTML = '<p class="passkey-loading">加载中…</p>';

    try {
      var result = null;
      // 尝试使用 listPasskeys API
      if (typeof NavDB.listPasskeys === 'function') {
        result = await NavDB.listPasskeys();
      } else {
        // 尝试通过 getIdentities 获取 passkey 信息
        var identities = await NavDB.getIdentities();
        if (identities && identities.data && identities.data.identities) {
          result = { data: { credentials: identities.data.identities.filter(function (id) {
            return id.provider === 'webauthn' || id.provider === 'passkey';
          })}};
        }
      }

      var credentials = [];
      if (Array.isArray(result)) {
        credentials = result;
      } else if (result && Array.isArray(result.credentials)) {
        credentials = result.credentials;
      } else if (result && result.data && Array.isArray(result.data.credentials)) {
        credentials = result.data.credentials;
      } else if (result && result.data && Array.isArray(result.data)) {
        credentials = result.data;
      }

      if (!Array.isArray(credentials) || credentials.length === 0) {
        passkeyListEl.innerHTML = '<p class="passkey-empty">暂无通行密匙</p><p class="passkey-empty-hint">点击下方按钮添加通行密匙，实现无密码登录</p>';
        return;
      }

      var html = '';
      credentials.forEach(function (cred, i) {
        var name = cred.friendly_name || cred.name || ('通行密匙 ' + (i + 1));
        var createdAt = cred.created_at ? new Date(cred.created_at).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : '未知日期';
        html += '<div class="passkey-item" data-cred-id="' + (cred.id || '') + '">'
          + '<div class="passkey-item-info">'
          + '<div class="passkey-item-name">' + escapeHtml(name) + '</div>'
          + '<div class="passkey-item-date">创建于 ' + createdAt + '</div>'
          + '</div>'
          + '<div class="passkey-item-actions">'
          + '<button class="passkey-rename-btn" data-cred-id="' + (cred.id || '') + '" data-name="' + escapeHtml(name) + '">改名</button>'
          + '<button class="passkey-delete-btn" data-cred-id="' + (cred.id || '') + '" data-name="' + escapeHtml(name) + '">删除</button>'
          + '</div>'
          + '</div>';
      });
      passkeyListEl.innerHTML = html;

      // 绑定事件
      passkeyListEl.querySelectorAll('.passkey-rename-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { renamePasskey(btn.dataset.credId, btn.dataset.name); });
      });
      passkeyListEl.querySelectorAll('.passkey-delete-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var credId = btn.dataset.credId;
          var credName = btn.dataset.name;
          showConfirmDialog('确定删除通行密匙「' + credName + '」？', function () {
            deletePasskey(credId);
          });
        });
      });
    } catch (e) {
      passkeyListEl.innerHTML = '<p class="passkey-empty">加载失败：' + escapeHtml(e.message || '未知错误') + '</p>';
    }
  }

  async function registerNewPasskey() {
    var btn = $('#addPasskeyBtn');
    btn.disabled = true;
    btn.textContent = '创建中…';
    try {
      await NavDB.registerPasskey();
      showToast('通行密匙已添加', 'success');
      loadPasskeyList();
    } catch (e) {
      var msg = e.message || '通行密匙添加失败';
      if (msg.indexOf('NotAllowedError') >= 0 || msg.indexOf('cancelled') >= 0) {
        msg = '通行密匙添加已取消';
      } else if (msg.indexOf('already registered') >= 0 || msg.indexOf('exists') >= 0) {
        msg = '该设备已添加通行密匙';
      }
      showToast(msg, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '添加通行密匙';
    }
  }

  async function renamePasskey(credId, currentName) {
    var newName = prompt('修改通行密匙名称：', currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;

    try {
      // 尝试使用 updatePasskey API
      if (typeof NavDB.updatePasskey === 'function') {
        await NavDB.updatePasskey(credId, { friendly_name: newName.trim() });
        showToast('名称已更新', 'success');
        loadPasskeyList();
      } else {
        showToast('当前环境不支持修改通行密匙名称', 'error');
      }
    } catch (e) {
      showToast('修改失败: ' + (e.message || ''), 'error');
    }
  }

  async function deletePasskey(credId) {
    try {
      if (typeof NavDB.deletePasskey === 'function') {
        await NavDB.deletePasskey(credId);
        showToast('通行密匙已删除', 'success');
        loadPasskeyList();
      } else {
        showToast('当前环境不支持删除通行密匙', 'error');
      }
    } catch (e) {
      showToast('删除失败: ' + (e.message || ''), 'error');
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
    var clockEl = document.createElement('span');
    clockEl.id = 'footerClock';
    clockEl.style.fontSize = '0.72rem';
    clockEl.style.color = 'var(--text-light)';
    var footerBottom = $('.footer-bottom');
    footerBottom.insertBefore(clockEl, footerBottom.firstChild);

    function tick() {
      var now = new Date();
      var h = String(now.getHours()).padStart(2, '0');
      var m = String(now.getMinutes()).padStart(2, '0');
      var s = String(now.getSeconds()).padStart(2, '0');
      clockEl.textContent = h + ':' + m + ':' + s;
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

  /* ====== Dropdown Identity Check ====== */

  async function updateDropdownVisibility() {
    var bindGithubBtn = $('#bindGithubBtn');
    var bindEmailBtn = $('#bindEmailBtn');
    var userEmailEl = $('#userEmail');

    try {
      var result = await NavDB.getIdentities();
      var identities = (result && result.data && result.data.identities) || [];
      var providers = getCurrentProviders(identities);
      var hasGithub = providers.github;
      var hasEmail = providers.email;

      if (userEmailEl) userEmailEl.textContent = currentUser && currentUser.email ? currentUser.email : '已登录';
      setAccountActionState(bindGithubBtn, hasGithub, 'GitHub 已绑定', '连接 GitHub 后可直接使用 GitHub 登录', '绑定 GitHub', '跳转 GitHub 完成授权绑定');
      setAccountActionState(bindEmailBtn, hasEmail, '邮箱已绑定', currentUser && currentUser.email ? currentUser.email : '已可使用邮箱登录', '绑定邮箱', '为当前账号添加邮箱密码登录');
    } catch (e) {
      // fallback: 通过 app_metadata 判断
      var fallbackProviders = getCurrentProviders([]);
      if (userEmailEl) userEmailEl.textContent = currentUser && currentUser.email ? currentUser.email : '已登录';
      setAccountActionState(bindGithubBtn, fallbackProviders.github, 'GitHub 已绑定', '连接 GitHub 后可直接使用 GitHub 登录', '绑定 GitHub', '跳转 GitHub 完成授权绑定');
      setAccountActionState(bindEmailBtn, fallbackProviders.email, '邮箱已绑定', currentUser && currentUser.email ? currentUser.email : '已可使用邮箱登录', '绑定邮箱', '为当前账号添加邮箱密码登录');
    }
  }

  function getCurrentProviders(identities) {
    var providers = {};
    (identities || []).forEach(function (identity) {
      if (identity.provider) providers[identity.provider] = true;
    });
    if (currentUser && currentUser.app_metadata) {
      if (currentUser.app_metadata.provider) providers[currentUser.app_metadata.provider] = true;
      (currentUser.app_metadata.providers || []).forEach(function (provider) {
        providers[provider] = true;
      });
    }
    if (!providers.email && currentUser && currentUser.email && currentUser.app_metadata && currentUser.app_metadata.provider === 'email') {
      providers.email = true;
    }
    return providers;
  }

  function setAccountActionState(button, connected, title, desc, actionTitle, actionDesc) {
    button.disabled = connected;
    button.classList.toggle('is-connected', connected);
    var titleEl = button.querySelector('.dropdown-item-title');
    var descEl = button.querySelector('.dropdown-item-desc');
    var statusEl = button.querySelector('.dropdown-status');
    if (titleEl) titleEl.textContent = connected ? title : actionTitle;
    if (descEl) descEl.textContent = connected ? desc : actionDesc;
    if (statusEl) statusEl.textContent = connected ? '已连接' : '去绑定';
  }

  /* ====== Events ====== */

  function bindEvents() {
    // Search
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('input', updateSearchSuggestions);
    searchInput.addEventListener('focus', updateSearchSuggestions);
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSearchSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSearchSelection(-1);
      } else if (e.key === 'Escape') {
        closeSearchSuggestions();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        performSearch();
      }
    });

    // Engine tabs
    engineTags.forEach(function (tag) {
      tag.addEventListener('click', function () {
        engineTags.forEach(function (t) { t.classList.remove('active'); });
        tag.classList.add('active');
        currentEngine.url = tag.getAttribute('data-url');
        updateSearchSuggestions();
      });
    });

    openModeBtn.addEventListener('click', function () {
      setOpenMode(openMode === 'current' ? 'new' : 'current');
    });

    document.addEventListener('click', function (e) {
      if (!searchSuggestionsEl.contains(e.target) && e.target !== searchInput && e.target !== searchBtn) {
        closeSearchSuggestions();
      }
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
        showToast('通行密匙登录成功', 'success');
      } catch (e) {
        clearTimeout(timeoutId);
        var msg = e.message || '通行密匙登录失败';
        if (msg.indexOf('NotAllowedError') >= 0 || msg.indexOf('cancelled') >= 0) {
          msg = '通行密匙验证已取消';
        } else if (msg.indexOf('TimeoutError') >= 0) {
          msg = '验证超时。没有通行密匙时，请先创建账号并在头像菜单中添加。';
        } else if (msg.indexOf('not supported') >= 0 || msg.indexOf('WebAuthn') >= 0) {
          msg = '当前浏览器或环境不支持通行密匙';
        } else if (msg.indexOf('InvalidStateError') >= 0 || msg.indexOf('credential') >= 0 || msg.indexOf('not_found') >= 0) {
          msg = '还没有可用通行密匙。请先创建账号，登录后在头像菜单中添加通行密匙。';
        }
        showToast(msg, 'error');
      } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = '通行密匙登录';
      }
    });

    // Auth modal - forgot password / update password
    $('#forgotLink').addEventListener('click', function () { showResetView(); });
    $('#resetSubmitBtn').addEventListener('click', submitResetPassword);
    $('#backToLogin').addEventListener('click', function () { showLoginView(); });
    $('#confirmCloseBtn').addEventListener('click', closeAuthModal);
    if ($('#updatePasswordBtn')) $('#updatePasswordBtn').addEventListener('click', submitUpdatePassword);
    
    if ($('#updatePasswordInput')) {
      $('#updatePasswordInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitUpdatePassword();
      });
    }

    $('#resetEmail').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitResetPassword();
    });

    // Auth modal - close
    authModal.addEventListener('click', function (e) {
      if (e.target === authModal) closeAuthModal();
    });

    // Avatar button - toggle dropdown + identity check
    userAvatarBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = userDropdown.classList.contains('open');
      userDropdown.classList.toggle('open');
      if (!wasOpen) {
        updateDropdownVisibility();
      }
    });

    document.addEventListener('click', function (e) {
      if (!userMenu.contains(e.target)) {
        userDropdown.classList.remove('open');
      }
    });

    // 通行密匙管理（打开管理页面）
    $('#registerPasskeyBtn').addEventListener('click', function () {
      openPasskeyModal();
    });

    // 通行密匙弹窗事件
    $('#addPasskeyBtn').addEventListener('click', registerNewPasskey);
    $('#passkeyCloseBtn').addEventListener('click', closePasskeyModal);
    passkeyModal.addEventListener('click', function (e) {
      if (e.target === passkeyModal) closePasskeyModal();
    });

    // 绑定 GitHub（增加超时检测）
    $('#bindGithubBtn').addEventListener('click', async function () {
      if (this.disabled) return;
      userDropdown.classList.remove('open');
      showToast('正在跳转 GitHub…');
      try {
        var timeoutId = setTimeout(function () {
          showToast('如果页面没有跳转，请检查弹窗拦截设置', 'error');
        }, 3000);
        await NavDB.linkIdentity('github');
        clearTimeout(timeoutId);
      } catch (e) {
        showToast('绑定 GitHub 失败: ' + e.message, 'error');
      }
    });

    // 绑定邮箱
    $('#bindEmailBtn').addEventListener('click', async function () {
      if (this.disabled) return;
      userDropdown.classList.remove('open');
      var hasEmail = currentUser && currentUser.email && currentUser.app_metadata && currentUser.app_metadata.provider === 'email';

      if (hasEmail) {
        showToast('当前已绑定邮箱：' + currentUser.email, 'info');
        return;
      }

      // GitHub 用户绑定邮箱 + 设置密码
      var newEmail = prompt('请输入要绑定的邮箱地址：');
      if (!newEmail || !newEmail.trim()) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
        showToast('邮箱格式不正确', 'error');
        return;
      }

      var newPassword = prompt('设置登录密码（至少 6 位，用于邮箱登录）：');
      if (!newPassword || newPassword.length < 6) {
        if (newPassword) showToast('密码至少 6 位', 'error');
        return;
      }

      try {
        await NavDB.updateUser({ email: newEmail.trim(), password: newPassword });
        showToast('邮箱绑定成功，今后可用邮箱+密码登录', 'success');
      } catch (e) {
        var msg = e.message || '绑定失败';
        if (msg.indexOf('already registered') >= 0) msg = '该邮箱已被其他账号使用';
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

    // Custom confirm modal
    confirmOkBtn.addEventListener('click', passConfirmCallback);
    confirmCancelBtn.addEventListener('click', closeConfirmModal);
    confirmModal.addEventListener('click', function (e) {
      if (e.target === confirmModal) closeConfirmModal();
    });

    // Escape to close modals
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (confirmModal.classList.contains('active')) closeConfirmModal();
        if (passkeyModal.classList.contains('active')) closePasskeyModal();
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
