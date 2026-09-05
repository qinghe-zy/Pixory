import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import type { PixorySpace } from '../database';
import { runWithDatabaseSpace } from '../database/db';
import { settingsRepository } from '../database/repositories/settingsRepository';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useDeveloperMode } from '../utils/dev';

interface SettingsScreenProps {
  space: PixorySpace;
  onBack: () => void;
  onOpenDeveloperMode: () => void;
  onOpenDiagnostics: () => void;
}

export function SettingsScreen({ space, onBack, onOpenDeveloperMode, onOpenDiagnostics }: SettingsScreenProps) {
  const developerMode = useDeveloperMode();
  const [diagnosticsEnabled, setDiagnosticsEnabledState] = useState(false);

  useEffect(() => {
    let mounted = true;
    void runWithDatabaseSpace(space, (db) => settingsRepository.getDiagnosticsSettings(db)).then((settings) => {
      if (mounted) setDiagnosticsEnabledState(settings.enabled);
    });
    return () => {
      mounted = false;
    };
  }, [space]);

  return (
    <ScreenScaffold onBack={onBack} scrollable title="设置">
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>基础设置</Text>
        <Text style={styles.description}>常用的聊天、资料和应用设置会在这里集中管理。</Text>
        <View style={styles.placeholderRow}>
          <View style={styles.iconWrap}>
            <Ionicons color={colors.text.secondary} name="options-outline" size={20} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.rowTitle}>更多设置</Text>
            <Text style={styles.rowDescription}>正在整理中，不影响现有聊天和资料功能。</Text>
          </View>
        </View>
      </View>

      {developerMode ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>开发者模式</Text>
          <Text style={styles.description}>开发者专用功能只在这里显示，不会出现在“我的”页面一级入口。</Text>
          <SettingsRow
            icon="code-slash-outline"
            title="开发者模式"
            description="查看状态或关闭开发者模式"
            onPress={onOpenDeveloperMode}
          />
          {diagnosticsEnabled ? (
            <SettingsRow
              icon="speedometer-outline"
              title="性能与诊断"
              description="查看性能数据、异常记录并导出诊断包"
              onPress={onOpenDiagnostics}
            />
          ) : null}
        </View>
      ) : null}
    </ScreenScaffold>
  );
}

function SettingsRow({
  icon,
  title,
  description,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.iconWrap}>
        <Ionicons color={colors.primary.active} name={icon} size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Ionicons color={colors.text.secondary} name="chevron-forward" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: 1,
    margin: spacing[6],
    marginBottom: 0,
    padding: spacing[6],
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: typography.size.sectionTitle,
    fontWeight: '700',
  },
  description: {
    color: colors.text.secondary,
    fontSize: typography.size.body,
    lineHeight: 21,
    marginTop: spacing[2],
  },
  row: {
    alignItems: 'center',
    borderTopColor: colors.border.subtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
    paddingTop: spacing[4],
  },
  placeholderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[5],
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  copy: {
    flex: 1,
    gap: spacing[1],
  },
  rowTitle: {
    color: colors.text.primary,
    fontSize: typography.size.body,
    fontWeight: '600',
  },
  rowDescription: {
    color: colors.text.secondary,
    fontSize: typography.size.caption,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.78,
  },
});
