import { useCallback, useEffect, useState } from 'react';
import { Alert, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';

import { diaryRepository, type RoleDiaryRecord } from '../ai/diary/diaryRepository';
import { beijingDiaryDate, beijingTimeLabel } from '../ai/diary/diaryTypes';
import { dreamAssets } from '../ai/dream/dreamAssets';
import { dreamRepository, type DreamRecord } from '../ai/dream/dreamRepository';
import { thoughtRepository, type ThoughtRecord } from '../ai/thought/thoughtRepository';
import { AppScreen } from '../components/AppScreen';
import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import { colors, metrics, radius, rhythm, shadows, spacing, typography } from '../design/tokens';

type InnerLifeKind = 'diary' | 'thought' | 'dream';

interface CompanionInnerLifeScreenProps {
  space: PixorySpace;
  threadId: string;
  onBack: () => void;
  onOpenDiary: (id: string) => void;
  onOpenDream: (id: string) => void;
}

function timeLabel(value: string): string {
  const dateKey = beijingDiaryDate(new Date(value));
  return dateKey === beijingDiaryDate(new Date())
    ? `TODAY · ${beijingTimeLabel(value)}`
    : `${dateKey.replaceAll('-', '.')} · ${beijingTimeLabel(value)}`;
}

export function CompanionInnerLifeScreen({
  space,
  threadId,
  onBack,
  onOpenDiary,
  onOpenDream,
}: CompanionInnerLifeScreenProps) {
  const [activeKind, setActiveKind] = useState<InnerLifeKind>('diary');
  const [diaries, setDiaries] = useState<RoleDiaryRecord[]>([]);
  const [dreams, setDreams] = useState<DreamRecord[]>([]);
  const [thoughts, setThoughts] = useState<ThoughtRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runWithDatabaseSpace(space, async (db) => {
        const thread = await aiThreadRepository.findThreadById(db, threadId);
        if (!thread?.roleCardId) return { diaries: [], dreams: [], thoughts: [] };
        const [roleDiaries, roleDreams, roleThoughts] = await Promise.all([
          diaryRepository.listCurrentDiariesForRole(db, thread.roleCardId),
          dreamRepository.listForRole(db, thread.roleCardId),
          thoughtRepository.listForRole(db, thread.roleCardId, true),
        ]);
        return {
          diaries: roleDiaries.slice(0, 100),
          dreams: roleDreams.slice(0, 100),
          thoughts: roleThoughts.slice(0, 100),
        };
      });
      setDiaries(result.diaries);
      setDreams(result.dreams);
      setThoughts(result.thoughts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '内心独白加载失败。');
    } finally {
      setLoading(false);
    }
  }, [space, threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmPermanentDeleteThought = (thought: ThoughtRecord) => {
    Alert.alert('永久删除独白？', '删除后无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除',
        style: 'destructive',
        onPress: () => void runWithDatabaseSpace(space, (db) => thoughtRepository.permanentlyDelete(db, thought.id)).then(load),
      },
    ]);
  };

  const activeCount = activeKind === 'diary' ? diaries.length : activeKind === 'dream' ? dreams.length : thoughts.length;
  const emptyText = activeKind === 'diary'
    ? '还没有写下的日记。'
    : activeKind === 'dream'
      ? '还没有留下的梦境。'
      : '还没有形成未说出口的念头。';

  return (
    <AppScreen contentStyle={styles.screen} scrollable>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.headerTouch}>
          <Text style={styles.back}>返回</Text>
        </Pressable>
        <Text style={styles.title}>内心独白</Text>
        <Pressable accessibilityLabel="刷新内心独白" accessibilityRole="button" onPress={() => void load()} style={styles.headerTouch}>
          <Text style={styles.back}>刷新</Text>
        </Pressable>
      </View>
      <View accessibilityRole="tablist" style={styles.chips}>
        {(['diary', 'thought', 'dream'] as const).map((kind) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: activeKind === kind }}
            key={kind}
            onPress={() => setActiveKind(kind)}
            style={[styles.chip, activeKind === kind && styles.activeChip]}
          >
            <Text style={[styles.chipText, activeKind === kind && styles.activeChipText]}>
              {kind === 'diary' ? '日记' : kind === 'thought' ? '独白' : '梦境'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? <Text accessibilityLiveRegion="polite" style={styles.empty}>正在整理…</Text> : null}
      {!loading && error ? (
        <View style={styles.errorState}>
          <Text style={styles.empty}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryTouch}>
            <Text style={styles.retry}>重试</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && activeKind === 'diary' ? diaries.map((diary) => (
        <Pressable
          accessibilityLabel={`打开 ${diary.diaryDate} 的日记`}
          accessibilityRole="button"
          key={diary.id}
          onPress={() => onOpenDiary(diary.id)}
          style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
        >
          <Text style={styles.meta}>{timeLabel(diary.updatedAt)}</Text>
          <Text style={styles.entryTitle}>{diary.diaryDate.replaceAll('-', '.')} 的日记</Text>
          <Text style={styles.open}>打开</Text>
        </Pressable>
      )) : null}

      {!loading && !error && activeKind === 'dream' ? dreams.map((dream) => (
        <View key={dream.id} style={styles.dreamHost}>
          <Pressable
            accessibilityLabel={`查看梦境：${dream.title}`}
            accessibilityRole="button"
            onPress={() => onOpenDream(dream.id)}
            style={({ pressed }) => [styles.dream, pressed && styles.pressed]}
          >
            <ImageBackground imageStyle={styles.dreamImage} source={dreamAssets.moonlitBotanical} style={styles.dreamBackground}>
              <View style={styles.dreamVeil}>
                <Text style={styles.dreamMeta}>{timeLabel(dream.displayAt)}</Text>
                <Text numberOfLines={1} style={styles.dreamTitle}>{dream.title}</Text>
                <Text style={styles.dreamOpen}>查看梦境</Text>
              </View>
            </ImageBackground>
          </Pressable>
          <Pressable
            accessibilityLabel={`删除梦境：${dream.title}`}
            accessibilityRole="button"
            onPress={() => void runWithDatabaseSpace(space, (db) => dreamRepository.softDelete(db, dream.id)).then(load)}
            style={styles.deleteTouch}
          >
            <Text style={styles.delete}>删除</Text>
          </Pressable>
        </View>
      )) : null}

      {!loading && !error && activeKind === 'thought' ? thoughts.map((thought) => (
        <View key={thought.id} style={[styles.thought, thought.status === 'soft_deleted' && styles.deletedEntry]}>
          <Text style={styles.meta}>{timeLabel(thought.createdAt)}</Text>
          <Text style={styles.thoughtBody}>{thought.body}</Text>
          <View style={styles.thoughtActions}>
            <Pressable
              accessibilityLabel={thought.status === 'soft_deleted' ? '恢复这条独白' : '删除这条独白'}
              accessibilityRole="button"
              onPress={() => void runWithDatabaseSpace(space, (db) => thought.status === 'soft_deleted'
                ? thoughtRepository.restore(db, thought.id)
                : thoughtRepository.softDelete(db, thought.id)).then(load)}
              style={styles.thoughtActionTouch}
            >
              <Text style={styles.delete}>{thought.status === 'soft_deleted' ? '恢复' : '删除'}</Text>
            </Pressable>
            {thought.status === 'soft_deleted' ? (
              <Pressable accessibilityLabel="永久删除这条独白" accessibilityRole="button" onPress={() => confirmPermanentDeleteThought(thought)} style={styles.thoughtActionTouch}>
                <Text style={styles.permanentDelete}>永久删除</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )) : null}

      {!loading && !error && activeCount === 0 ? <Text style={styles.empty}>{emptyText}</Text> : null}
    </AppScreen>
  );
}

