import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SecureImage } from '../components/SecureImage';
import { imageRepository, runWithDatabaseSpace, type DuplicateImageGroup, type PixorySpace } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { runDuplicateDetectionScan } from '../services/duplicateDetectionService';
import { formatFileSize } from '../utils/formatters';

interface DuplicateReviewScreenProps {
  importBatchId?: number | null;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
}

export function DuplicateReviewScreen({ importBatchId, space = 'normal', refreshToken, onBack }: DuplicateReviewScreenProps) {
  const [activeTab, setActiveTab] = useState<'exact' | 'similar'>('exact');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ exact: DuplicateImageGroup[]; similar: DuplicateImageGroup[] }>(
    () => runWithDatabaseSpace(space, (db) => Promise.all([
      imageRepository.findExactDuplicateGroups(db, importBatchId != null ? { importBatchId } : undefined),
      imageRepository.findSimilarImageGroups(db, importBatchId != null ? { importBatchId } : undefined),
    ]).then(([exact, similar]) => ({ exact, similar }))),
    ['DuplicateReviewScreen', importBatchId, refreshToken, space],
    {
      initialData: { exact: [], similar: [] },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取疑似重复失败：${message}`;
      },
    }
  );
  const groups = data?.[activeTab] ?? [];
  const duplicateCount = groups.reduce((total, group) => total + group.images.length, 0);
  const selectedCount = selectedIds.length;

  function toggleSelected(imageId: number) {
    setSelectedIds((current) => (current.includes(imageId) ? current.filter((id) => id !== imageId) : [...current, imageId]));
  }

  async function softDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }
    await runWithDatabaseSpace(space, (db) => imageRepository.softDeleteMany(db, selectedIds));
    setSelectedIds([]);
    reload();
  }

  async function keepFirstAndSoftDeleteRest(group: DuplicateImageGroup) {
    const [, ...rest] = group.images;
    const restIds = rest.map((image) => image.id);
    if (restIds.length === 0) {
      return;
    }
    await runWithDatabaseSpace(space, (db) => imageRepository.softDeleteMany(db, restIds));
    reload();
  }

  async function scanDuplicateHashes() {
    setIsScanning(true);
    setScanMessage(null);
    try {
      const result = await runDuplicateDetectionScan(space);
      setScanMessage(`已处理 ${result.processedCount} 个素材，精确重复 ${result.exactGroupCount} 组，相似图片 ${result.similarGroupCount} 组。`);
      reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setScanMessage(`扫描失败：${message}`);
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <ScreenScaffold backgroundColor="#f9f9f9" decorativeTitle="Duplicate" onBack={onBack} scrollable title={importBatchId != null ? '疑似重复' : '重复检测'}>
      <View style={styles.contentStack}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons color="#1a1c1c" name="copy-outline" size={20} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{activeTab === 'exact' ? '精确重复' : '相似图片'} {duplicateCount} 张</Text>
          </View>
          <Pressable disabled={isScanning} onPress={() => void scanDuplicateHashes()} style={({ pressed }) => [styles.scanButton, isScanning && styles.scanButtonBusy, pressed && !isScanning && styles.pressed]}>
            <Ionicons color={'#FFFFFF'} name="scan-outline" size={14} />
            <Text style={styles.scanButtonText}>{isScanning ? '扫描中' : '扫描重复素材'}</Text>
          </Pressable>
        </View>
        {scanMessage ? <Text style={styles.scanMessage}>{scanMessage}</Text> : null}
        <View style={styles.tabs}>
          <TabButton active={activeTab === 'exact'} label="精确重复" onPress={() => { setActiveTab('exact'); setSelectedIds([]); }} />
          <TabButton active={activeTab === 'similar'} label="相似图片" onPress={() => { setActiveTab('similar'); setSelectedIds([]); }} />
        </View>
        {selectedCount > 0 ? (
          <View style={styles.reviewActions}>
            <Text style={styles.reviewActionMeta}>已选择 {selectedCount} 张</Text>
            <Pressable onPress={() => void softDeleteSelected()} style={({ pressed }) => [styles.deleteSelectedButton, pressed && styles.pressed]}>
              <Text style={styles.deleteSelectedText}>软删除选中</Text>
            </Pressable>
          </View>
        ) : null}

        <PageStateBlock
          emptyDescription={activeTab === 'exact' ? '暂时没有完全相同的素材。' : '暂时没有需要复核的相似图片。'}
          emptyIconName="checkmark-circle-outline"
          emptyTitle="没有疑似重复"
          errorMessage={errorMessage}
          isEmpty={!isLoading && groups.length === 0}
          loading={isLoading}
          loadingDescription="正在读取重复素材。"
          loadingTitle="读取疑似重复"
          onRetry={reload}
        >
          <View style={styles.groupList}>
            {groups.map((group) => (
              <View key={group.key} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <View style={styles.groupTitleRow}>
                    <Text style={styles.groupTitle}>{group.images.length} 张{activeTab === 'exact' ? '精确重复' : '相似图片'}</Text>
                    {activeTab === 'exact' ? (
                      <Pressable onPress={() => void keepFirstAndSoftDeleteRest(group)} style={({ pressed }) => [styles.keepButton, pressed && styles.pressed]}>
                        <Text style={styles.keepButtonText}>保留一张</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <View style={styles.imageList}>
                  {group.images.map((image) => (
                    <Pressable key={image.id} onPress={() => toggleSelected(image.id)} style={({ pressed }) => [styles.imageRow, selectedIds.includes(image.id) ? styles.imageRowSelected : null, pressed && styles.pressed]}>
                      <View style={styles.thumb}>
                        {image.thumbnailFileUri ? (
                          <SecureImage contentFit="cover" space={space} style={styles.thumbImage} uri={image.thumbnailFileUri} />
                        ) : (
                          <Ionicons color="#747878" name="image-outline" size={16} />
                        )}
                      </View>
                      <View style={styles.imageCopy}>
                        <Text numberOfLines={1} style={styles.filename}>{image.originalFilename}</Text>
                        <Text numberOfLines={1} style={styles.imageMeta}>{image.ipName} · {image.groupName ?? '未分组'} · {image.width} x {image.height} · {formatFileSize(image.fileSize)}</Text>
                      </View>
                      <Ionicons color={selectedIds.includes(image.id) ? "#000000" : "#747878"} name={selectedIds.includes(image.id) ? 'checkmark-circle' : 'ellipse-outline'} size={18} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </PageStateBlock>
      </View>
    </ScreenScaffold>
  );
}

function TabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tabButton, active ? styles.tabButtonActive : null, pressed && styles.pressed]}>
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  contentStack: {
    gap: rhythm.screenSectionGap,
  },
  hero: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e8e8e8',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[2],
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: '#f3f3f4',
    borderRadius: radius.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  heroCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  heroTitle: {
    ...typography.textStyles.body,
    color: '#1a1c1c',
    fontSize: 19,
    lineHeight: 24,
  },
  scanButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
    flexDirection: 'row',
    gap: spacing[1],
    height: 48,
    paddingHorizontal: 24,
  },
  scanButtonBusy: {
    opacity: 0.72,
  },
  scanButtonText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  scanMessage: {
    ...typography.textStyles.caption,
    color: '#747878',
  },
  groupList: {
    gap: rhythm.screenSectionGap,
  },
  groupCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e8e8e8',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.listCardGap,
    padding: spacing[4],
  },
  groupHeader: {
    gap: rhythm.microGap,
  },
  groupTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  groupTitle: {
    ...typography.textStyles.bodyStrong,
    color: '#1a1c1c',
  },
  imageList: {
    gap: rhythm.entryCardGap,
  },
  imageRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 62,
    paddingHorizontal: 24,
    paddingVertical: spacing[2],
  },
  imageRowSelected: {
    backgroundColor: '#f3f3f4',
  },
  thumb: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: radius.sm,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 46,
  },
  thumbImage: {
    height: '100%',
    width: '100%',
  },
  imageCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  filename: {
    ...typography.textStyles.caption,
    color: '#1a1c1c',
    fontWeight: '600',
  },
  imageMeta: {
    ...typography.textStyles.micro,
    color: '#747878',
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  tabButton: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e8e8e8', borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 32,
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#f3f3f4',
    borderColor: '#000000',
  },
  tabText: {
    ...typography.textStyles.caption,
    color: '#747878',
    fontWeight: '700',
  },
  tabTextActive: { color: '#000000' },
  reviewActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
  },
  reviewActionMeta: {
    ...typography.textStyles.caption,
    color: '#747878',
  },
  deleteSelectedButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
    justifyContent: 'center',
    height: 48,
    paddingHorizontal: 24,
  },
  deleteSelectedText: {
    ...typography.textStyles.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  keepButton: {
    backgroundColor: '#000000',
    borderRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  keepButtonText: {
    ...typography.textStyles.micro,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
});



