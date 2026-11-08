import React, { useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import type { PixorySpace } from '../../database';
import { SecureImage } from '../../components/SecureImage';
import { colors, radius, spacing } from '../../design/tokens';
import type { ImThreadListItem } from '../types';
import { useImTheme } from '../theme/ImThemeProvider';
import { formatImPreviewText } from '../utils/formatImPreviewText';
import { formatWeChatTime } from '../utils/formatWeChatTime';
import { useImThreadFeed, type UseImThreadFeedResult } from '../hooks/useImThreadFeed';
import type { ImFeedItem } from '../utils/buildImThreadFeed';
export { formatWeChatTime };

import * as Haptics from 'expo-haptics';

export interface ImThreadListProps {
  space: PixorySpace;
  onOpenImChat: (thread: ImThreadListItem) => void;
  onOpenRoleLibrary?: () => void;
  onLongPressThread?: (thread: ImThreadListItem, coords: { pageX: number; pageY: number }) => void;
  onOpenFoldedThreads?: (foldedThreads: ImThreadListItem[]) => void;
  refreshTrigger?: number;
  feed?: UseImThreadFeedResult;
  scrollEnabled?: boolean;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEventThrottle?: number;
}

const SKELETON_ROWS = [1, 2, 3];

/**
 * 微信经典消息流列表 (Authentic WeChat Conversation Stream)
 *
 * 采用 1:1 伴侣绑定会话：
 * - 单行高度 72px，左侧 44x44 安全隐私头像，中间昵称+纯净最后回复，右上时间与未读红点
 * - 首屏加载展示等高骨架屏避免空态闪烁，列表为空时提供优雅的“挑选伴侣发起聊天”引导。
 */
export function ImThreadList({
  space,
  onOpenImChat,
  onOpenRoleLibrary,
  onLongPressThread,
  onOpenFoldedThreads,
  refreshTrigger,
  feed: externalFeed,
  scrollEnabled = true,
  ListHeaderComponent,
  contentContainerStyle,
  onScroll,
  scrollEventThrottle = 16,
}: ImThreadListProps) {
  const theme = useImTheme();
  const internalFeed = useImThreadFeed(space, refreshTrigger);
  const feed = externalFeed || internalFeed;
  const { displayItems, initialLoading } = feed;

  const renderItem = useCallback(
    ({ item }: { item: ImFeedItem }) => {
      if (item.type === 'folded') {
        const foldedList = item.list;
        const latestThread = foldedList[0];
        const totalUnread = foldedList.reduce((sum, t) => sum + (t.unreadCount ?? 0), 0);
        return (
          <Pressable
            accessibilityLabel={`折叠的会话，共 ${foldedList.length} 个会话`}
            accessibilityRole="button"
            onPress={() => onOpenFoldedThreads?.(foldedList)}
            style={({ pressed }) => [
              styles.threadRow,
              styles.foldedRow,
              { borderBottomColor: theme.colors.headerBorder },
              pressed ? styles.rowPressed : null,
            ]}
          >
            <View style={styles.foldedIconBox}>
              <Ionicons color="#EAB308" name="folder" size={24} />
              {totalUnread > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {totalUnread > 99 ? '99+' : String(totalUnread)}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.copyContainer}>
              <View style={styles.titleRow}>
                <Text numberOfLines={1} style={styles.titleText}>
                  折叠的会话
                </Text>
                {latestThread?.lastMessageAt ? (
                  <Text style={styles.timeText}>
                    {formatWeChatTime(latestThread.lastMessageAt)}
                  </Text>
                ) : null}
              </View>
              <Text numberOfLines={1} style={styles.previewText}>
                {latestThread
                  ? `${latestThread.title}: ${latestThread.lastMessagePreview || '暂无消息'}`
                  : `${foldedList.length} 个会话`}
              </Text>
            </View>
          </Pressable>
        );
      }

      const threadItem: ImThreadListItem = item.thread;
      const formattedPreview = formatImPreviewText(
        threadItem.lastMessagePreview,
        '刚刚建立了联络'
      );
      const unreadCount = threadItem.unreadCount ?? 0;
      const a11yLabel =
        unreadCount > 0
          ? `打开与 ${threadItem.title} 的聊天，${unreadCount} 条未读消息`
          : `打开与 ${threadItem.title} 的聊天`;

      return (
        <Pressable
          accessibilityLabel={a11yLabel}
          accessibilityRole="button"
          onLongPress={(e) => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onLongPressThread?.(threadItem, {
              pageX: e.nativeEvent.pageX,
              pageY: e.nativeEvent.pageY,
            });
          }}
          onPress={() => onOpenImChat(threadItem)}
          style={({ pressed }) => [
            styles.threadRow,
            {
              backgroundColor: threadItem.isPinned
                ? colors.background.soft
                : colors.background.surface,
              borderBottomColor: theme.colors.headerBorder,
            },
            pressed ? styles.rowPressed : null,
          ]}
        >
          {/* 头像、未读红点与在线呼吸点 */}
          <View
            style={[
              styles.avatarWrap,
              {
                width: 44,
                height: 44,
                borderRadius: theme.radii.avatarRadius,
              },
            ]}
          >
            {threadItem.avatarUri ? (
              <SecureImage
                space={space}
                style={[
                  styles.avatarImage,
                  { borderRadius: theme.radii.avatarRadius },
                ]}
                uri={threadItem.avatarUri}
              />
            ) : (
              <View
                style={[
                  styles.avatarPlaceholder,
                  { borderRadius: theme.radii.avatarRadius },
                ]}
              >
                <Text style={styles.avatarLetter}>{threadItem.title.slice(0, 1)}</Text>
              </View>
            )}
            {/* 伴侣在线微型呼吸光斑 */}
            <View style={styles.livingIndicator} />
            {/* 微信风格右上角未读消息红点角标 */}
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 99 ? '99+' : String(unreadCount)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* 中间文字摘要 */}
          <View style={styles.copyContainer}>
            <View style={styles.titleRow}>
              <Text numberOfLines={1} style={styles.titleText}>
                {threadItem.title}
              </Text>
              {threadItem.lastMessageAt ? (
                <Text style={styles.timeText}>
                  {formatWeChatTime(threadItem.lastMessageAt)}
                </Text>
              ) : null}
            </View>
            <Text numberOfLines={1} style={styles.previewText}>
              {formattedPreview}
            </Text>
          </View>
        </Pressable>
      );
    },
    [onLongPressThread, onOpenFoldedThreads, onOpenImChat, space, theme]
  );

  const renderEmptyOrLoading = useCallback(() => {
    if (initialLoading) {
      return (
        <View accessibilityLabel="正在加载会话列表" style={styles.skeletonWrap}>
          {SKELETON_ROWS.map((rowKey) => (
            <View
              key={rowKey}
              style={[
                styles.threadRow,
                { borderBottomColor: theme.colors.headerBorder },
              ]}
            >
              <View
                style={[
                  styles.skeletonAvatar,
                  { borderRadius: theme.radii.avatarRadius },
                ]}
              />
              <View style={styles.copyContainer}>
                <View style={styles.skeletonTitleBar} />
                <View style={styles.skeletonPreviewBar} />
              </View>
            </View>
          ))}
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons color={colors.text.secondary} name="chatbubbles-outline" size={40} style={styles.emptyIcon} />
        <Text style={styles.emptyTitle}>暂无聊天消息</Text>
        <Text style={styles.emptySubtitle}>
          挑选角色或从通讯录开启对话，开启专属即时聊天。
        </Text>
        {onOpenRoleLibrary ? (
          <Pressable
            accessibilityLabel="挑选角色开启聊天"
            accessibilityRole="button"
            onPress={onOpenRoleLibrary}
            style={({ pressed }) => [styles.pickButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.pickButtonText}>挑选角色</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }, [initialLoading, onOpenRoleLibrary, theme]);

  return (
    <FlatList
      ListEmptyComponent={renderEmptyOrLoading}
      ListHeaderComponent={ListHeaderComponent}
      bounces={false}
      contentContainerStyle={[
        styles.listContent,
        contentContainerStyle,
        displayItems.length === 0 && !initialLoading ? styles.listContentEmpty : null,
      ]}
      data={displayItems}
      keyExtractor={(item) => item.key}
      nestedScrollEnabled={true}
      onScroll={onScroll}
      overScrollMode="never"
      renderItem={renderItem}
      scrollEnabled={scrollEnabled}
      scrollEventThrottle={scrollEventThrottle}
      style={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background.surface,
  },
  listContent: {
    paddingBottom: 80,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  threadRow: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  foldedRow: {
    backgroundColor: colors.background.surface,
  },
  foldedIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  rowPressed: {
    backgroundColor: colors.primary.hover,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: spacing[3],
  },
  avatarImage: {
    width: 44,
    height: 44,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    backgroundColor: colors.background.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  livingIndicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: colors.background.surface,
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.background.surface,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 12,
  },
  copyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
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
    fontSize: 14,
    color: colors.text.secondary,
  },
  skeletonWrap: {
    paddingTop: spacing[1],
  },
  skeletonAvatar: {
    width: 44,
    height: 44,
    backgroundColor: colors.background.soft,
    marginRight: spacing[3],
  },
  skeletonTitleBar: {
    width: '45%',
    height: 14,
    borderRadius: radius.xs,
    backgroundColor: colors.background.soft,
    marginBottom: 8,
  },
  skeletonPreviewBar: {
    width: '75%',
    height: 12,
    borderRadius: radius.xs,
    backgroundColor: colors.background.soft,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
    paddingTop: spacing[12],
  },
  emptyIcon: {
    marginBottom: spacing[3],
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing[6],
  },
  pickButton: {
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[2],
    borderRadius: radius.pill,
    backgroundColor: colors.primary.default,
  },
  pickButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.82,
  },
});
