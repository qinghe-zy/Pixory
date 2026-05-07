# Pixory Japanese Fresh Component System

更新时间：2026-05-06

## 目标

这份文档把 Pixory 新日系清新方向拆成可实现的组件、元素、页面模板和性能规则。

本轮升级不是逐页堆样式，而是建立一套能覆盖当前 22 个主要页面的设计系统：

- Token 统一颜色、圆角、间距、阴影、字号。
- 组件承载可复用视觉语言。
- 页面模板控制不同页面类型的结构。
- 背景资产只提供氛围，不承载 UI 信息。
- 性能规则限制图片、阴影、背景层和长列表成本。

配套视觉参考：

- 组件视觉板：`output/ui-upgrade-2026-05-06-japanese-fresh/design-system/component-board.png`
- 背景元素板：`output/ui-upgrade-2026-05-06-japanese-fresh/design-system/background-elements-board.png`

## 总体分层

Pixory 页面从底到顶分 6 层：

1. `AppSurface`：页面底色和背景图。
2. `DecorLayer`：轻量装饰元素，通常来自背景图，不在运行时堆过多 View。
3. `ContentLayer`：页面主体内容，使用统一 padding 和 section gap。
4. `ComponentLayer`：卡片、搜索、筛选、表单、图片 tile。
5. `OverlayLayer`：底部操作栏、弹窗、ActionSheet、Toast。
6. `SystemLayer`：Android 状态栏、导航栏、安全区，不烘焙进设计图片。

代码实现时应优先把 1-5 层组件化。不要把状态栏、导航栏、完整页面 UI 放进图片资产。

## Token 架构

### 1. Primitive Tokens

Primitive 只描述原始值，不直接表达业务含义。

| Group | Examples |
| --- | --- |
| Color | ivory, sage, beige, gold, coral, sky |
| Spacing | 4, 8, 12, 16, 20, 24, 32 |
| Radius | 12, 18, 24, 30, pill |
| Shadow | none, hairline, card, floating |
| Typography | brand, page title, body, meta |

### 2. Semantic Tokens

Semantic 描述 Pixory 中的用法。

| Token | Intent |
| --- | --- |
| `app.background` | 页面底色 |
| `surface.card` | 主内容卡 |
| `surface.row` | 列表行 |
| `surface.input` | 输入与搜索 |
| `action.primary` | 主动作 |
| `action.secondary` | 次动作 |
| `action.danger` | 删除、清空 |
| `state.selected` | 选中状态 |
| `state.empty` | 空状态图标底 |
| `notice.localSafe` | 本地保存/原图安全提示 |

### 3. Component Tokens

Component token 绑定组件尺寸和视觉密度。

| Token | Recommended |
| --- | ---: |
| `search.height` | 50 |
| `chip.height` | 34 |
| `iconButton.size` | 48 |
| `bottomTab.height` | 86 |
| `ipCard.imageHeight` | 168 |
| `emptyState.iconBox` | 76 |
| `form.fieldHeight` | 50 |
| `actionBar.height` | 72 |

现有草案见 [japaneseFresh.ts](../src/design/tokens/japaneseFresh.ts)。

## 背景资产系统

背景资产分 10 类，规范见 [PIXORY_BACKGROUND_ASSET_SPEC.md](./PIXORY_BACKGROUND_ASSET_SPEC.md)。

页面选择背景时按模板，而不是按单页硬编码：

| Background | Pages |
| --- | --- |
| `bg-home-botanical` | 首页、启动后首页 |
| `bg-archive-folder` | 分组、新建分组、IP 详情 |
| `bg-tags-stationery` | 标签、标签结果 |
| `bg-profile-storage` | 我的、本地空间、隐私 |
| `bg-gallery-film` | 图片库、收藏、最近查看、搜索结果 |
| `bg-workflow-import` | 导入、待整理、批量管理 |
| `bg-search-index` | 全局搜索 |
| `bg-trash-soft-warning` | 回收站 |
| `bg-backup-manifest` | 备份导出 |
| `bg-detail-minimal` | 图片详情、元数据 |

接入原则：

- 背景图无状态栏、无文字、无 UI。
- 使用 `ImageBackground` 或绝对定位 `Image`，`resizeMode="cover"`。
- 背景只放一张，不在页面运行时堆 6-10 个装饰 View。
- 页面中部保持低对比，保证可读性。

## Existing Component Upgrade Map

当前项目已有一批组件，不建议推倒重来。

