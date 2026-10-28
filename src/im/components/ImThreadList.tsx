import React, { useEffect, useState, useCallback } from 'react';
import {
  FlatList,
  Image,
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
import type { ImThreadListItem } from '../types';
import { listImThreads } from '../repository/imThreadRepository';
import { useImTheme } from '../theme/ImThemeProvider';
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

/**
 * 微信经典消息流列表 (Authentic WeChat Conversation Stream)
 *
 * 采用 1:1 伴侣绑定会话：
 * - 单行高度 72px，左侧 40x40 头像，中间昵称+纯净最后回复，右上时间
 * - 列表为空时提供优雅的“挑选伴侣发起聊天”引导。
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
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const items = await listImThreads(space, { onlyChatted: true });
      setThreads(items);
    } catch {
      // 容错静默
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
    const formattedPreview = item.lastMessagePreview
      ? item.lastMessagePreview.replace(/\[BR\]/g, ' ').trim()
      : '刚刚建立了伴侣联络';

    return (
      <Pressable
        accessibilityLabel={`打开与 ${item.title} 的聊天`}
        accessibilityRole="button"
        onPress={() => onOpenImChat(item)}
        style={({ pressed }) => [
          styles.threadRow,
          {
            backgroundColor: item.isPinned ? '#F2F2F2' : '#FFFFFF',
            borderBottomColor: theme.colors.headerBorder,
          },
          pressed && styles.rowPressed,
        ]}
      >
        {/* 头像与在线呼吸点 */}
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
            <Image
              source={{ uri: item.avatarUri }}
              style={[
                styles.avatarImage,
                { borderRadius: theme.radii.avatarRadius },
              ]}
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
        </View>

        {/* 中间文字摘要 */}
        <View style={styles.copyContainer}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.titleText}>
              {item.title}
            </Text>
            {Boolean(item.lastMessageAt) && (
              <Text style={styles.timeText}>
                {formatWeChatTime(item.lastMessageAt!)}
              </Text>
            )}
          </View>
          <Text numberOfLines={1} style={styles.previewText}>
            {formattedPreview}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons color="#A1A1AA" name="chatbubbles-outline" size={40} style={styles.emptyIcon} />
      <Text style={styles.emptyTitle}>暂无伴侣聊天</Text>
      <Text style={styles.emptySubtitle}>
        挑选心仪伴侣或从通讯录开启对话，开启专属即时聊天。
      </Text>
      {Boolean(onOpenRoleLibrary) && (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenRoleLibrary}
          style={({ pressed }) => [styles.pickButton, pressed && styles.pressed]}
        >
          <Text style={styles.pickButtonText}>挑选伴侣</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <FlatList
      ListEmptyComponent={renderEmptyState}
      ListHeaderComponent={ListHeaderComponent}
      contentContainerStyle={[
        styles.listContent,
        contentContainerStyle,
        threads.length === 0 && styles.listContentEmpty,
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
    backgroundColor: '#FFFFFF',
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
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowPressed: {
    backgroundColor: '#EAEAEA',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#006948',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
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
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
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
    fontWeight: '500',
    color: '#111111',
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 12,
    color: '#B2B2B2',
  },
  previewText: {
    fontSize: 14,
    color: '#7F7F7F',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#FFFFFF',
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#18181B',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  pickButton: {
    backgroundColor: '#18181B',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 6,
  },
  pickButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.7,
  },
});
