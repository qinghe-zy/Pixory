import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ImageBackground, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { diaryRepository, type RoleDiaryVersionGroup } from '../ai/diary/diaryRepository';
import { beijingDiaryDate, beijingTimeLabel } from '../ai/diary/diaryTypes';
import { dreamAssets } from '../ai/dream/dreamAssets';
import { dreamRepository, type DreamVersionGroup } from '../ai/dream/dreamRepository';
import { thoughtRepository, type ThoughtRecord } from '../ai/thought/thoughtRepository';
import { AppScreen } from '../components/AppScreen';
import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import { colors, metrics, radius, rhythm, shadows, spacing, typography } from '../design/tokens';

type InnerLifeKind = 'diary' | 'thought' | 'dream';

interface CompanionInnerLifeScreenProps {
  space: PixorySpace;
  threadId: string;
  onBack: () => void;
  onOpenDiary: (id: string, versionId?: string) => void;
  onOpenDream: (id: string) => void;
}

function timeLabel(value: string): string {
  const dateKey = beijingDiaryDate(new Date(value));
  return dateKey === beijingDiaryDate(new Date())
    ? `TODAY · ${beijingTimeLabel(value)}`
    : `${dateKey.replaceAll('-', '.')} · ${beijingTimeLabel(value)}`;
}

function selectionKey(kind: InnerLifeKind, id: string): string {
  return `${kind}:${id}`;
}

