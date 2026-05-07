# Pixory Japanese Fresh Visual System

更新时间：2026-05-06

## 方向结论

Pixory 新视觉方向从旧版 warm gold / editorial board 中独立出来，转向更轻的日系清新移动产品感。

核心关键词：

- 日系清新
- 暖白纸感
- 淡植物感
- 本地档案感
- 轻量卡片
- 图片优先
- Android first
- 离线可信
- 清爽但不空

不再沿用旧 `design/` 里的棕金重心和过强 editorial board 方向。旧文件可作为历史参考，但不作为后续页面升级依据。

## 视觉原则

### 1. 背景有气质，但必须后退

页面背景允许加入场景化元素，例如纸张、叶片、光影、标签纸、胶片边、收纳格、细线网格。它们只承担品牌氛围，不承担主要信息。

背景元素要求：

- 透明度低
- 边缘柔和
- 不压在文字下
- 不干扰图片资产
- 每页可以不同，但必须共享材质和色温

### 2. 颜色从棕金转向 sage green

主色不再是厚重金棕，而是更清新的鼠尾草绿。金色仅作为温暖辅助色，用于少量徽标、提示和备份等可靠性场景。

### 3. 页面保留信息密度

Pixory 是资产管理工具，不做空泛展示页。升级时要保留搜索、筛选、状态、分组、标签、元数据等管理信息，但用更薄的控件和更清楚的层级承载。

### 4. 图片资产仍然是主角

任何背景装饰、卡片、按钮、插画都不能抢过用户导入的图片。列表页、详情页、最近查看、收藏、搜索结果都优先保证图片可扫读。

## Color Tokens

### Core

| Token | Hex | Usage |
| --- | --- | --- |
| `jpFresh.background.page` | `#FBF7EF` | 全局暖白纸感背景 |
| `jpFresh.background.washi` | `#F7F0E6` | 轻纸纹背景层 |
| `jpFresh.background.mist` | `#F3F7EF` | 淡绿色雾面背景层 |
| `jpFresh.surface.primary` | `#FFFDF8` | 主卡片、列表行、输入面 |
| `jpFresh.surface.secondary` | `#F8F3EA` | 分组区域、次级容器 |
| `jpFresh.surface.tinted` | `#F0F5EA` | 被选中或自然感区域 |
| `jpFresh.surface.sunken` | `#EFE9DE` | 输入、弱筛选、底层凹面 |
| `jpFresh.text.primary` | `#27312B` | 主文字 |
| `jpFresh.text.secondary` | `#68746A` | 次级文字 |
| `jpFresh.text.tertiary` | `#9AA397` | 辅助文字 |
| `jpFresh.text.inverse` | `#FFFFFF` | 主色按钮与图片浮层文字 |

### Accent

| Token | Hex | Usage |
| --- | --- | --- |
| `jpFresh.sage.700` | `#566B48` | 主按钮、当前 Tab、强选中 |
| `jpFresh.sage.600` | `#6F855D` | 主要图标、强调文字 |
| `jpFresh.sage.400` | `#9DAF8A` | 轻强调、图标底 |
| `jpFresh.sage.200` | `#DDE7D3` | chip、徽标、浅背景 |
| `jpFresh.sage.100` | `#EDF4E8` | 大面积浅绿背景 |
| `jpFresh.beige.300` | `#E6D8C2` | 纸张、分隔、温暖背景元素 |
| `jpFresh.beige.200` | `#F0E7D9` | 弱边框、表单背景 |
| `jpFresh.gold.500` | `#B8945A` | 可靠性提示、备份、少量暖强调 |
| `jpFresh.coral.500` | `#C96F5F` | 危险动作文字 |
| `jpFresh.coral.100` | `#FFF1ED` | 危险动作背景 |
| `jpFresh.sky.200` | `#DDEEF0` | 图片、搜索、信息提示的冷静辅助 |

### Borders And Overlays

| Token | Value | Usage |
| --- | --- | --- |
| `jpFresh.border.soft` | `#EFE7DA` | 卡片默认边框 |
| `jpFresh.border.sage` | `#D6E0CD` | 自然感边框 |
| `jpFresh.divider` | `rgba(104,116,106,0.14)` | 列表分隔 |
| `jpFresh.overlay.image` | `rgba(39,49,43,0.22)` | 图片文字浮层 |
| `jpFresh.overlay.surface` | `rgba(255,253,248,0.82)` | 半透明轻表面 |
| `jpFresh.decor.leaf` | `rgba(111,133,93,0.18)` | 背景植物线条 |
| `jpFresh.decor.paper` | `rgba(230,216,194,0.45)` | 背景纸张元素 |

## Typography Tokens

