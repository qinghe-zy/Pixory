import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, radius, rhythm, shadows, spacing, typography } from '../design/tokens';

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
  headerBadge?: string;
  items: AppActionSheetItem[];
  onClose: () => void;
  closeOnSelect?: boolean;
  cancelLabel?: string;
}

export function AppActionSheet({ visible, title, message, headerBadge, items, onClose, closeOnSelect = true, cancelLabel = '取消' }: AppActionSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="关闭操作面板" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[3]) + spacing[3] }]}>
          <View style={styles.handle} />
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text numberOfLines={2} style={styles.title}>{title}</Text>
              {headerBadge ? (
                <View style={styles.badgeWrap}>
                  <Text style={styles.badgeText}>{headerBadge}</Text>
                </View>
              ) : null}
            </View>
            {message ? <Text numberOfLines={3} style={styles.message}>{message}</Text> : null}
          </View>
          <View style={styles.list}>
            {items.map((item, index) => (
              <View key={item.key}>
                {item.danger && index > 0 && !items[index - 1].danger && (
                  <View style={styles.divider} />
                )}
                <Pressable
                  accessibilityRole="button"
                  disabled={item.disabled}
                  onPress={() => {
                    if (closeOnSelect) {
                      onClose();
                    }
                    item.onPress();
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    item.danger ? styles.dangerRow : null,
                    item.disabled ? styles.disabled : null,
                    pressed && !item.disabled ? styles.pressed : null,
                  ]}
                >
                  {item.icon ? (
                    <View style={styles.iconWrap}>
                      <Ionicons
                        color={item.danger ? colors.semantic.danger : colors.text.title}
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
                    color={!closeOnSelect && item.selected ? colors.text.title : colors.border.strong}
                    name={closeOnSelect ? 'chevron-forward' : item.selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={15}
                  />
                </Pressable>
              </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    ...shadows.floating,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[3],
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border.strong,
    borderRadius: radius.pill,
    height: 4,
    width: 38,
    marginBottom: spacing[2],
  },
  copy: {
    gap: rhythm.microGap,
    paddingBottom: spacing[3],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.textStyles.title3,
    color: colors.text.title,
    fontWeight: '600',
  },
  badgeWrap: {
    backgroundColor: colors.background.page,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  badgeText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  message: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  list: {
    gap: spacing[2],
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    borderStyle: 'dashed',
    marginVertical: spacing[2],
    marginHorizontal: spacing[1],
  },
  row: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: rhythm.listCardGap,
    minHeight: 54,
    paddingHorizontal: spacing[3],
  },
  dangerRow: {
    backgroundColor: colors.semantic.dangerBackground,
    borderColor: colors.semantic.dangerBackground,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    width: 34,
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
    backgroundColor: colors.background.page,
    borderRadius: radius.md,
    minHeight: 48,
    justifyContent: 'center',
    marginTop: spacing[3],
  },
  cancelText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    fontWeight: '500',
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.78,
  },
});
