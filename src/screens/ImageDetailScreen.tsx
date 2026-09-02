import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { AppScreen } from '../components/AppScreen';
import { ContentCard } from '../components/ContentCard';
import { Header } from '../components/Header';
import { SecureImage } from '../components/SecureImage';
import { TagChip } from '../components/TagChip';
import { getGroupTypeLabel } from '../constants/groups';
import { imageRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageDetailRecord, type ImageListItem, type PixorySpace, type TagRecord } from '../database';
import { colors, componentTokens, radius, rhythm, spacing, typography } from '../design/tokens';
import { getFileInfo } from '../services/fileStorageService';
import { saveImageToSystemAlbum } from '../services/mediaLibraryService';
import { devLog } from '../utils/dev';
import { formatImageAssetCode } from '../utils/imageAssetCode';
import { formatDateTime, formatFileSize, formatImageDimensions } from '../utils/formatters';
import type { ImageViewerContext } from '../navigation/imageViewerContext';
import { useToast } from '../components/AppToast';

interface ImageDetailScreenProps {
  imageId: number;
  space?: PixorySpace;
  context?: ImageViewerContext;
  refreshToken: number;
  onBack: () => void;
  onRefreshed: () => void;
  onEdit: (imageId: number) => void;
  onMoveGroup: (imageId: number) => void;
  onNavigateImage: (imageId: number, context?: ImageViewerContext) => void;
  onOpenViewer: (imageId: number, context?: ImageViewerContext) => void;
  onDeleted: () => void;
}

