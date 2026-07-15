#!/usr/bin/env node
/* eslint-disable */
/*
 * scripts/bump-sw.js
 *
 * 根据 sw.js 里 STATIC_ASSETS 列出的静态资源内容，计算 sha1 摘要，
 * 用「YYYY-MM-DD-<hash8>」作为 BUILD_VERSION 写回 sw.js。
 *
 * 使用方式：
 *   node scripts/bump-sw.js
 *
 * 触发时机：改完 app.js / style.css / html / 图标等任意静态资源后跑一次；
 * 也可以挂到 git pre-commit / CI 里自动执行（见 README 注释）。
 *
 * 幂等：内容没变时不会改动 sw.js，退出码 0。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SW_PATH = path.join(ROOT, 'sw.js');

const sw = fs.readFileSync(SW_PATH, 'utf8');

const listMatch = sw.match(/var STATIC_ASSETS = \[([\s\S]*?)\];/);
if (!listMatch) {
  console.error('bump-sw: 未在 sw.js 中找到 STATIC_ASSETS 数组');
  process.exit(1);
}
const assets = Array.from(listMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);

const hash = crypto.createHash('sha1');
let counted = 0;
assets.forEach((rel) => {
  // './' 是目录索引，跳过——它只是 addAll 的兜底，内容等于 index.html
  if (rel === './' || rel.endsWith('/')) return;
  const abs = path.join(ROOT, rel.replace(/^\.\//, ''));
  if (!fs.existsSync(abs)) {
    console.warn('bump-sw: 缺失文件（跳过）：', rel);
    return;
  }
  hash.update(rel);
  hash.update(fs.readFileSync(abs));
  counted += 1;
});

if (counted === 0) {
  console.error('bump-sw: 没有可用文件参与哈希，请检查 STATIC_ASSETS');
  process.exit(1);
}

const digest = hash.digest('hex').slice(0, 8);
const today = new Date().toISOString().slice(0, 10);
const newVersion = `${today}-${digest}`;

const versionMatch = sw.match(/var BUILD_VERSION = '([^']+)';/);
if (!versionMatch) {
  console.error('bump-sw: 未找到 BUILD_VERSION 行');
  process.exit(1);
}
const oldVersion = versionMatch[1];

// hash 部分未变 → 内容没变，仅日期变了也不 bump，避免无意义的 SW 更新
const oldHash = oldVersion.split('-').pop();
if (oldHash === digest) {
  console.log(`bump-sw: 内容未变（hash=${digest}），沿用 ${oldVersion}`);
  process.exit(0);
}

const updated = sw.replace(
  /var BUILD_VERSION = '[^']+';/,
  `var BUILD_VERSION = '${newVersion}';`
);
fs.writeFileSync(SW_PATH, updated);
console.log(`bump-sw: ${oldVersion} → ${newVersion}（${counted} 个文件）`);
