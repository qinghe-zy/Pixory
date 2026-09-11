# Pixory 版本文档工作流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 本次按用户要求在当前会话顺序执行，不使用子智能体。

**Goal:** 建立不进 Git 的按版本归档体系，并让 Android 打包成功后自动封存当前资料、生成版本说明和开启下一版本区间。

**Architecture:** 使用一个受测 PowerShell 工具负责状态、预检、旧文档迁移和成功归档；Android 构建脚本只在构建前预检、产物成功后调用归档。Git 只保留脚本、规则和最新功能矩阵，本地目录保留所有版本过程资料。

**Tech Stack:** PowerShell、Git、Node test runner、Markdown、Expo Android release script。

---

## Task 1：定义本地状态和忽略边界

**Files:** `.gitignore`, `版本文档/当前版本文档/版本区间.json`, `版本过程索引.md`。

- [x] 把 `/版本文档/` 加入 `.gitignore`，保留已有 `LOCAL_UPDATES_LOG.md` 忽略规则。
- [x] 写入 `fromVersion=2.8.1`、`toVersion=2.8.2` 的区间配置。
- [x] 建立当前版本过程索引，列出本阶段性能 Spec、Plan、Review、算法和提交。
- [x] 运行 `git check-ignore -v` 验证本地目录与更新日志均被忽略。

## Task 2：先写工作流策略测试

**Files:** `tests/version-document-workflow-policy.test.cjs`。

- [x] 断言脚本支持 `Status`、`PreviewRelease`、`FinalizeRelease` 和 `MigrateLegacy`。
- [x] 断言归档目标只有 `历史文档/vX.Y.Z` 一层，版本说明直接进入独立文件夹。
- [x] 断言打包脚本在 Gradle 前预检、APK 成功复制后才最终归档。
- [x] 断言 feature matrix 不被复制，待办不被移动，历史冲突不得覆盖。
- [x] 运行该测试并确认因脚本尚不存在而 RED。

## Task 3：实现版本文档工具

**Files:** `scripts/version-document-workflow.ps1`。

- [x] 实现仓库根路径解析、版本规范化、下一补丁版本计算和区间配置验证。
- [x] 实现 `Status/PreviewRelease` 的只读清单输出。
- [x] 实现成功归档：先做全量冲突预检，再写最终信息、移动当前文档和说明，最后创建下一版本文件。
- [x] 实现重复打包幂等判断；已归档版本不得影响新周期。
- [x] 实现 `MigrateLegacy`：按 Git 最后修改提交与发布标签生成归属计划、平铺文件名和索引，不覆盖同名文件。
- [x] 运行策略测试和临时目录集成检查。

## Task 4：接入 Android 打包

**Files:** `scripts/build-android-release.ps1`, `AGENTS.md`。

- [x] Gradle 前调用 `PreviewRelease`，目标版本与当前区间不一致时中止。
- [x] APK 复制成功后调用 `FinalizeRelease`，传入 APK 路径、当前 Commit 和可用 Tag。
- [x] 在 AGENTS release workflow 增加文档预检、成功后归档、失败不移动、历史只增不删和 feature matrix 最新唯一规则。
- [x] 运行 PowerShell parser 检查和工作流策略测试。

## Task 5：迁移旧版本过程资料

**Files:** 旧 specs/plans/reviews/research/task plan；本地 `历史文档` 与 `当前版本文档`。

- [x] 先生成迁移预览，核对文件总数、版本分布、重名和未归类项。
- [x] 执行迁移，所有目标先验证位于 `版本文档` 根内。
- [x] 每个版本目录生成直接文件和 `版本文档索引.md`，确认不存在二级目录。
- [x] 当前 2.8.2 资料进入当前版本文档；性能增强 backlog 进入待办。
- [x] 用文件数和哈希清单确认没有遗漏或覆盖。

## Task 6：整理更新说明与最新功能矩阵

**Files:** `LOCAL_UPDATES_LOG.md`, 本地 `版本更新说明/Pixory-v2.8.1-版本更新说明.md`, `docs/feature-matrix.md`。

- [x] 生成 2.8.1 最终历史说明，末尾写明最终版本 2.8.1。
- [x] 把根日志改为 2.8.1→2.8.2，写入 2.8.1 发布后 OTA、媒体/聊天/数据库/启动/长列表优化和提交。
- [x] 功能矩阵增加版本文档工作流，只保留最新状态，不生成快照。
- [x] 核对当前日志中的文件、Commit 和自动化结果与 Git 一致。

## Task 7：验证与提交

- [x] 运行版本工作流策略测试、`pnpm typecheck`、`pnpm test` 和 `git diff --check`。
- [x] 运行 `Status` 与 `PreviewRelease -ReleasedVersion 2.8.2`，确认只读输出完整。
- [x] 检查 Git 不包含 `LOCAL_UPDATES_LOG.md`、`版本文档/`，但包含脚本、规则和最新功能矩阵。
- [x] 检查 `git status` 中旧文档为删除而非内容丢失，本地归档文件数与源文件数一致。
- [x] 提交一笔带 What/Why/Verified/Limitations 正文的详细提交，不推送远端；Commit：`bff0fc6`。
