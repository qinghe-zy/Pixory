import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { colors, componentTokens, shadows, spacing, typography } from '../design/tokens';
import { LiquidGlassBezel } from './LiquidGlassBezel';

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  dense?: boolean;
}

export function FilterChip({ label, active, onPress, dense = false }: FilterChipProps) {
  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.base,
          dense ? styles.dense : null,
          pressed && styles.pressed,
        ]}
      >
        <BlurView intensity={active ? 80 : 50} style={styles.blur} tint={active ? 'default' : 'light'}>
          <LiquidGlassBezel active={active} contentIntensity={active ? 'heavy' : 'none'} radius={componentTokens.filterChip.radius} />
          <View style={[styles.inner, active ? styles.activeInner : styles.inactiveInner, dense ? styles.denseInner : null]}>
            <Text numberOfLines={1} style={[styles.text, dense ? styles.denseText : null, active ? styles.activeText : styles.inactiveText]}>{label}</Text>
          </View>
        </BlurView>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    ...shadows.sm,
    shadowColor: '#3A2E1D',
    shadowOpacity: 0.1,
    borderRadius: componentTokens.filterChip.radius,
  },
  base: {
    borderRadius: componentTokens.filterChip.radius,
    height: componentTokens.filterChip.height,
  },
  dense: {
    height: 28,
  },
  blur: {
    borderRadius: componentTokens.filterChip.radius,
    overflow: 'hidden',
    height: '100%',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: componentTokens.filterChip.horizontalPadding,
    height: '100%',
  },
  denseInner: {
    paddingHorizontal: spacing[2],
  },
  activeInner: {
    backgroundColor: 'rgba(86, 107, 72, 0.65)', // Using primary.default rgb directly to tint glass
  },
  inactiveInner: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  pressed: {
    opacity: 0.78,
  },
  text: {
    ...typography.textStyles.caption,
    fontWeight: '600',
    lineHeight: 18,
    maxWidth: 180,
    zIndex: 1,
  },
  denseText: {
    ...typography.textStyles.micro,
    lineHeight: 16,
    maxWidth: 148,
  },
  activeText: {
    color: '#FFFFFF', // pure white on active primary glass
  },
  inactiveText: {
    color: colors.text.title,
  },
});
