import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { SearchBar } from '../components/SearchBar';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { commonEmptyStateCopy } from '../constants/copy';
import { tagRepository, type TagUsageItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';

interface TagsOverviewScreenProps {
  refreshToken: number;
  footer?: ReactNode;
  onOpenTag: (tagId: number) => void;
}

export function TagsOverviewScreen({ refreshToken, footer, onOpenTag }: TagsOverviewScreenProps) {
  const { showToast } = useToast();
  const [searchText, setSearchText] = useState('');
  const [actionTag, setActionTag] = useState<TagUsageItem | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagUsageItem | null>(null);
  const [renameTag, setRenameTag] = useState<TagUsageItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [createTagValue, setCreateTagValue] = useState('');
  const { data: tags = [], isLoading, errorMessage, reload } = useScreenLoad<TagUsageItem[]>(
    () => tagRepository.findUsageOverview(),
    [refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取标签总览失败：${message}`;
      },
      initialData: [],
    }
  );
  const visibleTags = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return keyword ? tags.filter((tag) => tag.name.toLowerCase().includes(keyword)) : tags;
  }, [searchText, tags]);
  const popularTags = useMemo(
    () => [...tags].sort((left, right) => right.imageCount - left.imageCount).slice(0, 6),
    [tags]
  );
  const recentTags = useMemo(
    () =>
      [...tags]
        .filter((tag) => tag.lastUsedAt)
        .sort((left, right) => new Date(right.lastUsedAt ?? '').getTime() - new Date(left.lastUsedAt ?? '').getTime())
        .slice(0, 6),
    [tags]
  );
  const shouldShowPopular = !searchText.trim() && popularTags.length > 0;
  const shouldShowRecent = !searchText.trim() && recentTags.length > 0;

  function confirmDeleteTag() {
    if (!deleteTag) {
      return;
    }

    const tag = deleteTag;
    setDeleteTag(null);
    void (async () => {
      try {
        const deletedCount = await tagRepository.deleteById(tag.id);
        if (deletedCount === 0) {
          throw new Error('没有找到这个标签。');
        }
        showToast('已删除标签');
        reload();
      } catch (error) {
        showToast(error instanceof Error ? `删除标签失败：${error.message}` : '删除标签失败');
      }
    })();
  }

  function startRename(tag: TagUsageItem) {
    setRenameTag(tag);
    setRenameValue(tag.name);
  }

  function submitRename() {
    if (!renameTag) {
      return;
    }

    const nextName = renameValue.trim();
    if (!nextName) {
      showToast('请输入标签名称');
      return;
    }

    void (async () => {
      try {
        await tagRepository.update(renameTag.id, { name: nextName });
        showToast('已重命名标签');
        setRenameTag(null);
        setRenameValue('');
        reload();
      } catch (error) {
        showToast(error instanceof Error ? `重命名失败：${error.message}` : '重命名失败');
      }
    })();
  }

  function submitCreateTag() {
    const name = createTagValue.trim();
    if (!name) {
      showToast('请输入标签名称');
      return;
    }

    void (async () => {
      try {
        await tagRepository.create({ name });
        setCreateTagValue('');
        showToast('已新增标签');
        reload();
      } catch (error) {
        showToast(error instanceof Error ? `新增标签失败：${error.message}` : '新增标签失败');
      }
    })();
  }

  return (
    <>
    <ScreenScaffold decorativeTitle="Tags" footer={footer} scrollable title="标签">
      <View style={styles.searchBlock}>
        <SearchBar onChangeText={setSearchText} placeholder="搜索标签" value={searchText} />
      </View>
      <View style={styles.createPanel}>
        <Text style={styles.resultLabel}>新增标签</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setCreateTagValue}
          onSubmitEditing={submitCreateTag}
          placeholder="输入标签名称"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.renameInput}
          value={createTagValue}
        />
        <Pressable onPress={submitCreateTag} style={({ pressed }) => [styles.resultAction, pressed && styles.pressed]}>
          <Text style={styles.resultActionText}>新增</Text>
        </Pressable>
      </View>
      {renameTag ? (
        <View style={styles.renamePanel}>
          <Text style={styles.resultLabel}>重命名</Text>
          <TextInput
            onChangeText={setRenameValue}
            placeholder="标签名称"
            placeholderTextColor={colors.text.placeholder}
            selectionColor={colors.primary.default}
            style={styles.renameInput}
            value={renameValue}
          />
          <Pressable onPress={submitRename} style={({ pressed }) => [styles.resultAction, pressed && styles.pressed]}>
            <Text style={styles.resultActionText}>保存</Text>
          </Pressable>
        </View>
      ) : null}
      <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="给图片添加标签后，这里会展示标签名称、使用次数和结果入口。"
        emptyIconName="pricetags-outline"
        emptyTitle="还没有标签"
        errorMessage={errorMessage}
        isEmpty={!isLoading && visibleTags.length === 0}
        loading={isLoading}
        loadingDescription="本地标签数据读取完成后，这里会展示全部标签。"
        loadingTitle="正在读取标签"
        onRetry={reload}
      >
        <View style={styles.content}>
          {shouldShowRecent ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>最近使用</Text>
              <View style={styles.allTags}>
                {recentTags.map((tag) => (
                  <Pressable
                    key={tag.id}
                    onLongPress={() => setActionTag(tag)}
                    onPress={() => onOpenTag(tag.id)}
                    style={({ pressed }) => [styles.recentTagPill, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={1} style={styles.tagName}>#{tag.name}</Text>
                    <Text style={styles.pillCount}>{tag.imageCount}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {shouldShowPopular ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>热门标签</Text>
              <View style={styles.popularGrid}>
                {popularTags.map((tag) => (
                  <Pressable
                    key={tag.id}
                    onLongPress={() => setActionTag(tag)}
                    onPress={() => onOpenTag(tag.id)}
                    style={({ pressed }) => [
                      styles.popularTag,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text numberOfLines={1} style={styles.popularName}>#{tag.name}</Text>
                    <Text style={styles.countBadge}>{tag.imageCount}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{searchText.trim() ? '搜索结果' : '全部标签'}</Text>
            <View style={styles.allTags}>
              {visibleTags.map((tag) => (
                <Pressable
                  key={tag.id}
                  onLongPress={() => setActionTag(tag)}
                  onPress={() => onOpenTag(tag.id)}
                  style={({ pressed }) => [
                    styles.tagPill,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text numberOfLines={1} style={styles.tagName}>#{tag.name}</Text>
                  <Text style={styles.pillCount}>{tag.imageCount}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </PageStateBlock>
    </ScreenScaffold>
    <AppActionSheet
      items={actionTag ? [
        { key: 'view', label: '查看图片', icon: 'images-outline', onPress: () => onOpenTag(actionTag.id) },
        { key: 'rename', label: '重命名', icon: 'create-outline', onPress: () => startRename(actionTag) },
        { key: 'delete', label: '删除标签', icon: 'trash-outline', danger: true, onPress: () => setDeleteTag(actionTag) },
      ] : []}
      onClose={() => setActionTag(null)}
      title={actionTag ? `#${actionTag.name}` : '标签操作'}
      visible={Boolean(actionTag)}
    />
    <AppDialog
      danger
      message={deleteTag ? `删除 #${deleteTag.name} 只会移除标签和图片关联，不会删除图片。` : ''}
      onClose={() => setDeleteTag(null)}
      onPrimary={confirmDeleteTag}
      primaryLabel="确认删除"
      title="删除标签"
      visible={Boolean(deleteTag)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  searchBlock: {
    marginBottom: spacing[1],
  },
  content: {
    gap: spacing[5],
  },
  section: {
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  resultPanel: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  resultLabel: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    width: 48,
  },
  resultCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  resultTitle: {
    ...typography.textStyles.bodyStrong,
  },
  resultMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  resultAction: {
    borderRadius: radius.pill,
    backgroundColor: colors.primary.weak,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  resultActionText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '600',
  },
  popularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing[2],
    rowGap: spacing[2],
  },
  renamePanel: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[2],
  },
  createPanel: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[2],
  },
  renameInput: {
    ...typography.textStyles.body,
    color: colors.text.title,
    flex: 1,
    minHeight: 36,
    minWidth: 0,
  },
  popularTag: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1.5],
    justifyContent: 'space-between',
    minHeight: 36,
    paddingHorizontal: spacing[3],
    width: '48.4%',
  },
  selectedTag: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  popularName: {
    ...typography.textStyles.bodyStrong,
    flex: 1,
    minWidth: 0,
  },
  allTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing[2],
    rowGap: spacing[2],
  },
  tagPill: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1.5],
    minHeight: 30,
    paddingHorizontal: spacing[2],
  },
  recentTagPill: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1.5],
    minHeight: 32,
    paddingHorizontal: spacing[2],
  },
  selectedPill: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  tagName: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    maxWidth: 136,
  },
  countBadge: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  pillCount: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.8,
  },
});
