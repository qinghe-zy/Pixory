import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { GROUP_TYPE_OPTIONS, getGroupTypeLabel, type GroupTypeValue } from '../constants/groups';
import { GROUP_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, imageRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageListItem, type IpRecord, type PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { moveAssetsToIp } from '../services/videoMoveService';
import { mergeDraftTagNames } from '../utils/tagDrafts';
import { AppDialog } from './AppDialog';
import { AlbumSaveDialog } from './AlbumSaveDialog';
import { LightFormSection } from './LightFormSection';
import { OptionSelectRow } from './OptionSelectRow';
import { PrimaryButton } from './PrimaryButton';
import { TagMultiSelectPanel } from './TagMultiSelectPanel';
import { useToast } from './AppToast';

type OrganizeMode = 'idle' | 'replace-group' | 'add-group' | 'remove-group' | 'add-tags' | 'move-asset-ip';

interface BatchImageOrganizePanelProps {
  selectedImages: ImageListItem[];
  space?: PixorySpace;
  totalCount: number;
  currentGroupId?: number | null;
  onClearSelection: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}

export function BatchImageOrganizePanel({
  selectedImages,
  space = 'normal',
  totalCount,
  currentGroupId = null,
  onClearSelection,
  onChanged,
  onDeleted,
}: BatchImageOrganizePanelProps) {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [ips, setIps] = useState<IpRecord[]>([]);
  const [availableTags, setAvailableTags] = useState<Awaited<ReturnType<typeof tagRepository.findUsageOverviewByIpId>>>([]);
  const [mode, setMode] = useState<OrganizeMode>('idle');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(currentGroupId);
  const [tagInput, setTagInput] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [isCreateGroupDialogVisible, setIsCreateGroupDialogVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupTypeValue | null>(null);
  const [isAlbumDialogVisible, setIsAlbumDialogVisible] = useState(false);
  const [isSavingToAlbum, setIsSavingToAlbum] = useState(false);
  const [targetIpId, setTargetIpId] = useState<number | null>(null);
  const selectedImageIds = useMemo(() => selectedImages.map((image) => image.id), [selectedImages]);
  const selectedCount = selectedImages.length;
  const selectedIpIds = useMemo(() => [...new Set(selectedImages.map((image) => image.ipId))], [selectedImages]);
  const singleIpId = selectedIpIds.length === 1 ? selectedIpIds[0] : null;
  const canUseGroupActions = singleIpId != null;
  const allFavorite = selectedCount > 0 && selectedImages.every((image) => image.isFavorite);
  const moveTargetIps = useMemo(() => ips.filter((ip) => !selectedIpIds.includes(ip.id)), [ips, selectedIpIds]);

  useEffect(() => {
    let isMounted = true;

    async function loadGroups() {
      if (singleIpId == null) {
        setGroups([]);
        setAvailableTags([]);
        return;
      }

      try {
        const [nextGroups, nextTags] = await runWithDatabaseSpace(space, (db) => Promise.all([
          groupRepository.findByIpId(db, singleIpId),
          tagRepository.findUsageOverviewByIpId(db, singleIpId),
        ]));
        if (isMounted) {
          setGroups(nextGroups);
          setAvailableTags(nextTags);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : '读取分组失败');
        }
      }
    }

    loadGroups();
    return () => {
      isMounted = false;
    };
  }, [singleIpId]);

  useEffect(() => {
    let isMounted = true;
    if (selectedCount === 0) {
      setIps([]);
      return () => {
        isMounted = false;
      };
    }

    void runWithDatabaseSpace(space, (db) => ipRepository.findAll(db))
      .then((nextIps) => {
        if (isMounted) {
          setIps(nextIps);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : '读取 IP 失败');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedCount, space]);

  useEffect(() => {
    if (selectedCount === 0) {
      resetMode();
    }
  }, [selectedCount]);

  function resetMode(nextMode: OrganizeMode = 'idle') {
    setMode(nextMode);
    setErrorMessage(null);
      if (nextMode !== 'add-tags') {
        setTagInput('');
        setDraftTags([]);
    }
    if (!isGroupMode(nextMode)) {
      setSelectedGroupId(currentGroupId);
    }
    if (nextMode !== 'move-asset-ip') {
      setTargetIpId(null);
    }
  }

  function handleSaveToAlbum() {
    if (selectedCount === 0) {
      showToast('请先选择至少一个素材');
      return;
    }
    // Videos are supported, saving native videos to system Movies album.

    setIsAlbumDialogVisible(true);
  }

  async function handleCreateGroup() {
    if (singleIpId == null) {
      showToast('跨 IP 选择时不能新建分组');
      return;
    }

    const trimmedName = newGroupName.trim();
    if (!trimmedName) {
      showToast('请输入分组名称');
      return;
    }
    if (!newGroupType) {
      showToast('请选择分组类型');
      return;
    }

    try {
      const group = await runWithDatabaseSpace(space, (db) =>
        groupRepository.create(db, { ipId: singleIpId, name: trimmedName, type: newGroupType })
      );
      setGroups((current) => [group, ...current]);
      setSelectedGroupId(group.id);
      setNewGroupName('');
      setNewGroupType(null);
      setIsCreateGroupDialogVisible(false);
      onChanged();
      showToast('已新建分组');
    } catch (error) {
      showToast(error instanceof Error ? `新建分组失败：${error.message}` : '新建分组失败');
    }
  }

  async function runAction(action: () => Promise<string>, after?: () => void) {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const message = await action();
      resetMode();
      after?.();
      onChanged();
      if (message) {
        showToast(message);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '操作失败');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleGroupUpdate() {
    void runAction(async () => {
      if (selectedCount === 0) {
        throw new Error('请先选择至少一个素材。');
      }

      if (!canUseGroupActions) {
        throw new Error('跨 IP 选择时不能调整分组。');
      }

      let changedCount = 0;
      changedCount = await runWithDatabaseSpace(space, async (db) => {
        if (mode === 'replace-group') {
          return imageRepository.updateManyGroup(db, selectedImageIds, selectedGroupId);
        }
        if (selectedGroupId != null && mode === 'add-group') {
          return imageRepository.addManyToGroup(db, selectedImageIds, selectedGroupId);
        }
        if (currentGroupId != null && mode === 'remove-group') {
          return imageRepository.removeManyFromGroup(db, selectedImageIds, currentGroupId);
        }
        if (selectedGroupId != null && mode === 'remove-group') {
          return imageRepository.removeManyFromGroup(db, selectedImageIds, selectedGroupId);
        }
        return 0;
      });

      if (changedCount === 0) {
        throw new Error('没有需要更新的素材。');
      }

      if (mode === 'add-group') {
        return '已加入分组';
      }
      if (mode === 'remove-group') {
        return '已移出分组';
      }
      return '已替换分组';
    });
  }

  function handleAddTags() {
    void runAction(async () => {
      const preparedTags = mergeDraftTagNames(draftTags, tagInput);
      if (selectedCount === 0) {
        throw new Error('请先选择至少一个素材。');
      }
      if (preparedTags.length === 0) {
        throw new Error('请至少输入一个标签。');
      }

      const addedTags = await runWithDatabaseSpace(space, (db) => tagRepository.addTagsToImages(db, selectedImageIds, preparedTags));
      if (addedTags.length === 0) {
        throw new Error('没有可添加的标签。');
      }

      return '已添加标签';
    });
  }

  function handleFavoriteUpdate(isFavorite: boolean) {
    void runAction(async () => {
      if (selectedCount === 0) {
        throw new Error('请先选择至少一个素材。');
      }

      const changedCount = await runWithDatabaseSpace(space, (db) => imageRepository.updateManyFavorite(db, selectedImageIds, isFavorite));
      if (changedCount === 0) {
        throw new Error('没有可更新的素材。');
      }

      return isFavorite ? '已收藏' : '已取消收藏';
    });
  }

  function handleMoveAssetsToIp() {
    void runAction(
      async () => {
        if (targetIpId == null) {
          throw new Error('请选择目标 IP。');
        }
        const result = await moveAssetsToIp({ space, assetIds: selectedImageIds, targetIpId });
        if (result.movedCount === 0) {
          throw new Error('没有可移动的素材。');
        }
        return '已移动到目标 IP';
      },
      () => {
        onClearSelection();
        onChanged();
      }
    );
  }

  function confirmSoftDelete() {
    const idsToDelete = [...selectedImageIds];
    setIsDeleteDialogVisible(false);

    void runAction(
      async () => {
        const deletedCount = await runWithDatabaseSpace(space, (db) => imageRepository.softDeleteMany(db, idsToDelete));
        if (deletedCount === 0) {
          throw new Error('没有可删除的素材。');
        }
        return '';
      },
      () => {
        onClearSelection();
        onDeleted();
        showToast({
          message: '已移入回收站',
          actionLabel: '撤销',
          durationMs: 5200,
          onAction: () => {
            void (async () => {
              const restoredCount = await runWithDatabaseSpace(space, (db) => imageRepository.restoreMany(db, idsToDelete));
              if (restoredCount > 0) {
                onChanged();
                showToast('已恢复');
              }
            })();
          },
        });
      }
    );
  }

  if (selectedCount === 0) {
    return null;
  }

  return (
    <>
      <View style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>已选择 {selectedCount} 个素材</Text>
            <Text style={styles.meta}>共 {totalCount} 个素材{canUseGroupActions ? '' : ' · 跨 IP 仅支持标签、收藏、删除'}</Text>
          </View>
          <Pressable onPress={onClearSelection} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Ionicons color={colors.text.secondary} name="close" size={18} />
          </Pressable>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {isGroupMode(mode) ? (
          <View style={styles.inlinePanel}>
            <LightFormSection title={getGroupModeTitle(mode)} hint={getGroupModeHint(mode)}>
              {currentGroupId != null && mode === 'remove-group' ? (
                <Text style={styles.helperText}>直接从当前分组移出，不需要再次选择分组。</Text>
              ) : (
                <ScrollView style={styles.optionScroll} contentContainerStyle={styles.optionList}>
                  {mode === 'replace-group' ? (
                  <OptionSelectRow label="无分组" meta="保留在当前 IP" onPress={() => setSelectedGroupId(null)} selected={selectedGroupId == null} />
                  ) : null}
                  {groups.map((group) => (
                    <OptionSelectRow
                      key={group.id}
                      label={group.name}
                      meta={`${group.isPinned ? '已置顶 · ' : ''}${getGroupTypeLabel(group.type)}`}
                      onPress={() => setSelectedGroupId(group.id)}
                      selected={selectedGroupId === group.id}
                    />
                  ))}
                  {mode !== 'remove-group' ? (
                    <Pressable onPress={() => setIsCreateGroupDialogVisible(true)} style={({ pressed }) => [styles.createGroupRow, pressed && styles.pressed]}>
                      <Ionicons color={colors.primary.default} name="add" size={18} />
                      <View style={styles.createGroupCopy}>
                        <Text style={styles.createGroupTitle}>新建分组</Text>
                        <Text style={styles.createGroupMeta}>创建后自动选为目标分组</Text>
                      </View>
                    </Pressable>
                  ) : null}
                </ScrollView>
              )}
            </LightFormSection>
            <View style={styles.inlineActions}>
              <View style={styles.primaryGrow}>
                <PrimaryButton disabled={isSubmitting} label={getGroupActionLabel(mode)} loading={isSubmitting} onPress={handleGroupUpdate} />
              </View>
              <PrimaryButton fullWidth={false} label="取消" onPress={() => resetMode()} variant="ghost" />
            </View>
          </View>
        ) : mode === 'add-tags' ? (
          <View style={styles.inlinePanel}>
            <LightFormSection title="添加标签" hint="追加到已选素材，不覆盖原有标签。">
              <TagMultiSelectPanel
                availableTags={availableTags}
                inputValue={tagInput}
                onInputChange={setTagInput}
                onSelectedTagNamesChange={setDraftTags}
                selectedTagNames={draftTags}
              />
            </LightFormSection>
            <View style={styles.inlineActions}>
              <View style={styles.primaryGrow}>
                <PrimaryButton disabled={isSubmitting} label="确认添加标签" loading={isSubmitting} onPress={handleAddTags} />
              </View>
              <PrimaryButton fullWidth={false} label="取消" onPress={() => resetMode()} variant="ghost" />
            </View>
          </View>
        ) : mode === 'move-asset-ip' ? (
          <View style={styles.inlinePanel}>
            <LightFormSection title="移动到 IP" hint="目标必须是另一个已有 IP；分组会按名称自动映射或创建。">
              <ScrollView style={styles.optionScroll} contentContainerStyle={styles.optionList}>
                {moveTargetIps.map((ip) => (
                  <OptionSelectRow
                    key={ip.id}
                    label={ip.name}
                    meta="已有 IP"
                    onPress={() => setTargetIpId(ip.id)}
                    selected={targetIpId === ip.id}
                  />
                ))}
              </ScrollView>
            </LightFormSection>
            <View style={styles.inlineActions}>
              <View style={styles.primaryGrow}>
                <PrimaryButton disabled={isSubmitting || targetIpId == null} label="确认移动素材" loading={isSubmitting} onPress={handleMoveAssetsToIp} />
              </View>
              <PrimaryButton fullWidth={false} label="取消" onPress={() => resetMode()} variant="ghost" />
            </View>
          </View>
        ) : (
          <View style={styles.actions}>
            <PanelAction disabled={!canUseGroupActions || isSubmitting} icon="folder-open-outline" label="加入分组" onPress={() => resetMode('add-group')} />
            <PanelAction disabled={!canUseGroupActions || isSubmitting} icon="remove-circle-outline" label="移出分组" onPress={() => resetMode('remove-group')} />
            <PanelAction disabled={!canUseGroupActions || isSubmitting} icon="swap-horizontal-outline" label="替换分组" onPress={() => resetMode('replace-group')} />
            <PanelAction disabled={isSubmitting} icon="pricetags-outline" label="添加标签" onPress={() => resetMode('add-tags')} />
            <PanelAction
              disabled={isSubmitting}
              icon={allFavorite ? 'star-half-outline' : 'star-outline'}
              label={allFavorite ? '取消收藏' : '收藏'}
              onPress={() => handleFavoriteUpdate(!allFavorite)}
            />
            <PanelAction
              disabled={isSubmitting || isSavingToAlbum}
              icon="download-outline"
              label={isSavingToAlbum ? '保存中' : '保存相册'}
              onPress={handleSaveToAlbum}
            />
            <PanelAction disabled={isSubmitting || moveTargetIps.length === 0} icon="trail-sign-outline" label="移动到 IP" onPress={() => resetMode('move-asset-ip')} />
            <PanelAction danger disabled={isSubmitting} icon="trash-outline" label="删除到回收站" onPress={() => setIsDeleteDialogVisible(true)} />
          </View>
        )}
      </View>
      <AppDialog
        danger
        message={`选中的 ${selectedCount} 个素材会进入回收站，原文件和缩略图仍保留在本地。清空回收站前都可以恢复。`}
        onClose={() => setIsDeleteDialogVisible(false)}
        onPrimary={confirmSoftDelete}
        primaryLabel="删除到回收站"
        title="确认删除"
        visible={isDeleteDialogVisible}
      />
      <AppDialog
        onClose={() => setIsCreateGroupDialogVisible(false)}
        onPrimary={() => void handleCreateGroup()}
        primaryDisabled={!newGroupName.trim() || !newGroupType}
        primaryLabel="创建分组"
        title="新建分组"
        visible={isCreateGroupDialogVisible}
      >
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={GROUP_NAME_MAX_LENGTH}
          onChangeText={setNewGroupName}
          placeholder="输入分组名称"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.dialogInput}
          value={newGroupName}
        />
        <View style={styles.dialogTypeList}>
          {GROUP_TYPE_OPTIONS.map((option) => (
            <OptionSelectRow
              key={option.value}
              label={option.label}
              meta={option.description}
              onPress={() => setNewGroupType(option.value)}
              selected={newGroupType === option.value}
            />
          ))}
        </View>
      </AppDialog>
      <AlbumSaveDialog
        imageUris={selectedImages.map((image) => image.originalFileUri)}
        isSavingToAlbum={isSavingToAlbum}
        onClose={() => setIsAlbumDialogVisible(false)}
        onError={(message) => setErrorMessage(message)}
        onSaved={(message) => {
          onChanged();
          showToast(message);
        }}
        onSavingChange={setIsSavingToAlbum}
        visible={isAlbumDialogVisible}
      />
    </>
  );
}

function PanelAction({
  danger,
  disabled,
  icon,
  label,
  onPress,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, disabled ? styles.disabled : null, pressed && !disabled ? styles.pressed : null]}
    >
      <Ionicons color={danger ? colors.semantic.danger : colors.primary.default} name={icon} size={18} />
      <Text numberOfLines={1} style={[styles.actionLabel, danger ? styles.dangerText : null]}>{label}</Text>
    </Pressable>
  );
}

function isGroupMode(mode: OrganizeMode): mode is 'replace-group' | 'add-group' | 'remove-group' {
  return mode === 'replace-group' || mode === 'add-group' || mode === 'remove-group';
}

function getGroupActionLabel(mode: OrganizeMode): string {
  if (mode === 'add-group') {
    return '确认加入分组';
  }
  if (mode === 'remove-group') {
    return '确认移出分组';
  }
  return '确认替换分组';
}

function getGroupModeTitle(mode: OrganizeMode): string {
  if (mode === 'add-group') {
    return '加入分组';
  }
  if (mode === 'remove-group') {
    return '移出分组';
  }
  return '替换分组';
}

function getGroupModeHint(mode: OrganizeMode): string {
  if (mode === 'add-group') {
    return '给已选素材追加一个分组，保留原有分组。';
  }
  if (mode === 'remove-group') {
    return '直接从当前分组移出，或从已选素材中移除指定分组。';
  }
  return '用选中的分组替换已选素材当前分组。';
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing[3],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  meta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
    width: '48%',
  },
  actionLabel: {
    ...typography.textStyles.micro,
    color: colors.primary.default,
    fontWeight: '600',
    minWidth: 0,
  },
  dangerText: {
    color: colors.semantic.danger,
  },
  disabled: {
    opacity: 0.42,
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  helperText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    paddingTop: spacing[2],
  },
  inlinePanel: {
    gap: spacing[3],
  },
  inlineActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  primaryGrow: {
    flex: 1,
  },
  optionList: {
    gap: spacing[1],
    paddingTop: spacing[2],
  },
  optionScroll: {
    maxHeight: 240,
  },
  createGroupRow: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 46,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  createGroupCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  createGroupTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.primary.active,
  },
  createGroupMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  tagInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    paddingTop: spacing[2],
  },
  tagInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing[3],
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
  dialogTypeList: {
    gap: spacing[1],
  },
  addTagButton: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    paddingTop: spacing[2],
  },
  pressed: {
    opacity: 0.78,
  },
});
