import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { LightFormSection } from '../components/LightFormSection';
import { OptionSelectRow } from '../components/OptionSelectRow';
import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TagChip } from '../components/TagChip';
import { ThumbnailTile } from '../components/ThumbnailTile';
import { commonButtonCopy } from '../constants/copy';
import { getGroupTypeLabel } from '../constants/groups';
import { TAG_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, imageRepository, ipRepository, tagRepository, type GroupRecord, type ImageListItem, type IpRecord } from '../database';
import { colors, metrics, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';
import { getFileInfo } from '../services/fileStorageService';
import { isDevToolsEnabled } from '../utils/dev';
import { devLog } from '../utils/dev';
import { mergeDraftTagNames } from '../utils/tagDrafts';

type BatchSource = 'ip-detail' | 'all-images' | 'group-images';
type BatchMode = 'idle' | 'move-group' | 'add-tags';

interface BatchManageImagesScreenProps {
  ipId: number;
  source: BatchSource;
  groupId?: number | null;
  initialSelectedImageIds?: number[];
  refreshToken: number;
  onBack: () => void;
  onImportImages: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}

export function BatchManageImagesScreen({
  ipId,
  source,
  groupId = null,
  initialSelectedImageIds = [],
  refreshToken,
  onBack,
  onImportImages,
  onChanged,
  onDeleted,
}: BatchManageImagesScreenProps) {
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{
    ip: IpRecord | null;
    groups: GroupRecord[];
    images: ImageListItem[];
  }>(
    async () => {
      const [ip, groups, images] = await Promise.all([
        ipRepository.findById(ipId),
        groupRepository.findByIpId(ipId),
        groupId != null ? imageRepository.findByGroupId(groupId) : imageRepository.findByIpId(ipId),
      ]);

      return { ip, groups, images };
    },
    [groupId, ipId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取批量管理数据失败：${message}`;
      },
      initialData: { ip: null, groups: [], images: [] },
    }
  );
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const [selectedImageIds, setSelectedImageIds] = useState<number[]>(() => [...new Set(initialSelectedImageIds)]);
  const [mode, setMode] = useState<BatchMode>('idle');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(groupId ?? null);
  const [tagInput, setTagInput] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const images = data?.images ?? [];
  const groups = data?.groups ?? [];
  const visibleImageIds = useMemo(() => images.map((image) => image.id), [images]);
  const selectedImages = useMemo(
    () => images.filter((image) => selectedImageIds.includes(image.id)),
    [images, selectedImageIds]
  );
  const selectedCount = selectedImages.length;
  const allSelected = images.length > 0 && selectedCount === images.length;

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
    setSelectedImageIds((current) =>
      current.includes(imageId) ? current.filter((item) => item !== imageId) : [...current, imageId]
    );
  }

  function handleSelectAllToggle() {
    setSelectedImageIds(allSelected ? [] : visibleImageIds);
  }

  function resetInlineMode(nextMode: BatchMode = 'idle') {
    setMode(nextMode);
    if (nextMode !== 'add-tags') {
      setTagInput('');
      setDraftTags([]);
    }
    if (nextMode !== 'move-group') {
      setSelectedGroupId(groupId ?? null);
    }
  }

  function addDraftTag(rawValue?: string) {
    const nextTags = mergeDraftTagNames(draftTags, rawValue ?? tagInput);
    if (nextTags.length === draftTags.length) {
      if ((rawValue ?? tagInput).trim()) {
        setTagInput('');
      }
      return;
    }

    setDraftTags(nextTags);
    setTagInput('');
    if (submitError) {
      clearSubmitError();
    }
  }

  function handleMoveGroup() {
    void runSubmit(
      async () => {
        const changedCount = await imageRepository.updateManyGroup(selectedImageIds, selectedGroupId);
        if (changedCount === 0) {
          throw new Error('没有可移动的图片。');
        }

        resetInlineMode();
        onChanged();
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `批量移动分组失败：${message}`;
        },
        validate: () => (selectedCount === 0 ? '请先选择至少一张图片。' : null),
      }
    );
  }

  function handleAddTags() {
    void runSubmit(
      async () => {
        const preparedTags = mergeDraftTagNames(draftTags, tagInput);
        if (preparedTags.length !== draftTags.length) {
          setDraftTags(preparedTags);
          setTagInput('');
        }

        const addedTags = await tagRepository.addTagsToImages(selectedImageIds, preparedTags);
        if (addedTags.length === 0) {
          throw new Error('没有可添加的标签。');
        }

        resetInlineMode();
        onChanged();
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
        const changedCount = await imageRepository.updateManyFavorite(selectedImageIds, isFavorite);
        if (changedCount === 0) {
          throw new Error('没有可更新的图片。');
        }

        onChanged();
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

  function handleSoftDelete() {
    if (selectedCount === 0) {
      return;
    }

    Alert.alert(
      '确认删除到回收站',
      `选中的 ${selectedCount} 张图片会进入回收站，但原图和缩略图文件仍会保留在本地。`,
      [
        {
          text: '取消',
          style: 'cancel',
        },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: () => {
            void runSubmit(
              async () => {
                const imageCopies = [...selectedImages];
                const deletedCount = await imageRepository.softDeleteMany(selectedImageIds);
                if (deletedCount === 0) {
                  throw new Error('没有可删除的图片。');
                }

                const verification = await Promise.all(
                  imageCopies.map(async (image) => {
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
                      deletedAt: (await imageRepository.findById(image.id, { includeDeleted: true }))?.deletedAt ?? null,
                    };
                  })
                );

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

                onDeleted();
              },
              {
                formatError: (error) => {
                  const message = error instanceof Error ? error.message : '未知错误';
                  return `批量删除失败：${message}`;
                },
              }
            );
          },
        },
      ]
    );
  }

  const footer = (
    <View style={styles.footerWrap}>
      <View style={styles.footerHeader}>
        <Text style={styles.footerTitle}>已选择 {selectedCount} 张</Text>
        <Text style={styles.footerMeta}>共 {images.length} 张</Text>
      </View>
      {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
      {mode === 'move-group' ? (
        <View style={styles.footerInlineActions}>
          <View style={styles.footerPrimaryAction}>
            <PrimaryButton disabled={selectedCount === 0} label="确认移动分组" loading={isSubmitting} onPress={handleMoveGroup} />
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
      ) : (
        <View style={styles.batchActionGrid}>
          <BatchActionButton
            disabled={selectedCount === 0 || isSubmitting}
            icon="swap-horizontal-outline"
            label="移动分组"
            onPress={() => {
              setSelectedGroupId(groupId ?? null);
              setMode('move-group');
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
            danger
            disabled={selectedCount === 0 || isSubmitting}
            icon="trash-outline"
            label="删除"
            onPress={handleSoftDelete}
          />
          <BatchActionButton
            disabled={isSubmitting}
            icon={allSelected ? 'remove-circle-outline' : 'checkmark-done-outline'}
            label={allSelected ? '取消全选' : '全选'}
            onPress={handleSelectAllToggle}
          />
        </View>
      )}
    </View>
  );

  return (
    <ScreenScaffold footer={footer} onBack={onBack} scrollable title="批量管理">
      <View style={styles.summaryCard}>
        <View style={styles.summaryIcon}>
          <Ionicons color={colors.primary.default} name="albums-outline" size={22} />
        </View>
        <View style={styles.summaryCopy}>
          <Text numberOfLines={1} style={styles.summaryTitle}>{data?.ip?.name ?? '当前IP'}</Text>
          <Text numberOfLines={2} style={styles.summaryMeta}>
            {source === 'group-images'
              ? `分组内 ${images.length} 张，可批量整理`
              : `当前 IP 共 ${images.length} 张，可批量整理`}
          </Text>
        </View>
      </View>

      <PageStateBlock
        emptyActionLabel={commonButtonCopy.importImages}
        emptyDescription="导入图片后，这里可以用于批量移动分组、加标签、收藏和软删除。"
        emptyIconName="albums-outline"
        emptyTitle="还没有可管理的图片"
        errorMessage={errorMessage}
        isEmpty={!isLoading && images.length === 0}
        loading={isLoading}
        loadingDescription="SQLite 图片列表加载完成后，这里会展示可批量操作的图片。"
        loadingTitle="正在读取批量管理列表"
        onEmptyAction={onImportImages}
        onRetry={reload}
      >
        <View style={styles.topBar}>
          <Text style={styles.selectionText}>已选择 {selectedCount} 张</Text>
          <Pressable onPress={handleSelectAllToggle} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
            <Text style={styles.linkText}>{allSelected ? '取消全选' : '全选'}</Text>
          </Pressable>
        </View>

        {mode === 'move-group' ? (
          <LightFormSection hint="只更新分组记录，不移动原图或缩略图文件。" title="选择目标分组">
            <View style={styles.optionList}>
              <OptionSelectRow
                label="无分组"
                meta="保留在当前 IP"
                onPress={() => setSelectedGroupId(null)}
                selected={selectedGroupId === null}
              />
              {groups.map((group) => (
                <OptionSelectRow
                  key={group.id}
                  label={group.name}
                  meta={getGroupTypeLabel(group.type)}
                  onPress={() => setSelectedGroupId(group.id)}
                  selected={selectedGroupId === group.id}
                />
              ))}
            </View>
          </LightFormSection>
        ) : null}

        {mode === 'add-tags' ? (
          <LightFormSection hint={`追加到已选 ${selectedCount} 张图片，不覆盖原有标签。`} title="添加标签">
            <View style={styles.tagPanel}>
              <View style={styles.tagInputRow}>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSubmitting}
                  maxLength={TAG_NAME_MAX_LENGTH}
                  onChangeText={(value) => {
                    setTagInput(value);
                    if (submitError) {
                      clearSubmitError();
                    }
                  }}
                  placeholder="例如：batchTag"
                  placeholderTextColor={colors.text.placeholder}
                  selectionColor={colors.primary.default}
                  style={styles.tagInput}
                  value={tagInput}
                />
                <Pressable
                  accessibilityLabel="添加标签"
                  onPress={() => addDraftTag()}
                  style={({ pressed }) => [styles.addTagButton, pressed && styles.pressed]}
                >
                  <Ionicons color={colors.primary.default} name="add" size={18} />
                  <Text style={styles.addTagLabel}>添加</Text>
                </Pressable>
              </View>
              {draftTags.length > 0 ? (
                <View style={styles.tagsWrap}>
                  {draftTags.map((tag) => (
                    <TagChip
                      key={tag}
                      label={tag}
                      onRemove={() => setDraftTags((current) => current.filter((item) => item.toLowerCase() !== tag.toLowerCase()))}
                      removable
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.helperText}>暂时还没有待添加标签。</Text>
              )}
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

        <View style={[styles.grid, mode !== 'idle' ? styles.gridAfterPanel : null]}>
          {images.map((image) => (
            <ThumbnailTile
              image={image}
              key={image.id}
              onPress={() => toggleImageSelection(image.id)}
              selected={selectedImageIds.includes(image.id)}
            />
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
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

const styles = StyleSheet.create({
  summaryCard: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: -spacing[4],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  summaryIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  summaryCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  summaryTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  summaryMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[3],
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[1],
  },
  selectionText: {
    ...typography.textStyles.bodyStrong,
  },
  linkButton: {
    paddingVertical: spacing[1],
  },
  linkText: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
    fontWeight: '500',
  },
  optionList: {
    gap: spacing[1],
    paddingVertical: spacing[2],
  },
  tagPanel: {
    gap: spacing[2],
    paddingBottom: spacing[3],
    paddingTop: spacing[1],
  },
  tagInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
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
  addTagButton: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderColor: colors.primary.hover,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
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
    gap: spacing[2],
  },
  helperText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  devPresetButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 28,
    paddingRight: spacing[2],
    paddingVertical: spacing[1],
  },
  devPresetText: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
  grid: {
    columnGap: spacing[2],
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing[2],
  },
  gridAfterPanel: {
    marginTop: spacing[3],
  },
  footerWrap: {
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1.5],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1.5],
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
    gap: spacing[2],
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
    gap: spacing[1],
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
    gap: spacing[1.5],
  },
  batchActionCard: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing[2],
    width: '32%',
  },
  batchActionDangerCard: {
    backgroundColor: colors.semantic.dangerBackground,
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