Pixory 标识可以使用优雅 serif；页面标题和中文内容以清晰 sans 为主。不要在普通中文界面中大量使用宋体，以免影响 Android 可读性。

| Token | Size | Weight | Line Height | Usage |
| --- | ---: | ---: | ---: | --- |
| `type.brand.logo` | `44` | `500` | `50` | Pixory wordmark |
| `type.brand.subtitle` | `15` | `400` | `22` | `IP 图像资产管理` |
| `type.page.title` | `24` | `600` | `32` | 页面标题 |
| `type.section.title` | `17` | `600` | `24` | 分区标题 |
| `type.card.title` | `22` | `600` | `30` | IP 卡片标题 |
| `type.body` | `14` | `400` | `22` | 正文 |
| `type.body.strong` | `14` | `600` | `22` | 重要正文 |
| `type.meta` | `12` | `400` | `18` | 元数据 |
| `type.caption` | `11` | `400` | `16` | 小标签 |
| `type.number` | `18` | `600` | `24` | 统计数字 |

## Spacing And Metrics

| Token | Value | Usage |
| --- | ---: | --- |
| `layout.pagePaddingHorizontal` | `22` | 手机页面左右留白 |
| `layout.pageTopOffset` | `28` | 状态栏下方起始距离 |
| `layout.sectionGap` | `22` | 页面分区间距 |
| `layout.blockGap` | `14` | 同区块内部间距 |
| `metrics.searchHeight` | `50` | 首页和搜索页搜索框 |
| `metrics.chipHeight` | `34` | 筛选 chip |
| `metrics.cardPadding` | `18` | 默认卡片内边距 |
| `metrics.iconButtonSize` | `48` | 主要图标按钮 |
| `metrics.bottomTabHeight` | `86` | 浮动底部 Tab |
| `metrics.ipCardImageHeight` | `168` | 首页 IP 卡图片高度 |

## Radius And Shadow

| Token | Value | Usage |
| --- | ---: | --- |
| `radius.sm` | `12` | 小 chip、小图标底 |
| `radius.md` | `18` | 搜索框、列表行 |
| `radius.lg` | `24` | 主卡片 |
| `radius.xl` | `30` | 首页 IP 卡、空状态卡 |
| `radius.pill` | `999` | chip、主按钮 |

阴影只用暖色弱阴影：

- `shadow.hairline`: 细边界，不产生悬浮感
- `shadow.card`: `0 8 24 rgba(93,76,52,0.08)`
- `shadow.floating`: `0 14 36 rgba(93,76,52,0.13)`

## Page Background Recipes

### Home

暖白纸底、右上植物枝叶、浅纸张折角、轻柔窗光。适合表达“整理资产的入口”。

### Groups

淡文件夹轮廓、纸质分隔、轻收纳格。适合表达“分类归档”。

### Tags

细标签纸、浅虚线、少量圆点贴纸感。适合表达“标记与检索”。

### Me

柔和本地存储盒、浅绿色安全感背景、极少量金色可靠性点缀。

### IP Detail

背景更弱，让封面和图片网格做主角。可使用浅纸张和胶片边暗示档案。

### Import / Create / Batch

使用更干净的纸面和低对比表单背景，减少装饰，强化流程可靠性。

### Image Detail

图片区域最大化，背景只做左右浅纸边和柔光，不引入会干扰看图的装饰。

### Trash

降低危险色面积，使用暖白和浅珊瑚提示风险。危险动作单独分层。

### Backup

使用浅金和 sage green 表达“完整、可信、可带走”，但仍保持本地离线语义。

## Component Rules

- 搜索框使用 warm white 表面、sage 低对比边框、轻阴影。
- filter chip 选中态用 sage green 实底，未选中态用 warm white。
- 主按钮使用 sage green；备份页可局部使用 muted gold。
- 底部 Tab 使用浮动 warm white 面板，当前 Tab 用 sage green 图标和短顶部指示线。
- 空状态卡片保留图标、标题、解释、主操作，但整体更轻。
- 表单页减少厚卡片，使用分区标题、薄输入框、底部固定主按钮。
- 图片卡片尽量少文字，使用小徽标和半透明图片浮层。

## Implementation Notes

后续代码实施建议：

1. 先把 `src/design/tokens/colors.ts` 映射到 `jpFresh` 色板。
2. 再调整 `metrics.searchHeight`、`metrics.ipCardImageHeight`、`bottomTabHeight`。
3. 首页、详情、图片网格、我的页优先改，因为它们决定整体观感。
4. 背景元素建议用 React Native 轻量组件实现：绝对定位的半透明 View、Image 或 SVG，不要引入网络资源。
5. 每页背景元素独立，但通过 token 控制颜色、透明度、尺寸和边界。
