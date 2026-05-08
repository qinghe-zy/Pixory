import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppActionSheet } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SecureImage } from '../components/SecureImage';
import { commonEmptyStateCopy } from '../constants/copy';
import { getGroupTypeLabel, GROUP_TYPE_OPTIONS } from '../constants/groups';
import { resolvePersonalCoverBlurRadius } from '../constants/privacy';
import { groupRepository, runWithDatabaseSpace, type GlobalGroupListItem, type PixorySpace } from '../database';
import { colors, radius, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import { formatDate } from '../utils/formatters';

interface GlobalGroupsScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  footer?: ReactNode;
  onCreateFirstIp?: () => void;
  onOpenCoverPicker: (ipId: number, groupId: number) => void;
  onEditGroup: (ipId: number, groupId: number) => void;
  onOpenGroup: (ipId: number, groupId: number) => void;
  onImportImagesToGroup?: (ipId: number, groupId: number) => void;
  onImportVideosToGroup?: (ipId: number, groupId: number) => void;
}

export function GlobalGroupsScreen({
  space = 'normal',
  refreshToken,
  footer,
  onCreateFirstIp,
  onOpenCoverPicker,
  onEditGroup,
  onOpenGroup,
  onImportImagesToGroup,
  onImportVideosToGroup,
}: GlobalGroupsScreenProps) {
  const { showToast } = useToast();
  const [actionGroup, setActionGroup] = useState<GlobalGroupListItem | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<GlobalGroupListItem | null>(null);
  const [selectedIpId, setSelectedIpId] = useState<number | null>(null);
  const [scopeMenuVisible, setScopeMenuVisible] = useState(false);
  const { data: groups = [], isLoading, errorMessage, reload } = useScreenLoad<GlobalGroupListItem[]>(
    () => runWithDatabaseSpace(space, (db) => groupRepository.findOverview(db)),
    [refreshToken, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取分组总览失败：${message}`;
      },
      initialData: [],
    }
  );

  const ipScopes = [...new Map(groups.map((group) => [group.ipId, { id: group.ipId, name: group.ipName }])).values()];
  const visibleGroups = selectedIpId == null ? groups : groups.filter((group) => group.ipId === selectedIpId);
  const selectedIpName = selectedIpId == null ? '全部 IP' : ipScopes.find((ip) => ip.id === selectedIpId)?.name ?? '当前 IP';
  const groupedSections = GROUP_TYPE_OPTIONS.map((option) => ({
    ...option,
    items: visibleGroups.filter((group) => group.type === option.value),
  })).filter((section) => section.items.length > 0);

  function getGroupCoverBlurRadius(group: GlobalGroupListItem): number | undefined {
    return space === 'personal' && (group.ipCoverBlurEnabled ?? true) ? resolvePersonalCoverBlurRadius(group.ipCoverBlurRadius) : undefined;
  }

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
    <ScreenScaffold backgroundVariant="archive" decorativeTitle="Groups" footer={footer} scrollable title="分组">
      <PageStateBlock
        emptyActionLabel={onCreateFirstIp ? '去首页创建 IP' : undefined}
        emptyDescription="分组需要先归属于一个 IP。先创建或打开 IP，再在详情页新建分组。"
        emptyContainerStyle={styles.emptyGuideOffset}
        emptyIconName="folder-open-outline"
        emptyTitle={commonEmptyStateCopy.noGroupsTitle}
        errorMessage={errorMessage}
        isEmpty={!isLoading && groups.length === 0}
        loading={isLoading}
        loadingDescription="本地分组数据读取完成后，这里会展示全部分组。"
        loadingTitle="正在读取分组"
        onEmptyAction={onCreateFirstIp}
        onRetry={reload}
      >
        <View style={styles.list}>
          <Pressable onPress={() => setScopeMenuVisible(true)} style={({ pressed }) => [styles.scopePill, pressed && styles.pressed]}>
            <Text numberOfLines={1} style={styles.scopePillText}>{selectedIpName}</Text>
            <Ionicons color={colors.text.secondary} name="chevron-down" size={14} />
          </Pressable>
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
                      <SecureImage blurRadius={getGroupCoverBlurRadius(group)} contentFit="cover" space={space} style={styles.coverImage} uri={group.coverThumbnailFileUri} />
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
        ...(onImportImagesToGroup ? [{ key: 'add-images', label: '添加图片', icon: 'image-outline' as const, onPress: () => onImportImagesToGroup(actionGroup.ipId, actionGroup.id) }] : []),
        ...(onImportVideosToGroup ? [{ key: 'add-videos', label: '添加视频', icon: 'videocam-outline' as const, onPress: () => onImportVideosToGroup(actionGroup.ipId, actionGroup.id) }] : []),
        { key: 'cover', label: actionGroup.coverSource === 'custom' ? '更换封面' : '选择封面', icon: 'image-outline', onPress: () => onOpenCoverPicker(actionGroup.ipId, actionGroup.id) },
        { key: 'edit', label: '编辑分组', icon: 'create-outline', onPress: () => onEditGroup(actionGroup.ipId, actionGroup.id) },
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
      message="删除分组不会删除图片，图片会保留在所属 IP 中。"
      onClose={() => setActionGroup(null)}
      title={actionGroup?.name ?? '分组操作'}
      visible={Boolean(actionGroup)}
    />
    <AppActionSheet
      items={[
        { key: 'all', label: '全部 IP', icon: 'albums-outline', onPress: () => setSelectedIpId(null) },
        ...ipScopes.map((ip) => ({
          key: String(ip.id),
          label: ip.name,
          icon: 'folder-outline' as const,
          onPress: () => setSelectedIpId(ip.id),
        })),
      ]}
      onClose={() => setScopeMenuVisible(false)}
      title="筛选 IP"
      visible={scopeMenuVisible}
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
  emptyGuideOffset: {
    paddingTop: spacing[8],
  },
  scopePill: {
    alignItems: 'center',
    ...typography.textStyles.caption,
    alignSelf: 'flex-start',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.primary,
    flexDirection: 'row',
    gap: spacing[1],
    overflow: 'hidden',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  scopePillText: {
    ...typography.textStyles.caption,
    color: colors.text.primary,
    maxWidth: 220,
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
