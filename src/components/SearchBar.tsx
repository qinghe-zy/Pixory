import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, componentTokens, shadows, spacing, typography } from '../design/tokens';

import { LiquidGlassBezel } from './LiquidGlassBezel';

interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  onPress?: () => void;
  placeholder: string;
}

export function SearchBar({ value, onChangeText, onFocus, onPress, placeholder }: SearchBarProps) {
  const content = (
    <>
      <Ionicons color={colors.overlay.iconMuted} name="search-outline" size={componentTokens.searchBar.iconSize} />
      <TextInput
        accessibilityLabel={placeholder}
        editable={!onPress}
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
    return (
      <Pressable
        accessibilityLabel={placeholder}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
      >
        <BlurView intensity={50} style={styles.blur} tint="light">
          <LiquidGlassBezel radius={componentTokens.searchBar.radius} />
          <View style={innerStyle}>
            {content}
          </View>
        </BlurView>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrapper}>
      <BlurView intensity={50} style={styles.blur} tint="light">
        <View style={innerStyle}>
          {content}
        </View>
        <LiquidGlassBezel radius={componentTokens.searchBar.radius} />
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    ...shadows.sm,
    shadowColor: '#3A2E1D',
    shadowOpacity: 0.15,
    borderRadius: componentTokens.searchBar.radius,
  },
  blur: {
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
