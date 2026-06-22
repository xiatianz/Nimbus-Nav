const assert = require('assert');
const NavSearch = require('../search-utils');

const engines = {
  baidu: 'https://www.baidu.com/s?wd=',
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q='
};

const bookmarks = [
  {
    id: '1',
    name: 'GitHub',
    url: 'https://github.com',
    description: '代码托管平台'
  },
  {
    id: '2',
    name: 'Figma',
    url: 'https://www.figma.com/files',
    description: '在线设计工具'
  }
];

function testUrlDetection() {
  assert.strictEqual(NavSearch.isLikelyUrl('localhost:3000'), true);
  assert.strictEqual(NavSearch.normalizeUrl('localhost:3000/docs'), 'http://localhost:3000/docs');
  assert.strictEqual(NavSearch.normalizeUrl('192.168.1.1/admin'), 'http://192.168.1.1/admin');
  assert.strictEqual(NavSearch.normalizeUrl('github.com/xiatianz/Nimbus-Nav'), 'https://github.com/xiatianz/Nimbus-Nav');
  assert.strictEqual(NavSearch.isLikelyUrl('open ai'), false);
}

function testEnginePrefixes() {
  const google = NavSearch.getDirectAction('g openai', engines.baidu);
  assert.strictEqual(google.type, 'search');
  assert.strictEqual(google.label, 'Google 搜索 openai');
  assert.strictEqual(google.url, 'https://www.google.com/search?q=openai');

  const ddg = NavSearch.getDirectAction('dd privacy browser', engines.baidu);
  assert.strictEqual(ddg.url, 'https://duckduckgo.com/?q=privacy%20browser');
}

function testBookmarkSuggestionsWinFirst() {
  const suggestions = NavSearch.buildSuggestions('fig', bookmarks, engines.baidu);
  assert.strictEqual(suggestions[0].type, 'bookmark');
  assert.strictEqual(suggestions[0].title, 'Figma');
  assert.strictEqual(suggestions[1].type, 'search');
  assert.strictEqual(suggestions[1].url, 'https://www.baidu.com/s?wd=fig');
}

function run() {
  testUrlDetection();
  testEnginePrefixes();
  testBookmarkSuggestionsWinFirst();
  console.log('search utils tests passed');
}

run();
