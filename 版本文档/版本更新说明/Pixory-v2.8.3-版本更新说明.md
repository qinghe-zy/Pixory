# Pixory 2.8.2 → 2.8.3 更新日志

> 本文件记录从已发布 v2.8.2 到目标 v2.8.3 的全部变化，仅保存在本地，不进入 Git。

## 版本区间

- 基线版本：2.8.2
- 目标版本：2.8.3
- 状态：开发中

## 更新内容

1. **原生崩溃热修复 (Native Crash Hotfix)**: 修复了 2.8.2 和 2.8.1 版本中，因导入了不兼容的 xpo-keep-awake@^57.0.1 导致原生模块版本过高，进而引发 Android 端启动时抛出 java.lang.NoClassDefFoundError: Failed resolution of: Lexpo/modules/kotlin/types/AnyTypeCache 闪退的问题。已将依赖降级对齐至与当前 Expo SDK 54 完全匹配的 ~15.0.8。

## 最终发布信息

尚未发布。只有 v2.8.3 APK 成功生成后才能写入最终版本、提交、标签、时间、验证和产物路径。
---

## 最终发布信息

<!-- PIXORY_FINAL_VERSION:v2.8.3 -->
- 最终版本：v2.8.3
- 发布时间：2026-09-07 00:26:13 +08:00
- Commit：118b7f7c64fb45dde3a542d44a51c5ced20b750c
- Tag：未创建
- APK：D:\Project\Pixory\pixory\output\release\Pixory-v2.8.3.apk
- 归档状态：已完成