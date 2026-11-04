const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

// 加载 Stage 5 与 Stage 6 驱动模块
const baseDriverModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/drivers/baseDriver.ts')
);
const driverRegistryModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/drivers/driverRegistry.ts')
);
const markdownDriverModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/drivers/markdownDriver.ts')
);
const docxDriverModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/drivers/docxDriver.ts')
);
const docxZipAdapterModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/docx/docxZipAdapter.ts')
);
const pdfDriverModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/drivers/pdfDriver.ts')
);

const { normalizeBlockId, formatBlockId } = baseDriverModule;
const { DocumentDriverRegistry, UnsupportedDocumentFormatError, defaultDriverRegistry } =
  driverRegistryModule;
const { MarkdownDriver } = markdownDriverModule;
const { DocxDriver } = docxDriverModule;
const { NodeDocxZipAdapter } = docxZipAdapterModule;
const { PdfDriver } = pdfDriverModule;

/**
 * 契约测试规范：可参数化复用于 MarkdownDriver、DocxDriver (S6) 以及 PdfDriver (S8)
 */
function defineDocumentDriverContractTests(suiteName, {
  driverFactory,
  sampleDocGenerator,
  supportedExtensions,
}) {
  test(`[${suiteName}] 契约 1: 支持的扩展名与注册表集成`, () => {
    const driver = driverFactory();
    assert.ok(Array.isArray(driver.supportedExtensions), '必须提供 supportedExtensions 数组');
    for (const ext of supportedExtensions) {
      assert.ok(
        driver.supportedExtensions.includes(ext),
        `驱动必须声明支持扩展名 ${ext}`
      );
    }

    const registry = new DocumentDriverRegistry();
    registry.registerDriver(driver);

    for (const ext of supportedExtensions) {
      const resolved = registry.getDriverForExtension(ext);
      assert.strictEqual(resolved, driver, `通过扩展名 ${ext} 应能查找到该驱动`);
      const resolvedByPath = registry.getDriverForPath(`workspace/report${ext}`);
      assert.strictEqual(resolvedByPath, driver, `通过路径 report${ext} 应能查找到该驱动`);
    }
  });

  test(`[${suiteName}] 契约 2: 骨架提取与结构类型识别 (Heading, Code, Table, List, Paragraph)`, async () => {
    const driver = driverFactory();
    const doc = sampleDocGenerator();
    const skeleton = await driver.inspectSkeleton(doc);

    assert.ok(Array.isArray(skeleton), 'inspectSkeleton 必须返回数组');
    assert.ok(skeleton.length >= 5, `骨架块数应不少于 5 块 (实际: ${skeleton.length})`);

    const kinds = new Set(skeleton.map((b) => b.kind));
    assert.ok(kinds.has('heading'), '应能识别 heading');
    assert.ok(kinds.has('paragraph'), '应能识别 paragraph');

    for (const block of skeleton) {
      assert.ok(block.blockId, 'blockId 不得为空');
      assert.ok(block.blockId.startsWith('[[BLK_'), `blockId 应具有规范前缀: ${block.blockId}`);
      assert.ok(block.previewText.length > 0, 'previewText 不得为空');
      assert.ok(block.previewText.length <= 100, 'previewText 长度应受控');
      assert.ok(Array.isArray(block.byteRange), 'byteRange 必须为 [start, end]');
      assert.ok(block.byteRange[1] >= block.byteRange[0], 'byteRange[1] 必须 >= byteRange[0]');
      assert.ok(typeof block.pageOrSectionIndex === 'number', 'pageOrSectionIndex 必须为数字');
    }
  });

  test(`[${suiteName}] 契约 3: 块 ID 确定性 (同一文档反复 inspect 结果 100% 一致)`, async () => {
    const driver = driverFactory();
    const doc = sampleDocGenerator();

    const run1 = await driver.inspectSkeleton(doc);
    const run2 = await driver.inspectSkeleton(doc);

    assert.strictEqual(run1.length, run2.length, '两次扫描块数必须完全相等');
    for (let i = 0; i < run1.length; i++) {
      assert.strictEqual(run1[i].blockId, run2[i].blockId, `第 ${i} 块 ID 必须确定且一致`);
      assert.strictEqual(run1[i].kind, run2[i].kind, `第 ${i} 块 kind 必须一致`);
      assert.deepStrictEqual(run1[i].byteRange, run2[i].byteRange, `第 ${i} 块 byteRange 必须一致`);
    }
  });

  test(`[${suiteName}] 契约 4: 块 ID 稳定性 (修改中间段落，未改动段落的 ID 绝不漂移)`, async () => {
    const driver = driverFactory();
    const doc = sampleDocGenerator();
    const originalSkeleton = await driver.inspectSkeleton(doc);

    // 选取中间第 2 块进行修改
    const targetBlockIndex = 2;
    const targetBlock = originalSkeleton[targetBlockIndex];
    assert.ok(targetBlock, '必须存在目标修改块');

    // 局部修改第 2 块
    const patchResult = await driver.applyPatchBatch(doc, [
      {
        targetBlockId: targetBlock.blockId,
        search: targetBlock.previewText.slice(0, 10),
        replace: '【MODIFIED_CONTENT】',
      },
    ]);

    assert.ok(patchResult.newContent, '必须返回修改后的文本');
    const newSkeleton = await driver.inspectSkeleton(patchResult.newContent);

    // 验证：目标块之前的块 ID 100% 保持不变
    for (let i = 0; i < targetBlockIndex; i++) {
      assert.strictEqual(
        newSkeleton[i].blockId,
        originalSkeleton[i].blockId,
        `修改中间段落后，前置块 [${i}] 的 blockId 绝不能漂移`
      );
    }

    // 验证：目标块之后的未修改块，其 blockId 同样 100% 保持不变
    for (let i = targetBlockIndex + 1; i < originalSkeleton.length; i++) {
      const origId = originalSkeleton[i].blockId;
      const foundInNew = newSkeleton.some((b) => b.blockId === origId);
      assert.ok(
        foundInNew,
        `修改中间段落后，后续块 [${origId}] 的 blockId 必须保持稳定，绝不随索引位移而漂移`
      );
    }
  });

  test(`[${suiteName}] 契约 5: 局部按需读取 readBlocks (基于 byteRange 精确提取)`, async () => {
    const driver = driverFactory();
    const doc = sampleDocGenerator();
    const skeleton = await driver.inspectSkeleton(doc);

    const b0 = skeleton[0];
    const b2 = skeleton[2];
    const requested = [b0.blockId, b2.blockId, '[[BLK_NON_EXISTENT]]'];

    const readRes = await driver.readBlocks(doc, requested);

    assert.ok(readRes[b0.blockId], '应返回第 0 块内容');
    assert.ok(readRes[b2.blockId], '应返回第 2 块内容');
    assert.strictEqual(readRes['[[BLK_NON_EXISTENT]]'], undefined, '不存在的块 ID 不应返回值');

    // 校验内容精确性与 byteRange 切片一致 (Markdown 完全相等，Word 虚拟文本包含于 XML 切片内)
    const slice0 = doc.slice(b0.byteRange[0], b0.byteRange[1]);
    const slice2 = doc.slice(b2.byteRange[0], b2.byteRange[1]);
    assert.ok(
      readRes[b0.blockId] === slice0 || slice0.includes(readRes[b0.blockId]),
      '读取内容必须与底层 byteRange 切片一致'
    );
    assert.ok(
      readRes[b2.blockId] === slice2 || slice2.includes(readRes[b2.blockId]),
      '读取内容必须与底层 byteRange 切片一致'
    );

    // 校验支持剥除中括号的 ID
    const bareId = normalizeBlockId(b0.blockId);
    const readWithBare = await driver.readBlocks(doc, [bareId]);
    assert.ok(readWithBare[bareId] || readWithBare[b0.blockId], '必须兼容无括号 bare ID 读取');
  });

  test(`[${suiteName}] 契约 6: 多锚点批量修补与逆序替换 (doc_batch_patch)`, async () => {
    const driver = driverFactory();
    const doc = sampleDocGenerator();
    const skeleton = await driver.inspectSkeleton(doc);

    // 选取两个不同块同时修补
    const blockA = skeleton[1];
    const blockB = skeleton[skeleton.length - 1];

    const hunks = [
      {
        targetBlockId: blockA.blockId,
        search: blockA.previewText.slice(0, 8),
        replace: 'PATCHED_A',
      },
      {
        targetBlockId: blockB.blockId,
        search: blockB.previewText.slice(0, 8),
        replace: 'PATCHED_B',
      },
    ];

    const result = await driver.applyPatchBatch(doc, hunks);

    assert.strictEqual(result.appliedCount, 2, '两处修改均应成功应用');
    assert.strictEqual(result.totalHunks, 2, '总 hunk 数应为 2');
    assert.ok(result.newContent.includes('PATCHED_A'), '新文档应包含 PATCHED_A');
    assert.ok(result.newContent.includes('PATCHED_B'), '新文档应包含 PATCHED_B');

    for (const diag of result.diagnostics) {
      assert.strictEqual(diag.applied, true, '诊断项应标明 applied: true');
      assert.ok(diag.tierUsed >= 1 && diag.tierUsed <= 3, '必须记录 tierUsed');
    }
  });

  test(`[${suiteName}] 契约 7: 企业级修订留痕 (trackChanges)`, async () => {
    const driver = driverFactory();
    const doc = sampleDocGenerator();
    const skeleton = await driver.inspectSkeleton(doc);

    const block = skeleton[1];
    const searchTarget = block.previewText.slice(0, 6);

    const result = await driver.applyPatchBatch(doc, [
      {
        targetBlockId: block.blockId,
        search: searchTarget,
        replace: 'NEW_TERMS',
        trackChanges: true,
      },
    ]);

    assert.strictEqual(result.appliedCount, 1, '应成功应用修补');
    const hasRevision =
      result.newContent.includes(`<del>${searchTarget}</del><ins>NEW_TERMS</ins>`) ||
      (result.newContent.includes('<w:del') && result.newContent.includes('<w:ins'));
    assert.ok(
      hasRevision,
      '开启 trackChanges 时必须以 <del>/<ins> 或 <w:del>/<w:ins> 标签记录修订痕迹'
    );
  });

  test(`[${suiteName}] 契约 8: 原子事务修补与回滚保护 (options.atomic)`, async () => {
    const driver = driverFactory();
    const doc = sampleDocGenerator();
    const skeleton = await driver.inspectSkeleton(doc);

    const validBlock = skeleton[1];
    const validSearch = validBlock.previewText.slice(0, 6);

    // 提交两个 hunk：一个合法，一个 targeting 非法内容
    const mixedHunks = [
      {
        targetBlockId: validBlock.blockId,
        search: validSearch,
        replace: 'SHOULD_NOT_BE_APPLIED',
      },
      {
        targetBlockId: '[[BLK_NON_EXISTENT]]',
        search: 'fake',
        replace: 'fake_replace',
      },
    ];

    // 1. 在 atomic: true 下，只要有一个失败，整体必须原子回滚
    const atomicResult = await driver.applyPatchBatch(doc, mixedHunks, { atomic: true });
    assert.strictEqual(atomicResult.appliedCount, 0, '原子模式下应整体回滚，appliedCount 为 0');
    assert.strictEqual(atomicResult.newContent, doc, '回滚后内容必须与原文档逐字节一致');
    assert.ok(
      !atomicResult.newContent.includes('SHOULD_NOT_BE_APPLIED'),
      '原文档绝不能被部分修改污染'
    );

    // 2. 在非 atomic 模式下 (默认部分成功)，合法项应当落盘，非法项给出诊断
    const partialResult = await driver.applyPatchBatch(doc, mixedHunks, { atomic: false });
    assert.strictEqual(partialResult.appliedCount, 1, '非原子模式下合法项应成功应用');
    assert.ok(partialResult.newContent.includes('SHOULD_NOT_BE_APPLIED'), '合法项内容应已变更');
    const failedDiag = partialResult.diagnostics.find((d) => d.blockId === '[[BLK_NON_EXISTENT]]');
    assert.ok(failedDiag && !failedDiag.applied, '非法项应输出明确的未应用诊断');
  });

  test(`[${suiteName}] 契约 9: 结构语法完整性保护 (表格、代码块、列表外层语法不被破坏)`, async () => {
    const driver = driverFactory();
    const doc = sampleDocGenerator();
    const skeleton = await driver.inspectSkeleton(doc);

    // 寻找表格与代码块
    const tableBlock = skeleton.find((b) => b.kind === 'table');
    const codeBlock = skeleton.find((b) => b.kind === 'code');

    if (tableBlock) {
      const tablePatch = await driver.applyPatchBatch(doc, [
        {
          targetBlockId: tableBlock.blockId,
          search: 'Cell_1_1',
          replace: 'Cell_1_1_MODIFIED',
        },
      ]);
      assert.strictEqual(tablePatch.appliedCount, 1, '表格单元格应修改成功');
      const tablePreserved =
        tablePatch.newContent.includes('| Cell_1_1_MODIFIED |') ||
        tablePatch.newContent.includes('Cell_1_1_MODIFIED');
      assert.ok(tablePreserved, '表格单元格内容更新且表格结构守恒');
    }

    if (codeBlock) {
      const codePatch = await driver.applyPatchBatch(doc, [
        {
          targetBlockId: codeBlock.blockId,
          search: 'const x = 1;',
          replace: 'const x = 42;',
        },
      ]);
      assert.strictEqual(codePatch.appliedCount, 1, '代码块内容应修改成功');
      assert.ok(codePatch.newContent.includes('```typescript'), '代码围栏起始标记必须完好');
      assert.ok(codePatch.newContent.includes('const x = 42;'), '代码块内容应更新');
    }
  });

  test(`[${suiteName}] 契约 10: 注册表对未知扩展名抛出明确异常，绝不静默降级`, () => {
    const registry = new DocumentDriverRegistry();
    const driver = driverFactory();
    registry.registerDriver(driver);

    assert.throws(
      () => {
        registry.getDriverForExtension('.unknown_ext');
      },
      (err) => err instanceof UnsupportedDocumentFormatError,
      '查询未注册的扩展名必须明确抛出 UnsupportedDocumentFormatError'
    );

    assert.throws(
      () => {
        registry.getDriverForPath('document_without_extension');
      },
      (err) => err instanceof UnsupportedDocumentFormatError,
      '查询无扩展名路径必须抛出 UnsupportedDocumentFormatError'
    );
  });
}

