# SillyTavern (酒馆) 角色卡接入与 UI/UX 设计计划

## 1. 方案调研与可行性结论

**调研结果**：SillyTavern V2 角色卡规范（`chara_card_v2`）是目前社区最通用的 AI 角色分享格式。它的核心原理是**将角色的 JSON 配置进行 Base64 编码后，嵌入到 PNG 图片的隐写数据块（`tEXt` chunk，标识为 `chara`）中**。

**可行性结论**：完全可行且高度契合。Pixory 的强项就是本地图片资产管理，结合内置的 `AiRoleCardRecord`，我们可以做到“选中一张酒馆 PNG 图片 -> 自动提取头像 -> 自动解析隐藏的设定数据 -> 无缝转换为 Pixory 角色”。

---

## 2. 数据映射引擎设计 (Data Mapping)

酒馆卡片的字段非常细碎，而 Pixory 的 `AiRoleCardRecord` 目前是极简的单 `prompt` 结构。为了保持 Pixory 的轻量级，我们在导入时执行**降维拼接策略**：

### 字段转换规则
- **头像 (`avatarUri`)**：直接将导入的 PNG 文件复制到 Pixory 的 `appData/assets/ai_role_avatars/` 目录下。
- **名称 (`name`)**：直接映射为 `AiRoleCardRecord.name`。
- **简介 (`description`)**：映射为 Pixory 的 `description`（用于 UI 列表展示）。
- **核心提示词 (`prompt`)**：将酒馆的多个维度按最佳实践（Prompt Engineering）拼接合成一段高质量 Markdown。拼接顺序如下：
  ```markdown
  # 角色设定 (Description & Personality)
  {{description}}
  {{personality}}
  
  # 场景背景 (Scenario)
  {{scenario}}
  
  # 系统规则 (System Prompt & Post History)
  {{system_prompt}}
  {{post_history_instructions}}
  
  # 对话示例 (Message Examples)
  {{mes_example}}
  ```
- **标签 (`tags`)**：直接映射为 Pixory 的 `tags` 数组。
- **【特殊升级】开场白 (`first_mes`)**：酒馆卡片通常带有精彩的开场白。为了完美体验，我们需要在数据库 `AiRoleCardRecord` 中新增一个 `firstMessage?: string` 字段（需轻量级 Migration）。当基于该角色新建聊天时，系统自动将这句开场白作为 Assistant 的第一条消息插入数据库。

---

## 3. UI/UX 体验设计

我们遵循 Pixory 现有的“克制、高级、移动端优先”的设计语言（StyleSeed 规范）。

### 3.1 入口设计 (Entry Points)
在角色卡库管理页（例如 `AiRoleCardListScreen`）和角色编辑页（`AiRoleCardEditorScreen`）：
- **主动作栏**：原有的“新建角色”旁，增加一个醒目的 **“导入角色卡 (Import Card)”** 按钮。
- **支持格式**：点击后调用系统文件选择器，过滤支持 `image/png` 和 `application/json`（以防用户直接下载了 JSON 版本）。

### 3.2 导入解析反馈 (Feedback State)
- 选中图片后，界面居中出现 Loading 态：“正在解析角色神经元数据...”
- 底层执行 PNG Chunk 解析算法。

### 3.3 “盲盒解开”预览卡片 (Preview Bottom Sheet)
如果解析成功，**不要直接静默保存**，而是弹出一个极具仪式感的高级 Bottom Sheet（底部半屏弹窗）：
- **视觉重心**：顶部展示提取出的角色高清头像（大圆角，带有极其轻微的外发光或呼吸动画，暗示这是一个活的 AI 角色）。
- **信息展示**：
  - 大字体的角色 Name。
  - 提取出的 Tags 变为精致的横向滚动胶囊（Pills）。
  - Creator Notes 或简短的 Description。
- **操作按钮**：
  - `[ 主要按钮 ]`：“确认唤醒 (Import & Save)”
  - `[ 次要按钮 ]`：“前往编辑 (Edit Details)”（允许用户在保存前微调合并后的 Prompt）。

### 3.4 异常流降级 (Error Handling)
- 如果选中的 PNG 没有 `tEXt` chunk（即普通图片），弹窗提示：“未检测到酒馆角色数据。是否仅将此图片作为角色头像使用？” -> 点击确认则进入普通的新建角色表单，头像自动填入。

---

## 4. 实施阶段拆解 (Execution Steps)

1. **Phase 1: 底层解析库**
   编写一个纯 JS/TS 的 PNG 解析工具 `pngCharaParser.ts`。读取文件 Base64/Buffer，利用简单的 DataView 或正则定位 `tEXtchara` 标记并提取 Base64 JSON，无需引入庞大的 Node 原生依赖。
2. **Phase 2: 数据结构拓展**
   修改 `AiRoleCardRecord` TypeScript 类型与 SQLite Migration，增加 `firstMessage` 字段。并在 `aiChatService` 的 `createThread` 逻辑中，支持初始化时写入第一条 Assistant 消息。
3. **Phase 3: UI 界面组装**
   开发 `AiRoleCardImportPreview` 底部弹窗组件，并在现有编辑/列表页接入 Expo `DocumentPicker`。
4. **Phase 4: 提示词降维引擎**
   编写 `parseTavernCardToPixoryPrompt(tavernJson)` 工具函数，负责将碎片的酒馆字段优雅地拼接为结构化 Markdown。

## 用户审核请求

以上为您量身定制的 SillyTavern 角色卡接入方案。它保证了您的核心数据结构依然极简，同时 UI 体验充满了“唤醒数字生命”的仪式感。如果您觉得方向正确，我们可以随时按照此蓝图进入代码落地阶段！
