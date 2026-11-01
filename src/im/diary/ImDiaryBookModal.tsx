import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PixorySpace } from '../../database';
import type { DiarySpreadPair, ImCompanionDiary } from './types';
import { getCompanionDiaries } from './repository/imDiaryRepository';
import { buildDiarySpreads } from './engine/imDiaryPagination';
import { computeViewportSpreads, computeBookThicknessLayers } from './engine/imDiaryViewportWindow';
import { ImDiaryLeatherBinder } from './components/ImDiaryLeatherBinder';
import { ImDiaryPageCurlEngine } from './engine/ImDiaryPageCurlEngine';
import { ImDiaryScrubberBar } from './components/ImDiaryScrubberBar';
import { ImDiaryDatePickerModal } from './components/ImDiaryDatePickerModal';
import { useDiaryActions } from './hooks/useDiaryActions';
import { toLocalDateStr } from './engine/diaryDayWindow';

export interface ImDiaryBookModalProps {
  visible: boolean;
  onClose: () => void;
  space: PixorySpace;
  threadId: string;
  roleCardId: string;
  companionName: string;
  companionAvatarUri?: string | null;
  onDiaryGenerated?: () => void;
  onChatWithDiary?: (dateKey: string, title: string, excerpt: string) => void;
}

export function ImDiaryBookModal({
  visible,
  onClose,
  space,
  threadId,
  roleCardId,
  companionName,
  onDiaryGenerated,
  onChatWithDiary,
}: ImDiaryBookModalProps) {
  const insets = useSafeAreaInsets();
  const [spreads, setSpreads] = useState<DiarySpreadPair[]>([]);
  const [diariesList, setDiariesList] = useState<ImCompanionDiary[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const loadDiaries = useCallback(async (targetDateStr?: string) => {
    try {
      const diaries = await getCompanionDiaries(space, threadId, 50);
      setDiariesList(diaries);
      const allSpreads: DiarySpreadPair[] = [];
      for (const d of diaries) allSpreads.push(...buildDiarySpreads(d));
      setSpreads(allSpreads);

      if (targetDateStr) {
        const found = allSpreads.findIndex((s) => s.leftPage.dateStr === targetDateStr || s.rightPage.dateStr === targetDateStr);
        if (found !== -1) setCurrentIndex(found);
      } else if (allSpreads.length > 0) {
        setCurrentIndex(allSpreads.length - 1);
      }
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

  const { generating, handleGenerateDiary, openActionMenu } = useDiaryActions({
    space,
    threadId,
    roleCardId,
    companionName,
    onRefreshList: loadDiaries,
    onDiaryGenerated,
  });

  const viewport = useMemo(() => computeViewportSpreads(spreads, currentIndex), [spreads, currentIndex]);
  const currentDateStr = viewport.currSpread?.leftPage.dateStr;
  const currentDiary = useMemo(() => diariesList.find((d) => d.diaryDate === currentDateStr), [diariesList, currentDateStr]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false} visible={visible}>
      <View style={[styles.modalScreen, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.topNav}>
          <Pressable accessibilityLabel="关闭日记本" accessibilityRole="button" onPress={onClose} style={styles.navBtn}>
            <Ionicons color="#1E293B" name="close" size={22} />
          </Pressable>
          <View style={styles.navCenter}>
            <Text style={styles.navTitle}>{companionName} 的伴侣日记</Text>
            <Text style={styles.navSubtitle}>{diariesList.length > 0 ? `相伴记录 · ${diariesList.length} 篇回忆` : '伴侣专属生活日记'}</Text>
          </View>
          <Pressable accessibilityLabel="手账操作菜单" accessibilityRole="button" disabled={generating} onPress={() => openActionMenu(currentDiary, currentDateStr)} style={styles.navBtn}>
            <Ionicons color="#1E293B" name={generating ? 'hourglass-outline' : 'ellipsis-horizontal'} size={20} />
          </Pressable>
        </View>

        <View style={styles.bookWrapper}>
          <ImDiaryLeatherBinder thicknessLayers={computeBookThicknessLayers(spreads.length).paperEdgeCount}>
            {loading || generating ? (
              <View style={styles.emptyContainer}>
                <Ionicons color="#64748B" name={generating ? 'sparkles' : 'book-outline'} size={38} style={{ marginBottom: 10 }} />
                <Text style={styles.loadingText}>{generating ? '伴侣正在落笔撰写中...' : '正在翻开伴侣日记...'}</Text>
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
                <Pressable accessibilityRole="button" disabled={generating} onPress={() => void handleGenerateDiary(toLocalDateStr())} style={styles.generateBtn}>
                  <Ionicons color="#FFFFFF" name="sparkles" size={14} style={{ marginRight: 6 }} />
                  <Text style={styles.generateBtnText}>唤醒伴侣即刻补写</Text>
                </Pressable>
              </View>
            )}
          </ImDiaryLeatherBinder>
        </View>

        {Boolean(viewport.currSpread && onChatWithDiary) && (
          <View style={styles.resonanceBar}>
            <Pressable
              accessibilityLabel={`带着这篇手账找 ${companionName} 聊聊`} accessibilityRole="button"
              onPress={() => {
                const dateKey = viewport.currSpread?.leftPage.dateStr || '';
                const title = viewport.currSpread?.leftPage.title || `${companionName}的手账`;
                const excerpt = viewport.currSpread?.leftPage.paragraphs[0] || '';
                onClose();
                onChatWithDiary?.(dateKey, title, excerpt);
              }}
              style={({ pressed }) => [styles.resonanceBtn, pressed && styles.resonanceBtnPressed]}
            >
              <Ionicons color="#0F172A" name="chatbubble-ellipses-outline" size={16} style={{ marginRight: 6 }} />
              <Text style={styles.resonanceBtnText}>带着这篇手账找 {companionName} 聊聊</Text>
            </Pressable>
          </View>
        )}

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
            const targetIdx = spreads.findIndex((s) => s.leftPage.dateStr === targetDate || s.rightPage.dateStr === targetDate);
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
  navBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  navCenter: { alignItems: 'center' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  navSubtitle: { fontSize: 11, color: '#64748B', marginTop: 1 },
  bookWrapper: { flex: 1, marginVertical: 6 },
  resonanceBar: { paddingHorizontal: 12, paddingBottom: 6 },
  resonanceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 44, backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#CBD5E1', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  resonanceBtnPressed: { backgroundColor: '#F8FAFC' },
  resonanceBtnText: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F8FAFC' },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 18 },
  loadingText: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  generateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  generateBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
