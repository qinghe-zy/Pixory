# Pixory 性能加固补强实施 Plan

**设计来源：** [`2026-08-20-performance-hardening-followup-design.md`](../specs/2026-08-20-performance-hardening-followup-design.md)
**执行约束：** 不使用子智能体；不 reset/stash/覆盖并存修改；不打包、发布、提交或推送；每个模块 RED→GREEN→聚焦回归→diff review 后再进入下一模块。

## Module A：按空间隔离 media epoch

- [x] A1 新增 epoch scope 单测：normal/personal 隔离、global fail-safe。
- [x] A2 新增 DB 句柄 registry 单测/契约，验证 register/resolve。
- [x] A3 实现 scoped epoch 与数据库打开登记。
- [x] A4 把 imageRepository 结构写与 ImageViewer 读取接到 space scope；保持 last-view 不 bump。
- [x] A5 运行 epoch/reader/database 聚焦测试、TypeScript、diff review，并记录结果。

## Module B：混合导入共享 commit budget

- [x] B1 新增失败测试：页面必须只创建一个 budget，并向图片/视频服务传同一对象。
- [x] B2 为两个导入服务增加兼容的可选 `commitBudget` 参数。
- [x] B3 页面在混合预检后创建并共享 budget。
- [x] B4 运行 import preflight/extreme/picker/Personal 聚焦测试、TypeScript、diff review。

## Module C：图片像素预算与 Android memory trim

- [x] C1 新增 coordinator 行为测试：高压更新立即释放 decoded refs、阻止新 decode。
- [x] C2 新增 native/reader policy RED：ComponentCallbacks2 注册/注销、typed event、maxWidth+maxHeight、memoryPressure wiring。
- [x] C3 实现 Kotlin memory-pressure event 与 TS listener。
- [x] C4 reader 接入 sticky-per-screen high pressure 和双维度 decode bound。
- [x] C5 运行媒体聚焦测试、TypeScript、Kotlin compile、diff review。

## Module D：聊天单 statement 锚点读取与 repository benchmark

- [x] D1 新增 repository SQL policy RED：around-anchor 禁止同连接 Promise.all，要求单 CTE statement。
- [x] D2 用一条 SQL 实现 latest/before/anchor/after，保持稳定顺序和缺失 anchor fallback。
- [x] D3 新增 6000+ 消息内存 SQLite benchmark 与 package script；断言 100 页 keyset 不重不漏和 covering index plan。
- [x] D4 运行聊天 repository/入口/merge 测试与新 benchmark、TypeScript、diff review。

## Module E：文档和最终验证

- [x] E1 把 A–D 的实际改动、review 发现和验证结果逐项写入全面 Review 文档。
- [x] E2 更新 `docs/feature-matrix.md`、原 Spec/Plan、`task_plan.md`、`progress.md`。
- [x] E3 新鲜执行 `node --check fix_tests.js`、`pnpm typecheck`、`pnpm test`、全部 benchmark、Kotlin compile、`git diff --check`、ADB 探测。
- [x] E4 逐条回查补强 Spec；host 门禁全绿，Android 设备边界保持未验证。

## Final verification record

- `node --check fix_tests.js`、`pnpm typecheck`、`git diff --check`：通过。
- `pnpm test`：1138 tests / 1123 pass / 0 fail / 15 skipped。
- `pnpm bench:ai-chat`、`pnpm bench:media-db`、`pnpm bench:chat-db`：通过；详细数值见全面 Review。
- `android\\gradlew.bat :app:compileDebugKotlin`：BUILD SUCCESSFUL in 33s。
- ADB：无连接设备；真机帧率、内存、codec、声学和 OEM URI 不声明通过。

## Pre-execution self-review

- 需求覆盖：review 中 4 个可编码加强点分别映射 A–D；设备专属项保留真实门禁。
- TDD：每个生产行为前都有明确 RED；静态 wiring 用 policy test，纯 cache/budget/query 用可执行测试或内存 SQLite benchmark。
- 兼容性：epoch 未知 scope 走 global；导入调用方不传 budget 时保持旧行为；memory event 缺失时 reader 维持 normal；anchor 缺失仍返回 latest。
- 风险：唯一 native 改动限于已存在的媒体模块事件通道，需 Kotlin compile；不引入新依赖。
- 决定：Plan 自审通过，开始 Module A。
