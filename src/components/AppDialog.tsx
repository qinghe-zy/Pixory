import type { ReactNode } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { pageBackgroundImages, type PageBackgroundVariant } from '../design/backgrounds';
import { colors, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { aiLightColors } from './ai/aiLightTheme';
import { PrimaryButton } from './PrimaryButton';

const dialogPatternImage = require('../../docs/black.png');

interface AppDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  primaryLabel: string;
  onPrimary: () => void;
  onClose: () => void;
  secondaryLabel?: string | null;
  tertiaryLabel?: string;
  onTertiary?: () => void;
  danger?: boolean;
  children?: ReactNode;
  primaryDisabled?: boolean;
  actionLayout?: 'stack' | 'primaryThenSplit';
  compactActions?: boolean;
  backgroundVariant?: PageBackgroundVariant;
  accent?: 'default' | 'ai';
}

export function AppDialog({
  visible,
  title,
  message,
  primaryLabel,
  onPrimary,
  onClose,
  secondaryLabel = '取消',
  tertiaryLabel,
  onTertiary,
  danger = false,
  children,
  primaryDisabled = false,
  actionLayout = 'stack',
  compactActions = false,
  backgroundVariant,
  accent = 'default',
}: AppDialogProps) {
  const themedBackground = accent === 'ai' || !backgroundVariant ? undefined : pageBackgroundImages[backgroundVariant];
  const splitSecondaryActions = actionLayout === 'primaryThenSplit' && Boolean(tertiaryLabel && onTertiary);
  const primaryTone = accent === 'ai' ? (danger ? 'danger' : 'ai') : 'default';
  const secondaryTone = accent === 'ai' ? 'ai' : 'default';

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="关闭弹窗" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.panel, themedBackground ? styles.themedPanel : null, accent === 'ai' ? styles.aiPanel : null]}>
          {accent === 'ai' ? null : themedBackground ? (
            <Image resizeMode="cover" source={themedBackground.source} style={[styles.patternImage, styles.themedPatternImage]} />
          ) : (
            <Image resizeMode="stretch" source={dialogPatternImage} style={styles.patternImage} />
          )}
          <View style={styles.copy}>
            <Text style={[styles.title, accent === 'ai' ? styles.aiTitle : danger ? styles.dangerTitle : null]}>{title}</Text>
            {message ? <Text style={[styles.message, accent === 'ai' ? styles.aiMessage : null]}>{message}</Text> : null}
          </View>
          {children ? <View style={styles.body}>{children}</View> : null}
          <View style={[styles.actions, compactActions ? styles.compactActions : null]}>
            <PrimaryButton compact={compactActions} disabled={primaryDisabled} label={primaryLabel} onPress={onPrimary} tone={primaryTone} />
            {splitSecondaryActions ? (
              <View style={styles.secondaryActionRow}>
                <View style={styles.secondaryActionItem}>
                  <PrimaryButton compact={compactActions} label={tertiaryLabel ?? ''} onPress={onTertiary ?? onClose} tone={secondaryTone} variant="outline" />
                </View>
                <View style={styles.secondaryActionItem}>
                  {secondaryLabel ? <PrimaryButton compact={compactActions} label={secondaryLabel} onPress={onClose} tone={secondaryTone} variant="outline" /> : null}
                </View>
              </View>
            ) : (
              <>
                {tertiaryLabel && onTertiary ? <PrimaryButton compact={compactActions} label={tertiaryLabel} onPress={onTertiary} tone={secondaryTone} variant="outline" /> : null}
                {secondaryLabel ? <PrimaryButton compact={compactActions} label={secondaryLabel} onPress={onClose} tone={secondaryTone} variant="ghost" /> : null}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(22, 30, 40, 0.36)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing[5],
  },
  panel: {
    ...shadows.floating,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.entryCardGap,
    maxWidth: 360,
    overflow: 'hidden',
    padding: spacing[5],
    width: '100%',
  },
  themedPanel: {
    backgroundColor: colors.background.page,
  },
  aiPanel: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
  },
  patternImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.24,
  },
  themedPatternImage: {
    opacity: 0.28,
  },
  copy: {
    gap: rhythm.cardContentGap,
  },
  title: {
    ...typography.textStyles.navTitle,
    color: colors.text.title,
  },
  dangerTitle: {
    color: colors.semantic.danger,
  },
  aiTitle: {
    color: aiLightColors.ink,
  },
  message: {
    ...typography.textStyles.body,
    color: colors.text.body,
    lineHeight: 22,
  },
  actions: {
    gap: rhythm.cardContentGap,
  },
  aiMessage: {
    color: aiLightColors.mutedReadable,
  },
  compactActions: {
    gap: spacing[2],
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  secondaryActionItem: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    gap: rhythm.listCardGap,
  },
});