export function ImageDetailScreen({
  imageId,
  space = 'normal',
  context,
  refreshToken,
  onBack,
  onRefreshed,
  onEdit,
  onMoveGroup,
  onNavigateImage,
  onOpenViewer,
  onDeleted,
}: ImageDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { showToast, showUndoSnackbar } = useToast();
  const routeSpace = context?.space ?? space;
  const [image, setImage] = useState<ImageDetailRecord | null>(null);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [contextImages, setContextImages] = useState<ImageListItem[]>([]);
  const [isMoreSheetVisible, setIsMoreSheetVisible] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [isNoteExpanded, setIsNoteExpanded] = useState(false);
  const [fileAvailability, setFileAvailability] = useState<{ originalExists: boolean; thumbnailExists: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingToAlbum, setIsSavingToAlbum] = useState(false);
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const onRefreshedRef = useRef(onRefreshed);
  onRefreshedRef.current = onRefreshed;

  useEffect(() => () => onRefreshedRef.current(), []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [detail, tagItems] = await runWithDatabaseSpace(routeSpace, (db) => Promise.all([
          imageRepository.findDetailById(db, imageId),
          tagRepository.findByImageId(db, imageId),
        ]));

        if (!isMounted) {
          return;
        }

        if (!detail) {
          throw new Error('没有找到这张图片。');
        }

        const [groupItems, contextItems, originalInfo, thumbnailInfo] = await Promise.all([
          runWithDatabaseSpace(routeSpace, (db) => imageRepository.findGroupsByImageId(db, imageId)),
          context ? loadDetailContextImages(context) : Promise.resolve([]),
          getFileInfo(detail.originalFileUri),
          detail.thumbnailFileUri ? getFileInfo(detail.thumbnailFileUri) : Promise.resolve(null),
        ]);

        setImage(detail);
        setTags(tagItems);
        setGroups(groupItems);
        setContextImages(contextItems);
        setFileAvailability({
          originalExists: originalInfo.exists && !originalInfo.isDirectory,
          thumbnailExists: detail.thumbnailFileUri ? Boolean(thumbnailInfo?.exists && !thumbnailInfo.isDirectory) : true,
        });
        void runWithDatabaseSpace(routeSpace, (db) => imageRepository.touchLastViewedAt(db, imageId));
        devLog('Pixory image detail readback:', {
          imageId: detail.id,
          groupName: detail.groupName,
          tagNames: tagItems.map((tag) => tag.name),
          note: detail.note,
          isFavorite: detail.isFavorite,
          originalFileUri: detail.originalFileUri,
          thumbnailFileUri: detail.thumbnailFileUri,
        });
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取图片详情失败：${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [context, imageId, refreshToken, routeSpace]);

  const contextIndex = contextImages.findIndex((item) => item.id === imageId);
  const previousImage = contextIndex > 0 ? contextImages[contextIndex - 1] : null;
  const nextImage = contextIndex >= 0 && contextIndex < contextImages.length - 1 ? contextImages[contextIndex + 1] : null;

  const rightSlot = useMemo(
    () =>
      image ? (
        <Pressable
          accessibilityLabel={image.isFavorite ? '取消收藏' : '收藏'}
          onPress={handleToggleFavorite}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
        >
          <Ionicons
            color={image.isFavorite ? colors.semantic.favorite : colors.text.title}
            name={image.isFavorite ? 'star' : 'star-outline'}
            size={18}
          />
        </Pressable>
      ) : null,
    [image]
  );

  async function handleToggleFavorite() {
    if (!image || isUpdatingFavorite) {
      return;
    }

    setIsUpdatingFavorite(true);

    try {
      const updated = await runWithDatabaseSpace(routeSpace, (db) => imageRepository.updateFavorite(db, image.id, !image.isFavorite));

      if (updated) {
        setImage({
          ...image,
          isFavorite: updated.isFavorite,
          updatedAt: updated.updatedAt,
        });
        onRefreshed();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`收藏状态更新失败：${message}`);
    } finally {
      setIsUpdatingFavorite(false);
    }
  }

  function handleDelete() {
    if (!image) {
      return;
    }

    setIsDeleteDialogVisible(true);
  }

  async function confirmDelete() {
    if (!image) {
      return;
    }

    setIsDeleteDialogVisible(false);
    try {
      const deletedCount = await runWithDatabaseSpace(routeSpace, (db) => imageRepository.softDeleteMany(db, [image.id]));
      if (deletedCount === 0) {
        throw new Error('没有可删除的图片。');
      }

      const [originalInfo, thumbnailInfo] = await Promise.all([
        getFileInfo(image.originalFileUri),
        image.thumbnailFileUri ? getFileInfo(image.thumbnailFileUri) : Promise.resolve(null),
      ]);

      if (!originalInfo.exists || originalInfo.isDirectory) {
        throw new Error('软删除后原图文件不存在。');
      }

      if (image.thumbnailFileUri && (!thumbnailInfo?.exists || thumbnailInfo.isDirectory)) {
        throw new Error('软删除后缩略图文件不存在。');
      }

      const deletedImage = await runWithDatabaseSpace(routeSpace, (db) => imageRepository.findById(db, image.id, { includeDeleted: true }));
      devLog(
        'Pixory single delete verification JSON:',
        JSON.stringify({
          imageId: image.id,
          originalFileUri: image.originalFileUri,
          thumbnailFileUri: image.thumbnailFileUri,
          originalExists: originalInfo.exists && !originalInfo.isDirectory,
          thumbnailExists: image.thumbnailFileUri ? Boolean(thumbnailInfo?.exists && !thumbnailInfo.isDirectory) : true,
          originalSize: originalInfo.size,
          thumbnailSize: thumbnailInfo?.size ?? null,
          deletedAt: deletedImage?.deletedAt ?? null,
        })
      );

      showUndoSnackbar({
        message: '已移入回收站',
        onUndo: () => {
          void (async () => {
            await runWithDatabaseSpace(routeSpace, (db) => imageRepository.restoreMany(db, [image.id]));
            onRefreshed();
            showToast('已恢复');
          })();
        },
      });
      onDeleted();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`删除失败：${message}`);
    }
  }

  async function handleSaveToAlbum() {
    if (!image || isSavingToAlbum) {
      return;
    }

    setIsSavingToAlbum(true);

    try {
      await saveImageToSystemAlbum(image.originalFileUri);
      showToast('已保存到相册');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`保存相册失败：${message}`);
    } finally {
      setIsSavingToAlbum(false);
    }
  }

  async function handleCopyFileInfo() {
    if (!image) {
      return;
    }

    await Clipboard.setStringAsync(
      [
        `素材编号：${formatImageAssetCode(image)}`,
        `文件名：${image.originalFilename}`,
        `尺寸：${formatImageDimensions(image.width, image.height)}`,
        `大小：${formatFileSize(image.fileSize)}`,
        `MIME：${image.mimeType}`,
        `所属 IP：${image.ipName}`,
        `分组：${image.groupName ?? '未分组'}`,
        `原图路径：${image.originalFileUri}`,
        `缩略图路径：${image.thumbnailFileUri ?? '无'}`,
      ].join('\n')
    );
    showToast('文件信息已复制');
  }

  return (
    <AppScreen backgroundDimmed backgroundVariant="detail" scrollable>
      <Header onBack={onBack} rightSlot={rightSlot} title={image ? (image.originalFilename || image.internalFilename).replace(/\.[^.]+$/, '') : "图片详情"} />

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {isLoading && !image ? <Text style={styles.hint}>正在读取图片元数据…</Text> : null}

      {image ? (
        <>
          <Pressable
            accessibilityLabel="全屏查看原图"
            accessibilityRole="imagebutton"
            onPress={() => onOpenViewer(image.id, context)}
            style={({ pressed }) => [styles.previewWrap, pressed && styles.previewPressed]}
          >
            <SecureImage contentFit="contain" space={routeSpace} style={styles.previewImage} uri={image.originalFileUri} />
            <View style={styles.previewAction}>
              <Ionicons color={colors.text.inverse} name="expand-outline" size={15} />
              <Text style={styles.previewActionText}>查看原图</Text>
            </View>
          </Pressable>

          <ContentCard style={styles.detailCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>归属</Text>
              <Text numberOfLines={1} style={[styles.infoValue, styles.infoValueLong]}>
                {image.ipName} · {image.groupName ? (image.groupCount > 1 ? image.groupName : `${image.groupName} (${getGroupTypeLabel(image.groupType)})`) : '未分组'}
              </Text>
            </View>

            {tags.length > 0 ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>标签</Text>
                <Text numberOfLines={1} style={[styles.infoValue, styles.infoValueLong]}>
                  {tags.map((t) => t.name).join(' · ')}
                </Text>
              </View>
            ) : null}

            {image.note ? (
              <Pressable onPress={() => setIsNoteExpanded(!isNoteExpanded)} style={styles.infoRow}>
                <Text style={styles.infoLabel}>备注</Text>
                <Text numberOfLines={isNoteExpanded ? 0 : 1} style={[styles.infoValue, styles.infoValueLong, isNoteExpanded && styles.noteValueExpanded]}>
                  {image.note}
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>规格</Text>
              <Text numberOfLines={1} style={[styles.infoValue, styles.infoValueLong]}>
                {formatImageDimensions(image.width, image.height)} · {formatFileSize(image.fileSize)} · {image.mimeType?.split('/').pop()?.toUpperCase() || image.mimeType}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>文件</Text>
              <Text numberOfLines={1} selectable style={[styles.infoValue, styles.infoValueLong]}>
                {image.originalFilename}
              </Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>编号</Text>
              <Text numberOfLines={1} selectable style={[styles.infoValue, styles.infoValueLong]}>
                {formatImageAssetCode(image)}
              </Text>
            </View>

            <View style={[styles.infoRow, styles.infoRowLast]}>
              <Text style={styles.infoLabel}>收录</Text>
              <Text numberOfLines={1} style={[styles.infoValue, styles.infoValueLong]}>
                {formatDateTime(image.createdAt)}
              </Text>
            </View>
          </ContentCard>

          {contextImages.length > 1 ? (
            <View style={styles.navActions}>
              <Pressable disabled={!previousImage} onPress={() => previousImage ? onNavigateImage(previousImage.id, context) : undefined} style={[styles.navButton, !previousImage ? styles.disabled : null]}>
                <Text style={styles.navText}>上一张</Text>
              </Pressable>
              <Text style={styles.navCounter}>{contextIndex + 1} / {contextImages.length}</Text>
              <Pressable disabled={!nextImage} onPress={() => nextImage ? onNavigateImage(nextImage.id, context) : undefined} style={[styles.navButton, !nextImage ? styles.disabled : null]}>
                <Text style={styles.navText}>下一张</Text>
              </Pressable>
            </View>
          ) : null}

        </>
      ) : null}
      <AppActionSheet
        items={[
          { key: 'edit', label: '编辑信息', icon: 'create-outline', onPress: () => image && onEdit(image.id) },
          { key: 'save', label: isSavingToAlbum ? '保存中' : '保存到相册', icon: 'download-outline', disabled: isSavingToAlbum, onPress: handleSaveToAlbum },
          { key: 'copy-info', label: '复制文件信息', icon: 'copy-outline', meta: image ? `${formatImageDimensions(image.width, image.height)} · ${formatFileSize(image.fileSize)}` : undefined, onPress: () => void handleCopyFileInfo() },
          { key: 'delete', label: '删除到回收站', icon: 'trash-outline', danger: true, onPress: handleDelete },
        ]}
        onClose={() => setIsMoreSheetVisible(false)}
        title="更多操作"
        visible={isMoreSheetVisible}
      />
      <AppDialog
        danger
        message="删除后会进入回收站状态，原图和缩略图文件仍会保留在本地。"
        onClose={() => setIsDeleteDialogVisible(false)}
        onPrimary={confirmDelete}
        primaryLabel="确认删除"
        title="确认删除到回收站"
        visible={isDeleteDialogVisible}
      />
    </AppScreen>
  );
}

async function loadDetailContextImages(context: ImageViewerContext): Promise<ImageListItem[]> {
  return runWithDatabaseSpace(context.space, async (db) => {
    if (context.type === 'ip-recent') {
      return imageRepository.findRecentByIpId(db, context.ipId, context.limit);
    }
    if (context.type === 'import-batch') {
      return imageRepository.findByImportBatchId(db, context.importBatchId);
    }
    if (context.type === 'image-scope') {
      return imageRepository.findByIds(db, context.imageIds);
    }
    if (context.type === 'ip-all') {
      const filter = context.filter;
      if (filter.type === 'favorite') return imageRepository.findByIpId(db, context.ipId, { favoritesOnly: true });
      if (filter.type === 'ungrouped') return imageRepository.findByIpId(db, context.ipId, { ungroupedOnly: true });
      if (filter.type === 'untagged') return imageRepository.findByIpId(db, context.ipId, { untaggedOnly: true });
      if (filter.type === 'recent-viewed') return imageRepository.findByIpId(db, context.ipId, { recentlyViewedOnly: true, orderBy: 'lastViewedAtDesc' });
      if (filter.type === 'mime') return imageRepository.findByIpId(db, context.ipId, { mimeType: filter.mimeType });
      if (filter.type === 'aspect') return imageRepository.findByIpId(db, context.ipId, { aspectRatio: filter.aspectRatio });
      if (filter.type === 'size') return imageRepository.findByIpId(db, context.ipId, { minFileSize: filter.minFileSize, maxFileSize: filter.maxFileSize });
      if (filter.type === 'group') return imageRepository.findByGroupId(db, filter.groupId);
      if (filter.type === 'tag') return imageRepository.findByIpId(db, context.ipId, { tagId: filter.tagId });
      return imageRepository.findByIpId(db, context.ipId);
    }
    if (context.type === 'group') return imageRepository.findByGroupId(db, context.groupId);
    if (context.type === 'tag') return imageRepository.findByTagId(db, context.tagId);
    if (context.type === 'favorites') return imageRepository.findFavorites(db);
    return imageRepository.findRecentViewed(db);
  });
}

function PrimaryAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [actionStyles.button, pressed && actionStyles.pressed]}>
      <Ionicons color={colors.primary.default} name={icon} size={20} />
      <Text style={actionStyles.label}>{label}</Text>
    </Pressable>
  );
}