| Existing Component | Upgrade Role |
| --- | --- |
| `AppScreen` | 升级为支持背景图、背景色、固定底部区域的页面底座 |
| `ScreenScaffold` | 标准页面模板，接入背景场景和 Header |
| `FormScreenScaffold` | 表单页模板，统一底部主按钮和键盘行为 |
| `Header` | 页面标题、返回、右侧操作、品牌标题 |
| `SearchBar` | 首页/全局搜索/标签搜索统一搜索框 |
| `FilterChip` | 筛选、状态、排序、选择反馈 |
| `TagChip` | 标签展示与可移除标签 |
| `IPCard` | 首页和 IP 入口核心卡片 |
| `ThumbnailTile` | 图片网格、收藏、最近、搜索结果 |
| `EmptyState` | 所有空状态卡片 |
| `PageStateBlock` | loading/error/empty 的轻量状态块 |
| `ContentCard` | 通用轻卡片 |
| `PrimaryButton` | 主动作按钮 |
| `BottomTabBar` | 根导航底部 Tab |
| `BatchImageOrganizePanel` | 批量操作底部面板 |
| `SecureImage` | 本地图片安全展示层 |

## Components To Add Or Formalize

### 1. `PageBackground`

职责：页面背景图和底色。

Props:

- `variant`: 背景场景 key。
- `children`: 页面内容。
- `dimmed`: 是否轻微降低背景存在感，详情页默认 true。

规则：

- 只渲染一个背景图片。
- 背景图片使用静态 require 映射，避免动态路径打包失败。
- 图片加载失败时退回 `jpFresh.background.page`。

### 2. `DecorativeHeaderZone`

职责：首页品牌头和大标题页的顶部呼吸区。

适用：

- 首页 Pixory wordmark。
- 我的 / 标签 / 分组这类一级页标题。

规则：

- 不使用大面积卡片。
- 右侧按钮统一用 `IconButton`.
- 装饰来自背景，不在 Header 内画重元素。

### 3. `IconButton`

职责：加号、编辑、更多、返回、清空等图标按钮。

Variants:

- `plain`
- `surface`
- `primarySoft`
- `dangerSoft`

性能：

- 用 `@expo/vector-icons`，不要为简单图标引入图片。
- 按钮尺寸固定，避免布局跳动。

### 4. `SoftCard`

职责：轻卡片基础表面。

Variants:

- `flat`: 列表行、轻分区。
- `raised`: 首页 IP 卡、空状态卡。
- `tinted`: 提示、状态、选中。
- `danger`: 危险说明区。

规则：

- 默认边框 hairline。
- 阴影最多使用 `shadow.card`。
- 页面中不能出现卡片套卡片。

### 5. `NoticeBanner`

职责：本地保存、原图安全、备份完整性、软删除风险等提示。

Variants:

- `localSafe`
- `backup`
- `warning`
- `danger`

文案规则：

- 强调本地、原图、缩略图独立、软删除。
- 不暗示云同步或账号。

### 6. `Section`

职责：统一分区标题、右侧动作和内容间距。

Props:

- `title`
- `caption`
- `rightAction`
- `children`

规则：

- 标题不做巨大字号。
- 用间距建立层级，不靠厚卡片。

### 7. `ActionGrid`

职责：快速操作、批量操作、工具入口。

Variants:

- `twoColumn`
- `fourColumn`
- `bottomPanel`

规则：

- 批量操作底部面板允许更密，但图标和文字必须对齐。
- 危险动作只用 coral 文本和浅底，不使用大面积红色。

### 8. `ImageGrid`

职责：图片列表统一排版。

Props:

- `columns`: 2 或 3。
- `density`: `comfortable | compact`。
- `selectionMode`: boolean。

性能：

- 列表超过 30 张必须使用 `FlatList`。
- 设置 `keyExtractor`、`getItemLayout` 或固定 item 高度。
- Tile 使用 memo，避免批量选择时全量重渲染。

### 9. `FormSection`

职责：表单页面的轻分区。

Components:

- `FormInputRow`
- `FormTextareaRow`
- `OptionSelectRow`
- `SwitchSettingRow`

规则：

- 表单页背景干净，装饰更少。
- 底部主动作固定。
- Android 键盘弹出时不遮挡当前输入。

### 10. `FloatingBottomBar`

职责：底部主操作、批量操作、下一步流程。

Variants:

- `singlePrimary`
- `previousNext`
- `batchActions`

性能：

- 避免使用高半透明 blur。React Native blur 在 Android 上成本高。
- 使用普通 warm white 表面和弱阴影。

## Page Templates

### 1. Home Template

Pages:

- `00-launch-current`
- `01-home`

Structure:

1. Brand header
2. SearchBar
3. ImportQueueRow
4. FilterChipRow
5. IPCard list
6. BottomTabBar

Primary focus: IP 卡片和图片氛围。

Background: `bg-home-botanical`

### 2. Empty Overview Template

Pages:

- `02-groups`
- `03-tags`
- `16-favorites`
- `18-trash`

Structure:

1. Page header
2. Optional search/filter
3. EmptyState
4. Optional risk/action zone
5. BottomTabBar when root page

Primary focus: 清楚告诉用户下一步。

### 3. Profile Utility Template

Pages:

- `04-me`
- `15-me-current`

Structure:

1. Page title
2. LocalStorageSummaryCard
3. MenuList
4. BottomTabBar

Primary focus: 本地空间和工具入口。

### 4. IP Detail Template

Pages:

- `05-ip-detail`
- `06-ip-detail-before-actions`

