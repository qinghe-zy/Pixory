import React from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import type { ImThreadListItem } from '../../types';
import { colors } from '../../../design/tokens/colors';
import { spacing } from '../../../design/tokens/spacing';
import { radius } from '../../../design/tokens/radius';

export interface ImThreadActionSheetProps {
  visible: boolean;
  thread: ImThreadListItem | null;
  onClose: () => void;
  onTogglePin?: (thread: ImThreadListItem) => void;
  onToggleFold?: (thread: ImThreadListItem) => void;
  onHideFromList?: (thread: ImThreadListItem) => void;
  onClearHistory?: (thread: ImThreadListItem) => void;
}

export const ImThreadActionSheet = React.memo(function ImThreadActionSheet({
  visible,
  thread,
  onClose,
  onTogglePin,
  onToggleFold,
  onHideFromList,
  onClearHistory,
}: ImThreadActionSheetProps) {
  const insets = useSafeAreaInsets();
  if (!thread) return null;

  const isPinned = Boolean(thread.isPinned);
  const isFolded = Boolean(thread.isFolded);

  const handleTogglePin = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
    onTogglePin?.(thread);
  };

  const handleToggleFold = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
    onToggleFold?.(thread);
  };

  const handleHideFromList = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onClose();
    onHideFromList?.(thread);
  };

  const handleClearHistory = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    onClose();
    Alert.alert(
      '彻底清空聊天记录',
      `确定要彻底清空与「${thread.title}」的全部消息记录吗？此操作不可撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '彻底清空',
          style: 'destructive',
          onPress: () => onClearHistory?.(thread),
        },
      ]
    );
  };

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.sheetContainer,
            { paddingBottom: Math.max(spacing[6], insets.bottom + spacing[3]) },
          ]}
        >
          <View style={styles.headerIndicator} />
          <View style={styles.titleWrap}>
            <Text numberOfLines={1} style={styles.sheetTitle}>{thread.title}</Text>
            <Text style={styles.sheetSubtitle}>会话管理</Text>
          </View>

          <View style={styles.actionList}>
            {/* 置顶 / 取消置顶 */}
            <Pressable
              accessibilityLabel={isPinned ? '取消置顶' : '置顶会话'}
              accessibilityRole="button"
              onPress={handleTogglePin}
              style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
            >
              <View style={[styles.iconBox, { backgroundColor: isPinned ? 'rgba(99, 102, 241, 0.12)' : colors.background.soft }]}>
                <Ionicons
                  color={isPinned ? colors.primary.default : colors.text.primary}
                  name={isPinned ? 'pin' : 'pin-outline'}
                  size={19}
                />
              </View>
              <Text style={styles.actionText}>{isPinned ? '取消置顶' : '置顶会话'}</Text>
            </Pressable>

            {/* 折叠 / 移出折叠 */}
            <Pressable
              accessibilityLabel={isFolded ? '移出折叠会话' : '折叠该会话'}
              accessibilityRole="button"
              onPress={handleToggleFold}
              style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
            >
              <View style={[styles.iconBox, { backgroundColor: isFolded ? 'rgba(234, 179, 8, 0.12)' : colors.background.soft }]}>
                <Ionicons
                  color={isFolded ? '#EAB308' : colors.text.primary}
                  name={isFolded ? 'folder-open-outline' : 'folder-outline'}
                  size={19}
                />
              </View>
              <Text style={styles.actionText}>{isFolded ? '移出折叠会话' : '折叠该会话'}</Text>
            </Pressable>

            {/* 从列表删除 */}
            <Pressable
              accessibilityLabel="从列表删除"
              accessibilityRole="button"
              onPress={handleHideFromList}
              style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
            >
              <View style={[styles.iconBox, { backgroundColor: colors.background.soft }]}>
                <Ionicons
                  color={colors.text.secondary}
                  name="eye-off-outline"
                  size={19}
                />
              </View>
              <View style={styles.actionTextWrap}>
                <Text style={styles.actionText}>从列表删除</Text>
                <Text style={styles.actionSubtext}>不丢失聊天记录，再次发消息时恢复</Text>
              </View>
            </Pressable>

            <View style={styles.divider} />

            {/* 彻底清空聊天记录 */}
            <Pressable
              accessibilityLabel="彻底删除聊天信息"
              accessibilityRole="button"
              onPress={handleClearHistory}
              style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
            >
              <View style={[styles.iconBox, { backgroundColor: colors.semantic.dangerBackground }]}>
                <Ionicons
                  color={colors.semantic.danger}
                  name="trash-outline"
                  size={19}
                />
              </View>
              <View style={styles.actionTextWrap}>
                <Text style={[styles.actionText, { color: colors.semantic.danger }]}>彻底删除聊天信息</Text>
                <Text style={styles.actionSubtext}>物理清空历史消息，不可恢复</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.background.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 16,
  },
  headerIndicator: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border.default,
    alignSelf: 'center',
    marginBottom: spacing[3],
  },
  titleWrap: {
    marginBottom: spacing[3],
    paddingHorizontal: spacing[2],
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  actionList: {
    gap: spacing[1],
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
    borderRadius: radius.lg,
  },
  actionItemPressed: {
    backgroundColor: colors.background.soft,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  actionTextWrap: {
    flex: 1,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  actionSubtext: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.default,
    marginVertical: spacing[2],
  },
});
