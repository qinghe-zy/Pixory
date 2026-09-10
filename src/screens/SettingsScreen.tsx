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
}

export function SettingsScreen({ space, onBack, onOpenDeveloperMode, onOpenDiagnostics, onOpenPasswordSecurity }: SettingsScreenProps) {
  const developerMode = useDeveloperMode();
  const [diagnosticsEnabled, setDiagnosticsEnabledState] = useState(false);
  const [showSecurityRedDot, setShowSecurityRedDot] = useState(false);

  useEffect(() => {
    let mounted = true;
    void runWithDatabaseSpace(space, (db) => settingsRepository.getDiagnosticsSettings(db)).then((settings) => {
      if (mounted) setDiagnosticsEnabledState(settings.enabled);
    });
    
    if (space === 'personal') {
      Promise.all([
        SecureStore.getItemAsync('pixory.personal.recoveryKeyPromptSeen'),
        getPersonalCredentialConfig()
      ]).then(([seen, config]) => {
        if (mounted) {
          setShowSecurityRedDot(seen !== '1' && !config.hasRecoveryKey);
        }
      });
    }

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
            {space === 'personal' && (
              <SettingsRow
                icon="shield-checkmark-outline"
                title="密码与安全"
                onPress={onOpenPasswordSecurity}
                showBorder
                showRedDot={showSecurityRedDot}
              />
            )}
            <SettingsRow
              icon="options-outline"
              title="更多设置"
              description="正在整理中..."
              onPress={() => {}}
            />
          </View>
        </View>

        {developerMode && (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>开发者模式</Text>
            <View style={styles.card}>
              <SettingsRow
                icon="code-slash-outline"
                title="开发者模式"
                onPress={onOpenDeveloperMode}
                showBorder={diagnosticsEnabled}
              />
              {diagnosticsEnabled && (
                <SettingsRow
                  icon="speedometer-outline"
                  title="性能与诊断"
                  onPress={onOpenDiagnostics}
                />
              )}
            </View>
            <Text style={styles.sectionFooter}>开发者专用功能只在这里显示，不会出现在一级入口。</Text>
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
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description?: string;
  onPress: () => void;
  showBorder?: boolean;
  showRedDot?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, showBorder && styles.rowBorder, pressed && styles.pressed]}>
      <View style={styles.iconWrap}>
        <Ionicons color={colors.primary.active} name={icon} size={20} />
      </View>
      <View style={styles.copy}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text style={styles.rowTitle}>{title}</Text>
          {showRedDot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.semantic.danger }} />}
        </View>
      </View>
      {description && <Text style={styles.rowDescription}>{description}</Text>}
      <Ionicons color={colors.text.secondary} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing[2],
  },
  section: {
    marginBottom: spacing[6],
  },
  sectionHeader: {
    color: colors.text.secondary,
    fontSize: typography.size.caption,
    fontWeight: '600',
    paddingHorizontal: spacing[6],
    marginBottom: spacing[2],
    textTransform: 'uppercase',
  },
  sectionFooter: {
    color: colors.text.secondary,
    fontSize: typography.size.caption,
    paddingHorizontal: spacing[6],
    marginTop: spacing[2],
  },
  card: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderWidth: 1,
    borderRadius: radius.lg,
    marginHorizontal: spacing[4],
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    height: 56,
  },
  rowBorder: {
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  copy: {
    flex: 1,
  },
  rowTitle: {
    color: colors.text.primary,
    fontSize: typography.size.body,
  },
  rowDescription: {
    color: colors.text.secondary,
    fontSize: typography.size.caption,
    marginRight: spacing[1],
  },
  pressed: {
    backgroundColor: colors.background.secondary,
  },
});