Structure:

1. Back Header
2. Cover image
3. IP identity block
4. Stats strip
5. Management summary
6. Quick actions
7. Recent image grid

Primary focus: 封面和 IP 身份。

### 5. Workflow Template

Pages:

- `07-quick-organize`
- `08-import-images`
- `11-batch-manage`

Structure:

1. Header
2. Current context
3. Image preview or selection grid
4. Form/action sections
5. Fixed bottom action bar

Primary focus: 稳定完成整理动作。

### 6. Form Template

Pages:

- `09-create-group`
- `13-create-ip`

Structure:

1. Header
2. FormSection
3. Option rows
4. Fixed bottom primary action

Primary focus: 输入清晰、键盘安全。

### 7. Gallery Template

Pages:

- `10-all-images`
- `17-recent-viewed`
- `20-global-search-results`

Structure:

1. Header
2. Context chip / search result summary
3. FilterChipRow
4. ImageGrid

Primary focus: 图片扫读。

### 8. Image Detail Template

Pages:

- `12-image-detail`
- `21-image-detail-metadata`

Structure:

1. Back Header
2. Large image preview
3. Local safety notice
4. Metadata sections
5. Detail actions

Primary focus: 原图查看和元数据可信。

### 9. Search Template

Pages:

- `14-global-search`

Structure:

1. Header
2. SearchBar
3. SearchEmptyState

Primary focus: 输入后快速定位本地内容。

### 10. Backup Template

Pages:

- `19-backup-export`

Structure:

1. Header
2. Backup assurance notice
3. Recent backup state
4. Export location
5. Full backup primary action
6. IP package export list

Primary focus: 完整备份和本地可靠性。

## Element Inventory

### Background Elements

- washi paper grain
- pale leaf branch
- pressed paper corner
- translucent folder outline
- tag paper silhouette
- dotted indexing line
- film strip edge
- archive grid
- storage box outline
- manifest paper sheet
- soft coral warning strip

这些元素应主要出现在背景图中，不应大量运行时绘制。

### UI Elements

- rounded square plus button
- sage active chip
- warm white inactive chip
- hairline card border
- local safe notice with shield/check icon
- image-count badge
- favorite star badge
- selected thumbnail check badge
- import queue row
- stats strip
- form option radio row
- fixed bottom action bar
- floating bottom tab

## Performance Rules

### Static Backgrounds

- 每屏最多 1 张背景图。
- 背景图不要超过 1080px 宽。
- 优先使用 PNG 作为设计源，交付前可评估 WebP。
- 页面滚动时背景不要跟随复杂 parallax。
- 背景图不加 blur，不叠多层透明大图。

### Image Lists

- 图片网格超过 30 张使用 `FlatList`。
- 缩略图只使用 thumbnail，不加载 original。
- `SecureImage` 保持固定尺寸容器，避免布局跳动。
- 批量选择状态只更新被选中的 tile，避免整页重渲染。

### Shadows

- Android 上 `elevation` 控制在 1-4。
- 不使用多重深阴影。
- 大面积底部 Tab 和 ActionBar 只用一个轻阴影。

### Transparency

- 避免大面积半透明叠层叠加在背景图上。
- 不使用动态 blur / glassmorphism。
- 图片浮层只在必要处使用 `rgba(39,49,43,0.22)`。

### Rendering

- 图标用 vector icon，不做小 PNG 图标。
- 稳定尺寸：SearchBar、Chip、BottomTab、ActionBar、Tile 都必须有固定高度或 aspectRatio。
- 长文本用 `numberOfLines` 和合理截断。
- 表单页不要在键盘打开时触发布局大跳动。

### Bundle

- 背景资产按 10 个场景控制，不为 22 个页面各放一张大图。
- `assets/backgrounds/japanese-fresh` 应只放最终要打包的图，不放效果图或 contact sheet。
- 效果图继续放在 `output/`，不进入 App bundle。

## Migration Order

建议实现顺序：

1. 接入 `japaneseFreshTokens` 到现有 token index，但先不替换全部页面。
2. 扩展 `AppScreen` 支持 `backgroundVariant`。
3. 新增 `PageBackground` 和静态背景映射。
4. 升级 `Header`、`SearchBar`、`FilterChip`、`BottomTabBar`。
5. 升级 `IPCard`、`ThumbnailTile`、`EmptyState`。
6. 升级表单组件和底部操作栏。
7. 按页面模板改首页、IP 详情、图片库、我的页。
8. 再处理空状态、搜索、备份、回收站。
9. Android 真机截图验收。

## Verification Checklist

- 第一眼是否仍看到图片资产，而不是背景。
- 背景在短屏和长屏都没有遮挡核心内容。
- root tab 页视觉统一，但页面场景有差异。
- 空状态有明确动作。
- 危险动作不刺眼但足够清楚。
- 搜索、筛选、表单在 Android 上文字不截断。
- 图片网格滚动不卡顿。
- 背景图没有进入数据库、导入、备份等业务路径。
