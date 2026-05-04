import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../design/tokens';
import { PrimaryButton } from './PrimaryButton';

interface AppDialogProps {
  visible: boolean;
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  onClose: () => void;
  secondaryLabel?: string;
  danger?: boolean;
}

export function AppDialog({
  visible,
  title,
  message,
  primaryLabel,
  onPrimary,
  onClose,
  secondaryLabel = '取消',
  danger = false,
}: AppDialogProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="关闭弹窗" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={styles.panel}>
          <View style={styles.copy}>
            <Text style={[styles.title, danger ? styles.dangerTitle : null]}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
          </View>
          <View style={styles.actions}>
            <PrimaryButton label={primaryLabel} onPress={onPrimary} />
            <PrimaryButton label={secondaryLabel} onPress={onClose} variant="ghost" />
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
    gap: spacing[5],
    maxWidth: 360,
    padding: spacing[5],
    width: '100%',
  },
  copy: {
    gap: spacing[2],
  },
  title: {
    ...typography.textStyles.navTitle,
    color: colors.text.title,
  },
  dangerTitle: {
    color: colors.semantic.danger,
  },
  message: {
    ...typography.textStyles.body,
    color: colors.text.body,
    lineHeight: 22,
  },
  actions: {
    gap: spacing[2],
  },
});
