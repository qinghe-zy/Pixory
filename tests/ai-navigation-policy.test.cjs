const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const home = () => fs.readFileSync(path.join(root, 'src/screens/AiHomeScreen.tsx'), 'utf8');
const chat = () => fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');

test('AI routes are registered for workbench, chat, settings, history, materials, and readers', () => {
  for (const route of [
    'ai-chat',
    'ai-session-config',
    'ai-provider-settings',
    'ai-ip-picker',
    'ai-knowledge-base',
    'ai-material-import',
    'ai-material-list',
    'ai-document-reader',
    'ai-history',
  ]) {
    assert.match(app, new RegExp(route));
  }
});

test('AI workbench exposes the three first-version starts and no disconnected default warning', () => {
  const content = home();
  assert.match(content, /开始普通聊天/);
  assert.match(content, /问问某个 IP/);
  assert.match(content, /连接知识库/);
  assert.match(content, /pageTitle/);
  assert.match(content, />AI 工作台</);
  assert.doesNotMatch(content, />Pixory</);
  assert.doesNotMatch(content, /brandName/);
  assert.doesNotMatch(content, /当前未连接知识库/);
});

test('AI chat screen exposes context title, settings, streaming, thinking, and citations', () => {
  const content = chat();
  for (const expected of ['contextTitle', '会话设置', 'stream', 'thinking', 'citations']) {
    assert.match(content, new RegExp(expected));
  }
});

test('AI chat header shows the current model below the chat title', () => {
  const content = chat();
  const service = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  assert.match(content, /getCurrentChatModelLabel/);
  assert.match(content, /modelLabel/);
  assert.match(content, /styles\.modelSubtitle/);
  assert.match(service, /getCurrentChatModelLabel/);
  assert.match(service, /provider\.displayName/);
  assert.match(service, /model\?\.displayName/);
});

