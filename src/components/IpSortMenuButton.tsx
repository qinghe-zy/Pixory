import { Ionicons } from '@expo/vector-icons';
import { useState, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, Modal, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';

import type { IpSortOrder } from '../database';
import { colors, radius, shadows, spacing, typography, componentTokens } from '../design/tokens';
import { LiquidGlassBezel } from './LiquidGlassBezel';
import { MagneticLiquidContainer } from './MagneticLiquidContainer';

export const IP_SORT_OPTIONS: Array<{ value: IpSortOrder; label: string }> = [
  { value: 'default', label: '默认排序' },
  { value: 'createdAtAsc', label: '创建时间正序' },
  { value: 'createdAtDesc', label: '创建时间逆序' },
  { value: 'nameAsc', label: '名称 A-Z' },
  { value: 'nameDesc', label: '名称 Z-A' },
];

export function getIpSortLabel(orderBy: IpSortOrder | undefined) {
  return IP_SORT_OPTIONS.find((option) => option.value === orderBy)?.label ?? '默认排序';
}

export function IpSortMenuButton({
  orderBy = 'default',
  onChange,
}: {
  orderBy?: IpSortOrder;
  onChange: (orderBy: IpSortOrder) => void;
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

  const inner = (
    <Pressable
      accessibilityLabel="选择排序"
      onPress={handleOpen}
      style={({ pressed }) => [
        styles.base,
        pressed && styles.pressed,
      ]}
    >
      <BlurView intensity={50} style={styles.blur} tint="light">
        <LiquidGlassBezel active={sortMenuVisible} radius={componentTokens.filterChip.radius} />
        {sortMenuVisible ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.activeTint]} />
        ) : null}
        <View style={styles.inner}>
          <Text numberOfLines={1} style={[styles.text, sortMenuVisible ? styles.activeText : styles.inactiveText]}>
            {getIpSortLabel(orderBy)}
          </Text>
          <Ionicons color={sortMenuVisible ? colors.primary.dark : colors.text.title} name="chevron-down" size={13} />
        </View>
      </BlurView>
    </Pressable>
  );

  return (
    <View style={styles.wrap} ref={buttonRef}>
      <MagneticLiquidContainer 
        magneticStrength={0.4} 
        stretchFactor={0.03} 
        damping={12}
        style={styles.wrapper}
      >
        {inner}
      </MagneticLiquidContainer>

      <Modal
        visible={sortMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuVisible(false)}
      >
        <Pressable accessibilityLabel="关闭排序选择" onPress={() => setSortMenuVisible(false)} style={StyleSheet.absoluteFill} />
        <View style={[styles.menu, { top: menuPos.top, right: menuPos.right }]}>
          <BlurView intensity={65} style={StyleSheet.absoluteFill} tint="light" />
          <LiquidGlassBezel radius={radius.lg} />
          <View style={styles.menuContent}>
            {IP_SORT_OPTIONS.map((option) => {
              const selected = option.value === orderBy;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    setSortMenuVisible(false);
                  }}
                  style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
                >
                  <View style={[StyleSheet.absoluteFill, styles.menuRowBg, selected ? styles.menuRowActiveBg : null]} />
                  <Text numberOfLines={1} style={[styles.menuText, selected ? styles.menuTextActive : null]}>{option.label}</Text>
                  <Ionicons color={selected ? colors.primary.active : colors.text.tertiary} name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={15} />
                </Pressable>
              );
            })}
          </View>
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
  wrapper: {
    ...shadows.sm,
    shadowColor: '#3A2E1D',
    shadowOpacity: 0.05,
    borderRadius: componentTokens.filterChip.radius,
  },
  base: {
    borderRadius: componentTokens.filterChip.radius,
    height: componentTokens.filterChip.height,
  },
  blur: {
    borderRadius: componentTokens.filterChip.radius,
    overflow: 'hidden',
    height: '100%',
  },
  activeTint: {
    backgroundColor: 'rgba(86, 107, 72, 0.28)',
    borderRadius: componentTokens.filterChip.radius,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: componentTokens.filterChip.horizontalPadding,
    height: '100%',
  },
  text: {
    ...typography.textStyles.caption,
    fontWeight: '600',
    lineHeight: 18,
    maxWidth: 180,
    zIndex: 1,
  },
  activeText: {
    color: colors.primary.dark,
  },
  inactiveText: {
    color: colors.text.title,
  },
  menu: {
    ...shadows.floating,
    borderRadius: radius.lg,
    minWidth: 156,
    position: 'absolute',
    zIndex: 999,
    elevation: 99,
    overflow: 'hidden',
  },
  menuContent: {
    padding: spacing[2],
    gap: spacing[1],
  },
  menuRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 34,
    paddingHorizontal: spacing[2],
    overflow: 'hidden',
  },
  menuRowBg: {
    backgroundColor: 'transparent',
  },
  menuRowActiveBg: {
    backgroundColor: 'rgba(86, 107, 72, 0.28)',
  },
  menuText: {
    ...typography.textStyles.micro,
    color: colors.text.title,
    flex: 1,
    fontWeight: '600',
    minWidth: 0,
    zIndex: 1,
  },
  menuTextActive: {
    color: colors.primary.dark,
  },
  pressed: {
    opacity: 0.78,
  },
});
