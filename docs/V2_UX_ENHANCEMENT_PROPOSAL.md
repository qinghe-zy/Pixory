# Pixory V2 体验升级产品规划 (UX Enhancement Proposal)

## 概述 (Overview)
本文档规划了 Pixory 迈向“成熟商业级软件”的下一阶段核心功能。重点聚焦于两大维度：**极致的收集效率 (Frictionless Ingestion)** 与 **商业级容错体验 (Commercial UX Polish)**。
这批需求不涉及复杂的底层数据重构，而是通过对前端交互边界与系统级融合的深打磨，带来“眼前一亮”的高级体验。

---

## 1. 极致的收集效率 (Frictionless Ingestion)

### 1.1 系统级半屏快捷收集 (System Share Target & Half-Sheet UI)
*   **用户场景**：用户在 Twitter、Pixiv 或浏览器中看到极具参考价值的图片/视频，希望以最快速度存入 Pixory，且不打断当前的冲浪体验。
*   **交互设计**：
    *   在原 App 触发系统分享 (Share)，选择 Pixory。
    *   **核心痛点解决**：千万不要全屏拉起 Pixory (强迫上下文切换会产生极强的操作疲劳)。相反，应在当前屏幕的下半部分滑出一个带有半透明背景遮罩的 Bottom Sheet 卡片。
    *   卡片内展示待保存的媒体缩略图，提供：默认最近存入的 IP 选项、一键修改目标 IP/Group 的入口、以及快速输入标签 (Tags) 的区域。
    *   点击“保存”后，卡片丝滑下降消失，用户停留在原 App 继续浏览。
*   **实现建议**：
    *   Android 端配置 `intent-filter` (支持 `ACTION_SEND` 与 `ACTION_SEND_MULTIPLE`)。
    *   使用 Expo 的 `expo-share-intent` 插件，或编写一个透明主题的轻量级原生 Activity 专门承载该 React Native 分享面板组件。

### 1.2 滑动连选多选手势 (Swipe-to-Select Gesture)
*   **用户场景**：用户刚通过批量导入存入了 200 张图片，需要将其中的 50 张移动到另一个 Group 或打上同一个 Tag。传统的“一张张点击”体验非常糟糕。
*   **交互设计**：
    *   对标 Google Photos / iOS 原生相册的丝滑交互。
    *   用户**长按**任意一张图片进入多选模式后，手指无需抬起，直接在网格 (Grid) 上拖动。
    *   手指划过的图片将被即刻高亮并加入选中队列。
    *   当手指拖拽至屏幕顶部或底部边缘时，列表应当触发自动滚动 (Auto-scroll)，支持跨屏框选。
*   **实现建议**：
    *   基于 `react-native-gesture-handler` 挂载全局 PanResponder。
    *   结合 FlashList / FlatList，在手指滑动的 `onPanResponderMove` 事件中，通过触摸坐标映射到列表网格的 Index 上，进行批量状态更新。
    *   对于所有需要批量选择的场景都考虑加上该功能。

---

## 2. 商业级容错体验 (Commercial UX Polish)

### 2.1 全局撤销系统 (Snackbar Undo System)
*   **用户场景**：消除频繁、生硬且打断心流的“确定要删除吗？”的二次确认弹窗。在追求效率的商业软件中，“默认执行 + 提供反悔窗口”是标杆范式。
*   **交互设计**：
    *   当用户执行如：删除图片、清空标签、移除分组等破坏性/敏感操作时，UI 层面**立刻乐观执行 (Optimistic Update)**，图片瞬间消失。
    *   同时，屏幕底部浮现一个无侵入的 Snackbar，提示文字：“已移至回收站”，右侧配有显眼的 **[撤销]** 操作热区。
    *   Snackbar 保留 4 秒。倒计时结束前点击撤销，界面无缝恢复；超时后组件自然隐去。
*   **实现建议**：
    *   由于 Pixory 底层已支持“软删除” (`deletedAt`)，这里的“撤销”在数据库层面只是简单地执行一次 `UPDATE deletedAt = NULL` 并刷新 UI 状态。
    *   需设计一个全局单例的 Toast/Snackbar 上下文控制器管理排队和撤销回调。

### 2.2 完整的回收站看板与自动清空 (Recycle Bin Dashboard)
*   **用户场景**：Pixory 既然使用了物理文件存储和软删除架构，长年累月后如果不清理，会造成极大的存储负担。用户需要一个可视化的中心来掌控他们“扔掉的废稿”。
*   **交互设计**：
    *   在侧边栏或设置页面新增「回收站」大入口。
    *   内部使用网格视图展示所有被删除的媒体，且在每个卡片下方用醒目的红字标示：“距永久删除还有 X 天”。
    *   底部悬浮工具栏提供两个按钮：**“全部清空（彻底释放存储空间）”** 与 **“恢复所选”**。
*   **实现建议**：
    *   建立规则：软删除文件默认进入 30 天死亡倒计时。
    *   查询逻辑：独立视图通过 `includeDeleted: true` 且 `deletedAt IS NOT NULL` 来获取数据。
    *   物理清理：在应用每次冷启动的闲时阶段（Idle），触发一个后台任务，比较当前时间与 `deletedAt`。超过 30 天的执行 `permanentlyDeleteIp / image`，彻底清理 DB 记录及 `originals` / `thumbnails` 目录里的源文件。
