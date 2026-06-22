/* ====== Supabase 配置 ====== */
var SUPABASE_URL = 'https://aphivrjznbhrpzapiihc.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwaGl2cmp6bmJocnB6YXBpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjQ3MDIsImV4cCI6MjA5NzcwMDcwMn0.viP1DcfTly-wbFtA5WD757youAo6mx5bsmdAwf29QoY';

/* 默认书签数据（新用户首次使用） */
/* 注意：默认数据必须提供固定的 id，避免清空缓存后同步导致重复创建 */
var DEFAULT_DATA = [
  {
    id: 'def-cat-1',
    name: '常用工具',
    sort_order: 0,
    bookmarks: [
      { id: 'def-bm-1-1', name: 'GitHub', url: 'https://github.com', description: '代码托管平台' },
      { id: 'def-bm-1-2', name: 'Google 翻译', url: 'https://translate.google.com', description: '在线翻译服务' },
      { id: 'def-bm-1-3', name: 'ChatGPT', url: 'https://chat.openai.com', description: 'AI 对话助手' }
    ]
  }
];