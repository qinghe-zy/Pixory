import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, componentTokens, shadows, spacing, typography } from '../design/tokens';

interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  onPress?: () => void;
  placeholder: string;
}

export function SearchBar({ value, onChangeText, onPress, placeholder }: SearchBarProps) {
  const content = (
    <>
      <Ionicons color={colors.overlay.iconMuted} name="search-outline" size={componentTokens.searchBar.iconSize} />
      <TextInput
        accessibilityLabel={placeholder}
        editable={!onPress}
        onChangeText={onChangeText}
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

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={placeholder}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...shadows.xs,
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderColor: colors.border.default,
    borderRadius: componentTokens.searchBar.radius,
    borderWidth: StyleSheet.hairlineWidth,
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
  },
  pressed: {
    opacity: 0.82,
  },
});
