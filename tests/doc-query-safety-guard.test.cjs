const assert = require('assert');

const FORBIDDEN_WORDS = /\b(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER|ATTACH|DETACH|PRAGMA|REPLACE|TRUNCATE|EXEC|EXECUTE)\b/i;

function extractAndValidateSql(rawOutput) {
  if (!rawOutput || !rawOutput.trim()) {
    return { safe: false, sql: null, reason: 'empty_output' };
  }

  let cleaned = rawOutput.trim();

  // 1. 剥离 Markdown 围栏 ```sql ... ```
  const fenceMatch = cleaned.match(/```(?:sql)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }

  // 2. 如果包含多行，找到以 SELECT 开头的那一行或语句块
  if (!/^\s*SELECT\b/i.test(cleaned)) {
    const lines = cleaned.split(/\r?\n/).map((l) => l.trim());
    const selectLineIndex = lines.findIndex((l) => /^SELECT\b/i.test(l));
    if (selectLineIndex >= 0) {
      cleaned = lines.slice(selectLineIndex).join(' ').trim();
    }
  }

  // 3. 去除末尾分号与空白
  cleaned = cleaned.replace(/;+\s*$/, '').trim();

  // 4. 严格校验必须是 SELECT
  if (!/^\s*SELECT\b/i.test(cleaned)) {
    return { safe: false, sql: null, reason: 'must_start_with_select' };
  }

  // 5. 剥离字符串常量（'...'）与双引号标识符（"..."）用于语法纯度与危险指令校验
  const strippedForValidation = cleaned
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""');

  // 6. 阻断多语句注入（除末尾已剥离的分号外，语句内部不应包含未被引号包裹的分号）
  if (strippedForValidation.includes(';')) {
    return { safe: false, sql: null, reason: 'multiple_statements_forbidden' };
  }

  // 7. 阻断危险指令（检查剥离字符串常量后的代码，允许数据字面量中包含关键字）
  if (FORBIDDEN_WORDS.test(strippedForValidation)) {
    return { safe: false, sql: null, reason: 'contains_forbidden_keywords' };
  }

  // 8. 长度保护
  if (cleaned.length > 2500) {
    return { safe: false, sql: null, reason: 'sql_too_long' };
  }

  return { safe: true, sql: cleaned };
}

console.log('Testing sqlSafetyGuard...');

// Case 1: 干净的 SELECT
const r1 = extractAndValidateSql('SELECT "姓名", MAX("销售额") FROM _doc_table;');
assert.strictEqual(r1.safe, true);
assert.strictEqual(r1.sql, 'SELECT "姓名", MAX("销售额") FROM _doc_table');

// Case 2: 带有 markdown 围栏和前后问候
const r2 = extractAndValidateSql(`你好！根据你的要求，查询语句如下：\n\`\`\`sql\nSELECT * FROM _doc_table WHERE "城市" = '上海' ORDER BY "销售额" DESC;\n\`\`\`\n希望能帮到你！`);
assert.strictEqual(r2.safe, true);
assert.strictEqual(r2.sql, `SELECT * FROM _doc_table WHERE "城市" = '上海' ORDER BY "销售额" DESC`);

// Case 3: 字符串常量中包含关键字（不应误杀）
const r2b = extractAndValidateSql(`SELECT * FROM _doc_table WHERE "action" = 'DELETE' AND "status" = 'UPDATE'`);
assert.strictEqual(r2b.safe, true);
assert.strictEqual(r2b.sql, `SELECT * FROM _doc_table WHERE "action" = 'DELETE' AND "status" = 'UPDATE'`);

// Case 4: 危险指令注入拦截
const r3 = extractAndValidateSql('DROP TABLE users; SELECT * FROM _doc_table');
assert.strictEqual(r3.safe, false);

const r4 = extractAndValidateSql('SELECT * FROM _doc_table; DELETE FROM _doc_table');
assert.strictEqual(r4.safe, false);

// Case 5: 多语句注入拦截（即使没有被列入敏感词的第二条 SELECT 语句）
const r4b = extractAndValidateSql('SELECT * FROM _doc_table; SELECT * FROM users');
assert.strictEqual(r4b.safe, false);
assert.strictEqual(r4b.reason, 'multiple_statements_forbidden');

// Case 6: 非 SELECT 拒绝
const r5 = extractAndValidateSql('UPDATE _doc_table SET a = 1');
assert.strictEqual(r5.safe, false);

console.log('sqlSafetyGuard tests passed! ✓');
