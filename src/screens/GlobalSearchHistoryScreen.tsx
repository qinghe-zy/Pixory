import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { addMonths, addYears, differenceInDays, eachDayOfInterval, format, isToday, isYesterday, subDays, subHours, subMonths, subYears } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

import { AppDialog } from '../components/AppDialog';
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

const prototypeColors = {
  surface: '#f9f9f9',
  onSurface: '#1a1c1c',
  secondary: '#5e5e5e',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f3f3f4',
  surfaceContainer: '#eeeeee',
  primary: '#000000',
  outline: '#747878',
};

export function GlobalSearchHistoryScreen({
  space,
  onBack,
  onUseItem,
}: GlobalSearchHistoryScreenProps) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [deleteMenuVisible, setDeleteMenuVisible] = useState(false);
  const [customDateVisible, setCustomDateVisible] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<string | null>(null);
  const [customEndDate, setCustomEndDate] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(format(new Date(), 'yyyy-MM-dd'));

  const insets = useSafeAreaInsets();

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
    type FlatItem = SearchHistoryItem | { id: string; isHeader: true; title: string; subtitle: string; count: number; data: SearchHistoryItem[] };
    const flat: FlatItem[] = [];
    let currentDayStr = '';
    let currentDayLabel = '';
    let currentDaySubtitle = '';
    let currentDayCount = 0;
    let currentDayItems: SearchHistoryItem[] = [];

    for (const item of history) {
      const dayStr = format(item.timestamp, 'yyyy年MM月dd日');
      const subtitle = isToday(item.timestamp) ? '(今天)' : isYesterday(item.timestamp) ? '(昨天)' : '';

      if (currentDayStr !== dayStr) {
        if (currentDayItems.length > 0) {
          flat.push({ id: `day_${currentDayStr}`, isHeader: true, title: currentDayLabel, subtitle: currentDaySubtitle, count: currentDayCount, data: currentDayItems });
          flat.push(...currentDayItems);
        }
        currentDayStr = dayStr;
        currentDayLabel = dayStr;
        currentDaySubtitle = subtitle;
        currentDayCount = 0;
        currentDayItems = [];
      }
      currentDayCount++;
      currentDayItems.push(item);
    }
    
    if (currentDayItems.length > 0) {
      flat.push({ id: `day_${currentDayStr}`, isHeader: true, title: currentDayLabel, subtitle: currentDaySubtitle, count: currentDayCount, data: currentDayItems });
      flat.push(...currentDayItems);
    }

    return flat;
  }, [history]);

  async function handleDeleteSingle(id: string) {
    const next = await batchDeleteSearchHistory(space, [id]);
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
    
    const startStr = customEndDate && customEndDate < customStartDate ? customEndDate : customStartDate;
    const endStr = customEndDate && customEndDate > customStartDate ? customEndDate : (customEndDate || customStartDate);

    const startMs = new Date(startStr).getTime();
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
    <View style={styles.container}>
      {/* 顶部导航栏 */}
      <View style={{ zIndex: 50, position: 'absolute', top: 0, left: 0, right: 0 }}>
        {Platform.OS === 'ios' ? (
           <BlurView tint="light" intensity={80} style={[StyleSheet.absoluteFill, styles.headerBg]} />
        ) : (
           <View style={[StyleSheet.absoluteFill, styles.headerBg, { backgroundColor: 'rgba(249, 249, 249, 0.9)' }]} />
        )}
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={20} color={prototypeColors.onSurface} />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>搜索历史</Text>
          </View>
          <View style={styles.headerRight} />
        </View>
      </View>

      <FlatList
        contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 56 + 8, paddingBottom: insets.bottom + 100 }]}
        data={listData}
        keyExtractor={(item) => ('isHeader' in item ? item.id : item.id)}
        renderItem={({ item, index }) => {
          if ('isHeader' in item) {
            return (
              <View style={[styles.groupHeader, index === 0 ? { marginTop: 0 } : undefined]}>
                <View style={styles.groupTitleRow}>
                  <Text style={styles.groupDate}>{item.title}</Text>
                  {item.subtitle ? <Text style={styles.groupRelativeDate}>{item.subtitle}</Text> : null}
                </View>
                <View style={styles.groupBadge}>
                  <Text style={styles.groupBadgeText}>{item.count} 项</Text>
                </View>
              </View>
            );
          }

          return (
            <Pressable
              onPress={() => onUseItem(item.keyword)}
              style={({ pressed }) => [
                styles.historyItem,
                pressed && { backgroundColor: prototypeColors.surfaceContainerLow, transform: [{ scale: 0.99 }] }
              ]}
            >
              <View style={styles.itemLeft}>
                <View style={styles.itemIconContainer}>
                  <MaterialIcons name="history" size={16} color={prototypeColors.secondary} />
                </View>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {item.keyword}
                </Text>
              </View>
              <View style={styles.itemRight}>
                <Text style={styles.itemTime}>{format(item.timestamp, 'HH:mm')}</Text>
                <Pressable hitSlop={15} onPress={() => handleDeleteSingle(item.id)} style={({ pressed }) => [styles.deleteBtn, pressed && { backgroundColor: prototypeColors.surfaceContainer }]}>
                  <MaterialIcons name="close" size={16} color={prototypeColors.outline} />
                </Pressable>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <MaterialIcons name="search-off" size={28} color={prototypeColors.secondary} />
            </View>
            <Text style={styles.emptyTitle}>暂无匹配的历史记录</Text>
            <Text style={styles.emptySubtitle}>所有的搜索记录皆已清空或未找到结果</Text>
          </View>
        }
      />
      {history.length > 0 && (
        <View style={[styles.floatingActionContainer, { bottom: insets.bottom + spacing[8] }]}>
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

      {/* AppDialog components remain same as original for function but style intact */}
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
        {customStartDate && (
          <View style={styles.dateRangeDisplay}>
            <Text style={styles.dateRangeText} adjustsFontSizeToFit numberOfLines={1}>
              {!customEndDate
                ? `${customStartDate.substring(0, 4)}年${customStartDate.substring(5, 7)}月${customStartDate.substring(8, 10)}日`
                : customStartDate <= customEndDate
                ? `${customStartDate.substring(0, 4)}年${customStartDate.substring(5, 7)}月${customStartDate.substring(8, 10)}日 - ${customEndDate.substring(0, 4)}年${customEndDate.substring(5, 7)}月${customEndDate.substring(8, 10)}日`
                : `${customEndDate.substring(0, 4)}年${customEndDate.substring(5, 7)}月${customEndDate.substring(8, 10)}日 - ${customStartDate.substring(0, 4)}年${customStartDate.substring(5, 7)}月${customStartDate.substring(8, 10)}日`}
            </Text>
          </View>
        )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: prototypeColors.surface,
  },
  headerBg: {
    backgroundColor: 'rgba(249, 249, 249, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    marginLeft: -4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: prototypeColors.onSurface,
    letterSpacing: -0.005 * 15,
  },
  headerRight: {
    width: 44,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 20,
    marginBottom: 4,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  groupDate: {
    fontSize: 20,
    fontWeight: '500',
    color: prototypeColors.onSurface,
    letterSpacing: -0.01 * 20,
  },
  groupRelativeDate: {
    fontSize: 10,
    fontWeight: '500',
    color: prototypeColors.secondary,
    letterSpacing: 0.08 * 10,
    marginLeft: 8,
  },
  groupBadge: {
    backgroundColor: prototypeColors.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: prototypeColors.secondary,
    letterSpacing: 0.08 * 10,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: prototypeColors.surfaceContainerLowest,
    borderRadius: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: prototypeColors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: prototypeColors.onSurface,
    letterSpacing: -0.005 * 15,
    flex: 1,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  itemTime: {
    fontSize: 10,
    fontWeight: '500',
    color: prototypeColors.secondary,
    letterSpacing: 0.08 * 10,
  },
  deleteBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  emptyIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: prototypeColors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: prototypeColors.onSurface,
    marginBottom: 4,
    letterSpacing: -0.01 * 20,
  },
  emptySubtitle: {
    fontSize: 13,
    color: prototypeColors.secondary,
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
  // Calendar Dialog styles
  calendarContainer: {
    marginTop: spacing[2],
  },
  calendarHeaderArrows: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateRangeDisplay: {
    alignItems: 'center',
    marginTop: -spacing[2],
    marginBottom: spacing[4],
  },
  dateRangeText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
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
