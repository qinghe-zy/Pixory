import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppDialog } from '../components/AppDialog';
import { LightFormSection } from '../components/LightFormSection';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { TagChip } from '../components/TagChip';
import { NOTE_MAX_LENGTH, TAG_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, importTemplateRepository, ipRepository, runWithDatabaseSpace, settingsRepository, tagRepository, type GroupRecord, type ImportTemplateRecord, type IpListItem, type IpRecord, type PixorySpace, type TagUsageItem } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
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
import { cleanupTemporaryMediaInputs, pickMediaFilesForImport } from '../services/mediaFilePickerService';
import {
  assertMixedMediaImportPreflight,
  createMediaImportCommitBudget,
} from '../services/mediaImportPreflightRuntime';
import { deleteMediaStoreAssetsWithConfirmation } from '../services/mediaSourceDeletionService';
import { createNativeVideoThumbnail } from '../native/pixoryMediaModule';
import { mergeDelimitedDraftTagNames, mergeDraftTagNames } from '../utils/tagDrafts';
import { devLog } from '../utils/dev';
import { useToast } from '../components/AppToast';
import { assertPersonalTaskActive, trackPersonalTask, type PersonalTaskToken } from '../services/personalTaskToken';
import type { ImageImportSourceMode, MediaPickerSource, VideoImportNamingMode } from '../database/repositories/settingsRepository';

interface ImportImagesScreenProps {
  space?: PixorySpace;
  taskToken?: PersonalTaskToken | null;
  ipId: number;
  defaultGroupId?: number | null;
  initialMediaPicker?: 'images' | 'videos';
  onBack: () => void;
  onImported: (imageIds: number[], importBatchId: number | null) => void;
}

