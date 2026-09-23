import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, Modal, Dimensions } from 'react-native';
import { useRef } from 'react';
import Svg, { Path } from 'react-native-svg';

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
          <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color="#6B7280">
            <Path d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0-3.75-3.75M17.25 21 21 17.25" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text numberOfLines={1} style={[styles.text, sortMenuVisible && styles.textActive]}>
            {getImageSortLabel(orderBy)}
          </Text>
          <Svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" color="#9CA3AF">
            <Path d="m19.5 8.25-7.5 7.5-7.5-7.5" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
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
                {selected && <Ionicons color={colors.primary.active} name="checkmark" size={15} />}
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
    backgroundColor: '#FFFFFF',
    borderColor: colors.border.default,
    borderRadius: 8,
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
    borderRadius: 6,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 34,
    paddingHorizontal: spacing[2],
  },
  menuRowActive: {
    backgroundColor: '#F3F4F6',
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
