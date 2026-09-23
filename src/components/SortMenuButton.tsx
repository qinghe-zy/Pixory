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
  compact,
}: {
  orderBy: ImageSortOrder;
  compact?: boolean;
  onChange: (orderBy: ImageSortOrder) => void;
  onFilterPress?: () => void;
  hasActiveFilters?: boolean;
  filterIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = useRef<View>(null);

  const handleOpen = () => {
    if (sortMenuVisible) {
      setSortMenuVisible(false);
      return;
    }
    buttonRef.current?.measure((x, y, w, h, px, py) => {
      setMenuPos({ top: py + h, left: px, width: w });
      setSortMenuVisible(true);
    });
  };

  return (
    <View style={styles.wrap} ref={buttonRef}>
      <View style={[styles.pillContainer, compact && { height: 28 }, { minWidth: compact ? 96 : 110 }, sortMenuVisible && styles.pillContainerOpen]}>
        <Pressable
          accessibilityLabel="选择素材排序"
          onPress={handleOpen}
          style={({ pressed }) => [
            styles.sortButton, compact && { paddingHorizontal: 8 },
            sortMenuVisible && styles.buttonActive,
            pressed && styles.pressed,
          ]}
        >
          <Svg width={compact ? 12 : 14} height={compact ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color="#6B7280">
            <Path d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0-3.75-3.75M17.25 21 21 17.25" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text numberOfLines={1} style={[styles.text, compact && { fontSize: 11 }, sortMenuVisible && styles.textActive]}>
            {getImageSortLabel(orderBy)}
          </Text>
          <Svg width={compact ? 10 : 12} height={compact ? 10 : 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" color="#9CA3AF">
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
                styles.filterButton, compact && { paddingHorizontal: 8 },
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
        <View style={[styles.menu, { top: menuPos.top, left: menuPos.left, width: menuPos.width }]}>
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
                {selected && <Ionicons color="#111827" name="checkmark" size={15} />}
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
    backgroundColor: '#F3F4F6',
    borderColor: 'rgba(0,0,0,0.06)',
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
    backgroundColor: '#E5E7EB',
  },
  text: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  textActive: {
    color: '#111827',
  },
  dismissLayer: {
    bottom: -1000,
    left: -1000,
    position: 'absolute',
    right: -1000,
    top: -1000,
    zIndex: 21,
  },
  pillContainerOpen: {
    // Menu renders in a Modal and positions absolutely — keep pill border intact
    backgroundColor: '#E5E7EB',
  },
  menu: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 4,
    position: 'absolute',
    zIndex: 999,
    elevation: 99,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
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
    color: '#111827',
  },
  pressed: {
    opacity: 0.78,
  },
});