const actionStyles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    height: 42,
    justifyContent: 'center',
    width: '48.6%',
    paddingHorizontal: spacing[3],
  },
  pressed: {
    opacity: 0.82,
  },
  label: {
    ...typography.textStyles.micro,
    color: colors.primary.default,
    fontWeight: '500',
  },
});

const styles = StyleSheet.create({
  headerAction: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: componentTokens.iconButton.radius,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    width: componentTokens.iconButton.size,
  },
  pressed: {
    opacity: 0.82,
  },
  detailCard: {
    marginTop: 0,
  },
  imageTitleBlock: {
    gap: spacing[1],
  },
  titleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },

  previewWrap: {
    backgroundColor: colors.background.sunken,
    borderRadius: radius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  previewPressed: {
    opacity: 0.92,
  },
  previewImage: {
    aspectRatio: 1.33,
    width: '100%',
  },
  previewAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    bottom: spacing[3],
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 32,
    paddingHorizontal: spacing[3],
    position: 'absolute',
    right: spacing[3],
  },
  previewActionText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '500',
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  hint: {
    ...typography.textStyles.caption,
  },
  infoRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.border.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
  },
  infoRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  infoLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    width: 60,
  },
  infoValue: {
    ...typography.textStyles.body,
    color: colors.text.title,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  infoValueLong: {
    textAlign: 'left',
  },
  noteValueExpanded: {
    lineHeight: 22,
  },
  safetyPanel: {
    alignItems: 'center',
    backgroundColor: colors.semantic.successBackground,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[2],
  },
  safetyText: {
    ...typography.textStyles.micro,
    color: colors.text.body,
    flex: 1,
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.listCardGap,
  },
  navActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    justifyContent: 'space-between',
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  navText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '700',
  },
  navCounter: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  disabled: {
    opacity: 0.42,
  },
});
