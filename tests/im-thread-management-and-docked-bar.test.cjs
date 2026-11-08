const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('IM thread long-press action, folding aggregation, and docked bar v11 contracts', async (t) => {
  const dbContent = read('src/database/db.ts');
  const repoContent = read('src/im/repository/imThreadRepository.ts');
  const contextMenuContent = read('src/im/components/modals/ImThreadContextMenu.tsx');
  const foldedModalContent = read('src/im/components/modals/ImFoldedThreadsModal.tsx');
  const threadListContent = read('src/im/components/ImThreadList.tsx');
  const imHomeContent = read('src/im/screens/ImHomeScreen.tsx');
  const transitionContent = read('src/components/transitions/RadialOrbitHeroTransition.tsx');
  const secondFloorContent = read('src/im/components/ImRoleSecondFloor.tsx');

  await t.test('Database and repository support folding, hiding and pinning', () => {
    assert.match(dbContent, /im_is_folded/);
    assert.match(dbContent, /im_hidden_from_list/);
    assert.match(repoContent, /setImThreadPinned/);
    assert.match(repoContent, /setImThreadFolded/);
    assert.match(repoContent, /setImThreadHidden/);
    assert.match(repoContent, /clearImThreadHistory/);
  });

  await t.test('ImThreadList and modals support long-press context menu and folded group', () => {
    assert.match(threadListContent, /onLongPressThread/);
    assert.match(threadListContent, /onOpenFoldedThreads/);
    assert.match(threadListContent, /折叠的会话/);
    assert.match(contextMenuContent, /彻底删除聊天信息/);
    assert.match(contextMenuContent, /折叠该会话/);
    assert.match(foldedModalContent, /折叠的会话/);
  });

  await t.test('Docked bar in ImHomeScreen adheres to rigid bright-slate aesthetic and zero dead shield', () => {
    // 彻底消灭 240px 底部护盾
    assert.doesNotMatch(imHomeContent, /bottomShield/);
    // 高对比亮暮灰与 1px 微光分界线
    assert.match(imHomeContent, /#4A4668/);
    assert.match(imHomeContent, /rgba\(255,\s*255,\s*255,\s*0\.22\)/);
    // 根容器动态 onLayout 真实高度测量
    assert.match(imHomeContent, /setMeasuredHeight/);
  });

  await t.test('RadialOrbitHeroTransition clicks card to detail directly without gallery stay', () => {
    // 角色卡自然生长放大进入详情
    assert.match(transitionContent, /progress2\.value\s*=\s*withTiming\(1/);
    // 退出单调贝塞尔曲线无过冲
    assert.match(transitionContent, /Easing\.bezier\(0\.25,\s*0\.1,\s*0\.25,\s*1\)/);
  });

  await t.test('Waterfall bottom padding ensures cards are not covered by docked bar', () => {
    assert.match(secondFloorContent, /paddingBottom:\s*insets\.bottom\s*\+\s*116/);
  });
});