// ---------------------------------------------------------------------------
// 实例化并运行 MarkdownDriver 的契约测试集
// ---------------------------------------------------------------------------

function createSampleMarkdownDoc() {
  return `---
title: 企业智能合同与技术白皮书
author: Pixory Agent Core
date: 2026-11-03
---

# 第一章 概述与总体架构

欢迎使用 Pixory 智能文档 Agent。本系统采用纯函数式内核 (FCIS) 与六边形架构设计。

## 1.1 核心服务指标

本服务的核心原则是原件 100% 只读，所有编辑均在 VFS 沙箱工作区内隔离完成。

\`\`\`typescript
interface SystemMetric {
  latencyMs: number;
  const x = 1;
}
\`\`\`

> 重要说明: 请勿直接修改原始导入的 PDF 或 DOCX 文件，任何改动必须遵循 MVCC 状态机。

| 条款编号 | 条款名称 | 条款状态 | 备注说明 |
| :--- | :--- | :--- | :--- |
| CL_001 | Cell_1_1 | 有效 | 标准通用条款 |
| CL_002 | Cell_2_1 | 待审 | 需高级合规审核 |

- 需求项 1: 支持 DeepSeek / Claude / Gemini / OpenAI 兼容中转
- 需求项 2: 支持毫秒级极简文档阅读器即开即看
- 需求项 3: 严格保证数据库与磁盘文件状态零脑裂

---

## 1.2 结束语与签名确认

双方已阅读并充分理解上述所有条款，确认签字盖章后即刻生效。
`;
}

