-- ============================================
-- 2026-07-16 迁移：为 categories / bookmarks / search_engines
-- 加入长度 CHECK 约束
--
-- 使用方法：
--   打开 Supabase Dashboard → SQL Editor → 新建 Query →
--   把本文件所有内容粘贴进去 → Run
--
-- 全部语句幂等（DROP IF EXISTS + ADD），可以重复跑。
-- ============================================

-- 步骤 1：先体检当前最长值，确认没有超过阈值。
-- 阈值：cat_name 60 / bm_name 120 / bm_url 2048 / bm_desc 300
--       se_name 40 / se_url 2048
select
  (select coalesce(max(char_length(name)), 0) from categories)                     as cat_name_max,
  (select coalesce(max(char_length(name)), 0) from bookmarks)                      as bm_name_max,
  (select coalesce(max(char_length(url)),  0) from bookmarks)                      as bm_url_max,
  (select coalesce(max(char_length(coalesce(description, ''))), 0) from bookmarks) as bm_desc_max,
  (select coalesce(max(char_length(name)), 0) from search_engines)                 as se_name_max,
  (select coalesce(max(char_length(url)),  0) from search_engines)                 as se_url_max;

-- 步骤 2：加约束。任一条报 "check constraint ... is violated by some row"
-- 就说明历史数据超长，需要先 UPDATE 截短或者上调对应阈值。
alter table categories     drop constraint if exists categories_name_len;
alter table categories     add  constraint categories_name_len
  check (char_length(name) between 1 and 60);

alter table bookmarks      drop constraint if exists bookmarks_name_len;
alter table bookmarks      add  constraint bookmarks_name_len
  check (char_length(name) between 1 and 120);

alter table bookmarks      drop constraint if exists bookmarks_url_len;
alter table bookmarks      add  constraint bookmarks_url_len
  check (char_length(url)  between 1 and 2048);

alter table bookmarks      drop constraint if exists bookmarks_desc_len;
alter table bookmarks      add  constraint bookmarks_desc_len
  check (char_length(coalesce(description, '')) <= 300);

alter table search_engines drop constraint if exists search_engines_name_len;
alter table search_engines add  constraint search_engines_name_len
  check (char_length(name) between 1 and 40);

alter table search_engines drop constraint if exists search_engines_url_len;
alter table search_engines add  constraint search_engines_url_len
  check (char_length(url)  between 1 and 2048);

-- 步骤 3：验证约束已加上（应该看到 6 行）。
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conname in (
  'categories_name_len',
  'bookmarks_name_len', 'bookmarks_url_len', 'bookmarks_desc_len',
  'search_engines_name_len', 'search_engines_url_len'
)
order by conname;
