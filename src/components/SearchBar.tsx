import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, componentTokens, shadows, spacing, typography } from '../design/tokens';

import { LiquidGlassBezel } from './LiquidGlassBezel';
import { MagneticLiquidContainer } from './MagneticLiquidContainer';

interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onPress?: () => void;
  placeholder: string;
  withMagnet?: boolean;
}

export function SearchBar({ value, onChangeText, onFocus, onPress, placeholder, withMagnet = false }: SearchBarProps) {
  const content = (
    <>
      <Ionicons color={colors.overlay.iconMuted} name="search-outline" size={componentTokens.searchBar.iconSize} />
      <TextInput
        accessibilityLabel={placeholder}
        editable={!onPress}
        pointerEvents={onPress ? 'none' : 'auto'}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.text.placeholder}
        selectionColor={colors.primary.default}
        style={styles.input}
        value={value}
      />
      {value && !onPress ? (
        <Pressable accessibilityLabel="清空搜索内容" hitSlop={8} onPress={() => onChangeText('')}>
          <Ionicons color={colors.text.placeholder} name="close-circle" size={16} />
        </Pressable>
      ) : null}
    </>
  );

  const innerStyle = [styles.inner];

  if (onPress) {
    const inner = (
      <Pressable
        accessibilityLabel={placeholder}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.base, pressed && styles.pressed]}
      >
        <BlurView intensity={50} style={styles.blurBg} tint="light">
          <LiquidGlassBezel radius={componentTokens.searchBar.radius} />
          <View style={innerStyle}>
            {content}
          </View>
        </BlurView>
      </Pressable>
    );

    return withMagnet ? (
      <MagneticLiquidContainer magneticStrength={0.35} stretchFactor={0.02} damping={14} style={styles.wrapper}>
        {inner}
      </MagneticLiquidContainer>
    ) : (
      <View style={styles.wrapper}>
        {inner}
      </View>
    );
  }

  const inner = (
    <View style={styles.base}>
      <BlurView intensity={50} style={styles.blurBg} tint="light">
        <View style={innerStyle}>
          {content}
        </View>
        <LiquidGlassBezel radius={componentTokens.searchBar.radius} />
      </BlurView>
    </View>
  );

  return withMagnet ? (
    <MagneticLiquidContainer magneticStrength={0.35} stretchFactor={0.02} damping={14} style={styles.wrapper}>
      {inner}
    </MagneticLiquidContainer>
  ) : (
    <View style={styles.wrapper}>
      {inner}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    ...shadows.sm,
    shadowColor: '#3A2E1D',
    shadowOpacity: 0.05,
    borderRadius: componentTokens.searchBar.radius,
  },
  base: {
    borderRadius: componentTokens.searchBar.radius,
  },
  blurBg: {
    borderRadius: componentTokens.searchBar.radius,
    overflow: 'hidden',
  },
  inner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    height: componentTokens.searchBar.height,
    paddingHorizontal: componentTokens.searchBar.horizontalPadding,
  },
  input: {
    ...typography.textStyles.body,
    color: colors.text.body,
    flex: 1,
    paddingVertical: 0,
    zIndex: 1,
  },
  pressed: {
    opacity: 0.82,
  },
});