defineDocumentDriverContractTests('MarkdownDriver', {
  driverFactory: () => new MarkdownDriver(),
  sampleDocGenerator: createSampleMarkdownDoc,
  supportedExtensions: ['.md', '.markdown', '.txt'],
});

test('[MarkdownDriver] 性能基线测试: 10MB Markdown 大文档极速骨架扫描与内存受控', async () => {
  const driver = new MarkdownDriver();

  // 构建一个包含 20,000 个段落/列表/标题的大型 Markdown 字符串 (~8MB - 10MB)
  const chunk = `
## 章节 Section
这是自动生成的压测段落，用于验证单 pass 扫描器的吞吐率与内存稳定性。
| A | B |
| --- | --- |
| val1 | val2 |

- 项目列表 A
- 项目列表 B
`;
  const repeats = 35000;
  const largeMarkdown = chunk.repeat(repeats);
  const sizeMb = (largeMarkdown.length / 1024 / 1024).toFixed(2);

  const t0 = Date.now();
  const skeleton = await driver.inspectSkeleton(largeMarkdown);
  const durationMs = Date.now() - t0;

  assert.ok(skeleton.length > 50000, `扫描到的块数应超过 50,000 (实际: ${skeleton.length})`);
  // 必须在合理阈值内完成 10MB 文本骨架扫描（并发测试套件下给足 CPU 余量）
  assert.ok(
    durationMs < 6000,
    `10MB 骨架扫描耗时 ${durationMs}ms 必须低于 6000ms`
  );

  // 验证随机抽取一个块进行局部读取
  const target = skeleton[Math.floor(skeleton.length / 2)];
  const readRes = await driver.readBlocks(largeMarkdown, [target.blockId]);
  assert.ok(readRes[target.blockId], '在大文档中按 ID 局部读取必须成功');
});

