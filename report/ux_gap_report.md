# Pixory AI 用户体验差距分析报告

> 审阅范围：`AiChatScreen`、`AiHomeScreen`、`AiHistoryScreen`、`AiSessionConfigScreen`、`AiMemoryBoardScreen`、`AiMessageBubble`、`AiMessageContent`、`AiChatComposer`、`AiThinkingBlock`
> 对标产品：Claude for iOS/Android、ChatGPT for Android、Gemini for Android
> 约束：只读分析，不修改代码

---

## 总体评估

Pixory AI 的视觉语言克制、信息密度控制得当、功能覆盖完整，已具备基础产品可用性。但与成熟产品相比，**微交互细节**、**状态反馈**、**用户预期管理**、**首次使用引导**和**错误恢复路径**四个维度存在明显差距，在实际使用中会产生可感知的"粗糙感"。

---

## 一、聊天流程与发送体验

### 1.1 发送后输入框未自动清空 / 光标跳回
**文件**：[AiChatScreen.tsx L595-L640](file:///D:/Project/Pixory/pixory/src/screens/AiChatScreen.tsx#L595-L640)

发送成功后，`composerText` 在 `handleSend` 中清空，`pendingAttachments` 也清空。但没有对 `TextInput` 执行 `blur()` 或维持 `focus()`，在 Android 上键盘可能意外关闭或焦点行为不一致。

**成熟产品做法**：Claude / ChatGPT 发送后保持键盘展开、光标立刻回到输入框，用户可以连续输入。

---

### 1.2 发送中用户无法预览上一条消息的完整内容
**文件**：[AiChatScreen.tsx L596-L640](file:///D:/Project/Pixory/pixory/src/screens/AiChatScreen.tsx#L596-L640)

`generating` 期间，整个 `Composer` 区域的 `onSend` 被禁用，但**没有禁止用户向上滚动查看历史**。这部分已经正确。

问题在于：用户发送后，如果消息内容过长（多段附件 + 文字），`buildChatMessageContent` 将附件名以纯文字形式拼接到消息正文（如 `- 图片：photo.jpg，类型：image/jpeg`），在消息气泡中显示为原始内嵌文本，而非独立的附件预览卡。

**成熟产品做法**：ChatGPT / Claude 在气泡中用独立的图片预览或文件卡片显示附件，附件和正文视觉分离。

---

### 1.3 回复中断后无"从断点继续"能力
**文件**：[AiChatScreen.tsx L680-L740](file:///D:/Project/Pixory/pixory/src/screens/AiChatScreen.tsx#L680-L740)

用户手动停止（`stopped` 状态）后，只能"重新生成"（完整重来），无法要求模型"继续刚才的回答"。Claude 和 ChatGPT 均支持点击 `stopped` 消息后弹出"继续"选项，对长输出场景体验影响大。

**影响**：在长代码生成、详细文档等场景，停止后只能全重来，用户体验下降。

---

### 1.4 长按选文 / 选段不支持
**文件**：[AiMessageBubble.tsx L143](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageBubble.tsx#L143)

用户消息气泡使用 `<Text>`，无 `selectable` 属性；助手消息通过 `AiMessageContent` 渲染，段落也是不可选中的 `<Text>`。代码块有 `selectable`，但正文不能长按选文。

**成熟产品做法**：Claude / ChatGPT 允许长按消息正文进入文本选择模式。

**影响**：用户无法从消息中复制部分文字；只有整条消息的"复制"按钮，粒度太粗。

---

## 二、输入框体验

### 2.1 输入框无 Haptic Feedback
**文件**：[AiChatComposer.tsx L155-L170](file:///D:/Project/Pixory/pixory/src/components/ai/AiChatComposer.tsx#L155-L170)

发送按钮和停止按钮按下时没有任何触觉反馈。成熟 iOS/Android 产品均在关键操作（发送成功、停止）时触发轻量 haptic。

---

### 2.2 输入框展开高度上限过低
**文件**：[AiChatComposer.tsx L18-L21](file:///D:/Project/Pixory/pixory/src/components/ai/AiChatComposer.tsx#L18-L21)

```typescript
const MAX_COMPOSER_LINES = 6;
const COMPOSER_INPUT_LINE_HEIGHT = 22;
// 最大高度 = 132px
```

6 行 × 22px = 132px，对于长提示词（多段系统指令、复杂需求描述）而言，用户在没有换行的前提下，内容一旦超出 6 行就只能在小窗中滚动。

**成熟产品做法**：Claude for Android 输入框可展开至屏幕约 40%（约 10-12 行），并在滚动时有良好的光标追踪。

---

### 2.3 附件芯片缺少真实图片缩略图预览
**文件**：[AiChatComposer.tsx L99-L100](file:///D:/Project/Pixory/pixory/src/components/ai/AiChatComposer.tsx#L99-L100)

```tsx
<Image source={{ uri: attachment.uri }} style={styles.attachmentThumb} />
```

图片附件使用 28×28px 的 `Image`，对于相机/相册来源的高分辨率图而言，图像尺寸极小且无圆角裁切一致性。

**改进方向**：使用 64×64px 或 80×80px 的圆角预览；文档型附件保留当前 icon 设计，但文件名截断策略需要从右侧省略（目前 `numberOfLines={1}` 左对齐，长文件名从右截断，但视觉上文件类型扩展名丢失）。

---

### 2.4 附件数量无上限提示
**文件**：[AiChatComposer.tsx L93-L120](file:///D:/Project/Pixory/pixory/src/components/ai/AiChatComposer.tsx#L93-L120)

用户可以无限添加附件，没有最大附件数限制和提示。若用户添加了 20 张图片，`attachmentRail` 会撑开整个 composer 区域高度，将消息列表压缩至极小。

---

### 2.5 语音输入状态反馈过弱
**文件**：[AiChatScreen.tsx L770-L820](file:///D:/Project/Pixory/pixory/src/screens/AiChatScreen.tsx#L770-L820) / [AiVoiceInputStatus.tsx](file:///D:/Project/Pixory/pixory/src/components/ai/AiVoiceInputStatus.tsx)

`AiVoiceInputStatus` 组件通过 `state: AiVoiceInputState` 展示状态，但没有实时声波波形动画。用户说话时只有文字提示，感知语音是否被拾取的唯一反馈是文字状态。

**成熟产品做法**：Google Gemini / ChatGPT 语音输入时显示实时波形动画，用户能直观感知麦克风在录音。

---

## 三、消息气泡体验

### 3.1 流式输出无"打字机"渐显效果，光标抖动
**文件**：[AiMessageBubble.tsx L147](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageBubble.tsx#L147)

```tsx
{streaming ? <Text style={styles.streamingCursor}>▌</Text> : null}
```

流式光标是静态字符 `▌`，无闪烁动画。文字直接追加渲染，在低端设备上可能出现块状跳动。

**成熟产品做法**：Claude 使用 CSS/Animated 让光标以 ~1Hz 频率闪烁；整体文字流以 token 逐步出现，有平滑感。

**建议**：为 `▌` 添加 `Animated.Value` 透明度闪烁（0.2s 周期），消除流式跳动的粗糙感。

---

### 3.2 助手头像显示逻辑不完整
**文件**：[AiMessageBubble.tsx L97-L105](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageBubble.tsx#L97-L105)

头像只在 `avatarEnabled && !isUser` 时显示，但**每条助手消息都会显示头像**，连续多条消息中头像会重复出现。

**成熟产品做法**：ChatGPT / Claude 在连续助手消息中，只在第一条或前后有用户消息间隔时显示头像，减少视觉噪声，并节省垂直空间。

---

### 3.3 消息操作栏按钮可发现性差
**文件**：[AiMessageBubble.tsx L152-L216](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageBubble.tsx#L152-L216)

复制、重写、重新生成、版本切换等按钮**始终可见**，不依赖长按或 hover 触发。这在多条消息并列时会产生大量视觉噪声（每条消息各有一行操作按钮）。

**成熟产品做法**：Claude / ChatGPT 默认隐藏操作按钮，长按或点击消息后显示操作菜单，保持界面干净。

---

### 3.4 思考块（Thinking Block）展开体验简陋
**文件**：[AiThinkingBlock.tsx L43-L52](file:///D:/Project/Pixory/pixory/src/components/ai/AiThinkingBlock.tsx#L43-L52)

思考内容通过 `Text` 直接渲染，没有任何动画展开/收起效果（无 `Animated.View` 高度过渡）。点击展开后内容立即出现，在长思考文本下体验生硬。

同时，思考内容是纯文本展示，若思考文本本身含有 Markdown 结构（推理链中常见标题、列表），不会格式化渲染。

---

### 3.5 版本切换（Version Control）无过渡动画
**文件**：[AiMessageBubble.tsx L190-L213](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageBubble.tsx#L190-L213)

切换版本时内容直接跳变（`selectedVersionByMessageId` 驱动 `setMessages` → 重渲染），无淡入/淡出或滑动过渡。

---

### 3.6 引用（Citation）点击后无预览
**文件**：[AiCitationList.tsx](file:///D:/Project/Pixory/pixory/src/components/ai/AiCitationList.tsx)、[AiMessageBubble.tsx L150](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageBubble.tsx#L150)

Citation 列表展示在气泡底部，用户点击后由 `onOpenCitation` 跳转，但没有内联预览。在知识库引用场景下，用户需要离开当前聊天页才能看到引用内容，打断了对话流。

**成熟产品做法**：Perplexity / ChatGPT 对引用内容支持底部弹层（BottomSheet）内联预览，不离开当前页。

---

## 四、流式回复与生成状态

### 4.1 生成中缺少"等待响应"阶段的骨架屏
**文件**：[AiChatScreen.tsx L612-L640](file:///D:/Project/Pixory/pixory/src/screens/AiChatScreen.tsx#L612-L640)

从用户发送消息到第一个 `answer_delta` 事件到达，存在网络等待期。这段时间内，助手消息气泡显示为：
```tsx
const content = message.content || (streaming ? '正在生成...' : ...)
```
即仅显示"正在生成..."文字，无动态元素。

**成熟产品做法**：Claude 在等待期显示 3 个跳跃圆点动画（Typing Indicator），明确告知用户 AI 正在处理请求，而不是网络卡了。

---

### 4.2 生成失败后的错误信息不可操作
**文件**：[AiChatErrorBanner.tsx](file:///D:/Project/Pixory/pixory/src/components/ai/AiChatErrorBanner.tsx)、[AiMessageBubble.tsx L67](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageBubble.tsx#L67)

错误消息显示在气泡内（`isFailed` → `errorMessage`）或顶部 Banner。内容为原始错误字符串（如 API key 无效、网络超时），对普通用户不友好。

错误消息旁有"重试"入口（通过操作栏的 `onRegenerate`），但：
1. 失败气泡和重试按钮在视觉上是分开的（气泡内显示错误，操作栏才有重试按钮），用户可能找不到重试路径。
2. 错误消息未对常见错误（401 Unauthorized → "API Key 无效或已过期"、429 Too Many Requests → "请求频率过高，稍后再试"）做本地化翻译。

**成熟产品做法**：Claude / ChatGPT 在失败气泡内直接内联"重试"按钮，错误信息用通俗语言表述，并附有指导链接。

---

### 4.3 上下文被截断时用户无感知
**文件**：[aiChatService.ts L1292](file:///D:/Project/Pixory/pixory/src/ai/aiChatService.ts#L1292)

```typescript
promptSnapshotJson: JSON.stringify({ contextTrimmed, contextTrimmedByBudget, contextTrimmedByCount, ... })
```

`contextTrimmed` 信息只存入数据库，UI 层没有任何提示。当早期对话被裁掉时，AI 回复可能与用户预期不符，用户无从知晓原因。

**成熟产品做法**：Claude 在上下文满时显示提示 "Your conversation is getting long. Consider starting a new conversation."

---

## 五、历史记录页（AiHistoryScreen）

### 5.1 搜索无防抖（Debounce）
**文件**：[AiHistoryScreen.tsx L101-L103](file:///D:/Project/Pixory/pixory/src/screens/AiHistoryScreen.tsx#L101-L103)

```typescript
const reload = useCallback(async () => {
  setItems(await listAiHistoryThreads({ filter, searchText, space }));
}, [filter, searchText, space]);
```

`searchText` 每次键入一个字符都触发 `reload`（一次 DB 查询），100ms 内输入 10 个字符会发起 10 次查询。虽然 SQLite 在本地，但在低端设备上仍会产生可感知的 UI 卡顿，且 `setItems` 频繁更新导致列表抖动。

**建议**：为 `searchText` 添加 300ms debounce，只在停止输入后触发查询。

---

### 5.2 滑动归档缺乏动画过渡
**文件**：[AiHistoryScreen.tsx L159-L173](file:///D:/Project/Pixory/pixory/src/screens/AiHistoryScreen.tsx#L159-L173)

滑动实现基于 `PanResponder` + `translateX` 样式切换（`swipedRow: transform: [{ translateX: -ARCHIVE_ACTION_WIDTH }]`），但 `translateX` 的应用是瞬间切换（无 `Animated.Value`），不是平滑滑动效果。

**成熟产品做法**：iOS Mail、Spotify 播放列表等的滑动操作使用 `Animated.Value` 实时跟随手指，松手后弹性回弹或吸附到目标位置，而不是在 `onPanResponderRelease` 时瞬跳。

---

### 5.3 空状态缺少主动引导
**文件**：[AiHistoryScreen.tsx L338-L342](file:///D:/Project/Pixory/pixory/src/screens/AiHistoryScreen.tsx#L338-L342)

```tsx
<View style={styles.emptyState}>
  <Text style={styles.title}>{searchText.trim() ? '没有找到匹配会话' : '没有历史会话'}</Text>
  <Text style={styles.meta}>{searchText.trim() ? '换个关键词试试。' : '开始聊天后，最近会话会出现在这里。'}</Text>
</View>
```

空状态只有两行文字，没有图标、插画，也没有主动操作按钮（如"开始第一个聊天"）。

**对比 AGENTS.md 规范**：文档明确要求"Empty states must be treated as real product screens ... Each empty state should include: Simple icon or illustration, Clear title, Short explanation, Primary action"。

---

### 5.4 时间分组粒度不够精细
**文件**：[AiHistoryScreen.tsx L44-L63](file:///D:/Project/Pixory/pixory/src/screens/AiHistoryScreen.tsx#L44-L63)

时间分组只有：今天 / 昨天 / 过去 7 天 / 更早（4 档）。当用户有 20+ 个"更早"的会话时，全部归入"更早"分组，缺乏细分。

**成熟产品做法**：ChatGPT 的历史侧边栏分组为：今天 / 昨天 / 过去 7 天 / 过去 30 天 / 具体月份（如"2024 年 11 月"）。

---

## 六、会话设置页（AiSessionConfigScreen）

### 6.1 自动保存与手动保存并存，语义混乱
**文件**：[AiSessionConfigScreen.tsx L122-L139](file:///D:/Project/Pixory/pixory/src/screens/AiSessionConfigScreen.tsx#L122-L139)、[L428-L430](file:///D:/Project/Pixory/pixory/src/screens/AiSessionConfigScreen.tsx#L428-L430)

部分设置项（`boundaryMode`、`deepMemoryEnabled`、`replyPreference`）通过 450ms 防抖自动保存；`systemPrompt`（角色指令）则需要点击"保存并开始聊天"手动保存。

这导致：
- 用户切换"回复倾向"后立刻自动生效，但修改"角色指令"后离开页面可能丢失。
- 页面底部同时存在"保存并开始聊天"和"仅保存设置"两个按钮，用户不清楚哪些设置已自动保存、哪些需要手动保存。

**成熟产品做法**：统一策略：要么全部实时保存（去掉手动保存按钮），要么全部需要手动确认（加"有未保存更改"提示）。

---

### 6.2 角色指令（System Prompt）输入区无字数计数
**文件**：[AiSessionConfigScreen.tsx L87](file:///D:/Project/Pixory/pixory/src/screens/AiSessionConfigScreen.tsx#L87)

```typescript
const promptSummary = promptConfigured ? `已配置 ${systemPrompt.trim().length} 字` : '未配置';
```

字数统计只显示在折叠状态的摘要文字里，展开后输入框无实时字数计数。用户在填写长角色指令时无法感知当前字数对 Token 的影响。

---

### 6.3 深度记忆开关缺少清除记忆的快捷操作
**文件**：[AiSessionConfigScreen.tsx L364-L390](file:///D:/Project/Pixory/pixory/src/screens/AiSessionConfigScreen.tsx#L364-L390)

"深度记忆"Card 内，"管理记忆"按钮跳转到 `AiMemoryBoardScreen`，没有"清除本会话记忆"的一键操作。用户若想清空重来，需要逐条删除，或进入记忆管理页操作。

---

### 6.4 模型选择路径过深
**文件**：[AiSessionConfigScreen.tsx L302-L304](file:///D:/Project/Pixory/pixory/src/screens/AiSessionConfigScreen.tsx#L302-L304)

"模型账号"按钮跳转到 `AiProviderSettingsScreen`（完整的 API Key 设置页），而用户在会话设置里通常只想切换模型（如从 GPT-4 切换到 Claude），不需要重新配置 Provider。

**成熟产品做法**：Claude / ChatGPT / Gemini 均支持在对话页内直接弹出模型选择器（BottomSheet），2 步内完成模型切换，无需离开当前会话。

---

## 七、记忆管理页（AiMemoryBoardScreen）

### 7.1 记忆项删除无二次确认
**文件**：[AiMemoryBoardScreen.tsx L127-L137](file:///D:/Project/Pixory/pixory/src/screens/AiMemoryBoardScreen.tsx#L127-L137)

```typescript
async function handleDelete(memoryId: string) {
  setLoading(true);
  try {
    await deleteMemory(space, memoryId);
```

删除记忆项直接执行，无 Dialog 确认、无 Snackbar + Undo。记忆一旦删除即软删除（`status = 'deleted'`），但 UI 层没有提供撤销路径。

---

### 7.2 记忆列表没有分页/虚拟化
**文件**：[AiMemoryBoardScreen.tsx L184-L244](file:///D:/Project/Pixory/pixory/src/screens/AiMemoryBoardScreen.tsx#L184-L244)

记忆列表通过 `.map()` 在 `ScrollView` 内渲染，无虚拟化（FlatList）。当长期使用后积累 50+ 条记忆时，全量渲染会导致明显卡顿。

---

### 7.3 用户画像（User Profile）编辑体验原始
**文件**：[AiMemoryBoardScreen.tsx L157-L169](file:///D:/Project/Pixory/pixory/src/screens/AiMemoryBoardScreen.tsx#L157-L169)

画像编辑是一个自由文本 `textarea`，没有结构化的字段提示（如"兴趣爱好"、"偏好风格"、"职业背景"）。用户不知道该写什么，也无法理解每个字段对 AI 回复的影响。

---

### 7.4 记忆重要度 / 可信度对用户不透明
**文件**：[AiMemoryBoardScreen.tsx L204-L207](file:///D:/Project/Pixory/pixory/src/screens/AiMemoryBoardScreen.tsx#L204-L207)

```tsx
<Text style={styles.caption}>
  {TYPE_LABELS[memory.type]} · 重要度 {memory.importance} · 可信度 {Math.round(memory.confidence * 100)}%
</Text>
```

"重要度"以数字显示（如 `3`），但用户不知道范围是 1-5 还是 1-10。"可信度 87%"数值对用户也缺乏语义。

---

## 八、首页（AiHomeScreen）

### 8.1 最近材料卡片只显示一条，信息密度低
**文件**：[AiHomeScreen.tsx L125-L138](file:///D:/Project/Pixory/pixory/src/screens/AiHomeScreen.tsx#L125-L138)

"最近材料" Card 仅显示最新一条材料的标题 + 3 条名称拼接的描述，不论用户有多少材料，始终是同一个入口卡片。

**对比做法**：最近会话区域则直接列出 3 条最近记录，信息密度更高，导向更直接。建议材料区域也展示 2-3 条最近材料的独立行，而非单一入口。

---

### 8.2 "开始聊天"大卡缺少快捷提示词
**文件**：[AiHomeScreen.tsx L92-L121](file:///D:/Project/Pixory/pixory/src/screens/AiHomeScreen.tsx#L92-L121)

首次进入或空状态下，没有任何建议提示词（Suggested Prompts）。新用户对能做什么完全不知情。

**成熟产品做法**：Claude / ChatGPT / Gemini 首页均显示 3-4 个建议提示词卡片（如"帮我写一封邮件"、"解释一个概念"），引导用户发现能力边界。

---

## 九、可访问性与细节

### 9.1 `accessibilityLabel` 覆盖不完整
**文件**：[AiMessageBubble.tsx L154-L189](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageBubble.tsx#L154-L189)

```tsx
// 复制按钮有 accessibilityLabel="复制消息"
// 版本切换按钮有 accessibilityLabel="上一版消息"
// 但 AiMessageBubble 整体气泡无 accessibilityRole="text" 或 accessibilityLabel 描述消息内容
```

气泡本身未设置无障碍标签，屏幕阅读器用户无法快速知道当前气泡的角色（"AI 回复"还是"你的消息"）。

---

### 9.2 颜色对比度存在风险
**文件**：[aiLightTheme.ts](file:///D:/Project/Pixory/pixory/src/components/ai/aiLightTheme.ts)

```typescript
mutedSoft  // 用于 placeholder 和次要文字
```

`aiLightColors.mutedSoft` 作为 placeholder 颜色使用，若其对比度低于 WCAG AA 标准（4.5:1），在强光环境下（室外使用 Android）会难以辨读。需通过实机测试确认对比度。

---

### 9.3 Markdown 渲染缺少 HR 分隔线支持
**文件**：[AiMessageContent.tsx L53-L141](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageContent.tsx#L53-L141)

当前 Markdown 解析器支持：段落、标题（H1-H4）、列表（有序/无序/任务）、引用、代码块、表格、行内样式（粗体、斜体、删除线、行内代码、链接）。

**不支持**：
- `---` / `***` 水平分隔线（HR）——在 AI 分节回答中常见
- 嵌套列表（当前 `isListLine` 进入列表块后不区分层级）
- 多级引用（`>>` 嵌套引用）

---

### 9.4 日期时间格式不统一
**文件**：[AiHistoryScreen.tsx L32-L42](file:///D:/Project/Pixory/pixory/src/screens/AiHistoryScreen.tsx#L32-L42)、[AiHomeScreen.tsx L260-L270](file:///D:/Project/Pixory/pixory/src/screens/AiHomeScreen.tsx#L260-L270)、[AiMessageBubble.tsx L36-L46](file:///D:/Project/Pixory/pixory/src/components/ai/AiMessageBubble.tsx#L36-L46)

三处时间格式不一致：
- 历史页：`MM-DD HH:mm`（如 `05-22 14:30`）
- 首页最近会话："上次聊天 05-22 14:30"（带前缀，格式相同）
- 气泡时间戳：`HH:mm`（如 `14:30`，无日期）
- 记忆管理页：`YYYY-MM-DD HH:mm`（完整格式）

没有统一的时间格式化工具函数，各处各自实现，维护困难且风格不统一。

---

## 优先修复路线图

```
阶段 1：高感知影响（1 周内）
├─ G1: 流式光标加闪烁动画（Animated.Value）
├─ G2: 生成等待期添加 Typing Indicator（3个跳跃圆点）
├─ G3: 历史页搜索添加 300ms debounce
├─ G4: 历史页空状态补充图标 + 主动操作按钮
└─ G5: 消息气泡"重试"按钮移入失败气泡内部

阶段 2：交互质量（2 周内）
├─ G6: 历史页滑动归档使用 Animated.Value 平滑跟随
├─ G7: 消息操作栏改为长按触发 / 默认隐藏
├─ G8: 思考块展开/收起添加高度过渡动画
├─ G9: 消息正文添加 selectable 属性支持文字选择
└─ G10: 输入框最大行数从 6 提升至 10

阶段 3：功能补全（1 个月内）
├─ G11: 上下文截断时 UI 层显示提示 Banner
├─ G12: 会话设置保存策略统一（全自动 or 全手动）
├─ G13: 记忆删除加 Snackbar + Undo
├─ G14: 引用内容支持 BottomSheet 内联预览
├─ G15: 首页添加建议提示词卡片
├─ G16: 时间格式统一为共用工具函数
└─ G17: Markdown 补充 HR 和嵌套列表支持
```

---

_报告生成时间：静态代码审阅，不含 A/B 测试或用户研究数据。建议在真实用户测试中重点关注 G1、G2、G5、G7 四项的感知影响。_
