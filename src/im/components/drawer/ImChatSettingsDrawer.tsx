import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PixorySpace } from '../../../database';
import type { ImThreadSettings } from '../../repository/imSettingsRepository';
import { SecureImage } from '../../../components/SecureImage';
import { ImPromptModal } from '../modals/ImPromptModal';
import { ImCompanionMemoryModal } from '../modals/ImCompanionMemoryModal';
import { ImCompanionPersonaModal } from '../modals/ImCompanionPersonaModal';
import { imUsageTelemetry, type ImUsageTelemetryRecord } from '../../services/imUsageTelemetry';
import {
  checkNotificationPermission,
  requestNotificationPermission,
  openAppNotificationSettings,
} from '../../services/imNotificationManager';

export interface ImChatSettingsDrawerProps {
  space: PixorySpace;
  threadId: string;
  companionName: string;
  companionAvatarUri?: string | null;
  roleCardId: string;
  settings: ImThreadSettings;
  onUpdateSettings: (patch: Partial<ImThreadSettings>) => Promise<void>;
  onOpenRoleDetail: (roleCardId: string) => void;
  onOpenDiary?: () => void;
  onPickAvatarFromAlbum: () => void;
  onPickAvatarFromIp: () => void;
  onClearAvatar: () => void;
  onPickBackgroundFromAlbum: () => void;
  onPickBackgroundFromIp: () => void;
  onClearBackground: () => void;
  onOpenModelPicker: () => void;
  onOpenSearch: () => void;
  onExportHistory: () => void;
  onImportHistory: () => void;
  onClearHistory: () => void;
  onEditNudgeText?: () => void;
  onNudge: () => void;
}

