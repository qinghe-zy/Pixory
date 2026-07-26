# Pixory

## Android 上的本地 AI 陪伴聊天与视觉资料库

Pixory 面向在 Android 上长期使用 AI 角色、整理 IP 资料、保存视觉素材和维护私有上下文的用户。它现在以陪伴型 AI 聊天为核心：角色卡、长线程、深度记忆、分支对话、本地材料、知识库检索和流式回复共同组成一个可持续使用的移动端 AI 工作台。

本地素材库仍然是 Pixory 的地基。图片、视频、IP 设定、文档、记忆和角色资产都优先落在本地 SQLite 与应用私有文件目录中，方便备份、迁移、回溯和继续喂给 AI 使用。

当前功能状态与实现边界以 [`docs/feature-matrix.md`](docs/feature-matrix.md) 为索引；2026-07-13 的源码级扫描证据、已知风险和后续增量复核方法保存在 [`docs/product-capability-baseline.md`](docs/product-capability-baseline.md)。

[访问官网](https://mist01.com/#download) · [服务器直下](https://mist01.com/downloads/Pixory-v2.6.9.apk) · [GitHub 备用](https://github.com/qinghe-zy/Pixory/releases/latest) · 当前版本 `2.6.9`

![Pixory preview](docs/assets/og-cover.png)

## 最新版本

### Pixory 2.6.9

这一版重做长期记忆的底层链路，重点是让聊天更连贯、记忆更可控，同时避免普通聊天多花远程模型调用：

- 新增可重建的 Memory v1 事件账本、Working/Confirmed/Archive 三层治理与低噪声检索；未配置 Embedding 也能正常聊天。
- 简化记忆看板，确认、编辑、删除和作用域修改会真实影响后续对话；默认导出新版原生包，也兼容旧包导入。
- 强化 Personal、本地轻抽取、思考内容隔离、外部迁移审核和删除恢复边界；普通聊天不为每句话额外调用远程记忆模型。

### Pixory 2.6.4

这一版把 AI 聊天里的接话辅助、续答分流和产品文档阅读链路一起补齐，重点是让“继续聊”和“参考文档”都更自然可用：

- 新增 `AI 帮答`，支持短句/长句候选、刷新分页和一键回填输入框，用户不知道怎么接时可以直接借力。
- 已完成的 AI 回复支持续答生成下一条；续答后还能切到回复分支，从历史消息重新接话更自然。
- 关于页新增内置产品文档阅读，首次进入会后台预取官网图片并本地缓存，同时修复旧坏缓存导致的断图问题。

### Pixory 2.6.3

这一版集中收口 AI 聊天里“长回复继续生成 + 回看历史 + 返回最新”的连贯性问题，也顺手把聊天页顶部入口做得更顺手：

- AI 聊天流式 tail replay 改为更稳定的单气泡续接，回看历史时减少中间断裂、操作行插入和内容重叠。
- 已停止或失败且有正文的 AI 回复，现在可以直接继续生成，尽量无缝接着写下去。
- 聊天页综合记录、搜索、新会话和回到最新按钮交互一起优化，长聊天阅读与回到底部更自然。

### Pixory 2.6.2

这一版集中修复竖屏连续刷视频时的两个体验问题，重点是把“切回上一条又像立刻播完一样跳走”和“上下滑切换时封面闪烁/串位”一起收口：

- 修复已播完视频回切时恢复到末尾附近，重新触发播完并立刻跳走的问题。
- 优化竖屏上下滑切换时的封面和换源时机，让当前画面先完整退出，再由下一条接管。
- 补充针对视频末尾恢复和切换时序的回归测试，降低播放器体验回退风险。

### Pixory 2.6.0

这一版针对聊天体验与安全性进行了打磨，主要是为 Markdown 与多模态引入了更现代、稳健的基础渲染链路：

- 全新 Markdown 渲染引擎：支持复杂的语法解析，全面杜绝恶意标签注入风险。
- 原生图片画廊：发送的图片会在聊天流中以真实缩略图画廊的形式展示，而不是原先的纯文本附件提示，界面更清晰更美观。
- 信任用户意图：无论本地记录的模型是否支持视觉，当用户主动附带图片时，均会强行发送给大模型进行验证。
- 深度修复体验细节：全面修复了编辑、重写分支下的附件状态遗失和变量极限崩溃问题。

### Pixory 2.5.1

这一版围绕“把外部对话安全接回 Pixory 并继续聊”收口，同时补齐附件回放、模型配置清理和播放器修复。

2026-06-24 已推送同版本 OTA 热更新，这次热修进一步把连续性导入链路收口到真实可用状态：

- 新增连续性导入：支持读取 Pixory 原生续聊包，也支持把其他平台整理出的迁移文档接回当前线程继续聊天。
- 导入内容会走记忆模型审读、结构提取和分支承接，避免把外部上下文直接粗暴写入长期记忆。
- 外部 `txt/md` 在本地解析不足时，会自动走记忆模型做结构恢复；Pixory 原生续聊包仍保持纯文件切分精确导入。
- 导入评审结果现在会显式分流到 summary / profile / formal memory，而不是只落成可回滚摘要承接物。
- 聊天页顶部的接回提示缩成小提示条，只有回退窗口内显示；会话设置里的“导入角色卡”也已改成直接导入并应用当前会话。
- 聊天附件现在会持久化保存，重试、再生成和后续回放都能重新附带原始图片或文档上下文。
- Provider 模型设置支持长按多选、批量删除、同来源一键清理，并自动清理默认值与会话悬挂引用；同时修复视频播放器随机逻辑。

下载地址：

- 服务器直下（最新版 APK）：[https://mist01.com/downloads/Pixory-v2.6.9.apk](https://mist01.com/downloads/Pixory-v2.6.9.apk)
- GitHub 备用与历史版本：[https://github.com/qinghe-zy/Pixory/releases/latest](https://github.com/qinghe-zy/Pixory/releases/latest)

## 产品定位

Pixory 更接近一个“本地 AI 角色工作台 + 随身视觉资料库”。核心不是单次问答，而是长期陪伴、角色一致性、资料可追溯和上下文连续：

- 用角色卡、首句、头像、提示词和 SillyTavern 兼容导入导出管理 AI 角色。
- 用长线程、分支、再生成、重写和搜索保留每段对话的演化路线。
- 用深度记忆、用户画像、摘要片段和可编辑记忆板维持长期一致性。
- 用 IP、知识库、线程材料、PDF/DOCX/Markdown/TXT 和引用支撑资料型对话。
- 用本地素材库管理角色图、设定图、视频、标签、备注、分组和备份。
- 用普通空间与 personal 隐私空间隔离敏感聊天、角色和素材。

核心资产管理流程以本地数据为基础：SQLite 保存结构化信息，本地文件系统保存原图、视频、缩略图、备份和临时文件。

## 适合谁

| 用户 | Pixory 解决的问题 |
| --- | --- |
| AI 角色与陪伴聊天用户 | 角色卡、长期记忆、分支对话和上下文导出让角色不容易“聊散”。 |
| SillyTavern 用户 | 支持导入角色卡，并可导出兼容 PNG 与续聊 Markdown，方便跨平台延续人设。 |
| IP 创作者 | 角色立绘、设定图、场景图、表情包和活动视觉可以按 IP 长期归档。 |
| 写作/设定整理者 | 把 PDF、DOCX、Markdown、TXT、手动文本和 IP 快照作为 AI 可引用材料。 |
| 内容运营 | 节日、活动、投放、社媒用途素材可以快速筛选和复用。 |
| 品牌视觉管理者 | 不同品牌形象和视觉资产集合可以分开维护，减少重复和错用。 |
| 个人收藏用户 | 大量图片和视频可以从系统相册时间流里整理出来，降低散落和误删风险。 |
| 小团队资料整理者 | 通过备份包、资源包、导入记录和本地知识材料交接上下文。 |

## 核心体验

### 1. 陪伴型 AI 聊天是主入口

Pixory 的 AI 聊天支持普通聊天、角色聊天、IP 绑定聊天和知识库绑定聊天。每个线程可以保存模型配置、角色快照、提示词、回复偏好、是否关闭 thinking、当前分支路线和资料范围。

长回复使用独立 streaming runtime：provider delta 先进入外部缓冲，前台 UI 自适应刷新，SQLite partial persist 降频，停止、错误、完成、后台和 route blur 时强制 flush。目标是让几百轮以后仍然能读、能停、能恢复。

### 2. 角色卡、SillyTavern 和续聊导出

角色卡是一等数据。Pixory 支持手动角色卡，也支持 SillyTavern PNG/JSON/V1/V2/V3 导入，保留高级源数据，提取描述、性格、场景、首句、alternate greetings、世界书文本和头像。

导出时可以生成兼容 SillyTavern 的 PNG，也可以另存续聊 Markdown，把系统人设、记忆快照、当前分支上下文和使用说明分开，方便在不同平台保持角色一致性。

### 3. 深度记忆和可控上下文

Pixory 的记忆不是简单追加文本。系统区分全局、线程、角色、IP、知识库等作用域，支持自动捕获、手动编辑、撤销、标记不准、stale/delete 状态、用户画像和摘要片段。

记忆维护会在回复完成、离开聊天、应用后台或手动触发时低频运行，避免阻塞首 token。进入 prompt 前会按 scope、查询和预算筛选，降低长期聊天越聊越慢的问题。

### 4. 本地材料、知识库和可引用资料

一个 IP 可以是角色、品牌、主题、视觉身份、活动项目或创意系列。每个 IP 都能拥有自己的封面、图片、视频、分组、标签、备注、收藏和统计信息。

AI 可以绑定 IP 或知识库，使用线程材料、IP 快照、手动文本、TXT、Markdown、PDF 和 DOCX 片段作为检索上下文。资料型对话会带 citation，严格资料模式下不会把未检索到的内容伪装成来源。

### 5. 分支对话、再生成和搜索

编辑早期用户消息、重写或再生成 assistant 回复时，Pixory 不直接破坏后续历史，而是保留 message version 和 branch scope。用户可以在分支树里查看路线、切换版本、采用主线，也可以在当前分支范围内搜索。

### 6. IP 作为长期资料库

打开 IP 时，看到的是围绕同一主题沉淀下来的资料：原图、视频、备注、标签、分组、收藏、最近查看和可生成给 AI 使用的 IP 快照。

### 7. 批量导入后集中整理

Pixory 支持图片和视频批量导入。导入时会复制原始文件到应用私有目录，生成独立缩略图或视频封面，读取尺寸、时长、MIME、文件大小等元数据，并记录导入批次。

导入后的整理可以继续完成：

- 分配 IP 和分组。
- 添加标签、备注和收藏状态。
- 检查未分组、未标记、无备注或疑似重复素材。
- 在导入批次中查看成功、失败、跳过和重复明细。

### 8. 标签、分组、备注分工清楚

分组适合表达素材在 IP 内的位置，例如春日设定、活动海报、角色服饰、场景背景。标签适合表达可复用线索，例如配色、角度、道具、情绪和用途。备注适合记录来源、判断、修改意见和后续使用提醒。

这套结构可以很轻，也可以很细。用户可以先把素材收进来，再逐步完善整理信息。

### 9. 搜索、收藏、最近查看让素材可回到手边

Pixory 提供全局搜索、标签结果页、全部图片、全局分组、收藏和最近查看。素材越多，入口越重要；常用内容、近期关注内容和特定标签下的内容都能更快找回。

### 10. 重复检查和回收站控制资料库质量

长期素材库最容易出现重复保存和误删。Pixory 支持精确重复与相似图片检查，删除内容默认先进入回收站。用户可以恢复误删素材，也可以在确认后清空。

### 11. 备份、导入和资源包面向迁移

Pixory 的备份目标是逐步覆盖完整资料库。当前普通空间备份包含数据库、原图、缩略图和 manifest；数据库中的 AI 线程、消息、记忆、角色卡和材料索引会随数据库进入备份。

当前仍有明确边界：受管 AI 文档原文件、聊天附件文件和角色头像文件尚未完整复制进备份包。换机或重装前，应另外保留这些文件的原始来源；在该缺口补齐并完成真实设备恢复验证前，不应把当前备份理解为所有 AI 文件均可完整迁移。

当前支持：

- 普通空间数据库与素材文件备份。
- 单 IP 备份。
- 普通备份包合并导入。
- personal 加密包导入。
- `.zip` 和 `.pixorypack` 资源包导入。
- 通过系统目录导出备份。
- 导入时重建 IP、分组、素材、标签、批次和封面关系。

### 12. 隐私空间隔离敏感资料

Pixory 提供普通空间和 personal 隐私空间。隐私空间拥有独立数据库、独立文件目录和密码验证流程，支持锁定、切回普通模式、修改密码、重置和后台超时锁定；当前版本允许系统截屏，避免影响用户主动验收、记录和反馈问题。

它适合把个人敏感素材从普通资料库中分离出来，减少误展示和误操作。

### 13. 外部入口接住真实使用场景

Pixory 支持从 Android 系统入口接收内容：

- 从系统分享入口收集图片和视频。
- 外部视频可以进入 Pixory 播放器。
- ZIP、CBZ 等压缩包可进入阅读入口。
- `.pixorypack` 可识别为 Pixory 资源包。

这让素材不只从应用内选择，也能从系统分享、文件和外部打开流程进入 Pixory。

### 14. 多模型供应商但数据边界清楚

Pixory 支持 DeepSeek、OpenAI/OpenAI-compatible、Gemini 和 Claude。API Key 存在 SecureStore；聊天内容、记忆、角色卡、材料和索引默认保存在本机。发起模型请求时，必要 prompt 会发送到用户配置的模型供应商，因此敏感资料是否参与模型请求由用户的空间、线程、材料和供应商设置共同决定。

## 功能总览

| 模块 | 当前能力 |
| --- | --- |
| AI 陪伴聊天 | 长线程、流式回复、停止、重试、再生成、重写、分支路线、聊天搜索 |
| 角色卡 | 手动角色、SillyTavern PNG/JSON 导入、兼容 PNG 导出、续聊 Markdown、头像、首句 |
| 深度记忆 | 自动捕获、手动记忆、记忆板、用户画像、摘要片段、作用域、撤销，以及通过续聊 Markdown 审读导入/导出当前连续性记忆 |
| Prompt/缓存 | fast-path、分层 retrieval、真实上下文窗口、stable prefix/cache key 保护 |
| 资料与知识库 | 手动文本、TXT、Markdown、PDF、DOCX、IP 快照、线程材料、引用 |
| 模型供应商 | DeepSeek、OpenAI/OpenAI-compatible、Gemini、Claude、手动模型、SecureStore API Key |
| IP 资产库 | 创建、编辑、收藏、封面、统计、删除、详情 |
| 图片资产 | 批量导入、原图保存、缩略图、详情、编辑、收藏、备注 |
| 视频资产 | 批量导入、封面生成、详情、播放、进度记录 |
| 分组管理 | IP 内分组、全局分组、分组封面、置顶 |
| 标签系统 | 创建、搜索、筛选、添加、移除、标签结果页 |
| 搜索筛选 | 全局搜索、标签结果、收藏、最近查看、排序、筛选 |
| 批量整理 | 批量选择、快速整理、导入批次、批量编辑 |
| 重复检查 | 内容 hash、视觉 hash、精确重复、相似图片复核 |
| 回收站 | 软删除、恢复、清空、过期清理、清理失败记录 |
| 备份导入 | 部分覆盖：数据库、原图、缩略图、IP 备份、备份导入、加密包、资源包导入；AI 文档/附件/角色头像文件待补齐 |
| 存储管理 | 原图、预览、临时缓存、备份、回收站、按 IP 统计 |
| 隐私空间 | 独立数据库、独立文件目录、密码、锁定、允许截屏 |
| 外部入口 | 系统分享收集、外部视频打开、压缩包阅读入口 |
| 更新公告 | 远程更新 JSON、远程公告 JSON、应用内提示 |

## 数据如何保存

Pixory 使用本地 SQLite 保存结构化数据，使用本地文件系统保存原图、视频、缩略图、导出和临时文件。

```text
AppData/
├─ database/
│  ├─ pixory.sqlite
│  └─ pixory_personal.sqlite
├─ assets/
│  └─ originals/
├─ thumbnails/
├─ exports/
├─ temp/
├─ ai_documents/
└─ ai_role_avatars/
```

原始素材、预览缓存、备份导出、回收站和临时文件分目录管理。存储页面可以查看总占用、图片/视频数量、按 IP 占用和备份导出项。

## 下载与安装

最新版 Android APK：

- 服务器直下（最新版 APK）：[https://mist01.com/downloads/Pixory-v2.6.9.apk](https://mist01.com/downloads/Pixory-v2.6.9.apk)
- GitHub 备用与历史版本：[https://github.com/qinghe-zy/Pixory/releases/latest](https://github.com/qinghe-zy/Pixory/releases/latest)

安装流程：

1. 从官网获取区使用服务器直下入口；如果网络不稳定，可切换到 GitHub 备用入口。
2. 下载 APK 到 Android 设备。
3. 按系统提示安装。
4. 首次使用时授予所需的图片、视频或文件访问权限。

官网：

[https://mist01.com/](https://mist01.com/)

## 仓库内容

```text
src/                         应用页面、组件、服务、数据库访问、hooks 和工具函数
src/ai/                      资料辅助、模型供应商、检索、会话和知识库相关代码
src/design/tokens/           颜色、间距、字号、圆角、节奏等设计 token
assets/                      应用图标、背景图和随包视觉资源
plugins/                     Android 集成相关的 Expo config plugin
patches/                     项目依赖补丁
docs/                        官网、远程更新 JSON、公告 JSON 和静态站点文件
docs/feature-matrix.md       当前功能状态、入口、边界和维护规则
docs/product-capability-baseline.md  源码审计基线、已知风险和增量复核方法
docs/update-version.json     应用内更新信息
docs/announcement.json       应用内公告信息
app.json                     Expo 应用配置
eas.json                     EAS 构建配置
package.json                 脚本、依赖和版本号
```

生成的 APK、本地调试截图、临时日志、私有规划文档和构建产物保留在发布资产或本地工作区。

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
- Expo File System、Image Picker、Media Library、Document Picker、Video、Secure Store 等本地能力
- Android 原生模块用于大文件流式复制、视频元数据、视频封面、PDF 处理、SAF 导出和外部入口

## 发布与维护

Android APK 的默认下载从 `mist01.com` 服务器直下最新版，服务器只保留当前最新 APK；GitHub Releases 保留备用下载和历史版本：

- 服务器直下（最新版 APK）：[https://mist01.com/downloads/Pixory-v2.6.9.apk](https://mist01.com/downloads/Pixory-v2.6.9.apk)
- GitHub 备用与历史版本：[https://github.com/qinghe-zy/Pixory/releases](https://github.com/qinghe-zy/Pixory/releases)

应用内更新读取：

```text
docs/update-version.json
```

应用内公告读取：

```text
docs/announcement.json
```

维护发布信息时，需要保持版本号、版本码、服务器 APK 文件名、Release 页面和远程 JSON 一致。先运行 `pnpm release:android`，它会 clean、仅构建真机 ARM ABI 并拒绝含模拟器 ABI 的产物；部署官网时可用 `scripts/deploy-docs-mist01.ps1 -ApkPath output/release/Pixory-v2.6.9.apk -Version 2.6.9` 上传最新版 APK，并清理服务器旧 APK。

## 产品原则

Pixory 的优先级是：

```text
本地可靠性
> 原始文件安全
> 数据一致性
> 简单清晰的用户体验
> 精致克制的移动端界面
> 后续扩展能力
```

开发时应保持这些边界：

- 导入原图后保留独立原始文件。
- 缩略图和封面只作为预览，不替代原图。
- 结构化数据进入 SQLite，大文件进入本地文件系统。
- 删除默认进入回收站，彻底删除需要明确动作。
- 核心资产管理流程在离线环境下可用。
- 隐私空间按本地隔离、密码校验、后台锁定和允许截屏描述。

## 反馈

问题、建议和版本反馈可以通过 GitHub Issues 提交：

[https://github.com/qinghe-zy/Pixory/issues](https://github.com/qinghe-zy/Pixory/issues)
