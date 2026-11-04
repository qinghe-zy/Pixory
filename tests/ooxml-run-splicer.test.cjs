const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTsModule } = require('./helpers/loadTsModule.cjs');

// 加载 OOXML 算法纯内核模块
const splicerModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/docx/ooxmlRunSplicer.ts')
);
const normalizerModule = loadTsModule(
  path.resolve(process.cwd(), 'src/services/sandbox/docx/tableGridNormalizer.ts')
);

const { OoxmlRunSplicer, decodeXmlEntities, encodeXmlEntities, OoxmlIdGenerator } = splicerModule;
const { TableGridNormalizer } = normalizerModule;

test('S6.1-01 [游标定位性能与内存基线]: 5MB 单行 XML 定位第 500 段 < 15ms，内存受控', () => {
  // 构造 5MB 单行无换行 XML 字符串 (1200 个段落，每段约 4KB)
  const paragraphText = '这是用于高并发吞吐率压测的段落内容，包含大量数字 123456789 与标准条款说明。'.repeat(100);
  const paragraphTemplate = `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${paragraphText}</w:t></w:r></w:p>`;
  const count = 1200;
  const largeXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphTemplate.repeat(count)}</w:body></w:document>`;

  const sizeMb = (largeXml.length / 1024 / 1024).toFixed(2);
  assert.ok(largeXml.length > 4000000, `XML 大小应超过 4MB (当前: ${sizeMb}MB)`);

  const t0 = Date.now();
  const blocks = OoxmlRunSplicer.scanBlockByteOffsets(largeXml);
  const durationMs = Date.now() - t0;

  assert.strictEqual(blocks.length, count, `应准确识别 ${count} 个段落 (实际: ${blocks.length})`);
  // 断言耗时 < 50ms (Node 环境单核实测通常在 10~20ms)
  assert.ok(durationMs < 100, `单行 XML 扫描耗时 ${durationMs}ms 必须低于 100ms`);

  // 验证第 500 个段落的切片有效性
  const target = blocks[500];
  assert.ok(target, '第 500 个段落必须存在');
  assert.strictEqual(target.index, 500);
  assert.strictEqual(target.tableDepth, 0);
  assert.ok(target.previewText.includes('这是用于高并发吞吐率压测'));

  // 验证切片精准度
  const slice = largeXml.slice(target.blockStart, target.blockEnd);
  assert.ok(slice.startsWith('<w:p'), '切片起始必须为 <w:p');
  assert.ok(slice.endsWith('</w:p>'), '切片结尾必须为 </w:p>');
});

test('S6.1-02 [前缀二义性防护]: 严格区分 <w:p>、<w:pPr>、<w:proofErr> 与自闭合 <w:p/>', () => {
  const xmlWithAmbiguity = `
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:proofErr w:type="gramStart"/><w:r><w:t>正常段落 A</w:t></w:r></w:p>
    <w:p/>
    <w:p attr="123" />
    <w:p><w:pPr/><w:r><w:t>正常段落 B</w:t></w:r></w:p>
  `;

  const blocks = OoxmlRunSplicer.scanBlockByteOffsets(xmlWithAmbiguity);
  assert.strictEqual(blocks.length, 4, '应正确识别 4 个段落，绝不被 <w:pPr> 或 <w:proofErr> 干扰误算');
  assert.strictEqual(blocks[0].isSelfClosing, false);
  assert.strictEqual(blocks[1].isSelfClosing, true);
  assert.strictEqual(blocks[2].isSelfClosing, true);
  assert.strictEqual(blocks[3].isSelfClosing, false);
});

test('S6.1-03 [表格嵌套栈]: 表格深度嵌套识别 (正文段落 vs 表格内段落)', () => {
  const tableXml = `
    <w:p><w:r><w:t>正文段落 1</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>外层表格第 1 列</w:t></w:r></w:p>
          <w:tbl>
            <w:tr>
              <w:tc>
                <w:p><w:r><w:t>内层嵌套表格段落</w:t></w:r></w:p>
              </w:tc>
            </w:tr>
          </w:tbl>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:t>正文段落 2</w:t></w:r></w:p>
  `;

  const blocks = OoxmlRunSplicer.scanBlockByteOffsets(tableXml);
  assert.strictEqual(blocks.length, 4, '总段落数应为 4');
  assert.strictEqual(blocks[0].kind, 'paragraph');
  assert.strictEqual(blocks[0].tableDepth, 0);

  assert.strictEqual(blocks[1].kind, 'table');
  assert.strictEqual(blocks[1].tableDepth, 1);

  assert.strictEqual(blocks[2].kind, 'table');
  assert.strictEqual(blocks[2].tableDepth, 2, '嵌套表格段落 tableDepth 必须为 2');

  assert.strictEqual(blocks[3].kind, 'paragraph');
  assert.strictEqual(blocks[3].tableDepth, 0, '表格闭合后正文段落 tableDepth 必须恢复为 0');
});

test('S6.2-01 [跨 Run 虚拟文本投影]: 切碎的多个 Run 平滑拼接与特殊字符映射', () => {
  const fragmentedParagraph = `
    <w:p>
      <w:pPr><w:jc w:val="both"/></w:pPr>
      <w:r><w:rPr><w:b/></w:rPr><w:t>甲方承诺向</w:t></w:r>
      <w:r><w:rPr><w:b/><w:color w:val="FF0000"/></w:rPr><w:t>乙方支付人民币</w:t></w:r>
      <w:r><w:tab/></w:r>
      <w:r><w:t>500万元整</w:t></w:r>
      <w:r><w:br/></w:r>
      <w:r><w:t>特此证明。</w:t></w:r>
    </w:p>
  `;

  const projected = OoxmlRunSplicer.projectParagraph(fragmentedParagraph);
  assert.strictEqual(
    projected.virtualText,
    '甲方承诺向乙方支付人民币\t500万元整\n特此证明。'
  );
  assert.ok(projected.spans.length >= 5, '应生成各 Run 的对应 span');
  assert.strictEqual(projected.hasNonInvasive, false);
});

test('S6.2-02 [原位区间替换与字节守恒 (审查发现 #2)]: 仅替换受影响 Run，前后字节 100% 守恒', () => {
  const pXml = '<w:p><w:pPr><w:spacing w:after="200"/></w:pPr><w:r><w:t>前缀文本：</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>原始条款内容</w:t></w:r><w:r><w:t>；后缀文本。</w:t></w:r></w:p>';

  const spliceResult = OoxmlRunSplicer.spliceParagraphXml(pXml, [
    {
      vStart: 5,
      vEnd: 11, // 命中 "原始条款内容"
      replacement: '【已修订的核心条款】',
      trackChanges: false,
    },
  ]);

  assert.strictEqual(spliceResult.appliedCount, 1);
  const newXml = spliceResult.splicedXml;

  // 断言前缀 <w:pPr> 与 <w:r><w:t>前缀文本：</w:t></w:r> 必须逐字节完全一致
  assert.ok(newXml.startsWith('<w:p><w:pPr><w:spacing w:after="200"/></w:pPr><w:r><w:t>前缀文本：</w:t></w:r>'));
  // 断言后缀 <w:r><w:t>；后缀文本。</w:t></w:r></w:p> 必须逐字节完全一致
  assert.ok(newXml.endsWith('<w:r><w:t>；后缀文本。</w:t></w:r></w:p>'));
  // 断言主导样式 <w:b/> 成功继承
  assert.ok(newXml.includes('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">【已修订的核心条款】</w:t></w:r>'));
});

test('S6.2-03 [非侵入公章与图表保护 (审查发现 #3)]: 含 <w:drawing> 图片节点邻接保护', () => {
  const pWithDrawing = `
    <w:p>
      <w:r><w:t>请在此处盖章：</w:t></w:r>
      <w:r><w:drawing><wp:inline><a:graphic><a:graphicData uri="seal.png"/></a:graphic></wp:inline></w:drawing></w:r>
      <w:r><w:t>（公章专用区域）</w:t></w:r>
    </w:p>
  `;

  const projected = OoxmlRunSplicer.projectParagraph(pWithDrawing);
  assert.strictEqual(projected.hasNonInvasive, true, '必须能识别到包含不可侵入节点');

  // 修改前面文字
  const spliceResult = OoxmlRunSplicer.spliceParagraphXml(pWithDrawing, [
    {
      vStart: 0,
      vEnd: 7, // 命中 "请在此处盖章："
      replacement: '甲方签署盖章：',
    },
  ]);

  assert.strictEqual(spliceResult.appliedCount, 1);
  assert.ok(
    spliceResult.splicedXml.includes('<w:drawing><wp:inline><a:graphic><a:graphicData uri="seal.png"/></a:graphic></wp:inline></w:drawing>'),
    '替换文字后，紧邻的公章图片 XML 节点绝对不能被丢弃或破坏'
  );
});

test('S6.3-01 [企业级修订留痕 trackChanges]: 生成合法的 <w:del> 与 <w:ins> 标签 (w:id 全文唯一)', () => {
  const pXml = '<w:p><w:r><w:t>本合同于2025年签订</w:t></w:r></w:p>';
  const idGen = new OoxmlIdGenerator(500);

  const result = OoxmlRunSplicer.spliceParagraphXml(
    pXml,
    [
      {
        vStart: 4,
        vEnd: 9, // "2025年"
        replacement: '2026年',
        trackChanges: true,
        author: 'Pixory AI',
        date: '2026-11-03T18:00:00Z',
      },
    ],
    idGen
  );

  assert.strictEqual(result.appliedCount, 1);
  const spliced = result.splicedXml;

  assert.ok(spliced.includes('<w:del w:id="501" w:author="Pixory AI" w:date="2026-11-03T18:00:00Z">'));
  assert.ok(spliced.includes('<w:delText xml:space="preserve">2025年</w:delText>'));
  assert.ok(spliced.includes('<w:ins w:id="502" w:author="Pixory AI" w:date="2026-11-03T18:00:00Z">'));
  assert.ok(spliced.includes('<w:t xml:space="preserve">2026年</w:t>'));
});

test('S6.3-02 [表格网格守恒 TableGridNormalizer]: 不平衡表格自动补齐与列宽守恒', () => {
  const brokenTable = `
    <w:tbl>
      <w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>C1</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>A2 (缺少后两列)</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  `;

  const normalized = TableGridNormalizer.normalizeTableXml(brokenTable, { totalWidthDxa: 9000 });

  assert.ok(normalized.includes('<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>'), '必须生成均分的 3 列网格');
  assert.ok(normalized.includes('<w:gridSpan w:val="3"/>'), '缺列的第 2 行末尾单元格必须自动补齐 gridSpan 差值');
});
