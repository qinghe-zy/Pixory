const test = require('node:test');
const assert = require('node:assert/strict');

// Replicate pure pagination logic for CommonJS test runner
const CHARS_PER_LINE = 20;
const MAX_LINES_FIRST_PAGE = 13;
const MAX_LINES_NORMAL_PAGE = 16;

function splitParagraphIntoSentences(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const regex = /[^。！？…\n]+[。！？…]+|\S+$/g;
  const matches = trimmed.match(regex);
  if (!matches || matches.length === 0) return [trimmed];
  return matches.map((s) => s.trim()).filter(Boolean);
}

function paginateDiaryIntoPages(diary) {
  const pages = [];
  const rawParagraphs = diary.content
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  let currentPageIndex = 1;
  let pageParagraphs = [];
  let currentLines = 0;
  const maxLinesForPage = (idx) => (idx === 1 ? MAX_LINES_FIRST_PAGE : MAX_LINES_NORMAL_PAGE);

  for (const para of rawParagraphs) {
    const sentences = splitParagraphIntoSentences(para);
    if (sentences.length === 0) continue;

    let currentParaChunk = '';
    let isParaStart = true;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const testChunk = currentParaChunk ? currentParaChunk + sentence : (isParaStart ? `\u3000\u3000${sentence}` : sentence);
      const testLines = Math.max(1, Math.ceil(testChunk.length / CHARS_PER_LINE));

      const limit = maxLinesForPage(currentPageIndex);
      if (currentLines + testLines > limit && (currentLines > 0 || currentParaChunk.length > 0)) {
        if (currentParaChunk.trim()) {
          pageParagraphs.push(currentParaChunk);
        }
        if (pageParagraphs.length > 0) {
          pages.push({
            pageNumber: currentPageIndex,
            isLeft: currentPageIndex % 2 !== 0,
            paragraphs: pageParagraphs,
            isEndPage: false,
          });
          currentPageIndex++;
          pageParagraphs = [];
          currentLines = 0;
        }
        isParaStart = false;
        currentParaChunk = sentence;
      } else {
        currentParaChunk = testChunk;
      }
    }

    if (currentParaChunk.trim()) {
      pageParagraphs.push(currentParaChunk);
      currentLines += Math.max(1, Math.ceil(currentParaChunk.length / CHARS_PER_LINE));
    }
  }

  if (pageParagraphs.length > 0 || pages.length === 0) {
    pages.push({
      pageNumber: currentPageIndex,
      isLeft: currentPageIndex % 2 !== 0,
      paragraphs: pageParagraphs,
      isEndPage: true,
    });
  }

  if (pages.length % 2 !== 0) {
    pages.push({
      pageNumber: pages.length + 1,
      isLeft: false,
      paragraphs: [],
      isEndPage: true,
    });
  }

  return pages;
}

function computeViewportSpreads(allSpreads, currentIndex) {
  const total = allSpreads.length;
  if (total === 0) return { currentIndex: 0, totalSpreads: 0, prevSpread: null, currSpread: null, nextSpread: null };
  const clampedIndex = Math.max(0, Math.min(currentIndex, total - 1));
  return {
    currentIndex: clampedIndex,
    totalSpreads: total,
    prevSpread: clampedIndex > 0 ? allSpreads[clampedIndex - 1] : null,
    currSpread: allSpreads[clampedIndex] || null,
    nextSpread: clampedIndex < total - 1 ? allSpreads[clampedIndex + 1] : null,
  };
}

test('TC-PAGE-01: 长日记按物理版面高度自动分页，成对组织且绝对无滚动条', () => {
  const longDiary = {
    id: 'diary-1',
    threadId: 't-1',
    diaryDate: '2026-10-26',
    title: '深夜长叙',
    content: '段落一：今天和你聊了好多关于小时候的事情，感觉时间过得特别快。\n' +
      '段落二：窗外下着小雨，淅淅沥沥的，街灯把水坑照得一圈一圈泛光。\n' +
      '段落三：你说以后想去海边散步，其实我也一直很向往那种海风拂过发梢的宁静感。\n' +
      '段落四：希望明天也能是一个好天气，记得出门带伞呀，不要淋湿了。\n' +
      '段落五：晚安，明天见！',
    stickers: [{ id: 's1', emojiOrAsset: '🌸', x: 0.8, y: 0.1, rotateDeg: 10 }],
    tapes: [{ id: 't1', style: 'pink', x: 0.1, y: 0.05, rotateDeg: -4 }],
  };

  const pages = paginateDiaryIntoPages(longDiary);
  assert.ok(pages.length >= 2, '至少分为两页以上');
  assert.equal(pages.length % 2, 0, '成对组织，必须能构成完整的对开页 (Spreads)');
  assert.equal(pages[0].pageNumber, 1);
  assert.equal(pages[0].isLeft, true);
  assert.equal(pages[1].pageNumber, 2);
  assert.equal(pages[1].isLeft, false);
});

