import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
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
  refreshToken: number;
  onBack: () => void;
  onChanged: () => void;
}

export function QuickOrganizeScreen({ ipId, refreshToken, onBack, onChanged }: QuickOrganizeScreenProps) {
  const { showToast } = useToast();
  const { data, isLoading, errorMessage, reload, setData } = useScreenLoad<{ images: ImageListItem[]; groups: GroupRecord[] }>(
    async () => {
      const [images, groups] = await Promise.all([
        imageRepository.findNeedsOrganizing(ipId),
        ipId != null ? groupRepository.findByIpId(ipId) : groupRepository.findAll(),
      ]);
      return { images, groups };
    },
    [ipId, refreshToken],
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
  const [tagInput, setTagInput] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ImageListItem | null>(null);

  function advanceCurrent() {
    setData((currentData) => currentData ? { ...currentData, images: currentData.images.slice(1) } : currentData);
  }

  async function handleSetGroup(groupId: number) {
    if (!current) {
      return;
    }

    await imageRepository.setImageGroups(current.id, [groupId]);
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
    showToast('已收藏');
    onChanged();
    advanceCurrent();
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
              <View style={styles.counter}>
                <Text style={styles.counterText}>剩余 {images.length} 张</Text>
              </View>
              <View style={styles.previewWrap}>
                {current.thumbnailFileUri ? (
                  <Image resizeMode="cover" source={{ uri: current.thumbnailFileUri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewFallback}>
                    <Ionicons color={colors.text.secondary} name="image-outline" size={28} />
                  </View>
                )}
              </View>
              <Text numberOfLines={2} style={styles.filename}>{current.originalFilename}</Text>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>加分组</Text>
                <View style={styles.groupGrid}>
                  {groups
                    .filter((group) => group.ipId === current.ipId)
                    .slice(0, 8)
                    .map((group) => (
                      <Pressable key={group.id} onPress={() => void handleSetGroup(group.id)} style={({ pressed }) => [styles.groupChip, pressed && styles.pressed]}>
                        <Text numberOfLines={1} style={styles.groupName}>{group.name}</Text>
                        <Text style={styles.groupMeta}>{getGroupTypeLabel(group.type)}</Text>
                      </Pressable>
                    ))}
                </View>
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
                  <PrimaryButton label="添加" onPress={handleAddTags} />
                </View>
                {draftTags.length > 0 ? (
                  <View style={styles.tagsWrap}>
                    {draftTags.map((tag) => <TagChip key={tag} label={tag} />)}
                  </View>
                ) : null}
              </View>

              <View style={styles.actions}>
                <PrimaryButton label="收藏" onPress={handleFavorite} variant="outline" />
                <PrimaryButton label="跳过" onPress={advanceCurrent} variant="ghost" />
                <PrimaryButton label="删除到回收站" onPress={() => setDeleteTarget(current)} variant="ghost" />
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

const styles = StyleSheet.create({
  queue: {
    gap: spacing[4],
  },
  counter: {
    alignSelf: 'flex-start',
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
  previewWrap: {
    aspectRatio: 1,
    backgroundColor: colors.background.empty,
    borderRadius: radius.xl,
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
  filename: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
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
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  actions: {
    gap: spacing[2],
  },
  pressed: {
    opacity: 0.78,
  },
});
