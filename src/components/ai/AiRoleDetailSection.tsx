import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface AiRoleDetailSectionProps {
  title: string;
  previewLines?: number;
  iconName?: IoniconName;
  variant?: 'body' | 'quote' | 'list';
  footer?: ReactNode;
  children: ReactNode;
}

export function AiRoleDetailSection({
  title,
  previewLines = 4,
  iconName = 'document-text-outline',
  variant = 'body',
  footer,
  children,
}: AiRoleDetailSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const bodyStyle = [
    styles.body,
    variant === 'quote' && styles.quoteBody,
    variant === 'list' && styles.listBody,
  ];

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityState={{ expanded }}
        accessibilityRole="button"
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerCopy}>
          <View style={styles.iconBubble}>
            <Ionicons color={aiLightColors.coralActive} name={iconName} size={18} />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Ionicons color={aiLightColors.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={20} />
      </Pressable>
      <View style={styles.previewCard}>
        {typeof children === 'string' ? (
          <Text numberOfLines={expanded ? undefined : previewLines} style={bodyStyle}>
            {children}
          </Text>
        ) : (
          children
        )}
        {!expanded && footer ? (
          <Pressable
            accessibilityLabel={`展开${title}`}
            accessibilityRole="button"
            onPress={() => setExpanded(true)}
            style={({ pressed }) => [styles.footer, pressed && styles.pressed]}
          >
            <View style={styles.footerContent}>
              {footer}
              <Ionicons color={aiLightColors.muted} name="chevron-forward" size={16} />
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    paddingTop: spacing[4],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  headerCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minWidth: 0,
  },
  iconBubble: {
    alignItems: 'center',
    backgroundColor: aiLightColors.coralSoft,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  title: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
    flex: 1,
  },
  previewCard: {
    backgroundColor: aiLightColors.cardWash,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  body: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    lineHeight: typography.textStyles.body.lineHeight,
  },
  quoteBody: {
    color: aiLightColors.dark,
    fontStyle: 'italic',
  },
  listBody: {
    color: aiLightColors.ink,
  },
  footer: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing[2],
  },
  footerContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
    justifyContent: 'space-between',
  },
  pressed: {
    opacity: 0.78,
  },
});
