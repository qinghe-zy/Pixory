import * as FileSystem from 'expo-file-system';
import { openDatabaseAsync, deleteDatabaseAsync } from 'expo-sqlite';
import type { PixorySpace } from '../../database/db';
import { parseCsvLine } from './tableSchemaParser';

export async function runInTempTable<T>(params: {
  space: PixorySpace;
  csvUri: string;
  columns: string[];
  querySql: string;
}): Promise<T[]> {
  // 使用完全独立的临时隔离沙盒数据库实例，彻底与业务数据库（pixory.sqlite / pixory_personal.sqlite）物理隔离
  const sandboxDbName = `_doc_sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.db`;
  const db = await openDatabaseAsync(sandboxDbName);

  const colDefs = params.columns
    .map((c) => `"${c.replace(/"/g, '""')}" TEXT`)
    .join(', ');

  try {
    // 1. 建立临时沙盒表（直接使用 _doc_table，无需在生产库动态拼接随机表名）
    await db.execAsync(`CREATE TABLE "_doc_table" (${colDefs});`);

    // 2. 读取 CSV/表格文件内容并分块批量写入
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
        const batchSql = `INSERT INTO "_doc_table" VALUES ${allPlaceholders};`;
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

    // 3. 执行经过安全校验的 SQL 查询（沙盒库中仅存在 _doc_table，无法读取任何其他业务表）
    const rows = await db.getAllAsync<T>(params.querySql);
    return rows;
  } finally {
    // 4. 彻底关闭并销毁临时沙盒数据库
    try {
      await db.closeAsync();
    } catch {}
    try {
      await deleteDatabaseAsync(sandboxDbName);
    } catch {}
  }
}
