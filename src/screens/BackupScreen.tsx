import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

import { PageStateBlock } from '../components/PageStateBlock';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { ipRepository, runWithDatabaseSpace, settingsRepository, type IpRecord, type PixorySpace } from '../database';
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
import { formatDateTime } from '../utils/formatters';
import { useToast } from '../components/AppToast';
import { trackPersonalTask, type PersonalTaskToken } from '../services/personalTaskToken';

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
    ['BackupScreen', refreshToken, space],
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
    if (isBackingUp || isExporting) return;
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
    if (isBackingUp || isExporting) return;
    setIsBackingUp(true);
    try {
      const result = await trackPersonalTask(taskToken, task());
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
    if (space !== 'personal' || isBackingUp || isExporting) return;
    try {
      const pickResult = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/octet-stream', '*/*'],
      });
      if (pickResult.canceled || !pickResult.assets[0]?.uri) return;
      setIsBackingUp(true);
      const result = await trackPersonalTask(taskToken, importEncryptedPersonalPack({
        packageUri: pickResult.assets[0].uri,
        secret: personalSecret,
        mode: 'merge',
        taskToken,
      }));
      const optionalNotice = result.missingOptionalFileCount > 0
        ? `，${result.missingOptionalFileCount} 个可选预览缺失`
        : '';
      showToast(
        `已导入 ${result.importedIpCount} 个 IP、${result.importedImageCount} 个素材、` +
        `${result.restoredManagedFileCount} 个 AI 文件和 ${result.restoredAiRecordCount} 条 AI 数据${result.remappedAiLogicalIdCount > 0 ? `，安全改写 ${result.remappedAiLogicalIdCount} 个冲突标识` : ''}${optionalNotice}`
      );
      reload();
    } catch (error) {
      showToast(error instanceof Error ? `加密包导入失败：${error.message}` : '加密包导入失败');
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleExportToSystemDirectory(backup: BackupResultView) {
    if (isBackingUp || isExporting) return;
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
    if (isBackingUp || isExporting) return;
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
    if (isBackingUp || isExporting) return;
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
    return (
      <View style={styles.resultPanel}>
        <Text style={styles.resultTitle}>{backup.title}</Text>
        <Text style={styles.resultHint}>
          {backup.exportedDirUri ? '已复制到默认导出文件夹' : '已生成，尚未复制到系统文件夹'}
        </Text>
        <Text style={styles.resultLabel}>位置</Text>
        <Text selectable style={styles.resultPath}>{backup.exportedDirUri || backup.result.backupDir}</Text>
        <View style={styles.resultActionContainer}>
          <Pressable
            disabled={isBackingUp || isExporting}
            onPress={() => handleExportToSystemDirectory(backup)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed, (isBackingUp || isExporting) && styles.buttonDisabled]}
          >
            <Text style={styles.secondaryButtonText}>{backup.exportedDirUri ? '再次导出' : '导出到文件夹'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScreenScaffold backgroundColor="#f9f9f9" decorativeTitle="Backup" onBack={onBack} scrollable title="备份导出">
      <View style={styles.container}>
        
        {/* Recent Backup Status Card */}
        <View style={styles.recentBackupCard}>
          <Text style={styles.recentBackupLabel}>最近备份</Text>
          <Text style={styles.recentBackupValue}>{data?.lastBackupAt ? formatDateTime(data.lastBackupAt) : '还没有备份'}</Text>
        </View>

        {/* Default Export Folder Card */}
        <View style={styles.exportFolderCard}>
          <View style={styles.exportFolderHeader}>
            <View style={styles.iconCircle}>
              <Ionicons color="#1a1c1c" name="folder-outline" size={20} />
            </View>
            <View style={styles.exportFolderTextContainer}>
              <Text style={styles.exportFolderTitle}>默认导出文件夹</Text>
              {defaultExportDirectoryUri && (
                <Text ellipsizeMode="middle" numberOfLines={1} style={styles.exportFolderValue}>
                  {defaultExportDirectoryUri}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.exportFolderAction}>
            <Pressable
              disabled={isBackingUp || isExporting}
              onPress={handleChooseDefaultExportDirectory}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed, (isBackingUp || isExporting) && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonText}>选择默认文件夹</Text>
            </Pressable>
          </View>
        </View>

        {space === 'personal' ? (
          <View style={{ gap: 16 }}>
            <TextInput
              onChangeText={setPersonalSecret}
              placeholder="再次输入 Personal System 密码"
              placeholderTextColor="#767676"
              secureTextEntry
              style={styles.secretInput}
              value={personalSecret}
            />
            <Pressable
              disabled={isBackingUp || !personalSecret.trim()}
              onPress={() => runEncryptedExport(() => createEncryptedPersonalPack(personalSecret, taskToken), '隐私加密包已生成')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, (isBackingUp || !personalSecret.trim()) && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonText}>{isBackingUp ? '加密中...' : '加密导出隐私 .pixorypack'}</Text>
            </Pressable>
            <Pressable
              disabled={isBackingUp || !personalSecret.trim()}
              onPress={() => runEncryptedExport(() => createEncryptedAllPack(personalSecret, taskToken), '全部数据加密包已生成')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, (isBackingUp || !personalSecret.trim()) && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonText}>加密导出全部数据</Text>
            </Pressable>
            <Pressable
              disabled={isBackingUp || !personalSecret.trim()}
              onPress={handleEncryptedImport}
              style={({ pressed }) => [styles.secondaryButton, { alignSelf: 'center', width: '100%', height: 48 }, pressed && styles.buttonPressed, (isBackingUp || !personalSecret.trim()) && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonText}>合并导入加密 .pixorypack</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.primaryActionContainer}>
            <Pressable
              disabled={isBackingUp}
              onPress={handleCreateFullBackup}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, isBackingUp && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonText}>{isBackingUp ? '备份中...' : '一键完整备份'}</Text>
            </Pressable>
          </View>
        )}

        {lastBackup?.source === 'full' ? renderBackupResultCard(lastBackup) : null}

        {lastEncryptedPack ? (
          <View style={styles.resultPanel}>
            <Text style={styles.resultTitle}>最近加密包</Text>
            <Text selectable style={styles.resultPath}>{lastEncryptedPack.packUri}</Text>
            <Text style={styles.resultHint}>单个加密 .pixorypack · AES-256</Text>
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
            <View style={styles.ipSection}>
              <View style={styles.ipSectionHeader}>
                <Text style={styles.ipSectionTitle}>导出单个 IP 资产包</Text>
              </View>
              <View style={styles.ipCardContainer}>
                {ips.map((ip) => (
                  <View key={ip.id}>
                    <View style={styles.ipCard}>
                      <View style={styles.ipCardTextContainer}>
                        <Text numberOfLines={1} style={styles.ipCardTitle}>{ip.name}</Text>
                      </View>
                      <Pressable
                        disabled={isBackingUp || isExporting}
                        onPress={() => handleCreateIpBackup(ip)}
                        style={({ pressed }) => [styles.iconButton, pressed && styles.buttonPressed, (isBackingUp || isExporting) && styles.buttonDisabled]}
                      >
                        <Ionicons
                          color="#1a1c1c"
                          name={activeIpExportId === ip.id || (isExporting && lastBackup?.ipId === ip.id) ? 'hourglass-outline' : 'download-outline'}
                          size={20}
                        />
                      </Pressable>
                    </View>
                    {lastBackup?.source === 'ip' && lastBackup.ipId === ip.id ? renderBackupResultCard(lastBackup) : null}
                  </View>
                ))}
              </View>
            </View>
          </PageStateBlock>
        ) : null}
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f9f9f9',
    gap: 20,
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  recentBackupCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    elevation: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  recentBackupLabel: {
    color: '#5e5e5e',
    fontSize: 13,
    fontWeight: '400',
  },
  recentBackupValue: {
    color: '#1a1c1c',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  exportFolderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    elevation: 1,
    gap: 4,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  exportFolderHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: '#f3f3f4',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  exportFolderTextContainer: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  exportFolderTitle: {
    color: '#1a1c1c',
    fontSize: 15,
    fontWeight: '600',
  },
  exportFolderValue: {
    color: '#767676',
    fontSize: 13,
    marginTop: 2,
  },
  exportFolderAction: {
    alignItems: 'flex-end',
    marginTop: 8,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f3f3f4',
    borderRadius: 4,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: '#1a1c1c',
    fontSize: 12,
    fontWeight: '500',
  },
  primaryActionContainer: {
    paddingTop: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 4,
    elevation: 1,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    width: '100%',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  ipSection: {
    flexDirection: 'column',
    gap: 12,
    paddingTop: 12,
  },
  ipSectionHeader: {
    flexDirection: 'column',
    gap: 4,
    paddingHorizontal: 4,
  },
  ipSectionTitle: {
    color: '#1a1c1c',
    fontSize: 20,
    fontWeight: '500',
  },
  ipCardContainer: {
    gap: 12,
  },
  ipCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    elevation: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  ipCardTextContainer: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
  },
  ipCardTitle: {
    color: '#1a1c1c',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#f3f3f4',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  resultPanel: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e5e5',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    marginTop: 8,
    padding: 16,
  },
  resultTitle: {
    color: '#1a1c1c',
    fontSize: 15,
    fontWeight: '600',
  },
  resultLabel: {
    color: '#767676',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
  },
  resultPath: {
    color: '#1a1c1c',
    fontSize: 11,
  },
  resultHint: {
    color: '#767676',
    fontSize: 11,
    marginTop: 4,
  },
  resultActionContainer: {
    alignItems: 'flex-end',
    marginTop: 12,
  },
  secretInput: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e5e5',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1a1c1c',
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12,
  },
});
