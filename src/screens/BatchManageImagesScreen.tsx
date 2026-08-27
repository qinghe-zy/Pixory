import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AssetFilterDrawer } from '../components/AssetFilterDrawer';
import { AppDialog } from '../components/AppDialog';
import { AlbumSaveDialog } from '../components/AlbumSaveDialog';
import { LightFormSection } from '../components/LightFormSection';
import { OptionSelectRow } from '../components/OptionSelectRow';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { SortMenuButton } from '../components/SortMenuButton';
import { TagMultiSelectPanel } from '../components/TagMultiSelectPanel';
import { GallerySkeleton } from '../components/GallerySkeleton';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { VirtualizedAssetCollection } from '../components/VirtualizedAssetCollection';
import { commonButtonCopy } from '../constants/copy';
import { GROUP_TYPE_OPTIONS, getGroupTypeLabel, type GroupTypeValue } from '../constants/groups';
import { GROUP_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, imageRepository, importTemplateRepository, ipRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageListItem, type ImageSortOrder, type ImportTemplateRecord, type IpRecord, type PixorySpace } from '../database';
import { colors, componentTokens, metrics, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useMediaCursorCollection } from '../hooks/useMediaCursorCollection';
import { useSubmitState } from '../hooks/useSubmitState';
import { useSwipeGridSelection } from '../hooks/useSwipeGridSelection';
import { getFileInfo } from '../services/fileStorageService';
import { captureBatchUndoSnapshot, restoreBatchUndoSnapshot } from '../services/batchUndoService';
import { MAX_FILE_TASK_CONCURRENCY, settleFileTasksWithConcurrency } from '../services/boundedFileConcurrency';
import { isDevToolsEnabled } from '../utils/dev';
import { devLog } from '../utils/dev';
import { mergeDraftTagNames } from '../utils/tagDrafts';
import {
  applySelectionRules,
  BATCH_SELECTION_RULE_OPTIONS,
  normalizeSelectionRuleKeys,
  type BatchSelectionRuleKey,
  type BatchSelectionRulesResult,
} from '../utils/batchSelectionRules';
import { useToast } from '../components/AppToast';
import type { ImageViewerContext } from '../navigation/imageViewerContext';

type BatchSource = 'ip-detail' | 'all-images' | 'group-images';
type BatchMode = 'idle' | 'replace-group' | 'add-group' | 'remove-group' | 'add-tags' | 'apply-template';
type InitialBatchMode = 'idle' | 'replace-group' | 'add-tags' | 'apply-template';

interface BatchManageImagesScreenProps {
  ipId: number;
  space?: PixorySpace;
  source: BatchSource;
  groupId?: number | null;
  importBatchId?: number | null;
  scopeImageIds?: number[];
  initialSelectedImageIds?: number[];
  initialMode?: InitialBatchMode;
  refreshToken: number;
  onBack: () => void;
  onImportImages: () => void;
  onOpenImage: (imageId: number, context: ImageViewerContext) => void;
  onOpenImageDetail: (imageId: number) => void;
  onChanged: () => void;
  onDeleted: () => void;
}

