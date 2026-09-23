import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Svg, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PixorySpace } from '../database';
import { layout } from '../design/tokens';

export function FilterIcon({ color = "#4B5563" }: { color?: string }) {
  return (
    <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color={color}>
      <Path d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function GridIcon({ color = "#9CA3AF" }: { color?: string }) {
  return (
    <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color={color}>
      <Path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function JustifiedIcon({ color = "#9CA3AF" }: { color?: string }) {
  return (
    <Svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" color={color}>
      <Path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

interface CompactHeaderProps {
  title: string;
  count: number;
  space: PixorySpace;
  onBack?: () => void;
  rightActions?: ReactNode;
  animatedStyle?: any;
  staticMode?: boolean; // If true, don't use absolute positioning (for 1-line layouts without hero)
}

export function GalleryCompactHeader({ title, count, space, onBack, rightActions, animatedStyle, staticMode }: CompactHeaderProps) {
  const { top: statusBarHeight } = useSafeAreaInsets();
  
  const content = (
    <>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: statusBarHeight, backgroundColor: '#FFFFFF' }} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: '#FAFAFA', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          {onBack && (
            <Pressable onPress={onBack} style={({ pressed }) => [{ height: 32, width: 28, alignItems: 'center', justifyContent: 'center', marginLeft: -6 }, pressed && { opacity: 0.6 }]}>
              <Ionicons name="chevron-back" size={22} color="#111827" />
            </Pressable>
          )}
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', letterSpacing: -0.2 }} numberOfLines={1}>
            {title}
          </Text>
          <View style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>
            <Text style={{ fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '500', color: '#4B5563', lineHeight: 12 }}>
              {count}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {rightActions}
        </View>
      </View>
    </>
  );

  if (staticMode) {
    return (
      <View style={{ paddingTop: statusBarHeight, height: statusBarHeight + 48, zIndex: 10 }}>
        {content}
      </View>
    );
  }

  return (
    <Animated.View style={[
      { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: statusBarHeight, height: statusBarHeight + 48 },
      animatedStyle
    ]} pointerEvents="box-none">
      <BlurView intensity={space === 'personal' ? 60 : 80} style={StyleSheet.absoluteFill} tint={space === 'personal' ? 'dark' : 'light'} />
      {content}
    </Animated.View>
  );
}

interface NormalHeaderProps {
  title: string;
  count: number;
  animatedStyle?: any;
  topRightActions?: ReactNode;
  middleContent?: ReactNode; // e.g. filter chips
  bottomContent?: ReactNode; // e.g. sort, density, select
}

export function GalleryNormalHeader({ title, count, animatedStyle, topRightActions, middleContent, bottomContent }: NormalHeaderProps) {
  const { top: statusBarHeight } = useSafeAreaInsets();
  
  return (
    <Animated.View style={[{ paddingTop: statusBarHeight + 12, paddingBottom: 10, paddingHorizontal: layout.pagePaddingHorizontal, backgroundColor: '#FAFAFA' }, animatedStyle]}>
      {/* Row 1: Title and Actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={{ fontFamily: Platform.OS === 'ios' ? 'PingFang SC' : 'sans-serif', fontSize: 24, fontWeight: 'bold', letterSpacing: -0.5, color: '#111827' }}>
            {title}
          </Text>
          <Text style={{ fontFamily: Platform.OS === 'ios' ? 'PingFang SC' : 'sans-serif', fontSize: 12, fontWeight: '500', color: '#9CA3AF' }}>
            {count} 张素材
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {topRightActions}
        </View>
      </View>

      {/* Row 2: Middle Content (Filters) */}
      {middleContent && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          {middleContent}
        </View>
      )}

      {/* Row 3: Bottom Content (Sort & Density) */}
      {bottomContent && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.06)' }}>
          {bottomContent}
        </View>
      )}
    </Animated.View>
  );
}

export const galleryHeaderStyles = StyleSheet.create({
  filterButton: {
    height: 28,
    width: 28,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  advancedFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
  },
  advancedFilterText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4B5563',
  },
  densityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 2,
  },
  densityIconButton: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  densityIconButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectionModeTextButton: {
    paddingHorizontal: 12,
    height: 28,
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
  },
  selectionModeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  primaryPillButton: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  primaryPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  secondaryPillButton: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  secondaryPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
  },
  dangerPillButton: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dangerPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#DC2626',
  },
});
