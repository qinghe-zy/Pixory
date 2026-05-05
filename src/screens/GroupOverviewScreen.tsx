import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { ContentCard } from '../components/ContentCard';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SectionHeader } from '../components/SectionHeader';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { getGroupTypeLabel, GROUP_TYPE_OPTIONS } from '../constants/groups';
import { groupRepository, ipRepository, runWithDatabaseSpace, type GroupListItem, type IpRecord, type PixorySpace } from '../database';
import { colors, componentTokens, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import { formatDate } from '../utils/formatters';

interface GroupOverviewScreenProps {
  ipId: number;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onCreateGroup: () => void;
  onEditGroup: (groupId: number) => void;
  onOpenGroup: (groupId: number) => void;
}

export function GroupOverviewScreen({
  ipId,
  space = 'normal',
  refreshToken,
  onBack,
  onCreateGroup,
  onEditGroup,
  onOpenGroup,
}: GroupOverviewScreenProps) {
  const { showToast } = useToast();
  const [actionGroup, setActionGroup] = useState<GroupListItem | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GroupListItem | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ ip: IpRecord | null; groups: GroupListItem[] }>(
    async () => {
      const [ip, groups] = await runWithDatabaseSpace(space, () => Promise.all([
        ipRepository.findById(ipId),
        groupRepository.findOverviewByIpId(ipId),
      ]));

      return { ip, groups };
    },
    [ipId, refreshToken, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组失败：${message}`;
      },
      initialData: { groups: [], ip: null },
    }
  );

  const rightSlot = useMemo(
    () => (
      <Pressable onPress={onCreateGroup} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
        <Ionicons color={colors.primary.default} name="add" size={20} />
      </Pressable>
    ),
    [onCreateGroup]
  );

  const ip = data?.ip ?? null;
  const groups = data?.groups ?? [];
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
        const deletedCount = await runWithDatabaseSpace(space, () => groupRepository.deleteById(group.id));
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
    <ScreenScaffold onBack={onBack} rightAction={rightSlot} scrollable title="分组">
      {ip ? <Text style={styles.subhead}>{ip.name}</Text> : null}

      <PageStateBlock
        emptyActionLabel={commonButtonCopy.createGroup}
        emptyDescription="创建分组后，可以按季节/时段、场景/构图和用途/渠道整理素材。"
        emptyIconName="folder-open-outline"
        emptyTitle={commonEmptyStateCopy.noGroupsTitle}
        errorMessage={errorMessage}
        isEmpty={!isLoading && groups.length === 0}
        loading={isLoading}
        loadingDescription="本地分组总览读取完成后，这里会展示当前 IP 下的全部分组。"
        loadingTitle="正在读取分组"
        onEmptyAction={onCreateGroup}
        onRetry={reload}
      >
        <View style={styles.list}>
          {groupedSections.map((section) => (
            <View key={section.value} style={styles.sectionBlock}>
              <SectionHeader title={section.label} />
              {section.items.map((group) => (
                <Pressable
                  key={group.id}
                  onLongPress={() => setActionGroup(group)}
                  onPress={() => onOpenGroup(group.id)}
                  style={({ pressed }) => [pressed && styles.pressed]}
                >
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
                      <Text numberOfLines={1} style={styles.groupDescription}>
                        {group.description || '还没有分组说明'}
                      </Text>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaText}>{group.imageCount} 张图片</Text>
                        <Text style={styles.metaText}>{formatDate(group.recentUpdatedAt)}</Text>
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
    <AppActionSheet
      items={actionGroup ? [
        { key: 'view', label: '查看图片', icon: 'images-outline', onPress: () => onOpenGroup(actionGroup.id) },
        { key: 'edit', label: '编辑分组', icon: 'create-outline', onPress: () => onEditGroup(actionGroup.id) },
        {
          key: 'pin',
          label: actionGroup.isPinned ? '取消置顶' : '置顶分组',
          icon: 'pin-outline',
          onPress: () => {
            void (async () => {
              await runWithDatabaseSpace(space, () => groupRepository.updatePinned(actionGroup.id, !actionGroup.isPinned));
              showToast(actionGroup.isPinned ? '已取消置顶' : '已置顶');
              reload();
            })();
          },
        },
        { key: 'delete', label: '删除分组', icon: 'trash-outline', danger: true, onPress: () => setDeleteGroup(actionGroup) },
      ] : []}
      message="删除分组不会删除图片，图片会保留在当前 IP 中。"
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

const styles = StyleSheet.create({
  headerAction: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: componentTokens.iconButton.radius,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    width: componentTokens.iconButton.size,
  },
  pressed: {
    opacity: 0.8,
  },
  subhead: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    marginTop: -spacing[4],
  },
  list: {
    gap: spacing[4],
  },
  sectionBlock: {
    gap: spacing[3],
  },
  groupCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 98,
    padding: spacing[3],
  },
  coverWrap: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    flexShrink: 0,
    height: 78,
    overflow: 'hidden',
    width: 112,
  },
  coverImage: {
    height: '100%',
    width: '100%',
  },
  coverEmpty: {
    alignItems: 'center',
    gap: spacing[2],
    height: '100%',
    justifyContent: 'center',
    padding: spacing[3],
  },
  coverLabel: {
    ...typography.textStyles.caption,
    color: colors.text.body,
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
    borderRadius: radius.sm,
    color: colors.primary.default,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  groupDescription: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  metaText: {
    ...typography.textStyles.caption,
  },
});
