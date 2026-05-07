# Pixory

Pixory 是一个 Android-first、local-only 的 IP 图片 / 视觉资产管理应用。

它的核心定位是帮助个人或小团队在本地离线环境里，用 IP、分组、标签、收藏、备注和回收站来管理视觉素材，同时尽量保证原始文件安全和数据可追溯。

## 核心原则

- 本地优先：所有核心能力默认离线可用。
- 无服务器：默认不依赖后端服务。
- 无云存储：默认不做云同步、云备份、远程图库。
- 无账号：默认不做登录、鉴权、用户体系。
- 原始文件无损：导入时复制原文件到应用私有目录，不压缩、不裁剪、不重编码、不覆盖原文件。
- 预览资源分离：缩略图、视频封面和缓存仅用于预览，单独存储，不替代原始文件。

## 主要功能

- IP 资产库
- IP 下分组管理
- 图片批量导入
- v2 目标：视频导入、视频封面、视频查看与大容量性能治理
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

- SQLite 保存结构化元数据。
- 应用私有文件目录保存 original 文件。
- 应用私有文件目录保存 thumbnail / preview 文件。
- `originalFileUri`、`thumbnailFileUri`、视频封面 URI 分离维护。
- 清空回收站前，软删除资产对应的原始文件和预览文件仍会保留。
- 列表页只读取元数据和预览资源，原始文件只在详情、查看器、导出或备份时访问。

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
pnpm run typecheck
```

轻量回归测试：

```bash
pnpm test
```

依赖检查：

```bash
pnpm run doctor
```

## Android 启动方式

- 先确认 `adb devices` 能看到模拟器或真机
- 如 8081 被占用，先结束旧 Metro
- 推荐提测前统一使用 fresh bundle：

```bash
pnpm exec expo start --android -c
```

- 确认 Expo Go 已加载最新 bundle，而不是旧缓存页面

## 开发约束

- 不在列表页读取原图或原视频。
- 不在启动时扫描全库文件。
- 不把大文件放进 SQLite。
- 不让 UI 页面直接绕过 repository / service 修改数据库或文件。
- 大批量导入、备份、恢复、清理和视频导入必须按任务化、分批、可校验的方式设计。

## 文档

- [v2 开发规划](./docs/V2_DEVELOPMENT_PLAN.md)
- [v2 视频与导入规格](./docs/V2_VIDEO_AND_IMPORT_SPEC.md)
- [v2 验收标准](./docs/V2_ACCEPTANCE_CRITERIA.md)
- [v2 播放器视觉参考](./docs/assets/v2-video-player-visual-reference.png)
