import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ImThreadSettings } from '../../repository/imSettingsRepository';
import { SecureImage } from '../../../components/SecureImage';
import { ImPromptModal } from '../modals/ImPromptModal';

export interface ImChatSettingsDrawerProps {
  companionName: string; companionAvatarUri?: string | null; roleCardId: string; settings: ImThreadSettings;
  onUpdateSettings: (patch: Partial<ImThreadSettings>) => Promise<void>; onOpenRoleDetail: (roleCardId: string) => void;
  onOpenDiary?: () => void; onPickAvatarFromAlbum: () => void; onPickAvatarFromIp: () => void; onClearAvatar: () => void;
  onPickBackgroundFromAlbum: () => void; onPickBackgroundFromIp: () => void; onClearBackground: () => void;
  onOpenModelPicker: () => void; onOpenSearch: () => void; onExportHistory: () => void; onImportHistory: () => void;
  onClearHistory: () => void; onEditNudgeText: () => void; onNudge: () => void;
}

export function ImChatSettingsDrawer({
  companionName, companionAvatarUri, roleCardId, settings, onUpdateSettings,
  onOpenRoleDetail, onOpenDiary, onPickAvatarFromAlbum, onPickAvatarFromIp,
  onClearAvatar, onPickBackgroundFromAlbum, onPickBackgroundFromIp, onClearBackground,
  onOpenModelPicker, onOpenSearch, onExportHistory, onImportHistory, onClearHistory, onNudge,
}: ImChatSettingsDrawerProps) {
  const insets = useSafeAreaInsets();
  const lastTapRef = useRef<number>(0);
  const [promptConfig, setPromptConfig] = useState<{
    visible: boolean; title: string; subtitle?: string; initialValue?: string; placeholder?: string; presets?: Array<{ label: string; value: string }>; onConfirm: (val: string) => void;
  }>({ visible: false, title: '', onConfirm: () => {} });

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

  const handleAdjustNudge = () => {
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
      presets: [{ label: '10 轮', value: '10' }, { label: '20 轮 (推荐)', value: '20' }, { label: '35 轮', value: '35' }, { label: '50 轮', value: '50' }],
      onConfirm: (val) => {
        const parsed = parseInt(val.trim(), 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 200) void onUpdateSettings({ contextWindowN: parsed });
      },
    });
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 56, 72) }]} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <Pressable accessibilityLabel="伴侣头像" onPress={handleAvatarPress} style={styles.avatarWrap}>
            {companionAvatarUri ? (
              <SecureImage space="normal" style={styles.avatarImg} uri={companionAvatarUri} />
            ) : (
              <View style={styles.avatarFallback}><Text style={styles.fallbackLetter}>{companionName.slice(0, 1)}</Text></View>
            )}
          </Pressable>
          <Text numberOfLines={1} style={styles.nameText}>{companionName}</Text>
          <Text style={styles.nudgeHint}>双击头像拍一拍：“{settings.nudgeText || '的小脑袋'}”</Text>
        </View>

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
          {companionAvatarUri && <SettingRow icon="trash-outline" isDestructive isLast onPress={onClearAvatar} title="清除自定义头像" />}
        </View>

        <View style={styles.section}>
          <SettingRow icon="color-palette-outline" onPress={onPickBackgroundFromAlbum} title="设置聊天背景 · 相册" />
          <SettingRow icon="images-outline" isLast={!settings.backgroundImageUri} onPress={onPickBackgroundFromIp} title="设置聊天背景 · IP库" />
          {Boolean(settings.backgroundImageUri) && (
            <SettingRow icon="trash-outline" isDestructive isLast onPress={onClearBackground} title="清除聊天背景" />
          )}
        </View>

        <View style={styles.section}>
          <SettingRow icon="hardware-chip-outline" onPress={onOpenModelPicker} title="专属大模型" valueText={settings.modelId || '跟随全局默认'} />
          <SettingRow icon="timer-outline" onPress={handleAdjustContextWindow} title="历史记忆装填" valueText={`${settings.contextWindowN || 20} 轮`} />
          <SettingSwitchRow icon="heart-outline" onToggle={(val) => void onUpdateSettings({ heartbeatEnabled: val })} title="伴侣主动发来消息" value={settings.heartbeatEnabled !== false} />
          <SettingSwitchRow icon="notifications-outline" onToggle={(val) => void onUpdateSettings({ proactiveEnabled: val })} title="后台推演生活状态" value={settings.proactiveEnabled !== false} />
          <SettingRow icon="hand-left-outline" isLast onPress={handleAdjustNudge} title="设置拍一拍回应" valueText={settings.nudgeText || '的小脑袋'} />
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
    </View>
  );
}

const SettingRow = React.memo(function SettingRow({ title, icon, valueText, onPress, isDestructive, isLast }: { title: string; icon: keyof typeof Ionicons.glyphMap; valueText?: string; onPress: () => void; isDestructive?: boolean; isLast?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, isLast && styles.noBorderRow, pressed && styles.rowPressed]}>
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  noBorderRow: { borderBottomWidth: 0 },
  rowPressed: { opacity: 0.7 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowIcon: { marginRight: 10 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: '#1A1C1C' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { fontSize: 13, color: '#6B7280', maxWidth: 120 },
  destructiveText: { color: '#EF4444' },
});
