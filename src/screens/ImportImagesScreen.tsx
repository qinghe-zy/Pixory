import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { DevOnlyCard } from '../components/DevOnlyCard';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { LightFormSection } from '../components/LightFormSection';
import { OptionSelectRow } from '../components/OptionSelectRow';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { PrimaryButton } from '../components/PrimaryButton';
import { ReadonlyInfoRow } from '../components/ReadonlyInfoRow';
import { SwitchSettingRow } from '../components/SwitchSettingRow';
import { TagChip } from '../components/TagChip';
import { commonButtonCopy } from '../constants/copy';
import { getGroupTypeLabel } from '../constants/groups';
import { IMPORT_TEMPLATES, type ImportTemplate } from '../constants/importTemplates';
import { NOTE_MAX_LENGTH, TAG_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, ipRepository, settingsRepository, tagRepository, type GroupRecord, type IpRecord, type TagUsageItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';
import {
  importImagesToIp,
  pickImagesForImport,
  type PickedImageAsset,
} from '../services/imageImportService';
import { mergeDelimitedDraftTagNames, mergeDraftTagNames } from '../utils/tagDrafts';
import { devLog } from '../utils/dev';
import { useToast } from '../components/AppToast';

interface ImportImagesScreenProps {
  ipId: number;
  defaultGroupId?: number | null;
  onBack: () => void;
  onImported: (imageIds: number[], importBatchId: number | null) => void;
}

export function ImportImagesScreen({
  ipId,
  defaultGroupId = null,
  onBack,
  onImported,
}: ImportImagesScreenProps) {
  const { showToast } = useToast();
  const {
    data: screenData,
    errorMessage: loadErrorMessage,
    reload,
  } = useScreenLoad<{ ip: IpRecord | null; groups: GroupRecord[]; recentGroupIds: number[]; recentTags: TagUsageItem[] }>(
    async () => {
      const [ip, groups, recentGroupIds, recentTags] = await Promise.all([
        ipRepository.findById(ipId),
        groupRepository.findByIpId(ipId),
        settingsRepository.getRecentImportGroupIds(),
        tagRepository.findRecentlyUsed(8),
      ]);

      return { ip, groups, recentGroupIds, recentTags };
    },
    [ipId],
    {
      initialData: { ip: null, groups: [], recentGroupIds: [], recentTags: [] },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取导入配置失败：${message}`;
      },
    }
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>(defaultGroupId != null ? [defaultGroupId] : []);
  const [pickedAssets, setPickedAssets] = useState<PickedImageAsset[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [isOptionalOpen, setIsOptionalOpen] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const canImport = useMemo(
    () => pickedAssets.length > 0 && !isSubmitting,
    [pickedAssets.length, isSubmitting]
  );
  const ip = screenData?.ip ?? null;
  const groups = screenData?.groups ?? [];
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

    const existing = await groupRepository.findByIpIdAndName(ipId, preparedName);
    const group = existing ?? (await groupRepository.create({ ipId, name: preparedName, type: 'custom' }));
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

  async function applyTemplate(template: ImportTemplate) {
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

  function applyRegressionPreset() {
    setTags(['tagA', 'tagB']);
    setNote('android import note');
    setIsFavorite(true);
  }

  function handleImport() {
    void runSubmit(async () => {
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
      });

      const result = await importImagesToIp({
        ipId,
        groupIds: selectedGroupIds,
        tagNames: preparedTags,
        note: preparedNote,
        isFavorite,
        templateKey: selectedTemplateKey,
        pickedAssets,
      });

      devLog('Pixory import result readback:', {
        successCount: result.successCount,
        failedCount: result.failedCount,
        importedImages: result.importedImages.map((item) => ({
          imageId: item.image.id,
          groupId: item.image.groupId,
          isFavorite: item.image.isFavorite,
          note: item.image.note,
          tagNames: item.tags.map((tag) => tag.name),
        })),
      });

      if (result.successCount === 0) {
        throw new Error(`没有成功导入图片，失败 ${result.failedCount} 张。`);
      }

      await settingsRepository.rememberImportGroupIds(selectedGroupIds);
      showToast(`成功导入 ${result.successCount} 张`);
      onImported(result.importedImages.map((item) => item.image.id), result.importBatch?.id ?? null);
    }, {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `导入失败：${message}`;
      },
      validate: () => (pickedAssets.length === 0 ? '请先选择要导入的图片。' : null),
    });
  }

  return (
    <FormScreenScaffold
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
      title="导入图片"
    >
      <View style={styles.formWrap}>
        <LightFormSection hint="复制原图，缩略图单独生成。" title="选择图片">
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

        <LightFormSection title="目标归属">
          <ReadonlyInfoRow
            hint={
              selectedGroupIds.length > 0
                ? `已选分组：${selectedGroupIds
                    .map((groupId) => groups.find((group) => group.id === groupId)?.name)
                    .filter(Boolean)
                    .join('、')}`
                : '未选择分组时导入到当前 IP。'
            }
            label="当前 IP"
            value={ip?.name ?? `IP #${ipId}`}
          />

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
              <View style={styles.templateGrid}>
                {IMPORT_TEMPLATES.map((template) => (
                  <Pressable
                    key={template.key}
                    onPress={() => void applyTemplate(template)}
                    style={({ pressed }) => [styles.templateChip, pressed && styles.pressed]}
                  >
                    <Text numberOfLines={1} style={styles.templateText}>{template.name}</Text>
                  </Pressable>
                ))}
              </View>
            </LightFormSection>

            <LightFormSection hint="这些内容会应用到本次导入的全部图片。" title="标签与备注">
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
                hint="给这批图片补充统一备注。"
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
  optionList: {
    gap: spacing[1],
    paddingVertical: spacing[2],
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    paddingVertical: spacing[2],
  },
  templateChip: {
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  templateText: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    fontWeight: '600',
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
