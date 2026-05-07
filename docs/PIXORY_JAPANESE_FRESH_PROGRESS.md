# Pixory Japanese Fresh Upgrade Progress

保存时间：2026-05-07

## 当前结论

Pixory 新视觉方向已从旧 `design/` 方向中独立出来，确定为日系清新、暖白纸感、sage green 主色、低对比植物/纸张/归档元素、图片资产优先。

## 已完成

### 1. 页面效果图已保存

已生成并保存 22 张带 UI 的页面升级效果图：

```text
output/ui-upgrade-2026-05-06-japanese-fresh/
```

包括：

- `00-launch-current.png`
- `01-home.png`
- `02-groups.png`
- `03-tags.png`
- `04-me.png`
- `05-ip-detail.png`
- `06-ip-detail-before-actions.png`
- `07-quick-organize.png`
- `08-import-images.png`
- `09-create-group.png`
- `10-all-images.png`
- `11-batch-manage.png`
- `12-image-detail.png`
- `13-create-ip.png`
- `14-global-search.png`
- `15-me-current.png`
- `16-favorites.png`
- `17-recent-viewed.png`
- `18-trash.png`
- `19-backup-export.png`
- `20-global-search-results.png`
- `21-image-detail-metadata.png`

同时已生成：

```text
output/ui-upgrade-2026-05-06-japanese-fresh/00-contact-sheet.png
output/ui-upgrade-2026-05-06-japanese-fresh/manifest.generated-ui.json
```

这些是效果图，不应打包进 App。

### 2. 设计系统文档已保存

已新增：

```text
docs/PIXORY_JAPANESE_FRESH_VISUAL_SYSTEM.md
docs/PIXORY_JAPANESE_FRESH_COMPONENT_SYSTEM.md
docs/PIXORY_JAPANESE_FRESH_TOKEN_REFERENCE.md
docs/PIXORY_BACKGROUND_ASSET_SPEC.md
```

内容覆盖：

- 新视觉方向
- token 体系
- 背景资产规范
- 现有组件升级映射
- 新增/正式化组件
- 页面模板分类
- 元素清单
- 性能规则
- 迁移顺序
- 验收清单

### 3. Token 草案已保存，并已开始映射到现有 token

已新增：

```text
src/design/tokens/japaneseFresh.ts
```

`japaneseFresh.ts` 仍作为参考草案保留；本轮没有改变业务页面 import，而是直接将现有 token 文件逐步映射到日系清新方向，避免大范围改页面导入路径。

### 4. 设计拆解参考板已保存

已生成：

```text
output/ui-upgrade-2026-05-06-japanese-fresh/design-system/component-board.png
output/ui-upgrade-2026-05-06-japanese-fresh/design-system/background-elements-board.png
output/ui-upgrade-2026-05-06-japanese-fresh/design-system/manifest.design-system-images.json
```

这些是设计参考图，不应打包进 App。

### 5. App 背景资产目录已创建并生成装饰元素

已创建代码内资产目录，并补充 `$imagegen` 生成的 8 张纯背景图：

```text
assets/backgrounds/japanese-fresh/generated-full/
```

当前纯背景包括：

```text
bg-home-botanical.png
bg-archive-folder.png
bg-tags-stationery.png
bg-gallery-film.png
bg-workflow-import.png
bg-profile-storage.png
bg-search-paper.png
bg-safety-backup-trash.png
```

原始 imagegen sheet 备份在：

```text
output/android-visual-acceptance-2026-05-07/imagegen-five-backgrounds-sheet.png
```

同时按“拆件装饰层”方案保留 12 个透明 PNG：

```text
assets/backgrounds/japanese-fresh/
assets/backgrounds/japanese-fresh/elements/
```

当前装饰元素包括：

```text
archive-folder-outline.png
backup-manifest-sheet.png
botanical-branch.png
detail-paper-edge.png
dot-index-grid.png
film-edge.png
import-tray.png
magnifier-texture.png
storage-box-outline.png
tag-paper-stack.png
trash-soft-warning.png
washi-paper-corner.png
```

生成脚本：

```text
scripts/generate-japanese-fresh-background-elements.ps1
```

清单：

```text
assets/backgrounds/japanese-fresh/elements/manifest.background-elements.json
```

### 6. 背景装饰系统已接入代码

已新增：

