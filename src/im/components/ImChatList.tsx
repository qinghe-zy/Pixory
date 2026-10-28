import React, { useCallback, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, Keyboard } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import type { ImMessage } from '../types';
import { BubbleRegistry } from '../registry/bubbleRegistry';
import { useImTheme } from '../theme/ImThemeProvider';
import { SecureImage } from '../../components/SecureImage';
import { formatWeChatTime } from '../utils/formatWeChatTime';

export interface ImChatListProps {
  messages: ImMessage[];
  companionAvatarUri?: string | null;
  companionName?: string;
  userAvatarUri?: string | null;
  backgroundImageUri?: string | null;
  highlightedMessageId?: string | null;
  onLongPressMessage?: (message: ImMessage, pageX: number, pageY: number) => void;
  onPressMessage?: (message: ImMessage) => void;
  onNudge?: () => void;
  onOpenDiary?: (diaryId?: string) => void;
}

export function ImChatList({
  messages,
  companionAvatarUri,
  companionName,
  userAvatarUri,
  backgroundImageUri,
  highlightedMessageId,
  onLongPressMessage,
  onPressMessage,
  onNudge,
  onOpenDiary,
}: ImChatListProps) {
  const theme = useImTheme();
  const listRef = useRef<FlashListRef<ImMessage>>(null);

  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      listRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (highlightedMessageId && messages.length > 0) {
      const idx = messages.findIndex((m) => m.id === highlightedMessageId);
      if (idx !== -1) {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      }
    }
  }, [highlightedMessageId, messages]);

  const renderItem = useCallback(
    ({ item, index }: { item: ImMessage; index: number }) => {
      const Renderer = BubbleRegistry.get(item.type || 'text');
      const prevMessage = messages[index - 1];
      const isSameSpeaker = prevMessage && prevMessage.role === item.role;
      const verticalMargin = isSameSpeaker
        ? theme.metrics.bubbleSpacingSameSpeaker
        : theme.metrics.bubbleSpacingDiffSpeaker;
      const isHighlighted = item.id === highlightedMessageId;

      const currentMs = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      const prevMs = (prevMessage && prevMessage.createdAt) ? new Date(prevMessage.createdAt).getTime() : 0;
      const shouldShowTime = index === 0 || (currentMs > 0 && prevMs > 0 && currentMs - prevMs >= 5 * 60 * 1000);

      return (
        <View style={[{ marginTop: verticalMargin }, isHighlighted && styles.highlightWrap]}>
          {shouldShowTime && (
            <View style={styles.timeTagWrap}>
              <View style={[styles.timeTagPill, { backgroundColor: theme.colors.systemNoticeBackground, borderRadius: theme.radii.systemNoticeRadius }]}>
                <Text style={[styles.timeTagText, { color: theme.colors.systemNoticeText, fontSize: theme.typography.timeFontSize }]}>
                  {formatWeChatTime(item.createdAt, 'chat')}
                </Text>
              </View>
            </View>
          )}
          <Renderer
            companionAvatarUri={companionAvatarUri}
            companionName={companionName}
            message={item}
            onLongPressMessage={onLongPressMessage}
            onNudge={onNudge}
            onOpenDiary={onOpenDiary}
            onPressMessage={onPressMessage}
            userAvatarUri={userAvatarUri}
          />
        </View>
      );
    },
    [
      messages,
      companionAvatarUri,
      companionName,
      userAvatarUri,
      onLongPressMessage,
      onPressMessage,
      onNudge,
      onOpenDiary,
      theme,
      highlightedMessageId,
    ]
  );

  return (
    <View style={styles.listContainer}>
      {backgroundImageUri ? (
        <SecureImage
          space="normal"
          style={StyleSheet.absoluteFillObject}
          uri={backgroundImageUri}
        />
      ) : null}
      <FlashList
        contentContainerStyle={styles.contentContainer}
        data={messages}
        getItemType={(item) => item.type || 'text'}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ref={listRef}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 12,
    paddingBottom: 28,
  },
  highlightWrap: {
    backgroundColor: 'rgba(254, 240, 138, 0.35)',
    borderRadius: 12,
    paddingVertical: 2,
  },
  timeTagWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  timeTagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timeTagText: {
    fontWeight: '400',
  },
});
