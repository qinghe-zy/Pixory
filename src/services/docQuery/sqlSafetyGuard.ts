export interface SqlExtractionResult {
  safe: boolean;
  sql: string | null;
  reason?: string;
}

const FORBIDDEN_WORDS = /\b(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER|ATTACH|DETACH|PRAGMA|REPLACE|TRUNCATE|EXEC|EXECUTE)\b/i;

export function extractAndValidateSql(rawOutput: string): SqlExtractionResult {
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
