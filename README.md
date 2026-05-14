# Pixory

Pixory 是一个 Android-first、local-only 的 IP 图片与视觉资产管理应用。

它用于把个人或小团队的图片素材按 IP、分组、标签、收藏、备注和元数据整理起来，同时尽量保护导入原图的完整性。Pixory 不是云相册、社交应用、在线同步服务、账号系统、AI 生成器或图片编辑器。

## 产品定位

- Android 优先的移动端体验。
- 核心资产管理能力离线可用。
- 使用 SQLite 保存结构化元数据。
- 使用本地文件系统保存导入原图和预览文件。
- 导入原图会复制到应用私有目录，不压缩、不裁剪、不重编码、不覆盖。
- 缩略图、封面和缓存只作为独立预览文件，不替代原图。
- 默认软删除，清空回收站前可以恢复。

## 主要功能

- IP 资产库：适合角色、视觉身份、主题、品牌形象或创意系列。
- IP 内分组：支持季节、场景、节日、用途和自定义组织方式。
- 图片批量导入：复制原图、读取元数据、生成独立缩略图并写入本地数据库。
- 标签管理：创建、展示、搜索、筛选、添加和移除标签。
- 图片详情、备注、收藏、最近查看和全局搜索。
- 全部图片、全局分组、标签总览、标签结果等管理视图。
- 重复素材检查、快速整理和批量管理流程。
- 回收站恢复与清空。
- 本地备份导出和包导入流程。
- 本地视频导入、封面和查看支持。
- 面向已发布 Android 版本的远程更新和公告 JSON。

## 技术栈

- Expo 54
- React Native 0.81
- React 19
- TypeScript
- `expo-sqlite`
- Expo 本地文件、图片、媒体库、文档选择、视频和安全存储相关模块
- Pixory Android media intents 的轻量 Expo config plugin

## 仓库内容

这个公开仓库只保留理解、运行和构建 Pixory 所需的内容：

- `src/`：页面、组件、服务、数据库访问、设计 token、hooks 和工具函数。
- `assets/`：应用图标和随包视觉资源。
- `plugins/`：Android 集成相关的 Expo config plugin。
- `patches/`：项目所需的依赖补丁。
- `docs/update-version.json`、`docs/announcement.json`：已发布版本使用的远程更新和公告元数据。
- `package.json`、`pnpm-lock.yaml`、`app.json`、`eas.json`、`tsconfig.json` 等运行和构建配置。

本地日志、调试截图、生成的 APK、私有规划文档和构建产物不会放在 `main` 分支。

## 本地运行

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

依赖兼容性检查：

```bash
pnpm run doctor
```

## Android 说明

- 使用 Android 模拟器或 Android 真机运行。
- 启动前可用 `adb devices` 确认设备已连接。
- 如果 Metro 加载旧页面，使用 `pnpm run acceptance:android` 清缓存启动。
- Release APK 通过 GitHub Releases 发布，不提交到仓库 `main` 分支。

## 下载发布版

最新 Android 发布版：

[GitHub Releases](https://github.com/qinghe-zy/Pixory/releases/latest)

Pixory 的应用内更新和公告读取：

- `docs/update-version.json`
- `docs/announcement.json`

维护这两个文件时，应保持 JSON 简短、有效，并与最新 GitHub Release 保持一致。

## 开发边界

- 优先保护导入原图。
- 保持核心流程离线优先。
- 除非明确需要，不添加后端、云存储、账号、同步或社交功能。
- 不把大媒体文件写入 SQLite。
- 缩略图和预览文件必须与原图分离。
- 优先做小而可验证的改动，避免无关重写。
