import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';
import { AiMessageContent } from './AiMessageContent';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface AiRoleDetailSectionProps {
  title: string;
  previewLines?: number;
  iconName?: IoniconName;
  variant?: 'body' | 'quote' | 'list';
  footer?: ReactNode;
  rightAction?: ReactNode;
  markdown?: boolean;
  children: ReactNode;
}

export function AiRoleDetailSection({
  title,
  previewLines = 4,
  iconName = 'document-text-outline',
  variant = 'body',
  footer,
  rightAction,
  markdown = false,
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
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerCopy}>
          <View style={styles.iconBubble}>
            <Ionicons color={aiLightColors.primaryActive} name={iconName} size={18} />
          </View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.headerRight}>
          {rightAction}
          <Ionicons color={aiLightColors.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={20} />
        </View>
      </Pressable>
      <View
        style={[
          styles.previewCard,
          variant === 'quote' && styles.quoteContainer,
        ]}
      >
        {typeof children === 'string' ? (
          markdown ? (
            <View style={!expanded && previewLines ? { maxHeight: previewLines * 26, overflow: 'hidden' } : undefined}>
              <AiMessageContent content={children} disableFolding defaultExpanded />
            </View>
          ) : (
            <Text numberOfLines={expanded ? undefined : previewLines} style={bodyStyle}>
              {children}
            </Text>
          )
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
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  iconBubble: {
    alignItems: 'center',
    backgroundColor: aiLightColors.primarySoft,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  title: {
    ...typography.textStyles.sectionTitle,
    color: aiLightColors.ink,
    flex: 1,
  },
  previewCard: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    gap: rhythm.microGap,
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[1],
  },
  previewCardWash: {
    backgroundColor: aiLightColors.cardWash,
  },
  quoteContainer: {
    borderLeftColor: aiLightColors.primaryActive,
    borderLeftWidth: 3,
    paddingLeft: spacing[3],
    paddingVertical: spacing[2],
  },
  body: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    fontSize: 14,
    lineHeight: 24,
  },
  quoteBody: {
    color: aiLightColors.dark,
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 25,
  },
  listBody: {
    color: aiLightColors.ink,
    lineHeight: 24,
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
