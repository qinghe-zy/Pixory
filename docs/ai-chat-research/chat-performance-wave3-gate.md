# AI 聊天性能 Wave 3 Android 验收门禁

日期：2026-08-13  
关联报告：[chat_performance_report_v2.md](./chat_performance_report_v2.md)  
关联核对表：[chat_performance_report_v2_triage.md](./chat_performance_report_v2_triage.md)

## 设备状态

执行 `D:\Develop\Android\Sdk\platform-tools\adb.exe devices` 后仅返回 `List of devices attached`，没有可用 Android 设备或模拟器。本轮没有启动应用、没有进行设备端采样，也没有执行会改变流式/手势架构的 Wave 3 修改。

## 结论

下列事项全部为 **BLOCKED — 无可用 Android 设备**。静态审查、Node/SQLite 测试和类型检查不能替代真实设备上的帧耗时、手势响应、受控输入稳定性或流式回放布局验证。

| 报告项 | 需在 Android 上验证的场景 | 本轮状态 |
| --- | --- | --- |
| P0-1 detached streaming 局部订阅/尾部 wrapper | 200 条消息中离开底部后持续流式，记录 JS commit、detached merge 耗时、掉帧与回到底部后的内容连续性 | **BLOCKED** |
| P0-2 `AiMeasuredStreamBlock` 单源测量 | 字体缩放、promoted block、长回复回放下比较 `onLayout` 与 rAF `measure()` 的高度差、累积债务和可见区坐标稳定性 | **BLOCKED** |
| P0-4 Composer 测量路径 | 200 行输入、长文本粘贴、草稿恢复、键盘开合和清空后，确认高度、光标和安全区稳定 | **BLOCKED** |
| P1-10 streaming splitter 增量解析 | 15K 字符长流与连续 patch，比较 block 等价性、解析耗时、内存和 tail promotion/reload 行为 | **BLOCKED** |
| P1-11 Drawer Gesture Handler/Reanimated 迁移 | 打开/关闭、拖动阈值、遮罩点击、最近会话操作、无障碍及 Android 返回行为 | **BLOCKED** |
| P1-12 完整 pet gesture 状态迁移 | 桌宠运行时已整体关闭，聊天页和会话设置页均无入口；未来若恢复，须重新验证拖拽、缩放、自动移动、设置持久化和 listener 同时存在时无跳变 | **BLOCKED** |

## 已完成但尚未替代 Android 验收的低风险改动

- token 预算单次扫描与等价性随机 corpus 对照；
- KaTeX 编译按公式 memo；
- 文档 citation 清理和 embedding 写入的 SQLite 批量化；
- rich-HTML 判定 memo；
- 手动资料 Embedding 请求最多并发 3 个；
- Live2D 桌宠运行时已整体关闭，原 resize handle opacity 与 `petPan` 手势路径均不再执行。

这些改动均有目标 Node/SQLite 测试和 TypeScript 检查；它们不构成上述 Wave 3 项或 Android 流畅度的验收证据。

## 解除门禁后的执行顺序

1. 准备报告指定的数据集并在同一 Android 设备上记录基线。
2. 先验收 P0-1、P0-2、P0-4；若未复现问题，更新核对表为“未复现”，不做推测性重构。
3. 仅在基线确认收益后，分别为 P1-10、P1-11 和 pet gesture 迁移创建独立规格、失败测试和 Android 回归清单。
4. 重新执行聊天连续生成、滚动回放、输入框、抽屉、桌宠拖拽/缩放和 Android 返回的端到端检查。
