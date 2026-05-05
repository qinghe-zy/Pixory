import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { TAG_NAME_MAX_LENGTH } from '../constants/limits';
import type { TagUsageItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { mergeDelimitedDraftTagNames } from '../utils/tagDrafts';
import { TagChip } from './TagChip';

interface TagMultiSelectPanelProps {
  availableTags: TagUsageItem[];
  selectedTagNames: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onSelectedTagNamesChange: (tagNames: string[]) => void;
  placeholder?: string;
  removable?: boolean;
}

export function TagMultiSelectPanel({
  availableTags,
  selectedTagNames,
  inputValue,
  onInputChange,
  onSelectedTagNamesChange,
  placeholder = '输入新标签后回车',
  removable = true,
}: TagMultiSelectPanelProps) {
  const [tagSearchText, setTagSearchText] = useState('');
  const selectedKeys = new Set(selectedTagNames.map((tagName) => tagName.toLowerCase()));
  const commonTags = useMemo(
    () =>
      [...availableTags].sort(
        (left, right) =>
          right.imageCount - left.imageCount ||
          (right.lastUsedAt ?? '').localeCompare(left.lastUsedAt ?? '') ||
          left.name.localeCompare(right.name)
      ),
    [availableTags]
  );
  const normalizedTagSearchText = tagSearchText.trim().toLowerCase();
  const visibleTags = useMemo(() => {
    if (normalizedTagSearchText) {
      return commonTags.filter((tag) => tag.name.toLowerCase().includes(normalizedTagSearchText));
    }

    return commonTags;
  }, [commonTags, normalizedTagSearchText]);
  const canSearchTags = availableTags.length > 8;

  function toggleTag(tagName: string) {
    const key = tagName.toLowerCase();
    if (selectedKeys.has(key)) {
      if (!removable) {
        return;
      }
      onSelectedTagNamesChange(selectedTagNames.filter((item) => item.toLowerCase() !== key));
      return;
    }

    onSelectedTagNamesChange([...selectedTagNames, tagName]);
  }

  function addInputTag(rawValue = inputValue) {
    const nextTags = mergeDelimitedDraftTagNames(selectedTagNames, rawValue);
    onSelectedTagNamesChange(nextTags);
    onInputChange('');
  }

  return (
    <View style={styles.panel}>
      {availableTags.length > 0 ? (
        <View style={styles.existingPanel}>
          <View style={styles.existingHeader}>
            <Text style={styles.existingTitle}>{normalizedTagSearchText ? '搜索标签' : '常用标签'}</Text>
            <Text style={styles.existingCount}>{availableTags.length} 个</Text>
          </View>
          {canSearchTags ? (
            <View style={styles.searchRow}>
              <Ionicons color={colors.text.tertiary} name="search" size={15} />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setTagSearchText}
                placeholder="搜索标签"
                placeholderTextColor={colors.text.placeholder}
                selectionColor={colors.primary.default}
                style={styles.searchInput}
                value={tagSearchText}
              />
              {tagSearchText ? (
                <Pressable onPress={() => setTagSearchText('')} style={({ pressed }) => [styles.clearSearchButton, pressed && styles.pressed]}>
                  <Ionicons color={colors.text.tertiary} name="close-circle" size={16} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <ScrollView nestedScrollEnabled style={styles.existingScroll} contentContainerStyle={styles.existingWrap}>
            {visibleTags.map((tag) => {
              const selected = selectedKeys.has(tag.name.toLowerCase());
              return (
                <Pressable
                  key={tag.id}
                  onPress={() => toggleTag(tag.name)}
                  style={({ pressed }) => [styles.optionChip, selected ? styles.optionChipSelected : null, pressed && styles.pressed]}
                >
                  <Text numberOfLines={1} style={[styles.optionText, selected ? styles.optionTextSelected : null]}>
                    #{tag.name}
                  </Text>
                  {selected ? <Ionicons color={colors.primary.active} name="checkmark" size={13} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          {visibleTags.length === 0 ? <Text style={styles.helperText}>没有匹配的已有标签，可以直接输入新标签。</Text> : null}
        </View>
      ) : (
        <Text style={styles.helperText}>暂无已有标签，可以直接输入新标签。</Text>
      )}

      <View style={styles.inputRow}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={TAG_NAME_MAX_LENGTH}
          onChangeText={(value) => {
            if (/[,\uFF0C\s]/.test(value)) {
              addInputTag(value);
              return;
            }
            onInputChange(value);
          }}
          onSubmitEditing={() => addInputTag()}
          placeholder={placeholder}
          placeholderTextColor={colors.text.placeholder}
          returnKeyType="done"
          selectionColor={colors.primary.default}
          style={styles.input}
          value={inputValue}
        />
        <Pressable onPress={() => addInputTag()} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Ionicons color={colors.primary.default} name="add" size={17} />
        </Pressable>
      </View>

      {selectedTagNames.length > 0 ? (
        <View style={styles.selectedWrap}>
          {selectedTagNames.map((tagName) => (
            <TagChip
              key={tagName}
              label={tagName}
              onRemove={() => onSelectedTagNamesChange(selectedTagNames.filter((item) => item.toLowerCase() !== tagName.toLowerCase()))}
              removable={removable}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing[2],
  },
  existingPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    padding: spacing[2],
  },
  existingHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  existingTitle: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
    fontWeight: '700',
  },
  existingCount: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
  searchRow: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 34,
    paddingHorizontal: spacing[2],
  },
  searchInput: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    flex: 1,
    minHeight: 32,
    paddingVertical: 0,
  },
  clearSearchButton: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  existingScroll: {
    maxHeight: 132,
  },
  existingWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1.5],
  },
  optionChip: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 30,
    paddingHorizontal: spacing[2],
  },
  optionChipSelected: {
    backgroundColor: colors.background.tag,
    borderColor: colors.primary.hover,
  },
  optionText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    fontWeight: '600',
    maxWidth: 120,
  },
  optionTextSelected: {
    color: colors.primary.active,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  input: {
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
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  selectedWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  helperText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.78,
  },
});
