const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('IM entry scheme 1 and role card linkage policy verification', async (t) => {
  const homePath = path.resolve(__dirname, '../src/screens/AiHomeScreen.tsx');
  const imHomePath = path.resolve(__dirname, '../src/im/screens/ImHomeScreen.tsx');
  const bottomTabPath = path.resolve(__dirname, '../src/components/BottomTabBar.tsx');
  const roleDetailPath = path.resolve(__dirname, '../src/screens/AiRoleCardDetailScreen.tsx');
  const roleLibraryPath = path.resolve(__dirname, '../src/screens/AiRoleLibraryScreen.tsx');
  const appPath = path.resolve(__dirname, '../App.tsx');
  const threadListPath = path.resolve(__dirname, '../src/im/components/ImThreadList.tsx');

  const homeContent = fs.readFileSync(homePath, 'utf8');
  const imHomeContent = fs.readFileSync(imHomePath, 'utf8');
  const bottomTabContent = fs.readFileSync(bottomTabPath, 'utf8');
  const roleDetailContent = fs.readFileSync(roleDetailPath, 'utf8');
  const roleLibraryContent = fs.readFileSync(roleLibraryPath, 'utf8');
  const appContent = fs.readFileSync(appPath, 'utf8');
  const threadListContent = fs.readFileSync(threadListPath, 'utf8');

  await t.test('BottomTabBar and ImHomeScreen provide dedicated companion chat tab and clean header', () => {
    assert.match(bottomTabContent, /'im',\s*label:\s*'伴聊'/);
    assert.match(bottomTabContent, /'ai',\s*label:\s*'长聊'/);
    assert.match(imHomeContent, /export function ImHomeScreen/);
    assert.match(imHomeContent, /ImThreadList/);
    assert.match(imHomeContent, /添加/);
    assert.match(imHomeContent, /导入/);
    assert.match(imHomeContent, /角色库/);
    assert.match(imHomeContent, /伴聊/);
    assert.match(appContent, /ImHomeScreen/);
    assert.match(appContent, /ROOT_TABS[\s\S]*'im'/);
  });

  await t.test('ImThreadList renders WeChat style conversation list and monochrome minimal empty state', () => {
    assert.match(threadListContent, /export function ImThreadList/);
    assert.match(threadListContent, /listImThreads/);
    assert.match(threadListContent, /avatarImage/);
    assert.match(threadListContent, /livingIndicator/);
    assert.match(threadListContent, /formatWeChatTime/);
    assert.match(threadListContent, /挑选伴侣/);
    assert.match(threadListContent, /color="#A1A1AA"/);
  });

  await t.test('AiRoleCardDetailScreen upgrades primary button to send companion message', () => {
    assert.match(roleDetailContent, /onStartImChat/);
    assert.match(roleDetailContent, /发消息 \(伴侣IM\)/);
    assert.match(roleDetailContent, /长文本剧情/);
  });

  await t.test('AiRoleLibraryScreen supports IM chat choice dialog and App.tsx passes avatarUri', () => {
    assert.match(roleLibraryContent, /onStartImChat/);
    assert.match(roleLibraryContent, /伴侣即时短聊 \(IM\)/);
    assert.match(appContent, /name:\s*'im-chat'/);
    assert.match(appContent, /ImChatScreen/);
    assert.match(appContent, /roleAvatarUri/);
  });
});