// These colors belong to the supplied dream artwork and have no semantic app-token equivalent.
const dreamPalette = {
  meta: '#53617F',
  open: '#586A96',
  title: '#283149',
  veil: 'rgba(238,241,248,0.70)',
} as const;

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: spacing[4] },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[4] },
  headerTouch: { alignItems: 'center', justifyContent: 'center', minHeight: metrics.minTouchSize, minWidth: metrics.minTouchSize },
  back: { ...typography.textStyles.caption, color: colors.text.secondary },
  title: { ...typography.textStyles.sectionTitle, color: colors.text.primary },
  chips: { flexDirection: 'row', gap: rhythm.microGap, marginBottom: spacing[5] },
  chip: { borderColor: colors.border.default, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, minHeight: metrics.minTouchSize, justifyContent: 'center', paddingHorizontal: spacing[3] },
  activeChip: { backgroundColor: colors.primary.background, borderColor: colors.primary.default },
  chipText: { ...typography.textStyles.caption, color: colors.text.secondary },
  activeChipText: { color: colors.primary.default },
  entry: { backgroundColor: colors.background.surface, borderColor: colors.border.default, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, marginBottom: spacing[3], padding: spacing[4], ...shadows.sm },
  pressed: { opacity: 0.76 },
  meta: { ...typography.textStyles.micro, color: colors.text.tertiary },
  entryTitle: { ...typography.textStyles.bodyStrong, color: colors.text.primary, marginTop: spacing[1] },
  open: { ...typography.textStyles.caption, color: colors.primary.default, position: 'absolute', right: spacing[4], top: spacing[4] },
  dreamHost: { marginBottom: spacing[3] },
  dream: { borderRadius: radius.sm, overflow: 'hidden', ...shadows.sm },
  dreamBackground: { aspectRatio: 2.6, justifyContent: 'flex-end' },
  dreamImage: { borderRadius: radius.sm },
  dreamVeil: { backgroundColor: dreamPalette.veil, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  dreamMeta: { ...typography.textStyles.micro, color: dreamPalette.meta },
  dreamTitle: { ...typography.textStyles.bodyStrong, color: dreamPalette.title, paddingRight: spacing[8] },
  dreamOpen: { ...typography.textStyles.caption, color: dreamPalette.open, position: 'absolute', right: spacing[3], top: spacing[3] },
  deleteTouch: { alignSelf: 'flex-end', minHeight: metrics.minTouchSize, justifyContent: 'center', paddingHorizontal: spacing[2] },
  delete: { ...typography.textStyles.micro, color: colors.text.tertiary },
  thought: { backgroundColor: colors.background.surface, borderColor: colors.border.default, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, marginBottom: spacing[3], padding: spacing[4] },
  thoughtBody: { ...typography.textStyles.body, color: colors.text.primary, lineHeight: 24, marginTop: spacing[2] },
  thoughtActions: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: rhythm.microGap, marginTop: spacing[2] },
  thoughtActionTouch: { alignItems: 'center', justifyContent: 'center', minHeight: metrics.minTouchSize, minWidth: metrics.minTouchSize, paddingHorizontal: spacing[2] },
  permanentDelete: { ...typography.textStyles.micro, color: colors.semantic.danger },
  deletedEntry: { opacity: 0.48 },
  empty: { ...typography.textStyles.body, color: colors.text.tertiary, marginTop: spacing[7], textAlign: 'center' },
  errorState: { alignItems: 'center' },
  retryTouch: { alignItems: 'center', justifyContent: 'center', minHeight: metrics.minTouchSize, paddingHorizontal: spacing[4] },
  retry: { ...typography.textStyles.caption, color: colors.primary.default },
});
