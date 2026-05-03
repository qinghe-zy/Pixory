# Pixory

Pixory 是一个 Android-first、local-only 的 IP 图片资产管理应用。

它的核心定位不是云相册，也不是素材协作平台，而是帮助个人或小团队在本地离线环境里，用 IP、分组、标签、收藏、备注和回收站来管理图片素材，同时尽量保证原图安全和数据可追溯。

## 核心原则

- 本地优先：所有核心能力默认离线可用。
- 无服务器：当前 MVP 不依赖后端服务。
- 无云存储：当前 MVP 不做云同步、云备份、远程图库。
- 无账号：当前 MVP 不做登录、鉴权、用户体系。
- 原图无损：导入时会复制原图到应用私有目录，不压缩、不裁剪、不重编码、不覆盖原文件。
- 缩略图分离：缩略图仅用于预览，单独存储，不替代原图。

## 主要功能

- IP 资产库
- IP 下分组管理
- 图片批量导入
- 标签总览与标签结果页
- 图片详情
- 图片编辑
- 移动分组
- 批量管理
- 收藏页
- 最近查看页
- 软删除回收站
- 回收站恢复与清空

## 技术栈

- Expo
- React Native
- TypeScript
- Expo Router 风格路由常量
- expo-sqlite
- expo-file-system
- expo-image-picker
- expo-image-manipulator

## 本地存储说明

- SQLite 保存结构化元数据
- 应用私有文件目录保存 original 文件
- 应用私有文件目录保存 thumbnail 文件
- `originalFileUri` 和 `thumbnailFileUri` 分离维护
- 清空回收站前，软删除图片对应原图和缩略图仍会保留

## 当前 MVP 状态

截至 2026-05-02：

- 首页 / 分组 / 标签 / 我的四个 Tab 已可用
- 标签页、标签结果页、收藏页、最近查看页、回收站页已接真实 SQLite
- 图片导入、图片详情、图片编辑、移动分组、批量管理、软删除已完成主要开发
- 回收站恢复和清空链路已实现
- 提测前文档已补齐
- Android 真机/模拟器完整长链路仍需一轮更稳定的最终人工复核

本轮真实 Android 回归结果见 [docs/TEST_REPORT.md](./docs/TEST_REPORT.md)。

## 运行方式

安装依赖：

```bash
pnpm install
```

启动 Android：

```bash
pnpm exec expo start --android
```

清缓存启动：

```bash
pnpm exec expo start --android -c
```

TypeScript 检查：

```bash
pnpm exec tsc --noEmit
```

更完整的运行说明见 [docs/RUNBOOK.md](./docs/RUNBOOK.md)。

## Android 启动方式

- 先确认 `adb devices` 能看到模拟器或真机
- 如 8081 被占用，先结束旧 Metro
- 推荐提测前统一使用 fresh bundle：

```bash
pnpm exec expo start --android -c
```

- 确认 Expo Go 已加载最新 bundle，而不是旧缓存页面

## 已知限制

- 当前仍运行在 Expo Go / 开发环境，不是独立 APK
- Android 模拟器输入法会干扰自动化文本注入，影响长链路回归效率
- 回收站清空后的物理删除，本轮已做到代码与链路级验证，但独立外部核验仍建议再补一轮
- `dev-only` 回归辅助卡片仍存在于开发环境中，正式提测前可移除
- 当前不包含搜索增强、高级筛选、云服务、账号系统、AI 标签、AI 生图、Web 后台

## 文档

- [验收标准](./docs/ACCEPTANCE.md)
- [页面视觉减压规则](./docs/UI_PAGE_OPTIMIZATION_RULES.md)
- [测试报告](./docs/TEST_REPORT.md)
- [架构说明](./docs/ARCHITECTURE.md)
- [已知问题](./docs/KNOWN_ISSUES.md)
- [运行手册](./docs/RUNBOOK.md)
