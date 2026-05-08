import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { ImageSortOrder } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';

export const IMAGE_SORT_OPTIONS: Array<{ value: ImageSortOrder; label: string }> = [
  { value: 'createdAtDesc', label: '最新导入' },
  { value: 'createdAtAsc', label: '最早导入' },
  { value: 'updatedAtDesc', label: '最近更新' },
  { value: 'updatedAtAsc', label: '最早更新' },
  { value: 'filenameAsc', label: '名称 A-Z' },
  { value: 'filenameDesc', label: '名称 Z-A' },
  { value: 'fileSizeDesc', label: '文件大到小' },
  { value: 'fileSizeAsc', label: '文件小到大' },
];

export function getImageSortLabel(orderBy: ImageSortOrder) {
  return IMAGE_SORT_OPTIONS.find((option) => option.value === orderBy)?.label ?? '最新导入';
}

export function getNextImageSortOrder(orderBy: ImageSortOrder): ImageSortOrder {
  const currentIndex = IMAGE_SORT_OPTIONS.findIndex((option) => option.value === orderBy);
  return IMAGE_SORT_OPTIONS[(currentIndex + 1) % IMAGE_SORT_OPTIONS.length]?.value ?? 'createdAtDesc';
}

export function SortMenuButton({
  orderBy,
  onChange,
}: {
  orderBy: ImageSortOrder;
  onChange: (orderBy: ImageSortOrder) => void;
}) {
  return (
    <Pressable
      accessibilityLabel="切换素材排序"
      onPress={() => onChange(getNextImageSortOrder(orderBy))}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons color={colors.text.secondary} name="swap-vertical-outline" size={14} />
      <Text numberOfLines={1} style={styles.text}>{getImageSortLabel(orderBy)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 32,
    paddingHorizontal: spacing[2],
  },
  text: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
});