export function BatchManageImagesScreen({
  ipId,
  space = 'normal',
  source,
  groupId = null,
  importBatchId = null,
  scopeImageIds,
  initialSelectedImageIds = [],
  initialMode = 'idle',
  refreshToken,
  onBack,
  onImportImages,
  onOpenImage,
  onOpenImageDetail,
  onChanged,
  onDeleted,
}: BatchManageImagesScreenProps) {
  const { showToast, showUndoSnackbar } = useToast();
  const scrollViewRef = useRef<FlatList<ImageListItem> | null>(null);
  const [sortOrder, setSortOrder] = useState<ImageSortOrder>(() => (importBatchId != null ? 'sourceOrderAsc' : 'createdAtDesc'));
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ip: IpRecord | null;
    groups: GroupRecord[];
    importTemplates: ImportTemplateRecord[];
    tags: Awaited<ReturnType<typeof tagRepository.findUsageOverviewByIpId>>;
  }>(
    async () => {
      return runWithDatabaseSpace(space, async (db) => {
      const [ip, groups, importTemplates, tags] = await Promise.all([
        ipRepository.findById(db, ipId),
        groupRepository.findByIpId(db, ipId),
        importTemplateRepository.findAll(db),
        tagRepository.findUsageOverviewByIpId(db, ipId),
      ]);

      return { ip, groups, importTemplates, tags };
      });
    },
    [groupId, importBatchId, ipId, refreshToken, scopeImageIds?.join(',') ?? '', sortOrder, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取批量管理数据失败：${message}`;
      },
      initialData: { ip: null, groups: [], importTemplates: [], tags: [] },
      deferUntilInteractions: true,
    }
  );
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState<number[]>(() => [...new Set(initialSelectedImageIds)]);
  const [mode, setMode] = useState<BatchMode>(initialMode);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(groupId ?? null);
  const [tagInput, setTagInput] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [activeRuleKeys, setActiveRuleKeys] = useState<BatchSelectionRuleKey[]>([]);
  const [activeRule, setActiveRule] = useState<BatchSelectionRulesResult | null>(null);
  const [isCreateGroupDialogVisible, setIsCreateGroupDialogVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupTypeValue | null>(null);
  const [isAlbumDialogVisible, setIsAlbumDialogVisible] = useState(false);
  const [isSavingToAlbum, setIsSavingToAlbum] = useState(false);
  const media = useMediaCursorCollection({
    formatError: (loadError) => `读取批量管理数据失败：${loadError instanceof Error ? loadError.message : '未知错误'}`,
    request: {
      groupId: groupId ?? undefined,
      imageIds: scopeImageIds,
      importBatchId: importBatchId ?? undefined,
      ipId: scopeImageIds == null && importBatchId == null && groupId == null ? ipId : undefined,
      mediaType: 'all',
      orderBy: sortOrder,
    },
    requestKey: JSON.stringify([space, ipId, groupId, importBatchId, scopeImageIds, refreshToken, sortOrder]),
    space,
  });
  const images = media.items;
  const combinedLoading = isLoading || media.isLoading;
  const combinedError = errorMessage ?? media.errorMessage;
  const reloadAll = () => {
    reload();
    media.reload();
  };
  const groups = data?.groups ?? [];
  const importTemplates = data?.importTemplates ?? [];
  const tags = data?.tags ?? [];
  const isScopedPile = scopeImageIds != null;
  const visibleImageIds = useMemo(() => images.map((image) => image.id), [images]);
  const selectedImages = useMemo(
    () => images.filter((image) => selectedImageIds.includes(image.id)),
    [images, selectedImageIds]
  );
  const selectedCount = selectedImages.length;
  const allSelected = images.length > 0 && selectedCount === images.length;
  const swipeSelection = useSwipeGridSelection({
    items: images.map((image) => ({ id: image.id, mediaType: image.mediaType })),
    selectedIds: selectedImageIds,
    setSelectedIds: (updater) => {
      setActiveRuleKeys([]);
      setActiveRule(null);
      setSelectedImageIds(updater);
    },
    scrollViewRef,
    selectableMediaTypes: ['image', 'video'],
  });

  const swipeFilterDrawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (evt, gs) => {
        return (
          gs.dx < -6 &&
          Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2
        );
      },
      onPanResponderRelease: (evt, gs) => {
        if (
          gs.dx < -10 ||
          (gs.dx < -6 && gs.vx < -0.18)
        ) {
          setIsFilterDrawerOpen(true);
        }
      },
    })
  ).current;

  useEffect(() => {
    setSelectedImageIds((current) => current.filter((imageId) => visibleImageIds.includes(imageId)));
  }, [visibleImageIds]);

  useEffect(() => {
    if (!submitError) {
      return;
    }

    if (selectedCount > 0) {
      clearSubmitError();
    }
  }, [clearSubmitError, selectedCount, submitError]);

  function toggleImageSelection(imageId: number) {
    setActiveRuleKeys([]);
    setActiveRule(null);
    setSelectedImageIds((current) =>
      current.includes(imageId) ? current.filter((item) => item !== imageId) : [...current, imageId]
    );
  }

  function enterImageSelection(imageId: number) {
    setActiveRuleKeys([]);
    setActiveRule(null);
    setSelectedImageIds([imageId]);
  }

  function handleOpenImage(imageId: number) {
    if (selectedCount > 0) {
      toggleImageSelection(imageId);
      return;
    }

    const asset = images.find((i) => i.id === imageId);
    if (asset?.mediaType === 'video') {
      onOpenImageDetail(imageId);
      return;
    }

    onOpenImage(imageId, getImageViewerContext());
  }

  function getImageViewerContext(): ImageViewerContext {
    if (scopeImageIds != null) {
      return { type: 'image-scope', imageIds: scopeImageIds, label: '当前堆', space };
    }

    if (importBatchId != null) {
      return { type: 'import-batch', ipId, importBatchId, space };
    }

    if (groupId != null) {
      return { type: 'group', ipId, groupId, space };
    }

    return { type: 'ip-all', ipId, filter: { type: 'all' }, space };
  }

  function handleSelectAllToggle() {
    setActiveRuleKeys([]);
    setActiveRule(null);
    setSelectedImageIds(allSelected ? [] : visibleImageIds);
  }

  function selectByRule(rule: 'visible' | 'invert' | BatchSelectionRuleKey) {
    if (rule === 'visible') {
      setActiveRuleKeys([]);
      setActiveRule(null);
      setSelectedImageIds(visibleImageIds);
      return;
    }

    if (rule === 'invert') {
      setActiveRuleKeys([]);
      setActiveRule(null);
      const selectedSet = new Set(selectedImageIds);
      setSelectedImageIds(visibleImageIds.filter((imageId) => !selectedSet.has(imageId)));
      return;
    }

    const rawRuleKeys = activeRuleKeys.includes(rule)
      ? activeRuleKeys.filter((item) => item !== rule)
      : [...activeRuleKeys, rule];
    const nextRuleKeys = normalizeSelectionRuleKeys(rawRuleKeys);

    if (nextRuleKeys.length === 0) {
      setActiveRuleKeys([]);
      setActiveRule(null);
      setSelectedImageIds([]);
      return;
    }

    try {
      const result = applySelectionRules({
        images,
        selectedImageIds,
        rule,
        rules: nextRuleKeys,
        importBatchId,
      });
      setActiveRuleKeys(nextRuleKeys);
      setActiveRule(result);
      setSelectedImageIds(result.imageIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : '请选择基准图片。';
      showToast(message);
    }
  }

  function cancelRuleSelection() {
    setActiveRuleKeys([]);
    setActiveRule(null);
    setSelectedImageIds([]);
  }

  function handleCreateGroup() {
    const trimmedName = newGroupName.trim();
    if (!trimmedName) {
      showToast('请输入分组名称');
      return;
    }
    if (!newGroupType) {
      showToast('请选择分组类型');
      return;
    }

    void (async () => {
      try {
        const group = await runWithDatabaseSpace(space, (db) => groupRepository.create(db, { ipId, name: trimmedName, type: newGroupType }));
        setSelectedGroupId(group.id);
        setNewGroupName('');
        setNewGroupType(null);
        setIsCreateGroupDialogVisible(false);
        reloadAll();
        onChanged();
        showToast('已新建分组');
      } catch (error) {
        showToast(error instanceof Error ? `新建分组失败：${error.message}` : '新建分组失败');
      }
    })();
  }

  function resetInlineMode(nextMode: BatchMode = 'idle') {
    setMode(nextMode);
    if (nextMode !== 'add-tags') {
      setTagInput('');
      setDraftTags([]);
    }
    if (!isGroupMode(nextMode)) {
      setSelectedGroupId(groupId ?? null);
    }
  }

  function showUndoToast(message: string, undoSnapshot: Awaited<ReturnType<typeof captureBatchUndoSnapshot>>) {
    showUndoSnackbar({
      message,
      onUndo: () => {
        void (async () => {
          const restoredCount = await runWithDatabaseSpace(space, (db) => restoreBatchUndoSnapshot(db, undoSnapshot));
          if (restoredCount > 0) {
            onChanged();
            reloadAll();
            showToast(`已撤销 ${restoredCount} 张`);
          }
        })();
      },
    });
  }

  function handleGroupUpdate() {
    void runSubmit(
      async () => {
        const undoSnapshot = await runWithDatabaseSpace(space, (db) => captureBatchUndoSnapshot(db, selectedImageIds));
        let changedCount = 0;

        if (mode === 'replace-group') {
          changedCount = await runWithDatabaseSpace(space, (db) => imageRepository.updateManyGroup(db, selectedImageIds, selectedGroupId));
        } else if (selectedGroupId != null && mode === 'add-group') {
          changedCount = await runWithDatabaseSpace(space, (db) => imageRepository.addManyToGroup(db, selectedImageIds, selectedGroupId));
        } else if (selectedGroupId != null && mode === 'remove-group') {
          changedCount = await runWithDatabaseSpace(space, (db) => imageRepository.removeManyFromGroup(db, selectedImageIds, selectedGroupId));
        }

        if (changedCount === 0) {
          throw new Error('没有需要更新的图片。');
        }

        resetInlineMode();
        onChanged();
        showUndoToast(`已处理 ${changedCount} 张`, undoSnapshot);
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `批量调整分组失败：${message}`;
        },
        validate: () => {
          if (selectedCount === 0) {
            return '请先选择至少一张图片。';
          }

          if ((mode === 'add-group' || mode === 'remove-group') && selectedGroupId == null) {
            return '请选择一个分组。';
          }

          return null;
        },
      }
    );
  }

  function handleAddTags() {
    void runSubmit(
      async () => {
        const undoSnapshot = await runWithDatabaseSpace(space, (db) => captureBatchUndoSnapshot(db, selectedImageIds));
        const preparedTags = mergeDraftTagNames(draftTags, tagInput);
        if (preparedTags.length !== draftTags.length) {
          setDraftTags(preparedTags);
          setTagInput('');
        }

        const addedTags = await runWithDatabaseSpace(space, (db) => tagRepository.addTagsToImages(db, selectedImageIds, preparedTags));
        if (addedTags.length === 0) {
          throw new Error('没有可添加的标签。');
        }

        resetInlineMode();
        onChanged();
        showUndoToast(`已为 ${selectedCount} 张添加标签`, undoSnapshot);
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `批量添加标签失败：${message}`;
        },
        validate: () => {
          if (selectedCount === 0) {
            return '请先选择至少一张图片。';
          }

          if (!tagInput.trim() && draftTags.length === 0) {
            return '请至少输入一个标签。';
          }

          return null;
        },
      }
    );
  }

  function handleFavoriteUpdate(isFavorite: boolean) {
    void runSubmit(
      async () => {
        const undoSnapshot = await runWithDatabaseSpace(space, (db) => captureBatchUndoSnapshot(db, selectedImageIds));
        const changedCount = await runWithDatabaseSpace(space, (db) => imageRepository.updateManyFavorite(db, selectedImageIds, isFavorite));
        if (changedCount === 0) {
          throw new Error('没有可更新的图片。');
        }

        onChanged();
        showUndoToast(isFavorite ? `已收藏 ${changedCount} 张` : `已取消收藏 ${changedCount} 张`, undoSnapshot);
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `批量${isFavorite ? '收藏' : '取消收藏'}失败：${message}`;
        },
        validate: () => (selectedCount === 0 ? '请先选择至少一张图片。' : null),
      }
    );
  }

  function handleApplyTemplate(template: ImportTemplateRecord) {
    void runSubmit(
      async () => {
        const undoSnapshot = await runWithDatabaseSpace(space, (db) => captureBatchUndoSnapshot(db, selectedImageIds));
        const groupChangedCount = await runWithDatabaseSpace(space, async (db) => {
          const existingGroup = await groupRepository.findByIpIdAndName(db, ipId, template.groupName);
          const group = existingGroup ?? (await groupRepository.create(db, { ipId, name: template.groupName, type: 'custom' }));
          const changedCount = await imageRepository.updateManyGroup(db, selectedImageIds, group.id);
          await tagRepository.addTagsToImages(db, selectedImageIds, template.tags);
          await imageRepository.updateManyNote(db, selectedImageIds, template.note);
          await imageRepository.updateManyFavorite(db, selectedImageIds, template.isFavorite);
          return changedCount;
        });

        resetInlineMode();
        onChanged();
        showUndoToast(`已套用模板到 ${Math.max(groupChangedCount, selectedCount)} 张`, undoSnapshot);
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `套用模板失败：${message}`;
        },
        validate: () => (selectedCount === 0 ? '请先选择至少一张图片。' : null),
      }
    );
  }

  function handleSoftDelete() {
    if (selectedCount === 0) {
      return;
    }

    setIsDeleteDialogVisible(true);
  }

  function handleSaveToAlbum() {
    if (selectedCount === 0) {
      showToast('请先选择至少一张图片');
      return;
    }

    setIsAlbumDialogVisible(true);
  }

  function confirmSoftDelete() {
    setIsDeleteDialogVisible(false);
    void runSubmit(
      async () => {
        const undoSnapshot = await runWithDatabaseSpace(space, (db) => captureBatchUndoSnapshot(db, selectedImageIds));
        const imageCopies = [...selectedImages];
        const deletedCount = await runWithDatabaseSpace(space, (db) => imageRepository.softDeleteMany(db, selectedImageIds));
        if (deletedCount === 0) {
          throw new Error('没有可删除的图片。');
        }

        const deletedRows = await runWithDatabaseSpace(space, (db) => imageRepository.findByIds(
          db,
          imageCopies.map((image) => image.id),
          { includeDeleted: true, mediaType: 'all' }
        ));
        const deletedAtById = new Map(deletedRows.map((image) => [image.id, image.deletedAt]));
        const settledVerification = await settleFileTasksWithConcurrency(
          imageCopies,
          MAX_FILE_TASK_CONCURRENCY,
          async (image) => {
            const [originalInfo, thumbnailInfo] = await Promise.all([
              getFileInfo(image.originalFileUri),
              image.thumbnailFileUri ? getFileInfo(image.thumbnailFileUri) : Promise.resolve(null),
            ]);

            return {
              imageId: image.id,
              originalFileUri: image.originalFileUri,
              thumbnailFileUri: image.thumbnailFileUri,
              originalExists: originalInfo.exists && !originalInfo.isDirectory,
              thumbnailExists: image.thumbnailFileUri
                ? Boolean(thumbnailInfo?.exists && !thumbnailInfo.isDirectory)
                : true,
              originalSize: originalInfo.size,
              thumbnailSize: thumbnailInfo?.size ?? null,
              deletedAt: deletedAtById.get(image.id) ?? null,
            };
          }
        );
        const verification = settledVerification.map((result, index) => result.status === 'fulfilled'
          ? result.value
          : {
              imageId: imageCopies[index].id,
              originalFileUri: imageCopies[index].originalFileUri,
              thumbnailFileUri: imageCopies[index].thumbnailFileUri,
              originalExists: false,
              thumbnailExists: false,
              originalSize: null,
              thumbnailSize: null,
              deletedAt: deletedAtById.get(imageCopies[index].id) ?? null,
            });

        devLog('Pixory batch delete verification JSON:', JSON.stringify(verification));

        const missingFiles = verification.filter(
          (item) =>
            !item.originalExists ||
            !item.thumbnailExists ||
            (item.originalSize ?? 0) <= 0 ||
            (item.thumbnailSize ?? 0) <= 0
        );
        if (missingFiles.length > 0) {
          throw new Error('软删除后发现文件缺失，请检查本地存储状态。');
        }

        showUndoToast(`已移入回收站 ${deletedCount} 张`, undoSnapshot);
        onDeleted();
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `批量删除失败：${message}`;
        },
      }
    );
  }

  const footer = (
    <View style={styles.footerWrap}>
      <View style={styles.footerHeader}>
        <Text style={styles.footerTitle}>已选择 {selectedCount} 张</Text>
        <Text style={styles.footerMeta}>当前已加载 {images.length} 张</Text>
      </View>
      {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
      {isGroupMode(mode) ? (
        <View style={styles.footerInlineActions}>
          <View style={styles.footerPrimaryAction}>
            <PrimaryButton disabled={selectedCount === 0} label={getGroupActionLabel(mode)} loading={isSubmitting} onPress={handleGroupUpdate} />
          </View>
          <Pressable
            disabled={isSubmitting}
            onPress={() => resetInlineMode()}
            style={({ pressed }) => [styles.footerCancelButton, isSubmitting ? styles.batchActionDisabled : null, pressed && !isSubmitting ? styles.pressed : null]}
          >
            <Ionicons color={colors.primary.default} name="close" size={17} />
            <Text style={styles.footerCancelText}>取消</Text>
          </Pressable>
        </View>
      ) : mode === 'add-tags' ? (
        <View style={styles.footerInlineActions}>
          <View style={styles.footerPrimaryAction}>
            <PrimaryButton disabled={selectedCount === 0} label="确认添加标签" loading={isSubmitting} onPress={handleAddTags} />
          </View>
          <Pressable
            disabled={isSubmitting}
            onPress={() => resetInlineMode()}
            style={({ pressed }) => [styles.footerCancelButton, isSubmitting ? styles.batchActionDisabled : null, pressed && !isSubmitting ? styles.pressed : null]}
          >
            <Ionicons color={colors.primary.default} name="close" size={17} />
            <Text style={styles.footerCancelText}>取消</Text>
          </Pressable>
        </View>
      ) : mode === 'apply-template' ? (
        <View style={styles.footerInlineActions}>
          <View style={styles.footerPrimaryAction}>
            <Text style={styles.footerMeta}>选择模板会覆盖分组、补充标签与备注，并同步收藏状态。</Text>
          </View>
          <Pressable
            disabled={isSubmitting}
            onPress={() => resetInlineMode()}
            style={({ pressed }) => [styles.footerCancelButton, isSubmitting ? styles.batchActionDisabled : null, pressed && !isSubmitting ? styles.pressed : null]}
          >
            <Ionicons color={colors.primary.default} name="close" size={17} />
            <Text style={styles.footerCancelText}>取消</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.batchActionGrid}>
          <BatchActionButton
            disabled={selectedCount === 0 || isSubmitting}
            icon="swap-horizontal-outline"
            label="替换分组"
            onPress={() => {
              setSelectedGroupId(groupId ?? null);
              setMode('replace-group');
            }}
          />
          <BatchActionButton
            disabled={selectedCount === 0 || isSubmitting}
            icon="folder-open-outline"
            label="加入分组"
            onPress={() => {
              setSelectedGroupId(groupId ?? null);
              setMode('add-group');
            }}
          />
          <BatchActionButton
            disabled={selectedCount === 0 || isSubmitting}
            icon="remove-circle-outline"
            label="移出分组"
            onPress={() => {
              setSelectedGroupId(groupId ?? null);
              setMode('remove-group');
            }}
          />
          <BatchActionButton
            disabled={selectedCount === 0 || isSubmitting}
            icon="pricetags-outline"
            label="添加标签"
            onPress={() => setMode('add-tags')}
          />
          <BatchActionButton
            disabled={selectedCount === 0 || isSubmitting}
            icon="color-wand-outline"
            label="套用模板"
            onPress={() => setMode('apply-template')}
          />
          <BatchActionButton
            disabled={selectedCount === 0 || isSubmitting}
            icon="star-outline"
            label="批量收藏"
            onPress={() => handleFavoriteUpdate(true)}
          />
          <BatchActionButton
            disabled={selectedCount === 0 || isSubmitting}
            icon="star-half-outline"
            label="取消收藏"
            onPress={() => handleFavoriteUpdate(false)}
          />
          <BatchActionButton
            disabled={selectedCount === 0 || isSubmitting || isSavingToAlbum}
            icon="download-outline"
            label={isSavingToAlbum ? '保存中' : '保存相册'}
            onPress={handleSaveToAlbum}
          />
          <BatchActionButton
            danger
            disabled={selectedCount === 0 || isSubmitting}
            icon="trash-outline"
            label="删除"
            onPress={handleSoftDelete}
          />
        </View>
      )}
    </View>
  );

  return (
    <>
    <View style={styles.host} {...swipeFilterDrawerPanResponder.panHandlers}>
    <ScreenScaffold backgroundVariant="workflow" decorativeTitle="Batch" footer={footer} onBack={onBack} title={data?.ip ? `批量管理 · ${data.ip.name}` : '批量管理'}>

      <AssetFilterDrawer visible={isFilterDrawerOpen} onClose={() => setIsFilterDrawerOpen(false)}>
        <View style={styles.drawerSections}>
          <Text style={styles.drawerSectionTitle}>快捷选择</Text>
          <View style={styles.filterOptionGrid}>
            <FilterOptionChip label="当前已加载" selected={false} onPress={() => { selectByRule('visible'); setIsFilterDrawerOpen(false); }} />
            <FilterOptionChip label="反选" selected={false} onPress={() => { selectByRule('invert'); setIsFilterDrawerOpen(false); }} />
          </View>
        </View>

        <View style={styles.drawerSections}>
          <Text style={styles.drawerSectionTitle}>状态筛选</Text>
          <View style={styles.filterOptionGrid}>
            {source !== 'group-images' ? <FilterOptionChip label="未分组" selected={activeRuleKeys.includes('ungrouped')} onPress={() => { selectByRule('ungrouped'); setIsFilterDrawerOpen(false); }} /> : null}
            <FilterOptionChip label="无标签" selected={activeRuleKeys.includes('untagged')} onPress={() => { selectByRule('untagged'); setIsFilterDrawerOpen(false); }} />
          </View>
        </View>

        <View style={styles.drawerSections}>
          <Text style={styles.drawerSectionTitle}>规则模式</Text>
          <View style={styles.filterOptionGrid}>
            {BATCH_SELECTION_RULE_OPTIONS.filter((option) =>
              option.key !== 'same-size' &&
              option.key !== 'filename-prefix' &&
              !(source === 'group-images' && option.key === 'ungrouped')
            ).map((option) => (
              <FilterOptionChip
                key={option.key}
                label={option.label}
                onPress={() => { selectByRule(option.key); setIsFilterDrawerOpen(false); }}
                selected={activeRuleKeys.includes(option.key)}
              />
            ))}
          </View>
        </View>
      </AssetFilterDrawer>

      <PageStateBlock
        loadingComponent={<GallerySkeleton />}
        emptyActionLabel={commonButtonCopy.importImages}
        emptyDescription="导入图片后，这里可以用于批量移动分组、加标签、收藏和软删除。"
        emptyIconName="albums-outline"
        emptyTitle="还没有可管理的图片"
        errorMessage={combinedError}
        isEmpty={!combinedLoading && images.length === 0}
        loading={combinedLoading}
        loadingDescription="SQLite 图片列表加载完成后，这里会展示可批量操作的图片。"
        loadingTitle="正在读取批量管理列表"
        onEmptyAction={onImportImages}
        onRetry={reloadAll}
      >
        <VirtualizedAssetCollection
          headerComponent={<View>
        <View style={styles.galleryHeading}>
          <Text style={styles.galleryTitle}>已选择 {selectedCount} 张</Text>
          <View style={styles.galleryActions}>
            <Pressable onPress={handleSelectAllToggle} style={({ pressed }) => [styles.selectAllButton, pressed && styles.pressed]}>
              <Text style={styles.selectAllText}>{allSelected ? '取消全选' : '全选'}</Text>
            </Pressable>
            <SortMenuButton
              hasActiveFilters={activeRuleKeys.length > 0}
              onChange={setSortOrder}
              onFilterPress={() => setIsFilterDrawerOpen(true)}
              orderBy={sortOrder}
            />
          </View>
        </View>

        {activeRule ? (
          <View style={styles.activeRulePanel}>
            <Text numberOfLines={2} style={styles.activeRuleText}>{activeRule.label} · {activeRule.description}</Text>
            <Pressable onPress={cancelRuleSelection} style={({ pressed }) => [styles.cancelRuleButton, pressed && styles.pressed]}>
              <Text style={styles.cancelRuleText}>取消该规则</Text>
            </Pressable>
          </View>
        ) : null}

        {isGroupMode(mode) ? (
          <LightFormSection hint={getGroupModeHint(mode, selectedCount)} title={getGroupModeTitle(mode)}>
            <View style={styles.optionList}>
              {mode === 'replace-group' ? (
                <OptionSelectRow
                  label="无分组"
                  meta="保留在当前 IP"
                  onPress={() => setSelectedGroupId(null)}
                  selected={selectedGroupId === null}
                />
              ) : null}
              {groups.map((group) => (
                <OptionSelectRow
                  key={group.id}
                  label={group.name}
                  meta={getGroupTypeLabel(group.type)}
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
            </View>
          </LightFormSection>
        ) : null}

        {mode === 'add-tags' ? (
          <LightFormSection hint={`追加到已选 ${selectedCount} 张图片，不覆盖原有标签。`} title="添加标签">
            <View style={styles.tagPanel}>
              <TagMultiSelectPanel
                availableTags={tags}
                inputValue={tagInput}
                onInputChange={(value) => {
                  setTagInput(value);
                  if (submitError) {
                    clearSubmitError();
                  }
                }}
                onSelectedTagNamesChange={(tagNames) => {
                  setDraftTags(tagNames);
                  if (submitError) {
                    clearSubmitError();
                  }
                }}
                placeholder="例如：batchTag"
                selectedTagNames={draftTags}
              />
              {isDevToolsEnabled ? (
                <Pressable
                  disabled={isSubmitting}
                  onPress={() => {
                    setDraftTags(['batchTag']);
                    setTagInput('');
                    if (submitError) {
                      clearSubmitError();
                    }
                  }}
                  style={({ pressed }) => [styles.devPresetButton, isSubmitting ? styles.batchActionDisabled : null, pressed && !isSubmitting ? styles.pressed : null]}
                >
                  <Ionicons color={colors.text.tertiary} name="code-working-outline" size={14} />
                  <Text style={styles.devPresetText}>回归预设 batchTag</Text>
                </Pressable>
              ) : null}
            </View>
          </LightFormSection>
        ) : null}

        {mode === 'apply-template' ? (
          <LightFormSection hint={`应用到已选 ${selectedCount} 张图片。`} title="导入模板">
            <View style={styles.templateGrid}>
              {importTemplates.map((template) => (
                <Pressable
                  disabled={isSubmitting}
                  key={template.key}
                  onPress={() => handleApplyTemplate(template)}
                  style={({ pressed }) => [styles.templateChip, isSubmitting ? styles.batchActionDisabled : null, pressed && !isSubmitting ? styles.pressed : null]}
                >
                  <Ionicons color={colors.primary.active} name="albums-outline" size={15} />
                  <View style={styles.templateCopy}>
                    <Text numberOfLines={1} style={styles.templateTitle}>{template.name}</Text>
                    <Text numberOfLines={1} style={styles.templateMeta}>{template.tags.map((tag) => `#${tag}`).join(' ')}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </LightFormSection>
        ) : null}
          </View>}
          images={images}
          isLoadingMore={media.isLoadingMore}
          listRef={scrollViewRef}
          onEndReached={media.loadMore}
          onItemMeasured={swipeSelection.registerMeasuredItemLayout}
          onScroll={swipeSelection.onScroll}
          panHandlers={swipeSelection.panHandlers}
          renderAsset={(image, index, fillCell) => (
            <ThumbnailTile
              aspectRatio={componentTokens.thumbnail.squareAspectRatio}
              containerStyle={fillCell ? styles.fillCell : undefined}
              image={image}
              index={index}
              onLongPress={() => {
                enterImageSelection(image.id);
                swipeSelection.beginSwipeSelection(image.id);
              }}
              onPress={handleOpenImage}
              selected={selectedImageIds.includes(image.id)}
              space={space}
            />
          )}
          viewMode="grid"
        />
      </PageStateBlock>
    </ScreenScaffold>
    </View>
    <AppDialog
      danger
      message={`选中的 ${selectedCount} 张图片会进入回收站，原图和缩略图仍保留在本地。清空回收站前都可以恢复。`}
      onClose={() => setIsDeleteDialogVisible(false)}
      onPrimary={confirmSoftDelete}
      primaryLabel="删除到回收站"
      title="确认删除"
      visible={isDeleteDialogVisible}
    />
    <AppDialog
      onClose={() => setIsCreateGroupDialogVisible(false)}
      onPrimary={handleCreateGroup}
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
      onError={(message) => showToast(`保存相册失败：${message}`)}
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

