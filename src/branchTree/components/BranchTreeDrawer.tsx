import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AiLightButton } from '../../components/ai/AiLightButton';
import { aiLightColors } from '../../components/ai/aiLightTheme';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import type { BranchTreeSnapshot, BranchTreeSnapshotMessage } from '../engine/types';

interface BranchTreeDrawerProps {
  snapshot: BranchTreeSnapshot | null;
  loading?: boolean;
  onCheckout: () => void;
  onClose: () => void;
  onDerive: () => void;
  onRequestPrune: () => void;
  onSelectChildMessage: (messageId: string) => void;
}

function BranchTreeBubble({
  emphasis,
  message,
  muted,
}: {
  emphasis?: boolean;
  message: BranchTreeSnapshotMessage;
  muted?: boolean;
}) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View style={[styles.bubble, muted && styles.bubbleMuted, isUser && styles.bubbleUser, emphasis && styles.bubbleEmphasis]}>
        <Text numberOfLines={1} style={[styles.bubbleLabel, isUser && styles.bubbleLabelUser]}>
          {message.label || (isUser ? '你' : 'AI')}
        </Text>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{message.content || '空消息'}</Text>
      </View>
    </View>
  );
}

export function BranchTreeDrawer({
  loading = false,
  onCheckout,
  onClose,
  onDerive,
  onRequestPrune,
  onSelectChildMessage,
  snapshot,
}: BranchTreeDrawerProps) {
  return (
    <View style={styles.drawer}>
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        <Text numberOfLines={1} style={styles.title}>
          {snapshot ? '当前节点分支快照' : loading ? '正在读取分支快照' : '选择一个分支节点'}
        </Text>
        {snapshot ? (
          <Text style={styles.versionLabel}>
            v{snapshot.node.versionIndex}/{snapshot.node.versionTotal}
          </Text>
        ) : null}
        <Pressable
          accessibilityLabel="收起分支快照"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>收起</Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={aiLightColors.coral} size="small" />
          <Text style={styles.emptyText}>正在读取附近消息</Text>
        </View>
      ) : snapshot ? (
        <View style={styles.content}>
          {snapshot.parentMessages.map((message) => (
            <BranchTreeBubble key={`${message.id}:${message.label}`} message={message} muted />
          ))}
          <BranchTreeBubble emphasis message={snapshot.selectedMessage} />
          {snapshot.childMessages.map((message) => (
            <Pressable
              accessibilityLabel={`查看分支选项${message.label}`}
              accessibilityRole="button"
              key={`${message.id}:${message.label}`}
              onPress={() => onSelectChildMessage(message.id)}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <BranchTreeBubble message={{ ...message, label: message.label || '分支选项' }} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>点击画布上的节点查看上下文</Text>
      )}
      <View style={styles.actionRow}>
        <View style={styles.primaryAction}>
          <AiLightButton disabled={!snapshot} label="基于此衍生新分支" onPress={onDerive} />
        </View>
        <View style={styles.secondaryAction}>
          <AiLightButton disabled={!snapshot} label="切为此主线" onPress={onCheckout} variant="outline" />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={!snapshot}
        onPress={onRequestPrune}
        style={({ pressed }) => [styles.pruneAction, pressed && styles.pressed, !snapshot && styles.disabled]}
      >
        <Text style={styles.pruneText}>剪除此后代</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  bubble: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '82%',
    padding: spacing[3],
  },
  bubbleEmphasis: {
    borderColor: '#D07C60',
    borderWidth: 1,
  },
  bubbleLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  bubbleLabelUser: {
    color: 'rgba(255,255,255,0.78)',
  },
  bubbleMuted: {
    backgroundColor: '#F0EAE0',
  },
  bubbleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleText: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
  },
  bubbleTextUser: {
    color: aiLightColors.onDark,
  },
  bubbleUser: {
    backgroundColor: '#D07C60',
    borderColor: '#D07C60',
  },
  content: {
    gap: rhythm.cardContentGap,
    maxHeight: 280,
  },
  closeButton: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  closeText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  disabled: {
    opacity: 0.36,
  },
  drawer: {
    backgroundColor: aiLightColors.cardWash,
    borderTopColor: aiLightColors.hairline,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    gap: rhythm.cardContentGap,
    left: 0,
    padding: spacing[4],
    position: 'absolute',
    right: 0,
  },
  emptyText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    height: 4,
    width: spacing[10],
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    justifyContent: 'space-between',
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  pressed: {
    opacity: 0.76,
  },
  primaryAction: {
    flex: 1,
  },
  pruneAction: {
    alignSelf: 'flex-start',
    paddingVertical: spacing[1],
  },
  pruneText: {
    ...typography.textStyles.caption,
    color: '#B75348',
  },
  secondaryAction: {
    flex: 0.74,
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    flex: 1,
  },
  versionLabel: {
    color: aiLightColors.muted,
    fontFamily: typography.family.mono,
    fontSize: 11,
  },
});
