import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { paginateDiaryText } from '../ai/diary/diaryPaginationService';
import { diaryRepository, type RoleDiaryRecord, type RoleDiaryVersionRecord } from '../ai/diary/diaryRepository';
import { DiaryDeckPager } from '../components/ai/DiaryDeckPager';
import { AppScreen } from '../components/AppScreen';
import { aiLightColors } from '../components/ai/aiLightTheme';
import { runWithDatabaseSpace, type PixorySpace } from '../database';
import { colors, metrics, spacing, typography } from '../design/tokens';

interface DiaryReaderScreenProps {
  space: PixorySpace;
  diaryId: string;
  onBack: () => void;
}

export function DiaryReaderScreen({ space, diaryId, onBack }: DiaryReaderScreenProps) {
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = useState<{ diary: RoleDiaryRecord; version: RoleDiaryVersionRecord } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const current = await runWithDatabaseSpace(space, (db) => diaryRepository.findDiaryVersion(db, diaryId));
      setEntry(current);
      setError(current ? null : '这篇日记暂时不可用。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '日记加载失败。');
    }
  }, [diaryId, space]);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppScreen backgroundColor={aiLightColors.canvas} contentStyle={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(spacing[3], insets.top + spacing[2]) }]}>
        <Pressable accessibilityLabel="返回聊天" accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Ionicons color={colors.text.primary} name="chevron-back" size={metrics.iconSizeMd} />
        </Pressable>
        <Text style={styles.title}>Diary</Text>
        <View style={styles.backButton} />
      </View>
      {entry ? (
        <DiaryDeckPager
          createdAt={entry.version.createdAt}
          diaryDate={entry.diary.diaryDate}
          fontKey={entry.diary.bodyFontKey}
          pages={paginateDiaryText(entry.version.body)}
          themeKey={entry.diary.themeKey}
        />
      ) : <View style={styles.empty}><Text style={styles.emptyText}>{error ?? '正在打开日记…'}</Text></View>}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  backButton: { alignItems: 'center', height: metrics.iconButtonSize, justifyContent: 'center', width: metrics.iconButtonSize },
  title: { ...typography.textStyles.sectionTitle, color: colors.text.secondary, fontFamily: typography.family.serif, letterSpacing: 0 },
  empty: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing[6] },
  emptyText: { ...typography.textStyles.body, color: colors.text.secondary, textAlign: 'center' },
});
