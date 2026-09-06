import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import type { PixorySpace } from '../database';
import { runWithDatabaseSpace } from '../database/db';
import { settingsRepository, type DiagnosticsSettingsRecord } from '../database/repositories/settingsRepository';
import { setDiagnosticsEnabled } from '../diagnostics/diagnosticLogger';
import { colors, radius, spacing, typography } from '../design/tokens';
import { isDeveloperModeEnabled, setDeveloperModeEnabled, useDeveloperMode } from '../utils/dev';

export function DeveloperModeSettingsScreen({ onBack, space }: { onBack: () => void; space: PixorySpace }) {
  const developerMode = useDeveloperMode();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSettingsRecord>({ enabled: false, retentionDays: 7, maxEvents: 20000 });

  useEffect(() => {
    let mounted = true;
    void runWithDatabaseSpace(space, (db) => settingsRepository.getDiagnosticsSettings(db)).then((settings) => {
      if (mounted) setDiagnostics(settings);
    });
    return () => {
      mounted = false;
    };
  }, [space]);

  async function toggleDiagnostics(enabled: boolean) {
    const next = await runWithDatabaseSpace(space, (db) => settingsRepository.updateDiagnosticsSettings(db, { enabled }));
    setDiagnostics(next);
    setDiagnosticsEnabled(space, next.enabled);
  }

  function confirmDisable() {
    Alert.alert(
      '关闭开发者模式',
      '关闭后只隐藏开发者专用功能，不删除聊天、记忆、备份或诊断日志。是否关闭？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '关闭',
          style: 'destructive',
          onPress: () => {
            void setDeveloperModeEnabled(false).then(onBack);
          },
        },
      ],
    );
  }

  return (
    <ScreenScaffold onBack={onBack} scrollable title="开发者模式">
      <View style={styles.card}>
        <Text style={styles.title}>开发者模式</Text>
        <Text style={styles.description}>
          用于查看性能与诊断数据。关闭后只隐藏开发者专用入口，不会删除任何业务数据。
        </Text>
        <View style={styles.statusRow}>
          <Text style={styles.label}>开发者模式状态</Text>
          <Text style={styles.status}>{developerMode || isDeveloperModeEnabled() ? '已开启' : '已关闭'}</Text>
        </View>
        <View style={styles.monitorRow}>
          <View style={styles.monitorCopy}>
            <Text style={styles.label}>启用性能监测</Text>
            <Text style={styles.monitorDescription}>首次默认关闭。开启后才会显示“性能与诊断”入口并记录诊断数据。</Text>
            <Text style={[styles.monitorStatus, diagnostics.enabled ? styles.enabledStatus : styles.disabledStatus]}>
              性能监测：{diagnostics.enabled ? '已开启' : '已关闭'}
            </Text>
          </View>
          <Switch value={diagnostics.enabled} onValueChange={(enabled) => { void toggleDiagnostics(enabled); }} />
        </View>
        <Pressable onPress={confirmDisable} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>关闭开发者模式</Text>
        </Pressable>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    margin: spacing[6],
    padding: spacing[6],
  },
  title: {
    color: colors.text.primary,
    fontSize: typography.size.sectionTitle,
    fontWeight: '700',
  },
  description: {
    color: colors.text.secondary,
    fontSize: typography.size.body,
    lineHeight: 21,
    marginTop: spacing[3],
  },
  statusRow: {
    alignItems: 'center',
    borderTopColor: colors.border.subtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[5],
    paddingTop: spacing[4],
  },
  label: {
    color: colors.text.primary,
    fontSize: typography.size.body,
  },
  status: {
    color: colors.primary.active,
    fontSize: typography.size.body,
    fontWeight: '700',
  },
  monitorRow: {
    alignItems: 'center',
    borderTopColor: colors.border.subtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[5],
    paddingTop: spacing[4],
  },
  monitorCopy: {
    flex: 1,
    gap: spacing[1],
  },
  monitorDescription: {
    color: colors.text.secondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  monitorStatus: {
    fontSize: typography.size.caption,
    fontWeight: '600',
    lineHeight: 18,
  },
  enabledStatus: {
    color: colors.primary.active,
  },
  disabledStatus: {
    color: colors.text.secondary,
  },
  button: {
    alignItems: 'center',
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing[5],
    padding: spacing[4],
  },
  buttonText: {
    color: colors.semantic.danger,
    fontSize: typography.size.body,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.78,
  },
});
