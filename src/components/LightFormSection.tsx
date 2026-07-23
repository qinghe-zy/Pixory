import { Children, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, rhythm, shadows, spacing, typography } from '../design/tokens';

interface LightFormSectionProps {
  title?: string;
  hint?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  headerRight?: ReactNode;
}

export function LightFormSection({ title, hint, children, style, headerRight }: LightFormSectionProps) {
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View style={[styles.section, style]}>
      {title || hint || headerRight ? (
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}
          </View>
          {headerRight}
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
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  headerCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
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
