const fs = require('fs');
let content = fs.readFileSync('README.md', 'utf8');

// Update version string
content = content.replace(/Pixory-v2\.8\.1\.apk/g, 'Pixory-v2.8.2.apk');
content = content.replace(/当前版本 \2\.8\.1\/g, '当前版本 2.8.2');
content = content.replace(/### Pixory 2\.8\.1/g, '### Pixory 2.8.2');

// Update changelog section
content = content.replace(/这一版本重点引入了更具沉浸感的交互视觉与全屏书写体验优化，为原本的页面注入了生命力与动态氛围：\n\n- \*\*极光与星轨动效\*\*[^\n]+\n- \*\*动态声纹反馈\*\*[^\n]+\n- \*\*全屏长文写作支持\*\*[^\n]+/,
  '这一版本为 2.8.1 以来多项核心更新与基础优化的总结包。重点包括性能与稳定性提升、多项长期遗留 Bug 修复以及细节体验彩蛋：\n\n- **稳定性与性能重构**：彻底重构视频播放底层逻辑，减少内存溢出及死锁崩溃；全域长列表渲染速度优化与基础性能加固，并修复底层 C++ JSI 析构发生在 GC 线程引发的小概率闪退。\n- **细节体验与交互创新**：图片阅读器新增物理音量键进行左右翻页；关于页面陪伴天数新增隐藏的时光机动画与成就停顿彩蛋，让日常回忆更加生动。\n- **关键修复**：修复纯图片消息展现空白气泡、SQLite 排序因 rowid 缺失错乱、开发者模式二级入口退出路径等多处历史遗留问题。'
);

fs.writeFileSync('README.md', content);
