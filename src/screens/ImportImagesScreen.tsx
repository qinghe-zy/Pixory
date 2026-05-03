import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { ContentCard } from '../components/ContentCard';
import { DevOnlyCard } from '../components/DevOnlyCard';
import { FilterChip } from '../components/FilterChip';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { ReadonlyFieldCard } from '../components/ReadonlyFieldCard';
import { SwitchFieldCard } from '../components/SwitchFieldCard';
import { TagChip } from '../components/TagChip';
import { MultilineFieldCard } from '../components/MultilineFieldCard';
import { commonButtonCopy } from '../constants/copy';
import { getGroupTypeLabel } from '../constants/groups';
import { NOTE_MAX_LENGTH, TAG_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, ipRepository, type GroupRecord, type IpRecord } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';
import {
  importImagesToIp,
  pickImagesForImport,
  type PickedImageAsset,
} from '../services/imageImportService';
import { mergeDraftTagNames } from '../utils/tagDrafts';
import { devLog } from '../utils/dev';

interface ImportImagesScreenProps {
  ipId: number;
  defaultGroupId?: number | null;
  onBack: () => void;
  onImported: () => void;
}

export function ImportImagesScreen({
  ipId,
  defaultGroupId = null,
  onBack,
  onImported,
}: ImportImagesScreenProps) {
  const {
    data: screenData,
    errorMessage: loadErrorMessage,
    reload,
  } = useScreenLoad<{ ip: IpRecord | null; groups: GroupRecord[] }>(
    async () => {
      const [ip, groups] = await Promise.all([
        ipRepository.findById(ipId),
        groupRepository.findByIpId(ipId),
      ]);

      return { ip, groups };
    },
    [ipId],
    {
      initialData: { ip: null, groups: [] },
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取导入配置失败：${message}`;
      },
    }
  );
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(defaultGroupId ?? null);
  const [pickedAssets, setPickedAssets] = useState<PickedImageAsset[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const canImport = useMemo(
    () => pickedAssets.length > 0 && !isSubmitting,
    [pickedAssets.length, isSubmitting]
  );
  const ip = screenData?.ip ?? null;
  const groups = screenData?.groups ?? [];

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
      Alert.alert('选择图片失败', message);
    } finally {
      setIsPicking(false);
    }
  }

  function addTag(rawValue?: string) {
    const nextTags = mergeDraftTagNames(tags, rawValue ?? tagInput);
    if (nextTags.length === tags.length) {
      if ((rawValue ?? tagInput).trim()) {
        setTagInput('');
      }
      return;
    }

    setTags(nextTags);
    setTagInput('');
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
        groupId: selectedGroupId,
        tagNames: preparedTags,
        note: preparedNote || null,
        isFavorite,
        pickedAssetsCount: pickedAssets.length,
      });

      const result = await importImagesToIp({
        ipId,
        groupId: selectedGroupId,
        tagNames: preparedTags,
        note: preparedNote,
        isFavorite,
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

      Alert.alert('导入完成', `成功导入 ${result.successCount} 张，失败 ${result.failedCount} 张。`, [
        {
          text: '知道了',
          onPress: onImported,
        },
      ]);
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
        <ContentCard style={styles.pickCard}>
          <FormField hint="复制原图，缩略图单独生成。" label="选择图片">
            <Pressable
              accessibilityRole="button"
              disabled={isPicking}
              onPress={handlePickImages}
              style={({ pressed }) => [styles.pickZone, pressed && styles.pressed]}
            >
              <View style={styles.pickIconWrap}>
                <Ionicons color={colors.primary.default} name="images-outline" size={24} />
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
          </FormField>
        </ContentCard>

        <ReadonlyFieldCard
          hint={
            selectedGroupId
              ? `默认分组：${groups.find((group) => group.id === selectedGroupId)?.name ?? '当前分组'}`
              : '未选择分组时导入到当前 IP。'
          }
          label="当前 IP"
          value={ip?.name ?? `IP #${ipId}`}
        />

        <ContentCard>
          <FormField hint="可为空，不移动原图文件。" label="分组选择">
            <View style={styles.optionWrap}>
              <FilterChip active={selectedGroupId === null} label="暂不分组" onPress={() => setSelectedGroupId(null)} />
              {groups.map((group) => (
                <FilterChip
                  active={selectedGroupId === group.id}
                  key={group.id}
                  label={`${group.name} · ${getGroupTypeLabel(group.type)}`}
                  onPress={() => setSelectedGroupId(group.id)}
                />
              ))}
            </View>
          </FormField>
        </ContentCard>

        <ContentCard>
          <FormField hint="可选，保存时追加到导入图片。" label="标签">
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
          </FormField>
        </ContentCard>

        <MultilineFieldCard
          editable={!isSubmitting}
          hint="可选，给这批图片补充统一备注。"
          label="备注"
          maxLength={NOTE_MAX_LENGTH}
          onChangeText={(value) => {
            setNote(value);
            if (submitError) {
              clearSubmitError();
            }
          }}
          placeholder="例如：活动预热图、角色展示图、待二次挑选。"
          value={note}
        />

        <SwitchFieldCard
          disabled={isSubmitting}
          hint="开启后，这次导入的图片会全部标记为收藏。"
          label="默认收藏"
          onValueChange={setIsFavorite}
          value={isFavorite}
        />

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
  pickCard: {
    backgroundColor: colors.background.surface,
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
    minHeight: 72,
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
    ...typography.textStyles.sectionTitle,
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
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
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
