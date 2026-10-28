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
  onOpenPerformanceSettings?: () => void;
  onOpenAppearanceSettings?: () => void;
  onOpenProviderSettings?: () => void;
  onOpenProfileInfo?: () => void;
  onOpenImCompanionSettings?: () => void;
}

export function SettingsScreen({
  space,
  onBack,
  onOpenDeveloperMode,
  onOpenDiagnostics,
  onOpenPasswordSecurity,
  onOpenAdvancedSettings,
  onOpenPerformanceSettings,
  onOpenAppearanceSettings,
  onOpenProviderSettings,
  onOpenProfileInfo,
  onOpenImCompanionSettings,
}: SettingsScreenProps) {
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
    <ScreenScaffold
      contentContainerStyle={styles.scrollContent}
      onBack={onBack}
      scrollable
      title="设置"
    >
      <View style={styles.container}>
        {onOpenProfileInfo ? (
          <View style={styles.insetGroup}>
            <SettingsRow
              icon="person-circle-outline"
              onPress={onOpenProfileInfo}
              title="个人信息"
              valueText="头像、昵称与圆角"
            />
          </View>
        ) : null}

        <View style={styles.insetGroup}>
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

        <View style={styles.insetGroup}>
          {onOpenProviderSettings ? (
            <SettingsRow
              icon="hardware-chip-outline"
              title="全局默认模型"
              onPress={onOpenProviderSettings}
              showBorder={Boolean(onOpenPerformanceSettings || onOpenAppearanceSettings)}
            />
          ) : null}
          {onOpenPerformanceSettings ? (
            <SettingsRow
              icon="speedometer-outline"
              title="性能设置"
              onPress={onOpenPerformanceSettings}
              showBorder={Boolean(onOpenAppearanceSettings)}
            />
          ) : null}
          {onOpenAppearanceSettings ? (
            <SettingsRow
              icon="color-palette-outline"
              title="外观设置"
              onPress={onOpenAppearanceSettings}
              showBorder={Boolean(onOpenImCompanionSettings)}
            />
          ) : null}
          {onOpenImCompanionSettings ? (
            <SettingsRow
              icon="chatbubbles-outline"
              title="伴聊设置"
              onPress={onOpenImCompanionSettings}
            />
          ) : null}
        </View>

        {developerMode && (
          <View style={styles.insetGroup}>
            <SettingsRow
              icon="code-slash-outline"
              title="开发者工具"
              onPress={onOpenDeveloperMode}
              showBorder
            />
            <SettingsRow
              icon="bug-outline"
              title="诊断与日志"
              valueText={diagnosticsEnabled ? '已开启' : undefined}
              onPress={onOpenDiagnostics}
            />
          </View>
        )}
      </View>
    </ScreenScaffold>
  );
}

function SettingsRow({
  icon,
  title,
  valueText,
  onPress,
  showBorder,
  showRedDot,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  valueText?: string;
  onPress: () => void;
  showBorder?: boolean;
  showRedDot?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color="#1A1C1C" />
        {showRedDot && <View style={styles.redDot} />}
      </View>
      <View style={[styles.rowContent, showBorder && styles.rowContentBorder]}>
        <Text style={styles.rowTitle}>{title}</Text>
        <View style={styles.rowRight}>
          {valueText ? <Text style={styles.rowValue}>{valueText}</Text> : null}
          <Ionicons name="chevron-forward" size={17} color="#C4C7C7" />
        </View>
      </View>
    </Pressable>
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
    paddingLeft: spacing[4],
    minHeight: 50,
    backgroundColor: '#FFFFFF',
  },
  rowPressed: {
    backgroundColor: '#F3F3F4',
  },
  rowIcon: {
    width: 28,
    alignItems: 'flex-start',
    position: 'relative',
    marginRight: spacing[1],
  },
  redDot: {
    position: 'absolute',
    top: -2,
    right: 4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.semantic.danger,
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing[4],
    paddingVertical: 14,
    minHeight: 50,
  },
  rowContentBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  rowTitle: {
    ...typography.textStyles.body,
    fontSize: 15,
    color: '#1A1C1C',
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowValue: {
    fontSize: 13,
    color: '#8E8E93',
  },
});