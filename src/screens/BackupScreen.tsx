import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ipRepository, settingsRepository, type IpRecord } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { createFullBackup, createIpBackup, type BackupResult } from '../services/backupService';
import { formatDateTime } from '../utils/formatters';
import { useToast } from '../components/AppToast';

interface BackupScreenProps {
  refreshToken: number;
  onBack: () => void;
}

export function BackupScreen({ refreshToken, onBack }: BackupScreenProps) {
  const { showToast } = useToast();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastResult, setLastResult] = useState<BackupResult | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ ips: IpRecord[]; lastBackupAt: string | null }>(
    async () => {
      const [ips, lastBackupAt] = await Promise.all([ipRepository.findAll(), settingsRepository.getLastBackupAt()]);
      return { ips, lastBackupAt };
    },
    [refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取备份信息失败：${message}`;
      },
      initialData: { ips: [], lastBackupAt: null },
    }
  );
  const ips = data?.ips ?? [];

  async function runBackup(task: () => Promise<BackupResult>, successMessage: string) {
    if (isBackingUp) {
      return;
    }

    setIsBackingUp(true);
    try {
      const result = await task();
      setLastResult(result);
      showToast(successMessage);
      reload();
    } catch (error) {
      showToast(error instanceof Error ? `备份失败：${error.message}` : '备份失败');
    } finally {
      setIsBackingUp(false);
    }
  }

  return (
    <ScreenScaffold decorativeTitle="Backup" onBack={onBack} scrollable title="备份导出">
      <View style={styles.safetyPanel}>
        <Ionicons color={colors.semantic.success} name="shield-checkmark-outline" size={18} />
        <View style={styles.safetyCopy}>
          <Text style={styles.safetyTitle}>完整备份包含 SQLite、原图、缩略图和 manifest</Text>
          <Text style={styles.safetyText}>原图按原文件复制；缩略图是独立预览文件，不压缩、不重编码。</Text>
        </View>
      </View>

      <View style={styles.statusPanel}>
        <Text style={styles.statusLabel}>最近备份</Text>
        <Text style={styles.statusValue}>{data?.lastBackupAt ? formatDateTime(data.lastBackupAt) : '还没有备份'}</Text>
      </View>

      <PrimaryButton
        disabled={isBackingUp}
        label={isBackingUp ? '备份中' : '一键完整备份'}
        loading={isBackingUp}
        onPress={() => runBackup(createFullBackup, '完整备份已生成')}
      />

      {lastResult ? (
        <View style={styles.resultPanel}>
          <Text style={styles.resultTitle}>最近导出目录</Text>
          <Text selectable style={styles.resultPath}>{lastResult.backupDir}</Text>
          <Text style={styles.resultMeta}>原图 {lastResult.originalCount} · 缩略图 {lastResult.thumbnailCount}</Text>
        </View>
      ) : null}

      <PageStateBlock
        emptyDescription="创建 IP 后，可以导出单个 IP 资产包。"
        emptyIconName="archive-outline"
        emptyTitle="没有可导出的 IP"
        errorMessage={errorMessage}
        isEmpty={!isLoading && ips.length === 0}
        loading={isLoading}
        loadingDescription="正在读取可导出的 IP。"
        loadingTitle="读取备份信息"
        onRetry={reload}
      >
        <View style={styles.ipList}>
          <Text style={styles.sectionTitle}>导出单个 IP 资产包</Text>
          {ips.map((ip) => (
            <Pressable
              key={ip.id}
              onPress={() => runBackup(() => createIpBackup(ip.id), `已导出「${ip.name}」`)}
              style={({ pressed }) => [styles.ipRow, pressed && styles.pressed]}
            >
              <View style={styles.ipCopy}>
                <Text numberOfLines={1} style={styles.ipName}>{ip.name}</Text>
                <Text style={styles.ipMeta}>SQLite 副本 + 当前 IP 原图和缩略图</Text>
              </View>
              <Ionicons color={colors.primary.default} name="download-outline" size={18} />
            </Pressable>
          ))}
        </View>
      </PageStateBlock>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  safetyPanel: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
  },
  safetyCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  safetyTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  safetyText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  statusPanel: {
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    padding: spacing[3],
  },
  statusLabel: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  statusValue: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  resultPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    padding: spacing[3],
  },
  resultTitle: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  resultPath: {
    ...typography.textStyles.micro,
    color: colors.text.body,
  },
  resultMeta: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  ipList: {
    gap: spacing[2],
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  ipRow: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 58,
    paddingHorizontal: spacing[3],
  },
  ipCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  ipName: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  ipMeta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.78,
  },
});
