const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

// 加载 Stage 8 模块
const fitterModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/pdf/pdfSurgicalBoxFitter.ts')
);
const watchdogModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/pdf/pdfSandboxWatchdog.ts')
);
const pdfDriverModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/drivers/pdfDriver.ts')
);

const { PdfSurgicalBoxFitter } = fitterModule;
const { PdfSandboxWatchdog, PdfSandboxWatchdogTimeoutError } = watchdogModule;
const { PdfDriver } = pdfDriverModule;

// 辅助：SHA-256 转 Hex
function toHex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

test('S8-01 [盒内弹性拟合算法]: 短文本保持原字号，长文本自适应二分微缩，极长文本字间距压缩', () => {
  // 注入确定性测量函数：ASCII 字符占 0.5 * size，汉字占 1.0 * size
  const mockMeasureWidth = (text, size) => {
    let w = 0;
    for (const ch of text) {
      w += /[\u4e00-\u9fa5]/.test(ch) ? size : size * 0.5;
    }
    return w;
  };

  const fixedBox = { x: 50, y: 700, width: 200, height: 40 };

  // 1. 短文本：完全容纳，保持原字号 14pt
  const shortRes = PdfSurgicalBoxFitter.fitTextInBox({
    text: '短标题',
    box: fixedBox,
    initialFontSizePt: 14,
    measureWidth: mockMeasureWidth,
  });
  assert.strictEqual(shortRes.fits, true);
  assert.strictEqual(shortRes.fontSizePt, 14);
  assert.strictEqual(shortRes.scaleRatio, 1.0);
  assert.strictEqual(shortRes.letterSpacingPt, 0);

  // 2. 长文本：在 200pt 盒宽与 40pt 盒高限制下，二分缩放到安全字号 (确保不溢出)
  const longRes = PdfSurgicalBoxFitter.fitTextInBox({
    text: '这是一个比较长的企业战略审计报告标题文本需要微缩适应',
    box: fixedBox,
    initialFontSizePt: 14,
    minFontSizePt: 8,
    measureWidth: mockMeasureWidth,
  });

  assert.strictEqual(longRes.fits, true);
  assert.ok(longRes.fontSizePt <= 14);
  assert.ok(longRes.fontSizePt >= 8);
  // 断言每一行物理宽度严格 <= 盒宽
  for (const line of longRes.lines) {
    assert.ok(line.widthPt <= fixedBox.width + 0.1, `行宽 ${line.widthPt} 不得超出盒宽 ${fixedBox.width}`);
  }

  // 3. 单行禁止换行且极长文本：启动字间距微缩
  const singleLineRes = PdfSurgicalBoxFitter.fitTextInBox({
    text: '单行极长不可折行特殊印章编号ABCDEFG123456789',
    box: { x: 50, y: 700, width: 150, height: 16 },
    initialFontSizePt: 12,
    minFontSizePt: 8,
    allowWrap: false,
    measureWidth: mockMeasureWidth,
  });
  assert.ok(singleLineRes.lines.length <= 1, '禁止换行时行数必须 <= 1');
});

test('S8-02 [审查发现 #6 外部字体宽度函数注入]: 杜绝硬编码 0.56 估算误差', () => {
  let measureCallCount = 0;
  const customMeasureWidth = (text, size) => {
    measureCallCount++;
    return text.length * size * 0.72; // 特殊高宽度字体
  };

  const res = PdfSurgicalBoxFitter.fitTextInBox({
    text: 'CustomFontText',
    box: { x: 0, y: 0, width: 100, height: 30 },
    initialFontSizePt: 16,
    measureWidth: customMeasureWidth,
  });

  assert.ok(measureCallCount > 0, '必须通过注入的 measureWidth 真实调用计算');
  assert.ok(res.fontSizePt < 16, '对于高宽度字体，必须按注入函数微缩');
});

test('S8-03 [PdfSandboxWatchdog 看门狗机制]: 超时任务自动熔断取消，正常任务无损直通', async () => {
  // 1. 正常任务：迅速完成
  const normalRes = await PdfSandboxWatchdog.executeWithWatchdog(
    async () => {
      return 'pdf_done';
    },
    { taskName: 'quick_job', timeoutMs: 500 }
  );
  assert.strictEqual(normalRes, 'pdf_done');

  // 2. 超时挂起任务：看门狗必须在指定时间内抛出 PdfSandboxWatchdogTimeoutError
  await assert.rejects(
    async () => {
      await PdfSandboxWatchdog.executeWithWatchdog(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 300));
          return 'should_not_reach';
        },
        { taskName: 'hanging_pdf_job', timeoutMs: 50 }
      );
    },
    (err) => {
      return (
        err instanceof PdfSandboxWatchdogTimeoutError &&
        err.taskName === 'hanging_pdf_job' &&
        err.timeoutMs === 50
      );
    }
  );
});

test('S8-04 [审查发现 #7 原件 100% 只读与全新独立派生 PDF]: 原文件 SHA-256 逐字节恒定', async () => {
  const driver = new PdfDriver();

  const originalPdfText = [
    '2026年度业务审计摘要报告',
    '',
    '第一部分：本年经营性现金流保持稳健增长。',
    '',
    '第二部分：供应链本地化布局基本完成。',
  ].join('\n');

  // 计算原文档初始哈希
  const initialDigest = toHex(originalPdfText);

  const skeletons = await driver.inspectSkeleton(originalPdfText);
  assert.ok(skeletons.length >= 3);
  const targetBlock = skeletons[1];

  // 模拟 VFS 虚拟存储驱动
  const vfsStorage = new Map();
  vfsStorage.set('orig_audit.pdf', originalPdfText);

  const mockStorage = {
    readText: async (p) => vfsStorage.get(p) || '',
    writeText: async (p, c) => {
      vfsStorage.set(p, c);
    },
    exists: async (p) => vfsStorage.has(p),
  };

  // 执行修补
  const patchRes = await driver.applyPatchBatch(
    'orig_audit.pdf',
    [
      {
        targetBlockId: targetBlock.blockId,
        search: '第一部分：本年经营性现金流保持稳健增长。',
        replace: '第一部分：本年经修正现金流稳步上扬超预期。',
        trackChanges: true,
      },
    ],
    { storage: mockStorage }
  );

  assert.ok(patchRes.appliedCount === 1);
  assert.ok(patchRes.newVfsUri);
  assert.notStrictEqual(patchRes.newVfsUri, 'orig_audit.pdf', '派生路径绝不得等于原件路径');
  assert.ok(patchRes.newVfsUri.startsWith('derived_orig_audit_'));

  // 核心断言：原文件在经历修补后，其内容与 SHA-256 绝对未发生任何单字节漂移
  const postOriginalText = vfsStorage.get('orig_audit.pdf');
  const postDigest = toHex(postOriginalText);
  assert.strictEqual(
    postDigest,
    initialDigest,
    '铁律违规：原 PDF 文件已被篡改！原件必须 100% 逐字节守恒只读'
  );

  // 派生文件为全新独立内容
  const derivedText = vfsStorage.get(patchRes.newVfsUri);
  assert.ok(derivedText.includes('第一部分：本年经修正现金流稳步上扬超预期。'));
});
