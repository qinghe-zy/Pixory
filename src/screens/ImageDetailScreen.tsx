import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { AppScreen } from '../components/AppScreen';
import { ContentCard } from '../components/ContentCard';
import { Header } from '../components/Header';
import { TagChip } from '../components/TagChip';
import { getGroupTypeLabel } from '../constants/groups';
import { imageRepository, tagRepository, type GroupRecord, type ImageDetailRecord, type ImageListItem, type TagRecord } from '../database';
import { colors, componentTokens, radius, spacing, typography } from '../design/tokens';
import { getFileInfo } from '../services/fileStorageService';
import { saveImageToSystemAlbum } from '../services/mediaLibraryService';
import { devLog } from '../utils/dev';
import { formatDateTime, formatFileSize, formatImageDimensions } from '../utils/formatters';
import type { ImageViewerContext } from '../navigation/imageViewerContext';
import { useToast } from '../components/AppToast';

interface ImageDetailScreenProps {
  imageId: number;
  context?: ImageViewerContext;
  refreshToken: number;
  onBack: () => void;
  onRefreshed: () => void;
  onEdit: (imageId: number) => void;
  onMoveGroup: (imageId: number) => void;
  onNavigateImage: (imageId: number, context?: ImageViewerContext) => void;
  onDeleted: () => void;
}

