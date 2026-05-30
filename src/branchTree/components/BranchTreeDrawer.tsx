import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiLightButton } from '../../components/ai/AiLightButton';
import { aiLightColors } from '../../components/ai/aiLightTheme';
import { radius, rhythm, spacing, typography } from '../../design/tokens';
import type { BranchTreeSnapshot, BranchTreeSnapshotMessage } from '../engine/types';

interface BranchTreeDrawerProps {
  snapshot: BranchTreeSnapshot | null;
  loading?: boolean;
  onCheckout: () => void;
  onClose: () => void;
}

function BranchTreeBubble({
  message,
  highlighted,
}: {
  message: BranchTreeSnapshotMessage;
  highlighted?: boolean;
}) {
  const isUser = message.role === 'user';
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={[
          styles.bubble,
          isUser && styles.bubbleUser,
          highlighted && styles.bubbleHighlighted,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.bubbleLabel,
            isUser && styles.bubbleLabelUser,
          ]}
        >
          {message.label || (isUser ? '你' : 'AI')}
        </Text>
        <Text numberOfLines={expanded ? undefined : 2} style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
          {message.content || '空消息'}
        </Text>
      </Pressable>
    </View>
  );
}

export function BranchTreeDrawer({
  loading = false,
  onCheckout,
  onClose,
  snapshot,
}: BranchTreeDrawerProps) {
  return (
    <View style={styles.drawer}>
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        <Text numberOfLines={1} style={styles.title}>
          {snapshot ? '当前节点快照' : loading ? '正在读取分支快照' : '选择一个分支节点'}
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
          <Text style={styles.closeText}>收起 ×</Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={aiLightColors.coral} size="small" />
          <Text style={styles.emptyText}>正在读取附近消息</Text>
        </View>
      ) : snapshot ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {snapshot.parentMessages.map((message) => (
            <BranchTreeBubble key={`${message.id}:${message.label}`} message={message} />
          ))}
          <BranchTreeBubble message={snapshot.selectedMessage} highlighted />
          {snapshot.nextMessages.map((message) => (
            <BranchTreeBubble key={`${message.id}:${message.label}`} message={message} />
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.emptyText}>点击画布上的节点查看上下文</Text>
      )}
      <View style={styles.actionRow}>
        <AiLightButton disabled={!snapshot} label="切为此主线" onPress={onCheckout} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    marginTop: spacing[2],
  },
  bubble: {
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '82%',
    padding: spacing[3],
  },
  bubbleLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    marginBottom: spacing[1],
  },
  bubbleLabelUser: {
    color: 'rgba(255,255,255,0.78)',
  },
  bubbleHighlighted: {
    borderColor: '#D07C60',
    borderWidth: 2,
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
    maxHeight: 280,
  },
  contentContainer: {
    gap: rhythm.cardContentGap,
    paddingRight: spacing[1],
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
