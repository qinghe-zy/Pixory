const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');

test('aiDocumentPinService: limits and core exports', () => {
  const pinServiceContent = fs.readFileSync(path.join(root, 'src/ai/aiDocumentPinService.ts'), 'utf8');

  // 1. 2500 / 5000 阈值常量
  assert.match(pinServiceContent, /export const SHORT_LORE_DIRECT_INJECT_LIMIT = 2500;/);
  assert.match(pinServiceContent, /export const SHORT_LORE_TOTAL_LIMIT = 5000;/);

  // 2. 核心函数导出
  assert.match(pinServiceContent, /export async function addDocumentToKnowledgeBase/);
  assert.match(pinServiceContent, /export async function removeDocumentFromKnowledgeBase/);
  assert.match(pinServiceContent, /export async function injectDocumentToContext/);
  assert.match(pinServiceContent, /export async function removeDocumentFromContext/);
  assert.match(pinServiceContent, /export async function replaceInjectedDocuments/);
  assert.match(pinServiceContent, /export async function listInjectedDocuments/);

  // 3. 专属资料库创建与绑定
  assert.match(pinServiceContent, /category:\s*['"]thread_bound['"]/);
  assert.match(pinServiceContent, /UPDATE ai_threads SET boundKnowledgeBaseId = \?, updatedAt = \?/);

  // 4. 空资料库自动清理
  assert.match(pinServiceContent, /SELECT COUNT\(\*\) as count FROM ai_documents WHERE ownerType = 'knowledge_base'/);
  assert.match(pinServiceContent, /await aiKnowledgeRepository\.deleteKnowledgeBase\(db, params\.space, previousKbId\)/);

  // 5. 结构化 ID 注入与清理
  assert.match(pinServiceContent, /【常驻设定资料：《.*?》#\$\{document\.id\}】/);
});

test('DocumentBubbleCard: supports flat fullWidth, pinState and selectionState', () => {
  const cardContent = fs.readFileSync(path.join(root, 'src/components/document/DocumentBubbleCard.tsx'), 'utf8');

  // 1. Props 包含 fullWidth, flatStyle, selectionState, pinState, onPressPin
  assert.match(cardContent, /fullWidth\?: boolean;/);
  assert.match(cardContent, /flatStyle\?: boolean;/);
  assert.match(cardContent, /selectionState\?:\s*'none'\s*\|\s*'unselected'\s*\|\s*'selected';/);
  assert.match(cardContent, /pinState\?:\s*'red'\s*\|\s*'gray'\s*\|\s*'none';/);
  assert.match(cardContent, /onPressPin\?:\s*\(\)\s*=>\s*void;/);

  // 2. 左侧在未多选状态（selectionState === 'none'）绝对不渲染勾
  assert.match(cardContent, /selectionState !== 'none'/);

  // 3. 右侧卡片内部图钉：已注入显示红色 (#E53935)，未注入 <2500字显示灰色 (#8E8E93)
  assert.match(cardContent, /pinState === 'red'\s*\?\s*['"]#E53935['"]\s*:\s*['"]#8E8E93['"]/);
});

test('AiLoreOverflowSheet: minimal black/white/gray modal for context overflow', () => {
  const sheetContent = fs.readFileSync(path.join(root, 'src/components/ai/AiLoreOverflowSheet.tsx'), 'utf8');

  // 1. 标题与说明
  assert.match(sheetContent, /注入原文字符较多，无法增加新的文档/);

  // 2. 双按钮：返回 与 更新注入
  assert.match(sheetContent, />\s*返回\s*<\/Text>/);
  assert.match(sheetContent, />\s*更新注入\s*<\/Text>/);

  // 3. 校验逻辑：已修改且总字符 < 5000 字符才允许提交
  assert.match(sheetContent, /projectedChars < limit/);
  assert.match(sheetContent, /hasModified && isWithinBudget && !submitting/);
});

test('AiMessageBubble: dual buttons for short docs and pin icon in copy', () => {
  const bubbleContent = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');

  // 1. 短文档判断与双按钮展示
  assert.match(bubbleContent, /isShortDoc/);
  assert.match(bubbleContent, /📌 原文注入/);
  assert.match(bubbleContent, /📌 已原文注入/);
  assert.match(bubbleContent, /📌 纳入资料库/);
  assert.match(bubbleContent, /📌 已纳入资料库/);

  // 2. 独立选中态
  assert.match(bubbleContent, /isInKb && styles\.pinPillActive/);
  assert.match(bubbleContent, /isInjected && styles\.pinPillActive/);
});

test('AiMaterialListScreen & AiKnowledgeBaseScreen: full bleed, no mask, borderless', () => {
  const materialListContent = fs.readFileSync(path.join(root, 'src/screens/AiMaterialListScreen.tsx'), 'utf8');
  const kbScreenContent = fs.readFileSync(path.join(root, 'src/screens/AiKnowledgeBaseScreen.tsx'), 'utf8');

  // 1. Scaffold 配置
  assert.match(materialListContent, /fullBleed/);
  assert.match(materialListContent, /hideStatusBarShield/);
  assert.match(materialListContent, /footerNaked/);

  assert.match(kbScreenContent, /fullBleed/);
  assert.match(kbScreenContent, /hideStatusBarShield/);
  assert.match(kbScreenContent, /footerNaked/);

  // 2. 资料列表复用 DocumentBubbleCard
  assert.match(materialListContent, /<DocumentBubbleCard/);
  assert.match(materialListContent, /pinState=\{pinState\}/);
  assert.match(materialListContent, /注入原文字符较多，无法增加新的文档/);
});
