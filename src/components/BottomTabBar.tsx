import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, Dimensions } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { aiLightColors } from './ai/aiLightTheme';
import { colors, componentTokens, radius, shadows, spacing, typography } from '../design/tokens';
import { MagneticLiquidContainer } from './MagneticLiquidContainer';

export type RootTabKey = 'home' | 'organize' | 'ai' | 'me';

interface BottomTabBarProps {
  activeTab: RootTabKey;
  onSelectTab: (tab: RootTabKey) => void;
  scrollOffset?: SharedValue<number>;
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function BottomTabBar({ activeTab, onSelectTab, scrollOffset }: BottomTabBarProps) {
  // Convert pager scroll offset into a horizontal pulling force for the icons
  const externalForceX = useDerivedValue(() => {
    if (!scrollOffset) return 0;
    const val = scrollOffset.value;
    const nearest = Math.round(val / SCREEN_WIDTH) * SCREEN_WIDTH;
    const deviation = val - nearest; // range: -SCREEN_WIDTH/2 to +SCREEN_WIDTH/2
    // Max stretch force is 40px when swiping between pages
    return (deviation / SCREEN_WIDTH) * 40; 
  });

  return (
    <View style={styles.wrap}>
      {TAB_ITEMS.map((item) => {
        const isActive = item.key === activeTab;
        const activeTintColor = getActiveTintColor(item.key);

        return (
          <MagneticLiquidContainer 
            key={item.key}
            magneticStrength={0.5} 
            stretchFactor={0.015} 
            externalForceX={externalForceX}
          >
            <Pressable
              accessibilityLabel={item.label}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              onPress={() => onSelectTab(item.key)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Ionicons
                color={isActive ? activeTintColor : colors.text.secondary}
                name={isActive ? item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap : item.icon}
                size={componentTokens.bottomTab.iconSize}
              />
              <Text style={[styles.label, isActive ? styles.activeLabel : null, isActive ? { color: activeTintColor } : null]}>{item.label}</Text>
            </Pressable>
          </MagneticLiquidContainer>
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
    borderRadius: radius.xxl,
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
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});