test('AI chat keeps the top bar fixed while only messages scroll', () => {
  const content = chat();
  assert.match(content, /<ScrollView/);
  assert.match(content, /style=\{styles\.messageScroller\}/);
  assert.match(content, /contentContainerStyle=\{styles\.messageScrollContent\}/);
  assert.match(content, /styles\.composerPanel/);
  assert.doesNotMatch(content, /scrollable\s*\n\s*>/);
  assert.doesNotMatch(content, /footer=\{/);
});

test('AI chat uses the botanical full-screen background image', () => {
  const content = chat();
  const backgrounds = fs.readFileSync(path.join(root, 'src/design/backgrounds.ts'), 'utf8');
  const pageBackground = fs.readFileSync(path.join(root, 'src/components/PageBackground.tsx'), 'utf8');

  assert.match(content, /backgroundVariant="aiChat"/);
  assert.match(backgrounds, /aiChat:\s*\[\]/);
  assert.match(backgrounds, /require\('\.\.\/\.\.\/docs\/black\.png'\)/);
  assert.match(backgrounds, /aspectRatio:\s*941\s*\/\s*1672/);
  assert.match(backgrounds, /resizeMode:\s*'cover'/);
  assert.match(pageBackground, /resizeMode=\{backgroundImage\.resizeMode \?\? 'contain'\}/);
});

test('AI chat composer follows the keyboard and messages stay pinned to the latest item', () => {
  const content = chat();
  assert.match(content, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.match(content, /keyboardBottomInset/);
  assert.match(content, /messageScrollRef/);
  assert.match(content, /scrollToEnd/);
  assert.match(content, /onContentSizeChange=\{\(\) => scrollToLatestMessage\(\)\}/);
});

test('AI chat streaming does not force bottom after the user scrolls upward', () => {
  const content = chat();
  assert.match(content, /userScrolledAwayFromBottomRef/);
  assert.match(content, /MESSAGE_BOTTOM_LOCK_THRESHOLD/);
  assert.match(content, /handleMessageScroll/);
  assert.match(content, /onScroll=\{handleMessageScroll\}/);
  assert.match(content, /scrollEventThrottle=\{16\}/);
  assert.match(content, /if \(!force && userScrolledAwayFromBottomRef\.current\)/);
  assert.doesNotMatch(content, /onContentSizeChange=\{\(\) => messageScrollRef\.current\?\.scrollToEnd/);
});

test('AI chat supports stopping, regenerating replies, and rewriting user messages', () => {
  const content = chat();
  const service = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const bubble = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');
  const composer = fs.readFileSync(path.join(root, 'src/components/ai/AiChatComposer.tsx'), 'utf8');

  for (const expected of ['stopStreamingMessage', 'regenerateAssistantMessage', 'rewriteUserMessage']) {
    assert.match(content, new RegExp(expected));
    assert.match(service, new RegExp(expected));
  }
  assert.match(bubble, /onEditUser/);
  assert.match(bubble, /onRegenerate/);
  assert.match(composer, /onCancelEdit/);
  assert.match(composer, /停止回复/);
  assert.match(composer, /刷新回复/);
});

test('AI chat composer supports image, video, and document attachments', () => {
  const content = chat();
  const composer = fs.readFileSync(path.join(root, 'src/components/ai/AiChatComposer.tsx'), 'utf8');

  assert.match(content, /expo-document-picker/);
  assert.match(content, /expo-image-picker/);
  assert.match(content, /CHAT_DOCUMENT_TYPES/);
  assert.match(content, /pickChatImages/);
  assert.match(content, /pickChatVideos/);
  assert.match(content, /pickChatDocuments/);
  assert.match(content, /buildChatMessageContent/);
  assert.match(content, /\[附件\]/);
  assert.match(content, /上传图片/);
  assert.match(content, /上传视频/);
  assert.match(content, /上传文档/);
  assert.match(composer, /AiComposerAttachment/);
  assert.match(composer, /attachments/);
  assert.match(composer, /onAddAttachment/);
  assert.match(composer, /onRemoveAttachment/);
  assert.match(composer, /styles\.attachmentRail/);
  assert.match(composer, /添加附件/);
});

test('AI chat messages expose compact copy, edit, and regenerate buttons below bubbles', () => {
  const content = chat();
  const bubble = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');

  assert.match(content, /expo-clipboard/);
  assert.match(content, /Clipboard\.setStringAsync/);
  assert.match(bubble, /styles\.actionRow/);
  assert.match(bubble, /styles\.messageActionButton/);
  assert.match(bubble, /accessibilityLabel="复制消息"/);
  assert.match(bubble, /accessibilityLabel="重写消息"/);
  assert.match(bubble, /accessibilityLabel="重新生成回复"/);
  assert.match(bubble, /name="copy-outline"/);
  assert.match(bubble, /name="create-outline"/);
  assert.match(bubble, /name="refresh-outline"/);
  assert.match(bubble, /height:\s*28/);
  assert.match(bubble, /width:\s*28/);
  assert.doesNotMatch(content, /messageActionTarget/);
  assert.doesNotMatch(content, /MESSAGE_MENU_WIDTH/);
  assert.doesNotMatch(bubble, /onLongPress/);
});

test('AI chat composer matches the botanical floating capsule input reference', () => {
  const content = chat();
  const composer = fs.readFileSync(path.join(root, 'src/components/ai/AiChatComposer.tsx'), 'utf8');

  assert.match(content, /backgroundColor:\s*'transparent'/);
  assert.match(content, /paddingBottom:\s*spacing\[3\]/);
  assert.match(composer, /styles\.composerShell/);
  assert.match(composer, /multiline=\{false\}/);
  assert.match(composer, /borderRadius:\s*radius\.pill/);
  assert.match(composer, /backgroundColor:\s*'rgba\(255, 253, 248, 0\.9\)'/);
  assert.match(composer, /\.\.\.shadows\.floating/);
  assert.match(composer, /styles\.addButton/);
  assert.match(composer, /name="add"/);
  assert.match(composer, /placeholder="输入问题或整理需求"/);
  assert.match(composer, /name="mic-outline"/);
  assert.match(composer, /name=\{editing \? 'checkmark' : 'paper-plane-outline'\}/);
  assert.match(composer, /height:\s*metrics\.iconButtonSize/);
  assert.match(composer, /width:\s*metrics\.iconButtonSize/);
  assert.match(composer, /minHeight:\s*64/);
  assert.doesNotMatch(composer, /width:\s*'94%'/);
  assert.doesNotMatch(composer, /maxWidth:\s*680/);
});

test('Shared dialogs and action sheets use the botanical pattern surface', () => {
  const dialog = fs.readFileSync(path.join(root, 'src/components/AppDialog.tsx'), 'utf8');
  const actionSheet = fs.readFileSync(path.join(root, 'src/components/AppActionSheet.tsx'), 'utf8');
  const personalUnlock = fs.readFileSync(path.join(root, 'src/components/PersonalUnlockModal.tsx'), 'utf8');

  for (const content of [dialog, actionSheet, personalUnlock]) {
    assert.match(content, /require\('\.\.\/\.\.\/docs\/black\.png'\)/);
    assert.match(content, /styles\.patternImage/);
    assert.match(content, /overflow:\s*'hidden'/);
  }
});

test('AI message thinking and per-message actions stay outside the chat bubble', () => {
  const bubble = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');
  const renderPart = bubble.split('const styles = StyleSheet.create')[0];
  const thinkingIndex = renderPart.indexOf('styles.thinkingWrap');
  const bubbleIndex = renderPart.indexOf('styles.bubble');
  const actionIndex = renderPart.indexOf('styles.actionRow');
  assert.ok(thinkingIndex >= 0 && thinkingIndex < bubbleIndex);
  assert.ok(actionIndex > bubbleIndex);
  assert.match(bubble, /userActionRow/);
  assert.match(bubble, /assistantActionRow/);
  assert.match(bubble, /messageActionButton/);
  assert.doesNotMatch(bubble, /retryButton/);
});

test('AI custom top bars use safe status-bar spacing and compact workbench layout', () => {
  const homeContent = home();
  const chatContent = chat();
  for (const content of [homeContent, chatContent]) {
    assert.match(content, /useSafeAreaInsets/);
    assert.match(content, /StatusBar\.currentHeight/);
    assert.match(content, /layout\.pageTopOffset/);
  }
  assert.match(homeContent, /rhythm\.entryCardGap/);
  assert.doesNotMatch(homeContent, /知识库与资料/);
});

test('AI provider and model screens keep preset providers simple and custom address scoped to other models', () => {
  const providerSettings = fs.readFileSync(path.join(root, 'src/screens/AiProviderSettingsScreen.tsx'), 'utf8');
  const sessionConfig = fs.readFileSync(path.join(root, 'src/screens/AiSessionConfigScreen.tsx'), 'utf8');
  const constants = fs.readFileSync(path.join(root, 'src/ai/aiConstants.ts'), 'utf8');
  const providerService = fs.readFileSync(path.join(root, 'src/ai/aiProviderService.ts'), 'utf8');

  assert.match(providerSettings, /accountCard/);
  assert.match(providerSettings, /dropdownPanel/);
  assert.match(providerSettings, /providerSheetVisible/);
  assert.match(providerSettings, /modelSheetVisible/);
  assert.match(providerSettings, /选择模型商/);
  assert.match(providerSettings, /selectedProviderId/);
  assert.match(providerSettings, /saveProviderApiKey/);
  assert.match(providerSettings, /saveProviderBaseUrl/);
  assert.match(providerSettings, /saveProviderDefaultModels/);
  assert.match(providerSettings, /saveManualChatModel/);
  assert.match(providerSettings, /testProvider/);
  assert.match(providerSettings, /syncProviderModels/);
  assert.match(providerSettings, /embeddingModels/);
  assert.match(providerSettings, /supportsChat/);
  assert.match(providerSettings, /chatModels\.map/);
  assert.match(providerSettings, /暂无可用模型/);
  assert.match(providerSettings, /selectedIsOtherProvider/);
  assert.match(providerSettings, /测试连接/);
  assert.match(providerSettings, /FeedbackBanner/);
  assert.match(providerSettings, /测试连接中/);
  assert.match(providerSettings, /连接成功/);
  assert.match(providerSettings, /连接失败/);
  assert.match(providerSettings, /同步模型/);
  assert.match(providerSettings, /advancedVisible/);
  assert.match(providerSettings, /高级设置/);
  assert.match(providerService, /selectProvider/);
  assert.doesNotMatch(app, /ai-model-picker/);
  assert.match(sessionConfig, /updateAiThreadSessionConfig/);
  assert.match(sessionConfig, /loadThreadSessionConfig/);
  assert.match(sessionConfig, /applyRoleCardToThread/);
  assert.match(constants, /displayName: '其他模型'/);
});

test('AI workbench exposes materials without a normal-space status badge', () => {
  const content = home();
  assert.match(content, /onOpenMaterials/);
  assert.match(content, /最近材料/);
  assert.match(content, /私密空间/);
  assert.doesNotMatch(content, /const spaceLabel = space === 'personal' \? '私密空间' : '普通空间'/);
});

test('AI material and IP selection screens keep vertical rhythm explicit', () => {
  const ipPicker = fs.readFileSync(path.join(root, 'src/screens/AiIpPickerScreen.tsx'), 'utf8');
  const materialImport = fs.readFileSync(path.join(root, 'src/screens/AiMaterialImportScreen.tsx'), 'utf8');
  const materialList = fs.readFileSync(path.join(root, 'src/screens/AiMaterialListScreen.tsx'), 'utf8');
  const knowledgeBase = fs.readFileSync(path.join(root, 'src/screens/AiKnowledgeBaseScreen.tsx'), 'utf8');

  for (const content of [ipPicker, materialImport, materialList, knowledgeBase]) {
    assert.match(content, /contentStack/);
    assert.match(content, /gap:\s*rhythm\.entryCardGap/);
  }
  assert.match(ipPicker, /list:\s*\{[\s\S]{0,80}gap:\s*rhythm\.listCardGap/);
  assert.match(materialImport, /ipChoiceList:\s*\{[\s\S]{0,80}gap:\s*rhythm\.compactGridGap/);
  assert.match(materialList, /list:\s*\{[\s\S]{0,80}gap:\s*rhythm\.listCardGap/);
});

test('AI material import reports file, manual text, IP generation, and PDF parse results visibly', () => {
  const materialImport = fs.readFileSync(path.join(root, 'src/screens/AiMaterialImportScreen.tsx'), 'utf8');
  const pdfParser = fs.readFileSync(path.join(root, 'src/ai/documentParsers/pdfParser.ts'), 'utf8');

  assert.match(materialImport, /FeedbackBanner/);
  assert.match(materialImport, /正在导入材料/);
  assert.match(materialImport, /feedbackForDocument/);
  assert.match(materialImport, /document\.parserStatus === 'failed'/);
  assert.match(materialImport, /tone:\s*'warning'/);
  assert.match(materialImport, /tone:\s*'success'/);
  assert.match(materialImport, /已可用于问答/);
  assert.match(materialImport, /从选中 IP 生成材料/);
  assert.match(materialImport, /multiple:\s*true/);
  assert.match(materialImport, /importPickedDocuments/);
  assert.doesNotMatch(pdfParser, /当前版本暂不支持从 PDF 提取文本/);
});

test('AI document reader uses a full-screen vertical reading surface', () => {
  const reader = fs.readFileSync(path.join(root, 'src/screens/AiDocumentReaderScreen.tsx'), 'utf8');
  const pdfReader = fs.readFileSync(path.join(root, 'src/components/ai/AiPdfReader.tsx'), 'utf8');

  assert.match(reader, /AppScreen/);
  assert.match(reader, /readerHost/);
  assert.match(reader, /metrics\.minTouchSize/);
  assert.match(reader, /position: 'absolute'/);
  assert.doesNotMatch(reader, /ScreenScaffold/);
  assert.match(pdfReader, /FlatList/);
  assert.match(pdfReader, /showsVerticalScrollIndicator=\{false\}/);
});

test('AI session settings avoid one overloaded button cluster', () => {
  const sessionConfig = fs.readFileSync(path.join(root, 'src/screens/AiSessionConfigScreen.tsx'), 'utf8');
  const actionsBlock = /<View style=\{styles\.actions\}>([\s\S]*?)<\/View>/.exec(sessionConfig)?.[1] ?? '';

  assert.match(sessionConfig, /<PrimaryButton label="模型账号"/);
  assert.match(actionsBlock, /保存设置/);
  assert.match(actionsBlock, /开始聊天/);
  assert.doesNotMatch(actionsBlock, /模型账号/);
});

test('AI history supports long-press batch delete and private-space moves', () => {
  const history = fs.readFileSync(path.join(root, 'src/screens/AiHistoryScreen.tsx'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const repository = fs.readFileSync(path.join(root, 'src/database/repositories/aiThreadRepository.ts'), 'utf8');

  for (const expected of ['onLongPress', 'selectedIds', 'deleteAiThreads', 'moveAiThreadsBetweenSpaces', 'personalPassword']) {
    assert.match(history, new RegExp(expected));
  }
  assert.match(history, /PanResponder\.create/);
  assert.match(history, /swipedThreadId/);
  assert.match(history, /styles\.archiveAction/);
  assert.match(history, /setActionThread\(thread\)/);
  assert.match(history, /AppActionSheet/);
  assert.doesNotMatch(history, /rowActions/);
  assert.doesNotMatch(history, /PrimaryButton/);
  assert.match(history, /footer={selectionFooter}/);
  assert.match(history, /gap: rhythm\.listCardGap/);
  assert.match(service, /verifyPersonalPassword/);
  assert.match(repository, /exportThread/);
  assert.match(repository, /importThread/);
  assert.match(repository, /deleteThreads/);
});

test('AI materials support batch removal and chat history supports rename', () => {
  const materialList = fs.readFileSync(path.join(root, 'src/screens/AiMaterialListScreen.tsx'), 'utf8');
  const history = fs.readFileSync(path.join(root, 'src/screens/AiHistoryScreen.tsx'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');

  assert.match(materialList, /selectedIds/);
  assert.match(materialList, /removeMaterials/);
  assert.match(materialList, /批量移除/);
  assert.match(materialList, /selectionFooter/);
  assert.match(materialList, /selectedRow/);
  assert.doesNotMatch(materialList, /selectionBar/);
  assert.match(materialList, /onLongPress/);
  assert.match(history, /renameAiThread/);
  assert.match(history, /重命名/);
  assert.match(service, /renameAiThread/);
  assert.match(service, /titleStatus:\s*'custom'/);
});
