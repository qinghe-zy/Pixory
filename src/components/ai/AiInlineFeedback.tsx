import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiInlineFeedbackProps {
  message: string;
  tone?: 'success' | 'error' | 'info';
}

export function AiInlineFeedback({ message, tone = 'info' }: AiInlineFeedbackProps) {
  const icon = tone === 'success' ? 'checkmark-circle-outline' : tone === 'error' ? 'alert-circle-outline' : 'information-circle-outline';
  return (
    <View style={[styles.wrap, tone === 'error' && styles.errorWrap]}>
      <Ionicons color={tone === 'error' ? aiLightColors.primaryActive : aiLightColors.muted} name={icon} size={13} />
      <Text style={[styles.text, tone === 'error' && styles.errorText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 24,
    paddingHorizontal: spacing[2],
  },
  errorWrap: {
    borderColor: aiLightColors.primary,
  },
  text: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    fontWeight: '600',
  },
  errorText: {
    color: aiLightColors.primaryActive,
  },
});
