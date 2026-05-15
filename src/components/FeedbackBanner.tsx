import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, metrics, radius, rhythm, spacing, typography } from '../design/tokens';

export type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

interface FeedbackBannerProps {
  message: string;
  tone?: FeedbackTone;
  title?: string;
}

export function FeedbackBanner({ message, tone = 'info', title }: FeedbackBannerProps) {
  return (
    <View style={[styles.banner, toneStyle(tone)]}>
      <View style={styles.iconWrap}>
        <Ionicons color={iconColor(tone)} name={iconName(tone)} size={metrics.iconSizeMd} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, titleColor(tone)]}>{title ?? titleForTone(tone)}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

function titleForTone(tone: FeedbackTone): string {
  if (tone === 'success') return '操作完成';
  if (tone === 'warning') return '需要留意';
  if (tone === 'error') return '操作失败';
  return '处理中';
}

function iconName(tone: FeedbackTone): keyof typeof Ionicons.glyphMap {
  if (tone === 'success') return 'checkmark-circle';
  if (tone === 'warning') return 'alert-circle';
  if (tone === 'error') return 'close-circle';
  return 'information-circle';
}

function iconColor(tone: FeedbackTone): string {
  if (tone === 'success') return colors.semantic.success;
  if (tone === 'warning') return colors.semantic.warning;
  if (tone === 'error') return colors.semantic.danger;
  return colors.primary.active;
}

function toneStyle(tone: FeedbackTone) {
  if (tone === 'success') return styles.successBanner;
  if (tone === 'warning') return styles.warningBanner;
  if (tone === 'error') return styles.errorBanner;
  return styles.infoBanner;
}

function titleColor(tone: FeedbackTone) {
  if (tone === 'success') return styles.successTitle;
  if (tone === 'warning') return styles.warningTitle;
  if (tone === 'error') return styles.errorTitle;
  return styles.infoTitle;
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'flex-start',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: metrics.bottomActionHeight,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  successBanner: {
    backgroundColor: colors.semantic.successBackground,
    borderColor: colors.semantic.success,
  },
  warningBanner: {
    backgroundColor: colors.semantic.warningBackground,
    borderColor: colors.semantic.warning,
  },
  errorBanner: {
    backgroundColor: colors.semantic.dangerBackground,
    borderColor: colors.semantic.danger,
  },
  infoBanner: {
    backgroundColor: colors.primary.background,
    borderColor: colors.primary.light,
  },
  iconWrap: {
    alignItems: 'center',
    height: metrics.chipHeight,
    justifyContent: 'center',
    width: metrics.chipHeight,
  },
  copy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  title: {
    ...typography.textStyles.bodyStrong,
  },
  successTitle: {
    color: colors.semantic.success,
  },
  warningTitle: {
    color: colors.semantic.warning,
  },
  errorTitle: {
    color: colors.semantic.danger,
  },
  infoTitle: {
    color: colors.primary.active,
  },
  message: {
    ...typography.textStyles.caption,
    color: colors.text.primary,
  },
});