export function CompanionInnerLifeScreen({
  space,
  threadId,
  onBack,
  onOpenDiary,
  onOpenDream,
}: CompanionInnerLifeScreenProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;
  const [activeKind, setActiveKind] = useState<InnerLifeKind>('diary');
  const [diaryGroups, setDiaryGroups] = useState<RoleDiaryVersionGroup[]>([]);
  const [dreamGroups, setDreamGroups] = useState<DreamVersionGroup[]>([]);
  const [thoughts, setThoughts] = useState<ThoughtRecord[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await runWithDatabaseSpace(space, async (db) => {
        const thread = await aiThreadRepository.findThreadById(db, threadId);
        if (!thread?.roleCardId) return { diaryGroups: [], dreamGroups: [], thoughts: [] };
        const [nextDiaryGroups, nextDreamGroups, roleThoughts] = await Promise.all([
          diaryRepository.listVersionGroupsForRole(db, thread.roleCardId),
          dreamRepository.listVersionGroupsForRole(db, thread.roleCardId),
          thoughtRepository.listForRole(db, thread.roleCardId, true),
        ]);
        return { diaryGroups: nextDiaryGroups, dreamGroups: nextDreamGroups, thoughts: roleThoughts };
      });
      setDiaryGroups(result.diaryGroups);
      setDreamGroups(result.dreamGroups);
      setThoughts(result.thoughts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '内心独白加载失败。');
    } finally {
      setLoading(false);
    }
  }, [space, threadId]);

  useEffect(() => { void load(); }, [load]);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedKeys(new Set());
  }, []);

  const changeKind = useCallback((kind: InnerLifeKind) => {
    setActiveKind(kind);
    exitSelection();
  }, [exitSelection]);

  const toggleSelected = useCallback((key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const enterSelection = useCallback((key: string) => {
    setSelectionMode(true);
    setSelectedKeys(new Set([key]));
  }, []);

  const activeCount = activeKind === 'diary'
    ? diaryGroups.reduce((count, group) => count + group.versions.length, 0)
    : activeKind === 'dream'
      ? dreamGroups.reduce((count, group) => count + group.versions.length, 0)
      : thoughts.length;

  const selectedCount = selectedKeys.size;
  const deleteSelected = useCallback(() => {
    if (selectedCount === 0) return;
    Alert.alert(
      `永久删除 ${selectedCount} 项？`,
      '删除后无法恢复，也不会进入回收站。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '永久删除',
          style: 'destructive',
          onPress: () => void runWithDatabaseSpace(space, async (db) => {
            const ids = [...selectedKeys]
              .filter((key) => key.startsWith(`${activeKind}:`))
              .map((key) => key.slice(activeKind.length + 1));
            if (activeKind === 'diary') await diaryRepository.permanentlyDeleteVersions(db, ids);
            if (activeKind === 'dream') await dreamRepository.permanentlyDeleteVersions(db, ids);
            if (activeKind === 'thought') {
              for (const id of ids) await thoughtRepository.permanentlyDelete(db, id);
            }
          }).then(() => {
            exitSelection();
            return load();
          }).catch((cause) => setError(cause instanceof Error ? cause.message : '永久删除失败，请稍后重试。')),
        },
      ],
    );
  }, [activeKind, exitSelection, load, selectedCount, selectedKeys, space]);

  const emptyText = activeKind === 'diary'
    ? '还没有写下的日记。'
    : activeKind === 'dream'
      ? '还没有留下的梦境。'
      : '还没有形成未说出口的念头。';

  const selectionHint = useMemo(
    () => selectionMode ? `已选择 ${selectedCount} 项` : '长按条目可多选并彻底删除',
    [selectedCount, selectionMode],
  );

  return (
    <AppScreen contentStyle={[styles.screen, { paddingTop: statusBarHeight }]} scrollable>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={selectionMode ? exitSelection : onBack} style={styles.headerTouch}>
          <Text style={styles.back}>{selectionMode ? '取消' : '返回'}</Text>
        </Pressable>
        <Text style={styles.title}>{selectionMode ? selectionHint : '内心独白'}</Text>
        {selectionMode ? (
          <Pressable accessibilityLabel="永久删除所选内容" accessibilityRole="button" disabled={selectedCount === 0} onPress={deleteSelected} style={styles.headerTouch}>
            <Text style={[styles.permanentDelete, selectedCount === 0 && styles.disabledText]}>删除</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityLabel="刷新内心独白" accessibilityRole="button" onPress={() => void load()} style={styles.headerTouch}>
            <Text style={styles.back}>刷新</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.tabsSection}>
        <View accessibilityRole="tablist" style={styles.chips}>
          {(['diary', 'thought', 'dream'] as const).map((kind) => (
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeKind === kind }} key={kind} onPress={() => changeKind(kind)} style={[styles.chip, activeKind === kind && styles.activeChip]}>
              <Text style={[styles.chipText, activeKind === kind && styles.activeChipText]}>{kind === 'diary' ? '日记' : kind === 'thought' ? '独白' : '梦境'}</Text>
            </Pressable>
          ))}
        </View>
        {!selectionMode ? <Text style={styles.selectionHint}>{selectionHint}</Text> : null}
      </View>
      <View style={styles.content}>
        {loading ? <Text accessibilityLiveRegion="polite" style={styles.empty}>正在整理…</Text> : null}
        {!loading && error ? <View style={styles.errorState}><Text style={styles.empty}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryTouch}><Text style={styles.retry}>重试</Text></Pressable></View> : null}

        {!loading && !error && activeKind === 'diary' ? diaryGroups.flatMap((group) => group.versions.map((version) => {
          const key = selectionKey('diary', version.id);
          const selected = selectedKeys.has(key);
          return <Pressable accessibilityLabel={`打开 ${group.diary.diaryDate} 的日记，第 ${version.versionNumber} 版`} accessibilityRole="button" accessibilityState={{ selected }} delayLongPress={500} key={key} onLongPress={() => enterSelection(key)} onPress={() => selectionMode ? toggleSelected(key) : onOpenDiary(group.diary.id, version.id)} style={({ pressed }) => [styles.entry, selected && styles.selectedEntry, pressed && styles.pressed]}>
            <Text style={styles.meta}>{timeLabel(version.createdAt)}</Text><Text style={styles.entryTitle}>{group.diary.diaryDate.replaceAll('-', '.')} 的日记 · {version.versionNumber}/{group.versions.length}</Text><Text style={styles.open}>{selectionMode ? (selected ? '已选' : '选择') : '打开'}</Text>
          </Pressable>;
        })) : null}

        {!loading && !error && activeKind === 'dream' ? dreamGroups.flatMap((group) => group.versions.map((dream) => {
          const key = selectionKey('dream', dream.id);
          const selected = selectedKeys.has(key);
          return <Pressable accessibilityLabel={`查看梦境：${dream.title}，第 ${dream.versionNumber} 版`} accessibilityRole="button" accessibilityState={{ selected }} delayLongPress={500} key={key} onLongPress={() => enterSelection(key)} onPress={() => selectionMode ? toggleSelected(key) : onOpenDream(dream.id)} style={({ pressed }) => [styles.dream, selected && styles.selectedEntry, pressed && styles.pressed]}>
            <ImageBackground imageStyle={styles.dreamImage} source={dreamAssets.moonlitBotanical} style={styles.dreamBackground}><View style={styles.dreamVeil}><Text style={styles.dreamMeta}>{timeLabel(dream.displayAt)}</Text><Text numberOfLines={1} style={styles.dreamTitle}>{dream.title}</Text><Text style={styles.dreamOpen}>{selectionMode ? (selected ? '已选' : '选择') : `${dream.versionNumber}/${group.versions.length}`}</Text></View></ImageBackground>
          </Pressable>;
        })) : null}

        {!loading && !error && activeKind === 'thought' ? thoughts.map((thought) => {
          const key = selectionKey('thought', thought.id);
          const selected = selectedKeys.has(key);
          return <Pressable accessibilityLabel="选择内心独白" accessibilityRole="button" accessibilityState={{ selected }} delayLongPress={500} key={key} onLongPress={() => enterSelection(key)} onPress={() => selectionMode ? toggleSelected(key) : undefined} style={({ pressed }) => [styles.thought, selected && styles.selectedEntry, thought.status === 'soft_deleted' && styles.deletedEntry, pressed && styles.pressed]}>
            <Text style={styles.meta}>{timeLabel(thought.createdAt)}</Text><Text style={styles.thoughtBody}>{thought.body}</Text>{selectionMode ? <Text style={styles.open}>{selected ? '已选' : '选择'}</Text> : null}
          </Pressable>;
        }) : null}
        {!loading && !error && activeCount === 0 ? <Text style={styles.empty}>{emptyText}</Text> : null}
      </View>
    </AppScreen>
  );
}

