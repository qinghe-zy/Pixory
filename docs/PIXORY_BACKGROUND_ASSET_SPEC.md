# Pixory Background Asset Spec

更新时间：2026-05-07

## 目的

这份规范用于生成和接入 Pixory 新视觉方向中的页面背景装饰资产。背景资产是可打包进 App 的静态素材，不是效果图截图，也不是整屏 UI 背景图。

## 资产原则

- 不包含状态栏、导航栏、手机边框。
- 不包含页面 UI、按钮、输入框、卡片、图标、文字或 Logo。
- 不包含云、账号、同步、社交、AI 生成等语义。
- 不依赖网络资源。
- 背景元素必须低对比，不能影响页面文字、图片资产和操作控件。
- 能点击、能输入、会变化的内容必须由 React Native 代码实现。
- 阴影、圆角、留白、颜色必须来自 design tokens，不烘焙进图片。
- 背景只负责氛围，不承载重要信息；被刘海、短屏、底部手势区域轻微裁切也不影响使用。
- 不使用整张 1080 屏幕截图式 UI 背景。允许使用无 UI 的纯氛围背景图，但必须只包含纸张、植物、点阵、收纳等装饰，不承载信息。

## 推荐场景配方

| Variant | Pages | Intent |
| --- | --- | --- |
| `home` | 首页、启动后首页 | Pixory 品牌入口、植物、纸张、清晨光 |
| `archive` | 分组、新建分组、IP 详情局部 | 本地归档、文件夹、收纳 |
| `tags` | 标签、标签结果 | 标签纸、虚线、轻检索 |
| `profile` | 我的、隐私、本地空间 | 本地安全、存储盒、可信 |
| `gallery` | 图片库、收藏、最近查看、图片列表 | 图片资产、胶片边、联系表 |
| `workflow` | 导入图片、待整理、批量管理 | 导入整理、流程、托盘 |
| `search` | 全局搜索、搜索结果 | 索引、查找、结果定位 |
| `trash` | 回收站 | 软删除、风险提示但不过度刺眼 |
| `backup` | 备份导出 | 完整备份、manifest、可带走 |
| `detail` | 图片详情、元数据 | 看图优先、极简纸边和柔光 |

## 当前装饰元素

最终可打包资产分两类。

第一类是 `$imagegen` 生成的纯背景图，位于：

```text
assets/backgrounds/japanese-fresh/generated-full/
```

当前已接入 8 张：

- `bg-home-botanical.png`
- `bg-archive-folder.png`
- `bg-tags-stationery.png`
- `bg-gallery-film.png`
- `bg-workflow-import.png`
- `bg-profile-storage.png`
- `bg-search-paper.png`
- `bg-safety-backup-trash.png`

这些背景图必须无 UI、无状态栏、无文字、无按钮、无卡片。当前由 `src/design/backgrounds.ts` 静态 require，并作为 `home / archive / tags / gallery / workflow / profile / search / detail / backup / trash` 的优先背景。其中 `detail` 复用 `bg-search-paper.png`，`backup` 和 `trash` 复用 `bg-safety-backup-trash.png`。

第二类是透明装饰元素，位于：

```text
assets/backgrounds/japanese-fresh/elements/
```

当前元素：

- `botanical-branch.png`
- `washi-paper-corner.png`
- `dot-index-grid.png`
- `magnifier-texture.png`
- `archive-folder-outline.png`
- `tag-paper-stack.png`
- `film-edge.png`
- `storage-box-outline.png`
- `import-tray.png`
- `trash-soft-warning.png`
- `backup-manifest-sheet.png`
- `detail-paper-edge.png`

生成脚本：

```text
scripts/generate-japanese-fresh-background-elements.ps1
```

元素必须透明、无文字、无按钮、无状态栏、无整屏 UI。

## 安全区

背景生成时遵守下面的安全区：

- 中央 64% 宽度保持低纹理和低对比。
- 顶部允许有植物、纸张、光影，但不能形成强边界。
- 底部 18% 不放关键装饰，避免和底部 Tab / fixed action 冲突。
- 左右边缘可以有淡纸边、胶片边、网格线，但不能依赖裁切后才成立。

## 接入建议

React Native 中使用 `PageBackground` 渲染装饰元素：

- 页面只声明 `backgroundVariant`。
- `src/design/backgrounds.ts` 维护静态 require 和场景配方。
- `PageBackground` 使用 `useWindowDimensions()` 和 `safeAreaInsets.bottom` 按比例定位。
- 纯背景图按 `1080 / 2400` 设计画布比例 `contain` 居中显示，避免 `cover` 随机裁掉边缘装饰。
- 装饰物靠边锚定，避免在页面中写固定 `top: 120` / `left: 40`。
- 页面内容层继续使用 token 控制卡片、边框和表面，不把视觉层级烘焙进背景图。

## 文件大小目标

- 单个透明装饰 PNG 尽量控制在 50 KB 以内。
- 当前元素最大约 15 KB，可直接进入 Android bundle。
- 后续如生成更复杂 bitmap，需先验证 Expo / Android 打包兼容性。

## 验收标准

- 任意页面叠加白色/暖白卡片后仍清楚可读。
- 中央安全区没有高对比物体穿过正文。
- 短屏、标准屏、长屏下装饰不会遮挡核心内容。
- 底部装饰不压住 TabBar 或固定 action，并考虑 `safeAreaInsets.bottom`。
- 背景看起来属于同一套系统，但场景之间有轻微差异。
