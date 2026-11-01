import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { aiLightColors } from './ai/aiLightTheme';
import { colors, componentTokens, spacing, typography } from '../design/tokens';

export type RootTabKey = 'home' | 'organize' | 'im' | 'ai' | 'me';

interface BottomTabBarProps {
  activeTab: RootTabKey;
  onSelectTab: (tab: RootTabKey) => void;
  imUnreadCount?: number;
}

const TAB_ITEMS: Array<{
  key: RootTabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'home', label: '首页', icon: 'home-outline' },
  { key: 'organize', label: '整理', icon: 'albums-outline' },
  { key: 'im', label: '伴聊', icon: 'chatbubbles-outline' },
  { key: 'ai', label: '长聊', icon: 'sparkles-outline' },
  { key: 'me', label: '我的', icon: 'person-outline' },
];

function getActiveTintColor(tab: RootTabKey) {
  return tab === 'ai' || tab === 'im' ? aiLightColors.primaryActive : colors.primary.default;
}

export function BottomTabBar({ activeTab, onSelectTab, imUnreadCount }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 4) }]}>
      {TAB_ITEMS.map((item) => {
        const isActive = item.key === activeTab;
        const activeTintColor = getActiveTintColor(item.key);
        const hasImUnread = item.key === 'im' && typeof imUnreadCount === 'number' && imUnreadCount > 0;

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
            <View style={styles.iconBox}>
              <Ionicons
                color={isActive ? '#000000' : colors.text.secondary}
                name={isActive ? item.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap : item.icon}
                size={22}
              />
              {hasImUnread && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>
                    {imUnreadCount > 99 ? '99+' : imUnreadCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[
              styles.label, 
              isActive ? styles.activeLabel : null, 
              isActive ? { color: '#000000' } : null
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
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    flexDirection: 'row',
    paddingTop: 6,
  },
  item: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    paddingBottom: 4,
  },
  iconBox: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FA5151',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 11,
  },
  label: {
    ...typography.textStyles.navTab,
    fontSize: 10,
    color: colors.text.secondary,
  },
  activeLabel: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
});
