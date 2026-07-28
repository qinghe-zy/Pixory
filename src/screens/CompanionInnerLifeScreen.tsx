import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { diaryRepository, type RoleDiaryRecord } from '../ai/diary/diaryRepository';
import { beijingDiaryDate, beijingTimeLabel } from '../ai/diary/diaryTypes';
import { AppScreen } from '../components/AppScreen';
import { aiThreadRepository, runWithDatabaseSpace, type PixorySpace } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';

interface CompanionInnerLifeScreenProps {
  space: PixorySpace;
  threadId: string;
  onBack: () => void;
  onOpenDiary: (diaryId: string) => void;
}

export function CompanionInnerLifeScreen({ space, threadId, onBack, onOpenDiary }: CompanionInnerLifeScreenProps) {
  const [diaries, setDiaries] = useState<RoleDiaryRecord[]>([]);
  const [activeKind] = useState<'diary' | 'thought' | 'dream'>('diary');
  const load = useCallback(async () => {
    const entries = await runWithDatabaseSpace(space, async (db) => {
      const thread = await aiThreadRepository.findThreadById(db, threadId);
      return thread?.roleCardId ? diaryRepository.listCurrentDiariesForRole(db, thread.roleCardId) : [];
    });
    setDiaries(entries);
  }, [space, threadId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.header}><Pressable onPress={onBack}><Text style={styles.back}>返回</Text></Pressable><Text style={styles.title}>内心独白</Text><View style={styles.balance} /></View>
      <View style={styles.chips}>
        {(['diary', 'thought', 'dream'] as const).map((kind) => <View key={kind} style={[styles.chip, activeKind === kind && styles.activeChip]}><Text style={[styles.chipText, activeKind === kind && styles.activeChipText]}>{kind === 'diary' ? '日记' : kind === 'thought' ? '独白' : '梦境'}</Text></View>)}
      </View>
      {diaries.map((diary) => {
        const today = diary.diaryDate === beijingDiaryDate(new Date());
        return <Pressable key={diary.id} onPress={() => onOpenDiary(diary.id)} style={({ pressed }) => [styles.entry, pressed && styles.pressed]}>
          <Text style={styles.entryDate}>{today ? `TODAY · ${beijingTimeLabel(diary.updatedAt)}` : diary.diaryDate.replaceAll('-', '.')}</Text>
          <Text style={styles.entryTitle}>Diary</Text>
          <Text style={styles.entryAction}>打开</Text>
        </Pressable>;
      })}
      {activeKind !== 'diary' || diaries.length === 0 ? <Text style={styles.empty}>{activeKind === 'diary' ? '还没有写下的日记。' : '这个篇章会在之后慢慢长出来。'}</Text> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing[4] },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[4] },
  back: { ...typography.textStyles.caption, color: colors.text.secondary },
  balance: { width: 28 },
  title: { ...typography.textStyles.sectionTitle, color: colors.text.primary },
  chips: { flexDirection: 'row', gap: rhythm.microGap, marginBottom: spacing[5] },
  chip: { borderColor: colors.border.default, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  activeChip: { backgroundColor: colors.primary.background, borderColor: colors.primary.default },
  chipText: { ...typography.textStyles.caption, color: colors.text.secondary },
  activeChipText: { color: colors.primary.default },
  entry: { backgroundColor: colors.background.surface, borderColor: colors.border.default, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, marginBottom: spacing[3], padding: spacing[4] },
  pressed: { opacity: 0.76 },
  entryDate: { ...typography.textStyles.micro, color: colors.text.tertiary },
  entryTitle: { ...typography.textStyles.bodyStrong, color: colors.text.primary, marginTop: spacing[1] },
  entryAction: { ...typography.textStyles.caption, color: colors.primary.default, position: 'absolute', right: spacing[4], top: spacing[4] },
  empty: { ...typography.textStyles.body, color: colors.text.tertiary, marginTop: spacing[7], textAlign: 'center' },
});
