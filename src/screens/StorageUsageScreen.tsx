import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '../components/AppToast';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import type { PixorySpace } from '../database';
import { colors, layout, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { cleanupAppCache } from '../services/cacheCleanupService';
import { rebuildAllPreviews, regenerateMissingPreviews } from '../services/previewMaintenanceService';
import { getStorageUsageSummary, type StorageUsageSummary, type StorageUsageSummaryItem } from '../services/storageUsageService';
import { formatDateTime, formatFileSize } from '../utils/formatters';

interface StorageUsageScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onOpenOriginals: () => void;
  onOpenBackups: () => void;
  onOpenTrash: () => void;
}

const DASHBOARD_CATEGORY_LABELS = ['原始素材', '预览缓存', '临时缓存', '备份导出', '回收站'] as const;

export function StorageUsageScreen({
  space = 'normal',
  refreshToken,
  onBack,
  onOpenOriginals,
  onOpenBackups,
  onOpenTrash,
}: StorageUsageScreenProps) {
  const { showToast } = useToast();
  const [previewPanelVisible, setPreviewPanelVisible] = useState(false);
  const [temporaryPanelVisible, setTemporaryPanelVisible] = useState(false);
  const [previewConfirmMode, setPreviewConfirmMode] = useState<'missing' | 'all' | null>(null);
  const [isPreviewWorking, setIsPreviewWorking] = useState(false);
  const [isCleaningTemporary, setIsCleaningTemporary] = useState(false);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<StorageUsageSummary>(
    () => getStorageUsageSummary(space),
    [space, refreshToken],
    {
      formatError: (error) => error instanceof Error ? `统计存储失败：${error.message}` : '统计存储失败',
    }
  );

  function handleItemPress(item: StorageUsageSummaryItem) {
    if (item.key === 'original-assets') {
      onOpenOriginals();
      return;
    }
    if (item.key === 'preview-cache') {
      setPreviewPanelVisible(true);
      return;
    }
    if (item.key === 'temporary-cache') {
      setTemporaryPanelVisible(true);
      return;
    }
    if (item.key === 'backup-export') {
      onOpenBackups();
      return;
    }
    if (item.key === 'trash') {
      onOpenTrash();
    }
  }

  async function handleCleanTemporaryCache() {
    setIsCleaningTemporary(true);
    try {
      const result = await cleanupAppCache({
        includeDiskImageCache: true,
        includeExpoCacheDirectory: true,
        tempMaxAgeMs: 0,
      });
      setTemporaryPanelVisible(false);
      reload();
      showToast(`已释放 ${formatFileSize(result.deletedBytes)}`);
    } catch (error) {
      showToast(error instanceof Error ? `清理失败：${error.message}` : '清理失败');
    } finally {
      setIsCleaningTemporary(false);
    }
  }

  function requestPreviewAction(mode: 'missing' | 'all') {
    setPreviewPanelVisible(false);
    setPreviewConfirmMode(mode);
  }

  async function handlePreviewAction() {
    const mode = previewConfirmMode;
    if (!mode) {
      return;
    }

    setIsPreviewWorking(true);
    try {
      const result = mode === 'missing'
        ? await regenerateMissingPreviews(space)
        : await rebuildAllPreviews(space);
      setPreviewConfirmMode(null);
      setPreviewPanelVisible(false);
      reload();
      showToast(result.failedCount > 0 ? `已处理 ${result.processedCount} 项，${result.failedCount} 项失败` : `已处理 ${result.processedCount} 项预览`);
    } catch (error) {
      showToast(error instanceof Error ? `重建失败：${error.message}` : '重建失败');
    } finally {
      setIsPreviewWorking(false);
    }
  }

  const summary = data;
  const storageItems = summary
    ? summary.items.filter((item) => DASHBOARD_CATEGORY_LABELS.some((label) => label === item.label))
    : [];

  return (
    <>
      <ScreenScaffold
        backgroundVariant="profile"
        decorativeTitle="Storage"
        errorMessage={errorMessage}
        onBack={onBack}
        rightAction={(
          <Pressable accessibilityRole="button" onPress={reload} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
            <Ionicons color={colors.primary.default} name="refresh-outline" size={18} />
          </Pressable>
        )}
        scrollable
        title="存储"
      >
        <PageStateBlock
          emptyDescription="还没有统计到本地素材占用。"
          emptyIconName="pie-chart-outline"
          emptyTitle="暂无存储数据"
          errorMessage={errorMessage}
          isEmpty={!isLoading && !summary}
          loading={isLoading}
          loadingDescription="正在统计…"
          loadingTitle="正在统计…"
          onRetry={reload}
        >
          {summary ? (
            <View style={styles.pageBody}>
              <View style={styles.overview}>
                <View style={styles.metricRow}>
                  <Text adjustsFontSizeToFit numberOfLines={1} style={styles.totalValue}>
                    {formatFileSize(summary.totalBytes)}
                  </Text>
                  <View style={styles.deltaBlock}>
                    {summary.previousTotalBytes == null ? (
                      <Text style={styles.deltaText}>首次统计</Text>
                    ) : (
                      <>
                        <Text numberOfLines={1} style={styles.deltaText}>
                          较上次统计 {formatSignedBytes(summary.totalBytes - summary.previousTotalBytes)}
                        </Text>
                        <Text numberOfLines={1} style={styles.deltaDate}>
                          上次 {summary.previousScannedAt ? formatDateTime(summary.previousScannedAt) : '未知时间'}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
                <SegmentBar summary={summary} />
              </View>

              <View style={styles.storageList}>
                {storageItems.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    key={item.key}
                    onPress={() => handleItemPress(item)}
                    style={({ pressed }) => [styles.storageRow, pressed && styles.pressed]}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.rowLabel}>{item.label}</Text>
                      <Text numberOfLines={1} style={styles.rowSubtitle}>{getItemSubtitle(summary, item)}</Text>
                    </View>
                    <Text adjustsFontSizeToFit numberOfLines={1} style={styles.rowBytes}>{formatFileSize(item.bytes)}</Text>
                    <Text style={styles.actionText}>{item.actionLabel}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </PageStateBlock>
      </ScreenScaffold>

      <PreviewCachePanel
        disabled={isPreviewWorking}
        onClose={() => setPreviewPanelVisible(false)}
        onRebuildAll={() => requestPreviewAction('all')}
        onRegenerateMissing={() => requestPreviewAction('missing')}
        summary={summary}
        visible={previewPanelVisible}
      />
      <TemporaryCachePanel
        disabled={isCleaningTemporary}
        onClean={handleCleanTemporaryCache}
        onClose={() => setTemporaryPanelVisible(false)}
        summary={summary}
        visible={temporaryPanelVisible}
      />
      <PreviewRebuildConfirmPanel
        disabled={isPreviewWorking}
        onClose={() => {
          if (!isPreviewWorking) {
            setPreviewConfirmMode(null);
          }
        }}
        onRebuild={handlePreviewAction}
        visible={previewConfirmMode != null}
      />
    </>
  );
}

function getItemSubtitle(summary: StorageUsageSummary, item: StorageUsageSummaryItem): string {
  if (item.key === 'original-assets') {
    return `${summary.imageCount} 张图片 · ${summary.videoCount} 个视频`;
  }
  if (item.key === 'preview-cache') {
    return `图片缩略图 ${formatFileSize(summary.previewImageBytes)} · 视频封面 ${formatFileSize(summary.previewVideoBytes)}`;
  }
  if (item.key === 'temporary-cache') {
    return `${formatFileSize(summary.temporaryBytes)} 可释放`;
  }
  if (item.key === 'backup-export') {
    return `${summary.backupExportCount} 个备份包`;
  }
  return `${summary.trashCount} 项`;
}

function formatSignedBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  return `${bytes > 0 ? '+' : '-'}${formatFileSize(Math.abs(bytes))}`;
}

function SegmentBar({ summary }: { summary: StorageUsageSummary }) {
  const values = [
    { key: 'original', bytes: summary.originalBytes, color: colors.primary.default },
    { key: 'backup', bytes: summary.backupExportBytes, color: colors.semantic.warning },
    { key: 'preview', bytes: summary.previewBytes, color: colors.semantic.success },
    { key: 'temporary', bytes: summary.temporaryBytes, color: colors.text.tertiary },
  ];
  const total = Math.max(1, summary.totalBytes);

  return (
    <View style={styles.segmentTrack}>
      {values.map((item) => (
        <View
          key={item.key}
          style={[
            styles.segment,
            {
              backgroundColor: item.color,
              flexGrow: Math.max(0.4, item.bytes / total),
            },
          ]}
        />
      ))}
    </View>
  );
}

function PreviewCachePanel({
  disabled,
  onClose,
  onRebuildAll,
  onRegenerateMissing,
  summary,
  visible,
}: {
  disabled: boolean;
  onClose: () => void;
  onRebuildAll: () => void;
  onRegenerateMissing: () => void;
  summary?: StorageUsageSummary;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetOverlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[12] + spacing[4] }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>预览缓存</Text>
          <Text style={styles.sheetValue}>{formatFileSize(summary?.previewBytes ?? 0)}</Text>
          <View style={styles.sheetRows}>
            <MetricLine label="图片缩略图" value={formatFileSize(summary?.previewImageBytes ?? 0)} />
            <MetricLine label="视频封面" value={formatFileSize(summary?.previewVideoBytes ?? 0)} />
          </View>
          <View style={styles.previewActions}>
            <PanelButton disabled={disabled} label="重新生成缺失预览" onPress={onRegenerateMissing} />
            <PanelButton disabled={disabled} label="清空并重建预览" onPress={onRebuildAll} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TemporaryCachePanel({
  disabled,
  onClean,
  onClose,
  summary,
  visible,
}: {
  disabled: boolean;
  onClean: () => void;
  onClose: () => void;
  summary?: StorageUsageSummary;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetOverlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[12] + spacing[4] }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>临时缓存</Text>
          <Text style={styles.sheetValue}>{formatFileSize(summary?.temporaryBytes ?? 0)} 可释放</Text>
          <View style={styles.confirmCopy}>
            <Text style={styles.confirmTitle}>清理临时缓存？</Text>
            <Text style={styles.confirmText}>不会影响已导入素材。</Text>
          </View>
          <View style={styles.sheetRows}>
            <Text style={styles.cacheKind}>导入临时文件</Text>
            <Text style={styles.cacheKind}>资源包选择缓存</Text>
            <Text style={styles.cacheKind}>图片显示缓存</Text>
          </View>
          <View style={styles.sheetActions}>
            <PanelButton fill label="取消" onPress={onClose} variant="ghost" />
            <PanelButton disabled={disabled} fill label={disabled ? '清理中…' : '清理'} onPress={onClean} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PreviewRebuildConfirmPanel({
  disabled,
  onClose,
  onRebuild,
  visible,
}: {
  disabled: boolean;
  onClose: () => void;
  onRebuild: () => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetOverlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[12] + spacing[4] }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.confirmCopy}>
            <Text style={styles.sheetTitle}>重建预览缓存？</Text>
            <Text style={styles.confirmText}>可能需要一些时间。</Text>
          </View>
          <View style={styles.sheetActions}>
            <PanelButton disabled={disabled} fill label="取消" onPress={onClose} variant="ghost" />
            <PanelButton disabled={disabled} fill label={disabled ? '处理中…' : '重建'} onPress={onRebuild} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricLine}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function PanelButton({ disabled, fill = false, label, onPress, variant = 'default' }: { disabled?: boolean; fill?: boolean; label: string; onPress: () => void; variant?: 'default' | 'ghost' }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.panelButton, fill && styles.panelButtonFill, variant === 'ghost' && styles.panelButtonGhost, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={[styles.panelButtonText, variant === 'ghost' && styles.panelButtonGhostText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pageBody: {
    gap: spacing[5],
  },
  overview: {
    gap: spacing[4],
    paddingTop: spacing[1],
  },
  metricRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
    minHeight: 64,
  },
  totalValue: {
    color: colors.text.title,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 48,
    maxWidth: '58%',
  },
  deltaBlock: {
    alignItems: 'flex-end',
    flex: 1,
    gap: 2,
    paddingBottom: 4,
  },
  deltaText: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    fontWeight: '700',
    textAlign: 'right',
  },
  deltaDate: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    textAlign: 'right',
  },
  segmentTrack: {
    backgroundColor: colors.background.input,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 2,
    height: 10,
    overflow: 'hidden',
    width: '100%',
  },
  segment: {
    minWidth: 4,
  },
  storageList: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  storageRow: {
    alignItems: 'center',
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 66,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  rowText: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minWidth: 0,
  },
  rowLabel: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  rowBytes: {
    color: colors.text.body,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    minWidth: 96,
    textAlign: 'right',
  },
  rowSubtitle: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  actionText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '700',
    minWidth: 34,
    textAlign: 'right',
  },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sheetOverlay: {
    backgroundColor: 'rgba(22, 30, 40, 0.32)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background.page,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    gap: spacing[3],
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[2],
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.border.strong,
    borderRadius: radius.pill,
    height: 4,
    width: 38,
  },
  sheetTitle: {
    ...typography.textStyles.navTitle,
    color: colors.text.title,
  },
  sheetValue: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
  },
  sheetRows: {
    gap: spacing[2],
  },
  confirmCopy: {
    gap: 2,
  },
  confirmTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  confirmText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  metricLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  metricValue: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '700',
  },
  cacheKind: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  previewActions: {
    gap: spacing[2],
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  panelButton: {
    alignItems: 'center',
    backgroundColor: colors.primary.default,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  panelButtonFill: {
    flex: 1,
  },
  panelButtonGhost: {
    backgroundColor: colors.background.input,
  },
  panelButtonText: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: '700',
  },
  panelButtonGhostText: {
    color: colors.text.body,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.82,
  },
});
