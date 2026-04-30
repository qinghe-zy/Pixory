import { Text, type TextProps } from 'react-native';

import { colors, typography } from '../design/tokens';

interface MetaTextProps extends TextProps {
  tone?: 'default' | 'placeholder' | 'link';
}

export function MetaText({ style, tone = 'default', ...props }: MetaTextProps) {
  const toneColor =
    tone === 'placeholder'
      ? colors.text.placeholder
      : tone === 'link'
        ? colors.text.link
        : colors.text.secondary;

  return <Text {...props} style={[typography.textStyles.caption, { color: toneColor }, style]} />;
}