function isGroupMode(mode: BatchMode): mode is 'replace-group' | 'add-group' | 'remove-group' {
  return mode === 'replace-group' || mode === 'add-group' || mode === 'remove-group';
}

function getGroupActionLabel(mode: BatchMode): string {
  if (mode === 'add-group') {
    return '确认加入分组';
  }

  if (mode === 'remove-group') {
    return '确认移出分组';
  }

  return '确认替换分组';
}

function getGroupModeTitle(mode: BatchMode): string {
  if (mode === 'add-group') {
    return '加入分组';
  }

  if (mode === 'remove-group') {
    return '移出分组';
  }

  return '替换分组';
}

function getGroupModeHint(mode: BatchMode, selectedCount: number): string {
  if (mode === 'add-group') {
    return `追加到已选 ${selectedCount} 张图片，不清除现有分组。`;
  }

  if (mode === 'remove-group') {
    return `从已选 ${selectedCount} 张图片中剔除该分组，不删除图片。`;
  }

  return '把已选图片替换为一个目标分组，也可以改为无分组。';
}

function BatchActionButton({
  icon,
  label,
  onPress,
  disabled,
  danger = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.batchActionCard,
        danger ? styles.batchActionDangerCard : null,
        disabled ? styles.batchActionDisabled : null,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      <Ionicons
        color={danger ? colors.semantic.danger : colors.primary.default}
        name={icon}
        size={18}
      />
      <Text style={[styles.batchActionLabel, danger ? styles.batchActionDangerLabel : null]}>{label}</Text>
    </Pressable>
  );
}

