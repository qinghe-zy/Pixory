# Pixory Japanese Fresh Token Reference

更新时间：2026-05-06

## 使用方式

这份文档是 `src/design/tokens/japaneseFresh.ts` 的实现参考。后续真正替换现有 token 时，应优先保持现有导入路径稳定，例如继续从 `src/design/tokens/index.ts` 导出 `colors`、`layout`、`componentTokens`，避免大范围改业务页面 import。

## Palette

### Background

| Name | Hex | Use |
| --- | --- | --- |
| `page` | `#FBF7EF` | App 背景 |
| `washi` | `#F7F0E6` | 纸感浅层 |
| `mist` | `#F3F7EF` | 淡绿色背景雾面 |

### Surface

| Name | Hex | Use |
| --- | --- | --- |
| `primary` | `#FFFDF8` | 卡片、列表、底部栏 |
| `secondary` | `#F8F3EA` | 分区、表单底 |
| `tinted` | `#F0F5EA` | 选中弱底、提示弱底 |
| `sunken` | `#EFE9DE` | 输入、凹面、弱筛选 |

### Text

| Name | Hex | Use |
| --- | --- | --- |
| `primary` | `#27312B` | 主文字 |
| `secondary` | `#68746A` | 次级文字 |
| `tertiary` | `#9AA397` | 说明、placeholder |
| `inverse` | `#FFFFFF` | 图片浮层、主按钮 |

### Accent

| Name | Hex | Use |
| --- | --- | --- |
| `sage700` | `#566B48` | 主按钮、当前 tab、强选中 |
| `sage600` | `#6F855D` | 图标、强调文字 |
| `sage400` | `#9DAF8A` | 次强调、淡图标 |
| `sage200` | `#DDE7D3` | chip 弱底 |
| `sage100` | `#EDF4E8` | notice 背景 |
| `beige300` | `#E6D8C2` | 背景纸张元素 |
| `beige200` | `#F0E7D9` | 边框、弱分隔 |
| `gold500` | `#B8945A` | 备份、收藏星标的少量暖强调 |
| `coral500` | `#C96F5F` | 删除、清空 |
| `coral100` | `#FFF1ED` | 删除弱底 |
| `sky200` | `#DDEEF0` | 搜索、信息提示辅助 |

## Semantic Mapping

| Current Token | New Value |
| --- | --- |
| `colors.background.page` | `#FBF7EF` |
| `colors.background.surface` | `#FFFDF8` |
| `colors.background.secondary` | `#F8F3EA` |
| `colors.background.input` | `#FFFDF8` |
| `colors.background.empty` | `#F0F5EA` |
| `colors.primary.default` | `#566B48` |
| `colors.primary.active` | `#45563A` |
| `colors.primary.weak` | `#DDE7D3` |
| `colors.primary.light` | `#9DAF8A` |
| `colors.text.title` | `#27312B` |
| `colors.text.body` | `#27312B` |
| `colors.text.secondary` | `#68746A` |
| `colors.text.placeholder` | `#9AA397` |
| `colors.border.subtle` | `#EFE7DA` |
| `colors.border.default` | `#E2D8C8` |
| `colors.semantic.favorite` | `#B8945A` |
| `colors.semantic.success` | `#6F855D` |
| `colors.semantic.danger` | `#C96F5F` |

## Component Metrics

| Component | Token | Value | Reason |
| --- | --- | ---: | --- |
| SearchBar | `height` | `50` | 比旧版更有呼吸，但仍适合单手触控 |
| FilterChip | `height` | `34` | 保持筛选轻，不压过图片 |
| IconButton | `size` | `48` | Android touch target 友好 |
| BottomTab | `height` | `86` | 浮动感和安全区空间 |
| IPCard | `imageHeight` | `168` | 首页让图片成为主角 |
| ThumbnailTile | `gap` | `8` | 三列网格稳定扫读 |
| FormField | `height` | `50` | 表单可读且不过厚 |
| BottomAction | `height` | `52` | 主操作明确 |

## Radius

| Token | Value | Use |
| --- | ---: | --- |
| `sm` | `12` | chip、小图标底 |
| `md` | `18` | 输入框、列表行 |
| `lg` | `24` | 普通卡片 |
| `xl` | `30` | 空状态、首页卡片 |
| `pill` | `999` | chip、按钮 |

注意：卡片圆角不要继续无限变大。Pixory 需要精致，不需要玩具感。

## Shadows

React Native 建议：

```ts
card: {
  shadowColor: '#5D4C34',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 24,
  elevation: 2,
}
```

```ts
floating: {
  shadowColor: '#5D4C34',
  shadowOffset: { width: 0, height: 14 },
  shadowOpacity: 0.13,
  shadowRadius: 36,
  elevation: 4,
}
```

规则：

- 普通列表行不用阴影。
- 空状态和首页 IP 卡可以用 `card`。
- 底部 Tab 和 ActionBar 用 `floating`。
- 不做多层叠影。

## Typography

| Style | Size | Weight | Line Height | Use |
| --- | ---: | ---: | ---: | --- |
| `brandLogo` | `44` | `500` | `50` | Pixory wordmark |
| `brandSubtitle` | `15` | `400` | `22` | IP 图像资产管理 |
| `pageTitle` | `24` | `600` | `32` | 我的、标签、图片库 |
| `sectionTitle` | `17` | `600` | `24` | 管理摘要、快速操作 |
| `cardTitle` | `22` | `600` | `30` | IP 卡片标题 |
| `body` | `14` | `400` | `22` | 正文 |
| `meta` | `12` | `400` | `18` | 元数据 |
| `caption` | `11` | `400` | `16` | 小说明 |

性能和兼容建议：

- Android 默认使用系统 sans。品牌 `Pixory` 可使用 serif fallback。
- 不要为中文加载大体积自定义字体，除非后续明确做字体子集化。
- 不使用负 letter spacing。

## Background Tokens

```ts
export const backgroundElements = {
  botanicalBranch: require('../../assets/backgrounds/japanese-fresh/elements/botanical-branch.png'),
  washiPaperCorner: require('../../assets/backgrounds/japanese-fresh/elements/washi-paper-corner.png'),
  dotIndexGrid: require('../../assets/backgrounds/japanese-fresh/elements/dot-index-grid.png'),
} as const;
```

当前实现使用 `src/design/backgrounds.ts` 维护静态 require 和 10 个场景配方。页面只传 `backgroundVariant`，定位逻辑集中在 `PageBackground` 中按 `useWindowDimensions()` 与 `safeAreaInsets.bottom` 计算，不在页面里到处写判断。
