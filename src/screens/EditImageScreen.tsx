import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DevOnlyCard } from '../components/DevOnlyCard';
import { FormInputRow } from '../components/FormInputRow';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { FormTextareaRow } from '../components/FormTextareaRow';
import { LightFormSection } from '../components/LightFormSection';
import { OptionSelectRow } from '../components/OptionSelectRow';
import { ReadonlyInfoRow } from '../components/ReadonlyInfoRow';
import { SecureImage } from '../components/SecureImage';
import { SwitchSettingRow } from '../components/SwitchSettingRow';
import { TagChip } from '../components/TagChip';
import { getGroupTypeLabel } from '../constants/groups';
import { NOTE_MAX_LENGTH, TAG_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, imageRepository, runWithDatabaseSpace, tagRepository, type GroupRecord, type ImageDetailRecord, type PixorySpace, type TagRecord } from '../database';
import { colors, componentTokens, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';
import { mergeDraftTagNames, normalizeDraftTagNames } from '../utils/tagDrafts';

interface EditImageScreenProps {
  imageId: number;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onSaved: () => void;
}

export function EditImageScreen({ imageId, space = 'normal', refreshToken, onBack, onSaved }: EditImageScreenProps) {
  const { data, errorMessage: loadErrorMessage } = useScreenLoad<{
    image: (ImageDetailRecord & { loadedGroupIds?: number[] }) | null;
    groups: GroupRecord[];
    tags: TagRecord[];
  }>(
    async () => {
      const detail = await runWithDatabaseSpace(space, (db) => imageRepository.findDetailById(db, imageId, { includeDeleted: true, mediaType: 'all' }));
      if (!detail) {
        throw new Error('没有找到这个素材。');
      }

      const [groups, tags, groupIds] = await runWithDatabaseSpace(space, (db) => Promise.all([
        groupRepository.findByIpId(db, detail.ipId),
        tagRepository.findByImageId(db, imageId),
        imageRepository.findGroupIdsByImageId(db, imageId),
      ]));

      return { image: { ...detail, loadedGroupIds: groupIds }, groups, tags };
    },
    [imageId, refreshToken, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取素材编辑信息失败：${message}`;
      },
      initialData: { image: null, groups: [], tags: [] },
    }
  );
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const [originalFilename, setOriginalFilename] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const image = data?.image ?? null;
  const mediaLabel = image?.mediaType === 'video' ? '视频' : '图片';
  const groups = data?.groups ?? [];

  useEffect(() => {
    if (!image) {
      return;
    }

    setOriginalFilename(image.originalFilename);
    setSelectedGroupIds(image.loadedGroupIds ?? (image.groupId != null ? [image.groupId] : []));
    setTags(normalizeDraftTagNames((data?.tags ?? []).map((tag) => tag.name)));
    setTagInput('');
    setNote(image.note ?? '');
    setIsFavorite(image.isFavorite);
  }, [data?.tags, image]);

  const canSave = useMemo(
    () => Boolean(image) && !isSubmitting,
    [image, isSubmitting]
  );

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
    if (submitError) {
      clearSubmitError();
    }
  }

  function handleSave() {
    if (!image) {
      return;
    }

    void runSubmit(
      async () => {
        const preparedTags = mergeDraftTagNames(tags, tagInput);
        if (preparedTags.length !== tags.length) {
          setTags(preparedTags);
          setTagInput('');
        }

        const updatedImage = await runWithDatabaseSpace(space, (db) => imageRepository.updateMetadata(db, image.id, {
          originalFilename,
          groupIds: selectedGroupIds,
          note,
          isFavorite,
        }));

        if (!updatedImage) {
          throw new Error('保存时没有找到这张图片。');
        }

        await runWithDatabaseSpace(space, (db) => tagRepository.setImageTags(db, image.id, preparedTags));
        onSaved();
      },
      {
        formatError: (error) => {
          const message = error instanceof Error ? error.message : '未知错误';
          return `保存图片编辑失败：${message}`;
        },
        validate: () => {
          if (!originalFilename.trim()) {
            return '文件名不能为空。';
          }

          return null;
        },
      }
    );
  }

  return (
    <FormScreenScaffold
      backgroundVariant="detail"
      errorMessage={submitError ?? loadErrorMessage}
      onBack={onBack}
      primaryAction={{ disabled: !canSave, label: '保存修改', loading: isSubmitting, onPress: handleSave }}
      secondaryAction={{ disabled: isSubmitting, label: '取消返回', onPress: onBack }}
      title="编辑图片"
    >
      <View style={styles.formWrap}>
        <View style={styles.previewPanel}>
          <View style={styles.previewFrame}>
            {image?.thumbnailFileUri ?? image?.originalFileUri ? (
              <SecureImage
                contentFit="cover"
                space={space}
                style={styles.previewImage}
                uri={image.thumbnailFileUri ?? image.originalFileUri}
              />
            ) : (
              <View style={styles.previewFallback}>
                <Ionicons color={colors.text.secondary} name="image-outline" size={28} />
              </View>
            )}
          </View>
          <View style={styles.previewMeta}>
            <Text numberOfLines={2} style={styles.previewTitle}>
              {image?.originalFilename ?? `当前${mediaLabel}`}
            </Text>
            <Text numberOfLines={2} style={styles.previewCaption}>仅更新 Pixory 展示文件名和元数据，不改动{mediaLabel}原始文件。</Text>
          </View>
        </View>

        <LightFormSection title="元数据">
          <ReadonlyInfoRow
            hint="图片编辑不会跨 IP 移动。"
            label="所属 IP"
            value={image?.ipName ?? '当前IP'}
          />

          <FormInputRow
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSubmitting}
            errorMessage={submitError}
            label="Pixory 展示文件名"
            maxLength={80}
            onChangeText={(value) => {
              setOriginalFilename(value);
              if (submitError) {
                clearSubmitError();
              }
            }}
            placeholder={`输入${mediaLabel}展示文件名`}
            value={originalFilename}
          />

          <View style={styles.optionList}>
            <Text style={styles.inlineLabel}>所在分组</Text>
            <OptionSelectRow
              label="无分组"
              meta="保留在当前 IP"
              onPress={() => setSelectedGroupIds([])}
              selected={selectedGroupIds.length === 0}
            />
            {groups.map((group) => (
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

          <View style={styles.tagRow}>
            <View style={styles.inlineCopy}>
              <Text style={styles.inlineLabel}>标签</Text>
              <Text numberOfLines={2} style={styles.inlineHint}>保存后同步到图片标签。</Text>
            </View>
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
                placeholder="例如：海报、立绘、封面"
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
                  <TagChip
                    key={tag}
                    label={tag}
                    onRemove={() => setTags((current) => current.filter((item) => item.toLowerCase() !== tag.toLowerCase()))}
                    removable
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>暂时还没有标签。</Text>
            )}
          </View>

          <FormTextareaRow
            editable={!isSubmitting}
            label="备注"
            maxLength={NOTE_MAX_LENGTH}
            minHeight={84}
            onChangeText={(value) => {
              setNote(value);
              if (submitError) {
                clearSubmitError();
              }
            }}
            placeholder="例如：导入说明、用途备注、筛选结论。"
            value={note}
          />

          <SwitchSettingRow
            disabled={isSubmitting}
            hint="不改动原图和缩略图。"
            label="收藏状态"
            onValueChange={setIsFavorite}
            value={isFavorite}
          />
        </LightFormSection>

        <DevOnlyCard
          description="仅用于开发回归，快速填入图片管理编辑用例，避免自动化输入污染正式字段。"
          title="开发回归入口"
        >
          <Pressable
            accessibilityLabel="应用最终回归编辑预设"
            hitSlop={8}
            onPress={() => {
              setOriginalFilename('final_edited_image.png');
              setTags(['editTagA', 'editTagB']);
              setTagInput('');
              setNote('final edited note');
              setIsFavorite(false);
              if (submitError) {
                clearSubmitError();
              }
            }}
            style={({ pressed }) => [styles.devPresetButton, pressed && styles.pressed]}
          >
            <Text style={styles.devPresetLabel}>应用最终回归编辑预设</Text>
          </Pressable>
        </DevOnlyCard>
      </View>
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: rhythm.listCardGap,
  },
  previewPanel: {
    gap: rhythm.listCardGap,
    padding: spacing[3],
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewFrame: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.lg,
    height: 132,
    overflow: 'hidden',
    width: '100%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  previewMeta: {
    gap: rhythm.microGap,
    paddingHorizontal: spacing[1],
    minWidth: 0,
  },
  previewTitle: {
    ...typography.textStyles.bodyStrong,
  },
  previewCaption: {
    ...typography.textStyles.caption,
  },
  optionList: {
    gap: rhythm.microGap,
    paddingVertical: spacing[3],
  },
  inlineCopy: {
    gap: rhythm.microGap,
  },
  inlineLabel: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.primary,
  },
  inlineHint: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  tagRow: {
    gap: rhythm.cardContentGap,
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
    flexDirection: 'row',
    gap: spacing[1],
    height: 40,
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
    backgroundColor: colors.background.tag,
    borderColor: colors.primary.hover,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: componentTokens.common.minTouchSize,
    paddingHorizontal: spacing[4],
  },
  devPresetLabel: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.82,
  },
});