export function ImageDetailScreen({
  imageId,
  context,
  refreshToken,
  onBack,
  onRefreshed,
  onEdit,
  onMoveGroup,
  onNavigateImage,
  onDeleted,
}: ImageDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [image, setImage] = useState<ImageDetailRecord | null>(null);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [contextImages, setContextImages] = useState<ImageListItem[]>([]);
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false);
  const [isMoreSheetVisible, setIsMoreSheetVisible] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [previewResizeMode, setPreviewResizeMode] = useState<'contain' | 'cover'>('contain');
  const [fileAvailability, setFileAvailability] = useState<{ originalExists: boolean; thumbnailExists: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingToAlbum, setIsSavingToAlbum] = useState(false);
  const [isUpdatingFavorite, setIsUpdatingFavorite] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [detail, tagItems] = await Promise.all([
          imageRepository.findDetailById(imageId),
          tagRepository.findByImageId(imageId),
        ]);

        if (!isMounted) {
          return;
        }

        if (!detail) {
          throw new Error('没有找到这张图片。');
        }

        const [groupItems, contextItems, originalInfo, thumbnailInfo] = await Promise.all([
          imageRepository.findGroupsByImageId(imageId),
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
        void imageRepository.touchLastViewedAt(imageId);
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
  }, [context, imageId, refreshToken]);

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
      const updated = await imageRepository.updateFavorite(image.id, !image.isFavorite);

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
      const deletedCount = await imageRepository.softDeleteMany([image.id]);
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

      const deletedImage = await imageRepository.findById(image.id, { includeDeleted: true });
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

      showToast({
        message: '已移入回收站',
        actionLabel: '撤销',
        durationMs: 5200,
        onAction: () => {
          void (async () => {
            await imageRepository.restoreMany([image.id]);
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
    <AppScreen scrollable>
      <Header onBack={onBack} rightSlot={rightSlot} title="图片详情" />

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {isLoading && !image ? <Text style={styles.hint}>正在读取图片元数据…</Text> : null}

      {image ? (
        <>
          <Pressable
            accessibilityLabel="全屏查看原图"
            accessibilityRole="imagebutton"
            onPress={() => setIsFullScreenOpen(true)}
            style={({ pressed }) => [styles.previewWrap, pressed && styles.previewPressed]}
          >
            <Image resizeMode={previewResizeMode} source={{ uri: image.originalFileUri }} style={styles.previewImage} />
            <View style={styles.previewAction}>
              <Ionicons color={colors.text.inverse} name="expand-outline" size={15} />
              <Text style={styles.previewActionText}>查看原图</Text>
            </View>
          </Pressable>
          <View style={styles.previewModeRow}>
            <PreviewModeButton active={previewResizeMode === 'contain'} label="适应" onPress={() => setPreviewResizeMode('contain')} />
            <PreviewModeButton active={previewResizeMode === 'cover'} label="填充" onPress={() => setPreviewResizeMode('cover')} />
          </View>

          <ContentCard style={styles.detailCard}>
            <View style={styles.imageTitleBlock}>
              <View style={styles.titleLine}>
                <Text adjustsFontSizeToFit minimumFontScale={0.86} numberOfLines={2} style={styles.imageTitle}>
                  {image.originalFilename.replace(/\.[^.]+$/, '')}
                </Text>
                <Ionicons color={image.isFavorite ? colors.semantic.favorite : colors.text.tertiary} name={image.isFavorite ? 'star' : 'star-outline'} size={18} />
              </View>
              <Text numberOfLines={2} style={styles.imageSubtitle}>
                IP：{image.ipName}　　分组：{image.groupName ?? '未分组'}
              </Text>
            </View>
            <View style={styles.tagsWrap}>
              {groups.length > 0 ? groups.map((group) => <TagChip key={`group-${group.id}`} label={group.name} />) : <TagChip label="未分组" />}
              {tags.length > 0 ? tags.map((tag) => <TagChip key={tag.id} label={tag.name} />) : <Text style={styles.infoValue}>暂无标签</Text>}
            </View>
            <View style={styles.safetyPanel}>
              <Ionicons
                color={fileAvailability?.originalExists === false ? colors.semantic.danger : colors.semantic.success}
                name={fileAvailability?.originalExists === false ? 'warning-outline' : 'shield-checkmark-outline'}
                size={16}
              />
              <Text style={styles.safetyText}>
                {fileAvailability?.originalExists === false
                  ? '原图文件当前不可用，请检查本机存储或备份状态。'
                  : '原图已保存到 Pixory 本地私有存储；缩略图是独立预览文件，不压缩、不重编码。'}
              </Text>
            </View>
            <View style={styles.noteBlock}>
              <Text style={styles.infoLabel}>备注</Text>
              <Text numberOfLines={6} style={[styles.infoValue, styles.noteValue]}>{image.note || '暂无备注'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>所属 IP</Text>
              <Text style={[styles.infoValue, styles.infoValueLong]}>{image.ipName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>所在分组</Text>
              <Text style={[styles.infoValue, styles.infoValueLong]}>
                {image.groupName
                  ? image.groupCount > 1
                    ? image.groupName
                    : `${image.groupName} · ${getGroupTypeLabel(image.groupType)}`
                  : '未分组'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>文件名</Text>
              <Text style={[styles.infoValue, styles.infoValueLong]}>{image.originalFilename}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>尺寸</Text>
              <Text numberOfLines={1} style={styles.infoValue}>{formatImageDimensions(image.width, image.height)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>大小</Text>
              <Text numberOfLines={1} style={styles.infoValue}>{formatFileSize(image.fileSize)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>格式</Text>
              <Text style={[styles.infoValue, styles.infoValueLong]}>{image.mimeType}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>上传时间</Text>
              <Text numberOfLines={1} style={styles.infoValue}>{formatDateTime(image.createdAt)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>收藏状态</Text>
              <Text numberOfLines={1} style={styles.infoValue}>{image.isFavorite ? '已收藏' : '未收藏'}</Text>
            </View>
          </ContentCard>

          <View style={styles.actions}>
            <PrimaryAction
              icon={image.isFavorite ? 'star' : 'star-outline'}
              label={image.isFavorite ? '取消收藏' : '收藏'}
              onPress={handleToggleFavorite}
            />
            <PrimaryAction
              icon="swap-horizontal-outline"
              label="整理"
              onPress={() => onMoveGroup(image.id)}
            />
            <PrimaryAction icon="ellipsis-horizontal" label="更多" onPress={() => setIsMoreSheetVisible(true)} />
          </View>

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

          <Modal
            animationType="fade"
            onRequestClose={() => setIsFullScreenOpen(false)}
            statusBarTranslucent
            transparent
            visible={isFullScreenOpen}
          >
            <View style={styles.fullscreenShell}>
              <ExpoStatusBar backgroundColor="#05070A" style="light" translucent />
              <Image resizeMode="contain" source={{ uri: image.originalFileUri }} style={styles.fullscreenImage} />
              <View style={[styles.fullscreenTopBar, { paddingTop: insets.top + spacing[3] }]}>
                <View style={styles.fullscreenTitleBlock}>
                  <Text numberOfLines={1} style={styles.fullscreenTitle}>
                    {image.originalFilename}
                  </Text>
                  <Text numberOfLines={1} style={styles.fullscreenMeta}>
                    {formatImageDimensions(image.width, image.height)} · {formatFileSize(image.fileSize)}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="关闭全屏预览"
                  hitSlop={10}
                  onPress={() => setIsFullScreenOpen(false)}
                  style={({ pressed }) => [styles.fullscreenClose, pressed && styles.fullscreenPressed]}
                >
                  <Ionicons color={colors.text.inverse} name="close" size={22} />
                </Pressable>
              </View>
            </View>
          </Modal>
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
  if (context.type === 'ip-recent') {
    return imageRepository.findRecentByIpId(context.ipId, context.limit);
  }
  if (context.type === 'ip-all') {
    const filter = context.filter;
    if (filter.type === 'favorite') return imageRepository.findByIpId(context.ipId, { favoritesOnly: true });
    if (filter.type === 'ungrouped') return imageRepository.findByIpId(context.ipId, { ungroupedOnly: true });
    if (filter.type === 'untagged') return imageRepository.findByIpId(context.ipId, { untaggedOnly: true });
    if (filter.type === 'recent-viewed') return imageRepository.findByIpId(context.ipId, { recentlyViewedOnly: true, orderBy: 'lastViewedAtDesc' });
    if (filter.type === 'mime') return imageRepository.findByIpId(context.ipId, { mimeType: filter.mimeType });
    if (filter.type === 'size') return imageRepository.findByIpId(context.ipId, { minFileSize: filter.minFileSize, maxFileSize: filter.maxFileSize });
    if (filter.type === 'group') return imageRepository.findByGroupId(filter.groupId);
    if (filter.type === 'tag') return imageRepository.findByIpId(context.ipId, { tagId: filter.tagId });
    return imageRepository.findByIpId(context.ipId);
  }
  if (context.type === 'group') return imageRepository.findByGroupId(context.groupId);
  if (context.type === 'tag') return imageRepository.findByTagId(context.tagId);
  if (context.type === 'favorites') return imageRepository.findFavorites();
  return imageRepository.findRecentViewed();
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

function PreviewModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.previewModeButton, active ? styles.previewModeButtonActive : null, pressed && styles.pressed]}>
      <Text style={[styles.previewModeText, active ? styles.previewModeTextActive : null]}>{label}</Text>
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
  imageTitle: {
    ...typography.textStyles.pageTitle,
    flex: 1,
    fontSize: 20,
    lineHeight: 27,
    minWidth: 0,
  },
  imageSubtitle: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    minWidth: 0,
  },
  noteBlock: {
    borderBottomColor: colors.border.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    paddingBottom: spacing[3],
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
    aspectRatio: 0.9,
    width: '100%',
  },
  previewModeRow: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    padding: spacing[1],
  },
  previewModeButton: {
    borderRadius: radius.pill,
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  previewModeButtonActive: {
    backgroundColor: colors.background.surface,
  },
  previewModeText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  previewModeTextActive: {
    color: colors.primary.active,
  },
  previewAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 33, 43, 0.58)',
    borderRadius: radius.pill,
    bottom: spacing[3],
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 34,
    paddingHorizontal: spacing[3],
    position: 'absolute',
    right: spacing[3],
  },
  previewActionText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '500',
  },
  fullscreenShell: {
    backgroundColor: '#05070A',
    flex: 1,
  },
  fullscreenImage: {
    height: '100%',
    width: '100%',
  },
  fullscreenTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    left: 0,
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[4],
    position: 'absolute',
    right: 0,
    top: 0,
  },
  fullscreenTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  fullscreenTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
  },
  fullscreenMeta: {
    ...typography.textStyles.micro,
    color: 'rgba(255, 255, 255, 0.68)',
  },
  fullscreenClose: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  fullscreenPressed: {
    opacity: 0.78,
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
    paddingBottom: spacing[3],
  },
  infoLabel: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    width: 74,
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
  noteValue: {
    textAlign: 'left',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
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
    gap: spacing[2],
  },
  navActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 38,
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
