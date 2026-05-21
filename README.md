# Pixory

Pixory 是一款面向 Android 的本地视觉资产管理应用。

它适合把角色、IP、品牌视觉、参考图、阶段稿、视频片段和长期积累的素材整理成一个清楚、可回看的私人资料库。重点放在保存后的秩序：位置、语境和来处。

[访问官网](https://mist01.com/) · [下载最新版 APK](https://github.com/qinghe-zy/Pixory/releases/latest)

![Pixory preview](docs/assets/og-cover.png)

## 你可以用 Pixory 做什么

如果你的手机里已经有大量图片素材，Pixory 可以帮你把它们从相册的时间流里重新整理出来：

- 按 IP、角色、主题、品牌或项目建立独立资料库。
- 把图片放进分组，例如季节、场景、节日、用途或自定义分类。
- 给图片加标签、备注、收藏状态，保留文件名、尺寸、大小、类型等基础信息。
- 批量导入素材，并在导入后集中检查、整理、分组。
- 搜索 IP、图片、标签和备注，快速找回曾经保存过的内容。
- 查看最近浏览、收藏内容、全部图片、全局分组和标签总览。
- 对重复或相近素材做检查，减少反复保存造成的混乱。
- 通过回收站恢复误删内容，再决定是否彻底清理。
- 导出本地备份，保留数据库、原图、缩略图和清单。

Pixory 的核心使用场景是“长期保存”和“反复回看”。它更像一个随身视觉档案柜。

## 适合谁

Pixory 更适合这些用户：

- 需要长期管理角色设定、IP 形象、参考图或素材库的创作者。
- 需要把图片按主题、用途和项目整理起来的设计、运营、内容团队成员。
- 不希望素材完全散在系统相册里，希望保留一套自己的整理秩序。
- 重视原图完整性，希望导入后仍能保留清楚的文件来源和元数据。
- 经常在手机上浏览、筛选、收藏和复用素材的人。

如果你的需求只是简单浏览系统相册，系统相册已经足够。Pixory 更关注“保存后如何管理”。

## 核心体验

### 1. 用 IP 建立第一层秩序

Pixory 用 IP 作为最上层的整理单位。一个 IP 可以是角色、视觉身份、品牌图形、主题系列、活动素材或任何你希望长期维护的图片集合。

每个 IP 可以拥有自己的封面、分组、图片、视频、标签和整理记录。打开一个 IP 时，你看到的是围绕同一主题沉淀下来的素材。

### 2. 批量导入后再集中整理

导入图片时，Pixory 会把原图复制到应用的私有本地目录，再生成独立缩略图并记录元数据。

典型流程是：

```text
选择图片
→ 复制原图到本地私有目录
→ 读取尺寸、大小、类型等信息
→ 生成独立缩略图
→ 写入 SQLite 数据库
→ 分配 IP、分组、标签和备注
→ 查看导入结果
```

这让批量导入后的整理更可控。你可以先把素材收进来，再逐步分组、标记、收藏或清理。

### 3. 分组、标签和备注各司其职

Pixory 不要求你提前设计复杂分类体系。

- 分组适合表达图片在一个 IP 内的位置，例如春日设定、海报包装、节日视觉、角色服饰。
- 标签适合表达可复用的特征，例如配色、角度、道具、情绪、用途。
- 备注适合记录判断、来源、修改意见或后续使用提醒。

这三层信息可以分开使用，也可以一起使用。整理的粒度由你决定。

### 4. 原图与预览分离

Pixory 会保存导入原图，同时为列表、封面和快速浏览生成独立预览文件。

原图用于长期保存和导出，缩略图用于提高浏览速度。两者分开管理，避免把预览文件当成真实素材使用。

### 5. 回收站给误删留余地

删除图片时，Pixory 默认先进入回收站状态。你可以恢复，也可以在确认后清空。

这个设计适合素材管理场景：很多图片短期看似没用，过一段时间可能又需要找回来。

### 6. 备份关注完整迁移

Pixory 的备份目标是保留完整资料库：

- SQLite 数据库
- 原图文件夹
- 缩略图文件夹
- 备份清单

这样迁移时能保留图片、分组、标签、备注、收藏和其他整理结果。

### 7. 视频素材也可以进入同一套秩序

Pixory 支持本地视频导入、封面生成、详情查看和播放记录。对于角色演示、动态参考、短片段素材，可以和图片放在同一个 IP 语境里管理。

### 8. 可选的素材问答与资料辅助

Pixory 包含面向素材整理的问答和资料辅助模块，用于围绕已整理内容进行检索、阅读和对话。核心仍是本地资料库。

相关能力依赖用户自行配置的模型供应商和 API key。核心图片管理流程不依赖这些能力。

## 数据保存在什么地方

Pixory 是本地优先的应用。核心数据保存在设备内：

```text
AppData/
├─ database/
│  └─ pixory.sqlite
├─ assets/
│  └─ originals/
│     └─ ip_{ipId}/
├─ thumbnails/
│  └─ ip_{ipId}/
├─ exports/
└─ temp/
```

结构化信息写入 SQLite，图片和视频文件保存在本地文件系统。导入后的记录不依赖相册中的临时 URI。

## 下载与安装

当前发布版：`2.1.6`

下载地址：

[https://github.com/qinghe-zy/Pixory/releases/latest](https://github.com/qinghe-zy/Pixory/releases/latest)

安装说明：

1. 打开最新 GitHub Release。
2. 下载 APK 文件到 Android 设备。
3. 按系统提示安装。
4. 首次使用时，根据需要授予图片或文件访问权限。

官网：

[https://mist01.com/](https://mist01.com/)

## 仓库内容

这个仓库包含 Pixory 的应用源码、官网页面和发布元数据。

```text
src/                         应用页面、组件、服务、数据库访问、hooks 和工具函数
src/design/tokens/           颜色、间距、字号、圆角、节奏等设计 token
assets/                      应用图标、背景图和随包视觉资源
plugins/                     Android 集成相关的 Expo config plugin
patches/                     项目依赖补丁
docs/                        官网、远程更新 JSON、公告 JSON 和 GitHub Pages 文件
docs/update-version.json     应用内更新信息
docs/announcement.json       应用内公告信息
app.json                     Expo 应用配置
eas.json                     EAS 构建配置
package.json                 脚本、依赖和版本号
```

生成的 APK、本地调试截图、临时日志、私有规划文档和构建产物不放在 `main` 分支。

## 本地开发

环境要求：

- Node.js
- pnpm
- Android Studio 或可用的 Android 设备 / 模拟器
- Expo 相关本地环境

安装依赖：

```bash
pnpm install
```

启动 Expo：

```bash
pnpm start
```

启动 Android：

```bash
pnpm android
```

清缓存启动 Android：

```bash
pnpm run acceptance:android
```

TypeScript 检查：

```bash
pnpm run typecheck
```

测试：

```bash
pnpm test
```

依赖兼容性检查：

```bash
pnpm run doctor
```

## 技术栈

- Expo 54
- React Native 0.81
- React 19
- TypeScript
- SQLite
- React Native 本地页面与导航组织
- Expo File System、Image Picker、Media Library、Document Picker、Video、Secure Store 等本地能力
- 轻量 Expo config plugin，用于 Pixory Android 媒体集成

## 发布与维护

Android APK 通过 GitHub Releases 发布：

[https://github.com/qinghe-zy/Pixory/releases](https://github.com/qinghe-zy/Pixory/releases)

应用内更新读取：

```text
docs/update-version.json
```

应用内公告读取：

```text
docs/announcement.json
```

维护发布信息时，需要保持版本号、版本码、Release 页面和远程 JSON 一致。

## 开发原则

Pixory 的优先级是：

```text
本地可靠
> 原始素材安全
> 数据一致
> 简单可用
> 界面干净
> 后续扩展
```

开发时应避免破坏这些原则：

- 导入原图后保留独立原始文件。
- 缩略图只作为预览，不替代原图。
- 结构化数据进入 SQLite，大文件进入本地文件系统。
- 删除默认进入回收站，彻底删除需要明确动作。
- 核心整理流程在离线环境下可用。
- 保持素材管理的边界清楚，避免变成云相册、社交流或临时文件浏览器。

## 反馈

问题、建议和版本反馈可以通过 GitHub Issues 提交：

[https://github.com/qinghe-zy/Pixory/issues](https://github.com/qinghe-zy/Pixory/issues)
