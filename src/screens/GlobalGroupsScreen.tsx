import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
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
    <ScreenScaffold decorativeTitle="Groups" footer={footer} scrollable title="分组">
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
          <View style={styles.typeRow}>
            <Text style={styles.typePill}>全部 IP</Text>
          </View>
          {groupedSections.flatMap((section) => section.items).map((group) => (
            <Pressable key={group.id} onPress={() => onOpenGroup(group.ipId, group.id)} style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}>
              {group.coverThumbnailFileUri ? (
                <ImageBackground imageStyle={styles.coverImage} resizeMode="cover" source={{ uri: group.coverThumbnailFileUri }} style={styles.coverWrap}>
                  <View style={styles.groupOverlay}>
                    <GroupCardCopy group={group} />
                  </View>
                </ImageBackground>
              ) : (
                <View style={[styles.coverWrap, styles.coverEmpty]}>
                  <Ionicons color={colors.primary.default} name="images-outline" size={26} />
                  <GroupCardCopy group={group} />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

function GroupCardCopy({ group }: { group: GlobalGroupListItem }) {
  return (
    <View style={styles.groupBody}>
      <View style={styles.groupHeader}>
        <Text numberOfLines={1} style={styles.groupName}>
          {group.name}
        </Text>
        <Text style={styles.groupType}>{getGroupTypeLabel(group.type)}</Text>
      </View>
      <Text style={styles.metaText}>
        {group.ipName} · {group.imageCount} 张图片 · {formatDate(group.recentUpdatedAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.8,
  },
  list: {
    gap: spacing[3],
  },
  typeRow: {
    flexDirection: 'row',
  },
  typePill: {
    ...typography.textStyles.caption,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.primary,
    overflow: 'hidden',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  groupCard: {
    borderRadius: radius.lg,
    minHeight: 96,
    overflow: 'hidden',
  },
  coverWrap: {
    backgroundColor: colors.background.empty,
    minHeight: 96,
  },
  coverImage: {
    borderRadius: radius.lg,
  },
  coverEmpty: {
    justifyContent: 'center',
    padding: spacing[4],
  },
  groupOverlay: {
    backgroundColor: colors.overlay.heroSurface,
    flex: 1,
    justifyContent: 'center',
    padding: spacing[4],
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
    borderRadius: radius.pill,
    color: colors.primary.active,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  metaText: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
});
