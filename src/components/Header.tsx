import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';

import { colors, componentTokens, layout, spacing, typography } from '../design/tokens';

interface HeaderProps {
  title: string;
  onBack?: () => void;
  rightSlot?: ReactNode;
  sideWidth?: number;
}

export function Header({ title, onBack, rightSlot, sideWidth = componentTokens.iconButton.size }: HeaderProps) {
  return (
    <View style={[styles.container, { minHeight: layout.headerHeight }]}>
      <View style={[styles.side, styles.leadingSide, { minWidth: sideWidth }]}>
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
        <Text numberOfLines={1} style={typography.textStyles.navTitle}>
          {title}
        </Text>
      </View>

      <View style={[styles.side, styles.trailingSide, { minWidth: sideWidth }]}>{rightSlot}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    paddingTop:
      Platform.OS === 'android'
        ? (StatusBar.currentHeight ?? 0) + spacing[3]
        : spacing[3],
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
    alignItems: 'center',
    flex: 1,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
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
