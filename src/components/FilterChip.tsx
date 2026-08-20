import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { colors, componentTokens, shadows, spacing, typography } from '../design/tokens';
import { LiquidGlassBezel } from './LiquidGlassBezel';
import { MagneticLiquidContainer } from './MagneticLiquidContainer';

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  dense?: boolean;
  withMagnet?: boolean;
}

export function FilterChip({ label, active, onPress, dense = false, withMagnet = false }: FilterChipProps) {
  const inner = (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        dense ? styles.dense : null,
        pressed && styles.pressed,
      ]}
    >
      <BlurView intensity={50} style={styles.blur} tint="light">
        <LiquidGlassBezel active={false} radius={componentTokens.filterChip.radius} />
        {active ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.activeTint]} />
        ) : null}
        <View style={[styles.inner, dense ? styles.denseInner : null]}>
          <Text
            numberOfLines={1}
            style={[
              styles.text,
              dense ? styles.denseText : null,
              active ? styles.activeText : styles.inactiveText,
            ]}
          >
            {label}
          </Text>
        </View>
      </BlurView>
    </Pressable>
  );

  return withMagnet ? (
    <MagneticLiquidContainer 
      magneticStrength={0.4} 
      stretchFactor={0.03} 
      damping={12}
      style={[styles.wrapper, active && styles.wrapperActive]}
    >
      {inner}
    </MagneticLiquidContainer>
  ) : (
    <View style={[styles.wrapper, active && styles.wrapperActive]}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    ...shadows.sm,
    shadowColor: '#3A2E1D',
    shadowOpacity: 0.05,
    borderRadius: componentTokens.filterChip.radius,
  },
  wrapperActive: {
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
  activeTint: {
    backgroundColor: 'rgba(86, 107, 72, 0.28)',
    borderRadius: componentTokens.filterChip.radius,
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
    color: colors.primary.dark,
  },
  inactiveText: {
    color: colors.text.title,
  },
});
