import * as FileSystem from 'expo-file-system';
import { runWithDatabaseSpace, type PixorySpace } from '../../database/db';
import { parseCsvLine } from './tableSchemaParser';

export async function runInTempTable<T>(params: {
  space: PixorySpace;
  csvUri: string;
  columns: string[];
  querySql: string;
}): Promise<T[]> {
  const tempTableName = `_doc_temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const colDefs = params.columns
    .map((c) => `"${c.replace(/"/g, '""')}" TEXT`)
    .join(', ');

  return runWithDatabaseSpace(params.space, async (db) => {
    try {
      // 1. 建立临时表
      await db.execAsync(`CREATE TABLE "${tempTableName}" (${colDefs});`);

      // 2. 读取 CSV/表格文件内容并分块批量写入（避免逐行单次 JSI 异步调用瓶颈）
      const content = await FileSystem.readAsStringAsync(params.csvUri);
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

      const MAX_ROWS = 10000; // 最多加载 10,000 行保护移动端内存与响应
      const batchSize = Math.max(1, Math.min(50, Math.floor(900 / Math.max(1, params.columns.length))));
      const rowLimit = Math.min(lines.length, MAX_ROWS + 1);

      await db.withTransactionAsync(async () => {
        let batchRows: string[][] = [];

        const flushBatch = async () => {
          if (batchRows.length === 0) return;
          const rowPlaceholder = `(${params.columns.map(() => '?').join(', ')})`;
          const allPlaceholders = batchRows.map(() => rowPlaceholder).join(', ');
          const batchSql = `INSERT INTO "${tempTableName}" VALUES ${allPlaceholders};`;
          const allParams: string[] = [];
          for (const row of batchRows) {
            for (let c = 0; c < params.columns.length; c++) {
              allParams.push(row[c] ?? '');
            }
          }
          await db.runAsync(batchSql, allParams);
          batchRows = [];
        };

        // 跳过第一行表头
        for (let i = 1; i < rowLimit; i++) {
          const rawLine = lines[i];
          if (!rawLine) continue;
          const cells = parseCsvLine(rawLine);
          batchRows.push(cells);
          if (batchRows.length >= batchSize) {
            await flushBatch();
          }
        }
        await flushBatch();
      });

      // 3. 将 SQL 中的 _doc_table 替换为真实临时表名
      const executableSql = params.querySql.replace(/\b_doc_table\b/gi, `"${tempTableName}"`);
      const rows = await db.getAllAsync<T>(executableSql);
      return rows;
    } finally {
      // 4. 无论成功或失败，强制清理临时表
      try {
        await db.execAsync(`DROP TABLE IF EXISTS "${tempTableName}";`);
      } catch {
        // 静默保护
      }
    }
  });
}
