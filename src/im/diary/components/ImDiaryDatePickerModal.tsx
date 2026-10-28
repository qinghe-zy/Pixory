import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ImCompanionDiary } from '../types';

export interface ImDiaryDatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  diaries: ImCompanionDiary[];
  currentDateStr?: string;
  onSelectDate: (diaryDate: string) => void;
}

/**
 * 伴侣日记按日期穿梭跳转浮层 (Diary Date Picker Modal)
 * 列表清晰呈现历史手账日期、天气、心情标签与标题，点击即可瞬间直达
 */
export function ImDiaryDatePickerModal({
  visible,
  onClose,
  diaries,
  currentDateStr,
  onSelectDate,
}: ImDiaryDatePickerModalProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <View style={styles.headerLeft}>
              <Ionicons color="#0F172A" name="calendar-outline" size={18} style={{ marginRight: 6 }} />
              <Text style={styles.headerTitle}>手账回忆目录</Text>
            </View>
            <Pressable accessibilityLabel="关闭日期选择" onPress={onClose} style={styles.closeBtn}>
              <Ionicons color="#64748B" name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.listScroll} contentContainerStyle={styles.listContent}>
            {diaries.length > 0 ? (
              diaries.map((item) => {
                const isSelected = item.diaryDate === currentDateStr;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      onSelectDate(item.diaryDate);
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.diaryItem,
                      isSelected && styles.diaryItemSelected,
                      pressed && styles.itemPressed,
                    ]}
                  >
                    <View style={styles.itemTopRow}>
                      <Text style={[styles.itemDate, isSelected && styles.itemDateSelected]}>
                        {item.diaryDate}
                      </Text>
                      {item.moodTag ? (
                        <View style={styles.tagPill}>
                          <Text style={styles.tagText}>{item.moodTag}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text numberOfLines={1} style={[styles.itemTitle, isSelected && styles.itemTitleSelected]}>
                      {item.title}
                    </Text>
                    <Text numberOfLines={2} style={styles.itemSnippet}>
                      {item.content.slice(0, 60)}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>暂无历史手账记录</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 4,
  },
  listScroll: {
    maxHeight: 460,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
  },
  diaryItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  diaryItemSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  itemPressed: {
    opacity: 0.8,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  itemDateSelected: {
    color: '#2563EB',
  },
  tagPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  itemTitleSelected: {
    color: '#1D4ED8',
  },
  itemSnippet: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
  },
});
