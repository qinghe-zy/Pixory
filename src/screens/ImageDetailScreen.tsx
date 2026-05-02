import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { AppScreen } from '../components/AppScreen';
import { ContentCard } from '../components/ContentCard';
import { Header } from '../components/Header';
import { TagChip } from '../components/TagChip';
import { getGroupTypeLabel } from '../constants/groups';
import { imageRepository, tagRepository, type ImageDetailRecord, type TagRecord } from '../database';
import { colors, componentTokens, radius, spacing, typography } from '../design/tokens';
import { getFileInfo } from '../services/fileStorageService';
import { devLog } from '../utils/dev';
import { formatDateTime, formatFileSize, formatImageDimensions } from '../utils/formatters';

interface ImageDetailScreenProps {
  imageId: number;
  refreshToken: number;
  onBack: () => void;
  onRefreshed: () => void;
  onEdit: (imageId: number) => void;
  onMoveGroup: (imageId: number) => void;
  onDeleted: () => void;
}

export function ImageDetailScreen({
  imageId,
  refreshToken,
  onBack,
  onRefreshed,
  onEdit,
  onMoveGroup,
  onDeleted,
}: ImageDetailScreenProps) {
  const [image, setImage] = useState<ImageDetailRecord | null>(null);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

        setImage(detail);
        setTags(tagItems);
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
  }, [imageId, refreshToken]);

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
      Alert.alert('收藏状态更新失败', message);
    } finally {
      setIsUpdatingFavorite(false);
    }
  }

  function handleDelete() {
    if (!image) {
      return;
    }

    Alert.alert('确认删除到回收站', '删除后会进入回收站状态，原图和缩略图文件仍会保留在本地。', [
      {
        text: '取消',
        style: 'cancel',
      },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
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

              if ((originalInfo.size ?? 0) <= 0) {
                throw new Error('软删除后原图文件大小异常。');
              }

              if (image.thumbnailFileUri && (thumbnailInfo?.size ?? 0) <= 0) {
                throw new Error('软删除后缩略图文件大小异常。');
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

              onDeleted();
            } catch (error) {
              const message = error instanceof Error ? error.message : '未知错误';
              Alert.alert('删除失败', message);
            }
          })();
        },
      },
    ]);
  }

  return (
    <AppScreen scrollable>
      <Header onBack={onBack} rightSlot={rightSlot} title="图片详情" />

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {isLoading && !image ? <Text style={styles.hint}>正在读取图片元数据…</Text> : null}

      {image ? (
        <>
          <View style={styles.previewWrap}>
            <Image resizeMode="cover" source={{ uri: image.originalFileUri }} style={styles.previewImage} />
          </View>

          <ContentCard style={styles.detailCard}>
            <View style={styles.imageTitleBlock}>
              <View style={styles.titleLine}>
                <Text numberOfLines={1} style={styles.imageTitle}>
                  {image.originalFilename.replace(/\.[^.]+$/, '')}
                </Text>
                <Ionicons color={image.isFavorite ? colors.semantic.favorite : colors.text.tertiary} name={image.isFavorite ? 'star' : 'star-outline'} size={18} />
              </View>
              <Text style={styles.imageSubtitle}>
                IP：{image.ipName}　　分组：{image.groupName ?? '未分组'}
              </Text>
            </View>
            <View style={styles.tagsWrap}>
              {tags.length > 0 ? tags.map((tag) => <TagChip key={tag.id} label={tag.name} />) : <Text style={styles.infoValue}>暂无标签</Text>}
            </View>
            <View style={styles.noteBlock}>
              <Text style={styles.infoLabel}>备注</Text>
              <Text style={styles.infoValue}>{image.note || '暂无备注'}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>所属 IP</Text>
              <Text style={styles.infoValue}>{image.ipName}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>所在分组</Text>
              <Text style={styles.infoValue}>
                {image.groupName ? `${image.groupName} · ${getGroupTypeLabel(image.groupType)}` : '未分组'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>文件名</Text>
              <Text style={styles.infoValue}>{image.originalFilename}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>尺寸</Text>
              <Text style={styles.infoValue}>{formatImageDimensions(image.width, image.height)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>大小</Text>
              <Text style={styles.infoValue}>{formatFileSize(image.fileSize)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>格式</Text>
              <Text style={styles.infoValue}>{image.mimeType}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>上传时间</Text>
              <Text style={styles.infoValue}>{formatDateTime(image.createdAt)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>收藏状态</Text>
              <Text style={styles.infoValue}>{image.isFavorite ? '已收藏' : '未收藏'}</Text>
            </View>
          </ContentCard>

          <View style={styles.actions}>
            <PrimaryAction
              icon={image.isFavorite ? 'star' : 'star-outline'}
              label={image.isFavorite ? '取消收藏' : '收藏'}
              onPress={handleToggleFavorite}
            />
            <PrimaryAction icon="create-outline" label="编辑" onPress={() => onEdit(image.id)} />
            <PrimaryAction icon="swap-horizontal-outline" label="移动分组" onPress={() => onMoveGroup(image.id)} />
            <PrimaryAction icon="trash-outline" label="删除" onPress={handleDelete} />
          </View>
        </>
      ) : null}
    </AppScreen>
  );
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
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: spacing[2],
    minHeight: componentTokens.primaryButton.height,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[3],
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
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -spacing[4],
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
    fontSize: 21,
    lineHeight: 28,
  },
  imageSubtitle: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  noteBlock: {
    borderBottomColor: colors.border.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    paddingBottom: spacing[4],
  },
  previewWrap: {
    backgroundColor: colors.background.sunken,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  previewImage: {
    aspectRatio: 0.76,
    width: '100%',
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  hint: {
    ...typography.textStyles.caption,
  },
  infoRow: {
    borderBottomColor: colors.border.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    paddingBottom: spacing[3],
  },
  infoLabel: {
    ...typography.textStyles.caption,
  },
  infoValue: {
    ...typography.textStyles.body,
    color: colors.text.title,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
});
