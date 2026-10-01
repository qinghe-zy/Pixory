const fs = require('fs');

let fm = fs.readFileSync('docs/feature-matrix.md', 'utf8');
fm = fm.replace(/2026-09-28/g, '2026-10-01');
fm = fm.replace(/回收站 \| soft delete、恢复、清空、30 天过期清理/g, '回收站 | soft delete、长按多选批量操作、恢复、清空、30 天过期清理');
fm = fm.replace(/文本片段、本地图片/g, '文本片段、本地图片（支持从IP直接插图）');
fs.writeFileSync('docs/feature-matrix.md', fm);

let hb = fs.readFileSync('docs/pixory-product-bid-handbook.md', 'utf8');
hb = hb.replace(/2026-09-28/g, '2026-10-01');
hb = hb.replace(/纯白视觉重构，彻底统一设计规范，精简卡片间距与排版；重构搜索交互界面；修复数据库兼容性问题及\\r?\\n若干稳定性细节/g, '极简界面重构、无缝短视频滑动浏览、AI聊天支持插入IP素材与管家隔离、回收站新增多选等');
hb = hb.replace(/纯白视觉重构.*?细节/gs, '极简界面重构、无缝短视频滑动浏览、AI聊天支持插入IP素材与管家隔离、回收站新增多选等体验优化');
fs.writeFileSync('docs/pixory-product-bid-handbook.md', hb);