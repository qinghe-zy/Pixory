import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { SearchBar } from '../components/SearchBar';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { commonEmptyStateCopy } from '../constants/copy';
import { tagRepository, type TagUsageItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';

interface TagsOverviewScreenProps {
  refreshToken: number;
  footer?: ReactNode;
  onOpenTag: (tagId: number) => void;
}

export function TagsOverviewScreen({ refreshToken, footer, onOpenTag }: TagsOverviewScreenProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
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
  const selectedTag = tags.find((tag) => tag.id === selectedTagId) ?? null;
  const shouldShowPopular = !searchText.trim() && popularTags.length > 0;

  return (
    <ScreenScaffold decorativeTitle="Tags" footer={footer} scrollable title="标签">
      <SearchBar onChangeText={setSearchText} placeholder="搜索标签" value={searchText} />
      {selectedTag ? (
        <View style={styles.resultPanel}>
          <View style={styles.resultCopy}>
            <Text numberOfLines={1} style={styles.resultTitle}>#{selectedTag.name}</Text>
            <Text style={styles.resultMeta}>{selectedTag.imageCount} 张图片</Text>
          </View>
          <Pressable onPress={() => onOpenTag(selectedTag.id)} style={({ pressed }) => [styles.resultAction, pressed && styles.pressed]}>
            <Text style={styles.resultActionText}>查看结果</Text>
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
          {shouldShowPopular ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>热门标签</Text>
              <View style={styles.popularGrid}>
                {popularTags.map((tag) => (
                  <Pressable
                    key={tag.id}
                    onPress={() => setSelectedTagId(tag.id)}
                    style={({ pressed }) => [
                      styles.popularTag,
                      selectedTagId === tag.id && styles.selectedTag,
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
                  onPress={() => setSelectedTagId(tag.id)}
                  style={({ pressed }) => [
                    styles.tagPill,
                    selectedTagId === tag.id && styles.selectedPill,
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
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing[6],
  },
  section: {
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  resultPanel: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'space-between',
    padding: spacing[4],
  },
  resultCopy: {
    flex: 1,
    gap: spacing[1],
  },
  resultTitle: {
    ...typography.textStyles.bodyStrong,
  },
  resultMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  resultAction: {
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  resultActionText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '600',
  },
  popularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  popularTag: {
    alignItems: 'flex-start',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    justifyContent: 'space-between',
    minHeight: 58,
    padding: spacing[3],
    width: '48.3%',
  },
  selectedTag: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  popularName: {
    ...typography.textStyles.bodyStrong,
  },
  allTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  tagPill: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 32,
    paddingHorizontal: spacing[3],
  },
  selectedPill: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  tagName: {
    ...typography.textStyles.caption,
    color: colors.text.body,
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
