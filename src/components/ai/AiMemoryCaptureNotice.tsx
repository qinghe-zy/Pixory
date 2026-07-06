import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiMemoryCaptureNoticeProps {
  count: number;
  items?: Array<{ id: string; content: string; kind?: 'added' | 'updated' | 'staled' | 'conflict' | 'local_fallback'; sourceMessageId?: string | null }>;
  onManage: () => void;
  onMarkInaccurate?: (memoryId: string) => void;
  onSave?: (memoryId: string, content: string) => void;
  onUndo: () => void;
  summary?: string | null;
}

function labelForKind(kind?: string): string {
  if (kind === 'updated') {
    return '记忆已更新';
  }
  if (kind === 'staled') {
    return '已修正';
  }
  if (kind === 'conflict') {
    return '记忆待确认';
  }
  if (kind === 'local_fallback') {
    return '已用本地方式整理记忆';
  }
  return '已记住';
}

function formatSummary(summary?: string | null): string {
  const normalized = (summary ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

export function AiMemoryCaptureNotice({ count, items = [], onManage, onMarkInaccurate, onSave, onUndo, summary }: AiMemoryCaptureNoticeProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const summaryText = formatSummary(summary);
  const visibleItems = useMemo(() => items.slice(0, 4), [items]);
  const headline = labelForKind(items[0]?.kind);
  return (
    <View style={styles.container}>
      <View style={styles.wrap}>
        <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={styles.noticeTextButton}>
          <Text numberOfLines={1} style={styles.text}>
            {summaryText ? `${headline}：${summaryText}${count > 1 ? ` +${count - 1}` : ''}` : `${headline} ${count} 条内容`}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onUndo} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={styles.actionText}>撤销</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onManage} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={styles.actionText}>管理</Text>
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>记忆反馈</Text>
          {visibleItems.map((item) => (
            <View key={item.id} style={styles.memoryRow}>
              {editingId === item.id ? (
                <TextInput
                  multiline
                  onChangeText={setDraft}
                  selectionColor={aiLightColors.primary}
                  style={styles.input}
                  textAlignVertical="top"
                  value={draft}
                />
              ) : (
                <Text style={styles.memoryText}>{labelForKind(item.kind)}：{item.content}</Text>
              )}
              <View style={styles.rowActions}>
                {editingId === item.id ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        const next = draft.trim();
                        if (next) {
                          onSave?.(item.id, next);
                        }
                        setEditingId(null);
                      }}
                      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                    >
                      <Text style={styles.actionText}>保存</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setEditingId(null)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                      <Text style={styles.actionText}>取消</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setEditingId(item.id);
                        setDraft(item.content);
                      }}
                      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                    >
                      <Text style={styles.actionText}>编辑记忆</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => onMarkInaccurate?.(item.id)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                      <Text style={styles.actionText}>不准确</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    gap: rhythm.microGap,
    maxWidth: 360,
  },
  wrap: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.microGap,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  noticeTextButton: {
    maxWidth: 220,
  },
  text: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  panel: {
    backgroundColor: aiLightColors.card,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.compactGridGap,
    padding: spacing[3],
  },
  panelTitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '600',
  },
  memoryRow: {
    gap: rhythm.microGap,
  },
  memoryText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rhythm.microGap,
  },
  input: {
    ...typography.textStyles.caption,
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: aiLightColors.ink,
    minHeight: 54,
    padding: spacing[2],
  },
  action: {
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[1],
  },
  actionText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.78,
  },
});
