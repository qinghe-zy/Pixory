const assert = require('assert');

// 模拟测试 tableSchemaParser 的纯函数
function parseCsvLine(line, explicitDelimiter) {
  const delimiter = explicitDelimiter ?? (line.includes('\t') && !line.includes(',') ? '\t' : ',');
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseTableSchema(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { columns: [], sample: [], totalRows: 0 };
  }

  const columns = parseCsvLine(lines[0] || '').filter((c) => c.length > 0);
  const sample = lines.slice(1, 3).map((line) => {
    const parsed = parseCsvLine(line);
    return columns.map((_, idx) => parsed[idx] ?? '');
  });

  return {
    columns,
    sample,
    totalRows: Math.max(0, lines.length - 1),
  };
}

function buildStep1Prompt(schema, userQuestion) {
  const colDefs = schema.columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
  const sampleRows = schema.sample
    .map((row) => `  (${row.map((val) => JSON.stringify(val)).join(', ')})`)
    .join('\n');

  return [
    `【数据表结构定义】`,
    `表名：_doc_table`,
    `字段：${colDefs}`,
    `数据样例（总共约 ${schema.totalRows} 行）：`,
    sampleRows || '  (无样例数据)',
    ``,
    `【用户查询】`,
    userQuestion,
    ``,
    `【生成要求】`,
    `1. 仅输出一行可在 SQLite 执行的标准 SELECT 查询语句，绝不要加任何多余文字或解释；`,
    `2. 涉及的字段名必须加上双引号（如 "销售额"），避免空格或中文导致语法错误；`,
    `3. 严禁使用 DROP, DELETE, INSERT, UPDATE, ALTER, ATTACH 等修改语句。`,
  ].join('\n');
}

// 运行测试
console.log('Testing tableSchemaParser...');

// Case 1: 基础 CSV
const csv1 = `姓名,年龄,城市,销售额\n张三,28,上海,15000\n李四,32,北京,28000\n王五,25,广州,12000`;
const s1 = parseTableSchema(csv1);
assert.strictEqual(s1.columns.length, 4);
assert.deepStrictEqual(s1.columns, ['姓名', '年龄', '城市', '销售额']);
assert.strictEqual(s1.totalRows, 3);
assert.strictEqual(s1.sample.length, 2);
assert.deepStrictEqual(s1.sample[0], ['张三', '28', '上海', '15000']);

// Case 2: 带引号与转义逗号
const csv2 = `"公司, 名称","总资产(万元)","备注"\n"科技, 有限公司","1,200","稳定"\n"创投公司","800","高速增长"`;
const s2 = parseTableSchema(csv2);
assert.deepStrictEqual(s2.columns, ['公司, 名称', '总资产(万元)', '备注']);
assert.deepStrictEqual(s2.sample[0], ['科技, 有限公司', '1,200', '稳定']);

// Case 3: Prompt 组装
const prompt = buildStep1Prompt(s1, '谁的销售额最高？');
assert.ok(prompt.includes('表名：_doc_table'));
assert.ok(prompt.includes('"姓名", "年龄", "城市", "销售额"'));
assert.ok(prompt.includes('谁的销售额最高？'));

// Case 4: TSV 制表符分隔测试
const tsv1 = `角色\t职业\t战力\n阿尔萨斯\t圣骑士\t9999\n吉安娜\t法师\t9500`;
const s3 = parseTableSchema(tsv1);
assert.deepStrictEqual(s3.columns, ['角色', '职业', '战力']);
assert.deepStrictEqual(s3.sample[0], ['阿尔萨斯', '圣骑士', '9999']);

console.log('tableSchemaParser tests passed! ✓');
