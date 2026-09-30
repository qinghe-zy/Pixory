# Pixory 2.8.8.0 → 2.8.8 对内发版说明

> 定位：记录客服、运营影响、迁移风险和应对话术。
> 本文件属于当前迭代的持续文档。每次本地提交和热更新都必须通过 scripts/version-document-workflow.ps1 -Action AppendUpdate 追加记录；需求冲突时，必须先修订本文档并在“变更记录”中标明替代关系。

## 当前有效内容

待补充。这里仅保留当前有效规则；被替代的旧内容必须移入变更记录，不得与当前规则并列。

## 变更记录
<!-- PIXORY_CHANGE_RECORD -->
| 2026-09-29 | 缺陷修复与体验优化 | Local Commit | 修复首页IP卡片菜单开始聊天入口与AI聊天发送文件弹窗挤压样式 | 已完成 |
| 2026-09-25 | 样式优化 | Local Commit | 优化：扩大整理页缩进态下的 IP 列表横向滚动区域宽度 (从 50% 增至 62%) | 已完成 |

| 2026-09-25 | 需求实现 | Local Commit | 重构整理页吸顶栏实现方案：使用 Reanimated 引入 AnimatedSectionList 并使用独立的透明度渐变，彻底解决基于渲染状态的滚动抖动问题 | 已完成 |

| 2026-09-25 | 需求实现 | Local Commit | 优化整理页头部高度：缩减内边距使整体稍微上移，让出更多内容空间但保留状态栏呼吸间距 | 已完成 |

| 2026-09-25 | 需求实现 | Local Commit | 修复分组整理页吸顶缩进时的抖动问题，并优化缩进态IP选择器至右侧显示（不挤占左侧） | 已完成 |

| 2026-09-25 | 需求实现 | Local Commit | 实现整理页向上滚动时分组标签与IP选择栏进入单行缩进态 | UI 优化已完成 |


| 时间 | 事件 | 来源提交/更新 | 变更 | 影响与知会 |
| --- | --- | --- | --- | --- |
| 2026-09-24 | 初始化 | - | 创建本版本文档 | 待评审 |
## 客服与运营版

记录可能引起客诉的变化、旧数据迁移影响、FAQ、应对话术和升级路径。






### [2026-09-26 OTA热更新] 全局搜索页面样式重构
- 更新全局搜索页面样式，采用与 Web 侧设计图（docs/globalsearch/code.html）一致的纯白/黑灰色调体系。
- 将旧版 Ionicons 替换为等价的 MaterialIcons 以对齐设计方案。
- 移除独立的编辑模式，采用内嵌叉号进行单点删除，历史头部统一清空的设计，简化了操作链路。


### [2026-09-26 OTA热更新] 搜索页顶部栏和搜索框重构
- 完全剥离了原先基于 ScreenScaffold 的默认 header 和基于组件库的 SearchBar。
- 以自定义视图替换顶部返回导航与搜索输入框，像素级还原 docs/globalsearch/code.html 中的阴影和布局间距。
- 搜索框 TextInput 的文字排版直接继承 typography.textStyles.body，从而保证与首页搜索框行高的一致性。


- **AI聊天**: 
  - 将聊天首页列表与历史会话页的底部操作面板（ActionSheet）统一替换为原位浮层菜单（AnchoredContextMenu）。
  - 在聊天列表页与历史会话页菜单中整合“重命名”、“移入/移出隐私空间”、“移入回收站”功能。
  - 将“重命名”对话框样式调整为黑白纯色外观（opaqueMonochrome），输入框样式变更为矩形、纯黑光标。

### [2026-09-27 OTA热更新] AI 工作台顶栏元素的滚动渐入时机优化
- 体验优化：调整 AI 工作台页面顶栏元素的滚动渐入时机，将顶栏背景、新建聊天按钮和角色列表的出现时机与搜索按钮同步。
### [2026-09-28 OTA热更新] AI全局设置页面重构
- 优化：AI全局设置页面（全局默认模型）样式重构，精简冗余文案，像素级对齐设计规范，并移除依赖的废弃列表组件。
### [2026-09-28 OTA热更新] 回滚 AI 全局设置页面
- 回滚：由于特殊需要，撤销了今日进行的 AI全局设置页面（全局默认模型）样式重构，恢复原有界面设计。

### 2026-09-29 OTA热更新
- **模块**: 设置与模型配置
- **改动**: 
  1. 重构 AiProviderSettingsScreen 中的卡片为全宽无阴影极简风。
  2. 简化了 MEMORY_MAINTENANCE_MODES 枚举逻辑，移除深层自定义项，只保留“跟随聊天模型”与“自定义”。
  3. 将“配置 Key”动作与 ScrollView 结合，实现点击后平滑滚动到页面顶部。
  4. 移除原有的阻塞屏幕的 loading={loading}，全局状态切换至 status toast 通知。
  5. 将 AiUsageSummary 替换为紧凑的马卡龙横向条，支持 7d / 30d / all 切换请求。

### [2026-09-29 修复] 角色卡应用后立即刷新
- 修复：修复了修改或导入角色卡后，由于路由未重新加载导致展示页界面未立即刷新的问题，现在保存应用后聊天会话外观会立刻同步更新。

### [2026-09-29 OTA热更新] AI 工作台消息列表 IP 徽标与封面头像联动（支持自定义头像优先级）
- **模块**: AI工作台、消息列表、会话配置
- **改动**:
  1. `src/database/repositories/ipRepository.ts`: 引入 `findCoversByIds(db, ipIds)` 批量查询有效 IP 封面（优先自定义封面，后备最新素材缩略图）。
  2. `src/ai/aiChatService.ts`: 在 `listAiHomeThreads`、`searchGlobalThreads` 等列表中按 IP 会话动态注入 IP 封面；增加 `customAvatar` 标识，用户主动设置自定义头像时绝对优先，若清空/未设置时安全回退至 IP 封面。
  3. `src/screens/AiHomeScreen.tsx`: 为 IP 会话标题右侧添加灰底 `ipBadge`（4px 圆角、#5B616E 细致文字），并在头像组件传递空间与 URI 动态 `recyclingKey`，同步监听 `isActive` 与全局刷新。
  4. `App.tsx`: 在图库封面变更刷新链路中联动自增 `aiHomeRefreshToken`。
  5. `src/screens/AiSessionConfigScreen.tsx`: 支持 `customAvatar` 状态跟踪与保存，区分用户主动自定义与回退。


### [2026-09-30 OTA热更新] 首页最近更新空状态样式统一
- **模块**: 首页图库 (HomeLibraryScreen)
- **改动**: 
  1. 在 src/screens/HomeLibraryScreen.tsx 的 AnimatedFlatList 的 ListEmptyComponent 中，为 ctiveFilter === 'recent' 增加了对应的 HomeEmptyState 渲染。
  2. 修复了原来该状态下退退回 PageStateBlock (“空空如也”) 的不一致问题，与 “全部 IP” 和 “收藏” 的占位态组件保持设计语言一致。
- 精简 \AiChatNoKeyBanner.tsx\ 内文案，移除指向右侧会话控制台的多余引导，直接让用户去左侧面板进行全局设置。

### 系统管家增强
- 实现了系统管家全局独立开关
- 实现了系统任务级别的强制上下文边界