```text
src/design/backgrounds.ts
src/components/PageBackground.tsx
```

已扩展：

```text
src/components/AppScreen.tsx
src/components/ScreenScaffold.tsx
src/components/FormScreenScaffold.tsx
```

实现方式：

- 页面只传 `backgroundVariant`。
- 8 张纯背景图分配到所有现有 `backgroundVariant` 场景。
- `detail` 复用 `bg-search-paper.png`，`backup` 和 `trash` 复用 `bg-safety-backup-trash.png`，避免为了数量堆图。
- 背景资产使用静态 `require`，可进入 Expo / Android bundle。
- 纯背景图按 `1080 / 2400` 设计画布比例 `contain` 居中显示，避免 `cover` 导致边缘装饰被不可控裁切。
- 装饰元素按屏幕宽高比例和边缘锚点定位。
- 底部锚定会叠加 `safeAreaInsets.bottom`。
- 状态栏、导航栏、卡片、文字、按钮、输入、阴影、圆角都留在代码和 token 中。

### 7. Token 已开始映射到日系清新方向

已更新：

```text
src/design/tokens/colors.ts
src/design/tokens/radius.ts
src/design/tokens/shadows.ts
src/design/tokens/metrics.ts
src/design/tokens/layout.ts
src/design/tokens/typography.ts
src/design/tokens/components.ts
```

### 8. 主要页面已接入背景场景

已覆盖模板：

- `home`
- `archive`
- `tags`
- `profile`
- `gallery`
- `workflow`
- `search`
- `trash`
- `backup`
- `detail`

## 未完成

### 1. Android 真机/模拟器截图验收尚未完成

本轮已完成 Android 平台 export 检查，但尚未进行真机或模拟器逐页截图验收。后续应在真实数据状态下重点检查：

- 首页
- 分组
- 标签
- 我的
- 图片库
- IP 详情
- 导入图片
- 批量管理
- 图片详情
- 全局搜索
- 回收站
- 备份导出

### 2. 组件级精修仍需 Android 截图校准

本轮已完成第一批核心组件 token 化精修：

- Header
- SearchBar
- FilterChip
- BottomTabBar
- IPCard
- ThumbnailTile
- EmptyState
- PrimaryButton

仍需在 Android 截图中继续校准：

- 表单组件
- 底部操作栏
- 复杂列表和批量管理面板

这些组件应继续使用 token，不在页面里散落颜色、阴影、圆角。

## 验证

已通过：

```text
pnpm typecheck
pnpm test
pnpm exec expo export --platform android --output-dir output/export-check-japanese-fresh
```

Android export 日志确认 12 个装饰 PNG 已进入 bundle，单个文件约 1.6 KB - 15.2 KB。

2026-05-07 追加验证：

```text
pnpm typecheck
pnpm test
pnpm exec expo export --platform android --output-dir output/export-check-japanese-fresh-bg8
```

追加 Android export 日志确认 8 张 `generated-full` 纯背景图全部进入 bundle。已用当前源码 Expo Go 在 `Pixory_API_35` 模拟器抽验：

```text
output/android-visual-acceptance-2026-05-07/pages-bg8/05-me2.png
output/android-visual-acceptance-2026-05-07/pages-bg8/06-backup.png
output/android-visual-acceptance-2026-05-07/pages-bg8/07-search.png
```

抽验结论：新增 `profile / search / backup` 背景已正确显示；纯背景图按设计画布比例居中，不再用 `cover` 随机裁边。

## 下一步建议

1. 启动 Android 模拟器，按 22 个页面做真实数据截图验收。
2. 根据截图微调 `src/design/backgrounds.ts` 中的比例、透明度和锚点。
3. 继续精修 Header、SearchBar、FilterChip、BottomTabBar、IPCard、ThumbnailTile、EmptyState。
4. 再处理表单页和底部操作栏。
5. 最后更新验收截图和视觉回归记录。

## 注意事项

- `output/` 下的图片全部是设计参考，不进 App bundle。
- `assets/backgrounds/japanese-fresh/elements/` 是当前要打包进代码的图片资产目录。
- 背景装饰必须无 UI、无状态栏、无文字、无按钮。
- 每屏最多渲染 3 个装饰 PNG，避免性能问题。
- 背景图不能替代组件 token，页面仍应由组件和 token 控制层级。
