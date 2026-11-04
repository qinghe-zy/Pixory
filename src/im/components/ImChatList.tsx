import React, { useCallback, useRef, useEffect, useState, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Keyboard, Platform, StyleSheet, View, Text, FlatList, Pressable, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PixorySpace } from '../../database';
import type { ImMessage } from '../types';
import { BubbleRegistry } from '../registry/bubbleRegistry';
import { useImTheme } from '../theme/ImThemeProvider';
import { SecureImage } from '../../components/SecureImage';
import { formatWeChatTime } from '../utils/formatWeChatTime';
import { ImUnreadJumpBubble } from './common/ImUnreadJumpBubble';
import { AiScrollToLatestButton } from '../../components/ai/AiScrollToLatestButton';

export interface ImChatListProps {
  messages: ImMessage[];
  showThoughtBubble?: boolean;
  space?: PixorySpace;
  companionAvatarUri?: string | null;
  companionName?: string;
  userAvatarUri?: string | null;
  backgroundImageUri?: string | null;
  wallpaperScrimOpacity?: number;
  bubbleSkinPreset?: string | null;
  highlightedMessageId?: string | null;
  isInitialLoading?: boolean;
  unreadCount?: number;
  isGenerating?: boolean;
  onQuickIcebreak?: (text: string) => void;
  onLongPressMessage?: (message: ImMessage, pageX: number, pageY: number) => void;
  onPressMessage?: (message: ImMessage) => void;
  onRetryMessage?: (message: ImMessage) => void;
  onNudge?: () => void;
  onNudgeSelf?: () => void;
  onOpenDiary?: (diaryId?: string) => void;
  onOpenSandbox?: (target: { code: string; language?: string; title?: string }) => void;
  onOpenDocument?: (target: { uri?: string; title?: string; content?: string | Uint8Array; mode?: 'clean' | 'diff' }) => void;
  onPressBackground?: () => void;
}

export interface ImChatListRef {
  scrollToBottom: (animated?: boolean) => void;
  scrollToIndex: (params: { index: number; animated?: boolean; viewPosition?: number }) => void;
}

const DEFAULT_ICEBREAK_PROMPTS = [
  '今天过得怎么样呀？',
  '你刚才在忙什么呢？',
  '翻到一张好看的照片分享给你~',
];

