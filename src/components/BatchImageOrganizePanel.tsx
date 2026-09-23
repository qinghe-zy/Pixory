import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [ips, setIps] = useState<IpRecord[]>([]);
  const [availableTags, setAvailableTags] = useState<Awaited<ReturnType<typeof tagRepository.findUsageOverviewByIpId>>>([]);
  const [mode, setMode] = useState<OrganizeMode>('idle');
  const [isExpanded, setIsExpanded] = useState(false);
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
    if (nextMode === 'idle') {
      // Intentionally kept unchanged so it doesn't auto-collapse unless unmounted
    } else {
      setIsExpanded(true); // Open sheet to show form when interacting
    }
  }

  function handleSaveToAlbum() {
    if (selectedCount === 0) {
      showToast('请先选择至少一个素材');
      return;
    }
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

  const renderDock = () => (
    <View style={styles.dockContainer}>
      <View style={styles.dockBadge}>
        <Text style={styles.dockBadgeText}>已选 <Text style={styles.dockBadgeTextBold}>{selectedCount}</Text>/{totalCount}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dockActions}>
        <Pressable
          disabled={!canUseGroupActions || isSubmitting}
          onPress={() => resetMode('add-group')}
          style={({ pressed }) => [styles.dockButton, (!canUseGroupActions || isSubmitting) && styles.disabled, pressed && styles.pressed]}
        >
          <Ionicons name="folder-open-outline" size={16} color="#4B5563" />
          <Text style={styles.dockButtonText}>加入分组</Text>
        </Pressable>

        <Pressable
          disabled={isSubmitting}
          onPress={() => resetMode('add-tags')}
          style={({ pressed }) => [styles.dockButton, isSubmitting && styles.disabled, pressed && styles.pressed]}
        >
          <Ionicons name="pricetags-outline" size={16} color="#4B5563" />
          <Text style={styles.dockButtonText}>添加标签</Text>
        </Pressable>

        <Pressable
          disabled={isSubmitting}
          onPress={() => handleFavoriteUpdate(!allFavorite)}
          style={({ pressed }) => [styles.dockButton, isSubmitting && styles.disabled, pressed && styles.pressed]}
        >
          <Ionicons name={allFavorite ? 'star-half-outline' : 'star-outline'} size={16} color="#4B5563" />
          <Text style={styles.dockButtonText}>{allFavorite ? '取消收藏' : '收藏'}</Text>
        </Pressable>

        <Pressable
          disabled={isSubmitting}
          onPress={() => setIsExpanded(true)}
          style={({ pressed }) => [styles.dockMoreButton, pressed && styles.pressed]}
        >
          <Text style={styles.dockMoreText}>更多</Text>
          <Ionicons name="chevron-up" size={14} color="#FFFFFF" />
        </Pressable>
      </ScrollView>
    </View>
  );

  const renderExpandedHeader = () => (
    <View style={styles.sheetHeader}>
      <View style={styles.sheetHeaderLeft}>
        <View style={styles.sheetHeaderDot} />
        <Text style={styles.sheetHeaderTitle}>批量素材管理</Text>
        <View style={styles.sheetHeaderBadge}>
          <Text style={styles.sheetHeaderBadgeText}>已选 {selectedCount} / {totalCount} 项</Text>
        </View>
      </View>
      <View style={styles.sheetHeaderRight}>
        <Pressable onPress={() => setIsExpanded(false)} style={({ pressed }) => [styles.sheetIconBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-down" size={18} color="#6B7280" />
        </Pressable>
        <Pressable onPress={onClearSelection} style={({ pressed }) => [styles.sheetIconBtn, pressed && styles.pressed]}>
          <Ionicons name="close" size={18} color="#6B7280" />
        </Pressable>
      </View>
    </View>
  );

  const renderExpandedContent = () => (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>分类与整理 (ORGANIZE)</Text>
        <View style={styles.grid2}>
          <SheetActionItem icon="folder-open-outline" label="加入分组" desc="归档至主题文件夹" onPress={() => resetMode('add-group')} disabled={!canUseGroupActions} />
          <SheetActionItem icon="remove-circle-outline" label="移出分组" desc="保留在全部素材" onPress={() => resetMode('remove-group')} disabled={!canUseGroupActions} />
          <SheetActionItem icon="swap-horizontal-outline" label="替换分组" desc="转移并清空原组" onPress={() => resetMode('replace-group')} disabled={!canUseGroupActions} />
          <SheetActionItem icon="pricetags-outline" label="添加标签" desc="多维属性标记" onPress={() => resetMode('add-tags')} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>存储与流转 (EXPORT & STORAGE)</Text>
        <View style={styles.grid3}>
          <SheetVerticalItem icon={allFavorite ? 'star-half-outline' : 'star-outline'} iconColor="#F59E0B" label={allFavorite ? '取消收藏' : '加入收藏'} onPress={() => handleFavoriteUpdate(!allFavorite)} />
          <SheetVerticalItem icon="download-outline" iconColor="#2563EB" label={isSavingToAlbum ? '保存中' : '保存相册'} onPress={handleSaveToAlbum} disabled={isSavingToAlbum} />
          <SheetVerticalItem icon="trail-sign-outline" iconColor="#9333EA" label="移动到 IP" onPress={() => resetMode('move-asset-ip')} disabled={moveTargetIps.length === 0} />
        </View>
      </View>

      <View style={styles.dangerSection}>
        <Pressable style={styles.dangerBtn} onPress={() => setIsDeleteDialogVisible(true)}>
          <Ionicons name="trash-outline" size={16} color="#E11D48" />
          <Text style={styles.dangerBtnText}>移动到回收站</Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <>
      {(!isExpanded && mode === 'idle') ? (
        <View style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
          {renderDock()}
        </View>
      ) : (
        <View style={[styles.expandedSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Handle */}
          <View style={styles.sheetHandleWrap}>
            <View style={styles.sheetHandle} />
          </View>

          {mode === 'idle' ? (
            <>
              {renderExpandedHeader()}
              {renderExpandedContent()}
            </>
          ) : (
            <View style={styles.subModeContainer}>
              <View style={styles.subModeHeader}>
                <Pressable onPress={() => resetMode('idle')} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                  <Ionicons name="chevron-back" size={20} color={colors.text.title} />
                </Pressable>
                <Text style={styles.subModeTitle}>{getGroupModeTitle(mode) || (mode === 'add-tags' ? '添加标签' : '移动到 IP')}</Text>
                <View style={styles.headerSpacer} />
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
              ) : null}
            </View>
          )}
        </View>
      )}

      {/* Dialogs */}
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

function SheetActionItem({
  disabled,
  icon,
  label,
  desc,
  onPress,
}: {
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.sheetActionItem, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <View style={styles.sheetActionIconBox}>
        <Ionicons name={icon} size={20} color="#374151" />
      </View>
      <View style={styles.sheetActionCopy}>
        <Text style={styles.sheetActionLabel}>{label}</Text>
        <Text style={styles.sheetActionDesc} numberOfLines={1}>{desc}</Text>
      </View>
    </Pressable>
  );
}

function SheetVerticalItem({
  disabled,
  icon,
  iconColor,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.sheetVerticalItem, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <View style={styles.sheetVerticalIconBox}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.sheetVerticalLabel}>{label}</Text>
    </Pressable>
  );
}

function isGroupMode(mode: OrganizeMode): mode is 'replace-group' | 'add-group' | 'remove-group' {
  return mode === 'replace-group' || mode === 'add-group' || mode === 'remove-group';
}

function getGroupActionLabel(mode: OrganizeMode): string {
  if (mode === 'add-group') return '确认加入分组';
  if (mode === 'remove-group') return '确认移出分组';
  return '确认替换分组';
}

function getGroupModeTitle(mode: OrganizeMode): string {
  if (mode === 'add-group') return '加入分组';
  if (mode === 'remove-group') return '移出分组';
  return '替换分组';
}

function getGroupModeHint(mode: OrganizeMode): string {
  if (mode === 'add-group') return '给已选素材追加一个分组，保留原有分组。';
  if (mode === 'remove-group') return '直接从当前分组移出，或从已选素材中移除指定分组。';
  return '用选中的分组替换已选素材当前分组。';
}

const styles = StyleSheet.create({
  // Dock styles
  dockContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 16,
    borderColor: 'rgba(0,0,0,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.12,
        shadowRadius: 40,
      },
      android: {
        elevation: 12,
      },
    }),
    gap: 8,
  },
  dockBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    flexShrink: 0,
  },
  dockBadgeText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  dockBadgeTextBold: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dockActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  dockButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  dockMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111111',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  dockMoreText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Expanded Sheet styles
  expandedSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.08,
        shadowRadius: 30,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 9999,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 20,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetHeaderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  sheetHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  sheetHeaderBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  sheetHeaderBadgeText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  sheetHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  grid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  sheetActionItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8F9FA',
    borderColor: '#F3F4F6',
    borderWidth: 1,
  },
  sheetActionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  sheetActionCopy: {
    flex: 1,
  },
  sheetActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  sheetActionDesc: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  grid3: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sheetVerticalItem: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8F9FA',
    borderColor: '#F3F4F6',
    borderWidth: 1,
  },
  sheetVerticalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  sheetVerticalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  dangerSection: {
    paddingTop: 4,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFF5F5',
    borderColor: '#FFE4E6',
    borderWidth: 1,
  },
  dangerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E11D48',
    letterSpacing: 0.5,
  },

  // Sub mode styles
  subModeContainer: {
    gap: 16,
  },
  subModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subModeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  headerSpacer: {
    width: 32,
  },
  
  // Shared legacy styles from previous panel that are still needed for LightFormSection inside sub-modes
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.78,
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
});
