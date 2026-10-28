import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface ImDiaryScrubberBarProps {
  currentIndex: number;
  totalSpreads: number;
  currentDateStr?: string;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  onOpenDatePicker?: () => void;
}

/**
 * 日记底栏时间轴穿梭滑块 (Time-Travel Scrubber)
 * 极简设计，支持秒级跳页与定位
 */
export function ImDiaryScrubberBar({
  currentIndex,
  totalSpreads,
  currentDateStr,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onOpenDatePicker,
}: ImDiaryScrubberBarProps) {
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel="上一页"
        disabled={!canPrev}
        onPress={onPrev}
        style={({ pressed }) => [styles.btn, (!canPrev || pressed) && styles.btnDisabled]}
      >
        <Ionicons color={canPrev ? '#1E293B' : '#94A3B8'} name="chevron-back" size={17} />
        <Text style={[styles.btnText, !canPrev && styles.textDisabled]}>上一页</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="按日期选择日记"
        accessibilityRole="button"
        onPress={onOpenDatePicker}
        style={({ pressed }) => [styles.centerInfo, pressed && styles.centerPressed]}
      >
        <View style={styles.dateRow}>
          <Ionicons color="#3B82F6" name="calendar-outline" size={13} style={{ marginRight: 4 }} />
          {currentDateStr ? <Text style={styles.dateLabel}>{currentDateStr}</Text> : null}
        </View>
        <Text style={styles.pageCountText}>
          {totalSpreads > 0 ? `${currentIndex + 1} / ${totalSpreads} 页 · 点击选日期` : '暂无日记'}
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="下一页"
        disabled={!canNext}
        onPress={onNext}
        style={({ pressed }) => [styles.btn, (!canNext || pressed) && styles.btnDisabled]}
      >
        <Text style={[styles.btnText, !canNext && styles.textDisabled]}>下一页</Text>
        <Ionicons color={canNext ? '#1E293B' : '#94A3B8'} name="chevron-forward" size={17} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    borderRadius: 16,
    marginVertical: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    marginHorizontal: 2,
  },
  textDisabled: {
    color: '#94A3B8',
  },
  centerInfo: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  centerPressed: {
    opacity: 0.7,
    backgroundColor: '#F1F5F9',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 1,
  },
  pageCountText: {
    fontSize: 10,
    color: '#94A3B8',
  },
});
