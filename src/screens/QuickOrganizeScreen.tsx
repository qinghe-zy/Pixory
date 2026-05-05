import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TagMultiSelectPanel } from '../components/TagMultiSelectPanel';
import { getGroupTypeLabel } from '../constants/groups';
import { groupRepository, imageRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageListItem, type PixorySpace, type TagUsageItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import { mergeDelimitedDraftTagNames } from '../utils/tagDrafts';
import { formatImageAssetCode } from '../utils/imageAssetCode';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

interface QuickOrganizeScreenProps {
  ipId?: number;
  importBatchId?: number | null;
  space?: PixorySpace;
  onBack: () => void;
  onChanged: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
}

type LastOrganizeAction =
  | { type: 'group'; groupId: number; label: string }
  | { type: 'tags'; tags: string[]; label: string }
  | { type: 'favorite'; label: string };

export function QuickOrganizeScreen({ ipId, importBatchId = null, space = 'normal', onBack, onChanged, onOpenImage }: QuickOrganizeScreenProps) {
  const { showToast } = useToast();
  const { data, isLoading, errorMessage, reload, setData } = useScreenLoad<{ images: ImageListItem[]; groups: GroupRecord[]; tags: TagUsageItem[] }>(
    async () => {
      const [images, groups, tags] = await runWithDatabaseSpace(space, () => Promise.all([
        imageRepository.findNeedsOrganizing({ ipId, importBatchId }),
        ipId != null ? groupRepository.findByIpId(ipId) : groupRepository.findAll(),
        ipId != null ? tagRepository.findUsageOverviewByIpId(ipId) : tagRepository.findUsageOverview(),
      ]));
      return { images, groups, tags };
    },
    [importBatchId, ipId, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取待整理队列失败：${message}`;
      },
      initialData: { images: [], groups: [], tags: [] },
    }
  );
  const images = data?.images ?? [];
  const groups = data?.groups ?? [];
  const tags = data?.tags ?? [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedGroupIdsByImageId, setEditedGroupIdsByImageId] = useState<Record<number, number | null>>({});
  const [editedTagNamesByImageId, setEditedTagNamesByImageId] = useState<Record<number, string[]>>({});
  const current = images[currentIndex] ?? null;
  const currentGroups = current ? groups.filter((group) => group.ipId === current.ipId).slice(0, 8) : [];
  const currentGroupId = current ? editedGroupIdsByImageId[current.id] ?? current.groupId : null;
  const currentSelectedTagNames = current ? editedTagNamesByImageId[current.id] ?? current.tagNames : [];
  const bulkTagTargetCount = Math.min(20, Math.max(images.length - currentIndex, 0));
  const [tagInput, setTagInput] = useState('');
  const [lastAction, setLastAction] = useState<LastOrganizeAction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImageListItem | null>(null);

  useEffect(() => {
    if (images.length === 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((index) => Math.min(index, images.length - 1));
  }, [images.length]);

  const previewPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 28 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderRelease: (_, gesture) => {
          if (!current || Math.abs(gesture.dx) < 70) {
            return;
          }

          if (gesture.dx > 0) {
            setDeleteTarget(current);
          } else {
            handleNextImage();
          }
        },
      }),
    [current, currentIndex, images.length]
  );

  function handleNextImage() {
    setCurrentIndex((index) => Math.min(index + 1, Math.max(images.length - 1, 0)));
  }

  function handlePreviousImage() {
    setCurrentIndex((index) => Math.max(index - 1, 0));
  }

  function patchCurrentImage(imageId: number, patch: Partial<ImageListItem>) {
    setData((currentData) =>
      currentData
        ? {
            ...currentData,
            images: currentData.images.map((image) => (image.id === imageId ? { ...image, ...patch } : image)),
          }
        : currentData
    );
  }

  function removeImageFromQueue(imageId: number) {
    setData((currentData) =>
      currentData
        ? {
            ...currentData,
            images: currentData.images.filter((image) => image.id !== imageId),
          }
        : currentData
    );
  }

  function getViewerContext(image: ImageListItem): ImageViewerContext {
    if (importBatchId != null) {
      return { type: 'import-batch', ipId: image.ipId, importBatchId, space };
    }

    return { type: 'ip-all', ipId: image.ipId, filter: { type: 'all' }, space };
  }

  async function applyActionToImage(image: ImageListItem, action: LastOrganizeAction) {
    if (action.type === 'group') {
      await runWithDatabaseSpace(space, () => imageRepository.setImageGroups(image.id, [action.groupId]));
      return;
    }

    if (action.type === 'tags') {
      await runWithDatabaseSpace(space, () => tagRepository.addTagsToImages([image.id], action.tags));
      return;
    }

    await runWithDatabaseSpace(space, () => imageRepository.updateFavorite(image.id, true));
  }

  async function handleSetGroup(groupId: number) {
    if (!current) {
      return;
    }

    await runWithDatabaseSpace(space, () => imageRepository.setImageGroups(current.id, [groupId]));
    const group = groups.find((item) => item.id === groupId);
    setLastAction({ type: 'group', groupId, label: group ? `分组：${group.name}` : '分组操作' });
    setEditedGroupIdsByImageId((currentGroupsByImageId) => ({ ...currentGroupsByImageId, [current.id]: groupId }));
    patchCurrentImage(current.id, { groupCount: 1, groupName: group?.name ?? current.groupName, groupId });
    showToast('已加入分组');
    onChanged();
  }

  async function handleAutoSaveTags(nextTagNames: string[]) {
    if (!current) {
      return;
    }

    const tags = mergeDelimitedDraftTagNames([], nextTagNames.join(' '));
    if (areSameTagNames(tags, currentSelectedTagNames)) {
      return;
    }

    const savedTags = await runWithDatabaseSpace(space, () => tagRepository.setImageTags(current.id, tags));
    if (tags.length > 0) {
      setLastAction({ type: 'tags', tags, label: `标签：${tags.join('、')}` });
    }
    setEditedTagNamesByImageId((currentTagsByImageId) => ({ ...currentTagsByImageId, [current.id]: tags }));
    patchCurrentImage(current.id, { tagCount: tags.length, tagNames: tags });
    setData((currentData) => {
      if (!currentData || savedTags.length === 0) {
        return currentData;
      }

      const existingKeys = new Set(currentData.tags.map((tag) => tag.name.toLowerCase()));
      const createdUsageItems = savedTags
        .filter((tag) => !existingKeys.has(tag.name.toLowerCase()))
        .map((tag) => ({ ...tag, imageCount: 1, lastUsedAt: new Date().toISOString() }));

      return createdUsageItems.length > 0 ? { ...currentData, tags: [...createdUsageItems, ...currentData.tags] } : currentData;
    });
    setTagInput('');
    onChanged();
  }

  async function handleFavorite() {
    if (!current) {
      return;
    }

    await runWithDatabaseSpace(space, () => imageRepository.updateFavorite(current.id, true));
    setLastAction({ type: 'favorite', label: '收藏' });
    patchCurrentImage(current.id, { isFavorite: true });
    showToast('已收藏');
    onChanged();
  }

  async function handleRepeatLastAction() {
    if (!current || !lastAction) {
      return;
    }

    await applyActionToImage(current, lastAction);
    if (lastAction.type === 'group') {
      const group = groups.find((item) => item.id === lastAction.groupId);
      setEditedGroupIdsByImageId((currentGroupsByImageId) => ({ ...currentGroupsByImageId, [current.id]: lastAction.groupId }));
      patchCurrentImage(current.id, { groupCount: 1, groupName: group?.name ?? current.groupName, groupId: lastAction.groupId });
    } else if (lastAction.type === 'tags') {
      const nextTagNames = mergeDelimitedDraftTagNames(current.tagNames, lastAction.tags.join(' '));
      setEditedTagNamesByImageId((currentTagsByImageId) => ({ ...currentTagsByImageId, [current.id]: nextTagNames }));
      patchCurrentImage(current.id, { tagCount: Math.max(current.tagCount, nextTagNames.length), tagNames: nextTagNames });
    } else {
      patchCurrentImage(current.id, { isFavorite: true });
    }
    showToast(`已沿用上一操作：${lastAction.label}`);
    onChanged();
  }

  async function handleApplyTagsToNext20() {
    const tags = lastAction?.type === 'tags' ? lastAction.tags : mergeDelimitedDraftTagNames(currentSelectedTagNames, tagInput);
    if (tags.length === 0 || images.length === 0) {
      showToast('请先输入或沿用一组标签');
      return;
    }

    const targets = images.slice(currentIndex, currentIndex + 20);
    await runWithDatabaseSpace(space, () => tagRepository.addTagsToImages(targets.map((image) => image.id), tags));
    setLastAction({ type: 'tags', tags, label: `标签：${tags.join('、')}` });
    setEditedTagNamesByImageId((currentTagsByImageId) => {
      const next = { ...currentTagsByImageId };
      for (const image of targets) {
        next[image.id] = mergeDelimitedDraftTagNames(image.tagNames, tags.join(' '));
      }
      return next;
    });
    setTagInput('');
    setData((currentData) =>
      currentData
        ? {
            ...currentData,
            images: currentData.images.map((image) =>
              targets.some((target) => target.id === image.id)
                ? {
                    ...image,
                    tagCount: Math.max(image.tagCount, mergeDelimitedDraftTagNames(image.tagNames, tags.join(' ')).length),
                    tagNames: mergeDelimitedDraftTagNames(image.tagNames, tags.join(' ')),
                  }
                : image
            ),
          }
        : currentData
    );
    showToast(`已把 #${tags.join(' #')} 加到当前起 ${targets.length} 张`);
    onChanged();
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;
    setDeleteTarget(null);
    await runWithDatabaseSpace(space, () => imageRepository.softDeleteMany([target.id]));
    removeImageFromQueue(target.id);
    showToast({
      message: '已移入回收站',
      actionLabel: '撤销',
      durationMs: 5200,
      onAction: () => {
        void (async () => {
          await runWithDatabaseSpace(space, () => imageRepository.restoreMany([target.id]));
          onChanged();
          reload();
          showToast('已恢复');
        })();
      },
    });
    onChanged();
  }

  return (
    <>
      <ScreenScaffold decorativeTitle="Queue" onBack={onBack} scrollable title="待整理">
        <PageStateBlock
          emptyDescription="还没有分组的图片都已处理完。无标签图片会在进度里单独提醒。"
          emptyIconName="checkmark-circle-outline"
          emptyTitle="整理完成"
          errorMessage={errorMessage}
          isEmpty={!isLoading && images.length === 0}
          loading={isLoading}
          loadingDescription="正在读取还没有分组的图片。"
          loadingTitle="读取待整理队列"
          onRetry={reload}
        >
          {current ? (
            <View style={styles.queue}>
              <View style={styles.queueHeader}>
                <View style={styles.counter}>
                  <Text style={styles.counterText}>{currentIndex + 1}/{images.length}</Text>
                </View>
                <Text numberOfLines={1} style={styles.headerFilename}>
                  {formatImageAssetCode(current)} · {current.originalFilename}
                </Text>
              </View>

              <Pressable onPress={() => onOpenImage(current.id, getViewerContext(current))} style={styles.previewWrap} {...previewPanResponder.panHandlers}>
                {current.thumbnailFileUri ? (
                  <Image resizeMode="cover" source={{ uri: current.thumbnailFileUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewFallback}>
                    <Ionicons color={colors.text.secondary} name="image-outline" size={28} />
                  </View>
                )}
              </Pressable>
              <View style={styles.gestureHintRow}>
                <Text style={styles.gestureHint}>左滑跳过</Text>
                <Text style={styles.gestureHint}>右滑回收站</Text>
              </View>

              {images.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.queueStrip} contentContainerStyle={styles.queueStripContent}>
                  {images.map((image, index) => (
                    <Pressable key={image.id} onPress={() => setCurrentIndex(index)} style={[styles.queueTile, index === currentIndex ? styles.selectedQueueTile : null]}>
                      {image.thumbnailFileUri ? (
                        <Image resizeMode="cover" source={{ uri: image.thumbnailFileUri }} style={styles.queueImage} />
                      ) : (
                        <View style={styles.queueFallback}>
                          <Ionicons color={colors.text.tertiary} name="image-outline" size={14} />
                        </View>
                      )}
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              <View style={styles.continuityPanel}>
                <QueueActionButton
                  disabled={!lastAction}
                  icon="repeat-outline"
                  label={lastAction ? `沿用 ${lastAction.label}` : '沿用上一张'}
                  onPress={handleRepeatLastAction}
                />
                <QueueActionButton
                  icon="copy-outline"
                  label={bulkTagTargetCount <= 1 ? '同标签给当前这张' : `同标签给当前起${bulkTagTargetCount}张`}
                  onPress={handleApplyTagsToNext20}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>加分组</Text>
                {currentGroups.length > 0 ? (
                  <View style={styles.groupGrid}>
                    {currentGroups.map((group) => (
                      <Pressable
                        key={group.id}
                        onPress={() => void handleSetGroup(group.id)}
                        style={({ pressed }) => [
                          styles.groupChip,
                          currentGroupId === group.id ? styles.groupChipSelected : null,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text numberOfLines={1} style={styles.groupName}>{group.name}</Text>
                        <Text style={styles.groupMeta}>{getGroupTypeLabel(group.type)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyHint}>这个 IP 还没有分组，可先加标签、收藏或跳过。</Text>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>加标签</Text>
                <TagMultiSelectPanel
                  availableTags={tags}
                  inputValue={tagInput}
                  onInputChange={setTagInput}
                  onSelectedTagNamesChange={(tagNames) => {
                    if (!current) {
                      return;
                    }
                    void handleAutoSaveTags(tagNames);
                  }}
                  selectedTagNames={currentSelectedTagNames}
                />
              </View>

              <View style={styles.actions}>
                <QueueActionButton disabled={currentIndex === 0} icon="arrow-back-outline" label="上一张" onPress={handlePreviousImage} />
                <QueueActionButton disabled={currentIndex >= images.length - 1} icon="arrow-forward-outline" label="下一张" onPress={handleNextImage} />
                <QueueActionButton icon="star-outline" label="收藏" onPress={handleFavorite} />
                <QueueActionButton danger icon="trash-outline" label="回收站" onPress={() => setDeleteTarget(current)} />
              </View>
            </View>
          ) : null}
        </PageStateBlock>
      </ScreenScaffold>
      <AppDialog
        danger
        message="这张图片会进入回收站，原图和缩略图仍保留在本地。"
        onClose={() => setDeleteTarget(null)}
        onPrimary={confirmDelete}
        primaryLabel="删除到回收站"
        title="确认删除"
        visible={Boolean(deleteTarget)}
      />
    </>
  );
}

function QueueActionButton({
  danger,
  disabled,
  icon,
  label,
  onPress,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionCard, danger && styles.dangerActionCard, disabled && styles.disabledAction, pressed && !disabled && styles.pressed]}>
      <Ionicons color={danger ? colors.semantic.danger : colors.primary.active} name={icon} size={18} />
      <Text ellipsizeMode="tail" numberOfLines={2} style={[styles.actionText, danger && styles.dangerActionText]}>{label}</Text>
    </Pressable>
  );
}

function areSameTagNames(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightKeys = new Set(right.map((tagName) => tagName.toLowerCase()));
  return left.every((tagName) => rightKeys.has(tagName.toLowerCase()));
}

const styles = StyleSheet.create({
  queue: {
    gap: spacing[3],
  },
  queueHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  counter: {
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  counterText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '600',
  },
  headerFilename: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    flex: 1,
    minWidth: 0,
  },
  previewWrap: {
    aspectRatio: 1.08,
    backgroundColor: colors.background.empty,
    borderRadius: radius.xl,
    maxHeight: 332,
    overflow: 'hidden',
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
  gestureHintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -spacing[2],
    paddingHorizontal: spacing[1],
  },
  gestureHint: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
  queueStrip: {
    marginHorizontal: -spacing[1],
  },
  queueStripContent: {
    gap: spacing[2],
    paddingHorizontal: spacing[1],
  },
  queueTile: {
    aspectRatio: 1,
    backgroundColor: colors.background.empty,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    width: 58,
    overflow: 'hidden',
  },
  selectedQueueTile: {
    borderColor: colors.primary.default,
    borderWidth: 2,
  },
  queueImage: {
    height: '100%',
    width: '100%',
  },
  queueFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  continuityPanel: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  section: {
    gap: spacing[2],
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  groupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  groupChip: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    minHeight: 48,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    width: '48.6%',
  },
  groupChipSelected: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.hover,
  },
  groupName: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '700',
  },
  groupMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  tagInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  tagInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    flex: 1,
    minHeight: 42,
    paddingHorizontal: spacing[3],
  },
  tagAddButton: {
    alignItems: 'center',
    backgroundColor: colors.primary.default,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing[1],
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  tagAddText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing[2],
  },
  actionCard: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing[2],
    width: '48%',
  },
  dangerActionCard: {
    backgroundColor: colors.semantic.dangerBackground,
  },
  actionText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    flexShrink: 1,
    fontWeight: '600',
    minWidth: 0,
  },
  dangerActionText: {
    color: colors.semantic.danger,
  },
  disabledAction: {
    opacity: 0.45,
  },
  emptyHint: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.78,
  },
});
