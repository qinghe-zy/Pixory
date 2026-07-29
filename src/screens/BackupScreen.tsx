import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { PageStateBlock } from '../components/PageStateBlock';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ipRepository, runWithDatabaseSpace, settingsRepository, type IpRecord, type PixorySpace } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import {
  createEncryptedAllPack,
  createEncryptedPersonalPack,
  createFullBackup,
  createIpBackup,
  exportBackupToSystemDirectory,
  importEncryptedPersonalPack,
  requestBackupExportDirectory,
  type BackupResult,
  type EncryptedPackResult,
} from '../services/backupService';
import { formatDateTime, formatFileSize } from '../utils/formatters';
import { useToast } from '../components/AppToast';
import type { PersonalTaskToken } from '../services/personalTaskToken';

interface BackupScreenProps {
  space?: PixorySpace;
  taskToken?: PersonalTaskToken | null;
  refreshToken: number;
  onBack: () => void;
}

type BackupResultView = {
  result: BackupResult;
  title: string;
  source: 'full' | 'ip';
  ipId?: number;
  exportedDirUri?: string | null;
  exportedFileCount?: number | null;
};

type BackupScreenData = {
  ips: IpRecord[];
  lastBackupAt: string | null;
  backupExportDirectoryUri: string | null;
};

