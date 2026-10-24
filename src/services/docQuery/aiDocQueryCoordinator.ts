import * as FileSystem from 'expo-file-system';
import type { PixorySpace } from '../../database/db';
import { detectDocQueryIntent, type QueryAttachmentTarget } from './docQueryIntentDetector';
import { parseTableSchema, buildStep1Prompt } from './tableSchemaParser';
import { extractAndValidateSql } from './sqlSafetyGuard';
import { runInTempTable } from './tempTableService';

export interface DocQueryResult {
  mode: 'two_step_sql' | 'fallback_to_summary';
  queryPromptContext: string | null;
  executedSql?: string;
  fallbackReason?: string;
}

export async function executeTwoStepDocQuery(params: {
  space: PixorySpace;
  attachment: QueryAttachmentTarget;
  userQuestion: string;
  callStep1: (prompt: string, signal?: AbortSignal) => Promise<string>;
  abortSignal?: AbortSignal;
}): Promise<DocQueryResult> {
  const intent = detectDocQueryIntent(params.attachment);
  if (intent.mode !== 'two_step_sql') {
    return {
      mode: 'fallback_to_summary',
      queryPromptContext: null,
      fallbackReason: intent.reason,
    };
  }

  try {
    // 1. 读取表头前 128KB 解析 Schema
    const csvHead = await FileSystem.readAsStringAsync(params.attachment.uri, {
      length: 128 * 1024,
    });
    const schema = parseTableSchema(csvHead);
    if (schema.columns.length === 0) {
      return {
        mode: 'fallback_to_summary',
        queryPromptContext: null,
        fallbackReason: 'empty_columns',
      };
    }

    // 2. Step 1: 调用大模型生成 SQL（带 8s 超时）
    const prompt = buildStep1Prompt(schema, params.userQuestion);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('step1_timeout')), 8000);
    });

    let step1Response: string;
    try {
      step1Response = await Promise.race([
        params.callStep1(prompt, params.abortSignal),
        timeoutPromise,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }

    // 3. 安全检查与纯化
    const safety = extractAndValidateSql(step1Response);
    if (!safety.safe || !safety.sql) {
      return {
        mode: 'fallback_to_summary',
        queryPromptContext: null,
        fallbackReason: safety.reason ?? 'invalid_sql',
      };
    }

    // 4. 本地临时表执行查询
    const rows = await runInTempTable<Record<string, unknown>>({
      space: params.space,
      csvUri: params.attachment.uri,
      columns: schema.columns,
      querySql: safety.sql,
    });

    const formattedRows = rows.slice(0, 50); // 最多保留 50 行数据保护 Prompt
    const queryPromptContext = [
      `【本地表格动态查询结果（来自文件：${params.attachment.name}）】`,
      `检索语句：${safety.sql}`,
      `匹配行数：共 ${rows.length} 行${rows.length > 50 ? '（已截取前 50 行注入）' : ''}`,
      `查询结果数据：`,
      JSON.stringify(formattedRows, null, 2),
    ].join('\n');

    return {
      mode: 'two_step_sql',
      queryPromptContext,
      executedSql: safety.sql,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown_error';
    return {
      mode: 'fallback_to_summary',
      queryPromptContext: null,
      fallbackReason: reason,
    };
  }
}
