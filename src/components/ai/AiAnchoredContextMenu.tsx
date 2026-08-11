import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { metrics, radius, shadows, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';
import { resolveAiMessageContextMenuPosition } from './aiMessageContextMenuPosition';

export type AiAnchoredContextMenuAction = {
  disabled?: boolean;
  icon: ComponentProps<typeof Ionicons>['name'];
  key: string;
  label: string;
  onPress: () => void;
  selected?: boolean;
};

export type AiAnchoredContextMenuProps = {
  actions: AiAnchoredContextMenuAction[];
  anchorX: number;
  anchorY: number;
  dismissAccessibilityLabel: string;
  onClose: () => void;
  timeLabel: string;
  visible: boolean;
};

type MenuSize = {
  height: number;
  width: number;
};

export function AiAnchoredContextMenu({
  actions,
  anchorX,
  anchorY,
  dismissAccessibilityLabel,
  onClose,
  timeLabel,
  visible,
}: AiAnchoredContextMenuProps) {
  const insets = useSafeAreaInsets();
  const viewport = useWindowDimensions();
  const [menuSize, setMenuSize] = useState<MenuSize>({ height: 0, width: 0 });

  useEffect(() => {
    if (visible) {
      setMenuSize({ height: 0, width: 0 });
    }
  }, [anchorX, anchorY, visible]);

  const position = useMemo(
    () =>
      resolveAiMessageContextMenuPosition({
        anchorX,
        anchorY,
        bottomInset: insets.bottom,
        horizontalMargin: spacing[2],
        menuHeight: menuSize.height,
        menuWidth: menuSize.width,
        topInset: insets.top,
        viewportHeight: viewport.height,
        viewportWidth: viewport.width,
      }),
    [
      anchorX,
      anchorY,
      insets.bottom,
      insets.top,
      menuSize.height,
      menuSize.width,
      viewport.height,
      viewport.width,
    ],
  );
  const actionListMaxHeight = Math.max(0, position.maxHeight - spacing[8]);

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel={dismissAccessibilityLabel}
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityRole="menu"
          onLayout={(event) => {
            const { height, width } = event.nativeEvent.layout;
            if (height !== menuSize.height || width !== menuSize.width) {
              setMenuSize({ height, width });
            }
          }}
          style={[
            styles.menu,
            {
              left: position.left,
              maxHeight: position.maxHeight,
              opacity: menuSize.height > 0 ? 1 : 0,
              top: position.top,
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={[styles.actionList, { maxHeight: actionListMaxHeight }]}
          >
            {actions.map((action, index) => (
              <Pressable
                accessibilityLabel={action.label}
                accessibilityRole="menuitem"
                accessibilityState={{
                  disabled: Boolean(action.disabled),
                  selected: Boolean(action.selected),
                }}
                disabled={action.disabled}
                key={action.key}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                style={({ pressed }) => [
                  styles.actionRow,
                  index > 0 && styles.divider,
                  action.disabled && styles.disabled,
                  pressed && !action.disabled && styles.pressed,
                ]}
              >
                <Ionicons
                  color={action.selected ? aiLightColors.primaryActive : aiLightColors.ink}
                  name={action.icon}
                  size={metrics.iconSizeMd}
                />
                <Text
                  style={[
                    styles.actionLabel,
                    action.selected && styles.selectedActionLabel,
                  ]}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View accessibilityRole="text" style={[styles.timeRow, styles.divider]}>
            <Text style={styles.timeText}>{timeLabel}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  menu: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    // Context menus need a compact readable column; no shared dimension token models this width.
    minWidth: 190,
    overflow: 'hidden',
    position: 'absolute',
    ...shadows.floating,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[4],
  },
  actionList: {
    flexShrink: 1,
  },
  actionLabel: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    flex: 1,
  },
  selectedActionLabel: {
    color: aiLightColors.primaryActive,
  },
  divider: {
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  timeRow: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: spacing[8],
    paddingHorizontal: spacing[4],
  },
  timeText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
  },
  disabled: {
    opacity: 0.36,
  },
  pressed: {
    backgroundColor: aiLightColors.primarySoft,
  },
});
