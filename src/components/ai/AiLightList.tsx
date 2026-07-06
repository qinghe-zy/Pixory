import { type ReactNode, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type AccessibilityRole, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

import { aiLightColors } from './aiLightTheme';
import { radius, rhythm, spacing, typography } from '../../design/tokens';

export function AiLightListGroup({ children, style, title, footer }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string; footer?: string }) {
  return (
    <View style={[styles.group, style]}>
      {title ? <Text style={styles.groupTitle}>{title}</Text> : null}
      <View style={styles.groupContent}>
        {children}
      </View>
      {footer ? <Text style={styles.groupFooter}>{footer}</Text> : null}
    </View>
  );
}

export function AiLightListItem({
  title,
  subtitle,
  value,
  onPress,
  isLast,
  showChevron = true,
  action,
  icon,
  iconBackgroundColor = aiLightColors.canvas,
  iconColor = aiLightColors.ink,
  destructive,
  multilineValue = false,
  disabled = false,
  accessibilityRole,
  accessibilityState,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  isLast?: boolean;
  showChevron?: boolean;
  action?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  iconBackgroundColor?: string;
  iconColor?: string;
  destructive?: boolean;
  multilineValue?: boolean;
  disabled?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: { checked?: boolean };
  accessibilityLabel?: string;
}) {
  const handlePress = useCallback(() => {
    if (onPress && !disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPress();
    }
  }, [onPress, disabled]);

  const content = (
    <View style={styles.itemRow}>
      {icon ? (
        <View style={[styles.iconWrapper, { backgroundColor: iconBackgroundColor }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      ) : null}
      <View style={[styles.itemContentBorder, isLast && styles.itemContentNoBorder]}>
        <View style={styles.itemTextContent}>
          <Text style={[styles.itemTitle, destructive && styles.itemTitleDestructive]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.itemSubtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.itemRight}>
          {value ? <Text style={styles.itemValue} numberOfLines={multilineValue ? undefined : 1}>{value}</Text> : null}
          {action ? action : null}
          {onPress && showChevron ? (
            <Ionicons name="chevron-forward" size={16} color={aiLightColors.mutedSoft} style={styles.chevron} />
          ) : null}
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityState={accessibilityState}
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.itemPressable,
          pressed && !disabled && styles.itemPressed,
          disabled && styles.disabled,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.itemPressable, disabled && styles.disabled]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: spacing[10],
  },
  groupTitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedSoft,
    textTransform: 'uppercase',
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    letterSpacing: 1.2, // Premium wide letter spacing
    fontSize: 11,
  },
  groupFooter: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedSoft,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    lineHeight: 18,
  },
  groupContent: {
    backgroundColor: aiLightColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: aiLightColors.hairline,
  },
  itemPressable: {
    backgroundColor: aiLightColors.surface,
  },
  itemPressed: {
    backgroundColor: aiLightColors.canvas, // Since canvas is F2F2F7, it acts as a subtle highlight
  },
  disabled: {
    opacity: 0.48,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing[4],
    minHeight: 56, // Increased height for premium feel
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  itemContentBorder: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: aiLightColors.hairline,
  },
  itemContentNoBorder: {
    borderBottomWidth: 0,
  },
  itemTextContent: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: spacing[3],
  },
  itemTitle: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  itemTitleDestructive: {
    color: '#FF3B30', // Apple standard destructive red
  },
  itemSubtitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    marginTop: 2,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing[3],
    maxWidth: '50%',
  },
  itemValue: {
    ...typography.textStyles.body,
    color: aiLightColors.muted,
    marginRight: spacing[1],
  },
  chevron: {
    marginLeft: spacing[1],
    opacity: 0.6,
  },
});