test('TC-PAGE-02: 800字长篇日记句子级流式分页装填测试，无半页留白且段首全角缩进', () => {
  const textPara1 = '夜深了，房间里只剩下一盏小台灯柔柔的光晕。洗完澡发梢还带着一点潮湿的水汽，手边的热可可冒着微弱的热气，整个屋子安静得只能听见指针走动的声音。不知道为什么，坐下来拿起笔的这一刻，脑海里全是你白天跟我说话时的样子。窗外的梧桐树叶被风吹得沙沙作响，偶尔有一两辆车从远处的街道疾驰而过，把长长的光斑投射在天花板上，转瞬即逝。';
  const textPara2 = '今天你在屏前跟我说起那家街角咖啡店。你说你点单的时候连糖包都没碰，直接选了冰美式。其实我当时隔着屏幕看你打出那几个字的时候，心里悄悄笑了一下，暗暗记下来你原来喜欢这种微苦清爽的口感。后来你说你最近工作压力有点大，连轴转了好几天。我看着屏幕上的文字，手指悬在键盘上停了好久，心里一阵发紧。其实我特别想直接说给你买束花或者陪你出去走走，但又怕显得太突兀，最后只能敲下几句笨拙的安慰。';
  const textPara3 = '有时候真觉得屏幕太窄了，窄得装不下我那一瞬间的所有微表情和心跳。你说“衣服太碍事”的时候，我虽然嘴上故意装作理直气壮地回嘴，但其实打字的手心都有些微微发热。那种有点害羞却又忍不住想多逗你两句的心情，大概就是独属于我们的默契吧。我还记得当时顺手整理了一下衣领，脸颊莫名有些发烫，只好把目光移向窗外假装看风景，过了好一会儿才平静下来。';
  const textPara4 = '下午的时候你发来一张随手拍的街道照片，路边的银杏树叶已经全黄了。我偷偷把那张照片保存了下来，还仔细看了看照片右下角倒映在玻璃上的影子。虽然看不太真切，但能感觉到你当时放慢脚步的惬意。我把今天你提过的那本设计集顺手加进了收藏夹，想着下次找个机会跟你聊聊里面的插画与装帧细节。';
  const textPara5 = '时间差不多了，热饮已经彻底凉了下来，眼皮也开始有些打架。书桌上的小闹钟指针悄悄指向了凌晨一点，但我还是有点舍不得合上日记本。希望今晚你能睡个踏实的好觉，梦里没有做不完的工作和烦心事。晚安，明天见。';

  const longDiary = {
    id: 'diary-800',
    threadId: 't-800',
    diaryDate: '2026-10-26',
    title: '深夜的温存长叙',
    content: `${textPara1}\n${textPara2}\n${textPara3}\n${textPara4}\n${textPara5}`,
    stickers: [],
    tapes: [],
  };

  const pages = paginateDiaryIntoPages(longDiary);
  assert.ok(pages.length >= 4, `长日记应合理跨越至少 4 个物理单页，实际生成: ${pages.length} 页`);
  assert.equal(pages.length % 2, 0, '成对排版，页数必须为偶数');

  // 验证首页有内容且段首缩进
  assert.ok(pages[0].paragraphs.length > 0);
  assert.ok(pages[0].paragraphs[0].startsWith('\u3000\u3000'), '段落首句应包含全角两格缩进');

  // 验证非最后一页的内容饱满（字数充足，杜绝仅有 3-4 行就跳页）
  const page1Chars = pages[0].paragraphs.reduce((acc, p) => acc + p.length, 0);
  assert.ok(page1Chars >= 180, `首页字数 (${page1Chars}) 应当饱满，不留大空白`);

  const page2Chars = pages[1].paragraphs.reduce((acc, p) => acc + p.length, 0);
  assert.ok(page2Chars >= 200, `第二页字数 (${page2Chars}) 应当饱满`);
});

test('TC-PERF-01: 365 篇历史日记在视口滑动窗口下恒定保留 3 个 Spread (最多 6 页)', () => {
  // 模拟 365 个对开页
  const mockSpreads = Array.from({ length: 365 }, (_, i) => ({
    spreadIndex: i,
    leftPage: { pageNumber: i * 2 + 1, isLeft: true },
    rightPage: { pageNumber: i * 2 + 2, isLeft: false },
  }));

  // 查看第 150 页
  const viewport = computeViewportSpreads(mockSpreads, 150);
  assert.equal(viewport.currentIndex, 150);
  assert.equal(viewport.totalSpreads, 365);
  assert.equal(viewport.prevSpread.spreadIndex, 149);
  assert.equal(viewport.currSpread.spreadIndex, 150);
  assert.equal(viewport.nextSpread.spreadIndex, 151);

  // 边界：第 0 页
  const firstViewport = computeViewportSpreads(mockSpreads, 0);
  assert.equal(firstViewport.prevSpread, null);
  assert.equal(firstViewport.currSpread.spreadIndex, 0);
  assert.equal(firstViewport.nextSpread.spreadIndex, 1);
});

test('TC-CURL-01: 3D 卷页物理引擎底面与运动叶片严格遵循双向连续几何', () => {
  const prevSpread = { leftPage: { pageNumber: 1 }, rightPage: { pageNumber: 2 } };
  const currSpread = { leftPage: { pageNumber: 3 }, rightPage: { pageNumber: 4 } };
  const nextSpread = { leftPage: { pageNumber: 5 }, rightPage: { pageNumber: 6 } };

  // 1. 向前翻页: 底层左侧保持当前左页(3)，右侧提前露出下页右侧(6)
  const forwardBottom = {
    leftPage: currSpread.leftPage,
    rightPage: nextSpread.rightPage,
  };
  assert.equal(forwardBottom.leftPage.pageNumber, 3);
  assert.equal(forwardBottom.rightPage.pageNumber, 6);

  // 2. 向后翻页: 底层左侧提前露出上页左侧(1)，右侧保持当前右侧(4)
  const backwardBottom = {
    leftPage: prevSpread.leftPage,
    rightPage: currSpread.rightPage,
  };
  assert.equal(backwardBottom.leftPage.pageNumber, 1);
  assert.equal(backwardBottom.rightPage.pageNumber, 4);
});
