import { Ionicons } from '@expo/vector-icons';
import type { TextInputProps } from 'react-native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiLightInputRowProps extends Omit<TextInputProps, 'multiline'> {
  label: string;
  hint?: string;
  errorMessage?: string | null;
}

export function AiLightInputRow({
  label,
  hint,
  errorMessage,
  style,
  ...inputProps
}: AiLightInputRowProps) {
  return (
    <View style={styles.row}>
      <FieldCopy hint={hint} label={label} />
      <TextInput
        placeholderTextColor={aiLightColors.mutedSoft}
        selectionColor={aiLightColors.coral}
        style={[styles.input, errorMessage ? styles.errorInput : null, style]}
        {...inputProps}
      />
    </View>
  );
}

interface AiLightTextareaRowProps extends Omit<TextInputProps, 'multiline'> {
  label: string;
  hint?: string;
  minHeight?: number;
  errorMessage?: string | null;
}

export function AiLightTextareaRow({
  label,
  hint,
  minHeight = 88,
  errorMessage,
  style,
  ...inputProps
}: AiLightTextareaRowProps) {
  return (
    <View style={styles.row}>
      <FieldCopy hint={hint} label={label} />
      <TextInput
        multiline
        placeholderTextColor={aiLightColors.mutedSoft}
        selectionColor={aiLightColors.coral}
        style={[styles.input, styles.textarea, { minHeight }, errorMessage ? styles.errorInput : null, style]}
        textAlignVertical="top"
        {...inputProps}
      />
    </View>
  );
}

interface AiLightSearchBarProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}

export function AiLightSearchBar({ value, onChangeText, placeholder }: AiLightSearchBarProps) {
  return (
    <View style={styles.searchBox}>
      <Ionicons color={aiLightColors.mutedSoft} name="search-outline" size={18} />
      <TextInput
        accessibilityLabel={placeholder}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={aiLightColors.mutedSoft}
        selectionColor={aiLightColors.coral}
        style={styles.searchInput}
        value={value}
      />
      {value ? (
        <Pressable accessibilityLabel="清空搜索内容" hitSlop={spacing[2]} onPress={() => onChangeText('')} style={({ pressed }) => pressed && styles.pressed}>
          <Ionicons color={aiLightColors.mutedSoft} name="close-circle" size={16} />
        </Pressable>
      ) : null}
    </View>
  );
}

function FieldCopy({ hint, label }: { hint?: string; label: string }) {
  return (
    <View style={styles.copy}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text numberOfLines={2} style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: rhythm.fieldContentGap,
    paddingVertical: spacing[3],
  },
  copy: {
    gap: rhythm.microGap,
    minWidth: 0,
  },
  label: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
  },
  hint: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minHeight: 40,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  textarea: {
    paddingVertical: spacing[3],
  },
  errorInput: {
    borderColor: aiLightColors.coralActive,
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  searchInput: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    flex: 1,
    paddingVertical: 0,
  },
  pressed: {
    opacity: 0.72,
  },
});
