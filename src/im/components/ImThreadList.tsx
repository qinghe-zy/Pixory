import React, { useEffect, useState, useCallback } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  RefreshControl,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PixorySpace } from '../../database';
import { SecureImage } from '../../components/SecureImage';
import { colors, radius, spacing } from '../../design/tokens';
import type { ImThreadListItem } from '../types';
import { listImThreads } from '../repository/imThreadRepository';
import { useImTheme } from '../theme/ImThemeProvider';
import { formatImPreviewText } from '../utils/formatImPreviewText';
import { formatWeChatTime } from '../utils/formatWeChatTime';
export { formatWeChatTime };

export interface ImThreadListProps {
  space: PixorySpace;
  onOpenImChat: (thread: ImThreadListItem) => void;
  onOpenRoleLibrary?: () => void;
  refreshTrigger?: number;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
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
  refreshTrigger,
  ListHeaderComponent,
  contentContainerStyle,
}: ImThreadListProps) {
  const theme = useImTheme();
  const [threads, setThreads] = useState<ImThreadListItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const items = await listImThreads(space, { onlyChatted: true });
      setThreads(items);
    } catch {
      // 容错静默
    } finally {
      setInitialLoading(false);
    }
  }, [space]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshTrigger]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: ImThreadListItem }) => {
    const formattedPreview = formatImPreviewText(
      item.lastMessagePreview,
      '刚刚建立了联络'
    );
    const unreadCount = item.unreadCount ?? 0;
    const a11yLabel =
      unreadCount > 0
        ? `打开与 ${item.title} 的聊天，${unreadCount} 条未读消息`
        : `打开与 ${item.title} 的聊天`;

    return (
      <Pressable
        accessibilityLabel={a11yLabel}
        accessibilityRole="button"
        onPress={() => onOpenImChat(item)}
        style={({ pressed }) => [
          styles.threadRow,
          {
            backgroundColor: item.isPinned
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
          {item.avatarUri ? (
            <SecureImage
              space={space}
              style={[
                styles.avatarImage,
                { borderRadius: theme.radii.avatarRadius },
              ]}
              uri={item.avatarUri}
            />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { borderRadius: theme.radii.avatarRadius },
              ]}
            >
              <Text style={styles.avatarLetter}>{item.title.slice(0, 1)}</Text>
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
              {item.title}
            </Text>
            {item.lastMessageAt ? (
              <Text style={styles.timeText}>
                {formatWeChatTime(item.lastMessageAt)}
              </Text>
            ) : null}
          </View>
          <Text numberOfLines={1} style={styles.previewText}>
            {formattedPreview}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderEmptyOrLoading = () => {
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
  };

  return (
    <FlatList
      ListEmptyComponent={renderEmptyOrLoading}
      ListHeaderComponent={ListHeaderComponent}
      contentContainerStyle={[
        styles.listContent,
        contentContainerStyle,
        threads.length === 0 && !initialLoading ? styles.listContentEmpty : null,
      ]}
      data={threads}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl onRefresh={handleRefresh} refreshing={refreshing} />
      }
      renderItem={renderItem}
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
  rowPressed: {
    backgroundColor: colors.primary.hover,
  },
  avatarWrap: {
    position: 'relative',
    marginRight: spacing[3],
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.semantic.taskSuccess,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: colors.text.inverse,
    fontSize: 16,
    fontWeight: '600',
  },
  livingIndicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#10B981', // WeChat/IM 在线状态指示绿点（专属功能语义色）
    borderWidth: 1.5,
    borderColor: colors.background.surface,
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: spacing[1],
    backgroundColor: '#EF4444', // 微信消息流标准未读醒目红点色
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.background.surface,
  },
  unreadBadgeText: {
    color: colors.text.inverse,
    fontSize: 10,
    fontWeight: '700',
    includeFontPadding: false,
  },
  copyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  titleText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.title,
    flex: 1,
    marginRight: spacing[2],
  },
  timeText: {
    fontSize: 12,
    color: colors.text.tertiary,
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
    width: '36%',
    height: 14,
    borderRadius: radius.xs,
    backgroundColor: colors.background.soft,
    marginBottom: spacing[2],
  },
  skeletonPreviewBar: {
    width: '68%',
    height: 12,
    borderRadius: radius.xs,
    backgroundColor: colors.background.soft,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
    backgroundColor: colors.background.surface,
  },
  emptyIcon: {
    marginBottom: spacing[3],
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.title,
    marginBottom: spacing[1.5],
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing[5],
  },
  pickButton: {
    backgroundColor: colors.primary.default,
    paddingHorizontal: spacing[5],
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  pickButtonText: {
    color: colors.text.inverse,
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.72,
  },
});
