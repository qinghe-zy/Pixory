import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { AppDialog } from '../components/AppDialog';
import { DevOnlyCard } from '../components/DevOnlyCard';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { LightFormSection } from '../components/LightFormSection';
import { OptionSelectRow } from '../components/OptionSelectRow';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { PrimaryButton } from '../components/PrimaryButton';
import { SwitchSettingRow } from '../components/SwitchSettingRow';
import { TagChip } from '../components/TagChip';
import { commonButtonCopy } from '../constants/copy';
import { getGroupTypeLabel } from '../constants/groups';
import { NOTE_MAX_LENGTH, TAG_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, importTemplateRepository, ipRepository, runWithDatabaseSpace, settingsRepository, tagRepository, type GroupRecord, type ImportTemplateRecord, type IpRecord, type PixorySpace, type TagUsageItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';
import {
  importImagesToIp,
  pickImagesForImport,
  type DuplicateImportDecision,
  type PickedImageAsset,
} from '../services/imageImportService';
import { importPackageToIp, pickPackageForImport, type PackageImportResult } from '../services/packageImportService';
import { importVideosToIp, pickVideosForImport, type PickedVideoAsset } from '../services/videoImportService';
import { mergeDelimitedDraftTagNames, mergeDraftTagNames } from '../utils/tagDrafts';
import { devLog } from '../utils/dev';
import { useToast } from '../components/AppToast';
import type { PersonalTaskToken } from '../services/personalTaskToken';
import type { ImageImportSourceMode, VideoImportNamingMode } from '../database/repositories/settingsRepository';

interface ImportImagesScreenProps {
  space?: PixorySpace;
  taskToken?: PersonalTaskToken | null;
  ipId: number;
  defaultGroupId?: number | null;
  initialMediaPicker?: 'images' | 'videos';
  onBack: () => void;
  onImported: (imageIds: number[], importBatchId: number | null) => void;
}

export function ImportImagesScreen({
  space = 'normal',
  taskToken = null,
  ipId,
  defaultGroupId = null,
  initialMediaPicker,
  onBack,
  onImported,
}: ImportImagesScreenProps) {
  const { showToast } = useToast();
  const {
    data: screenData,
    errorMessage: loadErrorMessage,
    reload,
  } = useScreenLoad<{ ip: IpRecord | null; groups: GroupRecord[]; importTemplates: ImportTemplateRecord[]; recentGroupIds: number[]; recentTags: TagUsageItem[]; imageImportSourceMode: ImageImportSourceMode; videoImportNamingMode: VideoImportNamingMode }>(
    async () => {
      const [ip, groups, importTemplates, recentGroupIds, recentTags, imageImportSourceMode, videoImportNamingMode] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findById(db, ipId),
        groupRepository.findByIpId(db, ipId),
        importTemplateRepository.findAll(db),
        settingsRepository.getRecentImportGroupIds(db),
        tagRepository.findRecentlyUsed(db, 8),
        settingsRepository.getImageImportSourceMode(db),
        settingsRepository.getVideoImportNamingMode(db),
      ]));

      return { ip, groups, importTemplates, recentGroupIds, recentTags, imageImportSourceMode, videoImportNamingMode };
    },
    [ipId, space],
    {
      initialData: { ip: null, groups: [], importTemplates: [], recentGroupIds: [], recentTags: [], imageImportSourceMode: 'copy', videoImportNamingMode: 'preserveOriginal' },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取导入配置失败：${message}`;
      },
    }
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(defaultGroupId != null ? [defaultGroupId] : []);
  const [pickedAssets, setPickedAssets] = useState<PickedImageAsset[]>([]);
  const [pickedVideos, setPickedVideos] = useState<PickedVideoAsset[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [isOptionalOpen, setIsOptionalOpen] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isPickingVideos, setIsPickingVideos] = useState(false);
  const [isPickingPackage, setIsPickingPackage] = useState(false);
  const [packageImportResult, setPackageImportResult] = useState<PackageImportResult | null>(null);
  const [duplicateDecision, setDuplicateDecision] = useState<DuplicateImportDecision>('importAll');
  const [imageImportSourceMode, setImageImportSourceMode] = useState<ImageImportSourceMode>('copy');
  const [videoImportNamingMode, setVideoImportNamingMode] = useState<VideoImportNamingMode>('preserveOriginal');
  const [isIpConflictDialogVisible, setIsIpConflictDialogVisible] = useState(false);
  const [importProgressLabel, setImportProgressLabel] = useState<string | null>(null);
  const [isTemplateDialogVisible, setIsTemplateDialogVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ImportTemplateRecord | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<ImportTemplateRecord | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateGroupName, setTemplateGroupName] = useState('');
  const [templateTagsInput, setTemplateTagsInput] = useState('');
  const [templateNote, setTemplateNote] = useState('');
  const [templateFavorite, setTemplateFavorite] = useState(false);
  const initialMediaPickerHandledRef = useRef(false);
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const canImport = useMemo(
    () => (pickedAssets.length > 0 || pickedVideos.length > 0) && !isSubmitting,
    [pickedAssets.length, pickedVideos.length, isSubmitting]
  );
  const ip = screenData?.ip ?? null;
  const groups = screenData?.groups ?? [];
  const importTemplates = screenData?.importTemplates ?? [];
  const recentGroupIds = screenData?.recentGroupIds ?? [];
  const recentTags = screenData?.recentTags ?? [];
  const recentGroups = useMemo(() => {
    const idSet = new Set(recentGroupIds);
    return groups.filter((group) => idSet.has(group.id)).slice(0, 5);
  }, [groups, recentGroupIds]);
  const remainingGroups = useMemo(() => {
    const idSet = new Set(recentGroups.map((group) => group.id));
    return groups.filter((group) => !idSet.has(group.id));
  }, [groups, recentGroups]);

  useEffect(() => {
    setImageImportSourceMode(screenData?.imageImportSourceMode ?? 'copy');
    setVideoImportNamingMode(screenData?.videoImportNamingMode ?? 'preserveOriginal');
  }, [screenData?.imageImportSourceMode, screenData?.videoImportNamingMode]);

  function updateImageImportSourceMode(nextMode: ImageImportSourceMode) {
    setImageImportSourceMode(nextMode);
    void runWithDatabaseSpace(space, (db) => settingsRepository.setImageImportSourceMode(db, nextMode));
  }

  function updateVideoImportNamingMode(nextMode: VideoImportNamingMode) {
    setVideoImportNamingMode(nextMode);
    void runWithDatabaseSpace(space, (db) => settingsRepository.setVideoImportNamingMode(db, nextMode));
  }

  useEffect(() => {
    if (!initialMediaPicker || initialMediaPickerHandledRef.current) {
      return;
    }
    initialMediaPickerHandledRef.current = true;
    if (initialMediaPicker === 'videos') {
      void handlePickVideos();
      return;
    }
    void handlePickImages();
  }, [initialMediaPicker]);

  async function handlePickImages() {
    setIsPicking(true);
    if (submitError) {
      clearSubmitError();
    }

    try {
      const result = await pickImagesForImport();
      if (!result.canceled) {
        setPickedAssets(result.pickedAssets);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`选择图片失败：${message}`);
    } finally {
      setIsPicking(false);
    }
  }

  async function handlePickVideos() {
    setIsPickingVideos(true);
    if (submitError) {
      clearSubmitError();
    }

    try {
      const result = await pickVideosForImport();
      if (!result.canceled) {
        setPickedVideos(result.pickedAssets);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`选择视频失败：${message}`);
    } finally {
      setIsPickingVideos(false);
    }
  }

  function addTag(rawValue?: string) {
    const nextTags = mergeDelimitedDraftTagNames(tags, rawValue ?? tagInput);
    if (nextTags.length === tags.length) {
      if ((rawValue ?? tagInput).trim()) {
        setTagInput('');
      }
      return;
    }

    setTags(nextTags);
    setTagInput('');
  }

  async function createGroupAndSelect(name: string): Promise<GroupRecord> {
    const preparedName = name.trim();
    if (!preparedName) {
      throw new Error('请输入分组名称。');
    }

    const group = await runWithDatabaseSpace(space, async (db) => {
      const existing = await groupRepository.findByIpIdAndName(db, ipId, preparedName);
      return existing ?? groupRepository.create(db, { ipId, name: preparedName, type: 'custom' });
    });
    setSelectedGroupIds((current) => (current.includes(group.id) ? current : [...current, group.id]));
    await reload();
    return group;
  }

  async function handleCreateGroup() {
    if (isCreatingGroup) {
      return;
    }

    setIsCreatingGroup(true);
    try {
      const group = await createGroupAndSelect(newGroupName);
      setNewGroupName('');
      showToast(`已新建分组：${group.name}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '新建分组失败');
    } finally {
      setIsCreatingGroup(false);
    }
  }

  async function applyTemplate(template: ImportTemplateRecord) {
    try {
      const group = await createGroupAndSelect(template.groupName);
      setSelectedGroupIds([group.id]);
      setSelectedTemplateKey(template.key);
      setTags((current) => template.tags.reduce((items, tag) => mergeDraftTagNames(items, tag), current));
      setNote(template.note);
      setIsFavorite(template.isFavorite);
      showToast(`已应用模板：${template.name}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '应用模板失败');
    }
  }

  function resetTemplateForm() {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateGroupName('');
    setTemplateTagsInput('');
    setTemplateNote('');
    setTemplateFavorite(false);
  }

  function startCreateTemplate() {
    resetTemplateForm();
    setIsTemplateDialogVisible(true);
  }

  function startEditTemplate(template: ImportTemplateRecord) {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateGroupName(template.groupName);
    setTemplateTagsInput(template.tags.join(' '));
    setTemplateNote(template.note);
    setTemplateFavorite(template.isFavorite);
    setIsTemplateDialogVisible(true);
  }

  function submitTemplateForm() {
    const preparedTags = mergeDelimitedDraftTagNames([], templateTagsInput);
    const input = {
      name: templateName,
      groupName: templateGroupName,
      tags: preparedTags,
      note: templateNote,
      isFavorite: templateFavorite,
    };

    void (async () => {
      try {
        await runWithDatabaseSpace(space, (db) =>
          editingTemplate
            ? importTemplateRepository.update(db, editingTemplate.key, input)
            : importTemplateRepository.create(db, input)
        );
        showToast(editingTemplate ? '已更新模板' : '已新建模板');
        setIsTemplateDialogVisible(false);
        resetTemplateForm();
        await reload();
      } catch (error) {
        showToast(error instanceof Error ? `保存模板失败：${error.message}` : '保存模板失败');
      }
    })();
  }

  function confirmDeleteTemplate() {
    if (!deleteTemplate) {
      return;
    }

    const template = deleteTemplate;
    setDeleteTemplate(null);
    void (async () => {
      try {
        const deletedCount = await runWithDatabaseSpace(space, (db) => importTemplateRepository.deleteByKey(db, template.key));
        if (deletedCount === 0) {
          throw new Error('没有找到这个模板。');
        }
        if (selectedTemplateKey === template.key) {
          setSelectedTemplateKey(null);
        }
        showToast('已删除模板');
        await reload();
      } catch (error) {
        showToast(error instanceof Error ? `删除模板失败：${error.message}` : '删除模板失败');
      }
    })();
  }

  function applyRegressionPreset() {
    setTags(['tagA', 'tagB']);
    setNote('android import note');
    setIsFavorite(true);
  }

  function handleImport() {
    void runSubmit(async () => {
      try {
        const preparedTags = mergeDraftTagNames(tags, tagInput);
        const preparedNote = note.trim();

        if (preparedTags.length !== tags.length) {
          setTags(preparedTags);
          setTagInput('');
        }

        devLog('Pixory import request payload:', {
          ipId,
          groupIds: selectedGroupIds,
          tagNames: preparedTags,
          note: preparedNote || null,
          isFavorite,
          templateKey: selectedTemplateKey,
          pickedAssetsCount: pickedAssets.length,
          pickedVideosCount: pickedVideos.length,
        });

      const importedAssetIds: number[] = [];
      let importBatchId: number | null = null;
      let imageSuccessCount = 0;
      let videoSuccessCount = 0;
      let imageSkippedCount = 0;
      let videoSkippedCount = 0;
      let failedCount = 0;

      if (pickedAssets.length > 0) {
        setImportProgressLabel(`正在导入 ${pickedAssets.length} 张图片`);
        const imageResult = await importImagesToIp({
          space,
          ipId,
          groupIds: selectedGroupIds,
          tagNames: preparedTags,
          note: preparedNote,
          isFavorite,
          templateKey: selectedTemplateKey,
          pickedAssets,
          duplicateDecision,
          imageImportSourceMode,
          taskToken,
        });

        imageSuccessCount = imageResult.successCount;
        imageSkippedCount = imageResult.skippedCount;
        failedCount += imageResult.failedCount;
        importedAssetIds.push(...imageResult.importedImages.map((item) => item.image.id));
        importBatchId = imageResult.importBatch?.id ?? importBatchId;

        devLog('Pixory image import result readback:', {
          successCount: imageResult.successCount,
          skippedCount: imageResult.skippedCount,
          failedCount: imageResult.failedCount,
          skippedItems: imageResult.skippedItems.map((item) => ({
            filename: item.originalFilename,
            message: item.message,
          })),
          importedImages: imageResult.importedImages.map((item) => ({
            imageId: item.image.id,
            groupId: item.image.groupId,
            isFavorite: item.image.isFavorite,
            note: item.image.note,
            tagNames: item.tags.map((tag) => tag.name),
          })),
        });
      }

      if (pickedVideos.length > 0) {
        setImportProgressLabel(`正在导入 ${pickedVideos.length} 个视频`);
        const videoResult = await importVideosToIp({
          space,
          ipId,
          groupIds: selectedGroupIds,
          tagNames: preparedTags,
          note: preparedNote,
          isFavorite,
          pickedAssets: pickedVideos,
          duplicateDecision,
          videoImportNamingMode,
        });

        videoSuccessCount = videoResult.successCount;
        videoSkippedCount = videoResult.skippedCount;
        failedCount += videoResult.failedCount;
        importedAssetIds.push(...videoResult.importedVideos.map((item) => item.video.id));
        importBatchId = pickedAssets.length === 0 ? videoResult.importBatch?.id ?? null : null;
      }

      setImportProgressLabel(null);

      const skippedCount = imageSkippedCount + videoSkippedCount;
      const successCount = imageSuccessCount + videoSuccessCount;

      if (importedAssetIds.length === 0) {
        if (skippedCount > 0 && failedCount === 0) {
          showToast(`没有导入新素材，已跳过 ${skippedCount} 个重复素材。`);
          return;
        }
        throw new Error(`没有成功导入素材，成功 0 个，跳过 ${skippedCount} 个，失败 ${failedCount} 个。`);
      }

      await runWithDatabaseSpace(space, (db) => settingsRepository.rememberImportGroupIds(db, selectedGroupIds));
      const toastParts = [
        `成功 ${successCount}`,
        skippedCount > 0 ? `跳过 ${skippedCount}` : null,
        failedCount > 0 ? `失败 ${failedCount}` : null,
      ].filter(Boolean);
        showToast(`导入完成：${toastParts.join(' · ')}`);
        onImported(importedAssetIds, importBatchId);
      } finally {
        setImportProgressLabel(null);
      }
    }, {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `导入失败：${message}`;
      },
      validate: () => (pickedAssets.length === 0 && pickedVideos.length === 0 ? '请先选择要导入的素材。' : null),
    });
  }

  async function handlePackageImport() {
    if (isPickingPackage || isSubmitting) {
      return;
    }

    setIsPickingPackage(true);
    if (submitError) {
      clearSubmitError();
    }

    try {
      const packagePick = await pickPackageForImport();
      if (packagePick.canceled || !packagePick.packageUri || !packagePick.packageName) {
        return;
      }

      const preparedTags = mergeDraftTagNames(tags, tagInput);
      const result = await importPackageToIp({
        space,
        ipId,
        packageUri: packagePick.packageUri,
        packageName: packagePick.packageName,
        groupIds: selectedGroupIds,
        tagNames: preparedTags,
        note: note.trim(),
        isFavorite,
        ipNameConflictStrategy: 'ask',
      });
      setPackageImportResult(result);

      if (result.successCount === 0) {
        throw new Error(`没有成功导入素材，失败 ${result.failedCount} 个，跳过 ${result.skippedCount} 个文件。`);
      }

      await runWithDatabaseSpace(space, (db) => settingsRepository.rememberImportGroupIds(db, selectedGroupIds));
      showToast(`资源包导入：图片 ${result.imageSuccessCount} · 视频 ${result.videoSuccessCount} · 跳过 ${result.skippedCount}`);
      onImported(
        [
          ...result.importedImages.map((item) => item.image.id),
          ...result.importedVideos.map((item) => item.video.id),
        ],
        result.importBatchId
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      if (message.includes('同名 IP')) {
        setIsIpConflictDialogVisible(true);
      }
      showToast(`资源包导入失败：${message}`);
    } finally {
      setIsPickingPackage(false);
    }
  }

  return (
    <FormScreenScaffold
      backgroundVariant="workflow"
      errorMessage={submitError ?? loadErrorMessage}
      footerExtra={
        loadErrorMessage ? (
          <Text style={styles.reloadLink} onPress={reload}>
            {commonButtonCopy.retry}
          </Text>
        ) : null
      }
      onBack={onBack}
      primaryAction={{ disabled: !canImport, label: '开始导入', loading: isSubmitting, onPress: handleImport }}
      secondaryAction={{ disabled: isSubmitting, label: '取消返回', onPress: onBack }}
      title="导入素材"
    >
      <View style={styles.formWrap}>
        <LightFormSection title="选择图片">
          <View style={styles.pickRow}>
            <Pressable
              accessibilityRole="button"
              disabled={isPicking}
              onPress={handlePickImages}
              style={({ pressed }) => [styles.pickZone, pressed && styles.pressed]}
            >
              <View style={styles.pickIconWrap}>
                <Ionicons color={colors.primary.default} name="images-outline" size={22} />
              </View>
              <View style={styles.pickCopy}>
                <Text numberOfLines={1} style={styles.pickTitle}>
                  {isPicking ? '正在打开相册…' : pickedAssets.length > 0 ? `已选择 ${pickedAssets.length} 张` : '选择图片'}
                </Text>
                <Text numberOfLines={1} style={styles.pickHint}>{pickedAssets.length > 0 ? '点击可重新选择' : '从系统相册批量选择原图'}</Text>
              </View>
            </Pressable>
            {pickedAssets.length > 0 ? (
              <View style={styles.previewRow}>
                {pickedAssets.map((asset, index) => (
                  <View key={`${asset.uri}-${index}`} style={styles.previewCard}>
                    <Image resizeMode="cover" source={{ uri: asset.uri }} style={styles.previewImage} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </LightFormSection>

        {importProgressLabel ? (
          <View style={styles.progressPanel}>
            <Ionicons color={colors.primary.active} name="sync-outline" size={18} />
            <Text style={styles.progressText}>{importProgressLabel}</Text>
          </View>
        ) : null}

        <LightFormSection title="选择视频">
          <Pressable
            accessibilityRole="button"
            disabled={isPickingVideos || isSubmitting}
            onPress={handlePickVideos}
            style={({ pressed }) => [styles.packageZone, (isPickingVideos || isSubmitting) && styles.disabled, pressed && styles.pressed]}
          >
            <View style={styles.pickIconWrap}>
              <Ionicons color={colors.primary.default} name="videocam-outline" size={22} />
            </View>
            <View style={styles.pickCopy}>
              <Text numberOfLines={1} style={styles.pickTitle}>
                {isPickingVideos ? '正在打开文件选择…' : pickedVideos.length > 0 ? `已选择 ${pickedVideos.length} 个视频` : '选择视频'}
              </Text>
              <Text numberOfLines={1} style={styles.pickHint}>{pickedVideos.length > 0 ? '点击可重新选择' : '从系统文件中选择视频'}</Text>
            </View>
          </Pressable>
          {pickedVideos.length > 0 ? (
            <View style={styles.videoPreviewList}>
              {pickedVideos.slice(0, 5).map((video, index) => (
                <View key={`${video.uri}-${index}`} style={styles.videoPreviewRow}>
                  <Ionicons color={colors.primary.default} name="play-circle-outline" size={18} />
                  <Text numberOfLines={1} style={styles.videoPreviewName}>{video.fileName}</Text>
                </View>
              ))}
              {pickedVideos.length > 5 ? <Text style={styles.pickHint}>另有 {pickedVideos.length - 5} 个视频</Text> : null}
            </View>
          ) : null}
        </LightFormSection>

        <LightFormSection title="资源包导入">
          <Pressable
            accessibilityRole="button"
            disabled={isPickingPackage || isSubmitting}
            onPress={handlePackageImport}
            style={({ pressed }) => [styles.packageZone, (isPickingPackage || isSubmitting) && styles.disabled, pressed && styles.pressed]}
          >
            <View style={styles.pickIconWrap}>
              <Ionicons color={colors.primary.default} name="archive-outline" size={22} />
            </View>
            <View style={styles.pickCopy}>
              <Text numberOfLines={1} style={styles.pickTitle}>
                {isPickingPackage ? '正在处理资源包…' : '选择资源包'}
              </Text>
              <Text numberOfLines={1} style={styles.pickHint}>支持 .zip / .pixorypack</Text>
            </View>
          </Pressable>
          {packageImportResult ? (
            <Text style={styles.packageResult}>
              图片 {packageImportResult.imageSuccessCount} · 视频 {packageImportResult.videoSuccessCount} · 失败 {packageImportResult.failedCount} · 跳过 {packageImportResult.skippedCount}
            </Text>
          ) : null}
        </LightFormSection>

        <LightFormSection title="导入策略">
          <SwitchSettingRow
            disabled={isSubmitting}
            hint="复制会保留系统相册文件；移动会在 Pixory 写入并校验成功后删除相册源资产。"
            label="图片导入使用移动模式"
            onValueChange={(enabled) => updateImageImportSourceMode(enabled ? 'move' : 'copy')}
            value={imageImportSourceMode === 'move'}
          />
          <SwitchSettingRow
            disabled={isSubmitting}
            hint="关闭后使用 Pixory 自动编号文件名。"
            label="视频保留原文件名"
            onValueChange={(enabled) => updateVideoImportNamingMode(enabled ? 'preserveOriginal' : 'generated')}
            value={videoImportNamingMode === 'preserveOriginal'}
          />
          <View style={styles.duplicateDecisionList}>
            <Text style={styles.inlineLabel}>重复/相似素材</Text>
            <OptionSelectRow
              label="全部导入"
              meta="即使发现重复也写入素材库"
              onPress={() => setDuplicateDecision('importAll')}
              selected={duplicateDecision === 'importAll'}
            />
            <OptionSelectRow
              label="跳过精确重复"
              meta="contentHash 完全一致时跳过"
              onPress={() => setDuplicateDecision('skipExact')}
              selected={duplicateDecision === 'skipExact'}
            />
            <OptionSelectRow
              label="跳过精确重复和相似图片"
              meta="同时跳过 visualHash 命中的相似图片"
              onPress={() => setDuplicateDecision('skipSimilar')}
              selected={duplicateDecision === 'skipSimilar'}
            />
          </View>
        </LightFormSection>

        <LightFormSection title="目标归属">
          <View style={styles.currentIpRow}>
            <Text style={styles.currentIpLabel}>当前 IP</Text>
            <View style={styles.currentIpBadge}>
              <Text numberOfLines={1} style={styles.currentIpBadgeText}>{ip?.name ?? `IP #${ipId}`}</Text>
            </View>
          </View>

          <View style={styles.optionList}>
            <OptionSelectRow
              label="暂不分组"
              meta="导入到当前 IP"
              onPress={() => setSelectedGroupIds([])}
              selected={selectedGroupIds.length === 0}
            />
            {recentGroups.length > 0 ? <Text style={styles.inlineLabel}>最近使用分组</Text> : null}
            {recentGroups.map((group) => (
              <OptionSelectRow
                key={group.id}
                label={group.name}
                meta={getGroupTypeLabel(group.type)}
                onPress={() =>
                  setSelectedGroupIds((current) =>
                    current.includes(group.id)
                      ? current.filter((groupId) => groupId !== group.id)
                      : [...current, group.id]
                  )
                }
                selected={selectedGroupIds.includes(group.id)}
              />
            ))}
            {recentGroups.length > 0 && remainingGroups.length > 0 ? <Text style={styles.inlineLabel}>全部分组</Text> : null}
            {remainingGroups.map((group) => (
              <OptionSelectRow
                key={group.id}
                label={group.name}
                meta={getGroupTypeLabel(group.type)}
                onPress={() =>
                  setSelectedGroupIds((current) =>
                    current.includes(group.id)
                      ? current.filter((groupId) => groupId !== group.id)
                      : [...current, group.id]
                  )
                }
                selected={selectedGroupIds.includes(group.id)}
              />
            ))}
          </View>
          <View style={styles.createGroupRow}>
            <TextInput
              editable={!isCreatingGroup && !isSubmitting}
              onChangeText={setNewGroupName}
              placeholder="在导入页新建分组"
              placeholderTextColor={colors.text.placeholder}
              selectionColor={colors.primary.default}
              style={styles.createGroupInput}
              value={newGroupName}
            />
            <Pressable
              disabled={isCreatingGroup || !newGroupName.trim()}
              onPress={handleCreateGroup}
              style={({ pressed }) => [styles.createGroupButton, (isCreatingGroup || !newGroupName.trim()) ? styles.disabled : null, pressed && styles.pressed]}
            >
              <Ionicons color={colors.primary.default} name="add" size={18} />
              <Text style={styles.createGroupText}>新建</Text>
            </Pressable>
          </View>
        </LightFormSection>

        <Pressable onPress={() => setIsOptionalOpen((current) => !current)} style={({ pressed }) => [styles.optionalToggle, pressed && styles.pressed]}>
          <View style={styles.optionalIcon}>
            <Ionicons color={colors.primary.active} name="options-outline" size={17} />
          </View>
          <View style={styles.optionalCopy}>
            <Text style={styles.optionalTitle}>可选整理信息</Text>
            <Text numberOfLines={1} style={styles.optionalHint}>标签、备注、默认收藏和导入模板</Text>
          </View>
          <Ionicons color={colors.text.secondary} name={isOptionalOpen ? 'chevron-up' : 'chevron-down'} size={17} />
        </Pressable>

        {isOptionalOpen ? (
          <>
            <LightFormSection hint="一键套用常见导入归属和初始整理信息。" title="导入模板">
              <View style={styles.templateHeaderRow}>
                <Text style={styles.inlineLabel}>本地模板</Text>
                <Pressable onPress={startCreateTemplate} style={({ pressed }) => [styles.templateCreateButton, pressed && styles.pressed]}>
                  <Ionicons color={colors.primary.active} name="add" size={15} />
                  <Text style={styles.templateCreateText}>新建模板</Text>
                </Pressable>
              </View>
              <View style={styles.templateGrid}>
                {importTemplates.map((template) => (
                  <View key={template.key} style={styles.templateCard}>
                    <Pressable
                      onPress={() => void applyTemplate(template)}
                      style={({ pressed }) => [styles.templateApplyArea, selectedTemplateKey === template.key ? styles.templateSelected : null, pressed && styles.pressed]}
                    >
                      <Text numberOfLines={1} style={styles.templateText}>{template.name}</Text>
                      <Text numberOfLines={1} style={styles.templateMeta}>{template.tags.map((tag) => `#${tag}`).join(' ') || template.groupName}</Text>
                    </Pressable>
                    <View style={styles.templateActions}>
                      <Pressable accessibilityLabel="编辑模板" onPress={() => startEditTemplate(template)} style={({ pressed }) => [styles.templateIconButton, pressed && styles.pressed]}>
                        <Ionicons color={colors.text.secondary} name="create-outline" size={16} />
                      </Pressable>
                      <Pressable accessibilityLabel="删除模板" onPress={() => setDeleteTemplate(template)} style={({ pressed }) => [styles.templateIconButton, pressed && styles.pressed]}>
                        <Ionicons color={colors.semantic.danger} name="trash-outline" size={16} />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </LightFormSection>

            <LightFormSection hint="这些内容会应用到本次导入的全部素材。" title="标签与备注">
              {recentTags.length > 0 ? (
                <View style={styles.quickTags}>
                  <Text style={styles.inlineLabel}>常用标签</Text>
                  <View style={styles.tagsWrap}>
                    {recentTags.map((tag) => (
                      <Pressable
                        key={tag.id}
                        onPress={() => setTags((current) => mergeDraftTagNames(current, tag.name))}
                        style={({ pressed }) => [styles.quickTagChip, pressed && styles.pressed]}
                      >
                        <Text style={styles.quickTagText}>#{tag.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              <View style={styles.tagRow}>
                <View style={styles.tagInputRow}>
                  <TextInput
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isSubmitting}
                    maxLength={TAG_NAME_MAX_LENGTH}
                    onChangeText={(value) => {
                      if (/[,\uFF0C\s]/.test(value)) {
                        setTags((current) => mergeDelimitedDraftTagNames(current, value));
                        setTagInput('');
                        return;
                      }
                      setTagInput(value);
                      if (submitError) {
                        clearSubmitError();
                      }
                    }}
                    onSubmitEditing={() => addTag()}
                    placeholder="例如：海边、KV、立绘"
                    placeholderTextColor={colors.text.placeholder}
                    returnKeyType="done"
                    selectionColor={colors.primary.default}
                    style={styles.tagInput}
                    value={tagInput}
                  />
                  <Pressable
                    accessibilityLabel="添加标签"
                    hitSlop={8}
                    onPress={() => addTag()}
                    style={({ pressed }) => [styles.addTagButton, pressed && styles.pressed]}
                  >
                    <Ionicons color={colors.primary.default} name="add" size={18} />
                    <Text style={styles.addTagLabel}>添加</Text>
                  </Pressable>
                </View>

                {tags.length > 0 ? (
                  <View style={styles.tagsWrap}>
                    {tags.map((tag) => (
                      <TagChip key={tag} label={tag} onRemove={() => setTags((current) => current.filter((item) => item !== tag))} removable />
                    ))}
                  </View>
                ) : null}
              </View>

              <FormTextareaRow
                editable={!isSubmitting}
                hint="给这批素材补充统一备注。"
                label="备注"
                maxLength={NOTE_MAX_LENGTH}
                minHeight={84}
                onChangeText={(value) => {
                  setNote(value);
                  if (submitError) {
                    clearSubmitError();
                  }
                }}
                placeholder="例如：活动预热图、角色展示图。"
                value={note}
              />

              <SwitchSettingRow
                disabled={isSubmitting}
                hint="导入后全部标记为收藏。"
                label="默认收藏"
                onValueChange={setIsFavorite}
                value={isFavorite}
              />
            </LightFormSection>
          </>
        ) : null}

        <DevOnlyCard
          description="仅用于开发回归，必须保持与正式导入流程隔离，避免影响正式点击区域。"
          title="开发回归入口"
        >
          {/* 仅用于开发回归，正式提测前可移除。 */}
          <PrimaryButton label="应用回归测试预设" onPress={applyRegressionPreset} variant="outline" />
        </DevOnlyCard>
      </View>
      <AppDialog
        onClose={() => {
          setIsTemplateDialogVisible(false);
          resetTemplateForm();
        }}
        onPrimary={submitTemplateForm}
        primaryDisabled={!templateName.trim() || !templateGroupName.trim()}
        primaryLabel={editingTemplate ? '保存模板' : '新建模板'}
        title={editingTemplate ? '编辑模板' : '新建模板'}
        visible={isTemplateDialogVisible}
      >
        <View style={styles.templateDialogBody}>
          <TextInput
            onChangeText={setTemplateName}
            placeholder="模板名称"
            placeholderTextColor={colors.text.placeholder}
            selectionColor={colors.primary.default}
            style={styles.dialogInput}
            value={templateName}
          />
          <TextInput
            onChangeText={setTemplateGroupName}
            placeholder="默认分组名称"
            placeholderTextColor={colors.text.placeholder}
            selectionColor={colors.primary.default}
            style={styles.dialogInput}
            value={templateGroupName}
          />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setTemplateTagsInput}
            placeholder="默认标签，用空格或逗号分隔"
            placeholderTextColor={colors.text.placeholder}
            selectionColor={colors.primary.default}
            style={styles.dialogInput}
            value={templateTagsInput}
          />
          <TextInput
            multiline
            onChangeText={setTemplateNote}
            placeholder="默认备注"
            placeholderTextColor={colors.text.placeholder}
            selectionColor={colors.primary.default}
            style={[styles.dialogInput, styles.dialogTextarea]}
            value={templateNote}
          />
          <SwitchSettingRow
            hint="应用模板后，导入图片默认标记为收藏。"
            label="默认收藏"
            onValueChange={setTemplateFavorite}
            value={templateFavorite}
          />
        </View>
      </AppDialog>
      <AppDialog
        danger
        message={deleteTemplate ? `删除模板「${deleteTemplate.name}」不会影响已经导入的图片。` : ''}
        onClose={() => setDeleteTemplate(null)}
        onPrimary={confirmDeleteTemplate}
        primaryLabel="删除模板"
        title="删除模板"
        visible={Boolean(deleteTemplate)}
      />
      <AppDialog
        message="导入隐私备份、普通备份或 .pixorypack 时遇到同名 IP，需要选择合并到已有 IP、创建新 IP 或取消导入。合并时会复用同名分组和标签，不会删除目标 IP 原有素材。"
        onClose={() => setIsIpConflictDialogVisible(false)}
        onPrimary={() => setIsIpConflictDialogVisible(false)}
        primaryLabel="合并到已有 IP"
        title="同名 IP"
        visible={isIpConflictDialogVisible}
      />
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: spacing[3],
  },
  pickRow: {
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  pickZone: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 64,
    padding: spacing[3],
  },
  pickIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pickCopy: {
    flex: 1,
    gap: spacing[1],
  },
  pickTitle: {
    ...typography.textStyles.bodyStrong,
    minWidth: 0,
  },
  pickHint: {
    ...typography.textStyles.caption,
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  previewCard: {
    backgroundColor: colors.background.empty,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    aspectRatio: 1,
    width: '23.3%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  videoPreviewList: {
    gap: spacing[2],
    paddingTop: spacing[2],
  },
  videoPreviewRow: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 38,
    paddingHorizontal: spacing[3],
  },
  videoPreviewName: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    flex: 1,
    minWidth: 0,
  },
  progressPanel: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.hover,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  progressText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    flex: 1,
    fontWeight: '700',
  },
  currentIpRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    paddingBottom: spacing[2],
  },
  currentIpLabel: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  currentIpBadge: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.hover,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  currentIpBadgeText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '800',
  },
  optionList: {
    gap: spacing[1],
    paddingVertical: spacing[2],
  },
  duplicateDecisionList: {
    gap: spacing[1],
    paddingTop: spacing[1],
  },
  inlineLabel: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    paddingHorizontal: spacing[1],
    paddingTop: spacing[1],
  },
  createGroupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    paddingBottom: spacing[2],
  },
  optionalToggle: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 54,
    paddingHorizontal: spacing[3],
  },
  optionalIcon: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.sm,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  optionalCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  optionalTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  optionalHint: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  createGroupInput: {
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
  createGroupButton: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderColor: colors.primary.hover,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  createGroupText: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.45,
  },
  templateGrid: {
    gap: spacing[2],
    paddingVertical: spacing[2],
  },
  packageZone: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 62,
    padding: spacing[3],
  },
  packageResult: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    paddingHorizontal: spacing[1],
  },
  templateHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  templateCreateButton: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 30,
    paddingHorizontal: spacing[3],
  },
  templateCreateText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '700',
  },
  templateCard: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
    minHeight: 48,
    padding: spacing[2],
  },
  templateApplyArea: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[1],
  },
  templateSelected: {
    backgroundColor: colors.primary.weak,
    borderRadius: radius.sm,
  },
  templateText: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    fontWeight: '700',
  },
  templateMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  templateActions: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  templateIconButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  templateDialogBody: {
    gap: spacing[3],
  },
  dialogInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 42,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  dialogTextarea: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  quickTags: {
    gap: spacing[2],
    paddingTop: spacing[2],
  },
  quickTagChip: {
    backgroundColor: colors.background.tag,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  quickTagText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '600',
  },
  tagRow: {
    gap: spacing[2],
    paddingVertical: spacing[3],
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
    minHeight: 40,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  addTagButton: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderColor: colors.primary.hover,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    flexDirection: 'row',
    gap: spacing[1],
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
  pressed: {
    opacity: 0.82,
  },
  reloadLink: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
  },
});
