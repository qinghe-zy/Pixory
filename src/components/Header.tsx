import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, componentTokens, layout, shadows, spacing, typography } from '../design/tokens';

interface HeaderProps {
  title: string;
  subtitle?: string;
  titleVariant?: 'page' | 'brand';
  decorativeTitle?: string;
  onBack?: () => void;
  rightSlot?: ReactNode;
  sideWidth?: number;
}

const DECORATIVE_TITLE_BY_PAGE: Record<string, string> = {
  标签: 'Tags',
  分组: 'Groups',
  回收站: 'Trash',
  最近查看: 'Recent',
  收藏图片: 'Favorites',
  图片库: 'Gallery',
  分部图片: 'Gallery',
};

export function Header({
  title,
  subtitle,
  titleVariant = 'page',
  decorativeTitle,
  onBack,
  rightSlot,
  sideWidth = componentTokens.iconButton.size,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight =
    Platform.OS === 'android'
      ? Math.max(StatusBar.currentHeight ?? 0, insets.top)
      : insets.top;

  return (
    <View
      style={[
        styles.container,
        {
          minHeight: layout.headerHeight,
          paddingTop: statusBarHeight + layout.pageTopOffset,
        },
      ]}
    >
      <View style={[styles.side, styles.leadingSide, { minWidth: onBack ? sideWidth : 0 }]}>
        {onBack ? (
          <Pressable
            accessibilityLabel="返回"
            hitSlop={10}
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <Ionicons color={colors.text.title} name="chevron-back" size={20} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.titleWrap}>
        <Text numberOfLines={1} style={titleVariant === 'brand' ? typography.textStyles.brandLogo : typography.textStyles.navTitle}>
          {title}
        </Text>
        {subtitle ? <Text numberOfLines={1} style={typography.textStyles.brandSubtitle}>{subtitle}</Text> : null}
      </View>

      {titleVariant === 'page' ? (
        <Text pointerEvents="none" style={styles.decorativeTitle}>
          {decorativeTitle ?? DECORATIVE_TITLE_BY_PAGE[title] ?? ''}
        </Text>
      ) : null}

      <View style={[styles.side, styles.trailingSide, { minWidth: sideWidth }]}>{rightSlot}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    position: 'relative',
  },
  side: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
  },
  leadingSide: {
    justifyContent: 'flex-start',
  },
  trailingSide: {
    justifyContent: 'flex-end',
  },
  titleWrap: {
    alignItems: 'flex-start',
    flex: 1,
  },
  decorativeTitle: {
    color: colors.primary.light,
    fontFamily: typography.family.brand,
    fontSize: 28,
    fontWeight: '400',
    opacity: 0.22,
    position: 'absolute',
    right: 52,
    top: 28,
  },
  iconButton: {
    ...shadows.xs,
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderColor: colors.border.default,
    borderRadius: componentTokens.iconButton.radius,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.iconButton.size,
    justifyContent: 'center',
    width: componentTokens.iconButton.size,
  },
  iconButtonPressed: {
    opacity: 0.72,
  },
});
