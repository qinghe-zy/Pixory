import React, { useCallback, useRef, useEffect, useState } from 'react';
import { StyleSheet, View, Text, Keyboard, Pressable, type NativeSyntheticEvent, type NativeScrollEvent, type LayoutChangeEvent } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import type { PixorySpace } from '../../database';
import type { ImMessage } from '../types';
import { BubbleRegistry } from '../registry/bubbleRegistry';
import { useImTheme } from '../theme/ImThemeProvider';
import { SecureImage } from '../../components/SecureImage';
import { formatWeChatTime } from '../utils/formatWeChatTime';
import { ImUnreadJumpBubble } from './common/ImUnreadJumpBubble';

export interface ImChatListProps {
  messages: ImMessage[];
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
  onQuickIcebreak?: (text: string) => void;
  onLongPressMessage?: (message: ImMessage, pageX: number, pageY: number) => void;
  onPressMessage?: (message: ImMessage) => void;
  onRetryMessage?: (message: ImMessage) => void;
  onNudge?: () => void;
  onNudgeSelf?: () => void;
  onOpenDiary?: (diaryId?: string) => void;
  onOpenSandbox?: (target: { code: string; language?: string; title?: string }) => void;
}

const DEFAULT_ICEBREAK_PROMPTS = [
  '今天过得怎么样呀？',
  '你刚才在忙什么呢？',
  '翻到一张好看的照片分享给你~',
];

export function ImChatList({
  messages,
  space = 'normal',
  companionAvatarUri,
  companionName = '伴侣',
  userAvatarUri,
  backgroundImageUri,
  wallpaperScrimOpacity = 0.16,
  highlightedMessageId,
  isInitialLoading = false,
  onQuickIcebreak,
  onLongPressMessage,
  onPressMessage,
  onRetryMessage,
  onNudge,
  onNudgeSelf,
  onOpenDiary,
  onOpenSandbox,
  unreadCount = 0,
}: ImChatListProps) {
  const theme = useImTheme();
  const listRef = useRef<FlashListRef<ImMessage>>(null);
  const [showJumpBubble, setShowJumpBubble] = useState<boolean>(unreadCount > 0);
  const initialUnreadCountRef = useRef<number>(unreadCount);
  const isNearBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(messages.length);

  useEffect(() => {
    if (unreadCount > 0) {
      initialUnreadCountRef.current = unreadCount;
      setShowJumpBubble(true);
    }
  }, [unreadCount]);

  const handleJumpToUnread = useCallback(() => {
    setShowJumpBubble(false);
    const count = initialUnreadCountRef.current;
    if (count > 0 && messages.length > 0) {
      const targetIdx = Math.max(0, messages.length - count - 1);
      listRef.current?.scrollToIndex({
        index: targetIdx,
        animated: true,
        viewPosition: 1,
      });
    }
  }, [messages.length]);

  const scrollToBottom = useCallback(
    (animated = false) => {
      if (messages.length === 0) return;
      // 优先调用底层原生 CompatScroller (原生 ScrollView.scrollToEnd)，
      // 彻底避开 @shopify/flash-list v2 在未挂载索引时调用 scrollToIndex 计算 layout offset=0 导致反向跳顶的严重 bug！
      const scroller = listRef.current?.getNativeScrollRef();
      if (scroller && typeof scroller.scrollToEnd === 'function') {
        scroller.scrollToEnd({ animated });
        return;
      }
      try {
        listRef.current?.scrollToEnd({ animated });
      } catch {
        // ignore
      }
    },
    [messages.length]
  );

  const prevListHeightRef = useRef<number>(0);
  const scrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearScrollTimers = useCallback(() => {
    scrollTimersRef.current.forEach((t) => clearTimeout(t));
    scrollTimersRef.current = [];
  }, []);

  const scheduleMultiTierScrollToBottom = useCallback(() => {
    if (!isNearBottomRef.current) return;
    clearScrollTimers();
    requestAnimationFrame(() => scrollToBottom(false));
    [80, 200, 360, 520].forEach((delay) => {
      const t = setTimeout(() => {
        if (isNearBottomRef.current) {
          scrollToBottom(false);
        }
      }, delay);
      scrollTimersRef.current.push(t);
    });
  }, [clearScrollTimers, scrollToBottom]);

  useEffect(() => {
    return () => {
      clearScrollTimers();
    };
  }, [clearScrollTimers]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
      const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
      isNearBottomRef.current = distanceFromBottom < 320;
      if (distanceFromBottom > 350 && showJumpBubble) {
        setShowJumpBubble(false);
      }
    },
    [showJumpBubble]
  );

  const handleContentSizeChange = useCallback(() => {
    // 只要当前处于底部区域，内容尺寸发生变化（新消息上屏、多气泡渲染展开、软键盘弹起重排）时坚实维持底部吸附
    if (isNearBottomRef.current) {
      scrollToBottom(false);
    }
  }, [scrollToBottom]);

  const handleListLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const currentHeight = e.nativeEvent.layout.height;
      if (prevListHeightRef.current > 0 && currentHeight < prevListHeightRef.current) {
        // 软键盘弹起导致视口高度变小，多级延迟触底对齐，彻底杜绝最后一条消息被输入栏遮挡
        scheduleMultiTierScrollToBottom();
      }
      prevListHeightRef.current = currentHeight;
    },
    [scheduleMultiTierScrollToBottom]
  );

  useEffect(() => {
    // 当有新消息上屏时，若用户当前处于底部附近，执行单帧 rAF + 短时延迟兜底对齐，彻底根治跳顶与遮挡
    let timer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;

    if (messages.length > prevMessagesLengthRef.current) {
      if (isNearBottomRef.current) {
        rafId = requestAnimationFrame(() => scrollToBottom(false));
        timer = setTimeout(() => scrollToBottom(false), 50);
      }
    } else if (prevMessagesLengthRef.current === 0 && messages.length > 0) {
      scrollToBottom(false);
    }
    prevMessagesLengthRef.current = messages.length;

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timer !== null) clearTimeout(timer);
    };
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    const handleKeyboardShow = () => {
      scheduleMultiTierScrollToBottom();
    };
    const sub = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    return () => sub.remove();
  }, [scheduleMultiTierScrollToBottom]);

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
            onNudgeSelf={onNudgeSelf}
            onOpenDiary={onOpenDiary}
            onOpenSandbox={onOpenSandbox}
            onPressMessage={onPressMessage}
            onRetryMessage={onRetryMessage}
            space={space}
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
      onRetryMessage,
      onNudge,
      onNudgeSelf,
      onOpenDiary,
      onOpenSandbox,
      theme,
      highlightedMessageId,
      space,
    ]
  );

  const renderEmptyState = () => {
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
      <View style={styles.icebreakCardWrap}>
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
      </View>
    );
  };

  return (
    <View style={styles.listContainer}>
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
      <FlashList
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={[styles.contentContainer, messages.length === 0 && styles.emptyListContent]}
        data={messages}
        getItemType={(item) => item.type || 'text'}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleListLayout}
        onScroll={handleScroll}
        ref={listRef}
        renderItem={renderItem}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
      />
      {showJumpBubble && initialUnreadCountRef.current > 0 ? (
        <ImUnreadJumpBubble
          onPress={handleJumpToUnread}
          unreadCount={initialUnreadCountRef.current}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 12,
    paddingBottom: 48,
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
