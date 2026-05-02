import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { commonEmptyStateCopy } from '../constants/copy';
import { tagRepository, type TagUsageItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { formatDate } from '../utils/formatters';

interface TagsOverviewScreenProps {
  refreshToken: number;
  footer?: ReactNode;
  onOpenTag: (tagId: number) => void;
}

export function TagsOverviewScreen({ refreshToken, footer, onOpenTag }: TagsOverviewScreenProps) {
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

  return (
    <ScreenScaffold footer={footer} scrollable title="标签">
      <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="给图片添加标签后，这里会展示标签名称、使用次数和结果入口。"
        emptyIconName="pricetags-outline"
        emptyTitle="还没有标签"
        errorMessage={errorMessage}
        isEmpty={!isLoading && tags.length === 0}
        loading={isLoading}
        loadingDescription="本地标签数据读取完成后，这里会展示全部标签。"
        loadingTitle="正在读取标签"
        onRetry={reload}
      >
        <View style={styles.list}>
          {tags.map((tag) => (
            <Pressable key={tag.id} onPress={() => onOpenTag(tag.id)} style={({ pressed }) => [pressed && styles.pressed]}>
              <ContentCard style={styles.tagCard}>
                <View style={styles.cardHeader}>
                  <Text numberOfLines={1} style={styles.tagName}>
                    #{tag.name}
                  </Text>
                  <Text style={styles.countBadge}>{tag.imageCount}</Text>
                </View>
                <Text style={styles.metaText}>
                  {tag.imageCount > 0 && tag.lastUsedAt ? `最近使用 ${formatDate(tag.lastUsedAt)}` : '当前还没有关联中的图片'}
                </Text>
              </ContentCard>
            </Pressable>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing[3],
  },
  tagCard: {
    gap: spacing[2],
    padding: spacing[4],
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  tagName: {
    ...typography.textStyles.sectionTitle,
    flex: 1,
  },
  countBadge: {
    ...typography.textStyles.caption,
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    color: colors.primary.default,
    overflow: 'hidden',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  metaText: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  pressed: {
    opacity: 0.8,
  },
});