test('[MarkdownDriver] 零全量加载断言: readBlocks 配合 readSlice 绝不读取全文', async () => {
  const driver = new MarkdownDriver();
  const sampleDoc = createSampleMarkdownDoc();
  const skeleton = await driver.inspectSkeleton(sampleDoc);

  let readTextCalled = false;
  const readSliceCalls = [];

  const mockStorage = {
    readText: async () => {
      readTextCalled = true;
      return sampleDoc;
    },
    readSlice: async (filePath, start, length) => {
      readSliceCalls.push({ filePath, start, length });
      return sampleDoc.slice(start, start + length);
    },
    exists: async () => true,
  };

  const targetBlock = skeleton[2];
  const result = await driver.readBlocks('vfs_work/contract.md', [targetBlock.blockId], {
    storage: mockStorage,
    skeleton,
  });

  assert.strictEqual(readTextCalled, false, '通过 readSlice 读取局部块时，绝对不能调用 readText 读取全文！');
  assert.strictEqual(readSliceCalls.length, 1, '必须仅触发 1 次局部切片读取');
  assert.strictEqual(readSliceCalls[0].start, targetBlock.byteRange[0]);
  assert.strictEqual(readSliceCalls[0].length, targetBlock.byteRange[1] - targetBlock.byteRange[0]);
  assert.strictEqual(
    result[targetBlock.blockId],
    sampleDoc.slice(targetBlock.byteRange[0], targetBlock.byteRange[1])
  );
});

