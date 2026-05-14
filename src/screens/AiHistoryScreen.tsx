import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FilterChip } from '../components/FilterChip';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { archiveAiThread, listAiHistoryThreads, unarchiveAiThread } from '../ai/aiChatService';
import type { AiThreadHistoryFilter, AiThreadHistoryItem } from '../database/repositories/aiThreadRepository';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';

interface AiHistoryScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onOpenThread: (thread: AiThreadHistoryItem) => void;
}

const FILTERS: Array<{ key: AiThreadHistoryFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'normal', label: '普通聊天' },
  { key: 'ip', label: 'IP 聊天' },
  { key: 'knowledge_base', label: '知识库' },
  { key: 'customer_project', label: '项目' },
  { key: 'archived', label: '已归档' },
];

export function AiHistoryScreen({ space, onBack, onOpenThread }: AiHistoryScreenProps) {
  const [filter, setFilter] = useState<AiThreadHistoryFilter>('all');
  const [items, setItems] = useState<AiThreadHistoryItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const spaceLabel = space === 'personal' ? '私密空间' : '普通空间';

  const reload = useCallback(async () => {
    setItems(await listAiHistoryThreads({ filter, space }));
  }, [filter, space]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggleArchive(thread: AiThreadHistoryItem) {
    if (thread.archivedAt) {
      await unarchiveAiThread(space, thread.id);
      setStatus('会话已恢复。');
    } else {
      await archiveAiThread(space, thread.id);
      setStatus('会话已归档。');
    }
    await reload();
  }

  return (
    <ScreenScaffold
      backgroundVariant="search"
      decorativeTitle="AI"
      onBack={onBack}
      scrollable
      subtitle={`${spaceLabel} · 历史会话`}
      title="历史会话"
    >
      <View style={styles.filterRow}>
        {FILTERS.map((item) => (
          <FilterChip active={filter === item.key} dense key={item.key} label={item.label} onPress={() => setFilter(item.key)} />
        ))}
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.list}>
        {items.length ? (
          items.map((thread) => (
            <View key={thread.id} style={styles.row}>
              <Pressable accessibilityRole="button" onPress={() => onOpenThread(thread)} style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
                <View style={styles.iconWrap}>
                  <Ionicons color={colors.primary.active} name={iconForContext(thread.contextType)} size={20} />
                </View>
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={styles.title}>{thread.title}</Text>
                  <Text numberOfLines={1} style={styles.meta}>
                    {labelForContext(thread)} · {thread.updatedAt}
                  </Text>
                  {thread.lastMessagePreview ? <Text numberOfLines={2} style={styles.preview}>{thread.lastMessagePreview}</Text> : null}
                </View>
              </Pressable>
              <PrimaryButton
                label={thread.archivedAt ? '恢复' : '归档'}
                onPress={() => {
                  void toggleArchive(thread);
                }}
                variant="ghost"
              />
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.title}>没有历史会话</Text>
            <Text style={styles.meta}>开始普通聊天、IP 聊天或知识库会话后，会在这里按当前空间显示。</Text>
          </View>
        )}
      </View>
    </ScreenScaffold>
  );
}

function iconForContext(contextType: AiThreadHistoryItem['contextType']): keyof typeof Ionicons.glyphMap {
  if (contextType === 'ip') {
    return 'albums-outline';
  }
  if (contextType === 'knowledge_base') {
    return 'library-outline';
  }
  return 'chatbubble-ellipses-outline';
}

function labelForContext(thread: AiThreadHistoryItem): string {
  if (thread.contextType === 'ip') {
    return 'IP 聊天';
  }
  if (thread.contextType === 'knowledge_base') {
    return thread.knowledgeCategory === 'customer_project' ? '项目知识库' : '知识库';
  }
  return '普通聊天';
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.compactGridGap,
  },
  status: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  list: {
    gap: rhythm.listCardGap,
  },
  row: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.cardContentGap,
    padding: spacing[3],
  },
  rowMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: rhythm.inlineGap,
  },
  pressed: {
    opacity: 0.78,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  copy: {
    flex: 1,
    gap: rhythm.microGap,
  },
  title: {
    ...typography.textStyles.bodyStrong,
  },
  meta: {
    ...typography.textStyles.caption,
  },
  preview: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  emptyCard: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[4],
  },
});