export function BackupScreen({ space = 'normal', taskToken = null, refreshToken, onBack }: BackupScreenProps) {
  const { showToast } = useToast();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeIpExportId, setActiveIpExportId] = useState<number | null>(null);
  const [exportDirectoryOverrideUri, setExportDirectoryOverrideUri] = useState<string | null | undefined>(undefined);
  const [lastBackup, setLastBackup] = useState<BackupResultView | null>(null);
  const [lastEncryptedPack, setLastEncryptedPack] = useState<EncryptedPackResult | null>(null);
  const [personalSecret, setPersonalSecret] = useState('');
  const { data, isLoading, errorMessage, reload } = useScreenLoad<BackupScreenData>(
    async () => {
      const [ips, lastBackupAt, backupExportDirectoryUri] = await runWithDatabaseSpace(space, (db) =>
        Promise.all([
          ipRepository.findAll(db),
          settingsRepository.getLastBackupAt(db),
          settingsRepository.getBackupExportDirectoryUri(db),
        ])
      );
      return { ips, lastBackupAt, backupExportDirectoryUri };
    },
    [refreshToken, space],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取备份信息失败：${message}`;
      },
      initialData: { ips: [], lastBackupAt: null, backupExportDirectoryUri: null },
    }
  );
  const ips = data?.ips ?? [];
  const defaultExportDirectoryUri = exportDirectoryOverrideUri !== undefined
    ? exportDirectoryOverrideUri
    : data?.backupExportDirectoryUri ?? null;

  async function rememberExportDirectoryUri(uri: string | null) {
    await runWithDatabaseSpace(space, (db) => settingsRepository.setBackupExportDirectoryUri(db, uri));
    setExportDirectoryOverrideUri(uri);
    reload();
  }

  async function chooseDefaultExportDirectory(): Promise<string> {
    const uri = await requestBackupExportDirectory(defaultExportDirectoryUri);
    await rememberExportDirectoryUri(uri);
    return uri;
  }

  async function getExportDirectoryForBackup(): Promise<string> {
    return defaultExportDirectoryUri ?? chooseDefaultExportDirectory();
  }

  async function handleChooseDefaultExportDirectory() {
    if (isBackingUp || isExporting) {
      return;
    }

    setIsExporting(true);
    try {
      await chooseDefaultExportDirectory();
      showToast('默认导出文件夹已更新');
    } catch (error) {
      showToast(error instanceof Error ? `选择文件夹失败：${error.message}` : '选择文件夹失败');
    } finally {
      setIsExporting(false);
    }
  }

  async function runEncryptedExport(task: () => Promise<EncryptedPackResult>, successMessage: string) {
    if (isBackingUp || isExporting) {
      return;
    }

    setIsBackingUp(true);
    try {
      const result = await task();
      setLastEncryptedPack(result);
      setLastBackup(null);
      showToast(successMessage);
      reload();
    } catch (error) {
      showToast(error instanceof Error ? `导出失败：${error.message}` : '导出失败');
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleEncryptedImport() {
    if (space !== 'personal' || isBackingUp || isExporting) {
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
        taskToken,
      });
      const optionalNotice = result.missingOptionalFileCount > 0
        ? `，${result.missingOptionalFileCount} 个可选预览缺失`
        : '';
      showToast(
        `已导入 ${result.importedIpCount} 个 IP、${result.importedImageCount} 个素材、` +
        `${result.restoredManagedFileCount} 个 AI 文件和 ${result.restoredAiRecordCount} 条 AI 数据${optionalNotice}`
      );
      reload();
    } catch (error) {
      showToast(error instanceof Error ? `加密包导入失败：${error.message}` : '加密包导入失败');
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleExportToSystemDirectory(backup: BackupResultView) {
    if (isBackingUp || isExporting) {
      return;
    }

    setIsExporting(true);
    try {
      const destinationDirUri = await getExportDirectoryForBackup();
      const exportResult = await exportBackupToSystemDirectory(backup.result.backupDir, destinationDirUri);
      setLastBackup((current) =>
        current?.result.backupDir === backup.result.backupDir
          ? {
              ...current,
              exportedDirUri: exportResult.exportedDirUri,
              exportedFileCount: exportResult.copiedFileCount,
            }
          : current
      );
      showToast(`已复制 ${exportResult.copiedFileCount} 个文件到默认导出文件夹`);
    } catch (error) {
      showToast(error instanceof Error ? `导出失败：${error.message}` : '导出失败');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleCreateFullBackup() {
    if (isBackingUp || isExporting) {
      return;
    }

    setIsBackingUp(true);
    try {
      const result = await createFullBackup('normal');
      const backupView: BackupResultView = {
        result,
        source: 'full',
        title: '完整备份包',
      };
      setLastBackup(backupView);
      setLastEncryptedPack(null);
      reload();

      setIsBackingUp(false);
      setIsExporting(true);
      try {
        const destinationDirUri = await getExportDirectoryForBackup();
        const exportResult = await exportBackupToSystemDirectory(result.backupDir, destinationDirUri);
        setLastBackup({
          ...backupView,
          exportedDirUri: exportResult.exportedDirUri,
          exportedFileCount: exportResult.copiedFileCount,
        });
        showToast('完整备份已导出到默认文件夹');
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        showToast(message.includes('未选择') ? '完整备份已生成，未设置默认导出文件夹' : `导出失败：${message || '未知错误'}`);
      } finally {
        setIsExporting(false);
      }
    } catch (error) {
      showToast(error instanceof Error ? `备份失败：${error.message}` : '备份失败');
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleCreateIpBackup(ip: IpRecord) {
    if (isBackingUp || isExporting) {
      return;
    }

    setActiveIpExportId(ip.id);
    setIsBackingUp(true);
    try {
      const result = await createIpBackup(ip.id, 'normal');
      const backupView: BackupResultView = {
        result,
        source: 'ip',
        ipId: ip.id,
        title: `「${ip.name}」资产包`,
      };
      setLastBackup(backupView);
      setLastEncryptedPack(null);
      reload();

      setIsBackingUp(false);
      setIsExporting(true);
      try {
        const destinationDirUri = await getExportDirectoryForBackup();
        const exportResult = await exportBackupToSystemDirectory(result.backupDir, destinationDirUri);
        setLastBackup({
          ...backupView,
          exportedDirUri: exportResult.exportedDirUri,
          exportedFileCount: exportResult.copiedFileCount,
        });
        showToast(`已导出「${ip.name}」到默认文件夹`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        showToast(message.includes('未选择') ? '已生成本地资产包，未设置默认导出文件夹' : `导出失败：${message || '未知错误'}`);
      } finally {
        setIsExporting(false);
      }
    } catch (error) {
      showToast(error instanceof Error ? `导出失败：${error.message}` : '导出失败');
    } finally {
      setIsBackingUp(false);
      setActiveIpExportId(null);
    }
  }

  function renderBackupResultCard(backup: BackupResultView) {
    const isIpBackup = backup.source === 'ip';

    return (
      <View style={[styles.resultPanel, isIpBackup && styles.ipResultPanel]}>
        <View style={styles.resultHeader}>
          <View style={styles.resultIcon}>
            <Ionicons color={colors.primary.default} name={backup.exportedDirUri ? 'checkmark-circle-outline' : 'folder-open-outline'} size={18} />
          </View>
          <View style={styles.resultHeaderCopy}>
          <Text style={styles.resultTitle}>{backup.title}</Text>
            <Text style={styles.resultHint}>
              {backup.exportedDirUri ? '已复制到默认导出文件夹，可在文件管理器中查看。' : '已生成在 Pixory 私有目录，还没有复制到系统文件夹。'}
            </Text>
          </View>
        </View>
        <View style={styles.resultDivider} />
        <Text style={styles.resultLabel}>生成时间</Text>
        <Text style={styles.resultMeta}>{formatDateTime(backup.result.createdAt)}</Text>
        <Text style={styles.resultLabel}>内容</Text>
        <Text style={styles.resultMeta}>
          SQLite + manifest + 原图 {backup.result.originalCount} · 缩略图 {backup.result.thumbnailCount} · {formatFileSize(backup.result.totalBytes)}
        </Text>
        <Text style={styles.resultLabel}>App 内部备份位置</Text>
        <Text selectable style={styles.resultPath}>{backup.result.backupDir}</Text>
        <Text style={styles.resultHint}>这是 App 私有目录，系统文件管理器通常不能直接打开；需要选择系统文件夹后复制出去。</Text>
        {backup.exportedDirUri ? (
          <>
            <Text style={styles.resultLabel}>系统导出位置</Text>
            <Text selectable style={styles.resultPath}>{backup.exportedDirUri}</Text>
            <Text style={styles.resultHint}>已复制 {backup.exportedFileCount ?? 0} 个文件。Android 可能显示为 content:// 地址，对应你刚才选择的文件夹。</Text>
          </>
        ) : null}
        <PrimaryButton
          disabled={isBackingUp || isExporting}
          label={backup.exportedDirUri ? '再次导出到默认文件夹' : '导出到默认文件夹'}
          loading={isExporting}
          onPress={() => handleExportToSystemDirectory(backup)}
          variant="outline"
        />
      </View>
    );
  }

  return (
    <ScreenScaffold backgroundVariant="backup" decorativeTitle="Backup" onBack={onBack} scrollable title="备份导出">
      <View style={styles.safetyPanel}>
        <Ionicons color={colors.semantic.success} name="shield-checkmark-outline" size={18} />
        <View style={styles.safetyCopy}>
          <Text style={styles.safetyTitle}>完整备份包含 SQLite、原图、缩略图和 manifest</Text>
          <Text style={styles.safetyText}>
            原图按原文件复制；缩略图是独立预览文件，不压缩、不重编码。普通备份不包含隐私系统数据。
          </Text>
        </View>
      </View>

      <View style={styles.statusPanel}>
        <Text style={styles.statusLabel}>最近备份</Text>
        <Text style={styles.statusValue}>{data?.lastBackupAt ? formatDateTime(data.lastBackupAt) : '还没有备份'}</Text>
      </View>

      <View style={styles.exportDirectoryPanel}>
        <View style={styles.exportDirectoryHeader}>
          <View style={styles.exportDirectoryIcon}>
            <Ionicons color={colors.primary.default} name="folder-open-outline" size={18} />
          </View>
          <View style={styles.exportDirectoryCopy}>
            <Text style={styles.exportDirectoryTitle}>默认导出文件夹</Text>
            <Text selectable style={styles.exportDirectoryPath}>
              {defaultExportDirectoryUri ?? '还没有选择；首次导出时会先让你选择。'}
            </Text>
          </View>
        </View>
        <PrimaryButton
          disabled={isBackingUp || isExporting}
          label={defaultExportDirectoryUri ? '更改默认文件夹' : '选择默认文件夹'}
          loading={isExporting && !isBackingUp}
          onPress={handleChooseDefaultExportDirectory}
          variant="outline"
        />
      </View>

      {space === 'personal' ? (
        <View style={styles.personalExportPanel}>
          <Text style={styles.sectionTitle}>隐私导出</Text>
          <Text style={styles.resultHint}>隐私数据只能从已解锁的隐私模式导出为加密 .pixorypack。</Text>
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
            label={isBackingUp ? '加密中' : '加密导出隐私 .pixorypack'}
            loading={isBackingUp}
            onPress={() => runEncryptedExport(() => createEncryptedPersonalPack(personalSecret, taskToken), '隐私加密包已生成')}
          />
          <PrimaryButton
            disabled={isBackingUp || !personalSecret.trim()}
            label="加密导出全部数据"
            onPress={() => runEncryptedExport(() => createEncryptedAllPack(personalSecret, taskToken), '全部数据加密包已生成')}
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
          onPress={handleCreateFullBackup}
        />
      )}

      {lastBackup?.source === 'full' ? renderBackupResultCard(lastBackup) : null}

      {lastEncryptedPack ? (
        <View style={styles.resultPanel}>
          <Text style={styles.resultTitle}>最近加密包</Text>
          <Text selectable style={styles.resultPath}>{lastEncryptedPack.packUri}</Text>
          <Text style={styles.resultMeta}>单个加密 .pixorypack · AES-256</Text>
        </View>
      ) : null}

      {space === 'normal' ? (
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
            <Text style={styles.sectionHint}>点选 IP 后会先生成本地资产包，再复制到默认导出文件夹；没有默认文件夹时会先让你选择。</Text>
            {ips.map((ip) => (
              <View key={ip.id} style={styles.ipExportItem}>
                <Pressable
                  disabled={isBackingUp || isExporting}
                  onPress={() => handleCreateIpBackup(ip)}
                  style={({ pressed }) => [
                    styles.ipRow,
                    (isBackingUp || isExporting) && styles.disabledRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.ipCopy}>
                    <Text numberOfLines={1} style={styles.ipName}>{ip.name}</Text>
                    <Text style={styles.ipMeta}>复制 SQLite、manifest、原图和缩略图到默认导出文件夹</Text>
                  </View>
                  <Ionicons
                    color={colors.primary.default}
                    name={activeIpExportId === ip.id || (isExporting && lastBackup?.ipId === ip.id) ? 'hourglass-outline' : 'download-outline'}
                    size={18}
                  />
                </Pressable>
                {lastBackup?.source === 'ip' && lastBackup.ipId === ip.id ? renderBackupResultCard(lastBackup) : null}
              </View>
            ))}
          </View>
        </PageStateBlock>
      ) : null}
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
    gap: rhythm.microGap,
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
  exportDirectoryPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.listCardGap,
    padding: spacing[3],
  },
  exportDirectoryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
  },
  exportDirectoryIcon: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderRadius: radius.md,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  exportDirectoryCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  exportDirectoryTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  exportDirectoryPath: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  resultPanel: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: rhythm.microGap,
    padding: spacing[3],
  },
  ipResultPanel: {
    backgroundColor: colors.background.input,
  },
  resultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
  },
  resultIcon: {
    alignItems: 'center',
    backgroundColor: colors.background.tag,
    borderRadius: radius.md,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  resultHeaderCopy: {
    flex: 1,
    gap: rhythm.microGap,
    minWidth: 0,
  },
  resultDivider: {
    backgroundColor: colors.border.divider,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing[1],
  },
  resultTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
  },
  resultLabel: {
    ...typography.textStyles.micro,
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
    gap: rhythm.listCardGap,
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
    gap: rhythm.listCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.sectionTitle,
  },
  sectionHint: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  ipExportItem: {
    gap: rhythm.listCardGap,
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
    gap: rhythm.microGap,
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
