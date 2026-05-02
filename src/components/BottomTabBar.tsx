import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../design/tokens';

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
  { key: 'home', label: '首页', icon: 'grid-outline' },
  { key: 'groups', label: '分组', icon: 'albums-outline' },
  { key: 'tags', label: '标签', icon: 'pricetags-outline' },
  { key: 'me', label: '我的', icon: 'person-circle-outline' },
];

export function BottomTabBar({ activeTab, onSelectTab }: BottomTabBarProps) {
  return (
    <View style={styles.wrap}>
      {TAB_ITEMS.map((item) => {
        const isActive = item.key === activeTab;

        return (
          <Pressable
            accessibilityRole="button"
            key={item.key}
            onPress={() => onSelectTab(item.key)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Ionicons
              color={isActive ? colors.primary.default : colors.text.secondary}
              name={item.icon}
              size={22}
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
    ...shadows.md,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 49,
    paddingHorizontal: spacing[2],
  },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: spacing[1],
    justifyContent: 'center',
    minHeight: 49,
  },
  label: {
    ...typography.textStyles.navTab,
    color: colors.text.secondary,
  },
  activeLabel: {
    color: colors.primary.default,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.8,
  },
});
