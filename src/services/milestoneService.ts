import type { SQLiteDatabase } from 'expo-sqlite';
import { runWithDatabaseSpace } from '../database';
import { settingsRepository } from '../database/repositories/settingsRepository';
import type { PixorySpace } from '../database/db';

export interface AppMilestones {
  daysTogether: number;
  firstUseDate: number;
  firstImageDate: number | null;
  firstImageId: number | null;
  firstThreadId: string | null;
  firstThreadDate: number | null;
  firstMessageId: string | null;
  totalImages: number;
  totalAiThreads: number;
  totalAiMessages: number;
  totalMemories: number;
  totalFavoriteImages: number;
  totalIps: number;
  totalStorageBytes: number;
}

export async function getAppMilestones(space: PixorySpace = 'normal'): Promise<AppMilestones> {
  return runWithDatabaseSpace(space, async (db: SQLiteDatabase) => {
    const now = Date.now();
    let firstUseDate = now;

    const earliestImageResult = await db.getFirstAsync<{ minDate: string }>(`
      SELECT MIN(createdAt) as minDate FROM image_assets
    `);
    const earliestThreadResult = await db.getFirstAsync<{ minDate: string }>(`
      SELECT MIN(createdAt) as minDate FROM ai_threads
    `);

    const minImage = earliestImageResult?.minDate ? new Date(earliestImageResult.minDate).getTime() : null;
    const minThread = earliestThreadResult?.minDate ? new Date(earliestThreadResult.minDate).getTime() : null;

    let calculatedMinDate = now;
    if (minImage !== null && minThread !== null) {
      calculatedMinDate = Math.min(minImage, minThread);
    } else if (minImage !== null) {
      calculatedMinDate = minImage;
    } else if (minThread !== null) {
      calculatedMinDate = minThread;
    }

    const installDateStr = await settingsRepository.getValue(db, 'app_install_date');
    if (installDateStr) {
      firstUseDate = parseInt(installDateStr, 10);
      if (isNaN(firstUseDate) || firstUseDate > calculatedMinDate) {
        firstUseDate = calculatedMinDate;
        await settingsRepository.setValue(db, 'app_install_date', firstUseDate.toString());
      }
    } else {
      firstUseDate = calculatedMinDate;
      await settingsRepository.setValue(db, 'app_install_date', firstUseDate.toString());
    }

    const firstImageResult = await db.getFirstAsync<{ id: number; createdAt: string }>(`
      SELECT id, createdAt FROM image_assets WHERE deletedAt IS NULL ORDER BY createdAt ASC LIMIT 1
    `);

    const firstThreadResult = await db.getFirstAsync<{ id: string; createdAt: string }>(`
      SELECT id, createdAt FROM ai_threads WHERE archivedAt IS NULL ORDER BY createdAt ASC LIMIT 1
    `);

    let firstMessageId: string | null = null;
    if (firstThreadResult?.id) {
      const msgResult = await db.getFirstAsync<{ id: string }>(`
        SELECT id FROM ai_messages WHERE threadId = ? ORDER BY createdAt ASC LIMIT 1
      `, [firstThreadResult.id]);
      firstMessageId = msgResult?.id ?? null;
    }

    const totalImagesResult = await db.getFirstAsync<{ count: number; sumSize: number }>(`
      SELECT COUNT(*) as count, SUM(fileSize) as sumSize FROM image_assets WHERE deletedAt IS NULL
    `);

    const totalThreadsResult = await db.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) as count FROM ai_threads WHERE archivedAt IS NULL
    `);

    const totalAiMessagesResult = await db.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) as count FROM ai_messages
    `);

    const totalMemoriesResult = await db.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) as count FROM ai_memories WHERE status = 'active' OR status = 'stale'
    `);

    const totalFavImagesResult = await db.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) as count FROM image_assets WHERE deletedAt IS NULL AND isFavorite = 1
    `);

    const totalIpsResult = await db.getFirstAsync<{ count: number }>(`
      SELECT COUNT(*) as count FROM ips WHERE deletedAt IS NULL
    `);

    const daysTogether = Math.max(1, Math.ceil((now - firstUseDate) / (1000 * 60 * 60 * 24)));

    return {
      daysTogether,
      firstUseDate,
      firstImageDate: firstImageResult?.createdAt ? new Date(firstImageResult.createdAt).getTime() : null,
      firstImageId: firstImageResult?.id ?? null,
      firstThreadDate: firstThreadResult?.createdAt ? new Date(firstThreadResult.createdAt).getTime() : null,
      firstThreadId: firstThreadResult?.id ?? null,
      firstMessageId,
      totalImages: totalImagesResult?.count ?? 0,
      totalStorageBytes: totalImagesResult?.sumSize ?? 0,
      totalAiThreads: totalThreadsResult?.count ?? 0,
      totalAiMessages: totalAiMessagesResult?.count ?? 0,
      totalMemories: totalMemoriesResult?.count ?? 0,
      totalFavoriteImages: totalFavImagesResult?.count ?? 0,
      totalIps: totalIpsResult?.count ?? 0,
    };
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function generateMilestonesDetailMarkdown(space: PixorySpace = 'normal'): Promise<string> {
  return runWithDatabaseSpace(space, async (db: SQLiteDatabase) => {
    let md = '# 个人数字生命详单\n\n';

    // 1. IPs (专属世界)
    md += '## 专属世界拆解\n\n';
    
    // Check if IPs table has rows
    const ipRows = await db.getAllAsync<{ id: number; name: string; imageCount: number; videoCount: number; sumSize: number }>(`
      SELECT 
        ip.id, 
        ip.name,
        SUM(CASE WHEN a.mediaType = 'image' THEN 1 ELSE 0 END) as imageCount,
        SUM(CASE WHEN a.mediaType = 'video' THEN 1 ELSE 0 END) as videoCount,
        SUM(a.fileSize) as sumSize
      FROM ips ip
      LEFT JOIN image_assets a ON ip.id = a.ipId AND a.deletedAt IS NULL
      WHERE ip.deletedAt IS NULL
      GROUP BY ip.id
      ORDER BY sumSize DESC
    `);

    if (ipRows.length === 0) {
      md += '> 暂无专属世界。\n\n';
    } else {
      for (const ip of ipRows) {
        md += `### ${ip.name}\n`;
        const items = [];
        if (ip.imageCount > 0) items.push(`图片: **${ip.imageCount}** 张`);
        if (ip.videoCount > 0) items.push(`视频: **${ip.videoCount}** 个`);
        if (items.length === 0) items.push(`空置中`);
        
        const sizeStr = ip.sumSize > 0 ? ` (${formatBytes(ip.sumSize)})` : '';
        md += `- ${items.join(' / ')}${sizeStr}\n`;
        md += `- [进入世界 ->](pixory://ip/${ip.id})\n\n`;
      }
    }

    md += '---\n\n';

    // 2. Chat Threads (思维交汇)
    md += '## 思维交汇详情\n\n';

    const threadRows = await db.getAllAsync<{ id: string; title: string; messageCount: number }>(`
      SELECT 
        t.id, 
        t.title,
        COUNT(m.id) as messageCount
      FROM ai_threads t
      LEFT JOIN ai_messages m ON t.id = m.threadId
      WHERE t.archivedAt IS NULL
      GROUP BY t.id
      ORDER BY messageCount DESC
    `);

    if (threadRows.length === 0) {
      md += '> 暂无对话记录。\n\n';
    } else {
      for (const th of threadRows) {
        if (th.messageCount === 0) continue;
        const title = th.title || '未命名对话';
        md += `### ${title}\n`;
        md += `- 互动记录: **${th.messageCount}** 条\n`;
        md += `- [进入对话 ->](pixory://thread/${th.id})\n\n`;
      }
    }

    return md;
  });
}
