import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { commonEmptyStateCopy } from '../constants/copy';
import { getGroupTypeLabel, GROUP_TYPE_OPTIONS } from '../constants/groups';
import { groupRepository, type GlobalGroupListItem } from '../database';
import { colors, radius, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import { formatDate } from '../utils/formatters';

interface GlobalGroupsScreenProps {
  refreshToken: number;
  footer?: ReactNode;
  onEditGroup: (ipId: number, groupId: number) => void;
  onOpenGroup: (ipId: number, groupId: number) => void;
}

export function GlobalGroupsScreen({ refreshToken, footer, onEditGroup, onOpenGroup }: GlobalGroupsScreenProps) {
  const { showToast } = useToast();
  const [actionGroup, setActionGroup] = useState<GlobalGroupListItem | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GlobalGroupListItem | null>(null);
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
  function confirmDeleteGroup() {
    if (!deleteGroup) {
      return;
    }

    const group = deleteGroup;
    setDeleteGroup(null);
    void (async () => {
      try {
        const deletedCount = await groupRepository.deleteById(group.id);
        if (deletedCount === 0) {
          throw new Error('没有找到这个分组。');
        }
        showToast('已删除分组');
        reload();
      } catch (error) {
        showToast(error instanceof Error ? `删除分组失败：${error.message}` : '删除分组失败');
      }
    })();
  }

  return (
    <>
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
          <Text style={styles.scopePill}>全部 IP</Text>
          {groupedSections.map((section) => (
            <View key={section.value} style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.label}</Text>
                <Text style={styles.sectionCount}>{section.items.length}</Text>
              </View>
              {section.items.map((group) => (
                <Pressable
                  key={group.id}
                  onLongPress={() => setActionGroup(group)}
                  onPress={() => onOpenGroup(group.ipId, group.id)}
                  style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}
                >
                  <View style={styles.coverWrap}>
                    {group.coverThumbnailFileUri ? (
                      <Image resizeMode="cover" source={{ uri: group.coverThumbnailFileUri }} style={styles.coverImage} />
                    ) : (
                      <View style={styles.coverEmpty}>
                        <Ionicons color={colors.primary.default} name="images-outline" size={22} />
                      </View>
                    )}
                  </View>
                  <GroupCardCopy group={group} />
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
    <AppActionSheet
      items={actionGroup ? [
        { key: 'view', label: '查看图片', icon: 'images-outline', onPress: () => onOpenGroup(actionGroup.ipId, actionGroup.id) },
        { key: 'edit', label: '编辑分组', icon: 'create-outline', onPress: () => onEditGroup(actionGroup.ipId, actionGroup.id) },
        {
          key: 'pin',
          label: actionGroup.isPinned ? '取消置顶' : '置顶分组',
          icon: 'pin-outline',
          onPress: () => {
            void (async () => {
              await groupRepository.updatePinned(actionGroup.id, !actionGroup.isPinned);
              showToast(actionGroup.isPinned ? '已取消置顶' : '已置顶');
              reload();
            })();
          },
        },
        { key: 'delete', label: '删除分组', icon: 'trash-outline', danger: true, onPress: () => setDeleteGroup(actionGroup) },
      ] : []}
      message="删除分组不会删除图片，图片会保留在所属 IP 中。"
      onClose={() => setActionGroup(null)}
      title={actionGroup?.name ?? '分组操作'}
      visible={Boolean(actionGroup)}
    />
    <AppDialog
      danger
      message={deleteGroup ? `删除「${deleteGroup.name}」后，分组内图片会保留并移动到未分组。` : ''}
      onClose={() => setDeleteGroup(null)}
      onPrimary={confirmDeleteGroup}
      primaryLabel="确认删除"
      title="删除分组"
      visible={Boolean(deleteGroup)}
    />
    </>
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
      <Text numberOfLines={1} style={styles.metaText}>
        {group.ipName}
      </Text>
      <Text style={styles.metaText}>
        {group.imageCount} 张图片 · {formatDate(group.recentUpdatedAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.8,
  },
  list: {
    gap: spacing[4],
  },
  scopePill: {
    ...typography.textStyles.caption,
    alignSelf: 'flex-start',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.primary,
    overflow: 'hidden',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  sectionBlock: {
    gap: spacing[2],
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[1],
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  sectionCount: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  groupCard: {
    ...shadows.xs,
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 104,
    overflow: 'hidden',
    padding: spacing[3],
  },
  coverWrap: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    flexShrink: 0,
    height: 74,
    overflow: 'hidden',
    width: 92,
  },
  coverEmpty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  groupBody: {
    flex: 1,
    gap: spacing[2],
    minWidth: 0,
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  groupName: {
    ...typography.textStyles.bodyStrong,
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
