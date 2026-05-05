import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, radius, shadows, spacing, typography } from '../design/tokens';

export interface AppActionSheetItem {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  meta?: string;
  danger?: boolean;
  disabled?: boolean;
  selected?: boolean;
  onPress: () => void;
}

interface AppActionSheetProps {
  visible: boolean;
  title: string;
  message?: string;
  items: AppActionSheetItem[];
  onClose: () => void;
  closeOnSelect?: boolean;
  cancelLabel?: string;
}

export function AppActionSheet({ visible, title, message, items, onClose, closeOnSelect = true, cancelLabel = '取消' }: AppActionSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="关闭操作面板" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing[3] }]}>
          <View style={styles.handle} />
          <View style={styles.copy}>
            <Text numberOfLines={2} style={styles.title}>{title}</Text>
            {message ? <Text numberOfLines={3} style={styles.message}>{message}</Text> : null}
          </View>
          <View style={styles.list}>
            {items.map((item) => (
              <Pressable
                accessibilityRole="button"
                disabled={item.disabled}
                key={item.key}
                onPress={() => {
                  if (closeOnSelect) {
                    onClose();
                  }
                  item.onPress();
                }}
                style={({ pressed }) => [
                  styles.row,
                  item.disabled ? styles.disabled : null,
                  pressed && !item.disabled ? styles.pressed : null,
                ]}
              >
                {item.icon ? (
                  <View style={[styles.iconWrap, item.danger ? styles.dangerIconWrap : null]}>
                    <Ionicons
                      color={item.danger ? colors.semantic.danger : colors.primary.default}
                      name={item.icon}
                      size={18}
                    />
                  </View>
                ) : null}
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={[styles.rowLabel, item.danger ? styles.dangerText : null]}>{item.label}</Text>
                  {item.meta ? <Text numberOfLines={1} style={styles.rowMeta}>{item.meta}</Text> : null}
                </View>
                <Ionicons
                  color={!closeOnSelect && item.selected ? colors.primary.default : colors.text.tertiary}
                  name={closeOnSelect ? 'chevron-forward' : item.selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={15}
                />
              </Pressable>
            ))}
          </View>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(22, 30, 40, 0.32)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    ...shadows.floating,
    backgroundColor: colors.background.page,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    gap: spacing[3],
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[2],
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border.strong,
    borderRadius: radius.pill,
    height: 4,
    width: 38,
  },
  copy: {
    gap: spacing[1],
    paddingTop: spacing[1],
  },
  title: {
    ...typography.textStyles.navTitle,
    color: colors.text.title,
  },
  message: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  list: {
    gap: spacing[1],
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 54,
    paddingHorizontal: spacing[3],
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  dangerIconWrap: {
    backgroundColor: colors.semantic.dangerBackground,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowLabel: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  rowMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  dangerText: {
    color: colors.semantic.danger,
  },
  cancel: {
    alignItems: 'center',
    minHeight: 42,
    justifyContent: 'center',
  },
  cancelText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.78,
  },
});
