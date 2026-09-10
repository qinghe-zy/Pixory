import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import type { PixorySpace } from '../database';
import { runWithDatabaseSpace } from '../database/db';
import { settingsRepository } from '../database/repositories/settingsRepository';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useDeveloperMode } from '../utils/dev';
import * as SecureStore from 'expo-secure-store';
import { getPersonalCredentialConfig } from '../services/personalSystemService';

interface SettingsScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onOpenDeveloperMode: () => void;
  onOpenDiagnostics: () => void;
  onOpenPasswordSecurity: () => void;
  onOpenAdvancedSettings: () => void;
}

export function SettingsScreen({ space, onBack, onOpenDeveloperMode, onOpenDiagnostics, onOpenPasswordSecurity, onOpenAdvancedSettings }: SettingsScreenProps) {
  const developerMode = useDeveloperMode();
  const [diagnosticsEnabled, setDiagnosticsEnabledState] = useState(false);
  const [showSecurityRedDot, setShowSecurityRedDot] = useState(false);

  useEffect(() => {
    let mounted = true;
    void runWithDatabaseSpace(space, (db) => settingsRepository.getDiagnosticsSettings(db)).then((settings) => {
      if (mounted) setDiagnosticsEnabledState(settings.enabled);
    });
    
    Promise.all([
      SecureStore.getItemAsync('pixory.personal.recoveryKeyPromptSeen'),
      getPersonalCredentialConfig()
    ]).then(([seen, config]) => {
      if (mounted) {
        setShowSecurityRedDot(seen !== '1' && !config.hasRecoveryKey);
      }
    });

    return () => {
      mounted = false;
    };
  }, [space]);

  return (
    <ScreenScaffold onBack={onBack} scrollable title="设置">
      <View style={styles.container}>
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>基础设置</Text>
          <View style={styles.card}>
            <SettingsRow
              icon="shield-checkmark-outline"
              title="密码与安全"
              onPress={onOpenPasswordSecurity}
              showBorder
              showRedDot={showSecurityRedDot}
            />
            <SettingsRow
              icon="options-outline"
              title="更多设置"
              onPress={onOpenAdvancedSettings}
            />
          </View>
        </View>

        {developerMode && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>开发者模式</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="code-slash-outline"
                title="开发者工具"
                description="数据库调试、临时缓存清理与重置工具"
                onPress={onOpenDeveloperMode}
                showBorder
              />
              <SettingsRow
                icon="bug-outline"
                title="诊断与日志"
                description={diagnosticsEnabled ? '诊断记录已开启，包含重要文件活动' : '启用或导出本地运行日志，排查错误'}
                onPress={onOpenDiagnostics}
              />
            </View>
          </View>
        )}
      </View>
    </ScreenScaffold>
  );
}

function SettingsRow({
  icon,
  title,
  description,
  onPress,
  showBorder,
  showRedDot,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  onPress: () => void;
  showBorder?: boolean;
  showRedDot?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, showBorder && styles.rowBorder, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={colors.text.primary} />
        {showRedDot && <View style={styles.redDot} />}
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle}>{title}</Text>
        {description && <Text style={styles.rowDescription}>{description}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing[6],
    gap: spacing[6],
  },
  section: {
    gap: spacing[3],
  },
  sectionHeader: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    paddingLeft: spacing[1.5],
  },
  card: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    minHeight: 56,
  },
  rowPressed: {
    backgroundColor: colors.background.soft,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  rowIcon: {
    width: 32,
    alignItems: 'flex-start',
    position: 'relative',
  },
  redDot: {
    position: 'absolute',
    top: -2,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.semantic.danger,
    borderWidth: 1,
    borderColor: colors.background.surface,
  },
  rowContent: {
    flex: 1,
    paddingRight: spacing[3],
  },
  rowTitle: {
    ...typography.textStyles.body,
    color: colors.text.primary,
  },
  rowDescription: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
});