# Search Engine Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to drag-and-drop sort, add, edit, and delete their search engines with cloud synchronization through Supabase.

**Architecture:** 
1. Database: Supabase table `search_engines` handles persistence with RLS.
2. Default State: `config.js` provides default engines for first-time sync.
3. Sync & DB layer: Read and write search engines via `NavDB` and merge them efficiently in `NavSync`.
4. UI: Instead of hardcoded tags, `app.js` dynamically renders engines, supports drag-and-drop sorting, and exposes a modal to add/edit/delete engines matching the bookmark category UI.

**Tech Stack:** Vanilla JS, Supabase JS Client, HTML/CSS.

---

### Task 1: Initialize Default Data and State
**Files:**
- Modify: `config.js`
- Modify: `app.js`

- [ ] **Step 1: Add default search engines to `config.js`**
Modify `config.js` to include a `DEFAULT_SEARCH_ENGINES` array.
```javascript
var DEFAULT_SEARCH_ENGINES = [
  { id: 'def-se-1', name: '百度', url: 'https://www.baidu.com/s?wd=', sort_order: 0 },
  { id: 'def-se-2', name: 'Google', url: 'https://www.google.com/search?q=', sort_order: 1 },
  { id: 'def-se-3', name: 'Bing', url: 'https://www.bing.com/search?q=', sort_order: 2 },
  { id: 'def-se-4', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', sort_order: 3 }
];
```

- [ ] **Step 2: Initialize global state in `app.js`**
Modify `app.js` to include `searchEngines` and `currentEngine` state initialization.
```javascript
  var bookmarks = [];
  var categories = [];
  var searchEngines = [];
  var currentEngine = null; // Will be set after loading
```

- [ ] **Step 3: Commit**
```bash
git add config.js app.js
git commit -m "feat: init search engines default config and state"
```

---

### Task 2: Database and Sync Layer
**Files:**
- Modify: `db.js`
- Modify: `sync.js`

- [ ] **Step 1: Update `NavDB` to support `search_engines` CRUD**
In `db.js`, add queries for `search_engines` similar to `categories`.
```javascript
    // Fetch
    var _ref3 = await sb.from('search_engines')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('sort_order', { ascending: true });
    var engines = dataOrThrow(_ref3) || [];
    return { categories: cats, bookmarks: bms, searchEngines: engines };

    // Push (Upsert array)
    if (data.searchEngines && data.searchEngines.length > 0) {
      var engineRows = data.searchEngines.map(function(e, i) {
        return {
          id: e.id,
          user_id: currentUser.id,
          name: e.name,
          url: e.url,
          sort_order: i,
          updated_at: new Date().toISOString()
        };
      });
      dataOrThrow(await sb.from('search_engines').upsert(engineRows, { onConflict: 'id' }));
    }
```

- [ ] **Step 2: Update `NavSync` Local Storage schema**
In `sync.js`, update `loadLocal` to also load engines, falling back to `DEFAULT_SEARCH_ENGINES`.
```javascript
  var LS_SEARCH_ENGINES = 'nav_search_engines';

  function loadLocal() {
    var c = localStorage.getItem(LS_CATEGORIES);
    var b = localStorage.getItem(LS_BOOKMARKS);
    var e = localStorage.getItem(LS_SEARCH_ENGINES);
    return {
      categories: c ? JSON.parse(c) : [],
      bookmarks: b ? JSON.parse(b) : [],
      searchEngines: e ? JSON.parse(e) : []
    };
  }

  function saveLocal(data) {
    if (data.categories) localStorage.setItem(LS_CATEGORIES, JSON.stringify(data.categories));
    if (data.bookmarks) localStorage.setItem(LS_BOOKMARKS, JSON.stringify(data.bookmarks));
    if (data.searchEngines) localStorage.setItem(LS_SEARCH_ENGINES, JSON.stringify(data.searchEngines));
  }
```

- [ ] **Step 3: Update `NavSync` merge logic**
Ensure `mergeData` and empty remote defaults sync `searchEngines` as well.
```javascript
    if (localData.searchEngines.length === 0 && def.searchEngines) {
      def.searchEngines.forEach(function (e, ei) {
        localData.searchEngines.push({
          id: e.id + '-' + Date.now() + '-' + ei,
          name: e.name,
          url: e.url,
          sort_order: ei,
          updated_at: new Date().toISOString()
        });
      });
    }
    // Deep merge for searchEngines using updated_at similar to categories
```

- [ ] **Step 4: Commit**
```bash
git add db.js sync.js
git commit -m "feat: add search engines db queries and sync logic"
```

---

### Task 3: Render Search Engines dynamically
**Files:**
- Modify: `index.html`
- Modify: `app.js`

- [ ] **Step 1: Clean up `index.html`**
Remove hardcoded `<span class="engine-tag">` elements. Add a container.
```html
      <div class="search-engines" id="searchEnginesContainer">
        <!-- Rendered dynamically -->
      </div>
```