function FilterOptionChip({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.filterOptionChip, selected ? styles.filterOptionChipActive : null, pressed && styles.pressed]}>
      <Text numberOfLines={1} style={[styles.filterOptionText, selected ? styles.filterOptionTextActive : null]}>{label}</Text>
      {selected ? <Ionicons color={colors.primary.active} name="checkmark-circle" size={14} /> : null}
    </Pressable>
  );
}

const WEAK_FILENAME_PREFIXES = new Set(['img', 'image', 'screenshot', 'screen', 'photo', 'pic', 'dsc']);

function getFilenamePrefix(filename: string): string | null {
  const baseName = filename.replace(/\.[^.]+$/, '');
  const [prefix] = baseName.split(/[_\-\s.]+/);
  const normalized = prefix?.trim();
  if (!normalized || normalized.length < 2 || /^\d+$/.test(normalized) || WEAK_FILENAME_PREFIXES.has(normalized.toLowerCase())) {
    return null;
  }
  return normalized;
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
  drawerSections: {
    padding: spacing[3],
  },
  drawerSectionTitle: {
    ...typography.textStyles.bodyStrong,
    marginBottom: spacing[2],
  },
  filterOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.microGap,
  },
  filterOptionChip: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  filterOptionChipActive: {
    backgroundColor: colors.primary.weak,
  },
  filterOptionText: {
    ...typography.textStyles.caption,
  },
  filterOptionTextActive: {
    color: colors.primary.active,
    fontWeight: '600',
  },
  galleryHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: rhythm.listCardGap,
    paddingHorizontal: spacing[1],
  },
  galleryTitle: {
    ...typography.textStyles.bodyStrong,
  },
  galleryActions: {
    zIndex: 10,
    elevation: 10,
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
  },
  selectAllButton: {
    padding: spacing[1],
  },
  selectAllText: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
  },
  viewModeButton: {
    padding: spacing[1],
  },
  viewModeButtonActive: {
    backgroundColor: colors.primary.weak,
    borderRadius: radius.md,
  },
  activeRulePanel: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    marginBottom: rhythm.listCardGap,
    padding: spacing[2],
  },
  activeRuleText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    flex: 1,
  },
  cancelRuleButton: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  cancelRuleText: {
    ...typography.textStyles.micro,
    color: colors.primary.default,
    fontWeight: '700',
  },
  optionList: {
    gap: rhythm.microGap,
    paddingVertical: spacing[2],
  },
  createGroupRow: {
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    minHeight: 48,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  createGroupCopy: {
    flex: 1,
    gap: rhythm.microGap,
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
  tagPanel: {
    gap: rhythm.cardContentGap,
    paddingBottom: spacing[3],
    paddingTop: spacing[1],
  },
  templateGrid: {
    gap: rhythm.listCardGap,
    paddingBottom: spacing[3],
    paddingTop: spacing[1],
  },
  templateChip: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    minHeight: 50,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  templateCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  templateTitle: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '700',
  },
  templateMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  tagInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
  },
  tagInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    flex: 1,
    minHeight: 38,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
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
    gap: rhythm.microGap,
  },
  addTagButton: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderColor: colors.primary.hover,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  addTagLabel: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
    fontWeight: '500',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  helperText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  devPresetButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: rhythm.microGap,
    minHeight: 28,
    paddingRight: spacing[2],
    paddingVertical: spacing[1],
  },
  devPresetText: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: rhythm.compactGridGap,
  },
  fillCell: {
    width: '100%',
  },
  gridAfterPanel: {
    marginTop: rhythm.listCardGap,
  },
  footerWrap: {
    gap: rhythm.microGap,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  footerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerTitle: {
    ...typography.textStyles.bodyStrong,
  },
  footerInlineActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    minHeight: metrics.bottomActionHeight,
  },
  footerPrimaryAction: {
    flex: 1,
    minWidth: 0,
  },
  footerCancelButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: rhythm.microGap,
    height: metrics.bottomActionHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  footerCancelText: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
    fontWeight: '500',
  },
  batchActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.microGap,
  },
  batchActionCard: {
    ...shadows.sm,
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: spacing[2],
    width: '32%',
  },
  batchActionDangerCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
  },
  batchActionDisabled: {
    opacity: 0.45,
  },
  batchActionLabel: {
    ...typography.textStyles.micro,
    color: colors.text.title,
    fontWeight: '500',
  },
  batchActionDangerLabel: {
    color: colors.semantic.danger,
  },
  footerMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  pressed: {
    opacity: 0.82,
  },
});
