import { Alert, Image, Keyboard, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { AppScreen } from '../components/AppScreen';
import { ContentCard } from '../components/ContentCard';
import { FilterChip } from '../components/FilterChip';
import { FormField } from '../components/FormField';
import { Header } from '../components/Header';
import { PrimaryButton } from '../components/PrimaryButton';
import { TagChip } from '../components/TagChip';
import { getGroupTypeLabel } from '../constants/groups';
import { groupRepository, ipRepository, type GroupRecord, type IpRecord } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import {
  importImagesToIp,
  pickImagesForImport,
  type PickedImageAsset,
} from '../services/imageImportService';

interface ImportImagesScreenProps {
  ipId: number;
  defaultGroupId?: number | null;
  onBack: () => void;
  onImported: () => void;
}

function mergeDraftTag(existingTags: string[], rawValue: string): string[] {
  const value = rawValue.trim();
  if (!value) {
    return existingTags;
  }

  if (existingTags.some((tag) => tag.toLowerCase() === value.toLowerCase())) {
    return existingTags;
  }

  return [...existingTags, value];
}

export function ImportImagesScreen({
  ipId,
  defaultGroupId = null,
  onBack,
  onImported,
}: ImportImagesScreenProps) {
  const [ip, setIp] = useState<IpRecord | null>(null);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(defaultGroupId ?? null);
  const [pickedAssets, setPickedAssets] = useState<PickedImageAsset[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [ipRecord, groupItems] = await Promise.all([
          ipRepository.findById(ipId),
          groupRepository.findByIpId(ipId),
        ]);

        if (!isMounted) {
          return;
        }

        setIp(ipRecord);
        setGroups(groupItems);
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取导入配置失败：${message}`);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [ipId]);

  const canImport = useMemo(() => pickedAssets.length > 0 && !isSubmitting, [pickedAssets.length, isSubmitting]);

  async function handlePickImages() {
    setIsPicking(true);
    setErrorMessage(null);

    try {
      const result = await pickImagesForImport();
      if (!result.canceled) {
        setPickedAssets(result.pickedAssets);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setErrorMessage(`选择图片失败：${message}`);
    } finally {
      setIsPicking(false);
    }
  }

  function addTag(rawValue?: string) {
    const nextTags = mergeDraftTag(tags, rawValue ?? tagInput);
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
    setNote('Android regression smoke import');
    setIsFavorite(true);
  }

  async function handleImport() {
    Keyboard.dismiss();

    if (pickedAssets.length === 0) {
      setErrorMessage('请先选择要导入的图片。');
      return;
    }

    const preparedTags = mergeDraftTag(tags, tagInput);
    const preparedNote = note.trim();

    if (preparedTags.length !== tags.length) {
      setTags(preparedTags);
      setTagInput('');
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      console.log('Pixory import request payload:', {
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

      console.log('Pixory import result readback:', {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setErrorMessage(`导入失败：${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen
      dismissKeyboardOnTouch
      footer={
        <View style={styles.actions}>
          <PrimaryButton disabled={!canImport} label="开始导入" loading={isSubmitting} onPress={handleImport} />
          <PrimaryButton disabled={isSubmitting} label="取消返回" onPress={onBack} variant="ghost" />
        </View>
      }
      scrollable
    >
      <Header onBack={onBack} title="导入图片" />

      <View style={styles.formWrap}>
        <ContentCard>
          <Text style={styles.infoTitle}>当前 IP</Text>
          <Text style={styles.infoValue}>{ip?.name ?? `IP #${ipId}`}</Text>
          {selectedGroupId ? (
            <Text style={styles.infoHint}>
              默认分组：{groups.find((group) => group.id === selectedGroupId)?.name ?? '当前分组'}
            </Text>
          ) : null}
          {/* Dev-only preset for regression smoke checks; formal import flow must not depend on it. */}
          {__DEV__ ? (
            <View style={styles.devHintWrap}>
              <Text style={styles.devHint}>仅用于开发回归：快速填入导入预设，不参与正式流程。</Text>
              <PrimaryButton label="应用回归测试预设" onPress={applyRegressionPreset} variant="outline" />
            </View>
          ) : null}
        </ContentCard>

        <ContentCard>
          <FormField hint="支持多选，导入时会复制原图并生成独立缩略图。" label="选择图片">
            <PrimaryButton
              label={isPicking ? '正在打开相册…' : pickedAssets.length > 0 ? `已选择 ${pickedAssets.length} 张，重新选择` : '选择图片'}
              loading={isPicking}
              onPress={handlePickImages}
            />
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

        <ContentCard>
          <FormField hint="可为空，不选则先导入到当前 IP 的未分组图片里。" label="分组选择">
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
          <FormField hint="建议每次输入一个标签，再点“添加标签”生成标签胶囊。" label="标签">
            <View style={styles.tagInputRow}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSubmitting}
                onChangeText={(value) => {
                  setTagInput(value);
                  if (errorMessage) {
                    setErrorMessage(null);
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
                <Text style={styles.addTagLabel}>添加标签</Text>
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

        <ContentCard>
          <FormField hint="可选，给这批图片补充统一备注。" label="备注">
            <TextInput
              editable={!isSubmitting}
              maxLength={160}
              multiline
              onChangeText={(value) => {
                setNote(value);
                if (errorMessage) {
                  setErrorMessage(null);
                }
              }}
              placeholder="例如：活动预热图、角色展示图、待二次挑选。"
              placeholderTextColor={colors.text.placeholder}
              selectionColor={colors.primary.default}
              style={styles.multilineInput}
              textAlignVertical="top"
              value={note}
            />
          </FormField>
        </ContentCard>

        <ContentCard style={styles.favoriteCard}>
          <View style={styles.favoriteCopy}>
            <Text style={styles.infoTitle}>默认收藏</Text>
            <Text style={styles.infoHint}>开启后，这次导入的图片会全部标记为收藏。</Text>
          </View>
          <Switch
            disabled={isSubmitting}
            onValueChange={setIsFavorite}
            thumbColor={colors.background.surface}
            trackColor={{ false: colors.border.strong, true: colors.primary.default }}
            value={isFavorite}
          />
        </ContentCard>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    gap: spacing[4],
  },
  infoTitle: {
    ...typography.textStyles.sectionTitle,
  },
  infoValue: {
    ...typography.textStyles.body,
    color: colors.text.title,
  },
  infoHint: {
    ...typography.textStyles.caption,
  },
  devHintWrap: {
    gap: spacing[3],
  },
  devHint: {
    ...typography.textStyles.caption,
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  previewCard: {
    backgroundColor: colors.background.empty,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: '30.8%',
  },
  previewImage: {
    height: 96,
    width: 96,
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
    minHeight: 44,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  addTagButton: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderColor: colors.primary.hover,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 44,
    flexDirection: 'row',
    gap: spacing[1],
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
  multilineInput: {
    ...typography.textStyles.body,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text.title,
    minHeight: 120,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  favoriteCard: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  favoriteCopy: {
    flex: 1,
    gap: spacing[1],
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  actions: {
    gap: spacing[3],
    paddingTop: spacing[2],
  },
  pressed: {
    opacity: 0.82,
  },
});
