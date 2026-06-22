/* ====== Supabase 配置 ====== */
var SUPABASE_URL = 'https://aphivrjznbhrpzapiihc.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwaGl2cmp6bmJocnB6YXBpaWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjQ3MDIsImV4cCI6MjA5NzcwMDcwMn0.viP1DcfTly-wbFtA5WD757youAo6mx5bsmdAwf29QoY';

/* 默认书签数据（新用户首次使用） */
var DEFAULT_DATA = [
  {
    name: '常用工具',
    sort_order: 0,
    bookmarks: [
      { name: 'GitHub', url: 'https://github.com', description: '代码托管平台' },
      { name: 'Google 翻译', url: 'https://translate.google.com', description: '在线翻译服务' },
      { name: 'Figma', url: 'https://www.figma.com', description: '在线设计工具' },
      { name: 'CodePen', url: 'https://codepen.io', description: '前端代码实验' },
      { name: 'Stack Overflow', url: 'https://stackoverflow.com', description: '技术问答社区' },
      { name: 'ChatGPT', url: 'https://chat.openai.com', description: 'AI 对话助手' }
    ]
  },
  {
    name: '开发资源',
    sort_order: 1,
    bookmarks: [
      { name: 'MDN', url: 'https://developer.mozilla.org', description: 'Web 开发文档' },
      { name: 'npm', url: 'https://www.npmjs.com', description: 'Node 包管理器' },
      { name: 'LeetCode', url: 'https://leetcode.cn', description: '算法练习平台' },
      { name: '菜鸟教程', url: 'https://www.runoob.com', description: '编程入门教程' },
      { name: 'Vite', url: 'https://vitejs.dev', description: '前端构建工具' },
      { name: 'Tailwind CSS', url: 'https://tailwindcss.com', description: 'CSS 框架' }
    ]
  },
  {
    name: '影音娱乐',
    sort_order: 2,
    bookmarks: [
      { name: 'YouTube', url: 'https://www.youtube.com', description: '视频分享平台' },
      { name: '哔哩哔哩', url: 'https://www.bilibili.com', description: '弹幕视频网' },
      { name: '网易云音乐', url: 'https://music.163.com', description: '音乐发现平台' },
      { name: 'Netflix', url: 'https://www.netflix.com', description: '流媒体服务' },
      { name: '豆瓣', url: 'https://www.douban.com', description: '书影音社区' },
      { name: '知乎', url: 'https://www.zhihu.com', description: '问答社区' }
    ]
  },
  {
    name: '实用工具',
    sort_order: 3,
    bookmarks: [
      { name: 'Telegram', url: 'https://web.telegram.org', description: '即时通讯' },
      { name: 'Notion', url: 'https://www.notion.so', description: '笔记协作工具' },
      { name: 'Excalidraw', url: 'https://excalidraw.com', description: '白板绘图工具' },
      { name: 'Can I Use', url: 'https://caniuse.com', description: '浏览器兼容查询' },
      { name: 'TinyPNG', url: 'https://tinypng.com', description: '图片压缩工具' },
      { name: 'Regex101', url: 'https://regex101.com', description: '正则测试工具' }
    ]
  }
];
