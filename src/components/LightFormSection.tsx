import { Children, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '../design/tokens';

interface LightFormSectionProps {
  title?: string;
  hint?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function LightFormSection({ title, hint, children, style }: LightFormSectionProps) {
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View style={[styles.section, style]}>
      {title || hint ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
      ) : null}
      <View style={styles.rows}>
        {rows.map((row, index) => (
          <View key={index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    ...shadows.hairline,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  header: {
    gap: spacing[1],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  hint: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  rows: {
    paddingHorizontal: spacing[4],
  },
  divider: {
    backgroundColor: colors.border.divider,
    height: StyleSheet.hairlineWidth,
  },
});
