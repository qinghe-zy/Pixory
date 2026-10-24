export interface TableSchema {
  columns: string[];
  sample: string[][];
  totalRows: number;
}

export function parseCsvLine(line: string, explicitDelimiter?: string): string[] {
  const delimiter = explicitDelimiter ?? (line.includes('\t') && !line.includes(',') ? '\t' : ',');
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // 跳过转义双引号
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

export function parseTableSchema(csvText: string): TableSchema {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { columns: [], sample: [], totalRows: 0 };
  }

  const columns = parseCsvLine(lines[0] ?? '').filter((c) => c.length > 0);
  const sample = lines.slice(1, 3).map((line) => {
    const parsed = parseCsvLine(line);
    // 裁剪或补齐与 columns 一致的长度
    return columns.map((_, idx) => parsed[idx] ?? '');
  });

  return {
    columns,
    sample,
    totalRows: Math.max(0, lines.length - 1),
  };
}

export function buildStep1Prompt(schema: TableSchema, userQuestion: string): string {
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
