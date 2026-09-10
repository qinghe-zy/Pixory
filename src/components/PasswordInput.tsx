import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, spacing, typography } from '../design/tokens';

export function PasswordInput({
  onChangeText,
  onToggleShowPassword,
  placeholder,
  secureTextEntry,
  showPassword,
  value,
}: {
  onChangeText: (value: string) => void;
  onToggleShowPassword: () => void;
  placeholder: string;
  secureTextEntry: boolean;
  showPassword: boolean;
  value: string;
}) {
  return (
    <View style={styles.passwordInputWrap}>
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.placeholder}
        secureTextEntry={secureTextEntry}
        style={styles.passwordInput}
        value={value}
      />
      <Pressable accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'} hitSlop={8} onPress={onToggleShowPassword} style={styles.passwordToggle}>
        <Ionicons color={colors.text.secondary} name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  passwordInputWrap: {
    backgroundColor: colors.background.secondary,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  passwordInput: {
    color: colors.text.primary,
    flex: 1,
    fontSize: typography.size.body,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  passwordToggle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
});
