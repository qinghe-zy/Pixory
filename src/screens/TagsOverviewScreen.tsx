import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { TagSkeleton } from '../components/TagSkeleton';
import { PageStateBlock } from '../components/PageStateBlock';
import { SearchBar } from '../components/SearchBar';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { commonEmptyStateCopy } from '../constants/copy';
import { runWithDatabaseSpace, tagRepository, type PixorySpace, type TagUsageItem } from '../database';
import { colors, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { usePagedScreenLoad } from '../hooks/usePagedScreenLoad';
import { useToast } from '../components/AppToast';
import { OrganizeSegmentedControl, protoColors, type OrganizeMode } from '../components/OrganizeShared';
import { globalScrollState, createScrollHandlers } from '../utils/scrollState';

interface TagsOverviewScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  footer?: ReactNode;
  mode?: OrganizeMode;
  onSelectMode?: (mode: OrganizeMode) => void;
  onOpenTag: (tagId: number) => void;
}

const TAG_PAGE_SIZE = 60;

interface TagOverviewMeta {
  popularTags: TagUsageItem[];
  recentTags: TagUsageItem[];
}

export function TagsOverviewScreen({ space = 'normal', refreshToken, footer, mode, onSelectMode, onOpenTag }: TagsOverviewScreenProps) {
  const { showToast } = useToast();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [actionTag, setActionTag] = useState<TagUsageItem | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagUsageItem | null>(null);
  const [renameTag, setRenameTag] = useState<TagUsageItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [createTagValue, setCreateTagValue] = useState('');
  const [isCreateDialogVisible, setIsCreateDialogVisible] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isBatchDeleteDialogVisible, setIsBatchDeleteDialogVisible] = useState(false);

  const {
    items: tags,
    hasMore,
    meta: { popularTags, recentTags },
    isLoading,
    isLoadingMore,
    errorMessage,
    loadMore,
    reload,
  } = usePagedScreenLoad<TagUsageItem, TagOverviewMeta>(
    (offset) => runWithDatabaseSpace(space, async (db) => {
      const page = await tagRepository.findUsageOverviewPage(db, {
        limit: TAG_PAGE_SIZE,
        offset,
        searchText: debouncedSearchText,
      });
      if (offset > 0 || debouncedSearchText.trim()) {
        return { items: page.items, hasMore: page.hasMore };
      }
      const [nextPopularTags, nextRecentTags] = await Promise.all([
        tagRepository.findPopular(db, 6),
        tagRepository.findRecentlyUsed(db, 6),
      ]);
      return {
        items: page.items,
        hasMore: page.hasMore,
        meta: { popularTags: nextPopularTags, recentTags: nextRecentTags },
      };
    }),
    {
      requestKey: JSON.stringify([space, debouncedSearchText.trim(), refreshToken]),
      getItemKey: (tag) => tag.id,
      initialMeta: { popularTags: [], recentTags: [] },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取标签总览失败：${message}`;
      },
      onLoadMoreError: (error) => {
        showToast(error instanceof Error ? `加载更多标签失败：${error.message}` : '加载更多标签失败');
      },
    }
  );

  const visibleTags = tags;
  const shouldShowPopular = !debouncedSearchText.trim() && popularTags.length > 0;
  const shouldShowRecent = !debouncedSearchText.trim() && recentTags.length > 0;
  const allSelected = visibleTags.length > 0 && visibleTags.every((tag) => selectedTagIds.includes(tag.id));
  const selectedCount = selectedTagIds.length;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchText(searchText), 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    clearSelectionMode();
  }, [debouncedSearchText, refreshToken, space]);

  function toggleTagSelection(tagId: number) {
    setSelectedTagIds((current) => (current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]));
  }

  function toggleSelectAll() {
    if (allSelected) {
      const visibleIds = new Set(visibleTags.map((tag) => tag.id));
      setSelectedTagIds((current) => current.filter((id) => !visibleIds.has(id)));
      return;
    }

    setSelectedTagIds((current) => [...new Set([...current, ...visibleTags.map((tag) => tag.id)])]);
  }

  function enterSelectionMode(tagId?: number) {
    setActionTag(null);
    setIsSelectionMode(true);
    if (tagId != null) {
      setSelectedTagIds((current) => (current.includes(tagId) ? current : [...current, tagId]));
    }
  }

  function clearSelectionMode() {
    setIsSelectionMode(false);
    setSelectedTagIds([]);
  }

  function handleTagPress(tag: TagUsageItem) {
    if (globalScrollState.isScrolling) return;
    if (isSelectionMode) {
      toggleTagSelection(tag.id);
      return;
    }

    onOpenTag(tag.id);
  }

  function handleTagLongPress(tag: TagUsageItem) {
    if (globalScrollState.isScrolling) return;
    if (isSelectionMode) {
      toggleTagSelection(tag.id);
      return;
    }

    setActionTag(tag);
  }

  function confirmDeleteTag() {
    if (!deleteTag) {
      return;
    }

    const tag = deleteTag;
    setDeleteTag(null);
    void (async () => {
      try {
        const deletedCount = await runWithDatabaseSpace(space, (db) => tagRepository.deleteById(db, tag.id));
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

  function confirmBatchDeleteTags() {
    if (selectedTagIds.length === 0) {
      showToast('请先选择标签');
      return;
    }

    const tagIds = selectedTagIds;
    setIsBatchDeleteDialogVisible(false);
    void (async () => {
      try {
        const deletedCount = await runWithDatabaseSpace(space, (db) => tagRepository.deleteMany(db, tagIds));
        showToast(`已批量删除 ${deletedCount} 个标签`);
        clearSelectionMode();
        reload();
      } catch (error) {
        showToast(error instanceof Error ? `批量删除失败：${error.message}` : '批量删除失败');
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
        await runWithDatabaseSpace(space, (db) => tagRepository.update(db, renameTag.id, { name: nextName }));
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
        await runWithDatabaseSpace(space, (db) => tagRepository.create(db, { name }));
        setCreateTagValue('');
        setIsCreateDialogVisible(false);
        showToast('已新增标签');
        reload();
      } catch (error) {
        showToast(error instanceof Error ? `新增标签失败：${error.message}` : '新增标签失败');
      }
    })();
  }

  const rightAction = (
    <View style={styles.headerActions}>
      <Pressable
        accessibilityLabel={isSelectionMode ? '退出选择' : '选择标签'}
        onPress={isSelectionMode ? clearSelectionMode : () => enterSelectionMode()}
        style={({ pressed }) => [styles.headerAction, isSelectionMode ? styles.headerActionActive : null, pressed && styles.pressed]}
      >
        <Ionicons color={isSelectionMode ? protoColors.primary : protoColors.onSurface} name={isSelectionMode ? 'close' : 'checkmark-circle-outline'} size={18} />
      </Pressable>
      <Pressable
        accessibilityLabel="新增标签"
        onPress={() => setIsCreateDialogVisible(true)}
        style={({ pressed }) => [styles.newBtn, pressed && styles.pressed]}
      >
        <Ionicons color={protoColors.onPrimary} name="add" size={14} />
        <Text style={styles.newBtnText}>新建</Text>
      </Pressable>
    </View>
  );

  const listHeader = (
    <View style={styles.listHeader}>
      {mode && onSelectMode && (
        <View style={styles.topSection}>
          <OrganizeSegmentedControl mode={mode} onSelect={onSelectMode} rightAction={rightAction} />
        </View>
      )}
      <View style={styles.searchBlock}>
        <SearchBar onChangeText={setSearchText} placeholder="搜索标签" value={searchText} />
      </View>
      {shouldShowRecent ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>最近使用</Text>
          <View style={styles.allTags}>
            {recentTags.map((tag) => (
              <Pressable
                key={tag.id}
                onLongPress={() => handleTagLongPress(tag)}
                onPress={() => handleTagPress(tag)}
                style={({ pressed }) => [styles.recentTagPill, selectedTagIds.includes(tag.id) ? styles.selectedPill : null, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={styles.tagName}>#{tag.name}</Text>
                <Text style={styles.pillCount}>{tag.imageCount}</Text>
                {isSelectionMode ? <Ionicons color={selectedTagIds.includes(tag.id) ? colors.primary.active : colors.text.tertiary} name={selectedTagIds.includes(tag.id) ? 'checkmark-circle' : 'ellipse-outline'} size={16} /> : null}
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
                onLongPress={() => handleTagLongPress(tag)}
                onPress={() => handleTagPress(tag)}
                style={({ pressed }) => [styles.popularTag, selectedTagIds.includes(tag.id) ? styles.selectedTag : null, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={styles.popularName}>#{tag.name}</Text>
                <Text style={styles.countBadge}>{tag.imageCount}</Text>
                {isSelectionMode ? <Ionicons color={selectedTagIds.includes(tag.id) ? colors.primary.active : colors.text.tertiary} name={selectedTagIds.includes(tag.id) ? 'checkmark-circle' : 'ellipse-outline'} size={16} /> : null}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <Text style={styles.sectionTitle}>{debouncedSearchText.trim() ? '搜索结果' : '全部标签'}</Text>
    </View>
  );

  return (
    <>
    <ScreenScaffold showHeader={false} backgroundColor={protoColors.surface} contentContainerStyle={{ paddingHorizontal: 16 }} decorativeTitle={undefined} footer={footer} title="">
      {isSelectionMode ? (
        <View style={styles.selectionPanel}>
          <View style={styles.selectionCopy}>
            <Text style={styles.selectionTitle}>已选择 {selectedCount} 个标签</Text>
            <Text style={styles.selectionMeta}>批量删除只移除标签和图片关联，不会删除图片。</Text>
          </View>
          <View style={styles.selectionActions}>
            <Pressable disabled={visibleTags.length === 0} onPress={toggleSelectAll} style={({ pressed }) => [styles.selectionButton, visibleTags.length === 0 ? styles.disabled : null, pressed && visibleTags.length > 0 ? styles.pressed : null]}>
              <Text style={styles.selectionButtonText}>{allSelected ? '取消全选' : hasMore ? '全选已加载' : '全选'}</Text>
            </Pressable>
            <Pressable disabled={selectedCount === 0} onPress={() => setIsBatchDeleteDialogVisible(true)} style={({ pressed }) => [styles.selectionButtonDanger, selectedCount === 0 ? styles.disabled : null, pressed && selectedCount > 0 ? styles.pressed : null]}>
              <Text style={styles.selectionButtonDangerText}>批量删除</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
        loadingComponent={<TagSkeleton />}
        emptyActionLabel={undefined}
        emptyDescription="给图片添加标签后，这里会展示标签名称、使用次数和结果入口。"
        emptyIconName="pricetags-outline"
        emptyTitle=""
        errorMessage={errorMessage}
        isEmpty={false}
        loading={isLoading}
        loadingDescription="读取标签列表..."
        loadingTitle="正在读取标签"
        onEmptyAction={undefined}
        onRetry={reload}
      >
        <FlatList
          {...createScrollHandlers()}
          contentContainerStyle={styles.tagList}
          data={visibleTags}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(tag) => String(tag.id)}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            !isLoading && visibleTags.length === 0 ? (
              <View style={styles.emptyInline}>
                <Ionicons name="pricetags-outline" size={32} color={protoColors.outlineVariant} />
                <Text style={styles.emptyInlineTitle}>还没有标签</Text>
                <Text style={styles.emptyInlineDesc}>给图片添加标签后，这里会展示标签名称、使用次数和结果入口。</Text>
              </View>
            ) : null
          }
            numColumns={2}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            renderItem={({ item: tag }) => (
              <View style={styles.tagCell}>
                <Pressable
                  onLongPress={() => handleTagLongPress(tag)}
                  onPress={() => handleTagPress(tag)}
                  style={({ pressed }) => [styles.tagPill, selectedTagIds.includes(tag.id) ? styles.selectedPill : null, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={styles.tagName}>#{tag.name}</Text>
                  <Text style={styles.pillCount}>{tag.imageCount}</Text>
                  {isSelectionMode ? <Ionicons color={selectedTagIds.includes(tag.id) ? colors.primary.active : colors.text.tertiary} name={selectedTagIds.includes(tag.id) ? 'checkmark-circle' : 'ellipse-outline'} size={16} /> : null}
                </Pressable>
              </View>
            )}
            showsVerticalScrollIndicator={false}
            style={styles.tagListViewport}
          />
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
      onClose={() => {
        setIsCreateDialogVisible(false);
        setCreateTagValue('');
      }}
      onPrimary={submitCreateTag}
      primaryDisabled={!createTagValue.trim()}
      primaryLabel="新增标签"
      title="新增标签"
      visible={isCreateDialogVisible}
    >
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setCreateTagValue}
        onSubmitEditing={submitCreateTag}
        placeholder="输入标签名称"
        placeholderTextColor={colors.text.placeholder}
        selectionColor={colors.primary.default}
        style={styles.dialogInput}
        value={createTagValue}
      />
    </AppDialog>
    <AppDialog
      danger
      message={deleteTag ? `删除 #${deleteTag.name} 只会移除标签和图片关联，不会删除图片。` : ''}
      onClose={() => setDeleteTag(null)}
      onPrimary={confirmDeleteTag}
      primaryLabel="确认删除"
      title="删除标签"
      visible={Boolean(deleteTag)}
    />
    <AppDialog
      danger
      message={`将删除已选 ${selectedCount} 个标签，并移除它们与图片的关联。图片原文件、缩略图和图片记录都会保留。`}
      onClose={() => setIsBatchDeleteDialogVisible(false)}
      onPrimary={confirmBatchDeleteTags}
      primaryDisabled={selectedCount === 0}
      primaryLabel="确认批量删除"
      title="批量删除标签"
      visible={isBatchDeleteDialogVisible}
    />
    </>
  );
}