interface ImportImagesScreenData {
  allIps: IpListItem[];
  groups: GroupRecord[];
  imageImportSourceMode: ImageImportSourceMode;
  imageMediaPickerSource: MediaPickerSource;
  importTemplates: ImportTemplateRecord[];
  ip: IpRecord | null;
  moveImportWarningDismissed: boolean;
  recentGroupIds: number[];
  recentTags: TagUsageItem[];
  videoImportNamingMode: VideoImportNamingMode;
  videoMediaPickerSource: MediaPickerSource;
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
  const insets = useSafeAreaInsets();
  const [targetIpId, setTargetIpId] = useState(ipId);
  const [isIpPickerOpen, setIsIpPickerOpen] = useState(false);
  const [isIpSearchOpen, setIsIpSearchOpen] = useState(false);
  const [ipSearch, setIpSearch] = useState('');
  const { showToast } = useToast();
  const {
    data: screenData,
    errorMessage: loadErrorMessage,
    reload,
  } = useScreenLoad<ImportImagesScreenData>(
    async () => {
      const [
        ip,
        allIps,
        groups,
        importTemplates,
        recentGroupIds,
        recentTags,
        imageImportSourceMode,
        videoImportNamingMode,
        imageMediaPickerSource,
        videoMediaPickerSource,
        moveImportWarningDismissed,
      ] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.findById(db, targetIpId),
        ipRepository.findLibraryItems(db),
        groupRepository.findByIpId(db, targetIpId),
        importTemplateRepository.findAll(db),
        settingsRepository.getRecentImportGroupIds(db),
        tagRepository.findRecentlyUsed(db, 8),
        settingsRepository.getImageImportSourceMode(db),
        settingsRepository.getVideoImportNamingMode(db),
        settingsRepository.getImageMediaPickerSource(db),
        settingsRepository.getVideoMediaPickerSource(db),
        settingsRepository.getMoveImportWarningDismissed(db),
      ]));

      return {
        allIps,
        ip,
        groups,
        importTemplates,
        recentGroupIds,
        recentTags,
        imageImportSourceMode,
        videoImportNamingMode,
        imageMediaPickerSource,
        videoMediaPickerSource,
        moveImportWarningDismissed,
      };
    },
    [targetIpId, space],
    {
      initialData: {
        allIps: [],
        ip: null,
        groups: [],
        importTemplates: [],
        recentGroupIds: [],
        recentTags: [],
        imageImportSourceMode: 'copy',
        videoImportNamingMode: 'preserveOriginal',
        imageMediaPickerSource: 'album',
        videoMediaPickerSource: 'album',
        moveImportWarningDismissed: false,
      },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取导入配置失败：${message}`;
      },
    }
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(defaultGroupId != null ? [defaultGroupId] : []);
  const [pickedAssets, setPickedAssets] = useState<PickedImageAsset[]>([]);
  const [pickedVideos, setPickedVideos] = useState<PickedVideoAsset[]>([]);
  const [videoPreviewUris, setVideoPreviewUris] = useState<Record<string, string>>({});
  const [videoPreviewMode, setVideoPreviewMode] = useState<'list' | 'grid'>('list');
  const pickedAssetsRef = useRef<PickedImageAsset[]>([]);
  const pickedVideosRef = useRef<PickedVideoAsset[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [isTemplatePanelOpen, setIsTemplatePanelOpen] = useState(false);
  const [isNewGroupFormOpen, setIsNewGroupFormOpen] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isPickingVideos, setIsPickingVideos] = useState(false);
  const [isPickingPackage, setIsPickingPackage] = useState(false);
  const [pendingPackage, setPendingPackage] = useState<PendingPackageImport | null>(null);
  const [importProgress, setImportProgress] = useState<LinearImportProgressState | null>(null);
  const [packageImportResult, setPackageImportResult] = useState<PackageImportResult | null>(null);
  const [duplicateDecision, setDuplicateDecision] = useState<DuplicateImportDecision>('importAll');
  const [imageImportSourceMode, setImageImportSourceMode] = useState<ImageImportSourceMode>('copy');
  const [imageMediaPickerSource, setImageMediaPickerSource] = useState<MediaPickerSource>('album');
  const [videoMediaPickerSource, setVideoMediaPickerSource] = useState<MediaPickerSource>('album');
  const [videoImportNamingMode, setVideoImportNamingMode] = useState<VideoImportNamingMode>('preserveOriginal');
  const [moveImportWarningDismissed, setMoveImportWarningDismissed] = useState(false);
  const [moveImportWarningVisible, setMoveImportWarningVisible] = useState(false);
  const [isIpConflictDialogVisible, setIsIpConflictDialogVisible] = useState(false);
  const progressBarRef = useRef<LinearImportProgressRef>(null);
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
    () => (pickedAssets.length > 0 || pickedVideos.length > 0 || pendingPackage != null) && !isSubmitting,
    [pendingPackage, pickedAssets.length, pickedVideos.length, isSubmitting]
  );
  const selectedAssetCount = pickedAssets.length + pickedVideos.length;
  const selectedStorageBytes = useMemo(
    () => [...pickedAssets, ...pickedVideos].reduce((total, asset) => total + (asset.fileSize ?? 0), 0),
    [pickedAssets, pickedVideos]
  );
  const selectedStorageLabel = selectedStorageBytes > 1024 * 1024
    ? `${(selectedStorageBytes / (1024 * 1024)).toFixed(1)} MB`
    : selectedStorageBytes > 1024
      ? `${(selectedStorageBytes / 1024).toFixed(1)} KB`
      : selectedStorageBytes > 0 ? `${selectedStorageBytes} B` : '待计算';
  const queuePreviewItems = useMemo(
    () => [
      ...pickedAssets.map((asset) => ({ key: getPickedImageKey(asset), uri: asset.uri })),
      ...pickedVideos.map((asset) => ({ key: getPickedVideoKey(asset), uri: videoPreviewUris[getPickedVideoKey(asset)] ?? null })),
    ].slice(0, 3),
    [pickedAssets, pickedVideos, videoPreviewUris]
  );
  const hasAlbumPickerSource = imageMediaPickerSource === 'album' || videoMediaPickerSource === 'album';
  const hasAlbumPickedAsset = [
    ...pickedAssets,
    ...pickedVideos,
  ].some((asset) => (asset.sourceKind ?? 'album') === 'album');
  const canRequestAlbumSourceDeletion = hasAlbumPickerSource || hasAlbumPickedAsset;
  const ip = screenData?.ip ?? null;
  const allIps = screenData?.allIps ?? [];
  const filteredIps = useMemo(() => {
    const query = ipSearch.trim().toLowerCase();
    return query ? allIps.filter((item) => item.name.toLowerCase().includes(query)) : allIps;
  }, [allIps, ipSearch]);

  useEffect(() => {
    setTargetIpId(ipId);
  }, [ipId]);

  useEffect(() => {
    setSelectedGroupIds(defaultGroupId != null && targetIpId === ipId ? [defaultGroupId] : []);
  }, [defaultGroupId, ipId, targetIpId]);

  useEffect(() => {
    pickedAssetsRef.current = pickedAssets;
  }, [pickedAssets]);

  useEffect(() => {
    pickedVideosRef.current = pickedVideos;
  }, [pickedVideos]);

  useEffect(() => () => {
    void cleanupTemporaryMediaInputs([
      ...pickedAssetsRef.current,
      ...pickedVideosRef.current,
    ]);
  }, []);

  function removePickedImage(index: number) {
    const removed = pickedAssets[index];
    if (removed) {
      void cleanupTemporaryMediaInputs([removed]);
    }
    setPickedAssets((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function removePickedVideo(index: number) {
    const removed = pickedVideos[index];
    if (removed) {
      void cleanupTemporaryMediaInputs([removed]);
    }
    setPickedVideos((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }
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

  function getPickedImageKey(asset: PickedImageAsset): string {
    return asset.assetId ?? asset.uri;
  }

  function getPickedVideoKey(asset: PickedVideoAsset): string {
    return asset.assetId ?? asset.uri;
  }

  async function prepareVideoPreviews(videos: PickedVideoAsset[]) {
    const cacheDirectory = FileSystem.cacheDirectory;
    if (!cacheDirectory || videos.length === 0) {
      return;
    }

    const previews = await Promise.all(videos.map(async (video, index) => {
      const key = getPickedVideoKey(video);
      const destinationUri = `${cacheDirectory}import-video-preview-${Date.now()}-${index}.jpg`;
      try {
        const result = await createNativeVideoThumbnail(video.uri, destinationUri);
        // Keep Expo's canonical file URI instead of the native `file:/...` serialization.
        // Android's image loaders are stricter about that distinction for cache files.
        const candidateUri = destinationUri;
        const info = await FileSystem.getInfoAsync(candidateUri);
        if (info.exists) {
          return [key, candidateUri] as const;
        }
        const nativeUri = result.uri?.trim();
        if (!nativeUri) {
          return null;
        }
        const nativeInfo = await FileSystem.getInfoAsync(nativeUri);
        return nativeInfo.exists ? [key, nativeUri] as const : null;
      } catch {
        return null;
      }
    }));

    setVideoPreviewUris((current) => {
      const next = { ...current };
      for (const preview of previews) {
        if (preview) {
          next[preview[0]] = preview[1];
        }
      }
      return next;
    });
  }

  function mergePickedImages(current: PickedImageAsset[], incoming: PickedImageAsset[]): PickedImageAsset[] {
    const seen = new Set(current.map(getPickedImageKey));
    const next = [...current];
    for (const asset of incoming) {
      const key = getPickedImageKey(asset);
      if (!seen.has(key)) {
        seen.add(key);
        next.push(asset);
      }
    }
    return next;
  }

  function mergePickedVideos(current: PickedVideoAsset[], incoming: PickedVideoAsset[]): PickedVideoAsset[] {
    const seen = new Set(current.map(getPickedVideoKey));
    const next = [...current];
    for (const asset of incoming) {
      const key = getPickedVideoKey(asset);
      if (!seen.has(key)) {
        seen.add(key);
        next.push(asset);
      }
    }
    return next;
  }

  useEffect(() => {
    setImageImportSourceMode(screenData?.imageImportSourceMode ?? 'copy');
    setImageMediaPickerSource(screenData?.imageMediaPickerSource ?? 'album');
    setVideoMediaPickerSource(screenData?.videoMediaPickerSource ?? 'album');
    setVideoImportNamingMode(screenData?.videoImportNamingMode ?? 'preserveOriginal');
    setMoveImportWarningDismissed(screenData?.moveImportWarningDismissed ?? false);
  }, [
    screenData?.imageImportSourceMode,
    screenData?.imageMediaPickerSource,
    screenData?.moveImportWarningDismissed,
    screenData?.videoImportNamingMode,
    screenData?.videoMediaPickerSource,
  ]);

  function updateImageImportSourceMode(nextMode: ImageImportSourceMode) {
    setImageImportSourceMode(nextMode);
    void runWithDatabaseSpace(space, (db) => settingsRepository.setImageImportSourceMode(db, nextMode));
    if (nextMode === 'move' && !moveImportWarningDismissed) {
      setMoveImportWarningVisible(true);
    }
  }

  function updateImageMediaPickerSource(nextSource: MediaPickerSource) {
    setImageMediaPickerSource(nextSource);
    void runWithDatabaseSpace(space, (db) => settingsRepository.setImageMediaPickerSource(db, nextSource));
  }

  function updateVideoMediaPickerSource(nextSource: MediaPickerSource) {
    setVideoMediaPickerSource(nextSource);
    void runWithDatabaseSpace(space, (db) => settingsRepository.setVideoMediaPickerSource(db, nextSource));
  }

  async function dismissMoveImportWarningPermanently() {
    try {
      await runWithDatabaseSpace(space, (db) => settingsRepository.setMoveImportWarningDismissed(db, true));
      setMoveImportWarningDismissed(true);
    } catch {
      showToast('偏好保存失败，下次仍会提醒。');
    } finally {
      setMoveImportWarningVisible(false);
    }
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
      const result = imageMediaPickerSource === 'files'
        ? await pickMediaFilesForImport('image').then((fileResult) => ({
            canceled: fileResult.canceled,
            pickedAssets: fileResult.pickedFiles.map((file) => ({
              ...file,
              fileSize: file.fileSize ?? undefined,
              height: 0,
              mimeType: file.mimeType ?? undefined,
              type: 'image' as const,
              width: 0,
            })),
          }))
        : await pickImagesForImport(imageImportSourceMode);
      if (!result.canceled) {
        setPickedAssets((current) => mergePickedImages(current, result.pickedAssets));
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
      const result = videoMediaPickerSource === 'files'
        ? await pickMediaFilesForImport('video').then((fileResult) => ({
            canceled: fileResult.canceled,
            pickedAssets: fileResult.pickedFiles,
          }))
        : await pickVideosForImport(imageImportSourceMode);
      if (!result.canceled) {
        setPickedVideos((current) => mergePickedVideos(current, result.pickedAssets));
        await prepareVideoPreviews(result.pickedAssets);
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
      const existing = await groupRepository.findByIpIdAndName(db, targetIpId, preparedName);
      return existing ?? groupRepository.create(db, { ipId: targetIpId, name: preparedName, type: 'custom' });
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
      setIsNewGroupFormOpen(false);
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
      setIsTemplatePanelOpen(false);
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
    setIsTemplatePanelOpen(false);
    resetTemplateForm();
    setIsTemplateDialogVisible(true);
  }

  function startEditTemplate(template: ImportTemplateRecord) {
    setIsTemplatePanelOpen(false);
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

  function handleImport() {
    void runSubmit(() => {
      const importTask = (async () => {
      try {
        if (pendingPackage) {
          await importPendingPackage(pendingPackage);
          return;
        }

        const preparedTags = mergeDraftTagNames(tags, tagInput);
        const preparedNote = note.trim();

        if (preparedTags.length !== tags.length) {
          setTags(preparedTags);
          setTagInput('');
        }

        devLog('Pixory import request payload:', {
          ipId: targetIpId,
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
      let sourceDeletionFailureCount = 0;
      const pendingSourceDeletionAssetIds: string[] = [];
      const mixedPreflight = await assertMixedMediaImportPreflight<PickedImageAsset | PickedVideoAsset>({
        assertActive: () => assertPersonalTaskActive(taskToken),
        assets: [
          ...pickedAssets.map((asset) => ({ asset, kind: 'image' as const })),
          ...pickedVideos.map((asset) => ({ asset, kind: 'video' as const })),
        ],
        space,
      });
      const resolvedPickedAssets = mixedPreflight.resolvedAssets
        .filter((entry) => entry.kind === 'image')
        .map((entry) => entry.asset as PickedImageAsset);
      const resolvedPickedVideos = mixedPreflight.resolvedAssets
        .filter((entry) => entry.kind === 'video')
        .map((entry) => entry.asset as PickedVideoAsset);
      const commitBudget = createMediaImportCommitBudget();
      const totalImportCount = resolvedPickedAssets.length + resolvedPickedVideos.length;
      let completedImportCount = 0;

      if (resolvedPickedAssets.length > 0) {
        progressBarRef.current?.setProgress(0, totalImportCount, '');
        const imageResult = await importImagesToIp({
          space,
          ipId: targetIpId,
          groupIds: selectedGroupIds,
          tagNames: preparedTags,
          note: preparedNote,
          isFavorite,
          templateKey: selectedTemplateKey,
          pickedAssets: resolvedPickedAssets,
          duplicateDecision,
          imageImportSourceMode,
          deferSourceDeletion: true,
          taskToken,
          commitBudget,
          onProgress: (current, total) => {
            progressBarRef.current?.setProgress(completedImportCount + current, totalImportCount || total, '');
          },
        });
        completedImportCount += resolvedPickedAssets.length;

        imageSuccessCount = imageResult.successCount;
        imageSkippedCount = imageResult.skippedCount;
        failedCount += imageResult.failedCount;
        sourceDeletionFailureCount += imageResult.importedImages.filter((item) => item.sourceDeletionNotice).length;
        pendingSourceDeletionAssetIds.push(
          ...imageResult.importedImages.flatMap((item) =>
            item.pendingSourceDeletionAssetId ? [item.pendingSourceDeletionAssetId] : []
          )
        );
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

      if (resolvedPickedVideos.length > 0) {
        progressBarRef.current?.setProgress(completedImportCount, totalImportCount, '');
        const videoResult = await importVideosToIp({
          space,
          ipId: targetIpId,
          groupIds: selectedGroupIds,
          tagNames: preparedTags,
          note: preparedNote,
          isFavorite,
          pickedAssets: resolvedPickedVideos,
          duplicateDecision,
          imageImportSourceMode,
          videoImportNamingMode,
          deferSourceDeletion: true,
          taskToken,
          commitBudget,
          onProgress: (current, total) => {
            progressBarRef.current?.setProgress(completedImportCount + current, totalImportCount || total, '');
          },
        });

        videoSuccessCount = videoResult.successCount;
        videoSkippedCount = videoResult.skippedCount;
        failedCount += videoResult.failedCount;
        sourceDeletionFailureCount += videoResult.importedVideos.filter((item) => item.sourceDeletionNotice).length;
        pendingSourceDeletionAssetIds.push(
          ...videoResult.importedVideos.flatMap((item) =>
            item.pendingSourceDeletionAssetId ? [item.pendingSourceDeletionAssetId] : []
          )
        );
        importedAssetIds.push(...videoResult.importedVideos.map((item) => item.video.id));
        importBatchId = resolvedPickedAssets.length === 0 ? videoResult.importBatch?.id ?? null : null;
      }

      if (pendingSourceDeletionAssetIds.length > 0) {
        let sourceDeleted = false;
        try {
          sourceDeleted = await deleteMediaStoreAssetsWithConfirmation(pendingSourceDeletionAssetIds);
        } catch (error) {
          devLog('Pixory source asset batch deletion was not completed:', error);
        }
        if (!sourceDeleted) {
          sourceDeletionFailureCount += pendingSourceDeletionAssetIds.length;
        }
      }

      progressBarRef.current?.reset();

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
        sourceDeletionFailureCount > 0 ? `原文件未删除 ${sourceDeletionFailureCount}` : null,
      ].filter(Boolean);
        showToast(`导入完成：${toastParts.join(' · ')}`);
        onImported(importedAssetIds, importBatchId);
      } finally {
        progressBarRef.current?.reset();
      }
      })();
      return trackPersonalTask(taskToken, importTask);
    }, {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `导入失败：${message}`;
      },
      validate: () => (pickedAssets.length === 0 && pickedVideos.length === 0 && !pendingPackage ? '请先选择要导入的素材。' : null),
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
      setPendingPackage({ packageName: packagePick.packageName, packageUri: packagePick.packageUri });
      setPackageImportResult(null);
      showToast(`已选择资源包：${packagePick.packageName}`);
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

  async function importPendingPackage(packagePick: PendingPackageImport) {
    const preparedTags = mergeDraftTagNames(tags, tagInput);
    const result = await trackPersonalTask(taskToken, importPackageToIp({
      space,
      ipId: targetIpId,
      packageUri: packagePick.packageUri,
      packageName: packagePick.packageName,
      groupIds: selectedGroupIds,
      tagNames: preparedTags,
      note: note.trim(),
      isFavorite,
      ipNameConflictStrategy: 'ask',
      taskToken,
      onProgress: (current, total) => {
        progressBarRef.current?.setProgress(current, total, '');
      },
    }));
    setPackageImportResult(result);

    if (result.successCount === 0) {
      throw new Error(`没有成功导入素材，失败 ${result.failedCount} 个，跳过 ${result.skippedCount} 个文件。`);
    }

    await runWithDatabaseSpace(space, (db) => settingsRepository.rememberImportGroupIds(db, selectedGroupIds));
    setPendingPackage(null);
    showToast(`资源包导入：图片 ${result.imageSuccessCount} · 视频 ${result.videoSuccessCount} · 跳过 ${result.skippedCount}`);
    onImported(
      [
        ...result.importedImages.map((item) => item.image.id),
        ...result.importedVideos.map((item) => item.video.id),
      ],
      result.importBatchId
    );
  }

  return (
    <>
    <View style={styles.pageRoot}>
      <View style={[styles.prototypeHeader, { paddingTop: insets.top + 6 }]}>
        <Pressable accessibilityLabel="关闭" onPress={onBack} style={styles.headerClose}>
          <MaterialIcons color="#1a1c1c" name="close" size={24} />
        </Pressable>
        <Text style={styles.prototypeHeaderTitle}>Import Assets</Text>
        <View style={styles.headerSelectionPill}>
          <View style={styles.headerSelectionDot} />
          <Text style={styles.headerSelectionText}>{selectedAssetCount > 0 ? `已选 ${selectedAssetCount} 项` : '已选 0 项'}</Text>
        </View>
      </View>
      <ScreenScaffold
        backgroundColor="#f9f9f9"
        fullScreen
        scrollable
        showHeader={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 88, paddingHorizontal: 4 }}
      >
      <View style={styles.formWrap}>
        <View style={styles.targetHero}>
          <View style={styles.targetHeroTop}>
            <View style={styles.targetHeroIdentity}>
              <View style={styles.targetHeroThumb}>
                {allIps.find((item) => item.id === targetIpId)?.coverThumbnailFileUri ? (
                  <Image resizeMode="cover" source={{ uri: allIps.find((item) => item.id === targetIpId)?.coverThumbnailFileUri ?? undefined }} style={styles.targetHeroImage} />
                ) : (
                  <Text style={styles.targetHeroInitial}>{(ip?.name ?? 'IP').slice(0, 1)}</Text>
                )}
                <View style={styles.targetHeroBadge}><Text style={styles.targetHeroBadgeText}>IP</Text></View>
              </View>
              <View style={styles.targetHeroCopy}>
                <Text style={styles.targetHeroEyebrow}>当前归属 · TARGET ARCHIVE</Text>
                <Text numberOfLines={1} style={styles.targetHeroTitle}>{ip?.name ?? `IP #${targetIpId}`}</Text>
              </View>
            </View>
            <Pressable onPress={() => setIsIpPickerOpen((current) => !current)} style={({ pressed }) => [styles.targetHeroSwitch, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={styles.targetHeroSwitchText}>{ip?.name ?? `IP #${targetIpId}`}</Text>
              <MaterialIcons color={colors.text.title} name={isIpPickerOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={18} />
            </Pressable>
          </View>
          {isIpPickerOpen ? (
            <View style={styles.ipPickerPanel}>
              <View style={styles.ipPickerToolbar}>
                <Text style={styles.ipPickerToolbarTitle}>选择 IP</Text>
                <Pressable
                  accessibilityLabel={isIpSearchOpen ? '关闭 IP 搜索' : '搜索 IP'}
                  onPress={() => setIsIpSearchOpen((current) => !current)}
                  style={styles.ipSearchToggle}
                >
                  <MaterialIcons color="#1a1c1c" name={isIpSearchOpen ? 'close' : 'search'} size={18} />
                </Pressable>
              </View>
              {isIpSearchOpen ? (
                <View style={styles.ipSearchRow}>
                  <MaterialIcons color={colors.text.secondary} name="search" size={18} />
                  <TextInput
                    onChangeText={setIpSearch}
                    placeholder="搜索或筛选 IP…"
                    placeholderTextColor={colors.text.placeholder}
                    style={styles.ipSearchInput}
                    value={ipSearch}
                  />
                </View>
              ) : null}
              <ScrollView nestedScrollEnabled style={styles.ipPickerList}>
                {filteredIps.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setTargetIpId(item.id);
                      setIsIpPickerOpen(false);
                      setIsIpSearchOpen(false);
                      setIpSearch('');
                    }}
                    style={({ pressed }) => [styles.ipPickerItem, item.id === targetIpId && styles.ipPickerItemSelected, pressed && styles.pressed]}
                  >
                    <View style={styles.ipPickerItemThumb}>
                      {item.coverThumbnailFileUri ? (
                        <Image resizeMode="cover" source={{ uri: item.coverThumbnailFileUri }} style={styles.ipPickerItemThumbImage} />
                      ) : (
                        <Text style={styles.ipPickerItemThumbInitial}>{item.name.slice(0, 1)}</Text>
                      )}
                    </View>
                    <View style={styles.ipPickerItemCopy}>
                      <Text numberOfLines={1} style={[styles.ipPickerItemName, item.id === targetIpId && styles.ipPickerItemSelectedText]}>{item.name}</Text>
                      <Text style={[styles.ipPickerItemMeta, item.id === targetIpId && styles.ipPickerItemSelectedMeta]}>{item.imageCount + item.videoCount} 项素材 · {item.groupCount} 个分组</Text>
                    </View>
                    {item.id === targetIpId ? <MaterialIcons color={colors.text.inverse} name="check" size={20} /> : null}
                  </Pressable>
                ))}
                {filteredIps.length === 0 ? <Text style={styles.ipPickerEmpty}>没有匹配的 IP</Text> : null}
              </ScrollView>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionHeading}>
          <View style={styles.sectionHeadingCopy}><Text style={styles.sectionHeadingTitle}>01. 导入来源</Text><Text style={styles.sectionHeadingCode}>SOURCE PIPELINE</Text></View>
        </View>
        <View style={styles.prototypeSection}>
          <View style={styles.sourceTopRow}>
            <Pressable accessibilityRole="button" disabled={isPicking || isSubmitting} onPress={handlePickImages} style={({ pressed }) => [styles.sourceTopLead, pressed && styles.pressed]}>
              <View style={styles.pickIconWrap}>
                <MaterialIcons color="#ffffff" name="photo-library" size={22} />
              </View>
              <View style={styles.sourceTitleCopy}>
                <Text style={styles.sourceTitle}>图片导入</Text>
                <Text style={styles.sourceBadge}>IMAGE</Text>
              </View>
            </Pressable>
            <PrototypeMediaSourceControl
              disabled={isPicking || isSubmitting}
              onChange={updateImageMediaPickerSource}
              value={imageMediaPickerSource}
            />
          </View>
            <View style={styles.sourceFooter}>
              <View style={styles.sourceCountCopy}>
                <View style={styles.sourceCountDot} />
                <Text style={styles.sourceCountText}>{isPicking ? '正在加载图片…' : pickedAssets.length > 0 ? `已选 ${pickedAssets.length} 张 (JPG, PNG)` : '未选择图片'}</Text>
              </View>
              <Pressable disabled={isPicking || isSubmitting} onPress={handlePickImages} style={styles.sourceActionButton}>
                <MaterialIcons color="#1a1c1c" name={imageMediaPickerSource === 'album' ? 'add-photo-alternate' : 'folder-open'} size={15} />
                <Text style={styles.sourceActionText}>{imageMediaPickerSource === 'album' ? '打开相册' : '选择文件'}</Text>
              </Pressable>
            </View>
            {pickedAssets.length > 0 ? (
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.previewScroll}>
              <View style={styles.previewRow}>
                {pickedAssets.map((asset, index) => (
                  <View key={`${getPickedImageKey(asset)}-${index}`} style={styles.previewCard}>
                    <Image resizeMode="cover" source={{ uri: asset.uri }} style={styles.previewImage} />
                    <Pressable
                      accessibilityLabel={`移除第 ${index + 1} 张已选图片`}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => removePickedImage(index)}
                      style={({ pressed }) => [styles.previewRemoveButton, pressed && styles.pressed]}
                    >
                      <Ionicons color={colors.text.inverse} name="close" size={13} />
                    </Pressable>
                  </View>
                ))}
              </View>
              </ScrollView>
            ) : null}
        </View>
        <View style={styles.prototypeSection}>
          <View style={styles.sourceTopRow}>
            <Pressable accessibilityRole="button" disabled={isPickingVideos || isSubmitting} onPress={handlePickVideos} style={({ pressed }) => [styles.sourceTopLead, pressed && styles.pressed]}>
            <View style={styles.pickIconWrap}>
              <MaterialIcons color="#ffffff" name="movie" size={22} />
            </View>
            <View style={styles.sourceTitleCopy}>
              <Text style={styles.sourceTitle}>视频导入</Text>
              <Text style={styles.sourceBadge}>VIDEO</Text>
            </View>
            </Pressable>
            <PrototypeMediaSourceControl
              disabled={isPickingVideos || isSubmitting}
              onChange={updateVideoMediaPickerSource}
              value={videoMediaPickerSource}
            />
          </View>
          <View style={styles.sourceFooter}>
            <View style={styles.sourceCountCopy}>
              <View style={styles.sourceCountDot} />
              <Text style={styles.sourceCountText}>{isPickingVideos ? '正在加载视频…' : pickedVideos.length > 0 ? `已选 ${pickedVideos.length} 条 (MOV, MP4)` : '未选择视频'}</Text>
            </View>
            <Pressable disabled={isPickingVideos || isSubmitting} onPress={handlePickVideos} style={styles.sourceActionButton}>
              <MaterialIcons color="#1a1c1c" name={videoMediaPickerSource === 'album' ? 'video-library' : 'folder-open'} size={15} />
              <Text style={styles.sourceActionText}>{videoMediaPickerSource === 'album' ? '打开相册' : '选择文件夹'}</Text>
            </Pressable>
          </View>
          {pickedVideos.length > 0 ? (
            <View style={styles.videoPreviewBlock}>
              <View style={styles.videoPreviewToolbar}>
                <Text style={styles.videoPreviewToolbarLabel}>预览</Text>
                <View style={styles.videoPreviewModeToggle}>
                  <Pressable onPress={() => setVideoPreviewMode('list')} style={[styles.videoPreviewModeButton, videoPreviewMode === 'list' && styles.videoPreviewModeButtonSelected]}>
                    <MaterialIcons color={videoPreviewMode === 'list' ? '#ffffff' : '#1a1c1c'} name="view-list" size={16} />
                  </Pressable>
                  <Pressable onPress={() => setVideoPreviewMode('grid')} style={[styles.videoPreviewModeButton, videoPreviewMode === 'grid' && styles.videoPreviewModeButtonSelected]}>
                    <MaterialIcons color={videoPreviewMode === 'grid' ? '#ffffff' : '#1a1c1c'} name="grid-view" size={16} />
                  </Pressable>
                </View>
              </View>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.videoPreviewScroll}>
                <View style={videoPreviewMode === 'grid' ? styles.videoPreviewGrid : styles.videoPreviewList}>
                  {pickedVideos.map((video, index) => videoPreviewMode === 'grid' ? (
                    <View key={`${getPickedVideoKey(video)}-${index}`} style={styles.videoGridCard}>
                      <View style={styles.videoGridCardThumb}>
                        {videoPreviewUris[getPickedVideoKey(video)] ? <ExpoImage contentFit="cover" source={{ uri: videoPreviewUris[getPickedVideoKey(video)] }} style={styles.videoGridCardImage} /> : <MaterialIcons color="#ffffff" name="movie" size={24} />}
                        <View style={styles.videoPreviewPlayBadge}><Ionicons color="#ffffff" name="play" size={10} /></View>
                      </View>
                      <Pressable accessibilityLabel={`移除视频：${video.fileName}`} onPress={() => removePickedVideo(index)} style={styles.videoGridRemoveButton}>
                        <Ionicons color="#ffffff" name="close" size={12} />
                      </Pressable>
                    </View>
                  ) : (
                    <View key={`${getPickedVideoKey(video)}-${index}`} style={styles.videoPreviewRow}>
                      <View style={styles.videoPreviewThumb}>
                        {videoPreviewUris[getPickedVideoKey(video)] ? <ExpoImage contentFit="cover" source={{ uri: videoPreviewUris[getPickedVideoKey(video)] }} style={styles.videoPreviewImage} /> : <MaterialIcons color="#ffffff" name="movie" size={18} />}
                        <View style={styles.videoPreviewPlayBadge}><Ionicons color="#ffffff" name="play" size={10} /></View>
                      </View>
                      <Text numberOfLines={1} style={styles.videoPreviewName}>{videoImportNamingMode === 'generated' ? '[将自动编号] 导入后生成' : video.fileName}</Text>
                      <Pressable accessibilityLabel={`移除视频：${video.fileName}`} hitSlop={8} onPress={() => removePickedVideo(index)} style={styles.videoRemoveButton}>
                        <Ionicons color={colors.text.tertiary} name="close-circle" size={18} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>

        <View style={styles.prototypeSection}>
          <Pressable
            accessibilityRole="button"
            disabled={isPickingPackage || isSubmitting}
            onPress={handlePackageImport}
            style={({ pressed }) => [styles.packageZone, (isPickingPackage || isSubmitting) && styles.disabled, pressed && styles.pressed]}
          >
            <View style={styles.pickIconWrap}>
              <MaterialIcons color="#ffffff" name="archive" size={22} />
            </View>
            <View style={styles.pickCopy}>
              <View style={styles.packageTitleRow}>
                <Text numberOfLines={1} style={styles.pickTitle}>
                  {isPickingPackage ? '正在选择资源包…' : pendingPackage ? pendingPackage.packageName : '压缩包导入'}
                </Text>
                <Text style={styles.packageFormat}>{pendingPackage ? '已选择 · 点击开始导入' : '.PIXORYPACK / .ZIP'}</Text>
              </View>
            </View>
          </Pressable>
          {packageImportResult ? (
            <Text style={styles.packageResult}>
              图片 {packageImportResult.imageSuccessCount} · 视频 {packageImportResult.videoSuccessCount} · 失败 {packageImportResult.failedCount} · 跳过 {packageImportResult.skippedCount}
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionHeading}>
          <View style={styles.sectionHeadingCopy}><Text style={styles.sectionHeadingTitle}>02. 目标归属与分类</Text><Text style={styles.sectionHeadingCode}>ARCHIVAL TAXONOMY</Text></View>
        </View>
        <LightFormSection compact style={styles.prototypeSection}>
          <View style={styles.groupPickerBlock}>
            <Text style={styles.inlineLabel}>素材分组 / SUB-DIRECTORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupChipRow}>
              <Pressable onPress={() => setSelectedGroupIds([])} style={[styles.groupChip, selectedGroupIds.length === 0 && styles.groupChipSelected]}>
                <Text style={[styles.groupChipText, selectedGroupIds.length === 0 && styles.groupChipTextSelected]}>暂不分组</Text>
              </Pressable>
              {[...recentGroups, ...remainingGroups].map((group) => {
                const selected = selectedGroupIds.includes(group.id);
                return (
                  <Pressable
                    key={group.id}
                    onPress={() => setSelectedGroupIds((current) => current.includes(group.id) ? current.filter((groupId) => groupId !== group.id) : [...current, group.id])}
                    style={[styles.groupChip, selected && styles.groupChipSelected]}
                  >
                    <Text numberOfLines={1} style={[styles.groupChipText, selected && styles.groupChipTextSelected]}>{group.name}</Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setIsNewGroupFormOpen(true)} style={styles.groupChipAdd}>
                <MaterialIcons color="#1a1c1c" name="add" size={15} />
                <Text style={styles.groupChipText}>新建</Text>
              </Pressable>
            </ScrollView>
          </View>
          {isNewGroupFormOpen ? <View style={styles.createGroupRow}>
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
              <Ionicons color="#ffffff" name="add" size={18} />
              <Text style={styles.createGroupText}>新建</Text>
            </Pressable>
          </View> : null}
        <View style={styles.metadataGrid}>
          <View style={styles.metadataCard}>
            <Text style={styles.metadataStarLabel}>FILE NAME</Text>
            <View style={styles.metadataStarRow}>
              <Text style={styles.metadataStarTitle}>保留原文件名</Text>
              <Pressable onPress={() => updateVideoImportNamingMode(videoImportNamingMode === 'preserveOriginal' ? 'generated' : 'preserveOriginal')} style={[styles.prototypeSwitch, videoImportNamingMode === 'preserveOriginal' && styles.prototypeSwitchOn]}>
                <View style={[styles.prototypeSwitchThumb, videoImportNamingMode === 'preserveOriginal' && styles.prototypeSwitchThumbOn]} />
              </Pressable>
            </View>
          </View>
          <View style={styles.metadataCard}>
            <Text style={styles.metadataStarLabel}>STAR</Text>
            <View style={styles.metadataStarRow}>
              <Text style={styles.metadataStarTitle}>加入收藏</Text>
              <Pressable onPress={() => setIsFavorite((current) => !current)} style={[styles.prototypeSwitch, isFavorite && styles.prototypeSwitchOn]}>
                <View style={[styles.prototypeSwitchThumb, isFavorite && styles.prototypeSwitchThumbOn]} />
              </Pressable>
            </View>
          </View>
        </View>
        </LightFormSection>

        <View style={styles.sectionHeading}>
          <View style={styles.sectionHeadingCopy}><Text style={styles.sectionHeadingTitle}>03. 策略与去重机制</Text><Text style={styles.sectionHeadingCode}>DEDUP &amp; SANITATION</Text></View>
        </View>
        <LightFormSection compact style={styles.prototypeSection} title="重复素材规整策略">
          <View style={styles.dedupSegmented}>
            <Pressable onPress={() => setDuplicateDecision('importAll')} style={[styles.dedupOption, duplicateDecision === 'importAll' && styles.dedupOptionSelected]}>
              <Text style={[styles.dedupOptionText, duplicateDecision === 'importAll' && styles.dedupOptionTextSelected]}>全部导入</Text>
            </Pressable>
            <Pressable onPress={() => setDuplicateDecision('skipExact')} style={[styles.dedupOption, duplicateDecision === 'skipExact' && styles.dedupOptionSelected]}>
              <Text style={[styles.dedupOptionText, duplicateDecision === 'skipExact' && styles.dedupOptionTextSelected]}>跳过精确重复</Text>
            </Pressable>
          </View>
        </LightFormSection>

        <>
            <LightFormSection compact style={styles.prototypeSection} title="标签与备注">
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
                    <Ionicons color="#ffffff" name="add" size={18} />
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

              <View style={styles.noteFieldBlock}>
                <Text style={styles.noteFieldLabel}>备注</Text>
                <TextInput
                  editable={!isSubmitting}
                  maxLength={NOTE_MAX_LENGTH}
                  multiline
                  onChangeText={(value) => {
                    setNote(value);
                    if (submitError) {
                      clearSubmitError();
                    }
                  }}
                  placeholder="例如：活动预热图、角色展示图。"
                  placeholderTextColor="#5e5e5e"
                  style={styles.noteInput}
                  value={note}
                />
              </View>
            </LightFormSection>
        </>

        <View style={styles.sectionHeading}>
          <View style={styles.sectionHeadingCopy}><Text style={styles.sectionHeadingTitle}>04. 批次队列摘要</Text><Text style={styles.sectionHeadingCode}>INGESTION QUEUE</Text></View>
        </View>
        <View style={styles.queueSummary}>
          <View style={styles.queueSummaryTop}>
            <View style={styles.queueThumbStack}>
              {queuePreviewItems.map((item, index) => item.uri ? <Image key={`${item.key}-${index}`} resizeMode="cover" source={{ uri: item.uri }} style={[styles.queueThumb, index > 0 && styles.queueThumbOffset]} /> : <View key={`${item.key}-${index}`} style={[styles.queueThumb, styles.queueThumbFallback, index > 0 && styles.queueThumbOffset]}><MaterialIcons color="#ffffff" name="movie" size={16} /></View>)}
              {selectedAssetCount > 3 ? <View style={styles.queueCountBubble}><Text style={styles.queueCountText}>+{selectedAssetCount - 3}</Text></View> : null}
              {selectedAssetCount === 0 ? <View style={styles.queueEmptyThumb}><MaterialIcons color={colors.text.tertiary} name="photo-library" size={18} /></View> : null}
            </View>
            <View style={styles.queueSummaryCopy}>
              <Text style={styles.queueSummaryTitle}>拟导入: {selectedAssetCount} 项</Text>
              <Text style={styles.queueSummaryMeta}>预估占用存储: {selectedStorageLabel}</Text>
            </View>
          </View>
          <View style={styles.queueProgressMeta}>
            <Text style={styles.queueProgressLabel}>
              {importProgress ? `${importProgress.current}/${importProgress.total}` : `${selectedAssetCount}/${selectedAssetCount}`} · {importProgress && importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : selectedAssetCount > 0 ? 100 : 0}%
            </Text>
          </View>
          <View style={styles.queueProgressTrack}>
            <View style={[styles.queueProgressFill, { width: `${importProgress && importProgress.total > 0 ? Math.min(100, Math.round((importProgress.current / importProgress.total) * 100)) : selectedAssetCount > 0 ? 100 : 0}%` }]} />
          </View>
        </View>

        {submitError || loadErrorMessage ? <Text style={styles.errorText}>{submitError ?? loadErrorMessage}</Text> : null}
      </View>
      <AppDialog
        dismissible={false}
        message="移动模式会先把素材完整导入 Pixory，再请求 Android 删除相册原文件。系统删除确认仍需每次由你决定；文件来源始终只复制。"
        onClose={() => setMoveImportWarningVisible(false)}
        onPrimary={() => setMoveImportWarningVisible(false)}
        primaryLabel="知道了"
        secondaryLabel={null}
        title="移动模式说明"
        visible={moveImportWarningVisible}
      >
        <Pressable
          accessibilityLabel="知道了，下次不再弹出移动模式说明"
          accessibilityRole="button"
          onPress={() => void dismissMoveImportWarningPermanently()}
          style={({ pressed }) => [styles.warningOptOutRow, pressed && styles.pressed]}
        >
          <Text style={styles.warningOptOutText}>知道了，下次不再弹出</Text>
        </Pressable>
      </AppDialog>
      <AppDialog
        appearance="opaqueMonochrome"
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
          <PrototypeToggleRow
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
      </ScreenScaffold>
      {isTemplatePanelOpen ? (
        <View style={styles.templatePopover}>
          <View style={styles.templatePopoverHeader}>
            <Text style={styles.templatePopoverTitle}>导入模板</Text>
            <Pressable onPress={startCreateTemplate} style={styles.templatePopoverCreate}>
              <MaterialIcons color="#ffffff" name="add" size={15} />
              <Text style={styles.templatePopoverCreateText}>新建模板</Text>
            </Pressable>
          </View>
          <ScrollView nestedScrollEnabled style={styles.templatePopoverList}>
            {importTemplates.map((template) => (
              <View key={template.key} style={[styles.templatePopoverItem, selectedTemplateKey === template.key && styles.templatePopoverItemSelected]}>
                <Pressable onPress={() => void applyTemplate(template)} style={styles.templatePopoverApply}>
                  <Text numberOfLines={1} style={[styles.templatePopoverItemTitle, selectedTemplateKey === template.key && styles.templatePopoverItemSelectedTitle]}>{template.name}</Text>
                  <Text numberOfLines={1} style={[styles.templatePopoverItemMeta, selectedTemplateKey === template.key && styles.templatePopoverItemSelectedMeta]}>{template.tags.map((tag) => `#${tag}`).join(' ') || template.groupName}</Text>
                </Pressable>
                <View style={styles.templatePopoverActions}>
                  <Pressable accessibilityLabel="编辑模板" onPress={() => startEditTemplate(template)} style={styles.templatePopoverIconButton}>
                    <MaterialIcons color="#1a1c1c" name="edit" size={16} />
                  </Pressable>
                  <Pressable accessibilityLabel="删除模板" onPress={() => setDeleteTemplate(template)} style={styles.templatePopoverIconButton}>
                    <MaterialIcons color="#1a1c1c" name="delete-outline" size={16} />
                  </Pressable>
                </View>
              </View>
            ))}
            {importTemplates.length === 0 ? <Text style={styles.templatePopoverEmpty}>暂无导入模板</Text> : null}
          </ScrollView>
        </View>
      ) : null}
      <View pointerEvents="box-none" style={[styles.prototypeFooter, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.footerInner}>
          <Pressable disabled={isSubmitting} onPress={() => setIsTemplatePanelOpen((current) => !current)} style={styles.footerTemplateButton}>
            <MaterialIcons color="#1a1c1c" name="tune" size={18} />
            <Text style={styles.footerTemplateText}>导入模板</Text>
          </Pressable>
          <Pressable disabled={!canImport || isSubmitting} onPress={handleImport} style={[styles.footerImportButton, (!canImport || isSubmitting) && styles.footerImportDisabled]}>
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <MaterialIcons color="#fff" name="cloud-upload" size={18} />}
            <Text style={styles.footerImportText}>{isSubmitting ? '导入中...' : `开始导入${selectedAssetCount > 0 ? ` (${selectedAssetCount} 项 · ${selectedStorageLabel})` : ''}`}</Text>
          </Pressable>
        </View>
      </View>
    <LinearImportProgress onChange={setImportProgress} ref={progressBarRef} />
    </View>
    </>
  );
}

interface PendingPackageImport {
  packageName: string;
  packageUri: string;
}

interface PrototypeMediaSourceControlProps {
  disabled?: boolean;
  onChange: (value: MediaPickerSource) => void;
  value: MediaPickerSource;
}

function PrototypeMediaSourceControl({ disabled = false, onChange, value }: PrototypeMediaSourceControlProps) {
  return (
    <View style={[styles.sourceSegmented, disabled && styles.disabled]}>
      {(['album', 'files'] as const).map((source) => {
        const selected = value === source;
        return (
          <Pressable
            disabled={disabled}
            key={source}
            onPress={() => onChange(source)}
            style={[styles.sourceSegmentedOption, selected && styles.sourceSegmentedOptionSelected]}
          >
            <Text style={[styles.sourceSegmentedText, selected && styles.sourceSegmentedTextSelected]}>{source === 'album' ? '相册' : '文件'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface PrototypeToggleRowProps {
  disabled?: boolean;
  hint?: string;
  label: string;
  onValueChange: (value: boolean) => void;
  value: boolean;
}

interface LinearImportProgressState {
  current: number;
  total: number;
  label?: string;
}

interface LinearImportProgressRef {
  setProgress: (current: number, total: number, label?: string) => void;
  reset: () => void;
}

const LinearImportProgress = forwardRef<LinearImportProgressRef, { onChange: (state: LinearImportProgressState | null) => void }>(
  ({ onChange }, ref) => {
    useImperativeHandle(ref, () => ({
      setProgress: (current, total, label) => onChange({ current, total, label }),
      reset: () => onChange(null),
    }), [onChange]);
    return null;
  }
);
LinearImportProgress.displayName = 'LinearImportProgress';

function PrototypeToggleRow({ disabled = false, hint, label, onValueChange, value }: PrototypeToggleRowProps) {
  return (
    <View style={[styles.prototypeToggleRow, disabled && styles.disabled]}>
      <View style={styles.prototypeToggleCopy}>
        <Text style={styles.prototypeToggleLabel}>{label}</Text>
        {hint ? <Text style={styles.prototypeToggleHint}>{hint}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        onPress={() => onValueChange(!value)}
        style={[styles.prototypeSwitch, value && styles.prototypeSwitchOn]}
      >
        <View style={[styles.prototypeSwitchThumb, value && styles.prototypeSwitchThumbOn]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    backgroundColor: '#f9f9f9',
    flex: 1,
  },
  prototypeHeader: {
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  headerClose: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -8,
    width: 44,
  },
  prototypeHeaderTitle: {
    color: '#1a1c1c',
    flex: 1,
    fontFamily: typography.family.base,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginLeft: 4,
  },
  headerSelectionPill: {
    alignItems: 'center',
    backgroundColor: '#f3f3f4',
    borderColor: '#e2e2e2',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  headerSelectionDot: {
    backgroundColor: '#000',
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  headerSelectionText: {
    color: '#444748',
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 12,
  },
  prototypeFooter: {
    backgroundColor: 'rgba(249,249,249,0.96)',
    borderTopColor: '#eeeeee',
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    position: 'absolute',
    right: 0,
  },
  footerInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },
  footerTemplateButton: {
    alignItems: 'center',
    backgroundColor: '#eeeeee',
    borderRadius: 4,
    flexDirection: 'row',
    gap: 6,
    height: 40,
    justifyContent: 'center',
    flex: 0.34,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  footerTemplateText: {
    color: '#1a1c1c',
    fontFamily: typography.family.base,
    fontSize: 12,
    fontWeight: '600',
  },
  footerImportButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 4,
    flex: 0.66,
    flexDirection: 'row',
    gap: 7,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  footerImportDisabled: {
    opacity: 0.42,
  },
  footerImportText: {
    color: '#ffffff',
    fontFamily: typography.family.base,
    fontSize: 12,
    fontWeight: '600',
  },
  templatePopover: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e2e2',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: 66,
    left: 4,
    maxHeight: 300,
    overflow: 'hidden',
    position: 'absolute',
    right: 4,
    zIndex: 20,
  },
  templatePopoverHeader: {
    alignItems: 'center',
    borderBottomColor: '#e2e2e2',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  templatePopoverTitle: {
    color: '#1a1c1c',
    fontFamily: typography.family.base,
    fontSize: 14,
    fontWeight: '600',
  },
  templatePopoverCreate: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 4,
    flexDirection: 'row',
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 8,
  },
  templatePopoverCreateText: {
    color: '#ffffff',
    fontFamily: typography.family.base,
    fontSize: 11,
    fontWeight: '600',
  },
  templatePopoverList: {
    maxHeight: 240,
  },
  templatePopoverItem: {
    alignItems: 'center',
    borderBottomColor: '#eeeeee',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 12,
  },
  templatePopoverItemSelected: {
    backgroundColor: '#000000',
  },
  templatePopoverApply: {
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingVertical: 8,
  },
  templatePopoverItemTitle: {
    color: '#1a1c1c',
    fontFamily: typography.family.base,
    fontSize: 13,
    fontWeight: '600',
  },
  templatePopoverItemSelectedTitle: {
    color: '#ffffff',
  },
  templatePopoverItemMeta: {
    color: '#5e5e5e',
    fontFamily: typography.family.mono,
    fontSize: 10,
  },
  templatePopoverItemSelectedMeta: {
    color: '#ffffff',
  },
  templatePopoverActions: {
    flexDirection: 'row',
    gap: 4,
  },
  templatePopoverIconButton: {
    alignItems: 'center',
    backgroundColor: '#eeeeee',
    borderRadius: 4,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  templatePopoverEmpty: {
    color: '#5e5e5e',
    fontFamily: typography.family.base,
    fontSize: 12,
    padding: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#93000a',
    fontFamily: typography.family.base,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  dedupSegmented: {
    backgroundColor: '#eeeeee',
    borderRadius: 4,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
    padding: 4,
  },
  dedupOption: {
    alignItems: 'center',
    borderRadius: 3,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
  },
  dedupOptionSelected: {
    backgroundColor: '#000000',
  },
  dedupOptionText: {
    color: '#5e5e5e',
    fontFamily: typography.family.base,
    fontSize: 12,
    fontWeight: '600',
  },
  dedupOptionTextSelected: {
    color: '#ffffff',
  },
  sourceSegmented: {
    alignItems: 'center',
    backgroundColor: '#eeeeee',
    borderRadius: 4,
    flexDirection: 'row',
    padding: 2,
  },
  sourceSegmentedOption: {
    alignItems: 'center',
    borderRadius: 3,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 46,
    paddingHorizontal: 8,
  },
  sourceSegmentedOptionSelected: {
    backgroundColor: '#000000',
  },
  sourceSegmentedText: {
    color: '#5e5e5e',
    fontFamily: typography.family.base,
    fontSize: 11,
    fontWeight: '600',
  },
  sourceSegmentedTextSelected: {
    color: '#ffffff',
  },
  prototypeToggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  prototypeToggleCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  prototypeToggleLabel: {
    color: '#1a1c1c',
    fontFamily: typography.family.base,
    fontSize: 13,
    lineHeight: 18,
  },
  prototypeToggleHint: {
    color: '#5e5e5e',
    fontFamily: typography.family.base,
    fontSize: 10,
    lineHeight: 14,
  },
  prototypeSwitch: {
    backgroundColor: '#c4c7c7',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    padding: 3,
    width: 46,
  },
  prototypeSwitchOn: {
    backgroundColor: '#000000',
  },
  prototypeSwitchThumb: {
    backgroundColor: '#ffffff',
    borderRadius: 11,
    height: 22,
    width: 22,
  },
  prototypeSwitchThumbOn: {
    alignSelf: 'flex-end',
  },
  targetHero: {
    backgroundColor: '#f3f3f4',
    borderRadius: 8,
    marginHorizontal: 0,
    padding: 10,
  },
  targetHeroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  targetHeroIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: spacing[3],
  },
  targetHeroThumb: {
    alignItems: 'center',
    backgroundColor: '#cccccc',
    borderRadius: 6,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  },
  targetHeroImage: { height: '100%', width: '100%' },
  targetHeroInitial: { ...typography.textStyles.cardTitle, color: '#1a1c1c' },
  targetHeroBadge: {
    backgroundColor: '#1a1c1c',
    borderRadius: 2,
    bottom: spacing[1],
    paddingHorizontal: spacing[1],
    paddingVertical: 1,
    position: 'absolute',
    right: spacing[1],
  },
  targetHeroBadgeText: { ...typography.textStyles.micro, color: colors.text.inverse, fontSize: 9, lineHeight: 11 },
  targetHeroCopy: { flex: 1, gap: spacing[1], minWidth: 0 },
  targetHeroEyebrow: { ...typography.textStyles.micro, color: '#5e5e5e', letterSpacing: 0.4 },
  targetHeroTitle: { ...typography.textStyles.sectionTitle, color: '#1a1c1c' },
  targetHeroSubtitle: { ...typography.textStyles.caption, color: '#5e5e5e' },
  targetHeroSwitch: {
    alignItems: 'center',
    backgroundColor: '#e8e8e8',
    borderRadius: 6,
    flexDirection: 'row',
    height: 36,
    justifyContent: 'center',
    marginLeft: spacing[2],
    maxWidth: 150,
    minWidth: 92,
    paddingHorizontal: 10,
  },
  targetHeroSwitchText: {
    ...typography.textStyles.caption,
    color: '#1a1c1c',
    flex: 1,
    fontWeight: '600',
  },
  ipPickerPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e2e2',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing[3],
    overflow: 'hidden',
  },
  ipPickerToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingHorizontal: spacing[2],
  },
  ipPickerToolbarTitle: {
    ...typography.textStyles.caption,
    color: '#5e5e5e',
    fontWeight: '600',
  },
  ipSearchToggle: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  ipSearchRow: {
    alignItems: 'center',
    borderColor: '#c4c7c7',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 34,
    marginHorizontal: spacing[2],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[2],
  },
  ipSearchInput: { ...typography.textStyles.body, color: '#1a1c1c', flex: 1, minHeight: 40, paddingVertical: 0 },
  ipPickerList: { maxHeight: 260 },
  ipPickerItem: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], minHeight: 58, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  ipPickerItemSelected: { backgroundColor: '#000000' },
  ipPickerItemSelectedText: { color: '#ffffff' },
  ipPickerItemSelectedMeta: { color: '#ffffff' },
  ipPickerItemCopy: { flex: 1, gap: spacing[1], minWidth: 0 },
  ipPickerItemThumb: {
    alignItems: 'center',
    backgroundColor: '#cccccc',
    borderRadius: 5,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 58,
  },
  ipPickerItemThumbImage: { height: '100%', width: '100%' },
  ipPickerItemThumbInitial: { ...typography.textStyles.bodyStrong, color: '#1a1c1c' },
  ipPickerItemName: { ...typography.textStyles.bodyStrong, color: '#1a1c1c' },
  ipPickerItemMeta: { ...typography.textStyles.caption, color: '#5e5e5e' },
  ipPickerEmpty: { ...typography.textStyles.caption, color: colors.text.secondary, padding: spacing[4], textAlign: 'center' },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 8 },
  sectionHeadingCopy: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  sectionHeadingTitle: { ...typography.textStyles.micro, color: '#1a1c1c', fontSize: 11, fontWeight: '700', letterSpacing: 0.7 },
  sectionHeadingCode: { ...typography.textStyles.micro, color: '#5e5e5e', fontSize: 10, letterSpacing: 0.8 },
  queueSummary: { backgroundColor: '#f3f3f4', borderRadius: 8, gap: 8, marginHorizontal: 0, padding: 10 },
  queueSummaryTop: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  queueThumbStack: { flexDirection: 'row', height: 34, minWidth: 86 },
  queueThumb: { backgroundColor: colors.background.sunken, borderColor: colors.background.surface, borderRadius: 6, borderWidth: 2, height: 34, width: 42 },
  queueThumbFallback: { alignItems: 'center', backgroundColor: '#000000', justifyContent: 'center' },
  queueThumbOffset: { marginLeft: -9 },
  queueCountBubble: { alignItems: 'center', backgroundColor: colors.background.surface, borderColor: colors.background.surface, borderRadius: radius.md, borderWidth: 2, height: 34, justifyContent: 'center', marginLeft: -10, width: 34 },
  queueCountText: { ...typography.textStyles.micro, color: colors.text.title, fontWeight: '600' },
  queueEmptyThumb: { alignItems: 'center', backgroundColor: colors.background.sunken, borderRadius: radius.md, height: 34, justifyContent: 'center', width: 34 },
  queueSummaryCopy: { flex: 1, gap: spacing[1] },
  queueSummaryTitle: { ...typography.textStyles.bodyStrong, color: '#1a1c1c' },
  queueSummaryMeta: { ...typography.textStyles.micro, color: '#5e5e5e' },
  queueProgressMeta: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  queueProgressLabel: {
    color: '#1a1c1c',
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 12,
  },
  queueProgressTrack: { backgroundColor: '#e2e2e2', borderRadius: 2, height: 4, overflow: 'hidden' },
  queueProgressFill: { backgroundColor: '#000000', borderRadius: 2, height: '100%' },
  prototypeSection: {
    backgroundColor: '#f3f3f4',
    borderColor: 'transparent',
    borderRadius: 8,
    marginHorizontal: 0,
    shadowOpacity: 0,
  },
  formWrap: {
    gap: 8,
    paddingBottom: 16,
  },
  pickRow: {
    gap: 4,
    paddingVertical: 4,
  },
  sourceTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 8,
  },
  sourceTopLead: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  sourceTitleCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  sourceTitle: {
    color: '#1a1c1c',
    fontFamily: typography.family.base,
    fontSize: 15,
    fontWeight: '600',
  },
  sourceBadge: {
    backgroundColor: '#e8e8e8',
    color: '#444748',
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 18,
    paddingHorizontal: 5,
  },
  pickZone: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: '#e2e2e2',
    borderRadius: 4,
    borderWidth: 0,
    flexDirection: 'row',
    gap: rhythm.listCardGap,
    minHeight: 48,
    padding: 4,
  },
  sourceFooter: {
    alignItems: 'center',
    borderTopColor: '#e2e2e2',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
    paddingTop: 4,
  },
  sourceCountCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  sourceCountDot: {
    backgroundColor: '#000000',
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  sourceCountText: {
    color: '#444748',
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 12,
  },
  sourceActionButton: {
    alignItems: 'center',
    backgroundColor: '#eeeeee',
    borderRadius: 4,
    flexDirection: 'row',
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  sourceActionText: {
    color: '#1a1c1c',
    fontFamily: typography.family.base,
    fontSize: 11,
    fontWeight: '600',
  },
  pickIconWrap: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 6,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pickCopy: {
    flex: 1,
    gap: rhythm.microGap,
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
    gap: 4,
  },
  previewScroll: {
    maxHeight: 176,
  },
  previewCard: {
    aspectRatio: 1.5,
    backgroundColor: colors.background.empty,
    borderColor: colors.border.default,
    borderRadius: 0,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: '32.2%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewRemoveButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(22, 30, 40, 0.72)',
    borderRadius: radius.pill,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing[1],
    top: spacing[1],
    width: 24,
  },
  videoPreviewList: {
    gap: rhythm.listCardGap,
  },
  videoPreviewBlock: {
    gap: 4,
  },
  videoPreviewToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  videoPreviewToolbarLabel: {
    ...typography.textStyles.micro,
    color: '#5e5e5e',
  },
  videoPreviewModeToggle: {
    backgroundColor: '#e8e8e8',
    borderRadius: 4,
    flexDirection: 'row',
    padding: 2,
  },
  videoPreviewModeButton: {
    alignItems: 'center',
    borderRadius: 3,
    height: 26,
    justifyContent: 'center',
    width: 30,
  },
  videoPreviewModeButtonSelected: {
    backgroundColor: '#000000',
  },
  videoPreviewScroll: {
    maxHeight: 188,
  },
  videoPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  videoPreviewRow: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    minHeight: 38,
    paddingHorizontal: spacing[3],
  },
  videoPreviewThumb: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 4,
    height: 30,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 42,
  },
  videoPreviewImage: {
    height: '100%',
    width: '100%',
  },
  videoPreviewPlayBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.68)',
    borderRadius: 8,
    bottom: 3,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: 3,
    width: 16,
  },
  videoPreviewName: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    flex: 1,
    minWidth: 0,
  },
  videoRemoveButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  warningOptOutRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 32,
  },
  warningOptOutText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  currentIpRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    paddingBottom: spacing[2],
  },
  currentIpLabel: {
    ...typography.textStyles.bodyStrong,
    color: '#1a1c1c',
  },
  videoGridCard: {
    aspectRatio: 1.5,
    backgroundColor: '#eeeeee',
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
    width: '32.2%',
  },
  videoGridCardThumb: {
    alignItems: 'center',
    backgroundColor: '#000000',
    height: '100%',
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  videoGridCardImage: {
    height: '100%',
    width: '100%',
  },
  videoGridRemoveButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 20,
  },
  currentIpBadge: {
    backgroundColor: '#eeeeee',
    borderColor: '#e2e2e2',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  currentIpBadgeText: {
    ...typography.textStyles.caption,
    color: '#1a1c1c',
    fontWeight: '600',
    flex: 1,
  },
  optionList: {
    gap: rhythm.microGap,
    paddingVertical: spacing[2],
  },
  groupPickerBlock: {
    gap: 6,
    paddingTop: 4,
  },
  groupChipRow: {
    gap: 4,
    paddingVertical: 4,
  },
  groupChip: {
    alignItems: 'center',
    backgroundColor: '#e8e8e8',
    borderRadius: 4,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 10,
  },
  groupChipSelected: {
    backgroundColor: '#000000',
  },
  groupChipText: {
    color: '#1a1c1c',
    fontFamily: typography.family.base,
    fontSize: 11,
    fontWeight: '600',
  },
  groupChipTextSelected: {
    color: '#ffffff',
  },
  groupChipAdd: {
    alignItems: 'center',
    backgroundColor: '#e8e8e8',
    borderRadius: 4,
    flexDirection: 'row',
    gap: 3,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  metadataGrid: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 0,
  },
  metadataCard: {
    backgroundColor: '#eeeeee',
    borderRadius: 6,
    flex: 1,
    minHeight: 64,
    padding: 8,
  },
  metadataVerification: {
    color: '#1a1c1c',
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'right',
  },
  metadataTagsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 10,
  },
  metadataTag: {
    backgroundColor: '#f9f9f9',
    borderRadius: 3,
    color: '#1a1c1c',
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 16,
    paddingHorizontal: 6,
  },
  metadataAddTag: {
    alignItems: 'center',
    backgroundColor: '#e2e2e2',
    borderRadius: 3,
    flexDirection: 'row',
    gap: 2,
    minHeight: 22,
    paddingHorizontal: 6,
  },
  metadataAddTagText: {
    color: '#5e5e5e',
    fontFamily: typography.family.mono,
    fontSize: 10,
  },
  metadataStarLabel: {
    color: '#5e5e5e',
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 12,
    textTransform: 'uppercase',
  },
  metadataStarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metadataStarTitle: {
    color: '#1a1c1c',
    fontFamily: typography.family.base,
    fontSize: 13,
    lineHeight: 18,
  },
  duplicateDecisionList: {
    gap: rhythm.microGap,
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
    gap: 4,
    paddingBottom: spacing[1],
  },
  optionalToggle: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
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
    gap: rhythm.microGap,
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
    backgroundColor: '#ffffff',
    borderColor: '#c4c7c7',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    flex: 1,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  createGroupButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderColor: '#000000',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  createGroupText: {
    ...typography.textStyles.caption,
    color: '#ffffff',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.45,
  },
  templateGrid: {
    gap: rhythm.listCardGap,
    paddingVertical: spacing[2],
  },
  packageZone: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    flexDirection: 'row',
    gap: rhythm.listCardGap,
    minHeight: 48,
    padding: 8,
  },
  packageTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  packageFormat: {
    backgroundColor: '#e8e8e8',
    color: '#5e5e5e',
    fontFamily: typography.family.mono,
    fontSize: 10,
    lineHeight: 18,
    paddingHorizontal: 5,
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
    gap: rhythm.cardContentGap,
  },
  templateCreateButton: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: rhythm.microGap,
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
    gap: rhythm.cardContentGap,
    justifyContent: 'space-between',
    minHeight: 48,
    padding: spacing[2],
  },
  templateApplyArea: {
    flex: 1,
    gap: rhythm.microGap,
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
    gap: rhythm.microGap,
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
    gap: rhythm.listCardGap,
  },
  dialogInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 38,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  dialogTextarea: {
    minHeight: 68,
    textAlignVertical: 'top',
  },
  quickTags: {
    gap: rhythm.cardContentGap,
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
    gap: rhythm.cardContentGap,
    paddingVertical: spacing[3],
  },
  tagInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
  },
  noteFieldBlock: {
    gap: 6,
    paddingVertical: 8,
  },
  noteFieldLabel: {
    color: '#1a1c1c',
    fontFamily: typography.family.base,
    fontSize: 12,
    fontWeight: '600',
  },
  noteInput: {
    backgroundColor: '#ffffff',
    borderColor: '#c4c7c7',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    color: '#1a1c1c',
    minHeight: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: 'top',
  },
  tagInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    flex: 1,
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: spacing[2],
  },
  addTagButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderColor: '#000000',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    flexDirection: 'row',
    gap: rhythm.microGap,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  addTagLabel: {
    ...typography.textStyles.caption,
    color: '#ffffff',
    fontWeight: '500',
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  pressed: {
    opacity: 0.82,
  },
});


