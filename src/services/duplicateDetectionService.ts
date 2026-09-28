import { backgroundTaskRepository, imageRepository, runWithDatabaseSpace, type BackgroundTaskRecord, type PixorySpace } from '../database';
import { computeFileSha256, computeImageDHash } from '../native/pixoryMediaModule';

export interface DuplicateDetectionScanResult {
  task: BackgroundTaskRecord;
  processedCount: number;
  failedCount: number;
  exactGroupCount: number;
  similarGroupCount: number;
}

const DUPLICATE_SCAN_BATCH_LIMIT = 500;

export async function runDuplicateDetectionScan(space: PixorySpace = 'normal'): Promise<DuplicateDetectionScanResult> {
  return runWithDatabaseSpace(space, async (db) => {
    const candidates = await imageRepository.findAssetsMissingDuplicateHashes(db, DUPLICATE_SCAN_BATCH_LIMIT);
    let task = await backgroundTaskRepository.create(db, {
      type: 'duplicate-scan',
      space,
      status: 'verifying',
      title: '扫描重复素材',
      totalCount: candidates.length,
      currentLabel: candidates.length > 0 ? '正在补算素材 hash' : 'hash 已完整',
    });
    let processedCount = 0;
    let failedCount = 0;

    for (const asset of candidates) {
      let contentHash = asset.contentHash;
      let visualHash = asset.visualHash;
      let failed = false;

      if (!contentHash) {
        try {
          contentHash = await computeFileSha256(asset.originalFileUri);
        } catch {
          failed = true;
        }
      }

      if (asset.mediaType === 'image' && !visualHash) {
        try {
          visualHash = await computeImageDHash(asset.originalFileUri);
        } catch {
          failed = true;
        }
      }

      if (contentHash || visualHash) {
        await imageRepository.updateDuplicateHashes(db, asset.id, {
          contentHash: contentHash ?? undefined,
          visualHash: asset.mediaType === 'image' ? visualHash ?? undefined : null,
        });
      }

      processedCount += 1;
      if (failed) {
        failedCount += 1;
      }

      task = await backgroundTaskRepository.update(db, task.id, {
        status: 'verifying',
        successCount: processedCount - failedCount,
        failedCount,
        completedBytes: processedCount,
        currentLabel: asset.originalFilename,
      }) ?? task;
    }

    const [exactGroups, similarGroups] = await Promise.all([
      imageRepository.findExactDuplicateGroups(db, { mediaType: 'all' }),
      imageRepository.findSimilarImageGroups(db),
    ]);
    task = await backgroundTaskRepository.update(db, task.id, {
      status: 'completed',
      successCount: processedCount - failedCount,
      failedCount,
      completedBytes: processedCount,
      currentLabel: '扫描完成',
      resultJson: JSON.stringify({
        exactGroupCount: exactGroups.length,
        similarGroupCount: similarGroups.length,
      }),
    }) ?? task;

    return {
      task,
      processedCount,
      failedCount,
      exactGroupCount: exactGroups.length,
      similarGroupCount: similarGroups.length,
    };
  }).catch(async (error) => {
    throw error;
  });
}
