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

  return (
    <ScreenScaffold decorativeTitle="Tags" footer={footer} scrollable title="标签">
      <SearchBar onChangeText={setSearchText} placeholder="搜索标签" value={searchText} />
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
        <View style={styles.grid}>
          {visibleTags.map((tag, index) => (
            <Pressable key={tag.id} onPress={() => onOpenTag(tag.id)} style={({ pressed }) => [styles.tagCard, index === 0 && styles.tagCardActive, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={styles.tagName}>
                {tag.name}
              </Text>
              <Text style={styles.countBadge}>{tag.imageCount}</Text>
            </Pressable>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  tagCard: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    justifyContent: 'center',
    minHeight: 70,
    padding: spacing[3],
    width: '30.8%',
  },
  tagCardActive: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  tagName: {
    ...typography.textStyles.bodyStrong,
    textAlign: 'center',
  },
  countBadge: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  pressed: {
    opacity: 0.8,
  },
});