export function ImChatSettingsDrawer({
  space,
  threadId,
  companionName,
  companionAvatarUri,
  roleCardId,
  settings,
  onUpdateSettings,
  onOpenRoleDetail,
  onOpenDiary,
  onPickAvatarFromAlbum,
  onPickAvatarFromIp,
  onClearAvatar,
  onPickBackgroundFromAlbum,
  onPickBackgroundFromIp,
  onClearBackground,
  onOpenModelPicker,
  onOpenSearch,
  onExportHistory,
  onImportHistory,
  onClearHistory,
  onEditNudgeText,
  onNudge,
}: ImChatSettingsDrawerProps) {
  const insets = useSafeAreaInsets();
  const lastTapRef = useRef<number>(0);
  const [hasNotificationPermission, setHasNotificationPermission] = useState<boolean>(true);
  const [memoryModalOpen, setMemoryModalOpen] = useState(false);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [telemetry, setTelemetry] = useState<ImUsageTelemetryRecord | null>(null);
  const [promptConfig, setPromptConfig] = useState<{
    visible: boolean;
    title: string;
    subtitle?: string;
    initialValue?: string;
    placeholder?: string;
    presets?: Array<{ label: string; value: string }>;
    onConfirm: (val: string) => void;
  }>({ visible: false, title: '', onConfirm: () => {} });

  useEffect(() => {
    let mounted = true;
    const check = () => {
      void checkNotificationPermission().then((granted) => {
        if (mounted) setHasNotificationPermission(granted);
      });
      void imUsageTelemetry.loadTurnUsageTelemetry(space, threadId).then((t) => {
        if (mounted && t) setTelemetry(t);
      });
    };
    check();
    const unsubTelemetry = imUsageTelemetry.subscribe(`${space}:${threadId}`, (rec) => {
      if (mounted) setTelemetry(rec);
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      mounted = false;
      unsubTelemetry();
      sub.remove();
    };
  }, [space, threadId]);

  const handleToggleNotificationPermission = useCallback(async () => {
    if (!hasNotificationPermission) {
      const granted = await requestNotificationPermission();
      setHasNotificationPermission(granted);
      if (!granted) {
        openAppNotificationSettings();
      }
    } else {
      openAppNotificationSettings();
    }
  }, [hasNotificationPermission]);

  const handleAvatarPress = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      onNudge();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      setTimeout(() => {
        if (lastTapRef.current === now) onOpenRoleDetail(roleCardId);
      }, 310);
    }
  };

  const handleConfirmClearAvatar = () => {
    Alert.alert('恢复默认头像', '确定清除当前自定义头像并恢复默认头像吗？', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: onClearAvatar },
    ]);
  };

  const handleConfirmClearBackground = () => {
    Alert.alert('清除聊天背景', '确定清除当前聊天背景吗？', [
      { text: '取消', style: 'cancel' },
      { text: '清除', style: 'destructive', onPress: onClearBackground },
    ]);
  };

  const handleAdjustNudge = () => {
    if (onEditNudgeText) {
      onEditNudgeText();
      return;
    }
    setPromptConfig({
      visible: true,
      title: '设置拍一拍回应',
      subtitle: '例如：“的小脑袋”或“的脸颊”',
      initialValue: settings.nudgeText || '的小脑袋',
      placeholder: '输入拍一拍后缀文字',
      onConfirm: (val) => {
        void onUpdateSettings({ nudgeText: val.trim() || '的小脑袋' });
      },
    });
  };

  const handleAdjustContextWindow = () => {
    setPromptConfig({
      visible: true,
      title: '调整历史记忆装填轮数',
      subtitle: '每轮包含一次用户提问与伴侣连续回复（聚合后）。设置过高可能增加等待时间。',
      initialValue: String(settings.contextWindowN || 20),
      placeholder: '输入 5 ~ 100 之间的轮数',
      presets: [
        { label: '10 轮', value: '10' },
        { label: '20 轮 (推荐)', value: '20' },
        { label: '35 轮', value: '35' },
        { label: '50 轮', value: '50' },
      ],
      onConfirm: (val) => {
        const parsed = parseInt(val.trim(), 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 200) {
          void onUpdateSettings({ contextWindowN: parsed });
        }
      },
    });
  };

  const handleAdjustDnd = () => {
    setPromptConfig({
      visible: true,
      title: '单伴侣作息免打扰设置',
      subtitle: '免打扰期间伴侣的主动联系闹钟将自动顺延至清晨醒来后发送。',
      initialValue:
        settings.dndOverrideEnabled === false
          ? 'off'
          : settings.dndOverrideEnabled
            ? `${settings.dndStartTime || '23:00'}-${settings.dndEndTime || '07:30'}`
            : 'default',
      placeholder: '输入 HH:mm-HH:mm 或选择预设',
      presets: [
        { label: '跟随全局默认', value: 'default' },
        { label: '标准 (23:00~07:30)', value: '23:00-07:30' },
        { label: '夜猫 (01:00~09:00)', value: '01:00-09:00' },
        { label: '早睡 (22:00~06:30)', value: '22:00-06:30' },
        { label: '关闭本伴侣免打扰', value: 'off' },
      ],
      onConfirm: (val) => {
        const trimmed = val.trim();
        if (trimmed === 'default') {
          void onUpdateSettings({ dndOverrideEnabled: null });
        } else if (trimmed === 'off') {
          void onUpdateSettings({ dndOverrideEnabled: false });
        } else {
          const parts = trimmed.split('-');
          if (parts.length === 2) {
            void onUpdateSettings({
              dndOverrideEnabled: true,
              dndStartTime: parts[0].trim(),
              dndEndTime: parts[1].trim(),
            });
          }
        }
      },
    });
  };

  const dndDisplayValue =
    settings.dndOverrideEnabled === false
      ? '已关闭'
      : settings.dndOverrideEnabled
        ? `${settings.dndStartTime || '23:00'} ~ ${settings.dndEndTime || '07:30'}`
        : '跟随全局默认';

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 56, 72) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <Pressable accessibilityLabel="伴侣头像" onPress={handleAvatarPress} style={styles.avatarWrap}>
            {companionAvatarUri ? (
              <SecureImage space={space} style={styles.avatarImg} uri={companionAvatarUri} />
            ) : (
              <View style={styles.avatarFallback}><Text style={styles.fallbackLetter}>{companionName.slice(0, 1)}</Text></View>
            )}
          </Pressable>
          <Text numberOfLines={1} style={styles.nameText}>{companionName}</Text>
          <Text style={styles.nudgeHint}>轻触看人设 · 双击拍一拍：“{settings.nudgeText || '的小脑袋'}”</Text>
        </View>

        {/* 专属相处与个性定制入口卡片 */}
        <Pressable
          accessibilityLabel="专属相处与个性定制"
          onPress={() => setPersonaModalOpen(true)}
          style={({ pressed }) => [styles.diaryCard, pressed && styles.rowPressed]}
        >
          <View style={styles.diaryLeft}>
            <View style={[styles.diaryIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons color="#3B82F6" name="heart-circle-outline" size={20} />
            </View>
            <View style={styles.diaryTextBox}>
              <View style={styles.diaryTitleRow}>
                <Text style={styles.diaryTitle}>专属相处定制</Text>
                <View style={[styles.diaryBadge, { backgroundColor: '#3B82F6' }]}>
                  <Text style={styles.diaryBadgeText}>羁绊契约</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={styles.diaryDesc}>
                {settings.personalization?.userNickname
                  ? `称呼我“${settings.personalization.userNickname}” · 风格/气泡/纪念日`
                  : '昵称称谓 · 羁绊关系 · 说话风格 · 气泡配色 · 纪念日'}
              </Text>
            </View>
          </View>
          <Ionicons color="#9CA3AF" name="chevron-forward" size={18} />
        </Pressable>

        {/* 专属记忆簿入口卡片 */}
        <Pressable accessibilityLabel="伴侣专属记忆簿" onPress={() => setMemoryModalOpen(true)} style={({ pressed }) => [styles.diaryCard, pressed && styles.rowPressed]}>
          <View style={styles.diaryLeft}>
            <View style={[styles.diaryIconBox, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons color="#D97706" name="sparkles" size={19} />
            </View>
            <View style={styles.diaryTextBox}>
              <View style={styles.diaryTitleRow}>
                <Text style={styles.diaryTitle}>专属记忆簿</Text>
                <View style={[styles.diaryBadge, { backgroundColor: '#D97706' }]}>
                  <Text style={styles.diaryBadgeText}>深层记忆</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={styles.diaryDesc}>喜好偏好 · 约定禁忌 · 记忆管理与撤销</Text>
            </View>
          </View>
          <Ionicons color="#9CA3AF" name="chevron-forward" size={18} />
        </Pressable>

        <Pressable accessibilityLabel="伴侣日记本" onPress={onOpenDiary} style={({ pressed }) => [styles.diaryCard, pressed && styles.rowPressed]}>
          <View style={styles.diaryLeft}>
            <View style={styles.diaryIconBox}><Ionicons color="#374151" name="book-outline" size={20} /></View>
            <View style={styles.diaryTextBox}>
              <View style={styles.diaryTitleRow}>
                <Text style={styles.diaryTitle}>伴侣日常日记</Text>
                <View style={styles.diaryBadge}><Text style={styles.diaryBadgeText}>专属留存</Text></View>
              </View>
              <Text numberOfLines={1} style={styles.diaryDesc}>相伴回忆 · 翻开伴侣日常日记</Text>
            </View>
          </View>
          <Ionicons color="#9CA3AF" name="chevron-forward" size={18} />
        </Pressable>

        <View style={styles.section}>
          <SettingRow icon="image-outline" onPress={onPickAvatarFromAlbum} title="修改伴侣头像 · 相册" />
          <SettingRow icon="albums-outline" isLast={!companionAvatarUri} onPress={onPickAvatarFromIp} title="修改伴侣头像 · IP库" />
          {companionAvatarUri && <SettingRow icon="trash-outline" isDestructive isLast onPress={handleConfirmClearAvatar} title="清除自定义头像" />}
        </View>

        <View style={styles.section}>
          <SettingRow icon="color-palette-outline" onPress={onPickBackgroundFromAlbum} title="设置聊天背景 · 相册" />
          <SettingRow icon="images-outline" isLast={!settings.backgroundImageUri} onPress={onPickBackgroundFromIp} title="设置聊天背景 · IP库" />
          {Boolean(settings.backgroundImageUri) && (
            <SettingRow icon="trash-outline" isDestructive isLast onPress={handleConfirmClearBackground} title="清除聊天背景" />
          )}
        </View>

        <View style={styles.section}>
          <SettingRow icon="hardware-chip-outline" onPress={onOpenModelPicker} title="专属大模型" valueText={settings.modelId || '跟随全局默认'} />
          <SettingRow icon="timer-outline" onPress={handleAdjustContextWindow} title="历史记忆装填" valueText={`${settings.contextWindowN || 20} 轮`} />
          <SettingRow icon="moon-outline" onPress={handleAdjustDnd} title="专属作息免打扰" valueText={dndDisplayValue} />
          <SettingSwitchRow icon="heart-outline" onToggle={(val) => void onUpdateSettings({ heartbeatEnabled: val })} title="伴侣主动发来消息" value={settings.heartbeatEnabled !== false} />
          <SettingSwitchRow icon="notifications-outline" onToggle={(val) => void onUpdateSettings({ proactiveEnabled: val })} title="后台推演生活状态" value={settings.proactiveEnabled !== false} />
          <SettingRow
            icon="notifications-circle-outline"
            onPress={handleToggleNotificationPermission}
            title="锁屏与系统通知"
            valueText={hasNotificationPermission ? '已开启' : '去开启 >'}
          />
          <SettingRow icon="hand-left-outline" isLast onPress={handleAdjustNudge} title="设置拍一拍回应" valueText={settings.nudgeText || '的小脑袋'} />
        </View>

        {/* 运行态与缓存健康可观测面板 (P2) */}
        <View style={styles.section}>
          <Pressable
            accessibilityLabel="运行态与缓存健康"
            accessibilityRole="button"
            onPress={() => setTelemetryExpanded((v) => !v)}
            style={({ pressed }) => [styles.row, !telemetryExpanded && styles.noBorderRow, pressed && styles.rowPressed]}
          >
            <View style={styles.rowLeft}>
              <Ionicons color="#374151" name="speedometer-outline" size={18} style={styles.rowIcon} />
              <Text style={styles.rowTitle}>运行态与缓存健康</Text>
            </View>
            <View style={styles.rowRight}>
              {telemetry ? (
                <Text style={styles.cacheBadgeText}>
                  总命中率 {((telemetry.overallCacheHitRatio ?? telemetry.lastCacheHitRatio) * 100).toFixed(0)}%
                </Text>
              ) : (
                <Text style={styles.cacheBadgeText}>未开始对话</Text>
              )}
              <Ionicons color="#9CA3AF" name={telemetryExpanded ? 'chevron-down' : 'chevron-forward'} size={16} />
            </View>
          </Pressable>
          {telemetryExpanded && (
            <View style={styles.telemetryCard}>
              <View style={styles.telemetryRow}>
                <Text style={styles.telemetryLabel}>生效模型</Text>
                <Text style={styles.telemetryValue}>{telemetry?.modelId || settings.modelId || '默认模型'}</Text>
              </View>

              {/* 全程累计检测 */}
              <View style={styles.telemetryHeaderRow}>
                <Text style={styles.telemetrySectionTitle}>全程累计检测</Text>
                <Text style={styles.telemetrySectionBadge}>共 {telemetry?.totalTurns ?? 0} 轮对话</Text>
              </View>
              <View style={styles.telemetryRow}>
                <Text style={styles.telemetryLabel}>总缓存命中率</Text>
                <Text style={[styles.telemetryValue, { color: '#059669', fontWeight: '700' }]}>
                  {telemetry ? `${((telemetry.overallCacheHitRatio ?? telemetry.lastCacheHitRatio) * 100).toFixed(0)}%` : '-'}
                </Text>
              </View>
              <View style={styles.telemetryRow}>
                <Text style={styles.telemetryLabel}>累计节约 Token</Text>
                <Text style={styles.telemetryValue}>
                  {telemetry ? `${telemetry.totalCachedPromptTokens ?? telemetry.lastCachedPromptTokens} tokens` : '-'}
                </Text>
              </View>

              {/* 上一轮即时表现 */}
              <View style={styles.telemetryHeaderRow}>
                <Text style={styles.telemetrySectionTitle}>上一轮即时表现</Text>
              </View>
              <View style={styles.telemetryRow}>
                <Text style={styles.telemetryLabel}>上一轮命中率</Text>
                <Text style={styles.telemetryValue}>
                  {telemetry ? `${((telemetry.lastCacheHitRatio ?? 0) * 100).toFixed(0)}%` : '-'}
                </Text>
              </View>
              <View style={styles.telemetryRow}>
                <Text style={styles.telemetryLabel}>上一轮前缀缓存</Text>
                <Text style={styles.telemetryValue}>
                  {telemetry ? `${telemetry.lastCachedPromptTokens} / ${telemetry.lastPromptTokens} tokens` : '-'}
                </Text>
              </View>
              <View style={[styles.telemetryRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.telemetryLabel}>上一轮生成字数</Text>
                <Text style={styles.telemetryValue}>{telemetry ? `${telemetry.lastCompletionTokens} tokens` : '-'}</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SettingRow icon="search-outline" onPress={onOpenSearch} title="查找聊天记录" />
          <SettingRow icon="share-outline" onPress={onExportHistory} title="导出聊天记录" />
          <SettingRow icon="download-outline" onPress={onImportHistory} title="导入聊天记录" />
          <SettingRow icon="trash-bin-outline" isDestructive isLast onPress={onClearHistory} title="清空聊天记录" />
        </View>
      </ScrollView>

      <ImPromptModal
        initialValue={promptConfig.initialValue}
        onClose={() => setPromptConfig((p) => ({ ...p, visible: false }))}
        onConfirm={promptConfig.onConfirm}
        placeholder={promptConfig.placeholder}
        presets={promptConfig.presets}
        subtitle={promptConfig.subtitle}
        title={promptConfig.title}
        visible={promptConfig.visible}
      />

      <ImCompanionMemoryModal
        companionName={companionName}
        onClose={() => setMemoryModalOpen(false)}
        roleCardId={roleCardId}
        space={space}
        visible={memoryModalOpen}
      />

      <ImCompanionPersonaModal
        companionName={companionName}
        onClose={() => setPersonaModalOpen(false)}
        onUpdateSettings={onUpdateSettings}
        settings={settings}
        space={space}
        visible={personaModalOpen}
      />
    </View>
  );
}

const SettingRow = React.memo(function SettingRow({ title, icon, valueText, onPress, isDestructive, isLast }: { title: string; icon: keyof typeof Ionicons.glyphMap; valueText?: string; onPress: () => void; isDestructive?: boolean; isLast?: boolean }) {
  return (
    <Pressable accessibilityLabel={title} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, isLast && styles.noBorderRow, pressed && styles.rowPressed]}>
      <View style={styles.rowLeft}><Ionicons color={isDestructive ? '#EF4444' : '#374151'} name={icon} size={18} style={styles.rowIcon} /><Text style={[styles.rowTitle, isDestructive && styles.destructiveText]}>{title}</Text></View>
      <View style={styles.rowRight}>{valueText && <Text numberOfLines={1} style={styles.rowValue}>{valueText}</Text>}<Ionicons color="#9CA3AF" name="chevron-forward" size={16} /></View>
    </Pressable>
  );
});

const SettingSwitchRow = React.memo(function SettingSwitchRow({ title, icon, value, onToggle, isLast }: { title: string; icon: keyof typeof Ionicons.glyphMap; value: boolean; onToggle: (val: boolean) => void; isLast?: boolean }) {
  return (
    <View style={[styles.row, isLast && styles.noBorderRow]}>
      <View style={styles.rowLeft}><Ionicons color="#374151" name={icon} size={18} style={styles.rowIcon} /><Text style={styles.rowTitle}>{title}</Text></View>
      <Switch onValueChange={onToggle} trackColor={{ true: '#1A1C1C', false: '#D1D5DB' }} value={value} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E7EAF0', paddingHorizontal: 12, borderWidth: 0 },
  scrollContent: { paddingTop: 10, backgroundColor: '#E7EAF0' },
  profileCard: { backgroundColor: '#FFFFFF', borderRadius: 16, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, marginBottom: 8, borderWidth: 0, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  avatarWrap: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', marginBottom: 6 },
  avatarImg: { width: '100%', height: '100%', borderRadius: 28 },
  avatarFallback: { width: '100%', height: '100%', backgroundColor: '#D4D8DD', alignItems: 'center', justifyContent: 'center' },
  fallbackLetter: { fontSize: 22, fontWeight: '700', color: '#4B5563' },
  nameText: { fontSize: 16, fontWeight: '700', color: '#1A1C1C', marginBottom: 2 },
  nudgeHint: { fontSize: 12, color: '#6B7280' },
  diaryCard: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 0, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  diaryLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  diaryIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  diaryTextBox: { flex: 1 },
  diaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  diaryTitle: { fontSize: 14, fontWeight: '700', color: '#1A1C1C' },
  diaryBadge: { backgroundColor: '#1A1C1C', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  diaryBadgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '600' },
  diaryDesc: { fontSize: 11, color: '#6B7280' },
  section: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 12, marginBottom: 8, borderWidth: 0, overflow: 'hidden', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 3 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  noBorderRow: { borderBottomWidth: 0 },
  rowPressed: { opacity: 0.7 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowIcon: { marginRight: 10 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: '#1A1C1C' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { fontSize: 13, color: '#6B7280', maxWidth: 120 },
  destructiveText: { color: '#EF4444' },
  cacheBadgeText: { fontSize: 11, color: '#059669', fontWeight: '600', backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  telemetryCard: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10, marginBottom: 10 },
  telemetryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 4, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0' },
  telemetrySectionTitle: { fontSize: 11, fontWeight: '700', color: '#334155' },
  telemetrySectionBadge: { fontSize: 10, color: '#64748B' },
  telemetryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  telemetryLabel: { fontSize: 12, color: '#64748B' },
  telemetryValue: { fontSize: 12, color: '#1E293B', fontWeight: '500' },
});
