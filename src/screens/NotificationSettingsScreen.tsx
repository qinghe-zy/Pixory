import React, { useEffect, useState, useCallback } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenScaffold } from '../components/ScreenScaffold';
import type { PixorySpace } from '../database';
import { runWithDatabaseSpace } from '../database/db';
import {
  settingsRepository,
  type NotificationSettingsRecord,
} from '../database/repositories/settingsRepository';
import { colors, radius, spacing, typography } from '../design/tokens';
import {
  checkNotificationPermission,
  openAppNotificationSettings,
  requestNotificationPermission,
} from '../im/services/imNotificationManager';

interface NotificationSettingsScreenProps {
  onBack: () => void;
  space: PixorySpace;
}

export function NotificationSettingsScreen({
  onBack,
  space,
}: NotificationSettingsScreenProps) {
  const [hasSystemPermission, setHasSystemPermission] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [settings, setSettings] = useState<NotificationSettingsRecord>({
    enabled: true,
    showContent: true,
    showAvatar: true,
    dndEnabled: true,
    dndStart: '23:00',
    dndEnd: '08:00',
    vibrationEnabled: true,
  });

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const [granted, cfg] = await Promise.all([
          checkNotificationPermission(),
          runWithDatabaseSpace(space, (db) =>
            settingsRepository.getNotificationSettings(db)
          ).catch(() => null),
        ]);
        if (!isMounted) return;
        setHasSystemPermission(granted);
        if (cfg) {
          setSettings(cfg);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void init();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkNotificationPermission().then((granted) => {
          if (isMounted) setHasSystemPermission(granted);
        });
      }
    });

    return () => {
      isMounted = false;
      sub.remove();
    };
  }, [space]);

  const updateSetting = useCallback(
    async (partial: Partial<NotificationSettingsRecord>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
      try {
        await runWithDatabaseSpace(space, (db) =>
          settingsRepository.saveNotificationSettings(db, partial)
        );
      } catch {}
    },
    [space]
  );

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    if (!granted) {
      openAppNotificationSettings();
    } else {
      setHasSystemPermission(true);
    }
  };

  return (
    <ScreenScaffold contentContainerStyle={styles.scrollContent} onBack={onBack} scrollable title="通知管理">
      <View style={styles.container}>
        {/* 系统通知权限警告横幅 */}
        {!hasSystemPermission && (
          <View style={styles.permissionAlertCard}>
            <View style={styles.alertHeaderRow}>
              <Ionicons color="#D97706" name="warning-outline" size={20} />
              <Text style={styles.alertTitle}>系统通知已被禁用</Text>
            </View>
            <Text style={styles.alertDesc}>
              Pixory 无法在后台发送主动消息与生活问候。建议在系统设置中允许通知权限。
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={handleRequestPermission}
              style={({ pressed }) => [styles.alertActionBtn, pressed && styles.btnPressed]}
            >
              <Text style={styles.alertActionBtnText}>前往系统设置开启</Text>
              <Ionicons color="#FFFFFF" name="chevron-forward" size={14} />
            </Pressable>
          </View>
        )}

        {/* 基础通知控制 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>基础设置</Text>
        </View>
        <View style={styles.insetGroup}>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>接收主动问候与通知</Text>
              <Text style={styles.rowDescription}>
                开启后，将在日常白天依生活节奏主动向你发送关怀提醒
              </Text>
            </View>
            <Switch
              disabled={loading}
              onValueChange={(val) => void updateSetting({ enabled: val })}
              thumbColor={Platform.OS === 'android' ? (settings.enabled ? '#006948' : '#F4F4F5') : undefined}
              trackColor={{ false: '#E4E4E7', true: '#A7F3D0' }}
              value={settings.enabled}
            />
          </View>

          <View style={[styles.row, styles.lastRow]}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>通知振动提醒</Text>
              <Text style={styles.rowDescription}>来信或拍一拍唤醒时触发触觉轻振动</Text>
            </View>
            <Switch
              disabled={loading || !settings.enabled}
              onValueChange={(val) => void updateSetting({ vibrationEnabled: val })}
              thumbColor={Platform.OS === 'android' ? (settings.vibrationEnabled ? '#006948' : '#F4F4F5') : undefined}
              trackColor={{ false: '#E4E4E7', true: '#A7F3D0' }}
              value={settings.vibrationEnabled}
            />
          </View>
        </View>

        {/* 隐私防窥保护 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>隐私与防偷窥</Text>
        </View>
        <View style={styles.insetGroup}>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>显示消息详情正文</Text>
              <Text style={styles.rowDescription}>
                {settings.showContent
                  ? '已开启：通知栏可直接预览发来的具体生活私信'
                  : '已隐藏：通知仅提示“你收到了一条新消息”，防止被他人窥见'}
              </Text>
            </View>
            <Switch
              disabled={loading || !settings.enabled}
              onValueChange={(val) => void updateSetting({ showContent: val })}
              thumbColor={Platform.OS === 'android' ? (settings.showContent ? '#006948' : '#F4F4F5') : undefined}
              trackColor={{ false: '#E4E4E7', true: '#A7F3D0' }}
              value={settings.showContent}
            />
          </View>

          <View style={[styles.row, styles.lastRow]}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>显示专属名称与身份</Text>
              <Text style={styles.rowDescription}>
                {settings.showAvatar
                  ? '已开启：通知标题显示角色专属姓名（如“林浅浅”）'
                  : '已隐藏：通知标题统一显示“新消息”，保护角色隐私身份'}
              </Text>
            </View>
            <Switch
              disabled={loading || !settings.enabled}
              onValueChange={(val) => void updateSetting({ showAvatar: val })}
              thumbColor={Platform.OS === 'android' ? (settings.showAvatar ? '#006948' : '#F4F4F5') : undefined}
              trackColor={{ false: '#E4E4E7', true: '#A7F3D0' }}
              value={settings.showAvatar}
            />
          </View>
        </View>

        {/* 夜间免打扰 */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>夜间勿扰时段</Text>
        </View>
        <View style={styles.insetGroup}>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>夜间免打扰模式</Text>
              <Text style={styles.rowDescription}>
                每天 23:00 至次日 08:00 期间静默写日记与入眠，不打扰休息
              </Text>
            </View>
            <Switch
              disabled={loading || !settings.enabled}
              onValueChange={(val) => void updateSetting({ dndEnabled: val })}
              thumbColor={Platform.OS === 'android' ? (settings.dndEnabled ? '#006948' : '#F4F4F5') : undefined}
              trackColor={{ false: '#E4E4E7', true: '#A7F3D0' }}
              value={settings.dndEnabled}
            />
          </View>

          <View style={[styles.row, styles.lastRow]}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>免打扰时段范围</Text>
              <Text style={styles.rowDescription}>深宵温暖静默期，守护深度睡眠</Text>
            </View>
            <Text style={styles.fixedTimeTag}>{settings.dndStart} ~ {settings.dndEnd}</Text>
          </View>
        </View>

        {/* 底部温馨说明 */}
        <View style={styles.footerInfo}>
          <Ionicons color="#94A3B8" name="information-circle-outline" size={16} />
          <Text style={styles.footerInfoText}>
            点击系统通知将自动唤醒 Pixory 并瞬间直达该对话聊天室。私密空间（Personal Space）在锁定状态下严禁注册系统通知，严格遵守数据物理隔离铁律。
          </Text>
        </View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 0,
  },
  container: {
    paddingVertical: spacing[3],
    backgroundColor: colors.background.secondary,
    gap: spacing[3],
  },
  permissionAlertCard: {
    marginHorizontal: spacing[3],
    padding: spacing[3],
    backgroundColor: '#FFFBEB',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
    gap: spacing[2],
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertTitle: {
    ...typography.textStyles.body,
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  alertDesc: {
    fontSize: 12,
    color: '#B45309',
    lineHeight: 18,
  },
  alertActionBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.xs,
    marginTop: 4,
  },
  alertActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnPressed: {
    opacity: 0.85,
  },
  sectionHeader: {
    paddingHorizontal: spacing[4],
    paddingTop: 4,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  insetGroup: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.sm,
    marginHorizontal: spacing[2],
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.subtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  rowContent: {
    flex: 1,
    marginRight: spacing[3],
    gap: 3,
  },
  rowTitle: {
    ...typography.textStyles.body,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.primary,
  },
  rowDescription: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 17,
  },
  fixedTimeTag: {
    fontSize: 14,
    fontWeight: '600',
    color: '#006948',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  footerInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
  },
});
