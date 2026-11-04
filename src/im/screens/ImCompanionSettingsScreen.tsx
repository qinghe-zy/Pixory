import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  Pressable,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PixorySpace } from '../../database';
import { useImGlobalSettings } from '../services/imCompanionPreferences';
import type { ImIntervalMode, ImCharSpeedGear } from '../config/pacingProfile';
import { getMemoryModelProviderConfig } from '../../core/llm-transport/secureApiKey';
import { colors } from '../../design/tokens/colors';
import { rhythm } from '../../design/tokens/rhythm';
import { spacing } from '../../design/tokens/spacing';
import { metrics } from '../../design/tokens/metrics';
import { radius } from '../../design/tokens/radius';
import { shadows } from '../../design/tokens/shadows';

export interface ImCompanionSettingsScreenProps {
  space: PixorySpace;
  onBack: () => void;
}

export function ImCompanionSettingsScreen({
  space,
  onBack,
}: ImCompanionSettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const { settings, update } = useImGlobalSettings(space);
  const [memoryModelDesc, setMemoryModelDesc] = useState<string>('探测中...');

  useEffect(() => {
    let mounted = true;
    void getMemoryModelProviderConfig(space)
      .then((cfg) => {
        if (!mounted) return;
        if (!cfg) {
          setMemoryModelDesc('跟随会话模型 (默认)');
        } else {
          const modeLabel =
            cfg.mode === 'deepseek_flash'
              ? '优选 Flash'
              : cfg.mode === 'custom'
                ? '自定义模型'
                : '跟随聊天模型';
          setMemoryModelDesc(`${cfg.modelId} (${modeLabel})`);
        }
      })
      .catch(() => {
        if (mounted) setMemoryModelDesc('跟随会话模型');
      });
    return () => {
      mounted = false;
    };
  }, [space]);

  const intervalModes: Array<{ key: ImIntervalMode; label: string; desc: string }> = [
    { key: 'fast', label: '快', desc: '200ms' },
    { key: 'medium', label: '中 (推荐)', desc: '350ms' },
    { key: 'slow', label: '慢', desc: '600ms' },
    { key: 'random', label: '随机', desc: '200~500ms' },
  ];

  const charSpeedGears: Array<{ key: ImCharSpeedGear; label: string; desc: string }> = [
    { key: 'fast', label: '快', desc: '20ms/字' },
    { key: 'medium', label: '中', desc: '50ms/字' },
    { key: 'slow', label: '慢', desc: '80ms/字' },
  ];

  const dndPresets = [
    { label: '标准 (23:00~07:30)', start: '23:00', end: '07:30' },
    { label: '夜猫 (01:00~09:00)', start: '01:00', end: '09:00' },
    { label: '早睡 (22:00~06:30)', start: '22:00', end: '06:30' },
  ];

  const currentDndStart = settings.globalDndStartTime || '23:00';
  const currentDndEnd = settings.globalDndEndTime || '07:30';

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text.title} />
        </Pressable>
        <Text style={styles.headerTitle}>聊天设置</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 全局生命周期总控 */}
        <Text style={styles.sectionHeader}>全局总控</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.labelCol}>
              <Text style={styles.rowTitle}>所有角色主动问候总开关</Text>
              <Text style={styles.rowSub}>一键关闭或开启所有角色的主动关怀</Text>
            </View>
            <Switch
              accessibilityLabel="所有角色主动问候总开关"
              value={settings.globalHeartbeatEnabled}
              onValueChange={(val) => void update({ globalHeartbeatEnabled: val })}
              trackColor={{ true: colors.primary.default, false: colors.border.strong }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.labelCol}>
              <Text style={styles.rowTitle}>所有角色后台发消息</Text>
              <Text style={styles.rowSub}>允许未打开应用时接收预埋心跳消息</Text>
            </View>
            <Switch
              accessibilityLabel="所有角色后台发消息"
              value={settings.globalProactiveEnabled}
              onValueChange={(val) => void update({ globalProactiveEnabled: val })}
              trackColor={{ true: colors.primary.default, false: colors.border.strong }}
            />
          </View>
        </View>

        {/* 全局作息免打扰 (P2) */}
        <Text style={styles.sectionHeader}>全局作息免打扰</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.labelCol}>
              <Text style={styles.rowTitle}>夜间免打扰守卫</Text>
              <Text style={styles.rowSub}>
                免打扰时段内的主动联系提醒顺延至次日清晨苏醒后发送
              </Text>
            </View>
            <Switch
              accessibilityLabel="夜间免打扰守卫"
              value={settings.globalDndEnabled !== false}
              onValueChange={(val) => void update({ globalDndEnabled: val })}
              trackColor={{ true: colors.primary.default, false: colors.border.strong }}
            />
          </View>

          {settings.globalDndEnabled !== false && (
            <>
              <View style={styles.divider} />
              <Text style={styles.subLabel}>快捷作息时段选择</Text>
              <View style={styles.dndPresetsWrap}>
                {dndPresets.map((preset) => {
                  const isSelected = currentDndStart === preset.start && currentDndEnd === preset.end;
                  return (
                    <Pressable
                      key={preset.label}
                      onPress={() =>
                        void update({
                          globalDndStartTime: preset.start,
                          globalDndEndTime: preset.end,
                        })
                      }
                      style={[styles.dndPresetBtn, isSelected && styles.dndPresetBtnActive]}
                    >
                      <Text style={[styles.dndPresetText, isSelected && styles.dndPresetTextActive]}>
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* 记忆系统与维护模型 (Layer B/P2) */}
        <Text style={styles.sectionHeader}>记忆系统与维护模型</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.labelCol}>
              <Text style={styles.rowTitle}>生效维护模型</Text>
              <Text style={styles.rowSub}>
                负责前缀上下文压缩、偏好冲突消解与高显著性异步事实提炼
              </Text>
            </View>
            <View style={styles.modelBadge}>
              <Text style={styles.modelBadgeText}>{memoryModelDesc}</Text>
            </View>
          </View>
        </View>

        {/* 多气泡间隔时延设置 */}
        <Text style={styles.sectionHeader}>连发气泡间隔延时</Text>
        <View style={styles.card}>
          <View style={styles.segmentGroup}>
            {intervalModes.map((item) => {
              const active = settings.intervalMode === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => void update({ intervalMode: item.key })}
                  style={[styles.segmentBtn, active && styles.segmentActive]}
                >
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{item.label}</Text>
                  <Text style={[styles.segmentSub, active && styles.segmentSubActive]}>{item.desc}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.labelCol}>
              <Text style={styles.rowTitle}>根据消息长度自动添加延时</Text>
              <Text style={styles.rowSub}>长句自动增加拟人打字耗时（默认关闭）</Text>
            </View>
            <Switch
              accessibilityLabel="根据消息长度自动添加延时"
              value={settings.charDelayEnabled}
              onValueChange={(val) => void update({ charDelayEnabled: val })}
              trackColor={{ true: colors.primary.default, false: colors.border.strong }}
            />
          </View>

          {settings.charDelayEnabled && (
            <View style={styles.subSegmentWrap}>
              {charSpeedGears.map((g) => {
                const active = settings.charSpeedGear === g.key;
                return (
                  <Pressable
                    key={g.key}
                    onPress={() => void update({ charSpeedGear: g.key })}
                    style={[styles.gearBtn, active && styles.gearBtnActive]}
                  >
                    <Text style={[styles.gearLabel, active && styles.gearLabelActive]}>{g.label} ({g.desc})</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 发送延时与输入探测 */}
        <Text style={styles.sectionHeader}>发送延时与连续输入探测</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.labelCol}>
              <Text style={styles.rowTitle}>发送请求等待时间: {settings.debounceWaitSec} 秒</Text>
              <Text style={styles.rowSub}>
                发消息后在此窗口内暂停请求。若此时间内输入框有草稿（正在继续输入）则挂起，直到输入框为空才正式发送。
              </Text>
            </View>
          </View>
          <View style={styles.sliderRow}>
            {[1, 2, 3, 5, 10, 15, 30].map((sec) => (
              <Pressable
                key={sec}
                onPress={() => void update({ debounceWaitSec: sec })}
                style={[styles.secPill, settings.debounceWaitSec === sec && styles.secPillActive]}
              >
                <Text style={[styles.secPillText, settings.debounceWaitSec === sec && styles.secPillTextActive]}>
                  {sec}s
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.page },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.background.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.default,
  },
  backBtn: {
    width: metrics.minTouchSize,
    height: metrics.minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.text.title },
  headerPlaceholder: { width: metrics.minTouchSize },
  scrollContent: { padding: spacing[3], paddingBottom: 40 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: spacing[2],
    marginLeft: 4,
    marginTop: spacing[3],
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.md,
    padding: metrics.cardPadding,
    ...shadows.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelCol: { flex: 1, marginRight: spacing[3] },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text.title, marginBottom: 2 },
  rowSub: { fontSize: 12, color: colors.text.secondary, lineHeight: 17 },
  subLabel: { fontSize: 12, fontWeight: '500', color: colors.text.secondary, marginBottom: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border.subtle, marginVertical: spacing[3] },
  dndPresetsWrap: { gap: 6 },
  dndPresetBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.xs,
    backgroundColor: colors.background.tag,
  },
  dndPresetBtnActive: {
    backgroundColor: colors.primary.default,
  },
  dndPresetText: {
    fontSize: 13,
    color: colors.text.body,
  },
  dndPresetTextActive: {
    color: colors.text.inverse,
    fontWeight: '500',
  },
  modelBadge: {
    backgroundColor: colors.background.tag,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.xs,
    maxWidth: 160,
  },
  modelBadgeText: {
    fontSize: 12,
    color: colors.text.primary,
    fontWeight: '500',
  },
  segmentGroup: { flexDirection: 'row', backgroundColor: colors.background.tag, borderRadius: radius.sm, padding: 3 },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.xs },
  segmentActive: { backgroundColor: colors.background.surface, ...shadows.xs },
  segmentLabel: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  segmentLabelActive: { color: colors.text.title, fontWeight: '700' },
  segmentSub: { fontSize: 10, color: colors.text.tertiary, marginTop: 1 },
  segmentSubActive: { color: colors.text.title },
  subSegmentWrap: { flexDirection: 'row', gap: 6, marginTop: 10 },
  gearBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.xs, backgroundColor: colors.background.tag },
  gearBtnActive: { backgroundColor: colors.border.default },
  gearLabel: { fontSize: 12, color: colors.text.secondary },
  gearLabelActive: { color: colors.text.title, fontWeight: '700' },
  sliderRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  secPill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.xs, backgroundColor: colors.background.tag },
  secPillActive: { backgroundColor: colors.primary.default },
  secPillText: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  secPillTextActive: { color: colors.text.inverse },
});
