# Pixory Background Asset Spec

更新时间：2026-05-06

## 目的

这份规范用于生成和接入 Pixory 新视觉方向中的页面背景图片。背景图片是可打包进 App 的静态资产，不是效果图截图。

## 资产原则

- 不包含状态栏、导航栏、手机边框。
- 不包含页面 UI、按钮、输入框、卡片、图标、文字或 Logo。
- 不包含云、账号、同步、社交、AI 生成等语义。
- 不依赖网络资源。
- 背景元素必须低对比，不能影响页面文字、图片资产和操作控件。
- 每张背景支持多页面复用，不为每个页面单独做完全不同的重资产背景。

## 推荐场景资产

| Asset | Pages | Intent |
| --- | --- | --- |
| `bg-home-botanical` | 首页、启动后首页 | Pixory 品牌入口、植物、纸张、清晨光 |
| `bg-archive-folder` | 分组、新建分组、IP 详情局部 | 本地归档、文件夹、收纳 |
| `bg-tags-stationery` | 标签、标签结果 | 标签纸、虚线、轻检索 |
| `bg-profile-storage` | 我的、隐私、本地空间 | 本地安全、存储盒、可信 |
| `bg-gallery-film` | 图片库、收藏、最近查看、图片列表 | 图片资产、胶片边、联系表 |
| `bg-workflow-import` | 导入图片、待整理、批量管理 | 导入整理、流程、托盘 |
| `bg-search-index` | 全局搜索、搜索结果 | 索引、查找、结果定位 |
| `bg-trash-soft-warning` | 回收站 | 软删除、风险提示但不过度刺眼 |
| `bg-backup-manifest` | 备份导出 | 完整备份、manifest、可带走 |
| `bg-detail-minimal` | 图片详情、元数据 | 看图优先、极简纸边和柔光 |

## 尺寸规范

生成母版后导出 3 个手机比例版本：

| Variant | Size | Use |
| --- | ---: | --- |
| `short` | `1080x1920` | 16:9 到 18:9 较短屏 |
| `standard` | `1080x2400` | 20:9 主流 Android |
| `tall` | `1080x2520` | 21:9 长屏 |

母版保存到 `assets/backgrounds/japanese-fresh/master/`。

裁切版本保存到：

```text
assets/backgrounds/japanese-fresh/short/
assets/backgrounds/japanese-fresh/standard/
assets/backgrounds/japanese-fresh/tall/
```

## 安全区

背景生成时遵守下面的安全区：

- 中央 64% 宽度保持低纹理和低对比。
- 顶部允许有植物、纸张、光影，但不能形成强边界。
- 底部 18% 不放关键装饰，避免和底部 Tab / fixed action 冲突。
- 左右边缘可以有淡纸边、胶片边、网格线，方便 `cover` 裁切。

## 接入建议

React Native 中优先用 `ImageBackground` 或绝对定位 `Image`：

```tsx
<ImageBackground
  source={backgrounds.home}
  resizeMode="cover"
  style={StyleSheet.absoluteFill}
/>
```

页面内容层需继续使用 token 控制卡片、边框和透明表面，不要把所有视觉层级都烘焙进背景图。

## 文件大小目标

- 单张 1080px 宽 PNG 尽量控制在 600 KB 以内。
- 如果 PNG 太大，后续实现可评估 WebP，但 Expo / Android 打包兼容性要先验证。
- 背景不应携带透明通道，使用普通 RGB 即可。

## 验收标准

- 任意页面叠加白色/暖白卡片后仍清楚可读。
- 中央安全区没有高对比物体穿过正文。
- 短屏、标准屏、长屏裁切后都没有明显缺角或主体被截断。
- 背景看起来属于同一套系统，但场景之间有轻微差异。
