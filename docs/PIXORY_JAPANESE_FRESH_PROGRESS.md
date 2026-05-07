# Pixory Japanese Fresh Upgrade Progress

保存时间：2026-05-06

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

### 3. Token 草案已保存

已新增：

```text
src/design/tokens/japaneseFresh.ts
```

当前只是 token 草案，尚未接入 `src/design/tokens/index.ts`，不会影响现有运行逻辑。

### 4. 设计拆解参考板已保存

已生成：

```text
output/ui-upgrade-2026-05-06-japanese-fresh/design-system/component-board.png
output/ui-upgrade-2026-05-06-japanese-fresh/design-system/background-elements-board.png
output/ui-upgrade-2026-05-06-japanese-fresh/design-system/manifest.design-system-images.json
```

这些是设计参考图，不应打包进 App。

### 5. App 背景资产目录已创建

已创建代码内资产目录：

```text
assets/backgrounds/japanese-fresh/
assets/backgrounds/japanese-fresh/master/
assets/backgrounds/japanese-fresh/short/
assets/backgrounds/japanese-fresh/standard/
assets/backgrounds/japanese-fresh/tall/
```

并保存了生成前快照：

```text
assets/backgrounds/japanese-fresh/generated-before.txt
```

## 未完成

### 1. 代码内背景图片尚未生成

用户提醒“全是文档没有放在代码的图片吗”后，已开始准备生成可打包背景图，但在生成前用户要求“保存进度”，所以此处暂停。

尚未生成以下 10 张背景母版：

- `bg-home-botanical`
- `bg-archive-folder`
- `bg-tags-stationery`
- `bg-profile-storage`
- `bg-gallery-film`
- `bg-workflow-import`
- `bg-search-index`
- `bg-trash-soft-warning`
- `bg-backup-manifest`
- `bg-detail-minimal`

尚未导出：

- `short` 版本
- `standard` 版本
- `tall` 版本

### 2. 背景资产尚未接入代码

尚未新增：

- `backgroundVariants` 静态 require 映射
- `PageBackground` 组件
- `AppScreen` 的 `backgroundVariant` 支持

### 3. Token 尚未替换现有页面

当前 `japaneseFresh.ts` 没有影响现有页面。后续应分阶段映射到现有 token，而不是一次性大范围替换。

## 下一步建议

1. 先生成 10 张无 UI、无状态栏、无文字、可打包背景母版。
2. 从母版裁切导出 `short / standard / tall` 三种手机比例。
3. 生成 `assets/backgrounds/japanese-fresh/index.ts` 或 `src/design/backgrounds.ts` 静态映射。
4. 新增 `PageBackground`。
5. 扩展 `AppScreen`，先只在首页试接入背景。
6. Android 截图验证后，再推广到其他页面模板。

## 注意事项

- `output/` 下的图片全部是设计参考，不进 App bundle。
- `assets/backgrounds/japanese-fresh/` 才是后续要打包进代码的图片资产目录。
- 背景图片必须无 UI、无状态栏、无文字、无按钮。
- 每屏最多使用 1 张背景图，避免性能问题。
- 背景图不能替代组件 token，页面仍应由组件和 token 控制层级。
