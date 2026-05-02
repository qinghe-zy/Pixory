import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, typography } from '../design/tokens';

interface TagChipProps {
  label: string;
  removable?: boolean;
  onRemove?: () => void;
}

export function TagChip({ label, removable = false, onRemove }: TagChipProps) {
  return (
    <View style={styles.chip}>
      <Text style={styles.label}>{label}</Text>
      {removable && onRemove ? (
        <Pressable hitSlop={8} onPress={onRemove} style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
          <Ionicons color={colors.primary.default} name="close" size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    minHeight: 30,
    paddingVertical: spacing[1],
  },
  label: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '500',
  },
  remove: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
