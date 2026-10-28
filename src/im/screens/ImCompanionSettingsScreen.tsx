import React from 'react';
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

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <Text style={styles.headerTitle}>伴聊设置</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 全局生命周期总控 */}
        <Text style={styles.sectionHeader}>全局总控</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.labelCol}>
              <Text style={styles.rowTitle}>所有伴侣心跳总开关</Text>
              <Text style={styles.rowSub}>一键关闭或开启所有伴侣的主动关怀</Text>
            </View>
            <Switch
              value={settings.globalHeartbeatEnabled}
              onValueChange={(val) => void update({ globalHeartbeatEnabled: val })}
              trackColor={{ true: '#1A1C1C', false: '#D4D8DD' }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.labelCol}>
              <Text style={styles.rowTitle}>所有伴侣后台发消息</Text>
              <Text style={styles.rowSub}>允许未打开应用时接收预埋心跳消息</Text>
            </View>
            <Switch
              value={settings.globalProactiveEnabled}
              onValueChange={(val) => void update({ globalProactiveEnabled: val })}
              trackColor={{ true: '#1A1C1C', false: '#D4D8DD' }}
            />
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
              value={settings.charDelayEnabled}
              onValueChange={(val) => void update({ charDelayEnabled: val })}
              trackColor={{ true: '#1A1C1C', false: '#D4D8DD' }}
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
  container: { flex: 1, backgroundColor: '#ECEEF1' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8DCE0' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  headerPlaceholder: { width: 32 },
  scrollContent: { padding: 12, paddingBottom: 40 },
  sectionHeader: { fontSize: 13, fontWeight: '600', color: '#666666', marginBottom: 6, marginLeft: 4, marginTop: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelCol: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#222222', marginBottom: 2 },
  rowSub: { fontSize: 12, color: '#888888', lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F0F2F4', marginVertical: 12 },
  segmentGroup: { flexDirection: 'row', backgroundColor: '#F0F2F5', borderRadius: 10, padding: 3 },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segmentActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  segmentLabel: { fontSize: 13, fontWeight: '600', color: '#555555' },
  segmentLabelActive: { color: '#1A1C1C', fontWeight: '700' },
  segmentSub: { fontSize: 10, color: '#999999', marginTop: 1 },
  segmentSubActive: { color: '#1A1C1C' },
  subSegmentWrap: { flexDirection: 'row', gap: 6, marginTop: 10 },
  gearBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: '#F5F6F8' },
  gearBtnActive: { backgroundColor: '#E5E7EB' },
  gearLabel: { fontSize: 12, color: '#555555' },
  gearLabelActive: { color: '#1A1C1C', fontWeight: '700' },
  sliderRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  secPill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#F0F2F5' },
  secPillActive: { backgroundColor: '#1A1C1C' },
  secPillText: { fontSize: 13, fontWeight: '600', color: '#555555' },
  secPillTextActive: { color: '#FFFFFF' },
});
