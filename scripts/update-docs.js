const fs = require('fs');

const prd = '\n### 系统管家增强\n- 全局搜索新增功能卡片（支持快捷词搜索），带独立开关控制是否常驻首页\n- 增强系统管家任务上下文切断逻辑，闲置任务后彻底隔离上下文\n';
fs.appendFileSync('版本文档/当前版本文档/PRD.md', prd);

const tdd = '\n### 系统管家增强\n- 数据库新增 SYSTEM_ASSISTANT_ENABLED_KEY\n- 搜索模块新增 system-assistant-toggle 操作，在 GlobalSearchScreen.tsx 通过 Switch 渲染组件并交互\n- aiChatService.ts 的 listAiHomeThreads 在加载首页会话时判断开关隐藏系统管家\n- aiChatService.ts 处理 resetContext 并在数据库记录标记，conversationCoverageService 读取标记进行硬截断\n';
fs.appendFileSync('版本文档/当前版本文档/TDD.md', tdd);

const test = '\n### 系统管家增强\n- 测试了全局搜索输入关键字正确匹配系统管家卡片\n- 测试了开关系统管家并切回首页，验证展示逻辑正确\n- 测试了系统管家闲置任务后自动切断上下文\n';
fs.appendFileSync('版本文档/当前版本文档/Test-Report.md', test);

const inter = '\n### 系统管家增强\n- 实现了系统管家全局独立开关\n- 实现了系统任务级别的强制上下文边界\n';
fs.appendFileSync('版本文档/当前版本文档/Release-Notes-Internal.md', inter);

const ext = '\n### 优化\n- **系统管家开关**：在全局搜索中新增了“Pixory 系统管家”专属快捷卡片，你可以通过开关轻松控制其是否在首页显示。\n- **上下文精准隔离**：大幅优化了系统管家的上下文连贯性，现在每个任务闲置后都会干净切断记忆，确保处理后续任务更精准、不串台。\n';
fs.appendFileSync('版本文档/当前版本文档/Release-Notes-External.md', ext);

const localLog = '\n### [OTA热更新] v2.8.8.3 - 系统管家独立开关与任务上下文隔离\n- **更新类型**: OTA热更新\n- **更新时间**：2026-09-30\n- **目标频道**：production\n- **变更摘要**：\n  - **系统管家开关**：在全局搜索新增了『Pixory 系统管家』功能卡片，支持搜索『管家』、『助手』等快捷词直达。卡片右侧内置了开启/关闭的胶囊开关组件。\n  - **清爽首页界面**：关闭系统管家开关后，它将不再常驻首页的会话列表中，只在需要时通过全局搜索调出或重新开启。\n  - **任务上下文硬隔离**：系统管家现在的上下文真正做到了每次完成任务的完全切断隔离。即使后续发送多次消息，也不会再错误地带入上一次任务的任何聊天历史，确保更轻量准确的交互。\n';
const oldLog = fs.readFileSync('LOCAL_UPDATES_LOG.md', 'utf-8');
fs.writeFileSync('LOCAL_UPDATES_LOG.md', localLog + '\n' + oldLog);
