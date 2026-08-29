import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, Modal, Dimensions } from 'react-native';
import { useRef } from 'react';

import type { ImageSortOrder } from '../database';
import { colors, radius, shadows, spacing, typography } from '../design/tokens';

export const IMAGE_SORT_OPTIONS: Array<{ value: ImageSortOrder; label: string }> = [
  { value: 'lastViewedAtDesc', label: '最近查看' },
  { value: 'lastViewedAtAsc', label: '最早查看' },
  { value: 'sourceOrderAsc', label: '来源顺序' },
  { value: 'sourceOrderDesc', label: '来源逆序' },
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

export function SortMenuButton({
  orderBy,
  onChange,
  onFilterPress,
  hasActiveFilters,
  filterIcon,
}: {
  orderBy: ImageSortOrder;
  onChange: (orderBy: ImageSortOrder) => void;
  onFilterPress?: () => void;
  hasActiveFilters?: boolean;
  filterIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<View>(null);

  const handleOpen = () => {
    if (sortMenuVisible) {
      setSortMenuVisible(false);
      return;
    }
    buttonRef.current?.measure((x, y, w, h, px, py) => {
      const windowWidth = Dimensions.get('window').width;
      setMenuPos({ top: py + h + 6, right: windowWidth - px - w });
      setSortMenuVisible(true);
    });
  };

  return (
    <View style={styles.wrap} ref={buttonRef}>
      <View style={styles.pillContainer}>
        <Pressable
          accessibilityLabel="选择素材排序"
          onPress={handleOpen}
          style={({ pressed }) => [
            styles.sortButton,
            sortMenuVisible && styles.buttonActive,
            pressed && styles.pressed,
          ]}
        >
          <Text numberOfLines={1} style={[styles.text, sortMenuVisible && styles.textActive]}>
            {getImageSortLabel(orderBy)}
          </Text>
          <Ionicons color={sortMenuVisible ? colors.primary.active : colors.text.secondary} name="chevron-down" size={13} />
        </Pressable>

        {onFilterPress && (
          <>
            <View style={styles.divider} />
            <Pressable
              accessibilityLabel="打开筛选"
              onPress={onFilterPress}
              style={({ pressed }) => [
                styles.filterButton,
                hasActiveFilters && styles.buttonActive,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons color={hasActiveFilters ? colors.primary.active : colors.text.secondary} name={filterIcon ?? 'funnel-outline'} size={14} />
            </Pressable>
          </>
        )}
      </View>

      <Modal
        visible={sortMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuVisible(false)}
      >
        <Pressable accessibilityLabel="关闭排序选择" onPress={() => setSortMenuVisible(false)} style={StyleSheet.absoluteFill} />
        <View style={[styles.menu, { top: menuPos.top, right: menuPos.right }]}>
          {IMAGE_SORT_OPTIONS.map((option) => {
            const selected = option.value === orderBy;
            return (
              <Pressable
                accessibilityRole="button"
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setSortMenuVisible(false);
                }}
                style={({ pressed }) => [styles.menuRow, selected ? styles.menuRowActive : null, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={[styles.menuText, selected ? styles.menuTextActive : null]}>{option.label}</Text>
                <Ionicons color={selected ? colors.primary.active : colors.text.tertiary} name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={15} />
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    zIndex: 20,
  },
  pillContainer: {
    ...shadows.sm,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    overflow: 'hidden',
  },
  sortButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    height: '100%',
    paddingHorizontal: spacing[3],
  },
  filterButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingHorizontal: spacing[3],
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: '40%',
    backgroundColor: colors.border.subtle,
  },
  buttonActive: {
    backgroundColor: colors.primary.weak,
  },
  text: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  textActive: {
    color: colors.primary.active,
  },
  dismissLayer: {
    bottom: -1000,
    left: -1000,
    position: 'absolute',
    right: -1000,
    top: -1000,
    zIndex: 21,
  },
  menu: {
    ...shadows.floating,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    minWidth: 156,
    padding: spacing[2],
    position: 'absolute',
    zIndex: 999,
    elevation: 99,
  },
  menuRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 34,
    paddingHorizontal: spacing[2],
  },
  menuRowActive: {
    backgroundColor: colors.primary.weak,
  },
  menuText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    flex: 1,
    fontWeight: '700',
    minWidth: 0,
  },
  menuTextActive: {
    color: colors.primary.active,
  },
  pressed: {
    opacity: 0.78,
  },
});
