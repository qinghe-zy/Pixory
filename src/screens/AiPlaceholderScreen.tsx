import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiAction {
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

interface AiPlaceholderScreenProps {
  title: string;
  subtitle?: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  space: PixorySpace;
  onBack: () => void;
  actions?: AiAction[];
  children?: ReactNode;
}

export function AiPlaceholderScreen({ title, subtitle, description, icon, space, onBack, actions = [], children }: AiPlaceholderScreenProps) {
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      onBack={onBack}
      scrollable
      subtitle={subtitle ?? `${spaceLabel} · 本地资料优先`}
      title={title}
    >
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons color={colors.primary.active} name={icon} size={24} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
        <Text style={styles.meta}>资料与会话只写入当前空间，API key 使用系统安全存储。</Text>
      </View>

      {children ? <View style={styles.section}>{children}</View> : null}

      {actions.length ? (
        <View style={styles.actionList}>
          {actions.map((action) => (
            <Pressable
              accessibilityRole="button"
              key={action.label}
              onPress={action.onPress}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <View style={styles.actionIcon}>
                <Ionicons color={colors.primary.active} name={action.icon} size={18} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={styles.actionLabel}>{action.label}</Text>
                <Text style={styles.actionDescription}>{action.description}</Text>
              </View>
              <Ionicons color={colors.text.tertiary} name="chevron-forward" size={18} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[4],
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  copy: {
    gap: rhythm.microGap,
  },
  title: {
    ...typography.textStyles.sectionTitle,
  },
  description: {
    ...typography.textStyles.body,
    color: colors.text.secondary,
  },
  meta: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
  },
  section: {
    gap: rhythm.listCardGap,
  },
  actionList: {
    gap: rhythm.listCardGap,
  },
  action: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 74,
    padding: spacing[3],
  },
  pressed: {
    opacity: 0.78,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  actionCopy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  actionLabel: {
    ...typography.textStyles.bodyStrong,
  },
  actionDescription: {
    ...typography.textStyles.caption,
  },
});
