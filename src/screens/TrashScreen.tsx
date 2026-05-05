import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { imageRepository, ipRepository, runWithDatabaseSpace, type ImageListItem, type IpRecord, type PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { clearTrash } from '../services/trashService';
import { formatDateTime } from '../utils/formatters';
import { useImageMultiSelect } from '../hooks/useImageMultiSelect';
import { useToast } from '../components/AppToast';

interface TrashScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onChanged: () => void;
}

export function TrashScreen({ space = 'normal', refreshToken, onBack, onChanged }: TrashScreenProps) {
  const { showToast } = useToast();
  const [activeIpId, setActiveIpId] = useState<number | null>(null);
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState(false);
  const [isClearDialogVisible, setIsClearDialogVisible] = useState(false);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ images: ImageListItem[]; ips: IpRecord[] }>(
    async () => {
      const [images, ips] = await runWithDatabaseSpace(space, () => Promise.all([
        activeIpId == null ? imageRepository.findDeleted() : imageRepository.findDeletedByIpId(activeIpId),
        ipRepository.findAllIncludingDeleted(),
      ]));
      return { images, ips };
    },
    [activeIpId, refreshToken, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取回收站失败：${message}`;
      },
      initialData: { images: [], ips: [] },
    }
  );
  const images = data?.images ?? [];
  const ips = data?.ips ?? [];
  const multiSelect = useImageMultiSelect(useMemo(() => images.map((image) => image.id), [images]));
  const selectedImages = useMemo(
    () => images.filter((image) => multiSelect.selectedImageIds.includes(image.id)),
    [images, multiSelect.selectedImageIds]
  );

  function handleRestore(imageId: number) {
    void (async () => {
      try {
        const restoredCount = await runWithDatabaseSpace(space, () => imageRepository.restoreMany([imageId]));
        if (restoredCount === 0) {
          throw new Error('没有可恢复的图片。');
        }

        onChanged();
        reload();
        showToast('已恢复');
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showToast(`恢复失败：${message}`);
      }
    })();
  }

  function handleRestoreSelected() {
    const ids = [...multiSelect.selectedImageIds];
    void (async () => {
      try {
        const restoredCount = await runWithDatabaseSpace(space, () => imageRepository.restoreMany(ids));
        if (restoredCount === 0) {
          throw new Error('没有可恢复的图片。');
        }
        multiSelect.clearSelection();
        onChanged();
        reload();
        showToast(`已恢复 ${restoredCount} 张`);
      } catch (error) {
        showToast(error instanceof Error ? `恢复失败：${error.message}` : '恢复失败');
      }
    })();
  }

  function confirmClearTrash() {
    setIsClearDialogVisible(false);
    void (async () => {
      try {
        const result = await clearTrash(space);
        multiSelect.clearSelection();
        onChanged();
        reload();

        if (result.databaseDeletedCount !== result.requestedCount) {
          showToast(`数据库已删除 ${result.databaseDeletedCount}/${result.requestedCount} 张，本地文件已保留待核验`);
          return;
        }

        if (result.fileFailures.length > 0) {
          showToast(`数据库已清空 ${result.databaseDeletedCount} 张，${result.fileFailures.length} 个文件需手动核验`);
          return;
        }

        showToast(`已永久删除 ${result.databaseDeletedCount} 张，清理 ${result.fileDeletedCount} 个文件`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        showToast(`清空回收站失败：${message}`);
      }
    })();
  }

  const rightAction =
    images.length > 0 ? (
      <Pressable onPress={() => setIsClearDialogVisible(true)} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
        <Ionicons color={colors.semantic.danger} name="trash-outline" size={18} />
      </Pressable>
    ) : undefined;
  const footer = multiSelect.isSelectionMode ? (
    <View style={styles.footerPanel}>
      <Text style={styles.footerTitle}>已选择 {selectedImages.length} 张</Text>
      <PrimaryButton label="批量恢复" onPress={handleRestoreSelected} />
      <PrimaryButton label="取消选择" onPress={multiSelect.clearSelection} variant="ghost" />
    </View>
  ) : undefined;

  return (
    <>
    <ScreenScaffold decorativeTitle="Trash" footer={footer} onBack={onBack} rightAction={rightAction} scrollable title="回收站">
      <Pressable onPress={() => setIsFilterSheetVisible(true)} style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}>
        <Text style={styles.filterText}>{activeIpId == null ? '全部 IP' : ips.find((ip) => ip.id === activeIpId)?.name ?? '当前 IP'}</Text>
        <Ionicons color={colors.text.secondary} name="chevron-down" size={14} />
      </Pressable>

      <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="当前没有处于软删除状态的图片。"
        emptyIconName="trash-outline"
        emptyTitle="回收站是空的"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="本地回收站索引读取完成后，这里会展示已软删除图片。"
        loadingTitle="正在读取回收站"
        onRetry={reload}
      >
        <View style={styles.list}>
          {images.map((image) => (
            <Pressable
              key={image.id}
              onLongPress={() => multiSelect.enterSelection(image.id)}
              onPress={() => multiSelect.isSelectionMode ? multiSelect.toggleSelection(image.id) : undefined}
              style={({ pressed }) => [styles.itemCard, multiSelect.selectedImageIds.includes(image.id) ? styles.selectedItem : null, pressed && styles.pressed]}
            >
              <View style={styles.previewWrap}>
                {image.thumbnailFileUri ? (
                  <Image resizeMode="cover" source={{ uri: image.thumbnailFileUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewFallback}>
                    <Ionicons color={colors.text.secondary} name="image-outline" size={22} />
                  </View>
                )}
                <View style={styles.remainingBadge}>
                  <Text style={styles.remainingText}>{getTrashStatusLabel(image.deletedAt)}</Text>
                </View>
              </View>
              <View style={styles.itemBody}>
                <Text numberOfLines={2} style={styles.itemTitle}>
                  {image.originalFilename}
                </Text>
                <Text style={styles.itemMeta}>
                  {image.deletedAt ? formatDateTime(image.deletedAt) : '未知时间'}
                </Text>
                <Pressable onPress={() => handleRestore(image.id)} style={({ pressed }) => [styles.restoreChip, pressed && styles.pressed]}>
                  <Text style={styles.restoreText}>恢复</Text>
                </Pressable>
              </View>
            </Pressable>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
    <AppActionSheet
      items={[
        { key: 'all', label: '全部 IP', icon: 'albums-outline', onPress: () => setActiveIpId(null) },
        ...ips.map((ip) => ({ key: String(ip.id), label: ip.name, icon: 'archive-outline' as const, onPress: () => setActiveIpId(ip.id) })),
      ]}
      onClose={() => setIsFilterSheetVisible(false)}
      title="按 IP 筛选"
      visible={isFilterSheetVisible}
    />
    <AppDialog
      danger
      message="清空后会永久删除回收站中的原图、缩略图和数据库记录，这个操作不可撤销。"
      onClose={() => setIsClearDialogVisible(false)}
      onPrimary={confirmClearTrash}
      primaryLabel="永久删除"
      title="确认清空回收站"
      visible={isClearDialogVisible}
    />
    </>
  );
}

function getTrashStatusLabel(deletedAt: string | null) {
  if (!deletedAt) {
    return '文件保留';
  }

  const deletedTime = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedTime)) {
    return '文件保留';
  }

  return '待清空';
}

const styles = StyleSheet.create({
  notice: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  subtitle: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    flex: 1,
    minWidth: 0,
  },
  list: {
    gap: spacing[2],
  },
  filterButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 32,
    paddingHorizontal: spacing[3],
  },
  filterText: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    fontWeight: '600',
  },
  itemCard: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[2],
  },
  selectedItem: {
    borderColor: colors.primary.default,
    backgroundColor: colors.primary.weak,
  },
  previewWrap: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    aspectRatio: 1,
    overflow: 'hidden',
    width: 72,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  remainingBadge: {
    backgroundColor: colors.overlay.softSurface,
    borderRadius: radius.sm,
    bottom: spacing[1],
    left: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    position: 'absolute',
    right: spacing[1],
  },
  remainingText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '600',
    textAlign: 'center',
  },
  itemBody: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  itemTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.body,
  },
  itemMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: {
    opacity: 0.82,
  },
  restoreChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    marginTop: spacing[1],
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing[1],
  },
  restoreText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '600',
  },
  footerPanel: {
    gap: spacing[2],
  },
  footerTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
});
