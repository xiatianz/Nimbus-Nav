# Nimbus Nav ☁️ 🔖

[Nimbus Nav](https://nav.ehon.cn/) 是一款轻量、优雅的私人导航站与书签管理工具。它无需繁重的框架，采用原生 JavaScript (Vanilla JS) 编写，支持离线优先操作、跨设备云同步，并集成了现代安全的 Passkey (通行密匙) 登录体验。

## ✨ 核心特性

- **🚀 极简纯粹**: 原生 JS + HTML + CSS 打造，无构建步骤，秒开体验。
- **🔖 书签管理**: 支持网址分类、拖拽排序、网站图标(favicon)自动解析与首字母兜底。
- **☁️ 云端同步**: 基于 Supabase 的数据同步，支持多设备无缝切换。
- **🛡️ 隐私与安全**: 采用 RLS (行级安全策略) 隔离数据，你的书签只有你能看。
- **🔑 现代认证**: 支持邮箱密码、GitHub 授权以及无密码的 **Passkey (通行密匙)** 登录。
- **🔍 智能搜索**: 支持本地书签下拉建议、方向键导航、以及快捷前缀搜索引擎（如 `g openai` 快速使用 Google 搜索）。
- **🌗 深色模式**: 自动响应系统主题，支持手动切换明暗外观。

## 🛠️ 技术栈

- **前端**: HTML5 / CSS3 / Vanilla JavaScript
- **后端 & 数据库**: [Supabase](https://supabase.com/) (PostgreSQL)
- **认证**: Supabase Auth (Email / GitHub / WebAuthn Passkeys)
- **部署**: Cloudflare Pages / Vercel / GitHub Pages (可任意静态托管)

## 📦 本地运行与部署

本项目为纯静态前端，无需 Node.js 环境即可直接运行。

### 本地预览

1. 克隆仓库:
   ```bash
   git clone https://github.com/xiatianz/Nimbus-Nav.git
   cd Nimbus-Nav
   ```
2. 使用任意 HTTP 服务器运行，例如 Python:
   ```bash
   python3 -m http.server 4173
   ```
3. 在浏览器中打开 `http://localhost:4173`。

### 配置你自己的 Supabase

如果你想自己部署一套后端：
1. 在 [Supabase](https://supabase.com/) 创建一个新项目。
2. 在 SQL Editor 中执行项目自带的 `schema.sql`，建立 `categories`、`bookmarks` 表以及 RLS 策略。
3. 获取你的 `Project URL` 和 `anon public key`。
4. 修改项目根目录的 `config.js`：
   ```javascript
   var SUPABASE_URL = '你的_SUPABASE_URL';
   var SUPABASE_ANON_KEY = '你的_ANON_KEY';
   ```
5. 在 Supabase Dashboard 中开启相应的登录提供商 (Email, GitHub) 以及开启 **Passkeys** 和 **Manual Linking** (手动账号绑定)。

## ⌨️ 搜索框快捷键

- `Enter`: 打开默认搜索引擎
- `g [关键词]`: 使用 Google 搜索
- `b [关键词]`: 使用 Bing 搜索
- `dd [关键词]`: 使用 DuckDuckGo 搜索
- 直接输入 `fig` 等书签名称：触发本地下拉建议

## 📄 协议

[MIT License](LICENSE)
