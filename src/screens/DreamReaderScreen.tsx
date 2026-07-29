import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { paginateDiaryText } from '../ai/diary/diaryPaginationService';
import { dreamRepository, type DreamRecord } from '../ai/dream/dreamRepository';
import { clearDreamRuntimeNotice } from '../ai/dream/dreamRuntimeEvents';
import { DreamDeckPager } from '../components/ai/DreamDeckPager';
import { AppScreen } from '../components/AppScreen';
import { runWithDatabaseSpace, type PixorySpace } from '../database';
import { colors, metrics, spacing, typography } from '../design/tokens';

interface DreamReaderScreenProps {
  space: PixorySpace;
  dreamId: string;
  onBack: () => void;
}

export function DreamReaderScreen({ space, dreamId, onBack }: DreamReaderScreenProps) {
  const [dream, setDream] = useState<DreamRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const item = await runWithDatabaseSpace(space, (db) => dreamRepository.find(db, dreamId));
      setDream(item);
      setError(item ? null : '这个梦境暂时不可用。');
      if (item) {
        await runWithDatabaseSpace(space, (db) => dreamRepository.markViewed(db, item.id));
        clearDreamRuntimeNotice(item.sourceThreadId, 'completed');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '梦境加载失败。');
    }
  }, [dreamId, space]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="返回聊天" accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Ionicons color={colors.text.primary} name="chevron-back" size={metrics.iconSizeMd} />
        </Pressable>
        <Text style={styles.title}>Dream</Text>
        <View style={styles.back} />
      </View>
      {dream ? (
        <DreamDeckPager
          contextOptIn={dream.contextOptIn}
          createdAt={dream.displayAt}
          onContextChoice={(accepted) => {
            void runWithDatabaseSpace(space, (db) => dreamRepository.setContextOptIn(db, dream.id, accepted))
              .then(() => setDream((current) => current ? { ...current, contextOptIn: accepted } : current));
          }}
          pages={paginateDiaryText(`${dream.title}\n\n${dream.body}`)}
        />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{error ?? '正在打开梦境…'}</Text>
          {error ? (
            <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryTouch}>
              <Text style={styles.retryText}>重试</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </AppScreen>
  );
}

// The reader uses an asset-specific moonlit palette that has no semantic app token.
const dreamPalette = { background: '#E7EAF2', title: '#4D5872' } as const;

const styles = StyleSheet.create({
  screen: { backgroundColor: dreamPalette.background, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  back: { alignItems: 'center', height: metrics.iconButtonSize, justifyContent: 'center', width: metrics.iconButtonSize },
  title: { ...typography.textStyles.sectionTitle, color: dreamPalette.title, fontFamily: typography.family.serif },
  empty: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing[6] },
  emptyText: { ...typography.textStyles.body, color: colors.text.secondary, textAlign: 'center' },
  retryTouch: { alignItems: 'center', minHeight: metrics.minTouchSize, justifyContent: 'center', paddingHorizontal: spacing[4] },
  retryText: { ...typography.textStyles.caption, color: colors.primary.default },
});
