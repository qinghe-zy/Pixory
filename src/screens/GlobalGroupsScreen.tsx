import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SectionHeader } from '../components/SectionHeader';
import { commonEmptyStateCopy } from '../constants/copy';
import { getGroupTypeLabel, GROUP_TYPE_OPTIONS } from '../constants/groups';
import { groupRepository, type GlobalGroupListItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { formatDate } from '../utils/formatters';

interface GlobalGroupsScreenProps {
  refreshToken: number;
  footer?: ReactNode;
  onOpenGroup: (ipId: number, groupId: number) => void;
}

export function GlobalGroupsScreen({ refreshToken, footer, onOpenGroup }: GlobalGroupsScreenProps) {
  const { data: groups = [], isLoading, errorMessage, reload } = useScreenLoad<GlobalGroupListItem[]>(
    () => groupRepository.findOverview(),
    [refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组总览失败：${message}`;
      },
      initialData: [],
    }
  );

  const groupedSections = GROUP_TYPE_OPTIONS.map((option) => ({
    ...option,
    items: groups.filter((group) => group.type === option.value),
  })).filter((section) => section.items.length > 0);

  return (
    <ScreenScaffold footer={footer} scrollable title="分组">
      <PageStateBlock
        emptyActionLabel={undefined}
        emptyDescription="创建分组后，这里会展示全部 IP 下的真实分组数据。"
        emptyIconName="folder-open-outline"
        emptyTitle={commonEmptyStateCopy.noGroupsTitle}
        errorMessage={errorMessage}
        isEmpty={!isLoading && groups.length === 0}
        loading={isLoading}
        loadingDescription="本地分组数据读取完成后，这里会展示全部分组。"
        loadingTitle="正在读取分组"
        onRetry={reload}
      >
        <View style={styles.list}>
          {groupedSections.map((section) => (
            <View key={section.value} style={styles.sectionBlock}>
              <SectionHeader title={section.label} />
              {section.items.map((group) => (
                <Pressable key={group.id} onPress={() => onOpenGroup(group.ipId, group.id)} style={({ pressed }) => [pressed && styles.pressed]}>
                  <ContentCard style={styles.groupCard}>
                    <View style={styles.coverWrap}>
                      {group.coverThumbnailFileUri ? (
                        <Image resizeMode="cover" source={{ uri: group.coverThumbnailFileUri }} style={styles.coverImage} />
                      ) : (
                        <View style={styles.coverEmpty}>
                          <Ionicons color={colors.primary.default} name="images-outline" size={26} />
                          <Text style={styles.coverLabel}>{getGroupTypeLabel(group.type)}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.groupBody}>
                      <View style={styles.groupHeader}>
                        <Text numberOfLines={1} style={styles.groupName}>
                          {group.name}
                        </Text>
                        <Text style={styles.groupType}>{getGroupTypeLabel(group.type)}</Text>
                      </View>
                      <Text numberOfLines={2} style={styles.groupDescription}>
                        {group.description || '还没有分组说明'}
                      </Text>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaText}>{group.ipName}</Text>
                        <Text style={styles.metaText}>{group.imageCount} 张图片</Text>
                        <Text style={styles.metaText}>最近更新 {formatDate(group.recentUpdatedAt)}</Text>
                      </View>
                    </View>
                  </ContentCard>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.8,
  },
  list: {
    gap: spacing[4],
  },
  sectionBlock: {
    gap: spacing[3],
  },
  groupCard: {
    gap: spacing[4],
    padding: spacing[4],
  },
  coverWrap: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  coverImage: {
    aspectRatio: 3 / 2,
    width: '100%',
  },
  coverEmpty: {
    alignItems: 'center',
    aspectRatio: 3 / 2,
    gap: spacing[2],
    justifyContent: 'center',
    padding: spacing[4],
  },
  coverLabel: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  groupBody: {
    gap: spacing[2],
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  groupName: {
    ...typography.textStyles.sectionTitle,
    flex: 1,
  },
  groupType: {
    ...typography.textStyles.micro,
    backgroundColor: colors.background.tag,
    borderRadius: radius.sm,
    color: colors.primary.default,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  groupDescription: {
    ...typography.textStyles.body,
    color: colors.text.body,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  metaText: {
    ...typography.textStyles.caption,
  },
});
