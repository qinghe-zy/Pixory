import { Ionicons } from '@expo/vector-icons';
import { Share, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { useToast } from '../components/AppToast';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import type { PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { deleteBackupExportEntry, listBackupExportEntries, type BackupExportEntry } from '../services/storageUsageService';
import { formatDateTime, formatFileSize } from '../utils/formatters';

interface BackupExportManagerScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
}

export function BackupExportManagerScreen({ space = 'normal', refreshToken, onBack }: BackupExportManagerScreenProps) {
  const { showToast } = useToast();
  const [activeEntry, setActiveEntry] = useState<BackupExportEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<BackupExportEntry | null>(null);
  const [selectedUris, setSelectedUris] = useState<string[]>([]);
  const [isBatchDeleteVisible, setIsBatchDeleteVisible] = useState(false);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<BackupExportEntry[]>(
    () => listBackupExportEntries(space),
    [space, refreshToken],
    {
      formatError: (error) => error instanceof Error ? `读取备份导出失败：${error.message}` : '读取备份导出失败',
      initialData: [],
    }
  );
  const entries = data ?? [];
  const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const typeStats = getTypeStats(entries);
  const isSelectionMode = selectedUris.length > 0;
  const selectedEntries = entries.filter((entry) => selectedUris.includes(entry.uri));

  function toggleSelection(entry: BackupExportEntry) {
    setSelectedUris((current) =>
      current.includes(entry.uri)
        ? current.filter((uri) => uri !== entry.uri)
        : [...current, entry.uri]
    );
  }

  function handleEntryPress(entry: BackupExportEntry) {
    if (isSelectionMode) {
      toggleSelection(entry);
      return;
    }
    setActiveEntry(entry);
  }

  async function handleShare(entry: BackupExportEntry) {
    try {
      await Share.share({
        message: entry.uri,
        url: entry.uri,
        title: entry.name,
      });
    } catch (error) {
      showToast(error instanceof Error ? `分享失败：${error.message}` : '分享失败');
    }
  }

  async function confirmDeleteBackup() {
    if (!deleteEntry) {
      return;
    }

    try {
      await deleteBackupExportEntry(space, deleteEntry.uri);
      setDeleteEntry(null);
      setActiveEntry(null);
      reload();
      showToast('已删除备份');
    } catch (error) {
      showToast(error instanceof Error ? `删除失败：${error.message}` : '删除失败');
    }
  }

  async function confirmBatchDeleteBackups() {
    const targets = [...selectedEntries];
    setIsBatchDeleteVisible(false);
    try {
      await Promise.all(targets.map((entry) => deleteBackupExportEntry(space, entry.uri)));
      setSelectedUris([]);
      reload();
      showToast(`已删除 ${targets.length} 个备份`);
    } catch (error) {
      showToast(error instanceof Error ? `批量删除失败：${error.message}` : '批量删除失败');
    }
  }

  const rightAction = entries.length > 0 ? (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (isSelectionMode) {
          setSelectedUris([]);
          return;
        }
        setSelectedUris([entries[0].uri]);
      }}
      style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
    >
      <Text style={styles.headerButtonText}>{isSelectionMode ? '完成' : '选择'}</Text>
    </Pressable>
  ) : undefined;

  const footer = isSelectionMode ? (
    <View style={styles.selectionBar}>
      <Text style={styles.selectionTitle}>已选择 {selectedEntries.length} 个备份</Text>
      <View style={styles.selectionActions}>
        <View style={styles.selectionActionSlot}>
          <PrimaryButton label={selectedEntries.length === entries.length ? '取消全选' : '全选'} onPress={() => setSelectedUris(selectedEntries.length === entries.length ? [] : entries.map((entry) => entry.uri))} variant="outline" />
        </View>
        <View style={styles.selectionActionSlot}>
          <PrimaryButton disabled={selectedEntries.length === 0} label="删除" onPress={() => setIsBatchDeleteVisible(true)} />
        </View>
      </View>
    </View>
  ) : undefined;

  return (
    <>
      <ScreenScaffold backgroundVariant="backup" decorativeTitle="Backup" footer={footer} onBack={onBack} rightAction={rightAction} scrollable title="备份与导出">
        <View style={styles.summary}>
          <Text style={styles.totalValue}>{formatFileSize(totalBytes)}</Text>
          <View style={styles.typeGrid}>
            <Metric label="完整备份" value={formatFileSize(typeStats.full)} />
            <Metric label="IP 备份" value={formatFileSize(typeStats.ip)} />
            <Metric label="加密包" value={formatFileSize(typeStats.encrypted)} />
            <Metric label="普通导出" value={formatFileSize(typeStats.normal)} />
          </View>
        </View>

        <View style={styles.filesSection}>
          <PageStateBlock
            emptyContainerStyle={styles.emptyStateWrap}
            emptyDescription="生成备份或导出包后，这里会显示文件占用。"
            emptyIconName="archive-outline"
            emptyTitle="没有备份导出"
            errorMessage={errorMessage}
            isEmpty={!isLoading && entries.length === 0}
            loading={isLoading}
            loadingDescription="正在读取备份导出文件。"
            loadingTitle="正在统计…"
            onRetry={reload}
          >
            <View style={styles.list}>
              {entries.map((entry) => {
                const selected = selectedUris.includes(entry.uri);
                return (
                  <Pressable
                    key={entry.uri}
                    onLongPress={() => toggleSelection(entry)}
                    onPress={() => handleEntryPress(entry)}
                    style={({ pressed }) => [styles.entryRow, selected && styles.entryRowSelected, pressed && styles.pressed]}
                  >
                    <View style={styles.entryIcon}>
                      <Ionicons color={colors.primary.active} name={entry.isEncrypted ? 'lock-closed-outline' : 'archive-outline'} size={19} />
                    </View>
                    <View style={styles.entryCopy}>
                      <Text numberOfLines={1} style={styles.entryName}>{entry.name}</Text>
                      <Text numberOfLines={1} style={styles.entryMeta}>
                        {formatFileSize(entry.sizeBytes)} · {entry.type} · {entry.createdAt ? formatDateTime(entry.createdAt) : '未知时间'}
                      </Text>
                    </View>
                    {isSelectionMode ? (
                      <Ionicons color={selected ? colors.primary.active : colors.text.tertiary} name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} />
                    ) : (
                      <Ionicons color={colors.text.tertiary} name="ellipsis-horizontal" size={18} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </PageStateBlock>
        </View>
      </ScreenScaffold>

      <AppActionSheet
        items={activeEntry ? [
          { key: 'detail', label: '详情', icon: 'information-circle-outline', meta: `${activeEntry.type} · ${formatFileSize(activeEntry.sizeBytes)}`, onPress: () => undefined },
          { key: 'share', label: '分享', icon: 'share-outline', onPress: () => void handleShare(activeEntry) },
          { key: 'delete', label: '删除', icon: 'trash-outline', danger: true, onPress: () => setDeleteEntry(activeEntry) },
        ] : []}
        message={activeEntry ? buildDetailText(activeEntry) : undefined}
        onClose={() => setActiveEntry(null)}
        title={activeEntry?.name ?? '备份详情'}
        visible={Boolean(activeEntry)}
      />
      <AppDialog
        danger
        onClose={() => setDeleteEntry(null)}
        onPrimary={confirmDeleteBackup}
        primaryLabel="删除"
        title="删除这个备份？"
        visible={Boolean(deleteEntry)}
      />
      <AppDialog
        danger
        message={`将删除 ${selectedEntries.length} 个备份文件。`}
        onClose={() => setIsBatchDeleteVisible(false)}
        onPrimary={confirmBatchDeleteBackups}
        primaryDisabled={selectedEntries.length === 0}
        primaryLabel="删除"
        title="删除所选备份？"
        visible={isBatchDeleteVisible}
      />
    </>
  );
}

function getTypeStats(entries: BackupExportEntry[]) {
  return entries.reduce(
    (stats, entry) => {
      if (entry.type === '完整备份') {
        stats.full += entry.sizeBytes;
      } else if (entry.type === 'IP备份') {
        stats.ip += entry.sizeBytes;
      } else if (entry.type === '加密包') {
        stats.encrypted += entry.sizeBytes;
      } else {
        stats.normal += entry.sizeBytes;
      }
      return stats;
    },
    { full: 0, ip: 0, encrypted: 0, normal: 0 }
  );
}

function buildDetailText(entry: BackupExportEntry): string {
  return [
    `${entry.type} · ${formatFileSize(entry.sizeBytes)}`,
    entry.createdAt ? formatDateTime(entry.createdAt) : '未知时间',
    entry.isEncrypted ? '已加密' : '未加密',
    `素材 ${entry.assetCount ?? '-'} · IP ${entry.ipCount ?? '-'}`,
  ].join('\n');
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing[3],
  },
  filesSection: {
    marginTop: spacing[6],
    paddingBottom: spacing[4],
  },
  emptyStateWrap: {
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[2],
  },
  totalValue: {
    color: colors.text.title,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 40,
  },
  typeGrid: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing[3],
    rowGap: spacing[3],
  },
  metric: {
    gap: 3,
    width: '50%',
  },
  metricLabel: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  metricValue: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '800',
  },
  list: {
    gap: spacing[2],
  },
  entryRow: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 62,
    padding: spacing[3],
  },
  entryRowSelected: {
    backgroundColor: colors.primary.background,
    borderColor: colors.primary.default,
  },
  entryIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.sm,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  entryCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  entryName: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  entryMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    minWidth: 56,
    paddingHorizontal: spacing[3],
  },
  headerButtonText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '800',
  },
  selectionBar: {
    gap: spacing[3],
  },
  selectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  selectionActionSlot: {
    flex: 1,
  },
  pressed: {
    opacity: 0.82,
  },
});
