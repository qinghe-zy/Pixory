import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PageBackgroundVariant } from '../design/backgrounds';
import { colors, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { aiLightColors } from './ai/aiLightTheme';
import { PrimaryButton } from './PrimaryButton';

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
  actionLayout?: 'stack' | 'primaryThenSplit' | 'horizontal';
  compactActions?: boolean;
  backgroundVariant?: PageBackgroundVariant;
  accent?: 'default' | 'ai';
  dismissible?: boolean;
  appearance?: 'default' | 'opaqueMonochrome';
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
  actionLayout = 'horizontal',
  compactActions = false,
  accent = 'default',
  dismissible = true,
  appearance = 'default',
}: AppDialogProps) {
  const isOpaqueMonochrome = appearance === 'opaqueMonochrome';
  const splitSecondaryActions = actionLayout === 'primaryThenSplit' && Boolean(tertiaryLabel && onTertiary);
  const primaryTone = accent === 'ai' ? (danger ? 'danger' : 'ai') : (danger ? 'danger' : 'default');
  const secondaryTone = accent === 'ai' ? 'ai' : 'default';

  return (
    <Modal animationType="fade" onRequestClose={dismissible ? onClose : undefined} transparent visible={visible}>
      <View style={styles.overlay}>
        {dismissible ? <Pressable accessibilityLabel="关闭弹窗" onPress={onClose} style={StyleSheet.absoluteFill} /> : null}
        <View style={[styles.panel, accent === 'ai' ? styles.aiPanel : null, isOpaqueMonochrome ? styles.opaqueMonochromePanel : null]}>
          <View style={styles.copy}>
            <Text style={[styles.title, accent === 'ai' ? styles.aiTitle : danger ? styles.dangerTitle : null]}>{title}</Text>
            {message ? <Text style={[styles.message, accent === 'ai' ? styles.aiMessage : null]}>{message}</Text> : null}
          </View>
          {children ? <View style={styles.body}>{children}</View> : null}
          <View style={[styles.actions, compactActions ? styles.compactActions : null, actionLayout === 'horizontal' ? styles.secondaryActionRow : null]}>
            {actionLayout === 'horizontal' ? (
              <>
                {secondaryLabel ? (
                  <View style={styles.secondaryActionItem}>
                    <PrimaryButton compact={compactActions} label={secondaryLabel} onPress={onClose} shape={isOpaqueMonochrome ? 'rectangular' : 'default'} tone={isOpaqueMonochrome ? 'dark' : secondaryTone} variant="outline" />
                  </View>
                ) : null}
                <View style={styles.secondaryActionItem}>
                    <PrimaryButton compact={compactActions} disabled={primaryDisabled} label={primaryLabel} onPress={onPrimary} shape={isOpaqueMonochrome ? 'rectangular' : 'default'} tone={isOpaqueMonochrome ? 'dark' : primaryTone} />
                </View>
              </>
            ) : (
              <>
                <PrimaryButton compact={compactActions} disabled={primaryDisabled} label={primaryLabel} onPress={onPrimary} shape={isOpaqueMonochrome ? 'rectangular' : 'default'} tone={isOpaqueMonochrome ? 'dark' : primaryTone} />
                {splitSecondaryActions ? (
                  <View style={styles.secondaryActionRow}>
                    <View style={styles.secondaryActionItem}>
                      <PrimaryButton compact={compactActions} label={tertiaryLabel ?? ''} onPress={onTertiary ?? onClose} shape={isOpaqueMonochrome ? 'rectangular' : 'default'} tone={isOpaqueMonochrome ? 'dark' : secondaryTone} variant="outline" />
                    </View>
                    <View style={styles.secondaryActionItem}>
                      {secondaryLabel ? <PrimaryButton compact={compactActions} label={secondaryLabel} onPress={onClose} shape={isOpaqueMonochrome ? 'rectangular' : 'default'} tone={isOpaqueMonochrome ? 'dark' : secondaryTone} variant="outline" /> : null}
                    </View>
                  </View>
                ) : (
                  <>
                    {tertiaryLabel && onTertiary ? <PrimaryButton compact={compactActions} label={tertiaryLabel} onPress={onTertiary} shape={isOpaqueMonochrome ? 'rectangular' : 'default'} tone={isOpaqueMonochrome ? 'dark' : secondaryTone} variant="outline" /> : null}
                    {secondaryLabel ? <PrimaryButton compact={compactActions} label={secondaryLabel} onPress={onClose} shape={isOpaqueMonochrome ? 'rectangular' : 'default'} tone={isOpaqueMonochrome ? 'dark' : secondaryTone} variant="ghost" /> : null}
                  </>
                )}
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
    backgroundColor: '#f9f9f9',
    borderColor: colors.border.default,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.entryCardGap,
    maxWidth: 360,
    padding: spacing[5],
    width: '100%',
  },
  aiPanel: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
  },
  opaqueMonochromePanel: {
    backgroundColor: '#f9f9f9',
    borderColor: '#1a1c1c',
    borderRadius: 8,
    shadowOpacity: 0,
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
