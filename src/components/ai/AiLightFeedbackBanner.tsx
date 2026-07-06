import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { metrics, radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

export type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

interface AiLightFeedbackBannerProps {
  message: string;
  tone?: FeedbackTone;
  title?: string;
}

export function AiLightFeedbackBanner({ message, tone = 'info', title }: AiLightFeedbackBannerProps) {
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
  if (tone === 'success') return aiLightColors.primary;
  if (tone === 'warning') return aiLightColors.primaryActive;
  if (tone === 'error') return aiLightColors.primaryActive;
  return aiLightColors.muted;
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
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.primary,
  },
  warningBanner: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.primaryActive,
  },
  errorBanner: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.primaryActive,
  },
  infoBanner: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
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
    color: aiLightColors.primary,
  },
  warningTitle: {
    color: aiLightColors.primaryActive,
  },
  errorTitle: {
    color: aiLightColors.primaryActive,
  },
  infoTitle: {
    color: aiLightColors.muted,
  },
  message: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
  },
});
