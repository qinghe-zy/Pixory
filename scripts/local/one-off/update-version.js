const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'package.json',
  'app.json',
  'src/services/updateCheckService.ts',
  'src/screens/AboutScreen.tsx',
  'docs/update-version.json',
  'README.md',
  'docs/download.html',
  'docs/updates.html',
  'docs/index.html',
  'docs/m.html',
  'android/app/src/main/res/values/strings.xml'
];

for (const relPath of filesToUpdate) {
  const absolutePath = path.resolve(__dirname, relPath);
  if (fs.existsSync(absolutePath)) {
    let content = fs.readFileSync(absolutePath, 'utf8');
    content = content.replace(/2\.8\.0/g, '2.8.1');
    fs.writeFileSync(absolutePath, content, 'utf8');
    console.log(`Updated ${relPath}`);
  }
}

// Update sitemap
const sitemapPath = path.resolve(__dirname, 'docs/sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let content = fs.readFileSync(sitemapPath, 'utf8');
  content = content.replace(/<lastmod>.*?<\/lastmod>/g, '<lastmod>2026-08-16</lastmod>');
  fs.writeFileSync(sitemapPath, content, 'utf8');
  console.log('Updated sitemap.xml');
}

// Write the release notes
const updateJsonPath = path.resolve(__dirname, 'docs/update-version.json');
if (fs.existsSync(updateJsonPath)) {
  let content = fs.readFileSync(updateJsonPath, 'utf8');
  content = content.replace(
    /"message": ".*?",/,
    `"message": "Pixory 2.8.1 发布。引入全套高级动态物理引擎与「极光」边缘动效，大幅提升组件阻尼回弹手感与双层视差高光质量；重新设计全局搜索历史界面与日历过滤功能；优化视频列表三视图滑动性能及高倍速音调自适应；修复 Android 11 删除闪退及应用长时间挂机后卡死等问题。请前往官网下载最新版。",`
  );
  fs.writeFileSync(updateJsonPath, content, 'utf8');
  console.log('Updated update-version.json release notes');
}
