import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { aiLightColors } from './ai/aiLightTheme';
import { colors, componentTokens, radius, spacing, typography } from '../design/tokens';

export type RootTabKey = 'home' | 'organize' | 'ai' | 'me';

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
  { key: 'organize', label: '整理', icon: 'albums-outline' },
  { key: 'ai', label: '聊天', icon: 'chatbubble-ellipses-outline' },
  { key: 'me', label: '我的', icon: 'person-outline' },
];

function getActiveTintColor(tab: RootTabKey) {
  return tab === 'ai' ? aiLightColors.primaryActive : colors.primary.default;
}

export function BottomTabBar({ activeTab, onSelectTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 4) }]}>
      {TAB_ITEMS.map((item) => {
        const isActive = item.key === activeTab;
        const activeTintColor = getActiveTintColor(item.key);

        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            key={item.key}
            onPress={() => onSelectTab(item.key)}
            style={({ pressed }) => [
              styles.item,
              pressed && styles.pressed
            ]}
          >
            <Ionicons
              color={isActive ? activeTintColor : colors.text.secondary}
              name={isActive ? item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap : item.icon}
              size={componentTokens.bottomTab.iconSize}
            />
            <Text style={[
              styles.label, 
              isActive ? styles.activeLabel : null, 
              isActive ? { color: activeTintColor } : null
            ]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderTopColor: colors.border.default,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: spacing[2],
    paddingTop: 4,
  },
  item: {
    alignItems: 'center',
    borderRadius: radius.lg,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    paddingVertical: 4,
    minHeight: 46,
  },
  label: {
    ...typography.textStyles.navTab,
    color: colors.text.secondary,
  },
  activeLabel: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});
