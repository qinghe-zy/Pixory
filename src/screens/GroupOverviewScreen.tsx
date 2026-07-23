import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { ContentCard } from '../components/ContentCard';
import { GroupRenameDialog } from '../components/GroupRenameDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SectionHeader } from '../components/SectionHeader';
import { SecureImage } from '../components/SecureImage';
import { commonButtonCopy, commonEmptyStateCopy } from '../constants/copy';
import { getGroupTypeLabel, GROUP_TYPE_OPTIONS } from '../constants/groups';
import { resolvePersonalCoverBlurRadius } from '../constants/privacy';
import { groupRepository, ipRepository, runWithDatabaseSpace, type GroupListItem, type IpRecord, type PixorySpace } from '../database';
import { colors, componentTokens, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import { BlurView } from 'expo-blur';
import { LiquidGlassBezel } from '../components/LiquidGlassBezel';
import { formatDate } from '../utils/formatters';

interface GroupOverviewScreenProps {
  ipId: number;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onCreateGroup: () => void;
  onEditGroup: (groupId: number) => void;
  onOpenCoverPicker: (groupId: number) => void;
  onOpenGroup: (groupId: number) => void;
}

export function GroupOverviewScreen({
  ipId,
  space = 'normal',
  refreshToken,
  onBack,
  onCreateGroup,
  onEditGroup,
  onOpenCoverPicker,
  onOpenGroup,
}: GroupOverviewScreenProps) {
  const { showToast } = useToast();
  const [actionGroup, setActionGroup] = useState<GroupListItem | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GroupListItem | null>(null);
  const [renameGroup, setRenameGroup] = useState<GroupListItem | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ ip: IpRecord | null; groups: GroupListItem[] }>(
    async () => {
      const [ip, groups] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findById(db, ipId),
        groupRepository.findOverviewByIpId(db, ipId),
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
      <View style={styles.headerActionWrapper}>
        <Pressable onPress={onCreateGroup} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
          <BlurView intensity={50} style={styles.headerActionBlur} tint="light">
            <LiquidGlassBezel radius={componentTokens.iconButton.radius} />
            <Ionicons color={colors.primary.default} name="add" size={20} />
          </BlurView>
        </Pressable>
      </View>
    ),
    [onCreateGroup]
  );

  const ip = data?.ip ?? null;
  const groups = data?.groups ?? [];
  const groupCoverBlurRadius = space === 'personal' && (ip?.coverBlurEnabled ?? true) ? resolvePersonalCoverBlurRadius(ip?.coverBlurRadius) : undefined;
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
        const deletedCount = await runWithDatabaseSpace(space, (db) => groupRepository.deleteById(db, group.id));
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
    <ScreenScaffold backgroundVariant="archive" onBack={onBack} rightAction={rightSlot} scrollable title="分组">
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
                <View key={group.id} style={styles.groupCardWrapper}>
                  <Pressable
                    onLongPress={() => setActionGroup(group)}
                    onPress={() => onOpenGroup(group.id)}
                    style={({ pressed }) => [styles.groupCardFloating, pressed && styles.pressed]}
                  >
                    <View style={styles.groupCardInner}>
                      <View style={styles.coverWrap}>
                        {group.coverThumbnailFileUri ? (
                          <SecureImage blurRadius={groupCoverBlurRadius} contentFit="cover" space={space} style={styles.coverImage} uri={group.coverThumbnailFileUri} />
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
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
    <AppActionSheet
      items={actionGroup ? [
        { key: 'view', label: '查看图片', icon: 'images-outline', onPress: () => onOpenGroup(actionGroup.id) },
        { key: 'cover', label: actionGroup.coverSource === 'custom' ? '更换封面' : '选择封面', icon: 'image-outline', onPress: () => onOpenCoverPicker(actionGroup.id) },
        { key: 'rename', label: '重命名', icon: 'text-outline', onPress: () => setRenameGroup(actionGroup) },
        { key: 'edit', label: '编辑分组', icon: 'create-outline', onPress: () => onEditGroup(actionGroup.id) },
        {
          key: 'pin',
          label: actionGroup.isPinned ? '取消置顶' : '置顶分组',
          icon: 'pin-outline',
          onPress: () => {
            void (async () => {
              await runWithDatabaseSpace(space, (db) => groupRepository.updatePinned(db, actionGroup.id, !actionGroup.isPinned));
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
    <GroupRenameDialog
      group={renameGroup}
      onClose={() => setRenameGroup(null)}
      onRenamed={reload}
      space={space}
      visible={Boolean(renameGroup)}
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
  headerActionWrapper: {
    ...shadows.sm,
    shadowColor: '#3A2E1D',
    shadowOpacity: 0.15,
    borderRadius: componentTokens.iconButton.radius,
  },
  headerAction: {
    borderRadius: componentTokens.iconButton.radius,
    height: componentTokens.iconButton.size,
    width: componentTokens.iconButton.size,
  },
  headerActionBlur: {
    alignItems: 'center',
    borderRadius: componentTokens.iconButton.radius,
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.8,
  },
  subhead: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  list: {
    gap: rhythm.entryCardGap,
  },
  sectionBlock: {
    gap: rhythm.listCardGap,
  },
  groupCardWrapper: {
    paddingBottom: rhythm.microGap,
  },
  groupCardFloating: {
    backgroundColor: colors.background.elevated,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    ...shadows.sm,
  },
  groupCardInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.listCardGap,
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
    gap: rhythm.cardContentGap,
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
    gap: rhythm.cardContentGap,
    minWidth: 0,
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
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
    gap: rhythm.compactGridGap,
  },
  metaText: {
    ...typography.textStyles.caption,
  },
});
