import { Text, type TextProps } from 'react-native';

import { typography } from '../design/tokens';

export function StatText({ style, ...props }: TextProps) {
  return <Text {...props} style={[typography.textStyles.statNumber, style]} />;
}