const dreamPalette = { meta: '#53617F', open: '#586A96', title: '#283149', veil: 'rgba(238,241,248,0.70)' } as const;
const styles = StyleSheet.create({
  screen: { flexGrow: 1, gap: 0, paddingHorizontal: spacing[4] }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[4] }, headerTouch: { alignItems: 'center', justifyContent: 'center', minHeight: metrics.minTouchSize, minWidth: metrics.minTouchSize }, back: { ...typography.textStyles.caption, color: colors.text.secondary }, title: { ...typography.textStyles.sectionTitle, color: colors.text.primary }, tabsSection: { marginTop: rhythm.fieldContentGap }, chips: { flexDirection: 'row', gap: rhythm.microGap }, content: { marginTop: rhythm.heroToListGap }, chip: { borderColor: colors.border.default, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, minHeight: metrics.minTouchSize, justifyContent: 'center', paddingHorizontal: spacing[3] }, activeChip: { backgroundColor: colors.primary.background, borderColor: colors.primary.default }, chipText: { ...typography.textStyles.caption, color: colors.text.secondary }, activeChipText: { color: colors.primary.default }, selectionHint: { ...typography.textStyles.micro, color: colors.text.tertiary, marginTop: spacing[2] }, entry: { backgroundColor: colors.background.surface, borderColor: colors.border.default, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, marginBottom: spacing[3], padding: spacing[4], ...shadows.sm }, selectedEntry: { borderColor: colors.primary.default, borderWidth: 1 }, pressed: { opacity: 0.76 }, meta: { ...typography.textStyles.micro, color: colors.text.tertiary }, entryTitle: { ...typography.textStyles.bodyStrong, color: colors.text.primary, marginTop: spacing[1] }, open: { ...typography.textStyles.caption, color: colors.primary.default, position: 'absolute', right: spacing[4], top: spacing[4] }, dream: { borderRadius: radius.sm, marginBottom: spacing[3], overflow: 'hidden', ...shadows.sm }, dreamBackground: { aspectRatio: 2.6, justifyContent: 'flex-end' }, dreamImage: { borderRadius: radius.sm }, dreamVeil: { backgroundColor: dreamPalette.veil, paddingHorizontal: spacing[3], paddingVertical: spacing[2] }, dreamMeta: { ...typography.textStyles.micro, color: dreamPalette.meta }, dreamTitle: { ...typography.textStyles.bodyStrong, color: dreamPalette.title, paddingRight: spacing[8] }, dreamOpen: { ...typography.textStyles.caption, color: dreamPalette.open, position: 'absolute', right: spacing[3], top: spacing[3] }, thought: { backgroundColor: colors.background.surface, borderColor: colors.border.default, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, marginBottom: spacing[3], padding: spacing[4] }, thoughtBody: { ...typography.textStyles.body, color: colors.text.primary, lineHeight: 24, marginTop: spacing[2] }, permanentDelete: { ...typography.textStyles.caption, color: colors.semantic.danger }, disabledText: { opacity: 0.4 }, deletedEntry: { opacity: 0.48 }, empty: { ...typography.textStyles.body, color: colors.text.tertiary, marginTop: 0, textAlign: 'center' }, errorState: { alignItems: 'center' }, retryTouch: { alignItems: 'center', justifyContent: 'center', minHeight: metrics.minTouchSize, paddingHorizontal: spacing[4] }, retry: { ...typography.textStyles.caption, color: colors.primary.default },
});