const styles = StyleSheet.create({
  topSection: {
    paddingTop: spacing[1],
    paddingBottom: spacing[3],
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: protoColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  newBtnText: {
    fontFamily: typography.family.base,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    color: protoColors.onPrimary,
    fontWeight: '600',
  },
  headerAction: {
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: 'center',
    width: 28,
    ...shadows.sm,
  },
  headerActionActive: {
    backgroundColor: protoColors.surfaceContainerHigh,
    borderColor: protoColors.outlineVariant,
  },
  searchBlock: {
    marginBottom: spacing[4],
  },
  selectionPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    padding: spacing[3],
  },
  selectionCopy: {
    gap: spacing[1],
  },
  selectionTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  selectionMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  selectionButton: {
    alignItems: 'center',
    backgroundColor: protoColors.surfaceContainerHigh,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  selectionButtonText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '700',
  },
  selectionButtonDanger: {
    alignItems: 'center',
    backgroundColor: colors.semantic.dangerBackground,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  selectionButtonDangerText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
    fontWeight: '700',
  },
  emptyInline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyInlineTitle: {
    fontFamily: typography.family.base,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: protoColors.onSurface,
  },
  emptyInlineDesc: {
    fontFamily: typography.family.base,
    fontSize: 12,
    lineHeight: 16,
    color: protoColors.outline,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  section: {
    gap: rhythm.listCardGap,
  },
  listHeader: {
    gap: rhythm.screenSectionGap,
    paddingBottom: rhythm.listCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
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
    marginBottom: spacing[4],
  },
  resultLabel: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    width: 48,
  },
  renameInput: {
    ...typography.textStyles.body,
    color: colors.text.title,
    flex: 1,
    minHeight: 36,
    minWidth: 0,
  },
  resultAction: {
    borderRadius: radius.pill,
    backgroundColor: protoColors.surfaceContainerHigh,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  resultActionText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '600',
  },
  dialogInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  popularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: rhythm.compactGridGap,
    rowGap: rhythm.compactGridGap,
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
    backgroundColor: protoColors.surfaceContainerHigh,
    borderColor: protoColors.outlineVariant,
  },
  popularName: {
    ...typography.textStyles.bodyStrong,
    flex: 1,
    minWidth: 0,
  },
  allTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: rhythm.compactGridGap,
    rowGap: rhythm.compactGridGap,
  },
  tagList: {
    paddingBottom: spacing[6],
    rowGap: rhythm.compactGridGap,
  },
  tagListViewport: {
    flex: 1,
  },
  tagRow: {
    columnGap: rhythm.compactGridGap,
    marginBottom: rhythm.compactGridGap,
  },
  tagCell: {
    flex: 1,
  },
  loadingMore: {
    marginVertical: spacing[4],
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
    backgroundColor: protoColors.surfaceContainerHigh,
    borderColor: protoColors.outlineVariant,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1.5],
    minHeight: 32,
    paddingHorizontal: spacing[2],
  },
  selectedPill: {
    backgroundColor: protoColors.surfaceContainerHigh,
    borderColor: protoColors.outlineVariant,
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
  disabled: {
    opacity: 0.45,
  },
});









