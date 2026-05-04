import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TagChip } from '../components/TagChip';
import { getGroupTypeLabel } from '../constants/groups';
import { TAG_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, imageRepository, tagRepository, type GroupRecord, type ImageListItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import { mergeDelimitedDraftTagNames } from '../utils/tagDrafts';

interface QuickOrganizeScreenProps {
  ipId?: number;
  importBatchId?: number | null;
  refreshToken: number;
  onBack: () => void;
  onChanged: () => void;
}

type LastOrganizeAction =
  | { type: 'group'; groupId: number; label: string }
  | { type: 'tags'; tags: string[]; label: string }
  | { type: 'favorite'; label: string };

export function QuickOrganizeScreen({ ipId, importBatchId = null, refreshToken, onBack, onChanged }: QuickOrganizeScreenProps) {
  const { showToast } = useToast();
  const { data, isLoading, errorMessage, reload, setData } = useScreenLoad<{ images: ImageListItem[]; groups: GroupRecord[] }>(
    async () => {
      const [images, groups] = await Promise.all([
        imageRepository.findNeedsOrganizing({ ipId, importBatchId }),
        ipId != null ? groupRepository.findByIpId(ipId) : groupRepository.findAll(),
      ]);
      return { images, groups };
    },
    [importBatchId, ipId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取待整理队列失败：${message}`;
      },
      initialData: { images: [], groups: [] },
    }
  );
  const images = data?.images ?? [];
  const groups = data?.groups ?? [];
  const current = images[0] ?? null;
  const currentGroups = current ? groups.filter((group) => group.ipId === current.ipId).slice(0, 8) : [];
  const upcomingImages = images.slice(1, 6);
  const [tagInput, setTagInput] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [lastAction, setLastAction] = useState<LastOrganizeAction | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImageListItem | null>(null);
  const previewPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 28 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderRelease: (_, gesture) => {
          if (!current || Math.abs(gesture.dx) < 70) {
            return;
          }

          if (gesture.dx > 0) {
            advanceCurrent();
            return;
          }

          setDeleteTarget(current);
        },
      }),
    [current]
  );

  function advanceCurrent() {
    setData((currentData) => currentData ? { ...currentData, images: currentData.images.slice(1) } : currentData);
  }

  async function applyActionToImage(image: ImageListItem, action: LastOrganizeAction) {
    if (action.type === 'group') {
      await imageRepository.setImageGroups(image.id, [action.groupId]);
      return;
    }

    if (action.type === 'tags') {
      await tagRepository.addTagsToImages([image.id], action.tags);
      return;
    }

    await imageRepository.updateFavorite(image.id, true);
  }

  async function handleSetGroup(groupId: number) {
    if (!current) {
      return;
    }

    await imageRepository.setImageGroups(current.id, [groupId]);
    const group = groups.find((item) => item.id === groupId);
    setLastAction({ type: 'group', groupId, label: group ? `分组：${group.name}` : '分组操作' });
    showToast('已加入分组');
    onChanged();
    advanceCurrent();
  }

  async function handleAddTags() {
    if (!current) {
      return;
    }

    const tags = mergeDelimitedDraftTagNames(draftTags, tagInput);
    if (tags.length === 0) {
      showToast('请先输入标签');
      return;
    }

    await tagRepository.addTagsToImages([current.id], tags);
    setLastAction({ type: 'tags', tags, label: `标签：${tags.join('、')}` });
    setDraftTags([]);
    setTagInput('');
    showToast('已添加标签');
    onChanged();
    advanceCurrent();
  }

  async function handleFavorite() {
    if (!current) {
      return;
    }

    await imageRepository.updateFavorite(current.id, true);
    setLastAction({ type: 'favorite', label: '收藏' });
    showToast('已收藏');
    onChanged();
    advanceCurrent();
  }

  async function handleRepeatLastAction() {
    if (!current || !lastAction) {
      return;
    }

    await applyActionToImage(current, lastAction);
    showToast(`已沿用上一操作：${lastAction.label}`);
    onChanged();
    advanceCurrent();
  }

  async function handleApplyTagsToNext20() {
    const tags = lastAction?.type === 'tags' ? lastAction.tags : mergeDelimitedDraftTagNames(draftTags, tagInput);
    if (tags.length === 0 || images.length === 0) {
      showToast('请先输入或沿用一组标签');
      return;
    }

    const targets = images.slice(0, 20);
    await tagRepository.addTagsToImages(targets.map((image) => image.id), tags);
    setLastAction({ type: 'tags', tags, label: `标签：${tags.join('、')}` });
    setDraftTags([]);
    setTagInput('');
    setData((currentData) => currentData ? { ...currentData, images: currentData.images.slice(targets.length) } : currentData);
    showToast(`已把 #${tags.join(' #')} 加到接下来 ${targets.length} 张`);
    onChanged();
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;
    setDeleteTarget(null);
    await imageRepository.softDeleteMany([target.id]);
    showToast({
      message: '已移入回收站',
      actionLabel: '撤销',
      durationMs: 5200,
      onAction: () => {
        void (async () => {
          await imageRepository.restoreMany([target.id]);
          onChanged();
          reload();
          showToast('已恢复');
        })();
      },
    });
    onChanged();
    advanceCurrent();
  }

  return (
    <>
      <ScreenScaffold decorativeTitle="Queue" onBack={onBack} scrollable title="待整理">
        <PageStateBlock
          emptyDescription="未分组、无标签、无备注的图片都已处理完。"
          emptyIconName="checkmark-circle-outline"
          emptyTitle="整理完成"
          errorMessage={errorMessage}
          isEmpty={!isLoading && images.length === 0}
          loading={isLoading}
          loadingDescription="正在读取未分组、无标签、无备注的图片。"
          loadingTitle="读取待整理队列"
          onRetry={reload}
        >
          {current ? (
            <View style={styles.queue}>
              <View style={styles.queueHeader}>
                <View style={styles.counter}>
                  <Text style={styles.counterText}>剩余 {images.length} 张</Text>
                </View>
                <Text numberOfLines={1} style={styles.headerFilename}>{current.originalFilename}</Text>
              </View>

              <View style={styles.previewWrap} {...previewPanResponder.panHandlers}>
                {current.thumbnailFileUri ? (
                  <Image resizeMode="cover" source={{ uri: current.thumbnailFileUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewFallback}>
                    <Ionicons color={colors.text.secondary} name="image-outline" size={28} />
                  </View>
                )}
              </View>
              <View style={styles.gestureHintRow}>
                <Text style={styles.gestureHint}>右滑跳过</Text>
                <Text style={styles.gestureHint}>左滑回收站</Text>
              </View>

              {upcomingImages.length > 0 ? (
                <View style={styles.upcomingStrip}>
                  {upcomingImages.map((image) => (
                    <View key={image.id} style={styles.upcomingTile}>
                      {image.thumbnailFileUri ? (
                        <Image resizeMode="cover" source={{ uri: image.thumbnailFileUri }} style={styles.upcomingImage} />
                      ) : (
                        <View style={styles.upcomingFallback}>
                          <Ionicons color={colors.text.tertiary} name="image-outline" size={14} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
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
                  label="同标签给接下来20张"
                  onPress={handleApplyTagsToNext20}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>加分组</Text>
                {currentGroups.length > 0 ? (
                  <View style={styles.groupGrid}>
                    {currentGroups.map((group) => (
                      <Pressable key={group.id} onPress={() => void handleSetGroup(group.id)} style={({ pressed }) => [styles.groupChip, pressed && styles.pressed]}>
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
                <View style={styles.tagInputRow}>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={TAG_NAME_MAX_LENGTH}
                    onChangeText={(value) => {
                      if (/[,\uFF0C\s]/.test(value)) {
                        setDraftTags((currentTags) => mergeDelimitedDraftTagNames(currentTags, value));
                        setTagInput('');
                        return;
                      }
                      setTagInput(value);
                    }}
                    onSubmitEditing={handleAddTags}
                    placeholder="输入标签后回车"
                    placeholderTextColor={colors.text.placeholder}
                    style={styles.tagInput}
                    value={tagInput}
                  />
                  <Pressable onPress={() => void handleAddTags()} style={({ pressed }) => [styles.tagAddButton, pressed && styles.pressed]}>
                    <Ionicons color={colors.text.inverse} name="add" size={18} />
                    <Text style={styles.tagAddText}>添加</Text>
                  </Pressable>
                </View>
                {draftTags.length > 0 ? (
                  <View style={styles.tagsWrap}>
                    {draftTags.map((tag) => <TagChip key={tag} label={tag} />)}
                  </View>
                ) : null}
              </View>

              <View style={styles.actions}>
                <QueueActionButton icon="star-outline" label="收藏" onPress={handleFavorite} />
                <QueueActionButton icon="arrow-forward-outline" label="跳过" onPress={advanceCurrent} />
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
      <Text style={[styles.actionText, danger && styles.dangerActionText]}>{label}</Text>
    </Pressable>
  );
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
  upcomingStrip: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  upcomingTile: {
    aspectRatio: 1,
    backgroundColor: colors.background.empty,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    maxWidth: 58,
    overflow: 'hidden',
  },
  upcomingImage: {
    height: '100%',
    width: '100%',
  },
  upcomingFallback: {
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
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
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
    width: '48%',
  },
  dangerActionCard: {
    backgroundColor: colors.semantic.dangerBackground,
  },
  actionText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '600',
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
