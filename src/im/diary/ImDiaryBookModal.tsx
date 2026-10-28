import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PixorySpace } from '../../database';
import type { DiarySpreadPair, ImCompanionDiary } from './types';
import { getCompanionDiaries } from './repository/imDiaryRepository';
import { buildDiarySpreads } from './engine/imDiaryPagination';
import { computeViewportSpreads, computeBookThicknessLayers } from './engine/imDiaryViewportWindow';
import { generateCompanionDailyDiary } from './engine/imDiaryGenerator';
import { ImDiaryLeatherBinder } from './components/ImDiaryLeatherBinder';
import { ImDiaryPageCurlEngine } from './engine/ImDiaryPageCurlEngine';
import { ImDiaryScrubberBar } from './components/ImDiaryScrubberBar';
import { ImDiaryDatePickerModal } from './components/ImDiaryDatePickerModal';

export interface ImDiaryBookModalProps {
  visible: boolean;
  onClose: () => void;
  space: PixorySpace;
  threadId: string;
  roleCardId: string;
  companionName: string;
  companionAvatarUri?: string | null;
  onDiaryGenerated?: () => void;
}

export function ImDiaryBookModal({
  visible,
  onClose,
  space,
  threadId,
  roleCardId,
  companionName,
  onDiaryGenerated,
}: ImDiaryBookModalProps) {
  const insets = useSafeAreaInsets();
  const [spreads, setSpreads] = useState<DiarySpreadPair[]>([]);
  const [diariesList, setDiariesList] = useState<ImCompanionDiary[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const loadDiaries = useCallback(async () => {
    try {
      const diaries = await getCompanionDiaries(space, threadId, 50);
      setDiariesList(diaries);
      const allSpreads: DiarySpreadPair[] = [];
      for (const d of diaries) allSpreads.push(...buildDiarySpreads(d));
      setSpreads(allSpreads);
      setCurrentIndex(Math.max(0, allSpreads.length - 1));
    } finally {
      setLoading(false);
    }
  }, [space, threadId]);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      void loadDiaries();
    }
  }, [visible, loadDiaries]);

  const handleGenerateDiary = async () => {
    try {
      setGenerating(true);
      await generateCompanionDailyDiary({ space, threadId, roleCardId, roleName: companionName });
      await loadDiaries();
      onDiaryGenerated?.();
      if (Platform.OS === 'android') ToastAndroid.show('已为您补写今日日记', ToastAndroid.SHORT);
    } catch {
      // 容错静默
    } finally {
      setGenerating(false);
    }
  };

  const viewport = useMemo(() => computeViewportSpreads(spreads, currentIndex), [spreads, currentIndex]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false} visible={visible}>
      <View style={[styles.modalScreen, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.topNav}>
          <Pressable accessibilityLabel="关闭日记本" onPress={onClose} style={styles.closeBtn}>
            <Ionicons color="#1E293B" name="close" size={22} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text style={styles.navTitle}>{companionName} 的伴侣日记</Text>
            <Text style={styles.navSubtitle}>{spreads.length > 0 ? `相伴记录 · ${spreads.length} 篇回忆` : '伴侣专属生活日记'}</Text>
          </View>
          <Pressable accessibilityLabel="补写今日日记" disabled={generating} onPress={handleGenerateDiary} style={styles.actionBtn}>
            <Ionicons color="#1E293B" name={generating ? 'hourglass-outline' : 'sparkles-outline'} size={19} />
          </Pressable>
        </View>

        <View style={styles.bookWrapper}>
          <ImDiaryLeatherBinder thicknessLayers={computeBookThicknessLayers(spreads.length).paperEdgeCount}>
            {loading ? (
              <View style={styles.emptyContainer}>
                <Ionicons color="#94A3B8" name="book-outline" size={38} style={{ marginBottom: 10 }} />
                <Text style={styles.loadingText}>正在翻开伴侣日记...</Text>
              </View>
            ) : viewport.currSpread ? (
              <ImDiaryPageCurlEngine
                canNext={viewport.canNext} canPrev={viewport.canPrev}
                currSpread={viewport.currSpread} nextSpread={viewport.nextSpread} prevSpread={viewport.prevSpread}
                onTurnNext={() => setCurrentIndex((prev) => Math.min(spreads.length - 1, prev + 1))}
                onTurnPrev={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              />
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>📖</Text>
                <Text style={styles.emptyTitle}>日记本还是空白的</Text>
                <Text style={styles.emptyDesc}>多和 {companionName} 聊聊天，今晚会为你写下专属日记</Text>
                <Pressable accessibilityRole="button" disabled={generating} onPress={handleGenerateDiary} style={styles.generateBtn}>
                  <Ionicons color="#FFFFFF" name="sparkles" size={14} style={{ marginRight: 6 }} />
                  <Text style={styles.generateBtnText}>{generating ? '正在撰写中...' : '唤醒伴侣即刻补写'}</Text>
                </Pressable>
              </View>
            )}
          </ImDiaryLeatherBinder>
        </View>

        <ImDiaryScrubberBar
          canNext={viewport.canNext} canPrev={viewport.canPrev}
          currentDateStr={viewport.currSpread?.leftPage.dateStr}
          currentIndex={viewport.currentIndex} totalSpreads={viewport.totalSpreads}
          onNext={() => setCurrentIndex((prev) => Math.min(spreads.length - 1, prev + 1))}
          onOpenDatePicker={() => setDatePickerVisible(true)}
          onPrev={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
        />
        <ImDiaryDatePickerModal
          currentDateStr={viewport.currSpread?.leftPage.dateStr}
          diaries={diariesList}
          onClose={() => setDatePickerVisible(false)}
          onSelectDate={(targetDate) => {
            const targetIdx = spreads.findIndex(
              (s) => s.leftPage.dateStr === targetDate || s.rightPage.dateStr === targetDate
            );
            if (targetIdx !== -1) setCurrentIndex(targetIdx);
          }}
          visible={datePickerVisible}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScreen: { flex: 1, backgroundColor: '#F1F5F9', paddingHorizontal: 6 },
  topNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingBottom: 10 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  actionBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  navCenter: { alignItems: 'center' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  navSubtitle: { fontSize: 11, color: '#64748B', marginTop: 1 },
  bookWrapper: { flex: 1, marginVertical: 6 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  loadingText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  generateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  generateBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
