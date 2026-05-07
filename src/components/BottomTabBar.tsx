import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, componentTokens, radius, shadows, spacing, typography } from '../design/tokens';

export type RootTabKey = 'home' | 'groups' | 'tags' | 'me';

interface BottomTabBarProps {
  activeTab: RootTabKey;
  onSelectTab: (tab: RootTabKey) => void;
}

const TAB_ITEMS: Array<{
  key: RootTabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'home', label: '首页', icon: 'home-outline' },
  { key: 'groups', label: '分组', icon: 'folder-open-outline' },
  { key: 'tags', label: '标签', icon: 'pricetag-outline' },
  { key: 'me', label: '我的', icon: 'person-outline' },
];

export function BottomTabBar({ activeTab, onSelectTab }: BottomTabBarProps) {
  return (
    <View style={styles.wrap}>
      {TAB_ITEMS.map((item) => {
        const isActive = item.key === activeTab;

        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            key={item.key}
            onPress={() => onSelectTab(item.key)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Ionicons
              color={isActive ? colors.primary.default : colors.text.secondary}
              name={isActive ? item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap : item.icon}
              size={componentTokens.bottomTab.iconSize}
            />
            <Text style={[styles.label, isActive ? styles.activeLabel : null]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...shadows.floating,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: componentTokens.bottomTab.radiusTop,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: Math.max(58, componentTokens.bottomTab.height - 10),
    marginHorizontal: spacing[1],
    paddingHorizontal: spacing[2],
    paddingTop: spacing[1],
  },
  item: {
    alignItems: 'center',
    borderRadius: radius.lg,
    flex: 1,
    gap: spacing[1],
    justifyContent: 'center',
    minHeight: 46,
  },
  label: {
    ...typography.textStyles.navTab,
    color: colors.text.secondary,
  },
  activeLabel: {
    color: colors.primary.default,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});
