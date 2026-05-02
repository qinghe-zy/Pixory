import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { DevOnlyCard } from '../components/DevOnlyCard';
import { FilterChip } from '../components/FilterChip';
import { FormField } from '../components/FormField';
import { FormScreenScaffold } from '../components/FormScreenScaffold';
import { MultilineFieldCard } from '../components/MultilineFieldCard';
import { ReadonlyFieldCard } from '../components/ReadonlyFieldCard';
import { SwitchFieldCard } from '../components/SwitchFieldCard';
import { TagChip } from '../components/TagChip';
import { TextFieldCard } from '../components/TextFieldCard';
import { getGroupTypeLabel } from '../constants/groups';
import { NOTE_MAX_LENGTH, TAG_NAME_MAX_LENGTH } from '../constants/limits';
import { groupRepository, imageRepository, tagRepository, type GroupRecord, type ImageDetailRecord, type TagRecord } from '../database';
import { colors, componentTokens, metrics, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useSubmitState } from '../hooks/useSubmitState';
import { mergeDraftTagNames, normalizeDraftTagNames } from '../utils/tagDrafts';

interface EditImageScreenProps {
  imageId: number;
  refreshToken: number;
  onBack: () => void;
  onSaved: () => void;
}

export function EditImageScreen({ imageId, refreshToken, onBack, onSaved }: EditImageScreenProps) {
  const { data, errorMessage: loadErrorMessage } = useScreenLoad<{
    image: ImageDetailRecord | null;
    groups: GroupRecord[];
    tags: TagRecord[];
  }>(
    async () => {
      const detail = await imageRepository.findDetailById(imageId, { includeDeleted: true });
      if (!detail) {
        throw new Error('没有找到这张图片。');
      }

      const [groups, tags] = await Promise.all([
        groupRepository.findByIpId(detail.ipId),
        tagRepository.findByImageId(imageId),
      ]);

      return { image: detail, groups, tags };
    },
    [imageId, refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取图片编辑信息失败：${message}`;
      },
      initialData: { image: null, groups: [], tags: [] },
    }
  );
  const { isSubmitting, submitError, clearSubmitError, runSubmit } = useSubmitState();
  const [originalFilename, setOriginalFilename] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const image = data?.image ?? null;
  const groups = data?.groups ?? [];

  useEffect(() => {
    if (!image) {
      return;
    }

    setOriginalFilename(image.originalFilename);
    setSelectedGroupId(image.groupId);
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

        const updatedImage = await imageRepository.updateMetadata(image.id, {
          originalFilename,
          groupId: selectedGroupId,
          note,
          isFavorite,
        });

        if (!updatedImage) {
          throw new Error('保存时没有找到这张图片。');
        }

        await tagRepository.setImageTags(image.id, preparedTags);
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
      errorMessage={submitError ?? loadErrorMessage}
      onBack={onBack}
      primaryAction={{ disabled: !canSave, label: '保存修改', loading: isSubmitting, onPress: handleSave }}
      secondaryAction={{ disabled: isSubmitting, label: '取消返回', onPress: onBack }}
      title="编辑图片"
    >
      <View style={styles.formWrap}>
        <ReadonlyFieldCard
          hint="这里只读展示所属 IP，图片编辑不会跨 IP 移动。"
          label="所属 IP"
          value={image?.ipName ?? '当前IP'}
        />

        <TextFieldCard
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
          errorMessage={submitError}
          label="文件名"
          maxLength={80}
          onChangeText={(value) => {
            setOriginalFilename(value);
            if (submitError) {
              clearSubmitError();
            }
          }}
          placeholder="输入图片文件名"
          value={originalFilename}
        />

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

        <ContentCard>
          <FormField hint="只显示当前 IP 下已有分组，也支持保留未分组。" label="所在分组">
            <View style={styles.optionWrap}>
              <FilterChip active={selectedGroupId === null} label="无分组" onPress={() => setSelectedGroupId(null)} />
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
          <FormField hint="支持新增和删除标签，保存后会同步更新 image_tags。" label="标签">
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
                <Text style={styles.addTagLabel}>添加标签</Text>
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
          </FormField>
        </ContentCard>

        <MultilineFieldCard
          editable={!isSubmitting}
          label="备注"
          maxLength={NOTE_MAX_LENGTH}
          onChangeText={(value) => {
            setNote(value);
            if (submitError) {
              clearSubmitError();
            }
          }}
          placeholder="给这张图片补充说明，例如：导入说明、用途备注、筛选结论。"
          value={note}
        />

        <SwitchFieldCard
          disabled={isSubmitting}
          hint="这里只更新收藏状态，不会改动原图和缩略图文件。"
          label="收藏状态"
          onValueChange={setIsFavorite}
          value={isFavorite}
        />
      </View>
    </FormScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: metrics.formFieldGap,
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
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text.title,
    flex: 1,
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  addTagButton: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderColor: colors.primary.hover,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[1],
    height: componentTokens.common.minTouchSize,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
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
    backgroundColor: colors.background.tag,
    borderColor: colors.primary.hover,
    borderRadius: radius.md,
    borderWidth: 1,
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
