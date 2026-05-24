# AI 聊天窗口核心问题与审计报告

> [!NOTE]
> 本文档汇总了对 `AiChatScreen` 及相关组件的深度代码审查结果。记录了目前已知的所有 Bug、潜在的体验隐患以及针对性的修复建议。

---

## 1. 聊天页面滚动剧烈抖动 (UI Jitter)

### 现象描述
* **生成回复时**：AI 在进行流式输出（Streaming）时，聊天窗口底部会疯狂上下剧烈抖动。
* **发送消息时**：输入框收起及新气泡上屏时会有卡顿抖动。
* **点击回到最新**：点击底部弹出的“回到最新”按钮，页面在向下滑动动画中会发生强制重置和拉扯。

### 根因分析
问题核心在于 `FlatList` 的渲染方向和滚动到底部机制（`scrollToEnd`）的滥用：
1. **未开启倒序渲染**：`FlatList` **没有开启 `inverted={true}`** 属性。传统的列表是“从上往下”生长的，如果不用 `inverted`，每次流式生成导致内容高度增加时，列表的 Content Size 会不断变化。
2. **强制滚动冲突**：代码为了保持视口在最下面，频繁调用 `scrollToEnd`，甚至在 `scrollToLatestMessage` 中通过 `requestAnimationFrame` 加上多个定时器连续触发三次 `scrollToEnd`。由于滚动是滞后于布局渲染的，在 Android 上就会引起肉眼可见的“拉扯”和剧烈抖动。

### 修复建议
* **最佳方案**：给 `FlatList` 设置 `inverted={true}`，将数据数组倒序排列（新消息放在 index=0）。这样列表在底层是锚定在底部的，新内容生成时只会自动向上推历史消息，完全不需要手动去调用滚动的 API，能够彻底消除抖动。

---

## 2. 切换“新聊天”时的竞态与串联数据 (Race Condition)

### 现象描述
这是三个连锁现象：
1. **加号点击无响应**：点击右上角 `+`（新聊天）图标，页面毫无反应，聊天记录并未清空。
2. **第一条消息突然消失**：以为还在旧聊天里，发送新消息后，旧消息瞬间全部消失。
3. **新会话用了旧标题**：新会话的标题诡异地保留了上一轮会话生成的标题。

### 根因分析
这是典型的 **React 状态竞态（Race Condition）** 导致的 Bug：
```tsx
useEffect(() => {
  void reloadMessages(threadId ?? activeThreadId, forceScrollAfterMessagesRef.current);
}, [activeThreadId, reloadMessages, threadId]);
```
当外部触发“新建聊天”导致 `threadId` 变成 `null` 时，当前组件的 `activeThreadId` 还没来得及被清除（异步更新）。这会导致 `threadId ?? activeThreadId` 的结果仍然是**旧的会话 ID**。代码错误地用旧 ID 重新发起了加载请求，把刚才那个旧聊天的标题和消息又塞回了空页面里。直到再次发送消息时，状态才被彻底纠正，引发了上述怪异现象。

### 修复建议
在执行 `reload` 系列方法时，严格判断当前所处阶段。在请求数据前需要引入明确的加载标记，或者在 useEffect 中加入 `ignore` 闭包变量机制，当依赖变化时立刻拦截并忽略上一个生命周期发出的旧请求。或者在路由切换时给页面打上不同的 `key` 强制重新挂载。

---

## 3. 国内安卓设备不支持语音识别

### 现象描述
点击输入框旁边的麦克风图标时，底部弹出错误提示：**“当前设备不支持语音识别”**。

### 根因分析
Pixory 调用了 Android 系统标准的底层原生 API（`android.speech.SpeechRecognizer`）。但在绝大多数国内定制 Android ROM（华米 OV 等）中，并没有开放标准的 `RecognitionService`，也没有 GMS。这导致系统级 API 无法找到可用的识别引擎，直接报错。

### 修复/隐藏计划
目前的决策是**仅在 UI 层面隐藏该功能入口，底层逻辑代码保留**：
1. 在 `AiChatComposer.tsx` 中，将输入框右侧的麦克风图标 `<Pressable>` 注释掉或移除。
2. 保留 `AiChatScreen.tsx` 中的相关状态和原生层交互函数，确保不破坏现有架构。

---

## 4. 键盘弹出的顶层布局处理 (Keyboard Safe Area 压缩)

### 现象隐患
> **可能引起经典布局跳动问题**

代码中手动通过监听键盘高度给底部的 `composerPanel` 设置了 `marginBottom: keyboardBottomInset`。这种纯基于 padding/margin 的推顶方式会导致它上方的 `FlatList` 实际可视高度被瞬间压缩，进而打断滚动机制。
**建议**：在 React Native 中，通常建议将整个聊天内容区域（包括列表和输入框）包裹在配置好的 `KeyboardAvoidingView` 中，让原生层平滑顶起整个视图，而不是用 JS 动态修改底部的 margin。

---

## 5. 缺乏流式生成的组件卸载清理 (Memory Leaks during Unmount)

### 现象隐患
> **可能造成后台的意外消耗或报错警告**

如果在 AI 正在疯狂流式输出时，用户突然点击物理返回键退出当前页面，组件被销毁。但由于 `reloadMessages` 和生成的请求处并没有绑定 `AbortController`，后台的流式请求可能还在拼命监听并尝试调用 `setMessages` 更新 UI。这不仅浪费资源，还会抛出 "Can't perform a React state update on an unmounted component" 的常见警告。
**建议**：在执行流式调用的网络请求时传入 `AbortSignal`，并在页面卸载的生命周期里调用 `abort()` 以切断生成过程。
