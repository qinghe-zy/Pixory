import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, componentTokens, spacing, typography } from '../design/tokens';

interface SearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}

export function SearchBar({ value, onChangeText, placeholder }: SearchBarProps) {
  return (
    <View style={styles.container}>
      <Ionicons color={colors.overlay.iconMuted} name="search-outline" size={componentTokens.searchBar.iconSize} />
      <TextInput
        accessibilityLabel={placeholder}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.placeholder}
        selectionColor={colors.primary.default}
        style={styles.input}
        value={value}
      />
      {value ? (
        <Pressable accessibilityLabel="清空搜索内容" hitSlop={8} onPress={() => onChangeText('')}>
          <Ionicons color={colors.text.placeholder} name="close-circle" size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderRadius: componentTokens.searchBar.radius,
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
});
