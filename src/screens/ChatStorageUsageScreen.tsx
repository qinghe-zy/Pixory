import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import type { PixorySpace } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { listChatStorageUsage, type ChatStorageUsageItem } from '../services/storageUsageService';
import { formatDateTime, formatFileSize } from '../utils/formatters';

interface ChatStorageUsageScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onOpenChat: (threadId: string) => void;
}

export function ChatStorageUsageScreen({ space = 'normal', refreshToken, onBack, onOpenChat }: ChatStorageUsageScreenProps) {
  const { data, isLoading, errorMessage, reload } = useScreenLoad<ChatStorageUsageItem[]>(
    () => listChatStorageUsage(space),
    [space, refreshToken],
    {
      formatError: (error) => error instanceof Error ? `读取聊天记录失败：${error.message}` : '读取聊天记录失败',
      initialData: [],
    }
  );
  const items = data ?? [];
  const totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);

  return (
    <ScreenScaffold backgroundVariant="archive" decorativeTitle="Chat History" onBack={onBack} scrollable title="聊天记录">
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>全部聊天记录</Text>
        <Text style={styles.summaryValue}>{formatFileSize(totalBytes)}</Text>
      </View>

      <PageStateBlock
        emptyDescription="发生对话后，这里会显示所有聊天记录占用。"
        emptyIconName="chatbubble-ellipses-outline"
        emptyTitle="没有聊天记录"
        errorMessage={errorMessage}
        isEmpty={!isLoading && items.length === 0}
        loading={isLoading}
        loadingDescription="正在统计聊天记录占用…"
        loadingTitle="正在统计…"
        onRetry={reload}
      >
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item.threadId}
              onPress={() => onOpenChat(item.threadId)}
              style={({ pressed }) => [styles.ipRow, pressed && styles.pressed]}
            >
              <View style={styles.cover}>
                <Ionicons color={colors.text.secondary} name="chatbubble-ellipses-outline" size={22} />
              </View>
              <View style={styles.ipCopy}>
                <View style={styles.ipMainLine}>
                  <Text numberOfLines={1} style={styles.ipName}>{item.title}</Text>
                  <Text style={styles.ipBytes}>{formatFileSize(item.bytes)}</Text>
                </View>
                <Text numberOfLines={1} style={styles.ipMeta}>
                  {item.messageCount} 条消息 · 最后活动 {formatDateTime(item.updatedAt)}
                </Text>
              </View>
              <Ionicons color={colors.text.tertiary} name="chevron-forward" size={18} />
            </Pressable>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[1],
  },
  summaryLabel: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  summaryValue: {
    ...typography.textStyles.sectionTitle,
    color: colors.text.title,
  },
  list: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  ipRow: {
    alignItems: 'center',
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.listCardGap,
    minHeight: 72,
    padding: spacing[3],
  },
  cover: {
    alignItems: 'center',
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 50,
  },
  ipCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  ipMainLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.cardContentGap,
    justifyContent: 'space-between',
  },
  ipName: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    flex: 1,
  },
  ipBytes: {
    ...typography.textStyles.caption,
    color: colors.text.body,
    fontWeight: '800',
  },
  ipMeta: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.82,
  },
});
