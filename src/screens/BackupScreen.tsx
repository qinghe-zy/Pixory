import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ipRepository, runWithDatabaseSpace, settingsRepository, type IpRecord, type PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import {
  createEncryptedAllPack,
  createEncryptedPersonalPack,
  createFullBackup,
  createIpBackup,
  createPersonalIpPlainBackup,
  createPersonalPlainBackup,
  exportBackupToSystemDirectory,
  importEncryptedPersonalPack,
  type BackupResult,
  type EncryptedPackResult,
} from '../services/backupService';
import { formatDateTime, formatFileSize } from '../utils/formatters';
import { useToast } from '../components/AppToast';

interface BackupScreenProps {
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
}

export function BackupScreen({ space = 'normal', refreshToken, onBack }: BackupScreenProps) {
  const { showToast } = useToast();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastResult, setLastResult] = useState<BackupResult | null>(null);
  const [lastEncryptedPack, setLastEncryptedPack] = useState<EncryptedPackResult | null>(null);
  const [lastExportUri, setLastExportUri] = useState<string | null>(null);
  const [personalSecret, setPersonalSecret] = useState('');
  const { data, isLoading, errorMessage, reload } = useScreenLoad<{ ips: IpRecord[]; lastBackupAt: string | null }>(
    async () => {
      const [ips, lastBackupAt] = await runWithDatabaseSpace(space, () => Promise.all([ipRepository.findAll(), settingsRepository.getLastBackupAt()]));
      return { ips, lastBackupAt };
    },
    [refreshToken, space],
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
      setLastEncryptedPack(null);
      setLastExportUri(null);
      showToast(successMessage);
      reload();
    } catch (error) {
      showToast(error instanceof Error ? `备份失败：${error.message}` : '备份失败');
    } finally {
      setIsBackingUp(false);
    }
  }

  async function runEncryptedExport(task: () => Promise<EncryptedPackResult>, successMessage: string) {
    if (isBackingUp) {
      return;
    }

    setIsBackingUp(true);
    try {
      const result = await task();
      setLastEncryptedPack(result);
      setLastResult(null);
      setLastExportUri(null);
      showToast(successMessage);
      reload();
    } catch (error) {
      showToast(error instanceof Error ? `导出失败：${error.message}` : '导出失败');
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleEncryptedImport() {
    if (space !== 'personal' || isBackingUp) {
      return;
    }

    try {
      const pickResult = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/octet-stream', '*/*'],
      });
      if (pickResult.canceled || !pickResult.assets[0]?.uri) {
        return;
      }
      setIsBackingUp(true);
      const result = await importEncryptedPersonalPack({
        packageUri: pickResult.assets[0].uri,
        secret: personalSecret,
        mode: 'merge',
      });
      showToast(`已合并导入 ${result.importedIpCount} 个 IP，${result.importedImageCount} 张图片`);
      reload();
    } catch (error) {
      showToast(error instanceof Error ? `加密包导入失败：${error.message}` : '加密包导入失败');
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleExportToSystemDirectory() {
    if (!lastResult || isExporting) {
      return;
    }

    setIsExporting(true);
    try {
      const exportResult = await exportBackupToSystemDirectory(lastResult.backupDir);
      setLastExportUri(exportResult.exportedDirUri);
      showToast(`已导出 ${exportResult.copiedFileCount} 个文件到系统目录`);
    } catch (error) {
      showToast(error instanceof Error ? `导出失败：${error.message}` : '导出失败');
    } finally {
      setIsExporting(false);
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

      {space === 'personal' ? (
        <View style={styles.personalExportPanel}>
          <Text style={styles.sectionTitle}>隐私导出</Text>
          <Text style={styles.resultHint}>隐私普通导出会把 private 数据明文写入你选择的导出目录；加密导出会生成单个 .pixorypack。</Text>
          <TextInput
            onChangeText={setPersonalSecret}
            placeholder="再次输入 Personal System 密码"
            placeholderTextColor={colors.text.placeholder}
            secureTextEntry
            style={styles.secretInput}
            value={personalSecret}
          />
          <PrimaryButton
            disabled={isBackingUp || !personalSecret.trim()}
            label={isBackingUp ? '导出中' : '普通导出隐私数据'}
            loading={isBackingUp}
            onPress={() => runBackup(() => createPersonalPlainBackup(personalSecret), '隐私普通备份已生成')}
            variant="outline"
          />
          <PrimaryButton
            disabled={isBackingUp || !personalSecret.trim()}
            label={isBackingUp ? '加密中' : '加密导出隐私 .pixorypack'}
            loading={isBackingUp}
            onPress={() => runEncryptedExport(() => createEncryptedPersonalPack(personalSecret), '隐私加密包已生成')}
          />
          <PrimaryButton
            disabled={isBackingUp || !personalSecret.trim()}
            label="加密导出全部数据"
            onPress={() => runEncryptedExport(() => createEncryptedAllPack(personalSecret), '全部数据加密包已生成')}
            variant="outline"
          />
          <PrimaryButton
            disabled={isBackingUp || !personalSecret.trim()}
            label="合并导入加密 .pixorypack"
            onPress={handleEncryptedImport}
            variant="ghost"
          />
        </View>
      ) : (
        <PrimaryButton
          disabled={isBackingUp}
          label={isBackingUp ? '备份中' : '一键完整备份'}
          loading={isBackingUp}
          onPress={() => runBackup(() => createFullBackup('normal'), '完整备份已生成')}
        />
      )}

      {lastResult ? (
        <View style={styles.resultPanel}>
          <Text style={styles.resultTitle}>最近备份包</Text>
          <Text selectable style={styles.resultPath}>{lastResult.backupDir}</Text>
          <Text style={styles.resultMeta}>
            SQLite + manifest + 原图 {lastResult.originalCount} · 缩略图 {lastResult.thumbnailCount} · {formatFileSize(lastResult.totalBytes)}
          </Text>
          <Text style={styles.resultHint}>这是完整本地备份，可用于迁移或后续恢复；当前版本暂不支持一键恢复。</Text>
          <PrimaryButton
            disabled={isExporting}
            label={isExporting ? '正在导出' : '导出到系统文件夹'}
            loading={isExporting}
            onPress={handleExportToSystemDirectory}
            variant="outline"
          />
          {lastExportUri ? <Text selectable style={styles.resultPath}>系统目录：{lastExportUri}</Text> : null}
        </View>
      ) : null}

      {lastEncryptedPack ? (
        <View style={styles.resultPanel}>
          <Text style={styles.resultTitle}>最近加密包</Text>
          <Text selectable style={styles.resultPath}>{lastEncryptedPack.packUri}</Text>
          <Text style={styles.resultMeta}>单个加密 .pixorypack · AES-256</Text>
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
              disabled={space === 'personal' && !personalSecret.trim()}
              key={ip.id}
              onPress={() =>
                runBackup(
                  () => (space === 'personal' ? createPersonalIpPlainBackup(personalSecret, ip.id) : createIpBackup(ip.id, 'normal')),
                  `已导出「${ip.name}」`
                )
              }
              style={({ pressed }) => [styles.ipRow, space === 'personal' && !personalSecret.trim() ? styles.disabledRow : null, pressed && styles.pressed]}
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
  resultHint: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  personalExportPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[3],
    padding: spacing[3],
  },
  secretInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[3],
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
  disabledRow: {
    opacity: 0.52,
  },
});
