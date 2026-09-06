const fs = require('fs');
let updateJson = JSON.parse(fs.readFileSync('docs/update-version.json', 'utf8'));
updateJson.message = 'Pixory 2.8.2 稳定版发布。整合近期 OTA 内容：重构视频播放器底层稳定性，解决内存溢出与死锁问题；图片阅读器新增物理音量键翻页；新增陪伴时长成就时光机彩蛋；修复 JSI 底层析构引发的闪退及空白气泡问题；全域核心性能加固与长列表渲染速度优化。可前往官网获取最新版。';
updateJson.detailLines = [
  '✨ 图片阅读器新增物理音量键无缝左右翻页功能',
  '🎉 关于页面新增专属陪伴时长时光机与成就动画彩蛋',
  '🛠️ 彻底重构视频播放底层逻辑，大幅减少内存溢出及闪退',
  '🚀 解决 C++ JSI 底层析构崩溃、纯图消息空白等多处历史遗留问题'
];
updateJson.changelog = '1. 新增：图片音量键翻页与陪伴成就彩蛋；2. 优化：视频播放器与全域核心性能重构；3. 修复：JSI 底层闪退、空白图文气泡、SQLite 排序混乱等问题。';
fs.writeFileSync('docs/update-version.json', JSON.stringify(updateJson, null, 2) + '\n');
