import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ImThreadListItem } from '../../types';
import { SecureImage } from '../../../components/SecureImage';
import { colors } from '../../../design/tokens/colors';
import { spacing } from '../../../design/tokens/spacing';
import { radius } from '../../../design/tokens/radius';
import { formatWeChatTime } from '../../utils/formatWeChatTime';
import { ImThreadContextMenu } from './ImThreadContextMenu';

export interface ImFoldedThreadsModalProps {
  visible: boolean;
  foldedThreads: ImThreadListItem[];
  onClose: () => void;
  onOpenImChat: (thread: ImThreadListItem) => void;
  onLongPressThread?: (thread: ImThreadListItem, coords: { pageX: number; pageY: number }) => void;
  onTogglePin?: (thread: ImThreadListItem) => void;
  onToggleFold?: (thread: ImThreadListItem) => void;
  onHideFromList?: (thread: ImThreadListItem) => void;
  onClearHistory?: (thread: ImThreadListItem) => void;
}

export const ImFoldedThreadsModal = React.memo(function ImFoldedThreadsModal({
  visible,
  foldedThreads,
  onClose,
  onOpenImChat,
  onLongPressThread,
  onTogglePin,
  onToggleFold,
  onHideFromList,
  onClearHistory,
}: ImFoldedThreadsModalProps) {
  const insets = useSafeAreaInsets();
  const [internalMenuState, setInternalMenuState] = useState<{
    thread: ImThreadListItem;
    anchorX: number;
    anchorY: number;
  } | null>(null);

  const renderItem = useCallback(
    ({ item }: { item: ImThreadListItem }) => {
      return (
        <Pressable
          accessibilityLabel={item.title}
          accessibilityRole="button"
          onLongPress={(e) => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            const coords = {
              pageX: e.nativeEvent.pageX,
              pageY: e.nativeEvent.pageY,
            };
            onLongPressThread?.(item, coords);
            setInternalMenuState({ thread: item, anchorX: coords.pageX, anchorY: coords.pageY });
          }}
          onPress={() => {
            onClose();
            onOpenImChat(item);
          }}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.avatarWrap}>
            {item.avatarUri ? (
              <SecureImage
                space={item.space}
                style={styles.avatarImage}
                uri={item.avatarUri}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarLetter}>{item.title.slice(0, 1)}</Text>
              </View>
            )}
          </View>
          <View style={styles.contentWrap}>
            <View style={styles.topLine}>
              <Text numberOfLines={1} style={styles.titleText}>
                {item.title}
              </Text>
              {item.lastMessageAt ? (
                <Text style={styles.timeText}>
                  {formatWeChatTime(item.lastMessageAt)}
                </Text>
              ) : null}
            </View>
            <Text numberOfLines={1} style={styles.previewText}>
              {item.lastMessagePreview || '暂无消息'}
            </Text>
          </View>
        </Pressable>
      );
    },
    [onClose, onLongPressThread, onOpenImChat]
  );

  return (
    <Modal
      animationType="slide"
      hardwareAccelerated
      onRequestClose={onClose}
      statusBarTranslucent
      visible={visible}
    >
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* 顶部标题栏 */}
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="返回"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={onClose}
            style={styles.backBtn}
          >
            <Ionicons color={colors.text.primary} name="chevron-back" size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>折叠的会话</Text>
          <View style={styles.placeholder} />
        </View>

        <FlatList
          contentContainerStyle={styles.listContent}
          data={foldedThreads}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons color={colors.text.tertiary} name="folder-open-outline" size={48} />
              <Text style={styles.emptyText}>暂无折叠的会话</Text>
              <Text style={styles.emptySubtext}>在主列表长按会话可将其收入此处</Text>
            </View>
          }
          renderItem={renderItem}
        />

        {/* Modal 内部专属操作菜单：确保在当前 Window 最顶层无感呼出 */}
        <ImThreadContextMenu
          anchorX={internalMenuState?.anchorX ?? 0}
          anchorY={internalMenuState?.anchorY ?? 0}
          onClearHistory={(t) => {
            onClearHistory?.(t);
            setInternalMenuState(null);
          }}
          onClose={() => setInternalMenuState(null)}
          onHideFromList={(t) => {
            onHideFromList?.(t);
            setInternalMenuState(null);
          }}
          onToggleFold={(t) => {
            onToggleFold?.(t);
            setInternalMenuState(null);
          }}
          onTogglePin={(t) => {
            onTogglePin?.(t);
            setInternalMenuState(null);
          }}
          thread={internalMenuState?.thread ?? null}
          visible={Boolean(internalMenuState)}
        />
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.page,
  },
  header: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    backgroundColor: colors.background.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.default,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
  },
  placeholder: {
    width: 36,
  },
  listContent: {
    paddingVertical: spacing[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.background.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.default,
  },
  rowPressed: {
    backgroundColor: colors.background.soft,
  },
  contentWrap: {
    flex: 1,
    marginLeft: spacing[3],
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  timeText: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginLeft: spacing[2],
  },
  previewText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: spacing[2],
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.text.tertiary,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.background.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
});