- [ ] **Step 2: Create `renderSearchEngines` in `app.js`**
```javascript
  function renderSearchEngines() {
    var container = $('#searchEnginesContainer');
    if (!container) return;
    container.innerHTML = '';
    
    // Sort array
    searchEngines.sort(function(a, b) { return a.sort_order - b.sort_order; });
    if (!currentEngine && searchEngines.length > 0) {
      currentEngine = searchEngines[0];
    }
    
    searchEngines.forEach(function(engine) {
      var tag = document.createElement('span');
      tag.className = 'engine-tag';
      if (currentEngine && currentEngine.id === engine.id) {
        tag.classList.add('active');
      }
      tag.textContent = engine.name;
      tag.setAttribute('data-id', engine.id);
      tag.setAttribute('data-url', engine.url);
      
      tag.addEventListener('click', function () {
        document.querySelectorAll('.engine-tag').forEach(function (t) { t.classList.remove('active'); });
        tag.classList.add('active');
        currentEngine = engine;
        updateSearchSuggestions();
      });
      
      container.appendChild(tag);
    });
  }
```

- [ ] **Step 3: Call `renderSearchEngines` on init**
Modify `init()` and data loaded callbacks to assign `searchEngines = data.searchEngines || [];` and `renderSearchEngines();`.

- [ ] **Step 4: Commit**
```bash
git add index.html app.js
git commit -m "feat: render search engines dynamically from state"
```

---

### Task 4: UI Edit Modal for Search Engines
**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `app.js`

- [ ] **Step 1: Add HTML for Engine Modal**
```html
  <div class="modal-overlay" id="engineModal">
    <div class="modal-content">
      <h3 class="modal-title" id="engineModalTitle">添加引擎</h3>
      <div class="form-group">
        <label>名称</label>
        <input type="text" id="engineName" class="form-input" placeholder="例如：Google">
      </div>
      <div class="form-group">
        <label>搜索URL (包含查询参数)</label>
        <input type="text" id="engineUrl" class="form-input" placeholder="例如：https://google.com/search?q=">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="engineDeleteBtn" style="display:none; color: var(--danger)">删除</button>
        <div style="flex:1"></div>
        <button class="btn btn-secondary" id="engineCancelBtn">取消</button>
        <button class="btn btn-primary" id="engineSaveBtn">保存</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Add Add/Edit Button to Engine Container**
In `renderSearchEngines`, append a final button to add engines.
```javascript
    var addBtn = document.createElement('span');
    addBtn.className = 'engine-tag add-engine-btn';
    addBtn.innerHTML = '⚙️';
    addBtn.title = '添加/编辑引擎';
    addBtn.addEventListener('click', function() {
       openEngineModal(null);
    });
    container.appendChild(addBtn);
```

- [ ] **Step 3: Implement Engine Modal Logic**
Create `openEngineModal(engine)`, `saveEngine()`, and context menu/double click to edit existing tag.
```javascript
      // Inside renderSearchEngines loop:
      tag.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        openEngineModal(engine);
      });
```
Add validation and trigger `NavSync.requestSync()` and `renderSearchEngines()` after saving.

- [ ] **Step 4: Commit**
```bash
git add index.html style.css app.js
git commit -m "feat: add modal to add, edit, and delete search engines"
```

---

### Task 5: Drag and Drop Sorting for Search Engines
**Files:**
- Modify: `app.js`

- [ ] **Step 1: Make Engine Tags Draggable**
```javascript
      tag.draggable = true;
      tag.addEventListener('dragstart', function(e) {
        e.dataTransfer.effectAllowed = 'move';
        draggedEngineId = engine.id;
        tag.classList.add('dragging');
      });
      tag.addEventListener('dragend', function() {
        draggedEngineId = null;
        tag.classList.remove('dragging');
      });
      tag.addEventListener('dragover', function(e) {
        if (draggedEngineId && draggedEngineId !== engine.id) {
          e.preventDefault();
        }
      });
      tag.addEventListener('drop', function(e) {
        e.preventDefault();
        if (!draggedEngineId || draggedEngineId === engine.id) return;
        moveEngine(draggedEngineId, engine.id);
      });
```

- [ ] **Step 2: Implement `moveEngine`**
```javascript
  function moveEngine(sourceId, targetId) {
    var sourceIdx = searchEngines.findIndex(function(e) { return e.id === sourceId; });
    var targetIdx = searchEngines.findIndex(function(e) { return e.id === targetId; });
    if (sourceIdx < 0 || targetIdx < 0) return;
    
    var moving = searchEngines.splice(sourceIdx, 1)[0];
    searchEngines.splice(targetIdx, 0, moving);
    
    searchEngines.forEach(function(e, i) {
      e.sort_order = i;
      e.updated_at = new Date().toISOString();
    });
    
    NavSync.saveLocal({ searchEngines: searchEngines });
    NavSync.requestSync();
    renderSearchEngines();
  }
```

- [ ] **Step 3: Commit**
```bash
git add app.js
git commit -m "feat: implement drag and drop sorting for search engines"
```
