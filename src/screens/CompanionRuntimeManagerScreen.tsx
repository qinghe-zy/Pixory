import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  clearCompanionRoleRuntime,
  dismissCompanionManagementItem,
  listCompanionManagementItems,
  resetCompanionRoleRuntime,
  type CompanionManagementItem,
} from '../ai/companion/companionManagementService';
import { AppScreen } from '../components/AppScreen';
import type { PixorySpace } from '../database';
import { colors, metrics, radius, spacing, typography } from '../design/tokens';

interface CompanionRuntimeManagerScreenProps {
  space: PixorySpace;
  threadId: string;
  onBack: () => void;
}

export function CompanionRuntimeManagerScreen({ space, threadId, onBack }: CompanionRuntimeManagerScreenProps) {
  const [items, setItems] = useState<CompanionManagementItem[]>([]);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listCompanionManagementItems(space, threadId);
      setItems(result.items);
      setRoleId(result.roleCardId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '感知数据加载失败。');
    } finally {
      setLoading(false);
    }
  }, [space, threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppScreen contentStyle={styles.screen} scrollable>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.headerTouch}>
          <Text style={styles.back}>返回</Text>
        </Pressable>
        <Text style={styles.title}>情感与时间</Text>
        <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.headerTouch}>
          <Text style={styles.back}>刷新</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>这里只展示可管理的边界、待跟进话题和时间锚点；内部情绪分数不会显示。</Text>
      {loading ? <Text accessibilityLiveRegion="polite" style={styles.empty}>正在加载…</Text> : null}
      {!loading && error ? <Text style={styles.empty}>{error}</Text> : null}
      {!loading && !error ? items.map((item) => (
        <View key={item.id} style={styles.item}>
          <Text style={styles.kind}>{item.title}</Text>
          <Text style={styles.detail}>{item.detail}</Text>
          <Pressable
            accessibilityLabel={`移除${item.title}`}
            accessibilityRole="button"
            onPress={() => void dismissCompanionManagementItem(space, item).then(load)}
            style={styles.actionTouch}
          >
            <Text style={styles.action}>移除</Text>
          </Pressable>
        </View>
      )) : null}
      {!loading && !error && items.length === 0 ? <Text style={styles.empty}>当前没有需要管理的条目。</Text> : null}
      {roleId ? (
        <View style={styles.dangerZone}>
          <Pressable
            accessibilityRole="button"
            onPress={() => Alert.alert(
              '重置角色感知',
              '将写入一条可审计的重置记录，并从此刻重新建立情感、边界、待跟进话题和时间感知。日记、梦境和独白不会删除。',
              [
                { text: '取消', style: 'cancel' },
                { text: '重置', onPress: () => void resetCompanionRoleRuntime(space, roleId).then(load) },
              ],
            )}
            style={styles.reset}
          >
            <Text style={styles.resetText}>重置此角色的感知</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => Alert.alert(
              '清除角色感知数据',
              '这会永久清除该角色的情感事件、投影、边界修复、待跟进话题和时间锚点。日记、梦境和独白仍会保留。',
              [
                { text: '取消', style: 'cancel' },
                { text: '永久清除', style: 'destructive', onPress: () => void clearCompanionRoleRuntime(space, roleId).then(load) },
              ],
            )}
            style={styles.reset}
          >
            <Text style={styles.clearText}>清除角色感知数据</Text>
          </Pressable>
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: spacing[4] },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[4] },
  headerTouch: { alignItems: 'center', justifyContent: 'center', minHeight: metrics.minTouchSize, minWidth: metrics.minTouchSize },
  back: { ...typography.textStyles.caption, color: colors.text.secondary },
  title: { ...typography.textStyles.sectionTitle, color: colors.text.primary },
  note: { ...typography.textStyles.caption, color: colors.text.secondary, lineHeight: 20, marginBottom: spacing[5] },
  item: { backgroundColor: colors.background.surface, borderColor: colors.border.default, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, marginBottom: spacing[3], padding: spacing[4], paddingRight: spacing[8] },
  kind: { ...typography.textStyles.micro, color: colors.text.tertiary },
  detail: { ...typography.textStyles.body, color: colors.text.primary, marginTop: spacing[1] },
  actionTouch: { alignItems: 'center', justifyContent: 'center', minHeight: metrics.minTouchSize, minWidth: metrics.minTouchSize, position: 'absolute', right: 0, top: 0 },
  action: { ...typography.textStyles.caption, color: colors.primary.default },
  empty: { ...typography.textStyles.body, color: colors.text.tertiary, textAlign: 'center' },
  dangerZone: { marginTop: spacing[8] },
  reset: { alignItems: 'center', justifyContent: 'center', minHeight: metrics.minTouchSize, paddingHorizontal: spacing[4] },
  resetText: { ...typography.textStyles.caption, color: colors.primary.default },
  clearText: { ...typography.textStyles.caption, color: colors.semantic.danger },
});
