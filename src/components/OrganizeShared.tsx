import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { typography } from '../design/tokens';

export type OrganizeMode = 'groups' | 'tags';

export const protoColors = {
  primary: '#000000',
  onPrimary: '#ffffff',
  surface: '#f9f9f9',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f3f3f4',
  surfaceContainer: '#eeeeee',
  surfaceContainerHigh: '#e8e8e8',
  outlineVariant: '#c4c7c7',
  outline: '#747878',
  secondary: '#5e5e5e',
  onSurface: '#1a1c1c',
};

export function OrganizeSegmentedControl({
  mode,
  onSelect,
  rightAction,
  collapsed = false,
}: {
  mode: OrganizeMode;
  onSelect: (mode: OrganizeMode) => void;
  rightAction?: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <View style={[styles.segmentContainer, collapsed && styles.segmentContainerCollapsed]}>
      <View style={styles.segmentGroup}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect('groups')}
          style={[styles.segmentBtn, collapsed && styles.segmentBtnCollapsed, mode === 'groups' && styles.segmentBtnActive]}
        >
          <MaterialIcons name="folder-copy" size={14} color={mode === 'groups' ? protoColors.primary : protoColors.secondary} />
          {!collapsed && <Text style={[styles.segmentText, mode === 'groups' && styles.segmentTextActive]}>分组</Text>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelect('tags')}
          style={[styles.segmentBtn, collapsed && styles.segmentBtnCollapsed, mode === 'tags' && styles.segmentBtnActive]}
        >
          <MaterialIcons name="label" size={14} color={mode === 'tags' ? protoColors.primary : protoColors.secondary} />
          {!collapsed && <Text style={[styles.segmentText, mode === 'tags' && styles.segmentTextActive]}>标签</Text>}
        </Pressable>
      </View>
      {rightAction && !collapsed && (
        <View style={styles.segmentRight}>
          {rightAction}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  segmentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  segmentContainerCollapsed: {
    width: 'auto',
  },
  segmentGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: protoColors.surfaceContainerLow,
    padding: 2,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,199,199,0.25)', // outline-variant/25
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  segmentBtnCollapsed: {
    paddingHorizontal: 8,
  },
  segmentBtnActive: {
    backgroundColor: protoColors.surfaceContainerLowest,
  },
  segmentText: {
    fontFamily: typography.family.base,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    color: protoColors.secondary,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: protoColors.primary,
  },
  segmentRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

