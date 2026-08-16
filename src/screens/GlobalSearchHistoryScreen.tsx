import { Ionicons } from '@expo/vector-icons';
import { differenceInDays, eachDayOfInterval, format, isToday, isYesterday, subDays, subHours, subMonths } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

import { AppDialog } from '../components/AppDialog';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { type PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import {
  batchDeleteSearchHistory,
  clearSearchHistory,
  deleteSearchHistoryByTimeRange,
  type SearchHistoryItem,
} from '../services/searchHistoryService';

import { loadSearchHistory } from '../services/searchHistoryService';

interface GlobalSearchHistoryScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onUseItem: (keyword: string) => void;
}

type DateFilterType = '3h' | '24h' | '7d' | '1m' | 'custom' | 'all';

export function GlobalSearchHistoryScreen({
  space,
  onBack,
  onUseItem,
}: GlobalSearchHistoryScreenProps) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteMenuVisible, setDeleteMenuVisible] = useState(false);
  const [customDateVisible, setCustomDateVisible] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<string | null>(null);
  const [customEndDate, setCustomEndDate] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    void loadSearchHistory(space).then((data) => {
      if (isMounted) setHistory(data);
    });
    return () => {
      isMounted = false;
    };
  }, [space]);

  const groupedHistory = useMemo(() => {
    const groups: { title: string; data: SearchHistoryItem[] }[] = [];
    const today: SearchHistoryItem[] = [];
    const yesterday: SearchHistoryItem[] = [];
    const earlier: SearchHistoryItem[] = [];

    for (const item of history) {
      if (isToday(item.timestamp)) {
        today.push(item);
      } else if (isYesterday(item.timestamp)) {
        yesterday.push(item);
      } else {
        earlier.push(item);
      }
    }

    if (today.length > 0) groups.push({ title: '今天', data: today });
    if (yesterday.length > 0) groups.push({ title: '昨天', data: yesterday });
    if (earlier.length > 0) groups.push({ title: '更早', data: earlier });

    return groups;
  }, [history]);

  function toggleEditMode() {
    setIsEditMode(!isEditMode);
    setSelectedIds(new Set());
  }

  function toggleSelection(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  function selectAll() {
    if (selectedIds.size === history.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(history.map((h) => h.id)));
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const next = await batchDeleteSearchHistory(space, Array.from(selectedIds));
    setHistory(next);
    setIsEditMode(false);
    setSelectedIds(new Set());
  }

  async function handleDeleteRange(type: DateFilterType) {
    setDeleteMenuVisible(false);
    const now = Date.now();
    let startMs = 0;
    const endMs = now;

    if (type === '3h') {
      startMs = subHours(now, 3).getTime();
    } else if (type === '24h') {
      startMs = subHours(now, 24).getTime();
    } else if (type === '7d') {
      startMs = subDays(now, 7).getTime();
    } else if (type === '1m') {
      startMs = subMonths(now, 1).getTime();
    } else if (type === 'all') {
      await clearSearchHistory(space);
      setHistory([]);
      return;
    }

    const next = await deleteSearchHistoryByTimeRange(space, startMs, endMs);
    setHistory(next);
  }

  async function handleCustomDateDelete() {
    if (!customStartDate) return;
    
    // Determine exact bounds
    const startStr = customEndDate && customEndDate < customStartDate ? customEndDate : customStartDate;
    const endStr = customEndDate && customEndDate > customStartDate ? customEndDate : (customEndDate || customStartDate);

    const startMs = new Date(startStr).getTime();
    // End of the day
    const endMs = new Date(endStr).getTime() + 24 * 60 * 60 * 1000 - 1;
    
    const next = await deleteSearchHistoryByTimeRange(space, startMs, endMs);
    setHistory(next);
    setCustomDateVisible(false);
    setCustomStartDate(null);
    setCustomEndDate(null);
  }

  function selectQuickRange(daysAgo: number) {
    const today = new Date();
    if (daysAgo === 0) {
      const str = format(today, 'yyyy-MM-dd');
      setCustomStartDate(str);
      setCustomEndDate(str);
    } else if (daysAgo === 1) {
      const yesterday = subDays(today, 1);
      const str = format(yesterday, 'yyyy-MM-dd');
      setCustomStartDate(str);
      setCustomEndDate(str);
    } else {
      const past = subDays(today, daysAgo - 1);
      setCustomStartDate(format(past, 'yyyy-MM-dd'));
      setCustomEndDate(format(today, 'yyyy-MM-dd'));
    }
  }

  const markedDates = useMemo(() => {
    if (!customStartDate) return {};

    const marks: any = {};
    const primaryColor = colors.primary.default;
    const weakColor = colors.background.tag;
    const inverseColor = colors.text.inverse;
    const defaultColor = colors.text.title;

    if (!customEndDate || customStartDate === customEndDate) {
      marks[customStartDate] = {
        startingDay: true,
        endingDay: true,
        color: primaryColor,
        textColor: inverseColor,
      };
      return marks;
    }

    const startStr = customStartDate < customEndDate ? customStartDate : customEndDate;
    const endStr = customStartDate < customEndDate ? customEndDate : customStartDate;

    const start = new Date(startStr);
    const end = new Date(endStr);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const days = eachDayOfInterval({ start, end });

    days.forEach((day, index) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      if (index === 0) {
        marks[dateStr] = {
          startingDay: true,
          color: primaryColor,
          textColor: inverseColor,
        };
      } else if (index === days.length - 1) {
        marks[dateStr] = {
          endingDay: true,
          color: primaryColor,
          textColor: inverseColor,
        };
      } else {
        marks[dateStr] = {
          color: weakColor,
          textColor: defaultColor,
        };
      }
    });
    return marks;
  }, [customStartDate, customEndDate]);

  const listData = useMemo(() => {
    const flat: (SearchHistoryItem | string)[] = [];
    for (const group of groupedHistory) {
      flat.push(group.title);
      flat.push(...group.data);
    }
    return flat;
  }, [groupedHistory]);

  const customDaysCount = useMemo(() => {
    if (!customStartDate) return 0;
    if (!customEndDate) return 1;
    const s = new Date(customStartDate);
    const e = new Date(customEndDate);
    return Math.abs(differenceInDays(e, s)) + 1;
  }, [customStartDate, customEndDate]);

  return (
    <>
      <ScreenScaffold
        backgroundVariant="home"
        onBack={onBack}
        title="搜索历史"
        rightAction={
          history.length > 0 ? (
            <View style={styles.headerActions}>
              {isEditMode ? (
                <>
                  <Pressable onPress={selectAll} style={styles.actionButton}>
                    <Text style={styles.actionText}>{selectedIds.size === history.length ? '取消全选' : '全选'}</Text>
                  </Pressable>
                  <Pressable onPress={handleDeleteSelected} style={styles.actionButton}>
                    <Text style={[styles.actionText, { color: colors.support.coral400 }]}>删除</Text>
                  </Pressable>
                  <Pressable onPress={toggleEditMode} style={styles.actionButton}>
                    <Text style={styles.actionText}>完成</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable onPress={() => setDeleteMenuVisible(true)} style={styles.actionButton}>
                    <Ionicons name="trash-outline" size={24} color={colors.text.secondary} />
                  </Pressable>
                  <Pressable onPress={toggleEditMode} style={styles.actionButton}>
                    <Text style={styles.actionText}>管理</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : undefined
        }
      >
        <FlatList
          contentContainerStyle={styles.listContent}
          data={listData}
          keyExtractor={(item) => (typeof item === 'string' ? `header_${item}` : item.id)}
          renderItem={({ item }) => {
            if (typeof item === 'string') {
              return (
                <View style={styles.groupHeader}>
                  <Text style={styles.groupHeaderText}>{item}</Text>
                </View>
              );
            }

            const isSelected = selectedIds.has(item.id);

            return (
              <Pressable
                onPress={() => {
                  if (isEditMode) {
                    toggleSelection(item.id);
                  } else {
                    onUseItem(item.keyword);
                  }
                }}
                style={[styles.historyItem, isSelected && styles.historyItemSelected]}
              >
                {isEditMode ? (
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color={colors.text.inverse} />}
                  </View>
                ) : (
                  <Ionicons name="time-outline" size={20} color={colors.text.tertiary} style={styles.itemIcon} />
                )}
                <View style={styles.itemContent}>
                  <Text style={styles.itemText} numberOfLines={1}>
                    {item.keyword}
                  </Text>
                  <Text style={styles.itemTime}>{format(item.timestamp, 'HH:mm')}</Text>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.emptyText}>暂无搜索历史</Text>
            </View>
          }
        />
      </ScreenScaffold>

      <AppDialog
        onClose={() => setDeleteMenuVisible(false)}
        title="清除搜索历史"
        visible={deleteMenuVisible}
        primaryLabel="取消"
        onPrimary={() => setDeleteMenuVisible(false)}
      >
        <View style={styles.menuContainer}>
          <Pressable style={styles.menuItem} onPress={() => handleDeleteRange('3h')}>
            <Text style={styles.menuItemText}>近3小时</Text>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => handleDeleteRange('24h')}>
            <Text style={styles.menuItemText}>近24小时</Text>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => handleDeleteRange('7d')}>
            <Text style={styles.menuItemText}>近7天</Text>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => handleDeleteRange('1m')}>
            <Text style={styles.menuItemText}>近1个月</Text>
          </Pressable>
          <Pressable
            style={styles.menuItem}
            onPress={() => {
              setDeleteMenuVisible(false);
              setCustomDateVisible(true);
            }}
          >
            <Text style={styles.menuItemText}>选择日期范围...</Text>
          </Pressable>
          <Pressable style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={() => handleDeleteRange('all')}>
            <Text style={[styles.menuItemText, { color: colors.support.coral400 }]}>清除全部</Text>
          </Pressable>
        </View>
      </AppDialog>

      <AppDialog
        onClose={() => {
          setCustomDateVisible(false);
          setCustomStartDate(null);
          setCustomEndDate(null);
        }}
        onPrimary={handleCustomDateDelete}
        primaryLabel={
          !customStartDate
            ? '请选择日期'
            : `删除 ${customDaysCount} 天记录`
        }
        primaryDisabled={!customStartDate}
        danger
        title="按日期删除"
        visible={customDateVisible}
      >
        <View style={styles.calendarContainer}>
          <View style={styles.quickSelectContainer}>
            <Pressable style={styles.quickSelectPill} onPress={() => selectQuickRange(0)}>
              <Text style={styles.quickSelectText}>今天</Text>
            </Pressable>
            <Pressable style={styles.quickSelectPill} onPress={() => selectQuickRange(1)}>
              <Text style={styles.quickSelectText}>昨天</Text>
            </Pressable>
            <Pressable style={styles.quickSelectPill} onPress={() => selectQuickRange(7)}>
              <Text style={styles.quickSelectText}>近7天</Text>
            </Pressable>
            <Pressable style={styles.quickSelectPill} onPress={() => selectQuickRange(30)}>
              <Text style={styles.quickSelectText}>近30天</Text>
            </Pressable>
          </View>

          <Calendar
            markingType={'period'}
            markedDates={markedDates}
            onDayPress={(day) => {
              if (!customStartDate || (customStartDate && customEndDate)) {
                setCustomStartDate(day.dateString);
                setCustomEndDate(null);
              } else if (customStartDate) {
                setCustomEndDate(day.dateString);
              }
            }}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: colors.text.secondary,
              selectedDayBackgroundColor: colors.primary.default,
              selectedDayTextColor: colors.text.inverse,
              todayTextColor: colors.primary.default,
              dayTextColor: colors.text.title,
              textDisabledColor: colors.text.tertiary,
              arrowColor: colors.text.secondary,
              monthTextColor: colors.text.title,
              textMonthFontWeight: '600',
              textDayHeaderFontWeight: '500',
            }}
          />
        </View>
      </AppDialog>
    </>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    marginLeft: spacing[4],
    padding: spacing[1],
  },
  actionText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  calendarContainer: {
    marginTop: spacing[2],
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.border.default,
    borderRadius: radius.xs,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    marginRight: spacing[3],
    width: 20,
  },
  checkboxSelected: {
    backgroundColor: colors.primary.default,
    borderColor: colors.primary.default,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    ...typography.textStyles.body,
    color: colors.text.secondary,
    marginTop: spacing[3],
  },
  groupHeader: {
    backgroundColor: colors.background.surface,
    paddingBottom: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  groupHeaderText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.secondary,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  historyItem: {
    alignItems: 'center',
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  historyItemSelected: {
    backgroundColor: colors.background.elevated,
  },
  itemContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemIcon: {
    marginRight: spacing[3],
  },
  itemText: {
    ...typography.textStyles.body,
    color: colors.text.title,
    flex: 1,
  },
  itemTime: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    marginLeft: spacing[3],
  },
  listContent: {
    paddingBottom: spacing[8],
  },
  menuContainer: {
    marginTop: spacing[3],
  },
  menuItem: {
    alignItems: 'center',
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[3],
  },
  menuItemText: {
    ...typography.textStyles.body,
    color: colors.text.title,
  },
  quickSelectContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[4],
    paddingHorizontal: spacing[2],
  },
  quickSelectPill: {
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
  },
  quickSelectText: {
    ...typography.textStyles.caption,
    fontWeight: '600',
    color: colors.text.title,
  },
});
