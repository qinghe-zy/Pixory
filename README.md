# Pixory

## 本地优先的陪伴式 AI 与个人材料工作台

Pixory 是一个 Android-first 的本地优先应用，核心是可以长期继续的 AI 陪伴聊天：角色卡、长线程、记忆、分支对话、IP/知识库材料、可恢复流式生成和 Personal 私密空间共同构成完整体验。

图片、视频、角色头像、AI 文档和 IP 资料库是这套体验的本地材料底座。Pixory 不把它们当成孤立的图库条目，而是让它们可以被整理、检索、引用、备份，并在用户明确授权后参与对话。

![Pixory preview](docs/assets/og-cover.png)

> 当前稳定基线：2.8.5
> 当前功能事实以 [docs/feature-matrix.md](docs/feature-matrix.md) 为准。功能矩阵会明确区分已实现、部分实现、实验/不上线、规划和待验证能力。

[官网与下载](https://mist01.com/#download) · [GitHub Releases](https://github.com/qinghe-zy/Pixory/releases) · [功能矩阵](docs/feature-matrix.md) · [产品使用指南](docs/manual.md) · [仓库工作流](docs/repository-workflow.md)

## 为什么是 Pixory

### 长期陪伴，而不是一次性问答

每个 AI 线程都可以绑定角色快照、模型配置、当前分支、记忆范围和材料范围。聊天中断、切换页面或重新打开应用后，系统从本地状态恢复，而不是把连续性寄托在一次网络请求上。

### 记忆可解释、可控制

记忆按全局、角色、IP、知识库、线程和分支划分作用域，并记录来源、状态、置信度、有效时间和版本。用户可以查看、确认、锁定、编辑、标记过期、撤销或删除；冲突记忆不会被静默覆盖。

### 本地材料可以成为对话证据

IP、图片、视频、PDF、DOCX、Markdown、TXT 和线程材料可以被组织成可检索资料。只有在线程中明确授权后，检索结果才进入上下文；资料型回答保留来源标签和定位信息。

### 私密空间是独立边界

普通空间和 Personal 使用独立数据库、文件目录、路由、缓存和后台任务令牌。Personal 锁定时会撤销任务令牌、收敛任务、清理私密内存缓存并关闭数据库。

### 原始素材优先

导入图片和视频时，Pixory 复制原文件到应用管理目录；缩略图、封面和预览是独立文件。删除默认进入回收站，只有用户明确清空回收站才物理删除原始文件。

## 核心能力

| 产品域 | 能力概览 | 当前状态 |
|---|---|---|
| AI 陪伴聊天 | 长线程、角色聊天、流式回答、停止、重试、继续、搜索、收藏 | 已实现 |
| 角色系统 | 角色卡、首次消息、头像、边界、默认语言、模型偏好、SillyTavern 导入 | 已实现 |
| 分支对话 | 编辑、重新生成、消息版本、分支路由、主线采用 | 已实现 |
| 记忆系统 | 作用域、记忆车道、来源、置信度、冲突、过期、撤销 | 已实现，持续治理 |
| 上下文与检索 | 分层 Prompt、上下文预算、关键词/混合检索、材料引用 | 已实现，部分能力持续完善 |
| 角色日记与陪伴运行时 | 日记、关系投影、梦境、离线思绪、后台恢复 | 已实现首版 |
| IP 与材料 | IP、图片、视频、AI 文档、分组、标签、备注、封面 | 已实现 |
| 资料整理 | 搜索、收藏、最近查看、批量管理、重复检测、回收站 | 已实现 |
| Personal | 独立空间、密码/图案、恢复密钥、生物识别、锁定隔离 | 已实现 |
| 备份恢复 | Manifest V2、原图/视频、数据库、AI 文档、聊天附件、角色头像 | 已实现，真机全链路待验证 |
| 诊断与性能 | 生成指标、流式窗口、空白屏嫌疑、帧率、内存、锁等待 | 已实现，设备基线持续补充 |
| Live2D | 运行时入口已关闭，资源保留供未来独立验收 | 实验/不上线 |

## 一次典型使用流程

~~~text
创建或导入角色
  → 新建长期线程
  → 选择模型与材料范围
  → 本地保存用户消息
  → 组装角色、记忆、历史与检索上下文
  → 流式生成并持续保存
  → 形成摘要、记忆和可回看的分支
~~~

导入材料时：

~~~text
选择图片/视频/文档
  → 复制到应用管理目录
  → 读取元数据并生成独立预览
  → 写入 SQLite 与导入批次
  → 分配 IP、分组、标签
  → 在授权线程中检索并引用
~~~

## 产品边界

Pixory 是本地优先的 AI 客户端和材料工作台，不是：

- 云相册或社交平台；
- 默认上传全部相册内容的同步服务；
- 通用图片编辑器；
- 默认提供模型算力的 AI 平台；
- 默认开启的 Live2D 桌宠；
- 把所有历史对话无差别塞进 Prompt 的简单聊天壳。

AI 请求仍会把必要的 Prompt、附件或材料片段发送到用户配置的模型提供商。API key 使用设备 SecureStore 保存，不进入普通备份和诊断；具体数据是否参与请求取决于空间、线程、材料授权和模型设置。

## 数据与隐私

### 本地存储

结构化数据使用 SQLite；原始图片、视频、AI 文档、角色头像、缩略图和导出文件使用应用管理目录。普通空间与 Personal 分开管理。

~~~text
AppData/
├─ database/
│  ├─ pixory.sqlite
│  └─ pixory_personal.sqlite
├─ assets/originals/
├─ thumbnails/
├─ ai_documents/
├─ ai_role_avatars/
├─ exports/
└─ temp/
~~~

### 备份

Manifest V2 备份可以包含：

- SQLite 数据库；
- 原始图片和视频；
- 缩略图与预览；
- AI 文档；
- 聊天附件；
- 角色头像；
- 相对路径、文件大小和 SHA-256 校验信息。

SecureStore 中的 API key、恢复密钥等设备秘密不进入备份。恢复会先做路径、大小和哈希校验，再执行事务合并、ID 映射和 FTS 重建。

### 当前验证边界

功能矩阵中标记为“待验证”的内容不会在 README 中被包装成稳定承诺。当前仍需持续补充的重点包括：

- 真实 Android 设备的完整备份导出、清空/重装、导入和打开文件链路；
- 长线程、视频解码、大批量导入在不同设备上的压力基线；
- Android 删除确认、MediaStore、后台任务和部分 OEM 行为；
- AI 文档统一入口、术语管理、来源更新和跨材料搜索闭环。

## Android 使用与安装

### 环境要求

- Android 10 / API 29 及以上；
- 建议至少 4 GB 运行内存；
- 大量图片、视频或备份数据需要额外可用空间；
- AI 聊天需要可用网络和用户配置的模型提供商。

### 安装

1. 从[官网下载区](https://mist01.com/#download)获取最新版 APK，或从 [GitHub Releases](https://github.com/qinghe-zy/Pixory/releases) 获取备用/历史版本。
2. 在 Android 设备上安装 APK。
3. 首次导入图片、视频或文件时，按系统提示授予对应权限。
4. 在设置中配置模型提供商；API key 不要写入聊天、反馈或诊断文本。

## 本地开发

### 环境

- Node.js；
- pnpm；
- Android Studio、Android SDK 和可用的 Android 设备/模拟器；
- Expo 54 对应的本地开发环境。

### 安装依赖

~~~bash
pnpm install
~~~

### 启动项目

~~~bash
pnpm start
pnpm android
~~~

清缓存启动 Android：

~~~bash
pnpm run acceptance:android
~~~

### 验证

~~~bash
pnpm run typecheck
pnpm test
pnpm run doctor
~~~

性能基准：

~~~bash
pnpm run bench:ai-chat
pnpm run bench:chat-db
pnpm run bench:media-db
~~~

## 技术架构概览

Pixory 使用 Expo、React Native、TypeScript、Expo Router、SQLite、本地文件系统、SecureStore 和轻量状态管理。

~~~text
React Native / Expo Router
        │
        ├─ 页面与共享组件
        ├─ Zustand 与屏幕状态
        │
        ├─ 线程 / 角色 / 记忆 / 材料 / 备份 / Personal 领域服务
        │
        ├─ Prompt Builder
        │    ├─ 稳定策略与角色层
        │    ├─ 记忆快照
        │    ├─ 历史与摘要
        │    ├─ 材料检索与引用
        │    └─ 上下文预算与缓存元数据
        │
        ├─ Provider Adapter 与流式恢复状态机
        ├─ SQLite normal/personal
        ├─ 应用管理文件目录
        └─ 诊断、性能与发布工具
~~~

### 关键工程约束

- 生成遵循 created → local_persisted → request_started → streaming → terminal → final_persisted → ui_stable 生命周期。
- 同一 space:thread 同时只允许一个活动生成任务。
- 上下文默认按模型窗口的安全比例预算，动态内容优先裁剪，当前问题、摘要桥和安全规则受保护。
- 记忆只作为背景证据，不作为新的系统或工具指令。
- 图片与视频列表使用 keyset cursor、有界窗口和有限预取。
- Personal 数据不能通过普通空间的查询、缓存、备份或诊断路径读取。

## 仓库结构

~~~text
src/
├─ ai/                   AI 线程、角色、记忆、检索、Prompt、Provider
├─ database/             SQLite、迁移、仓储和空间注册
├─ diagnostics/          指标、事件、窗口聚合和脱敏
├─ screens/              移动端页面
├─ components/           共享 UI 组件
├─ design/tokens/        间距、节奏、颜色、圆角、字号和尺寸
├─ services/             备份、存储、更新、公告和文件服务
└─ native/               Android 原生媒体、SAF、外部入口和语音桥接
plugins/                 Expo config plugins 与 Android 模板
android/                 Android 原生工程
docs/                    官网、功能矩阵、更新 JSON、公告和产品文档
tests/                   策略、服务、数据库和性能测试
scripts/                 基准、发布和文档工作流
版本文档/                本地私有分支中的版本过程与中文交付文档
~~~

## 文档导航

- [功能矩阵](docs/feature-matrix.md)：当前唯一的全量能力基线。
- [产品使用指南](docs/manual.md)：用户视角的使用说明和边界。
- [产品手册](docs/pixory-product-bid-handbook.md)：产品定位、模块和交付资料。
- [UID 架构说明](docs/uid-architecture.md)：用户身份与发号服务说明。
- [官网文档](docs/index.html)：下载、更新和产品信息页面。
- [仓库工作流](docs/repository-workflow.md)：公开分支、本地分支、文件布局与提交/推送边界。

版本 Plan、Spec、Review、技术报告和中文交付稿位于 `local-work` 私有分支的 版本文档/ 目录。它们可以在本地正常提交，但不会推送到 GitHub；发布前由版本文档工作流预览，只有 APK 成功生成后才归档，失败构建不会移动当前版本文档。完整边界见 [仓库工作流](docs/repository-workflow.md)。

## 发布与维护

Android 发布至少需要完成：

1. 检查版本号、版本码、runtimeVersion、更新 JSON、公告和官网页面；
2. 运行类型检查、测试和差异检查；
3. 使用现有签名配置，先执行 Gradle clean，再构建 release APK；
4. 复制 APK 到 output/release/ 并校验签名；
5. 部署官网直下版本，同时保留 GitHub Release 历史备份；
6. 记录版本、Commit、Tag、APK 路径、验证结果和未验证边界；
7. APK 成功后才归档当前版本文档。

常用发布脚本：

~~~bash
pnpm release:android
~~~

如需手工部署官网 APK，可使用：

~~~powershell
scripts/deploy-docs-mist01.ps1 -ApkPath output/release/Pixory-v2.8.5.apk -Version 2.8.5
~~~

## 项目原则

Pixory 的工程优先级是：

~~~text
陪伴连续性与用户信任
> Personal 隐私隔离
> 记忆、分支与上下文正确性
> Provider 可靠性与生成恢复
> 本地数据一致性
> 原始素材安全
> Android 移动端体验
> 视觉细节与未来扩展
~~~

涉及新功能时，请同时检查：

- 是否更新 docs/feature-matrix.md；
- 是否新增或更新用户故事、验收和版本文档；
- 是否影响数据库迁移、备份 Manifest、文件安全或 Personal 隔离；
- 是否需要新增诊断指标和真机验证；
- 是否会改变 Prompt、记忆、检索、缓存或 Provider 边界。

## 反馈

问题反馈和功能建议请通过 [GitHub Issues](https://github.com/qinghe-zy/Pixory/issues) 提交。请在反馈中提供版本、设备、Android 版本、页面入口、复现步骤和标准/深度诊断包类型；不要提交 API key、恢复密钥、完整聊天正文或 Personal 原文。

---

Pixory 把角色、关系、记忆和材料留在一条可以继续的本地链路上。
