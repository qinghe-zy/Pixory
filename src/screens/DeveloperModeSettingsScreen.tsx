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
    void runWithDatabaseSpace(space, async (db) => {
      const settings = await settingsRepository.getDiagnosticsSettings(db);
      if (mounted) {
        setDiagnostics(settings);
      }
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
    <ScreenScaffold
      contentContainerStyle={styles.scrollContent}
      onBack={onBack}
      scrollable
      title="开发者模式"
    >
      <View style={styles.container}>
        <View style={styles.insetGroup}>
          <View style={[styles.row, styles.rowBorder]}>
            <Text style={styles.rowTitle}>开发者模式状态</Text>
            <Text style={styles.statusText}>{developerMode || isDeveloperModeEnabled() ? '已开启' : '已关闭'}</Text>
          </View>

          <View style={styles.row}>
            <View style={styles.copy}>
              <Text style={styles.rowTitle}>启用性能监测</Text>
              <Text style={styles.monitorStatus}>
                性能监测：{diagnostics.enabled ? '已开启' : '已关闭'}
              </Text>
            </View>
            <Switch
              value={diagnostics.enabled}
              onValueChange={(enabled) => { void toggleDiagnostics(enabled); }}
              thumbColor="#FFFFFF"
              trackColor={{ true: '#1A1C1C', false: colors.border.subtle }}
            />
          </View>
        </View>

        <View style={styles.insetGroup}>
          <Pressable onPress={confirmDisable} style={({ pressed }) => [styles.dangerRow, pressed && styles.pressed]}>
            <Text style={styles.dangerButtonText}>关闭开发者模式</Text>
          </Pressable>
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
    paddingVertical: 10,
    backgroundColor: '#F9F9F9',
    gap: 10,
  },
  insetGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    minHeight: 50,
    backgroundColor: '#FFFFFF',
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  copy: {
    flex: 1,
    paddingVertical: 10,
  },
  rowTitle: {
    ...typography.textStyles.body,
    fontSize: 15,
    color: '#1A1C1C',
    fontWeight: '500',
  },
  statusText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  monitorStatus: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  dangerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    backgroundColor: '#FFFFFF',
  },
  dangerButtonText: {
    color: colors.semantic.danger,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    backgroundColor: '#F3F3F4',
  },
});