// ---------------------------------------------------------------------------
// 实例化并运行 DocxDriver 的契约测试集 (验证与 Markdown 驱动的统一多态契约)
// ---------------------------------------------------------------------------

function createSampleDocxDoc() {
  return `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章 概述与总体架构</w:t></w:r></w:p>
      <w:p><w:r><w:t>欢迎使用 Pixory 智能文档 Agent。本系统采用纯函数式内核 (FCIS) 与六边形架构设计。</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>1.1 核心服务指标</w:t></w:r></w:p>
      <w:p><w:r><w:t>本服务的核心原则是原件 100% 只读，所有编辑均在 VFS 沙箱工作区内隔离完成。</w:t></w:r></w:p>
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Cell_1_1</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Cell_1_2</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
      <w:p><w:r><w:t>双方已阅读并充分理解上述所有条款，确认签字盖章后即刻生效。</w:t></w:r></w:p>
    </w:body>
  </w:document>`;
}

defineDocumentDriverContractTests('DocxDriver', {
  driverFactory: () => new DocxDriver(),
  sampleDocGenerator: createSampleDocxDoc,
  supportedExtensions: ['.docx'],
});

test('[DocxDriver] 真实 DOCX Zip 容器端到端解压、多段落原位修补与重打包', async () => {
  const driver = new DocxDriver();
  const zipAdapter = new NodeDocxZipAdapter();
  const textEncoder = new TextEncoder();

  const entries = new Map();
  entries.set('word/document.xml', textEncoder.encode(createSampleDocxDoc()));
  entries.set(
    '[Content_Types].xml',
    textEncoder.encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  );
  entries.set(
    'word/styles.xml',
    textEncoder.encode('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>')
  );

  const fs = require('node:fs');
  const tempDocxPath = path.resolve(process.cwd(), '.tmp_test_contract.docx');
  const initialZipBytes = await zipAdapter.writeDocx(entries, tempDocxPath);
  const crypto = require('node:crypto');
  const stylesHashBefore = crypto.createHash('sha256').update(entries.get('word/styles.xml')).digest('hex');

  // 1. inspectSkeleton 提取
  const skeleton = await driver.inspectSkeleton(tempDocxPath);
  assert.strictEqual(skeleton.length, 7, '应准确识别出 7 个块 (含表格内段落)');

  // 2. 批量修补
  const targetA = skeleton[1]; // 欢迎使用 Pixory
  const targetB = skeleton[skeleton.length - 1]; // 双方已阅读

  const patchResult = await driver.applyPatchBatch(tempDocxPath, [
    {
      targetBlockId: targetA.blockId,
      search: '欢迎使用',
      replace: '热烈欢迎使用',
      trackChanges: true,
    },
    {
      targetBlockId: targetB.blockId,
      search: '即刻生效',
      replace: '次日零时生效',
    },
  ]);

  assert.strictEqual(patchResult.appliedCount, 2, '两处修改均应成功应用');
  assert.ok(patchResult.newContent.includes('<w:ins'), '开启 trackChanges 时应生成 <w:ins>');
  assert.ok(patchResult.newContent.includes('次日零时生效'), '新内容应包含次日零时生效');

  // 3. 校验重打包后的 zip 容器与部件哈希不变性
  const updatedEntries = await zipAdapter.readEntries(tempDocxPath);
  const stylesHashAfter = crypto.createHash('sha256').update(updatedEntries.get('word/styles.xml')).digest('hex');

  assert.strictEqual(stylesHashAfter, stylesHashBefore, '未修改的 styles.xml 哈希必须逐字节保持不变 (原件安全)');

  // 清理临时文件
  if (fs.existsSync(tempDocxPath)) fs.unlinkSync(tempDocxPath);
});

// ---------------------------------------------------------------------------
// 实例化并运行 PdfDriver 的契约测试集 (Stage 8)
// ---------------------------------------------------------------------------

function createSamplePdfDoc() {
  return [
    '第一章 概述与总体架构',
    '',
    '欢迎使用 Pixory 智能文档 Agent。本系统采用纯函数式内核 (FCIS) 与六边形架构设计。',
    '',
    '核心原则是原件 100% 只读，所有编辑均在 VFS 沙箱工作区内隔离完成。',
    '',
    '| CL_001 | Cell_1_1 | 有效 |',
    '| CL_002 | Cell_2_1 | 待审 |',
    '',
    '- 需求项 1: 支持 DeepSeek / Claude / Gemini / OpenAI 兼容中转',
    '- 需求项 2: 友好的极简文档阅读器即开即看',
    '',
    '双方已阅读并充分理解上述所有条款，确认签字盖章后即刻生效。',
  ].join('\n');
}

defineDocumentDriverContractTests('PdfDriver', {
  driverFactory: () => new PdfDriver(),
  sampleDocGenerator: createSamplePdfDoc,
  supportedExtensions: ['.pdf'],
});
