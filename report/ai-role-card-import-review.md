# SillyTavern 角色卡导入功能代码评审报告

> **评审目标**：基于 `2026-05-24-sillytavern-role-card-import-implementation.md` 的要求，对 `App.tsx`、`AiRoleCardImportPreview.tsx`、`AiRoleCardEditorScreen.tsx` 和测试用例进行全面审查。重点关注用户体验、交互逻辑和隐藏风险。

## 1. 总体评价

整体实现**非常贴合 Spec 要求**，代码结构清晰，严格遵循了本地化、无网络请求、不破坏旧有逻辑的原则。UI 组件遵守了 StyleSeed 的设计规范（如使用 `aiLightColors` 和 `tokens`），状态管理也十分严谨。特别是对于“选择了一张普通 PNG 而非角色卡”的处理（优雅降级为角色头像），体验非常棒。

但深入交互流和状态传递后，发现几个**严重的隐性数据丢失风险**和**用户体验断层**，需要在合入主分支或后续迭代中予以修复。

---

## 2. 隐藏风险与逻辑缺陷 (Critical Risks)

### 🔴 风险一：“编辑后保存”会导致核心元数据（如开场白）永久丢失
在 `AiRoleCardEditorScreen.tsx` 中，当用户在预览面板点击 **“编辑后保存” (`editImportedRole`)** 时，系统将 `importedRole` 的内容填入表单：
```tsx
setName(importedRole.name);
setDescription(importedRole.description ?? '');
setPrompt(importedRole.prompt);
setAvatarUri(importedAvatarUri);
// ...清理 importedRole 状态
```
**问题所在**：
当前编辑器的状态（State）**仅维护了** `name, description, prompt, avatarUri`。
角色卡最核心的导入数据——`firstMessage`（开场白）、`alternateGreetings`、`tags`、`sourceType`（酒馆标识）和 `sourceJson` **并没有被存入任何 State**。
当用户修改完错别字，点击“保存” (`saveReusableRoleCard`) 时，这些字段全部丢失，被降级保存为一张普通的 `pixory_manual` DIY 角色卡。
**后果**：用户只是想改一下角色描述，结果导致最重要的“AI开场白”丢失，新建聊天时 AI 不会主动打招呼。
**建议**：为 Editor 补充 `firstMessage, tags, sourceType, sourceJson` 的 State，并在 `saveReusableRoleCard` 时将它们一并传给 `saveRoleCard`。

### 🟡 风险二：点击历史卡片会无警告覆盖当前编辑内容
**问题所在**：
在 `AiRoleCardEditorScreen` 下方的“已保存”列表中，用户点击任意卡片会触发 `loadCardIntoEditor(card)`，直接 `setName`, `setPrompt`。
如果用户正在上方输入框辛辛苦苦编写一个长角色的 Prompt，尚未保存时，不小心误触了下方列表的某张卡片，**当前未保存的内容会被瞬间清空覆盖，且无法撤销**。
**建议**：在 `loadCardIntoEditor` 前判断当前是否有未保存且被修改过的内容，如果有，弹窗确认（`AppDialog`）是否要放弃当前更改。

### 🟡 风险三：缺乏“更新”机制，导致角色卡重复
**问题所在**：
目前的逻辑中，用户在下方点击已有角色卡载入表单，修改内容后点击“应用”或“保存”，由于 `saveRoleCard` 总是生成新的 ID：
```ts
const id = `role_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
```
这会导致系统里**出现两张同名的角色卡**（旧卡和新卡），而不是更新原卡。
虽然 Spec 没有强求做更新功能，但从用户体验来说，这会迅速导致角色库被大量略微修改的“废弃”卡片塞满。
**建议**：增加一个 `editingRoleId` State，在保存时允许传入已有的 ID 走 Update 逻辑，或者至少在 UI 上给出提示“已另存为新角色”。

---

## 3. 用户体验与交互逻辑考量 (UX & Interaction)

### 🟢 亮点与优秀设计
1. **异常文件的优雅降级**：在 `importRoleCard` 中，如果用户导入的 PNG 没有 `chara` 数据块（即这是一张普通的图片），系统捕获 `missing_chara` 错误后，没有生硬地报错，而是顺水推舟将其设为了当前角色的**头像**。这是一个绝佳的体验细节。
2. **开场白的选择交互**：`AiRoleCardImportPreview` 中对 `alternateGreetings` 的处理很好。通过按压变色和对勾图标反馈，用户能直观地切换并确认默认开场白。
3. **标签防溢出处理**：在预览组件中，为 `tag` 样式设置了 `maxWidth: '48%'`，有效防止了导入带有超长奇葩标签的角色卡时撑爆 Flex 布局，细节拉满。
4. **批量删除的防护**：长按触发多选，屏蔽其他操作按钮（如应用、聊天），底部弹出专用 Footer。这种设计非常符合移动端的直觉。

### 🟠 体验优化建议
1. **导入 JSON 时的头像问题**：JSON 角色卡不含图片。目前用户导入 JSON，预览弹窗中头像为空。此时如果用户想加头像，只能点“编辑后保存”，然后去相册选。这本来是合理的，但结合【风险一】，“编辑后保存”会丢失 JSON 里的开场白，导致 JSON 角色卡目前**几乎无法安全地绑定头像**。修复风险一即可连带解决此痛点。
2. **预览面板的操作提示**：导入成功后的提示 `setStatus('已填入角色编辑表单。')` 在页面最底部。当用户点“编辑后保存”时，预览框消失，界面回到表单，用户可能不太注意底部红色的 `status` 文本，建议可以用 `AppToast` 给出更明确的轻提示。
3. **应用到当前会话的歧义**：在 `AiSessionConfig` 中进入角色库时带有 `threadId`。此时选中角色点击“应用到当前会话”，代码确实调用了 `applyRoleCardToThread`，**但这不会将开场白作为新消息插入历史中**（符合 Spec 的要求：不影响已有聊天）。但用户可能会疑惑“为什么应用了角色，AI 却没有打招呼”。建议在“应用”成功后，给予类似“角色已更新，将在后续对话生效”的 Toast 提示。

---

## 4. 架构与规范检查 (Spec Compliance)

- **Schema 兼容性**：完美兼容。所有新增字段（`firstMessage`, `alternateGreetingsJson`, `sourceType`, `sourceJson`）均配置了合适的 Default 值或 Nullable，没有破坏现有的 `AiRoleCardRow` 数据流。
- **服务隔离**：`createNormalThreadFromRoleCard` 单独处理了 `firstMessage` 的插入，并用了 `db.withTransactionAsync` 保证 `thread` 和 `message` 生成的原子性，隔离了旧版 `applyRoleCardToThread` 逻辑，严格遵守了 Spec。
- **纯本地化**：没有引入任何 `fetch`，图像复制严格使用了本地 `copyAiRoleAvatarToAppStorage`，无外发风险。
- **测试覆盖率**：`tests/ai-role-card-import-policy.test.cjs` 非常严谨地使用 AST/Regex 锁定了 `import` 不允许出现 `fetch`、必须暴露的导出动作等规范，符合 Policy Driven 的验证要求。

## 结论
代码整体质量很高，架构设计安全且合规。**唯一阻碍发版的 Block 级问题是“编辑后保存”会导致角色卡的开场白等高级元数据被洗掉**。建议在代码中补充对这些状态的持有与透传即可达到生产要求。
