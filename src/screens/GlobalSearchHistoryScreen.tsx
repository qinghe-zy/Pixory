import { Ionicons } from '@expo/vector-icons';
import { addMonths, addYears, differenceInDays, eachDayOfInterval, format, isToday, isYesterday, subDays, subHours, subMonths, subYears } from 'date-fns';
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
  const [calendarMonth, setCalendarMonth] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    let isMounted = true;
    void loadSearchHistory(space).then((data) => {
      if (isMounted) setHistory(data);
    });
    return () => {
      isMounted = false;
    };
  }, [space]);

  const listData = useMemo(() => {
    type FlatItem = SearchHistoryItem | { id: string; isHeader: true; title: string; count: number; data: SearchHistoryItem[] };
    const flat: FlatItem[] = [];
    let currentDayStr = '';
    let currentDayLabel = '';
    let currentDayCount = 0;
    let currentDayItems: SearchHistoryItem[] = [];

    // History is implicitly sorted descending by timestamp
    for (const item of history) {
      const dayStr = format(item.timestamp, 'yyyy年MM月dd日');
      const dayLabel = isToday(item.timestamp) ? `${dayStr} (今天)` : isYesterday(item.timestamp) ? `${dayStr} (昨天)` : dayStr;

      if (currentDayStr !== dayStr) {
        if (currentDayItems.length > 0) {
          flat.push({ id: `day_${currentDayStr}`, isHeader: true, title: currentDayLabel, count: currentDayCount, data: currentDayItems });
          flat.push(...currentDayItems);
        }
        currentDayStr = dayStr;
        currentDayLabel = dayLabel;
        currentDayCount = 0;
        currentDayItems = [];
      }
      currentDayCount++;
      currentDayItems.push(item);
    }
    
    if (currentDayItems.length > 0) {
      flat.push({ id: `day_${currentDayStr}`, isHeader: true, title: currentDayLabel, count: currentDayCount, data: currentDayItems });
      flat.push(...currentDayItems);
    }

    return flat;
  }, [history]);

  async function handleDeleteSingle(id: string) {
    const next = await batchDeleteSearchHistory(space, [id]);
    setHistory(next);
  }

  async function handleDeleteGroup(groupData: SearchHistoryItem[]) {
    const ids = groupData.map(i => i.id);
    const next = await batchDeleteSearchHistory(space, ids);
    setHistory(next);
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
    const marks: any = {};
    const primaryColor = colors.primary.default;
    const weakColor = colors.background.tag;
    const inverseColor = colors.text.inverse;
    const defaultColor = colors.text.title;

    if (!customStartDate) return {};

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
        onBack={onBack}
        subtitle={history.length > 0 ? `共 ${history.length} 条` : undefined}
        title="搜索历史"
      >
        <FlatList
          contentContainerStyle={styles.listContent}
          data={listData}
          keyExtractor={(item) => ('isHeader' in item ? item.id : item.id)}
          renderItem={({ item }) => {
            if ('isHeader' in item) {
              return (
                <View style={styles.groupHeader}>
                  <Text style={styles.groupHeaderText}>{item.title} <Text style={styles.groupHeaderCount}>{item.data.length}</Text></Text>
                </View>
              );
            }

            return (
              <Pressable
                onPress={() => onUseItem(item.keyword)}
                style={styles.historyItem}
              >
                <View style={styles.itemContent}>
                  <Text style={styles.itemText} numberOfLines={1}>
                    {item.keyword}
                  </Text>
                  <Text style={styles.itemTime}>{format(item.timestamp, 'HH:mm')}</Text>
                </View>
                <Pressable hitSlop={15} onPress={() => handleDeleteSingle(item.id)}>
                  <Ionicons name="close" size={18} color={colors.text.tertiary} />
                </Pressable>
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
        {history.length > 0 && (
          <View style={styles.floatingActionContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.floatingActionButton,
                pressed && { opacity: 0.8 }
              ]}
              onPress={() => setDeleteMenuVisible(true)}
            >
              <Ionicons name="trash" size={16} color={colors.text.inverse} style={{ marginRight: spacing[2] }} />
              <Text style={styles.floatingActionText}>清空历史</Text>
            </Pressable>
          </View>
        )}
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
        title={
          !customStartDate
            ? '按日期删除'
            : !customEndDate
            ? `按日期删除  ${customStartDate.substring(0, 4)}年${customStartDate.substring(5, 7)}月${customStartDate.substring(8, 10)}日`
            : (customStartDate <= customEndDate 
                ? `按日期删除  ${customStartDate.substring(0, 4)}年${customStartDate.substring(5, 7)}月${customStartDate.substring(8, 10)}日 - ${customEndDate.substring(0, 4)}年${customEndDate.substring(5, 7)}月${customEndDate.substring(8, 10)}日`
                : `按日期删除  ${customEndDate.substring(0, 4)}年${customEndDate.substring(5, 7)}月${customEndDate.substring(8, 10)}日 - ${customStartDate.substring(0, 4)}年${customStartDate.substring(5, 7)}月${customStartDate.substring(8, 10)}日`
              )
        }
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
            key={calendarMonth}
            current={calendarMonth}
            onMonthChange={(date) => {
              setCalendarMonth(date.dateString);
            }}
            hideArrows={true}
            renderHeader={(date) => (
              <View style={styles.customCalendarHeader}>
                <View style={styles.calendarHeaderArrows}>
                  <Pressable hitSlop={10} onPress={() => setCalendarMonth(format(subYears(new Date(calendarMonth), 1), 'yyyy-MM-dd'))} style={{ flexDirection: 'row' }}>
                    <Ionicons name="chevron-back" size={20} color={colors.text.secondary} style={{ marginRight: -10 }} />
                    <Ionicons name="chevron-back" size={20} color={colors.text.secondary} />
                  </Pressable>
                  <Pressable hitSlop={10} style={{ marginLeft: spacing[4] }} onPress={() => setCalendarMonth(format(subMonths(new Date(calendarMonth), 1), 'yyyy-MM-dd'))}>
                    <Ionicons name="chevron-back" size={20} color={colors.text.secondary} />
                  </Pressable>
                </View>
                <Text style={styles.calendarHeaderText}>{format(new Date(calendarMonth), 'yyyy年 MM月')}</Text>
                <View style={styles.calendarHeaderArrows}>
                  <Pressable hitSlop={10} style={{ marginRight: spacing[4] }} onPress={() => setCalendarMonth(format(addMonths(new Date(calendarMonth), 1), 'yyyy-MM-dd'))}>
                    <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
                  </Pressable>
                  <Pressable hitSlop={10} onPress={() => setCalendarMonth(format(addYears(new Date(calendarMonth), 1), 'yyyy-MM-dd'))} style={{ flexDirection: 'row' }}>
                    <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} style={{ marginRight: -10 }} />
                    <Ionicons name="chevron-forward" size={20} color={colors.text.secondary} />
                  </Pressable>
                </View>
              </View>
            )}
            markingType={'period'}
            markedDates={markedDates}
            onDayPress={(day) => {
              if (customStartDate && !customEndDate && day.dateString === customStartDate) {
                // Toggle off if clicking the same start date
                setCustomStartDate(null);
              } else if (!customStartDate || (customStartDate && customEndDate)) {
                setCustomStartDate(day.dateString);
                setCustomEndDate(null);
              } else if (customStartDate) {
                setCustomEndDate(day.dateString);
              }
            }}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              selectedDayBackgroundColor: colors.primary.default,
              selectedDayTextColor: colors.text.inverse,
              todayTextColor: colors.primary.default,
              dayTextColor: colors.text.title,
              textDisabledColor: colors.text.tertiary,
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
  calendarHeaderArrows: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarHeaderText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  customCalendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[3],
    width: '100%',
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
  floatingActionContainer: {
    alignItems: 'center',
    bottom: spacing[8],
    left: 0,
    position: 'absolute',
    right: 0,
  },
  floatingActionButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  floatingActionText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[6],
  },
  groupHeaderText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    fontSize: 16,
    fontWeight: '700',
  },
  groupHeaderCount: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
    fontWeight: '400',
    marginLeft: spacing[2],
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  historyItem: {
    alignItems: 'center',
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