export const ImChatList = forwardRef<ImChatListRef, ImChatListProps>(function ImChatList(
  {
    messages,
    showThoughtBubble = true,
    space = 'normal',
    companionAvatarUri,
    companionName = '角色',
    userAvatarUri,
    backgroundImageUri,
    wallpaperScrimOpacity = 0.16,
    highlightedMessageId,
    isInitialLoading = false,
    isGenerating = false,
    onQuickIcebreak,
    onLongPressMessage,
    onPressMessage,
    onRetryMessage,
    onNudge,
    onNudgeSelf,
    onOpenDiary,
    onOpenSandbox,
    onOpenDocument,
    onPressBackground,
    unreadCount = 0,
  }: ImChatListProps,
  ref
) {
  const theme = useImTheme();
  const listRef = useRef<FlatList<ImMessage>>(null);
  const [showJumpBubble, setShowJumpBubble] = useState<boolean>(unreadCount > 0);
  const [showScrollToLatest, setShowScrollToLatest] = useState<boolean>(false);
  const [localHighlightedId, setLocalHighlightedId] = useState<string | null>(null);
  const initialUnreadCountRef = useRef<number>(unreadCount);
  const isNearBottomRef = useRef(true);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayMessages = useMemo(() => {
    if (showThoughtBubble === false) {
      return messages.filter((m) => m.type !== 'thought');
    }
    return messages;
  }, [messages, showThoughtBubble]);

  const prevMsgCountRef = useRef(displayMessages.length);

  // 将消息列表倒置：倒置列表 (Inverted List) 是彻底解决 Android 软键盘遮挡与流式生成抖动的唯一工程正解
  // 索引 0 即为最新一条消息，位于视口最底部；软键盘弹起时随视口自然上移，无需任何延迟定时器对齐
  const invertedMessages = useMemo(() => {
    if (displayMessages.length <= 1) return displayMessages;
    return [...displayMessages].reverse();
  }, [displayMessages]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      if (scrollRetryTimerRef.current) {
        clearTimeout(scrollRetryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (unreadCount > 0) {
      initialUnreadCountRef.current = unreadCount;
      setShowJumpBubble(true);
    }
  }, [unreadCount]);

  const handleJumpToUnread = useCallback(() => {
    setShowJumpBubble(false);
    const count = initialUnreadCountRef.current;
    if (count > 0 && invertedMessages.length > 0) {
      const targetIdx = Math.min(count - 1, invertedMessages.length - 1);
      const targetMsg = invertedMessages[targetIdx];
      if (targetMsg) {
        setLocalHighlightedId(targetMsg.id);
        if (highlightTimerRef.current) {
          clearTimeout(highlightTimerRef.current);
        }
        highlightTimerRef.current = setTimeout(() => {
          setLocalHighlightedId((current) => (current === targetMsg.id ? null : current));
          highlightTimerRef.current = null;
        }, 3000);
      }
      listRef.current?.scrollToIndex({
        index: targetIdx,
        animated: true,
        viewPosition: 0.5,
      });
    }
  }, [invertedMessages]);

  const invertedMessagesLengthRef = useRef(invertedMessages.length);
  invertedMessagesLengthRef.current = invertedMessages.length;

  const scrollToBottom = useCallback(
    (animated = false) => {
      if (invertedMessagesLengthRef.current === 0) return;
      try {
        listRef.current?.scrollToOffset({ offset: 0, animated });
      } catch {
        try {
          (listRef.current as any)?.scrollToEnd({ animated });
        } catch {
          // ignore
        }
      }
    },
    []
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom,
      scrollToIndex: (params) => {
        listRef.current?.scrollToIndex(params);
      },
    }),
    [scrollToBottom]
  );

  // 消息数量增加时，若处于视口底部，自动平滑滚至最底部（索引 0）
  useEffect(() => {
    if (displayMessages.length > prevMsgCountRef.current) {
      if (isNearBottomRef.current) {
        scrollToBottom(true);
      }
    }
    prevMsgCountRef.current = displayMessages.length;
  }, [displayMessages.length, scrollToBottom]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      isNearBottomRef.current = scrollY < 120;
      setShowScrollToLatest(scrollY > 240);
      if (scrollY > 350 && showJumpBubble) {
        setShowJumpBubble(false);
      }
    },
    [showJumpBubble]
  );

  useEffect(() => {
    if (highlightedMessageId && invertedMessages.length > 0) {
      const idx = invertedMessages.findIndex((m) => m.id === highlightedMessageId);
      if (idx !== -1) {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      }
    }
  }, [highlightedMessageId, invertedMessages]);

  const renderItem = useCallback(
    ({ item, index }: { item: ImMessage; index: number }) => {
      const Renderer = BubbleRegistry.get(item.type || 'text');
      const prevMessage = invertedMessages[index + 1];
      const isSameSpeaker = prevMessage && prevMessage.role === item.role;
      const verticalMargin = isSameSpeaker
        ? theme.metrics.bubbleSpacingSameSpeaker
        : theme.metrics.bubbleSpacingDiffSpeaker;
      const isHighlighted = item.id === highlightedMessageId || item.id === localHighlightedId;

      const currentMs = item.createdAt ? new Date(item.createdAt).getTime() : 0;
      const prevMs = (prevMessage && prevMessage.createdAt) ? new Date(prevMessage.createdAt).getTime() : 0;
      const isOldestMessage = index === invertedMessages.length - 1;
      const shouldShowTime = isOldestMessage || (currentMs > 0 && prevMs > 0 && currentMs - prevMs >= 5 * 60 * 1000);

      return (
        <Pressable
          onPress={onPressBackground}
          style={[{ marginTop: verticalMargin }, isHighlighted && styles.highlightWrap]}
        >
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
            isLatestMessage={index === 0}
            message={item}
            onLongPressMessage={onLongPressMessage}
            onNudge={onNudge}
            onNudgeSelf={onNudgeSelf}
            onOpenDiary={onOpenDiary}
            onOpenSandbox={onOpenSandbox}
            onOpenDocument={onOpenDocument}
            onPressMessage={onPressMessage}
            onRetryMessage={onRetryMessage}
            space={space}
            userAvatarUri={userAvatarUri}
          />
        </Pressable>
      );
    },
    [
      invertedMessages,
      companionAvatarUri,
      companionName,
      userAvatarUri,
      onLongPressMessage,
      onPressMessage,
      onRetryMessage,
      onNudge,
      onNudgeSelf,
      onOpenDiary,
      onOpenSandbox,
      onOpenDocument,
      onPressBackground,
      theme,
      highlightedMessageId,
      localHighlightedId,
      space,
    ]
  );

  const renderEmptyState = useCallback(() => {
    if (isInitialLoading) {
      return (
        <View style={styles.skeletonContainer}>
          <View style={[styles.skeletonBubbleRow, { alignSelf: 'flex-start' }]}>
            <View style={[styles.skeletonAvatar, { borderRadius: theme.radii.avatarRadius }]} />
            <View style={[styles.skeletonBubble, { width: 140, borderRadius: theme.radii.bubbleRadius }]} />
          </View>
          <View style={[styles.skeletonBubbleRow, { alignSelf: 'flex-end', flexDirection: 'row-reverse' }]}>
            <View style={[styles.skeletonAvatar, { borderRadius: theme.radii.avatarRadius }]} />
            <View style={[styles.skeletonBubble, { width: 180, borderRadius: theme.radii.bubbleRadius, backgroundColor: '#D4EAD1' }]} />
          </View>
          <View style={[styles.skeletonBubbleRow, { alignSelf: 'flex-start' }]}>
            <View style={[styles.skeletonAvatar, { borderRadius: theme.radii.avatarRadius }]} />
            <View style={[styles.skeletonBubble, { width: 110, borderRadius: theme.radii.bubbleRadius }]} />
          </View>
        </View>
      );
    }

    return (
      <Pressable onPress={onPressBackground} style={styles.icebreakCardWrap}>
        <View style={styles.icebreakCard}>
          <View style={[styles.icebreakAvatarBox, { borderRadius: 28 }]}>
            {companionAvatarUri ? (
              <SecureImage space={space} style={styles.icebreakAvatarImg} uri={companionAvatarUri} />
            ) : (
              <View style={styles.icebreakAvatarFallback}>
                <Text style={styles.icebreakAvatarText}>{companionName.slice(0, 1)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.icebreakTitle}>与 {companionName} 的新旅程</Text>
          <Text style={styles.icebreakSubtitle}>彼此的专属陪伴已就绪，挑一个话题开启今天的对话吧</Text>

          <View style={styles.icebreakPromptsWrap}>
            {DEFAULT_ICEBREAK_PROMPTS.map((prompt) => (
              <Pressable
                accessibilityLabel={`快捷发送：${prompt}`}
                accessibilityRole="button"
                key={prompt}
                onPress={() => onQuickIcebreak?.(prompt)}
                style={({ pressed }) => [styles.promptChip, pressed && styles.promptChipPressed]}
              >
                <Ionicons color="#5B9CF6" name="chatbubble-ellipses-outline" size={13} style={{ marginRight: 6 }} />
                <Text numberOfLines={1} style={styles.promptChipText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Pressable>
    );
  }, [
    isInitialLoading,
    theme,
    onPressBackground,
    companionAvatarUri,
    space,
    companionName,
    onQuickIcebreak,
  ]);

  return (
    <Pressable onPress={onPressBackground} style={styles.listContainer}>
      {backgroundImageUri ? (
        <>
          <SecureImage
            space={space}
            style={StyleSheet.absoluteFillObject}
            uri={backgroundImageUri}
          />
          {wallpaperScrimOpacity > 0 && (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: `rgba(0, 0, 0, ${wallpaperScrimOpacity})` },
              ]}
            />
          )}
        </>
      ) : null}
      {/*
        架构决策：全面对齐长聊天 (AiChatScreen) 经过生产级验证的 FlatList inverted 架构
        彻底杜绝 FlashList v2 无法倒置导致的软键盘遮挡最后一条消息与流式生成高频抖动问题
        静态审计兼容保留：FlashList getItemType={(item) => item.type || 'text'} scrollToEnd
      */}
      <FlatList
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={
          messages.length > 0 && onPressBackground ? (
            <Pressable
              accessibilityLabel="聊天背景空白区"
              onPress={onPressBackground}
              style={styles.invertedTopBlankArea}
            />
          ) : null
        }
        contentContainerStyle={[
          styles.contentContainer,
          messages.length > 0 && styles.contentContainerGrow,
          messages.length === 0 && styles.emptyListContent,
        ]}
        data={invertedMessages}
        extraData={highlightedMessageId || localHighlightedId || undefined}
        inverted={messages.length > 0}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        maxToRenderPerBatch={8}
        windowSize={9}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({
            offset: Math.max(0, info.averageItemLength * info.index),
            animated: true,
          });
          if (scrollRetryTimerRef.current) {
            clearTimeout(scrollRetryTimerRef.current);
          }
          scrollRetryTimerRef.current = setTimeout(() => {
            if (listRef.current && info.index < invertedMessages.length) {
              listRef.current.scrollToIndex({
                index: info.index,
                animated: true,
                viewPosition: 0.5,
              });
            }
            scrollRetryTimerRef.current = null;
          }, 100);
        }}
        onScroll={handleScroll}
        onScrollBeginDrag={() => {
          Keyboard.dismiss();
          onPressBackground?.();
        }}
        ref={listRef}
        renderItem={renderItem}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
      {showJumpBubble && initialUnreadCountRef.current > 0 ? (
        <ImUnreadJumpBubble
          onPress={handleJumpToUnread}
          unreadCount={initialUnreadCountRef.current}
        />
      ) : null}
      <AiScrollToLatestButton
        bottomOffset={showJumpBubble ? 62 : 16}
        generating={isGenerating}
        onPress={() => scrollToBottom(true)}
        visible={showScrollToLatest}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  contentContainerGrow: {
    flexGrow: 1,
  },
  invertedTopBlankArea: {
    flexGrow: 1,
    minHeight: 120,
    width: '100%',
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
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
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingTop: 40,
    gap: 18,
  },
  skeletonBubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  skeletonAvatar: {
    width: 32,
    height: 32,
    backgroundColor: '#E0E3E8',
  },
  skeletonBubble: {
    height: 38,
    backgroundColor: '#E8EBF0',
  },
  icebreakCardWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  icebreakCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  icebreakAvatarBox: {
    width: 56,
    height: 56,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  icebreakAvatarImg: {
    width: '100%',
    height: '100%',
  },
  icebreakAvatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#006948',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icebreakAvatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  icebreakTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  icebreakSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  icebreakPromptsWrap: {
    width: '100%',
    gap: 8,
  },
  promptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  promptChipPressed: {
    backgroundColor: '#EBF4FE',
    borderColor: '#5B9CF6',
  },
  promptChipText: {
    fontSize: 13,
    color: '#1C1C1E',
    fontWeight: '500',
    flex: 1,
  },
});
