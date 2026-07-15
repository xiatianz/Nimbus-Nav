/* ====== Supabase 配置 ====== */
var SUPABASE_URL = 'https://aphivrjznbhrpzapiihc.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwaGl2cmp6bmJocnB6YXBpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjQ3MDIsImV4cCI6MjA5NzcwMDcwMn0.viP1DcfTly-wbFtA5WD757youAo6mx5bsmdAwf29QoY';

/* 默认书签数据（新用户首次使用） */
/* 默认数据只描述内容；实际 ID 在首次初始化每个本地数据空间时生成。 */
var DEFAULT_DATA = [
  {
    name: '常用工具',
    sort_order: 0,
    bookmarks: [
      { name: 'GitHub', url: 'https://github.com', description: '代码托管平台' },
      { name: 'Google 翻译', url: 'https://translate.google.com', description: '在线翻译服务' },
      { name: 'ChatGPT', url: 'https://chat.openai.com', description: 'AI 对话助手' }
    ]
  }
];
var DEFAULT_SEARCH_ENGINES = [
  { name: '百度', url: 'https://www.baidu.com/s?wd=', sort_order: 0 },
  { name: 'Google', url: 'https://www.google.com/search?q=', sort_order: 1 },
  { name: 'Bing', url: 'https://www.bing.com/search?q=', sort_order: 2 },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', sort_order: 3 }
];
