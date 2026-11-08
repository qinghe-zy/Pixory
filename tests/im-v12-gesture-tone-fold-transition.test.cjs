const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('[TEST] Starting IM v12 gesture, tone, fold and transition test...');

// 1. 测试 buildImThreadFeed 业务逻辑
const buildFeedFile = path.resolve(__dirname, '../src/im/utils/buildImThreadFeed.ts');
assert(fs.existsSync(buildFeedFile), 'buildImThreadFeed.ts must exist');
const buildFeedContent = fs.readFileSync(buildFeedFile, 'utf8');

// 编译检查与静态断言
assert(buildFeedContent.includes('__folded_group__'), 'must use __folded_group__ key');
assert(buildFeedContent.includes('foldedList'), 'must export foldedList');
assert(buildFeedContent.includes('displayItems'), 'must export displayItems');

// 2. 静态断言：ImThreadContextMenu 与 ImFoldedThreadsModal 模态层级一致性
const contextMenuFile = path.resolve(__dirname, '../src/im/components/modals/ImThreadContextMenu.tsx');
assert(fs.existsSync(contextMenuFile), 'ImThreadContextMenu.tsx must exist');
const contextMenuCode = fs.readFileSync(contextMenuFile, 'utf8');
assert(contextMenuCode.includes('AnchoredContextMenu'), 'ImThreadContextMenu must use AnchoredContextMenu');
assert(contextMenuCode.includes('AppDialog'), 'ImThreadContextMenu must use AppDialog for confirmation');
assert(contextMenuCode.includes('danger'), 'ImThreadContextMenu AppDialog must have danger styling');
assert(contextMenuCode.includes('移出折叠会话'), 'ImThreadContextMenu must have 移出折叠会话 option');
assert(contextMenuCode.includes('persistedThread'), 'ImThreadContextMenu must persist thread during AppDialog display');

const foldedModalFile = path.resolve(__dirname, '../src/im/components/modals/ImFoldedThreadsModal.tsx');
assert(fs.existsSync(foldedModalFile), 'ImFoldedThreadsModal.tsx must exist');
const foldedModalCode = fs.readFileSync(foldedModalFile, 'utf8');
assert(foldedModalCode.includes('ImThreadContextMenu'), 'ImFoldedThreadsModal must embed ImThreadContextMenu inside Modal for z-order safety');
assert(foldedModalCode.includes('formatWeChatTime'), 'ImFoldedThreadsModal must use formatWeChatTime for consistent timestamp formatting');

// 3. 静态断言：ImHomeScreen 修复黑白边与手势竞态
const homeScreenFile = path.resolve(__dirname, '../src/im/screens/ImHomeScreen.tsx');
const homeCode = fs.readFileSync(homeScreenFile, 'utf8');

// 黑白边断言：contentDepthAnimatedStyle 不得包含 scale 缩放变形
assert(!homeCode.includes('scaleFromPeek * scaleFromFloor'), 'contentDepthAnimatedStyle must not have scale distortion');
assert(homeCode.includes("backgroundColor: 'transparent'"), 'mainPage style must have transparent background');

// 顶栏亮暮灰过渡断言：必须引入 headerTone 且不可突兀变色
assert(homeCode.includes('headerTone = useSharedValue(0)'), 'must use headerTone shared value');
assert(homeCode.includes('Easing.linear'), 'snapToSecondFloor must transition headerTone with uniform linear speed');
assert(homeCode.includes('Easing.out(Easing.quad)'), 'collapse must quickly transition headerTone back to 0');

// 手势竞态断言：升级为 RNGH 2.0「单向阀门 + 滚动边界探针」原生手势仲裁机制，彻底打通列表下拉进入二楼
assert(homeCode.includes('Gesture.Pan()'), 'must use RNGH Gesture.Pan()');
assert(homeCode.includes('homePanGesture'), 'must define homePanGesture');
assert(homeCode.includes('drawerPanGesture'), 'must define drawerPanGesture');
assert(homeCode.includes('activeOffsetY(8)'), 'must activate pull down on dy > 8');
assert(homeCode.includes('failOffsetY(-4)'), 'must immediately fail and hand over to FlatList on upward scroll');
assert(homeCode.includes('bottomSkirtAnimatedStyle'), 'must mount bottomSkirtAnimatedStyle to eliminate bottom card peeking');
assert(homeCode.includes('listScrollYRef = useRef(0)'), 'must use listScrollYRef for boundary probe');
assert(homeCode.includes('scrollEnabled={!isPullingDrawer && drawerStage === 0}'), 'ImThreadList must disable scroll during drawer drag or non-zero stage');

const threadListFile = path.resolve(__dirname, '../src/im/components/ImThreadList.tsx');
const threadListCode = fs.readFileSync(threadListFile, 'utf8');
assert(threadListCode.includes("from 'react-native-gesture-handler'"), 'ImThreadList FlatList must be imported from react-native-gesture-handler');
assert(threadListCode.includes('nestedScrollEnabled={true}'), 'ImThreadList must enable nestedScrollEnabled');

// 4. 静态断言：RadialOrbitHeroTransition 卡片长出与消除黑闪、镂空及边框
const transitionFile = path.resolve(__dirname, '../src/components/transitions/RadialOrbitHeroTransition.tsx');
const transitionCode = fs.readFileSync(transitionFile, 'utf8');
assert(transitionCode.includes('centerAnchor.rect'), 'fullscreenContainerStyle must use centerAnchor.rect as start geometry');
assert(!transitionCode.includes('renderToHardwareTextureAndroid'), 'fullscreenContainerStyle must not use renderToHardwareTextureAndroid');
assert(transitionCode.includes('progress1.value > 0.1 || progress2.value > 0.05'), 'waterfall reaction must trigger when progress1 > 0.1 or progress2 > 0.05 to avoid card peeking');
assert(transitionCode.includes('hideOnDetail = isDetailActive ? (1 - p2.value) : 1'), 'all deck cards must fade on detail active');
assert(transitionCode.includes('fullHeight = screenHeight + insets.top + insets.bottom'), 'detail container must cover full height with insets padding');

// 5. 静态断言：ImRoleSecondFloor 锚点采集与直进聊天
const secondFloorFile = path.resolve(__dirname, '../src/im/components/ImRoleSecondFloor.tsx');
const secondFloorCode = fs.readFileSync(secondFloorFile, 'utf8');
assert(secondFloorCode.includes('rect: {'), 'ImRoleSecondFloor must populate rect in GridAnchor');
assert(secondFloorCode.includes('handleStartChatFromTransition'), 'must handle start chat from transition');
assert(secondFloorCode.includes('setTimeout('), 'must delay closing transition to avoid flash home screen');

console.log('✅ All IM v12 gesture, tone, fold, and transition checks passed successfully!');
