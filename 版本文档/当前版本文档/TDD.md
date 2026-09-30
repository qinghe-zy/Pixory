# Pixory 2.8.8.0 → 2.8.8 技术设计文档（TDD）

> 定位：定义针对 PRD 的架构、实现、性能、安全和迁移方案。
> 本文件属于当前迭代的持续文档。每次本地提交和热更新都必须通过 scripts/version-document-workflow.ps1 -Action AppendUpdate 追加记录；需求冲突时，必须先修订本文档并在“变更记录”中标明替代关系。

## 当前有效内容

待补充。这里仅保留当前有效规则；被替代的旧内容必须移入变更记录，不得与当前规则并列。

## 变更记录
<!-- PIXORY_CHANGE_RECORD -->
| 2026-09-25 | 样式优化 | Local Commit | 优化：扩大整理页缩进态下的 IP 列表横向滚动区域宽度 (从 50% 增至 62%) | 已完成 |

| 2026-09-25 | 需求实现 | Local Commit | 重构整理页吸顶栏实现方案：使用 Reanimated 引入 AnimatedSectionList 并使用独立的透明度渐变，彻底解决基于渲染状态的滚动抖动问题 | 已完成 |

| 2026-09-25 | 需求实现 | Local Commit | 优化整理页头部高度：缩减内边距使整体稍微上移，让出更多内容空间但保留状态栏呼吸间距 | 已完成 |

| 2026-09-25 | 需求实现 | Local Commit | 修复分组整理页吸顶缩进时的抖动问题，并优化缩进态IP选择器至右侧显示（不挤占左侧） | 已完成 |

| 2026-09-25 | 需求实现 | Local Commit | 实现整理页向上滚动时分组标签与IP选择栏进入单行缩进态 | UI 优化已完成 |
| 2026-09-29 | 架构升级 | OTA | 引入 ipRepository.findCoversByIds 批量解析 IP 封面，并在 aiChatService / AiHomeScreen / AiSessionConfigScreen 实现 IP 徽标渲染与自定义头像优先规则 | 已完成 |


| 时间 | 事件 | 来源提交/更新 | 变更 | 影响与知会 |
| --- | --- | --- | --- | --- |
| 2026-09-24 | 初始化 | - | 创建本版本文档 | 待评审 |
## 技术方案

### 架构与时序

必要时补充架构图和系统时序图，说明模块边界与交互。

### 性能与安全评估

明确高并发限流/降级、事务一致性、失败恢复、数据脱敏和敏感信息边界。

### 数据库与迁移

如涉及表结构，引用或补充 DB-Schema.md，说明迁移、回滚和兼容窗口。






### 系统管家增强
- 数据库新增 SYSTEM_ASSISTANT_ENABLED_KEY
- 搜索模块新增 system-assistant-toggle 操作，在 GlobalSearchScreen.tsx 通过 Switch 渲染组件并交互
- aiChatService.ts 的 listAiHomeThreads 在加载首页会话时判断开关隐藏系统管家
- aiChatService.ts 处理 resetContext 并在数据库记录标记，conversationCoverageService 读取标记进行硬截断
