const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const home = () => fs.readFileSync(path.join(root, 'src/screens/AiHomeScreen.tsx'), 'utf8');
const chat = () => fs.readFileSync(path.join(root, 'src/screens/AiChatScreen.tsx'), 'utf8');
const aiScreenFiles = () => fs.readdirSync(path.join(root, 'src/screens')).filter((file) => /^Ai.*\.tsx$/.test(file));

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
    'product-doc',
  ]) {
    assert.match(app, new RegExp(route));
  }
});

test('About screen exposes the in-app product documentation entry and route stack target', () => {
  const about = read('src/screens/AboutScreen.tsx');
  const productDoc = read('src/screens/ProductDocumentationScreen.tsx');
  const readerTemplate = read('src/components/ai/aiMarkdownReaderTemplate.ts');
  const service = read('src/services/productDocumentationService.ts');

  assert.match(about, /产品文档/);
  assert.match(about, /onPushRoute\(\{ name: 'product-doc', space, preloadedMarkdown: productDocMd }\)/);
  assert.match(about, /getPreloadedProductDocumentationMarkdown/);
  assert.match(productDoc, /<Text style=\{styles\.brandText\}>Pixory<\/Text>/);
  assert.match(productDoc, /<Text style=\{styles\.backText\}>返回<\/Text>/);
  assert.match(productDoc, /<AppScreen backgroundColor=\{DOC_CANVAS\} contentStyle=\{styles\.screen\}>/);
  assert.match(productDoc, /AiMarkdownReader/);
  assert.match(service, /PRODUCT_MANUAL_MARKDOWN/);
  assert.match(service, /https:\/\/mist01\.com\//);
  assert.match(readerTemplate, /height: 75vh/);
  assert.match(readerTemplate, /background: rgba\(24, 23, 21, 0\.85\)/);
  assert.match(readerTemplate, /font-size: 30px/);
});

test.skip('AI workbench exposes chat and role library without old knowledge starts', () => {
  const content = home();
  assert.match(content, /开始聊天/);
  assert.match(content, /角色库/);
  assert.match(content, /primaryChatCard/);
  assert.match(content, /backgroundVariant="aiChat"/);
  assert.match(content, /headerDividerVisible=\{false\}/);
  assert.doesNotMatch(content, /START_ENTRIES/);
  assert.doesNotMatch(content, /entryRow/);
  assert.match(content, /AiLightScaffold/);
  assert.match(content, /title="AI 工作台"/);
  assert.doesNotMatch(content, />Pixory</);
  assert.doesNotMatch(content, /brandName/);
  assert.doesNotMatch(content, /问问某个 IP/);
  assert.doesNotMatch(content, /连接知识库/);
  assert.doesNotMatch(content, /SillyTavern/);
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
  assert.match(content, /getCurrentChatModelPresentation/);
  assert.match(content, /modelLabel/);
  assert.match(content, /modelRefreshKey/);
  assert.match(content, /\[modelRefreshKey,\s*reloadModelLabel,\s*threadId\]/);
  assert.match(content, /styles\.modelSubtitle/);
  assert.match(service, /getCurrentChatModelPresentation/);
  assert.match(service, /provider\.displayName/);
  assert.match(service, /model\?\.displayName/);
});

test('AI chat keeps the top bar fixed while only messages scroll', () => {
  const content = chat();
  assert.match(content, /<FlatList/);
  assert.match(content, /data=\{invertedMessageItems\}/);
  assert.match(content, /type VisibleMessageItem/);
  assert.match(content, /renderMessageItem/);
  assert.match(content, /keyExtractor=\{messageKeyExtractor\}/);
  assert.match(content, /style=\{styles\.messageScroller\}/);
  assert.match(content, /contentContainerStyle=\{styles\.messageScrollContent\}/);
  assert.match(content, /styles\.composerPanel/);
  assert.doesNotMatch(content, /开始对话/);
  assert.doesNotMatch(content, /styles\.emptyState/);
  assert.doesNotMatch(content, /scrollable\s*\n\s*>/);
  assert.doesNotMatch(content, /ListFooterComponent=\{\s*footer/);
});

test('AI chat uses the design.md light mode surface', () => {
  const content = chat();
  const theme = fs.readFileSync(path.join(root, 'src/components/ai/aiLightTheme.ts'), 'utf8');

  assert.match(content, /backgroundColor=\{aiLightColors\.canvas\}/);
  assert.match(content, /aiLightDisplayFont/);
  assert.match(theme, /canvas:\s*'#EDEDED'/);
  assert.match(theme, /surface:\s*'#FFFFFF'/);
  assert.match(theme, /card:\s*'#FFFFFF'/);
  assert.match(theme, /primary:\s*'#5B9CF6'/);
  assert.match(theme, /primaryActive:\s*'#4A8BE6'/);
  assert.match(theme, /dark:\s*'#1C1C1E'/);
  assert.match(theme, /hairline:\s*'#E5E5EA'/);
  assert.doesNotMatch(content, /backgroundVariant="aiChat"/);
});

test('AI chat relies on inverted native list positioning and scoped Android keyboard avoidance', () => {
  const content = chat();
  assert.match(content, /messageListRef/);
  assert.match(content, /\binverted\b/);
  assert.match(content, /data=\{invertedMessageItems\}/);
  assert.match(content, /ListFooterComponent=/);
  assert.match(content, /scrollToOffset\(\{\s*animated,\s*offset:\s*0\s*\}\)/);
  assert.match(content, /KeyboardAvoidingView/);
  assert.match(content, /behavior=\{Platform\.OS === 'android' \? 'height' : undefined\}/);
  assert.doesNotMatch(content, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.doesNotMatch(content, /keyboardBottomInset/);
  assert.doesNotMatch(content, /scrollToEnd/);
  assert.doesNotMatch(content, /onContentSizeChange=/);
});

test('AI chat streaming does not force bottom after the user scrolls upward', () => {
  const content = chat();
  const scrollHandler = /const handleMessageScroll = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/.exec(content)?.[0] ?? '';
  assert.match(content, /userScrolledAwayFromBottomRef/);
  assert.match(content, /MESSAGE_STREAM_FOLLOW_THRESHOLD = 48/);
  assert.match(content, /shouldReattachToLatest/);
  assert.match(content, /resolveScrollToLatestGestureDirection/);
  assert.doesNotMatch(content, /MESSAGE_SCROLL_BUTTON_THRESHOLD = 2400/);
  assert.doesNotMatch(content, /MESSAGE_STREAMING_BUTTON_THRESHOLD/);
  assert.match(content, /ACTIVE_LATEST_JUMP_RETRY_DELAYS_MS = \[80, 260, 520\]/);
  assert.match(content, /bottomLockedRef/);
  assert.match(content, /showScrollToLatest/);
  assert.match(content, /handleMessageScroll/);
  assert.match(content, /onScroll=\{handleMessageScroll\}/);
  assert.match(content, /onScrollBeginDrag=\{handleMessageScrollBeginDrag\}/);
  assert.match(content, /onMomentumScrollBegin=\{handleMessageMomentumScrollBegin\}/);
  assert.match(content, /onMomentumScrollEnd=\{handleMessageMomentumScrollEnd\}/);
  assert.match(content, /isMomentumScrollingRef\.current = false;\s*handleMessageScrollEnd\(event\)/);
  assert.match(content, /onScrollEndDrag=\{handleMessageScrollEnd\}/);
  assert.match(content, /scrollEventThrottle=\{16\}/);
  assert.match(content, /if \(!force && userScrolledAwayFromBottomRef\.current\)/);
  assert.match(content, /function scheduleIntentionalLatestJump\(animated = false\)/);
  assert.match(content, /const nextShowScrollToLatest = shouldShowScrollToLatest\(contentOffset\.y\)/);
  assert.match(content, /scheduleStreamingTailReconcile\("scroll"/);
  assert.doesNotMatch(content, /hasUnseenStreamingUpdate \|\| shouldShowScrollToLatest\(contentOffset\.y\)/);
  assert.doesNotMatch(scrollHandler, /flushBufferedStreamingState/);
  assert.doesNotMatch(content, /onContentSizeChange=/);
  assert.doesNotMatch(content, /scrollToEnd/);
});

test('AI chat supports stopping, regenerating replies, and rewriting user messages', () => {
  const content = chat();
  const service = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const manager = fs.readFileSync(path.join(root, 'src/ai/aiGenerationManager.ts'), 'utf8');
  const bubble = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');
  const composer = fs.readFileSync(path.join(root, 'src/components/ai/AiChatComposer.tsx'), 'utf8');

  for (const expected of ['stopStreamingMessage', 'regenerateAssistantMessage', 'rewriteUserMessage']) {
    assert.match(manager, new RegExp(expected));
    assert.match(service, new RegExp(expected));
  }
  assert.match(content, /aiGenerationManager/);
  assert.match(bubble, /onEditUser/);
  assert.match(bubble, /editingMessageId/);
  assert.match(bubble, /onSubmitEdit/);
  assert.match(bubble, /onCancelEdit/);
  assert.match(bubble, /onRegenerate/);
  assert.match(composer, /停止回复/);
  assert.doesNotMatch(composer, /刷新回复/);
  assert.doesNotMatch(composer, /retryAvailable/);
});

test('AI chat composer supports image and document attachments without a video upload entry', () => {
  const content = chat();
  const composer = fs.readFileSync(path.join(root, 'src/components/ai/AiChatComposer.tsx'), 'utf8');

  assert.match(content, /expo-document-picker/);
  assert.match(content, /expo-image-picker/);
  assert.match(content, /CHAT_DOCUMENT_TYPES/);
  assert.match(content, /pickChatImages/);
  assert.match(content, /pickChatDocuments/);
  assert.match(content, /buildChatMessageContent/);
  assert.match(content, /\[附件\]/);
  assert.doesNotMatch(content, /pickChatVideos/);
  assert.doesNotMatch(content, /mediaTypes: \['videos'\]/);
  assert.match(composer, /上传图片/);
  assert.match(composer, /上传文档/);
  assert.doesNotMatch(composer, /上传视频/);
  assert.match(composer, /AiComposerAttachment/);
  assert.match(composer, /attachments/);
  assert.match(composer, /onAddImageAttachment/);
  assert.doesNotMatch(composer, /onAddVideoAttachment/);
  assert.match(composer, /onAddDocumentAttachment/);
  assert.match(composer, /onRemoveAttachment/);
  assert.match(composer, /styles\.attachmentRail/);
  assert.match(composer, /添加附件/);
});

test('AI chat messages move full actions into long press and keep only latest AI footer actions', () => {
  const content = chat();
  const bubble = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');
  const contextMenu = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageContextMenu.tsx'), 'utf8');

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
  assert.match(bubble, /onLongPress/);
  assert.match(bubble, /showActionButtons/);
  assert.match(content, /latestVisibleMessageId/);
  assert.match(content, /AiMessageContextMenu/);
  assert.match(contextMenu, /timeLabel/);
});

test('AI chat composer matches the design.md light input surface', () => {
  const content = chat();
  const composer = fs.readFileSync(path.join(root, 'src/components/ai/AiChatComposer.tsx'), 'utf8');

  assert.match(content, /backgroundColor:\s*aiLightColors\.canvas/);
  assert.match(content, /paddingBottom:\s*spacing\[3\]/);
  assert.match(composer, /styles\.composerShell/);
  assert.match(composer, /multiline/);
  assert.match(composer, /MAX_COMPOSER_LINES/);
  assert.match(composer, /styles\.inputMeasurer/);
  assert.match(composer, /onLayout=\{handleMeasuredTextLayout\}/);
  assert.match(composer, /scrollEnabled=\{/);
  assert.match(composer, /borderRadius:\s*radius\.md/);
  assert.match(composer, /composerShell:\s*\{[\s\S]*backgroundColor:\s*aiLightColors\.surface/);
  assert.match(composer, /composerShell:\s*\{[\s\S]*borderColor:\s*aiLightColors\.hairline/);
  assert.match(composer, /borderWidth:\s*StyleSheet\.hairlineWidth/);
  assert.match(composer, /\.\.\.shadows\.sm/);
  assert.match(composer, /styles\.addButton/);
  assert.match(composer, /name="add"/);
  assert.match(composer, /placeholder="输入提示或需求"/);
  assert.doesNotMatch(composer, /name="mic-outline"/);
  assert.match(composer, /onVoiceInput/);
  assert.match(composer, /name="paper-plane-outline"/);
  assert.match(composer, /height:\s*spacing\[8\]/);
  assert.match(composer, /width:\s*spacing\[8\]/);
  assert.match(composer, /maxHeight:\s*COMPOSER_INPUT_MAX_HEIGHT/);
  assert.match(composer, /minHeight:\s*spacing\[10\]/);
  assert.match(composer, /hitSlop=\{spacing\[2\]\}/);
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
    assert.match(content, /resizeMode="stretch"/);
    assert.match(content, /opacity:\s*0\.24/);
    assert.match(content, /overflow:\s*'hidden'/);
  }
});

test('AI message thinking and per-message actions stay outside the chat bubble', () => {
  const bubble = fs.readFileSync(path.join(root, 'src/components/ai/AiMessageBubble.tsx'), 'utf8');
  const renderPart = bubble.split('const styles = StyleSheet.create')[0];
  const bubbleComponentPart =
    /function AiMessageBubbleComponent[\s\S]*?function areAiMessageBubblePropsEqual/.exec(bubble)?.[0] ?? renderPart;
  const thinkingIndex = bubbleComponentPart.indexOf('styles.thinkingWrap');
  const bubbleIndex = bubbleComponentPart.indexOf('styles.bubble');
  const actionIndex = bubbleComponentPart.indexOf('<AiMessageFooterActions');
  assert.ok(thinkingIndex >= 0 && thinkingIndex < bubbleIndex);
  assert.ok(actionIndex > bubbleIndex);
  assert.match(bubble, /export function AiMessageFooterActions/);
  assert.match(bubble, /styles\.actionRow/);
  assert.match(bubble, /userActionRow/);
  assert.match(bubble, /assistantActionRow/);
  assert.match(bubble, /messageActionButton/);
  assert.doesNotMatch(bubble, /retryButton/);
});

test('AI custom top bars use safe status-bar spacing and compact workbench layout', () => {
  const homeContent = home();
  const chatContent = chat();
  const scaffold = fs.readFileSync(path.join(root, 'src/components/ai/AiLightScaffold.tsx'), 'utf8');
  for (const content of [chatContent, scaffold]) {
    assert.match(content, /useSafeAreaInsets/);
    assert.match(content, /StatusBar\.currentHeight/);
    assert.match(content, /layout\.pageTopOffset/);
  }
  assert.match(homeContent, /AiLightScaffold/);
  assert.match(homeContent, /rhythm\.screenSectionGap/);
  assert.match(homeContent, /rhythm\.inlineGap/);
  assert.doesNotMatch(homeContent, /知识库与资料/);
});

test('AI provider and model screens keep preset providers simple and custom address scoped to other models', () => {
  const providerSettings = fs.readFileSync(path.join(root, 'src/screens/AiProviderSettingsScreen.tsx'), 'utf8');
  const sessionConfig = fs.readFileSync(path.join(root, 'src/screens/AiSessionConfigScreen.tsx'), 'utf8');
  const constants = fs.readFileSync(path.join(root, 'src/ai/aiConstants.ts'), 'utf8');
  const providerService = fs.readFileSync(path.join(root, 'src/ai/aiProviderService.ts'), 'utf8');

  assert.match(providerSettings, /AiLightListGroup/);
  assert.match(providerSettings, /AiLightButton/);
  assert.match(providerSettings, /aiLightColors/);
  assert.match(providerSettings, /dropdownPanel/);
  assert.match(providerSettings, /providerSheetVisible/);
  assert.match(providerSettings, /modelSheetVisible/);
  assert.match(providerSettings, /选择模型商/);
  assert.match(providerSettings, /selectedProviderId/);
  assert.match(providerSettings, /saveProviderApiKeyForSpace/);
  assert.match(providerSettings, /saveProviderBaseUrl/);
  assert.match(providerSettings, /saveProviderDefaultModels/);
  assert.match(providerSettings, /saveManualChatModel/);
  assert.match(providerSettings, /verifyCurrentProviderModel/);
  assert.match(providerSettings, /syncProviderModels/);
  assert.match(providerSettings, /embeddingModels/);
  assert.match(providerSettings, /Embedding 接口/);
  assert.match(providerSettings, /自定义 Embedding 模型/);
  assert.match(providerSettings, /supportsChat/);
  assert.match(providerSettings, /chatModels\.map/);
  assert.match(providerSettings, /暂无可用模型/);
  assert.match(providerSettings, /selectedIsOtherProvider/);
  assert.match(providerSettings, /测试当前模型/);
  assert.match(providerSettings, /FeedbackBanner/);
  assert.match(providerSettings, /正在验证 API key、模型和服务地址/);
  assert.match(providerSettings, /当前模型可用/);
  assert.match(providerSettings, /测试失败/);
  assert.match(providerSettings, /刷新模型列表/);
  assert.match(providerSettings, /advancedVisible/);
  assert.match(providerSettings, /高级设置/);
  assert.match(providerService, /selectProvider/);
  assert.doesNotMatch(app, /ai-model-picker/);
  assert.match(sessionConfig, /updateAiThreadSessionConfig/);
  assert.match(sessionConfig, /loadThreadSessionConfig/);
  assert.match(sessionConfig, /onOpenRoleLibrary/);
  assert.doesNotMatch(sessionConfig, /applyRoleCardToThread/);
  assert.match(constants, /displayName: '其他模型'/);
});

test('AI workbench exposes role library while material list route remains registered', () => {
  const content = home();
  assert.match(content, /onOpenRoleLibrary/);
  assert.match(content, /角色库/);
  assert.match(content, /listRoleCards/);
  assert.match(content, /buildRoleLibraryShortcuts/);
  assert.match(content, /roleRailWrap/);
  assert.match(content, /onStartChatWithRole\(role\.roleCardId\)/);
  assert.doesNotMatch(content, /onOpenMaterials/);
  assert.doesNotMatch(content, /最近材料/);
  assert.doesNotMatch(content, /listRecentMaterials/);
  assert.match(app, /ai-role-library/);
  assert.match(app, /AiRoleLibraryScreen/);
  assert.match(app, /AiRoleCardDetailScreen/);
  assert.match(app, /onStartChatWithRole/);
  assert.match(app, /createNormalThreadFromRoleCard/);
  assert.match(app, /ai-material-list/);
  assert.match(content, /私密空间/);
  assert.match(content, /普通空间/);
});

test('AI route screens use the AI light scaffold and avoid global green controls', () => {
  for (const file of aiScreenFiles()) {
    const content = fs.readFileSync(path.join(root, 'src/screens', file), 'utf8');
    assert.doesNotMatch(content, /backgroundVariant="search"/, file);
    assert.doesNotMatch(content, /from '\.\.\/components\/PrimaryButton'/, file);
    assert.doesNotMatch(content, /from '\.\.\/components\/FilterChip'/, file);
    assert.doesNotMatch(content, /from '\.\.\/components\/ScreenScaffold'/, file);
    assert.doesNotMatch(content, /from '\.\.\/components\/ContentCard'/, file);
    assert.doesNotMatch(content, /from '\.\.\/components\/FormInputRow'/, file);
    assert.doesNotMatch(content, /from '\.\.\/components\/FormTextareaRow'/, file);
    assert.doesNotMatch(content, /from '\.\.\/components\/SearchBar'/, file);
    assert.doesNotMatch(content, /from '\.\.\/components\/FeedbackBanner'/, file);
    assert.ok(/AiLightScaffold/.test(content) || /backgroundColor=\{aiLightColors\.canvas\}/.test(content), file);
  }
});

test('AI form inputs, search, and feedback use AI light components', () => {
  const roleEditor = fs.readFileSync(path.join(root, 'src/screens/AiRoleCardEditorScreen.tsx'), 'utf8');
  const sessionConfig = fs.readFileSync(path.join(root, 'src/screens/AiSessionConfigScreen.tsx'), 'utf8');
  const ipPicker = fs.readFileSync(path.join(root, 'src/screens/AiIpPickerScreen.tsx'), 'utf8');
  const materialImport = fs.readFileSync(path.join(root, 'src/screens/AiMaterialImportScreen.tsx'), 'utf8');
  const providerSettings = fs.readFileSync(path.join(root, 'src/screens/AiProviderSettingsScreen.tsx'), 'utf8');
  const field = fs.readFileSync(path.join(root, 'src/components/ai/AiLightField.tsx'), 'utf8');
  const feedback = fs.readFileSync(path.join(root, 'src/components/ai/AiLightFeedbackBanner.tsx'), 'utf8');

  assert.match(roleEditor, /AiLightInputRow/);
  assert.match(roleEditor, /AiLightTextareaRow/);
  assert.match(sessionConfig, /AiLightTextareaRow/);
  assert.match(ipPicker, /AiLightSearchBar/);
  assert.match(materialImport, /AiLightFeedbackBanner/);
  assert.match(providerSettings, /AiLightFeedbackBanner/);
  assert.match(field, /aiLightColors/);
  assert.match(feedback, /aiLightColors/);
});

test('AI reading and citation components use the shared AI light tokens', () => {
  for (const file of [
    'AiCitationList.tsx',
    'AiMessageContent.tsx',
    'AiThinkingBlock.tsx',
    'AiTextReader.tsx',
    'AiPdfReader.tsx',
    'AiDocxReader.tsx',
  ]) {
    const content = fs.readFileSync(path.join(root, 'src/components/ai', file), 'utf8');
    assert.match(content, /aiLightColors/, file);
  }
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

  assert.match(sessionConfig, /高级角色指令/);
  assert.match(sessionConfig, /advancedPromptVisible/);
  assert.match(sessionConfig, /全局默认/);
  assert.doesNotMatch(sessionConfig, /<PrimaryButton label="全局默认"/);
  assert.doesNotMatch(sessionConfig, /选择或编辑角色卡/);
  assert.doesNotMatch(sessionConfig, /minHeight=\{132\}/);
  assert.match(actionsBlock, /保存角色指令并开始聊天/);
  assert.match(actionsBlock, /仅保存角色指令/);
  assert.doesNotMatch(actionsBlock, /全局默认/);
});

test('AI session settings can rename and delete the current thread', () => {
  const sessionConfig = fs.readFileSync(path.join(root, 'src/screens/AiSessionConfigScreen.tsx'), 'utf8');

  assert.match(sessionConfig, /renameAiThread/);
  assert.match(sessionConfig, /deleteAiThreads/);
  assert.match(sessionConfig, /AppDialog/);
  assert.match(sessionConfig, /TextInput/);
  assert.match(sessionConfig, /accessibilityLabel="重命名当前会话"/);
  assert.match(sessionConfig, /create-outline/);
  assert.match(sessionConfig, /title="重命名当前会话"/);
  assert.match(sessionConfig, /onPrimary=\{\(\) => void confirmRenameThread\(\)\}/);
  assert.match(sessionConfig, /deleteAiThreads\(space, \[threadId\]\)/);
  assert.match(sessionConfig, /删除当前会话/);
  assert.match(sessionConfig, /移入回收站/);
  assert.match(sessionConfig, /回收站中恢复/);
  assert.match(sessionConfig, /name="trash-outline"/);
  assert.match(sessionConfig, /onCurrentThreadDeleted/);
  assert.match(app, /function closeDeletedAiThread/);
  assert.match(app, /previousRoute\?\.name === 'ai-chat'/);
  assert.match(app, /previousRoute\.threadId === threadId/);
  assert.match(app, /onCurrentThreadDeleted=\{\(\) => closeDeletedAiThread\(currentRoute\.threadId\)\}/);
});

test('AI history long-press enters batch mode while single actions stay in a compact menu', () => {
  const history = fs.readFileSync(path.join(root, 'src/screens/AiHistoryScreen.tsx'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const repository = fs.readFileSync(path.join(root, 'src/database/repositories/aiThreadRepository.ts'), 'utf8');

  for (const expected of ['onLongPress', 'selectedIds', 'deleteAiThreads', 'permanentlyDeleteAiThreads', 'moveAiThreadsBetweenSpaces', 'personalPassword']) {
    assert.match(history, new RegExp(expected));
  }
  assert.match(history, /\{ key: 'archived', label: '回收站' \}/);
  assert.match(history, /PanResponder\.create/);
  assert.match(history, /swipedThreadId/);
  assert.match(history, /styles\.swipeActionSurface/);
  assert.match(history, /onLongPress=\{\(\) => toggleSelected\(thread\.id\)\}/);
  assert.match(history, /accessibilityLabel="会话操作"/);
  assert.match(history, /styles\.rowMenuButton/);
  assert.match(history, /setActionThread\(thread\)/);
  assert.match(history, /key:\s*'delete'/);
  assert.match(history, /key:\s*'restore'/);
  assert.match(history, /label:\s*'移出回收站'/);
  assert.match(history, /confirmRestoreSelected/);
  assert.match(history, /unarchiveAiThread\(space, threadId\)/);
  assert.match(history, /已移出回收站 \$\{count\} 条。/);
  assert.match(history, /setDeleteThread\(actionThread\)/);
  assert.match(history, /deleteThread \? \[deleteThread\.id\] : selectedIds/);
  assert.match(history, /filter === 'archived' \? permanentlyDeleteAiThreads\(space, threadIds\) : deleteAiThreads\(space, threadIds\)/);
  assert.match(history, /filter === 'archived' \? `已永久删除 \$\{count\} 条。` : `已移入回收站 \$\{count\} 条。`/);
  assert.match(history, /AppActionSheet/);
  assert.match(history, /formatAiHistoryMinute/);
  assert.match(history, /thread\.lastMessageAt \?\? thread\.updatedAt/);
  assert.match(history, /上次聊天/);
  assert.match(repository, /lastMessageAt/);
  assert.match(repository, /MAX\(COALESCE\(completedAt, updatedAt, createdAt\)\) AS lastMessageAt/);
  assert.match(repository, /EXISTS \([\s\S]*FROM ai_messages history_messages[\s\S]*history_messages\.threadId = ai_threads\.id[\s\S]*history_messages\.role <> 'system'/);
  assert.doesNotMatch(history, /rowActions/);
  assert.doesNotMatch(history, /PrimaryButton/);
  assert.match(history, /footer={selectionFooter}/);
  assert.match(history, /gap: rhythm\.listCardGap/);
  assert.match(service, /verifyPersonalPassword/);
  assert.match(repository, /exportThread/);
  assert.match(repository, /importThread/);
  assert.match(repository, /softDeleteThreads/);
  assert.match(repository, /deleteThreads/);
});

test('AI chat and history expose drawer quick new chat and searchable grouped history', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const app = read('App.tsx');
  const history = read('src/screens/AiHistoryScreen.tsx');
  const repository = read('src/database/repositories/aiThreadRepository.ts');

  assert.match(chat, /AiComprehensiveRecordDrawer/);
  assert.doesNotMatch(chat, /AiRecentThreadSwitcher/);
  assert.match(chat, /onNewChat/);
  assert.match(chat, /handleNewChatPress/);
  assert.match(chat, /停止当前回复并新建聊天/);
  assert.match(chat, /当前已生成内容会保留在原会话/);
  assert.match(chat, /onNewChat\(\);[\s\S]{0,240}void stopCurrentGeneration\(\{ reloadAfterStop: false \}\)/);
  assert.doesNotMatch(chat, /void handleStop\(\)\.finally/);
  assert.match(chat, /alreadyBlankNewChat/);
  assert.match(chat, /showNewChatFeedback/);
  assert.match(chat, /已在新的空白聊天/);
  assert.match(chat, /renameAiThread/);
  assert.match(chat, /deleteAiThreads/);
  assert.match(chat, /if \(thread\.id === activeThreadIdRef\.current\) \{\s*applyDisplayTitle\(title\);\s*\}/);
  assert.match(chat, /if \(thread\.id === activeThreadIdRef\.current\) \{\s*onNewChat\(\);\s*\}/);
  assert.match(chat, /onRenameThread=\{\(thread, title\) => renameRecentThread\(thread, title\)\}/);
  assert.match(chat, /onDeleteThread=\{\(thread\) => deleteRecentThread\(thread\)\}/);
  assert.match(app, /onNewChat/);
  assert.match(app, /routeKey\?: string/);
  assert.match(app, /function openNewAiChat/);
  assert.match(app, /function openAiChatRoute/);
  assert.match(app, /prepareAiChatRouteForPush/);
  assert.match(app, /currentRoute\?\.name === 'ai-chat'[\s\S]{0,120}return \[\.\.\.current\.slice\(0, -1\), nextRoute\]/);
  assert.match(app, /currentRoute\?\.name === 'ai-history'/);
  assert.match(app, /previousRoute\?\.name === 'ai-chat'[\s\S]{0,160}return \[\.\.\.current\.slice\(0, -2\), nextRoute\]/);
  assert.match(app, /function aiChatRouteKey/);
  assert.match(app, /if \(route\.routeKey\) \{\s*return route\.routeKey;\s*\}/);
  assert.match(app, /key=\{aiChatRouteKey\(currentRoute, routeStack\.length\)\}/);
  assert.doesNotMatch(app, /function aiChatRouteKey[\s\S]*route\.threadId/);
  assert.match(history, /searchText/);
  assert.match(history, /搜索标题或最近消息/);
  assert.match(history, /historyGroupLabel/);
  assert.match(history, /过去 7 天/);
  assert.match(repository, /lastMessagePreview LIKE/);
  const drawer = read('src/components/ai/AiComprehensiveRecordDrawer.tsx');
  assert.match(drawer, /onLongPress=\{\(\) => openRecentActionPopover\(thread\)\}/);
  assert.match(drawer, /recentActionPopover/);
  assert.match(drawer, /accessibilityLabel="重命名最近会话"/);
  assert.match(drawer, /accessibilityLabel="移入回收站最近会话"/);
  assert.match(drawer, /title="重命名会话"/);
  assert.match(drawer, /recentDeleteConfirm/);
  assert.match(drawer, /accessibilityLabel="确认移入回收站最近会话"/);
  assert.match(drawer, /已移入回收站。/);
  assert.doesNotMatch(drawer, /title="删除会话"/);
  assert.match(drawer, /onRenameThread/);
  assert.match(drawer, /onDeleteThread/);
});

test('AI chat switching replaces the active chat route instead of stacking chats behind back', () => {
  const app = read('App.tsx');

  assert.match(app, /function openAiChatRoute\(route: Extract<AppRoute, \{ name: 'ai-chat' \}>\)/);
  assert.match(app, /const nextRoute = prepareAiChatRouteForPush\(route\)/);
  assert.match(app, /if \(currentRoute\?\.name === 'ai-chat'\) \{[\s\S]{0,120}return \[\.\.\.current\.slice\(0, -1\), nextRoute\]/);
  assert.match(app, /if \(currentRoute\?\.name === 'ai-history'\) \{[\s\S]*previousRoute\?\.name === 'ai-chat'[\s\S]{0,160}return \[\.\.\.current\.slice\(0, -2\), nextRoute\]/);
  assert.match(app, /function openNewAiChat\(space: PixorySpace\) \{[\s\S]{0,220}openAiChatRoute\(\{/);
  assert.match(app, /onOpenThread=\{\(thread\) =>\s*openAiChatRoute\(\{/);
  assert.doesNotMatch(app, /function openNewAiChat[\s\S]*return \[\.\.\.current, nextRoute\]/);
});

test('AI history search is debounced and older chats are grouped by month', () => {
  const history = read('src/screens/AiHistoryScreen.tsx');

  assert.match(history, /debouncedSearchText/);
  assert.match(history, /setTimeout\(\(\) => setDebouncedSearchText\(searchText\), 300\)/);
  assert.match(history, /searchText: debouncedSearchText/);
  assert.match(history, /过去 30 天/);
  assert.match(history, /toLocaleDateString\('zh-CN', \{ year: 'numeric', month: 'long' \}\)/);
});

test('AI history archive swipe follows the finger and snaps with animation', () => {
  const history = read('src/screens/AiHistoryScreen.tsx');

  assert.match(history, /Animated/);
  assert.match(history, /swipeAnimatedValuesRef/);
  assert.match(history, /Animated\.spring/);
  assert.match(history, /useNativeDriver: true/);
  assert.match(history, /onPanResponderMove/);
  assert.match(history, /translateX: swipeTranslateX/);
});

test('AI drawer recent rows show last chat time to the minute', () => {
  const drawer = read('src/components/ai/AiComprehensiveRecordDrawer.tsx');

  assert.match(drawer, /formatAiHistoryMinute/);
  assert.match(drawer, /thread\.lastMessageAt \?\? thread\.updatedAt/);
  assert.match(drawer, /const lastChatTime = formatAiHistoryMinute\(thread\.lastMessageAt \?\? thread\.updatedAt\)/);
  assert.match(drawer, /<Text numberOfLines=\{1\} style=\{styles\.recentTime\}>\{lastChatTime\}<\/Text>/);
  assert.match(drawer, /recentMetaRow/);
  assert.match(drawer, /alignSelf:\s*'center'/);
  assert.match(drawer, /opacity:\s*0\.58/);
  assert.doesNotMatch(drawer, /上次聊天/);
  assert.doesNotMatch(drawer, /formatRecentTime\(thread\.updatedAt\)/);
});

test('AI history and drawer use shared AI history time formatter', () => {
  const history = read('src/screens/AiHistoryScreen.tsx');
  const drawer = read('src/components/ai/AiComprehensiveRecordDrawer.tsx');

  assert.match(history, /formatAiHistoryMinute/);
  assert.match(drawer, /formatAiHistoryMinute/);
});

test('AI materials support batch removal and chat history supports rename', () => {
  const materialList = fs.readFileSync(path.join(root, 'src/screens/AiMaterialListScreen.tsx'), 'utf8');
  const knowledgeBase = fs.readFileSync(path.join(root, 'src/screens/AiKnowledgeBaseScreen.tsx'), 'utf8');
  const history = fs.readFileSync(path.join(root, 'src/screens/AiHistoryScreen.tsx'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/ai/aiChatService.ts'), 'utf8');
  const documentService = fs.readFileSync(path.join(root, 'src/ai/aiDocumentService.ts'), 'utf8');
  const knowledgeRepository = fs.readFileSync(path.join(root, 'src/database/repositories/aiKnowledgeRepository.ts'), 'utf8');

  assert.match(materialList, /selectedIds/);
  assert.match(materialList, /removeMaterials/);
  assert.match(materialList, /批量删除/);
  assert.match(materialList, /应用内资料文件/);
  assert.match(materialList, /selectionFooter/);
  assert.match(materialList, /selectedRow/);
  assert.doesNotMatch(materialList, /selectionBar/);
  assert.match(materialList, /onLongPress/);
  assert.match(knowledgeBase, /selectedIds/);
  assert.match(knowledgeBase, /onLongPress=\{\(\) => toggleSelected\(item\.id\)\}/);
  assert.match(knowledgeBase, /deleteKnowledgeBases/);
  assert.match(knowledgeBase, /批量删除/);
  assert.match(knowledgeBase, /footer={selectionFooter}/);
  assert.match(documentService, /deleteKnowledgeBases/);
  assert.match(knowledgeRepository, /deleteKnowledgeBase/);
  assert.match(knowledgeRepository, /ownerType:\s*'knowledge_base'/);
  assert.match(knowledgeRepository, /SET boundKnowledgeBaseId = NULL/);
  assert.match(history, /renameAiThread/);
  assert.match(history, /重命名/);
  assert.match(service, /renameAiThread/);
  assert.match(service, /titleStatus:\s*'custom'/);
});

test('AI chat keeps the header focused and moves search to session settings', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const app = read('App.tsx');
  const sessionConfig = read('src/screens/AiSessionConfigScreen.tsx');
  const drawer = read('src/components/ai/AiComprehensiveRecordDrawer.tsx');
  assert.match(chat, /onOpenHistory/);
  assert.match(chat, /AiComprehensiveRecordDrawer/);
  assert.match(chat, /contentStyle=\{\[[\s\S]{0,120}styles\.drawerHost,[\s\S]{0,220}paddingBottom:\s*initialBottomInsetRef\.current/);
  assert.match(chat, /KeyboardAvoidingView/);
  assert.match(chat, /style=\{styles\.keyboardAvoidingHost\}/);
  assert.match(chat, /paddingTop:\s*statusBarHeight \+ layout\.pageTopOffset - spacing\[2\]/);
  assert.match(chat, /<\/KeyboardAvoidingView>\s*<AiComprehensiveRecordDrawer/);
  assert.match(chat, /accessibilityLabel="打开综合记录"/);
  assert.match(chat, /menu-outline/);
  assert.match(chat, /accessibilityLabel="会话设置"/);
  assert.match(chat, /name="ellipsis-horizontal"/);
  assert.doesNotMatch(chat, /accessibilityLabel="搜索当前聊天"/);
  assert.doesNotMatch(chat, /accessibilityLabel="开启新会话"/);
  assert.match(sessionConfig, /title="查找聊天记录"/);
  assert.match(app, /onOpenChatSearch=\{[\s\S]*branchScopes:\s*\[\]/);
  assert.match(chat, /swipeDrawerPanResponder/);
  assert.match(chat, /DRAWER_SWIPE_ACTIVATION_DISTANCE = 6/);
  assert.match(chat, /DRAWER_SWIPE_RELEASE_DISTANCE = 10/);
  assert.match(chat, /DRAWER_SWIPE_HORIZONTAL_RATIO = 1\.2/);
  assert.doesNotMatch(chat, /startX < DRAWER_EDGE_SWIPE_WIDTH/);
  assert.match(chat, /Math\.abs\(gs\.dx\) > Math\.abs\(gs\.dy\) \* DRAWER_SWIPE_HORIZONTAL_RATIO/);
  assert.match(chat, /listAiHistoryThreads\(\{ limit: 15, space \}\)/);
  assert.match(chat, /onNewChat=\{\(\) => \{[\s\S]*handleNewChatPress\(\)/);
  assert.doesNotMatch(chat, /onStartNormalChat/);
  assert.doesNotMatch(chat, /accessibilityLabel="返回"[\s\S]{0,160}chevron-back/);
  assert.match(app, /onOpenHistory=\{\(\) => pushRoute\(\{ name: 'ai-history'/);
  assert.match(drawer, /export function AiComprehensiveRecordDrawer/);
  assert.match(drawer, /Animated\.View/);
  assert.match(drawer, /PanResponder\.create/);
  assert.match(drawer, /SWIPE_CLOSE_THRESHOLD/);
  assert.match(drawer, /drawerAnimationRef/);
  assert.match(drawer, /Animated\.add\(slideAnim, drawerTranslateX\)/);
  assert.match(drawer, /新聊天/);
  assert.match(drawer, /历史记录/);
  assert.match(drawer, /最近/);
  assert.match(drawer, /style=\{styles\.recentScroller\}/);
  assert.match(drawer, /height:\s*'100%'/);
  assert.match(drawer, /recentScroller:\s*\{[\s\S]*flex:\s*1/);
  assert.match(drawer, /maxHeight:\s*'100%'/);
  assert.match(drawer, /const visibleRecents = recentThreads\.slice\(0,\s*15\)/);
  assert.match(drawer, /thread\.id === activeThreadId/);
  assert.match(drawer, /当前聊天/);
  assert.doesNotMatch(drawer, /filter\(\(thread\) => thread\.id !== activeThreadId\)/);
});

test('AI chat composer only floats in for new chat or another opened thread', () => {
  const chat = read('src/screens/AiChatScreen.tsx');
  const app = read('App.tsx');

  assert.match(chat, /composerEntranceKey\?: string/);
  assert.match(chat, /composerEntranceReason\?: ComposerEntranceReason/);
  assert.match(chat, /COMPOSER_ENTRANCE_DURATION_MS = 420/);
  assert.match(chat, /Animated\.Value\(shouldPrimeComposerEntrance \? 0 : 1\)/);
  assert.match(chat, /playedComposerEntranceKeysRef/);
  assert.match(chat, /composerEntranceRunRef/);
  assert.match(chat, /shouldStartComposerEntrance/);
  assert.match(chat, /isCurrentComposerEntranceRun/);
  assert.match(chat, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(chat, /Animated\.timing\(composerEntranceProgress/);
  assert.match(chat, /Easing\.out\(Easing\.cubic\)/);
  assert.match(chat, /useNativeDriver: true/);
  assert.match(chat, /const composerRevealMaskOpacity = composerEntranceProgress\.interpolate\(\{[\s\S]{0,120}outputRange: \[1, 0\]/);
  assert.match(chat, /styles\.composerRevealMask, \{ opacity: composerRevealMaskOpacity \}/);
  assert.doesNotMatch(chat, /const composerEntranceStyle = \{\s*opacity: composerEntranceProgress/);
  assert.match(chat, /outputRange: \[spacing\[5\], 0\]/);
  assert.match(chat, /composerPanel:\s*\{[\s\S]{0,120}backgroundColor:\s*aiLightColors\.canvas/);
  assert.match(chat, /translateY: composerEntranceTranslateY/);
  assert.match(chat, /<Animated\.View[\s\S]{0,120}style=\{\[styles\.composerPanel, composerEntranceStyle\]\}/);
  assert.match(app, /composerEntranceKey=\{currentRoute\.routeKey\}/);
  assert.match(app, /composerEntranceReason=\{currentRoute\.composerEntranceReason \?\? 'replace_current'\}/);
  assert.match(app, /prepareAiChatRouteForPush/);
  assert.match(app, /prepareAiChatRouteForReplace/);
  assert.doesNotMatch(chat, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.doesNotMatch(chat, /composerEntranceProgress[\s\S]{0,220}generating/);
  assert.doesNotMatch(chat, /composerEntranceProgress[\s\S]{0,220}handleComposerHeightChange/);
  assert.doesNotMatch(chat, /composerEntranceProgress[\s\S]{0,220}onContentSizeChange/);
});

test('AI chat route updates merge into the latest route so first message keeps the created thread', () => {
  const app = read('App.tsx');

  assert.match(app, /function updateCurrentAiChatRoute/);
  assert.match(app, /currentRoute\?\.name !== 'ai-chat'/);
  assert.match(app, /\.\.\.currentRoute,[\s\S]{0,120}\.\.\.patch/);
  assert.match(app, /expectedRouteKey && currentRoute\.routeKey !== expectedRouteKey/);
  assert.match(app, /onThreadReady=\{\(threadId\) => updateCurrentAiChatRoute\(\{ threadId \}, currentRoute\.routeKey\)\}/);
  assert.match(app, /onThreadTitleChange=\{\(title\) => updateCurrentAiChatRoute\(\{ contextTitle: title \}, currentRoute\.routeKey\)\}/);
  assert.match(app, /modelRefreshKey=\{currentRoute\.modelRefreshKey\}/);
  assert.match(app, /function popRouteStack/);
  assert.match(app, /modelRefreshKey:\s*\(previousRoute\.modelRefreshKey \?\? 0\) \+ 1/);
  assert.doesNotMatch(app, /onThreadReady=\{\(threadId\) => replaceCurrentRoute\(\{ \.\.\.currentRoute, threadId \}\)\}/);
  assert.doesNotMatch(app, /onThreadTitleChange=\{\(title\) => replaceCurrentRoute\(\{ \.\.\.currentRoute, contextTitle: title \}\)\}/);
});

test.skip('AI workbench shows compact recent chats directly on the workbench', () => {
  const home = read('src/screens/AiHomeScreen.tsx');

  assert.doesNotMatch(home, /最近继续/);
  assert.match(home, /最近聊天/);
  assert.match(home, /listAiHomeThreads/);
  assert.match(home, /RECENT_CHAT_VISIBLE_ROWS = 4/);
  assert.match(home, /formatAiHomeFullMinute/);
  assert.doesNotMatch(home, /formatAiHistoryMinute/);
  assert.match(home, /角色库/);
});
