-- ============================================
-- 拟态导航 Supabase Schema
-- 分类 + 书签，支持多用户 RLS
-- ============================================

-- 分类表
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_len CHECK (char_length(name) BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS idx_categories_user_sort ON categories(user_id, sort_order);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 书签表
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookmarks_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT bookmarks_url_len CHECK (char_length(url) BETWEEN 1 AND 2048),
  CONSTRAINT bookmarks_desc_len CHECK (char_length(coalesce(description, '')) <= 300)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_category ON bookmarks(user_id, category_id, sort_order);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- 搜索引擎表
CREATE TABLE IF NOT EXISTS search_engines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT search_engines_name_len CHECK (char_length(name) BETWEEN 1 AND 40),
  CONSTRAINT search_engines_url_len CHECK (char_length(url) BETWEEN 1 AND 2048)
);

CREATE INDEX IF NOT EXISTS idx_search_engines_user_sort ON search_engines(user_id, sort_order);

ALTER TABLE search_engines ENABLE ROW LEVEL SECURITY;

-- ========== RLS 策略 ==========

-- Categories: 用户只能操作自己的数据
DROP POLICY IF EXISTS "categories_select_own" ON categories;
CREATE POLICY "categories_select_own" ON categories
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "categories_insert_own" ON categories;
CREATE POLICY "categories_insert_own" ON categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "categories_update_own" ON categories;
CREATE POLICY "categories_update_own" ON categories
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "categories_delete_own" ON categories;
CREATE POLICY "categories_delete_own" ON categories
  FOR DELETE USING (auth.uid() = user_id);

-- Bookmarks: 用户只能操作自己的数据
DROP POLICY IF EXISTS "bookmarks_select_own" ON bookmarks;
CREATE POLICY "bookmarks_select_own" ON bookmarks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bookmarks_insert_own" ON bookmarks;
CREATE POLICY "bookmarks_insert_own" ON bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bookmarks_update_own" ON bookmarks;
CREATE POLICY "bookmarks_update_own" ON bookmarks
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bookmarks_delete_own" ON bookmarks;
CREATE POLICY "bookmarks_delete_own" ON bookmarks
  FOR DELETE USING (auth.uid() = user_id);

-- Search engines: 用户只能操作自己的数据
DROP POLICY IF EXISTS "search_engines_select_own" ON search_engines;
CREATE POLICY "search_engines_select_own" ON search_engines
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "search_engines_insert_own" ON search_engines;
CREATE POLICY "search_engines_insert_own" ON search_engines
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "search_engines_update_own" ON search_engines;
CREATE POLICY "search_engines_update_own" ON search_engines
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "search_engines_delete_own" ON search_engines;
CREATE POLICY "search_engines_delete_own" ON search_engines
  FOR DELETE USING (auth.uid() = user_id);

-- ========== 自动更新时间戳触发器 ==========

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_categories_updated_at ON categories;
CREATE TRIGGER trigger_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_bookmarks_updated_at ON bookmarks;
CREATE TRIGGER trigger_bookmarks_updated_at
  BEFORE UPDATE ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trigger_search_engines_updated_at ON search_engines;
CREATE TRIGGER trigger_search_engines_updated_at
  BEFORE UPDATE ON search_engines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
