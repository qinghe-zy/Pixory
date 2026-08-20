import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { importBatchRepository, runWithDatabaseSpace, type ImportBatchItemStatus, type ImportBatchSummary, type PixorySpace } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { formatDateTime } from '../utils/formatters';

interface ImportBatchHistoryScreenProps {
  ipId: number;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onOpenBatch: (batch: ImportBatchSummary) => void;
}

type ImportBatchItemCounts = Record<ImportBatchItemStatus, number>;

type ImportBatchHistoryData = {
  batches: ImportBatchSummary[];
  itemCountsByBatchId: Record<number, ImportBatchItemCounts>;
};

const EMPTY_ITEM_COUNTS: ImportBatchItemCounts = {
  success: 0,
  failed: 0,
  skipped: 0,
};

export function ImportBatchHistoryScreen({ ipId, space = 'normal', refreshToken, onBack, onOpenBatch }: ImportBatchHistoryScreenProps) {
  const { data, isLoading, errorMessage, reload } = useScreenLoad(
    () =>
      runWithDatabaseSpace(space, async (db): Promise<ImportBatchHistoryData> => {
        const batches = await importBatchRepository.findByIpId(db, ipId, 30);
        const statusRows = await importBatchRepository.countItemsByStatusForBatchIds(db, batches.map((batch) => batch.id));
        const itemCountEntries = batches.map((batch) => {
          const counts: ImportBatchItemCounts = { ...EMPTY_ITEM_COUNTS };
          for (const item of statusRows.get(batch.id) ?? []) counts[item.status] = item.count;
          return [batch.id, counts] as const;
        });

        return {
          batches,
          itemCountsByBatchId: Object.fromEntries(itemCountEntries),
        };
      }),
    [ipId, refreshToken, space],
    {
      initialData: { batches: [], itemCountsByBatchId: {} },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取导入批次失败：${message}`;
      },
    }
  );
  const batches = data?.batches ?? [];
  const itemCountsByBatchId = data?.itemCountsByBatchId ?? {};

  return (
    <ScreenScaffold backgroundVariant="workflow" decorativeTitle="Batches" onBack={onBack} scrollable title="导入批次">
      <PageStateBlock
        emptyDescription="旧图片不会被强行补批次；这里会从下一次导入开始记录。"
        emptyIconName="file-tray-stacked-outline"
        emptyTitle="暂无导入批次"
        errorMessage={errorMessage}
        isEmpty={!isLoading && batches.length === 0}
        loading={isLoading}
        loadingDescription="正在读取本地 SQLite 中的新导入批次。"
        loadingTitle="读取导入批次"
        onRetry={reload}
      >
        <View style={styles.list}>
          {batches.map((batch) => {
            const percent = batch.activeCount > 0 ? Math.round((batch.organizedCount / batch.activeCount) * 100) : 100;
            const itemCounts = itemCountsByBatchId[batch.id] ?? EMPTY_ITEM_COUNTS;
            return (
              <Pressable key={batch.id} onPress={() => onOpenBatch(batch)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={styles.icon}>
                  <Ionicons color={colors.primary.active} name="file-tray-stacked-outline" size={18} />
                </View>
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={styles.title}>{batch.name}</Text>
                  <Text numberOfLines={1} style={styles.meta}>
                    {formatDateTime(batch.createdAt)} · {batch.activeCount} 张 · 整理度 {percent}%
                  </Text>
                  <View style={styles.factRow}>
                    <Text style={styles.fact}>未分组 {batch.ungroupedCount}</Text>
                    <Text style={styles.fact}>无标签 {batch.untaggedCount}</Text>
                    <Text style={styles.fact}>疑似重复 {batch.suspectedDuplicateCount}</Text>
                    <Text style={styles.fact}>成功 {itemCounts.success}</Text>
                    <Text style={styles.fact}>失败 {itemCounts.failed}</Text>
                    <Text style={styles.fact}>跳过 {itemCounts.skipped}</Text>
                  </View>
                </View>
                <Ionicons color={colors.text.secondary} name="chevron-forward" size={16} />
              </Pressable>
            );
          })}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: rhythm.listCardGap,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  copy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  meta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  factRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  fact: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
  pressed: {
    opacity: 0.78,
  },
});
