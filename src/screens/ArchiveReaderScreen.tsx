import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppActionSheet, type AppActionSheetItem } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { ipRepository, runWithDatabaseSpace, type IpListItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useToast } from '../components/AppToast';
import { cleanupNativeTempSession, copyUriToFileWithProgress, extractNativeZipEntryToTemp, listNativeZipImageEntries, type NativeZipEntry } from '../native/pixoryMediaModule';
import { ensureLocalDirectory, getTempDir, joinStoragePath } from '../services/fileStorageService';
import { importImagesToIp, type PickedImageAsset } from '../services/imageImportService';
import { saveImageToSystemAlbum } from '../services/mediaLibraryService';

interface ArchiveReaderScreenProps {
  archiveUri: string;
  archiveName: string;
  onBack: () => void;
}

export function ArchiveReaderScreen({ archiveName, archiveUri, onBack }: ArchiveReaderScreenProps) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [sessionDir, setSessionDir] = useState<string | null>(null);
  const [localArchiveUri, setLocalArchiveUri] = useState<string | null>(null);
  const [entries, setEntries] = useState<NativeZipEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [currentImageUri, setCurrentImageUri] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [ipPickerVisible, setIpPickerVisible] = useState(false);
  const [normalIps, setNormalIps] = useState<IpListItem[]>([]);
  const [newIpDialogVisible, setNewIpDialogVisible] = useState(false);
  const [newIpName, setNewIpName] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const currentEntry = entries[index] ?? null;

  useEffect(() => {
    let isMounted = true;
    async function loadArchive() {
      const nextSessionDir = `${joinStoragePath(getTempDir('normal'), `archive_${Date.now()}`)}/`;
      await ensureLocalDirectory(nextSessionDir);
      const archiveCopyUri = joinStoragePath(nextSessionDir, archiveName || 'external.zip');
      await copyUriToFileWithProgress(archiveUri, archiveCopyUri, `archive-${Date.now()}`);
      const nextEntries = await listNativeZipImageEntries(archiveCopyUri);
      if (!isMounted) {
        return;
      }
      setSessionDir(nextSessionDir);
      setLocalArchiveUri(archiveCopyUri);
      setEntries(nextEntries);
      if (nextEntries.length > 0) {
        await extractEntry(archiveCopyUri, nextSessionDir, nextEntries[0]);
      }
    }

    loadArchive().catch((error) => {
      showToast(error instanceof Error ? `打开压缩包失败：${error.message}` : '打开压缩包失败');
    });

    return () => {
      isMounted = false;
      if (sessionDir) {
        void cleanupNativeTempSession(sessionDir).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!localArchiveUri || !sessionDir || !currentEntry) {
      return;
    }
    void extractEntry(localArchiveUri, sessionDir, currentEntry);
  }, [currentEntry?.name, localArchiveUri, sessionDir]);

  const moreItems: AppActionSheetItem[] = useMemo(
    () => [
      { key: 'album', label: '保存到相册', icon: 'download-outline', onPress: () => void saveCurrentToAlbum() },
      { key: 'ip', label: '保存到 IP', icon: 'albums-outline', onPress: () => void openSaveToIp() },
    ],
    [currentImageUri]
  );

  async function extractEntry(zipUri: string, tempDir: string, entry: NativeZipEntry) {
    const fileName = entry.name.split('/').pop() ?? `image_${index}.jpg`;
    const safeName = fileName.replace(/[^\w.-]+/g, '_') || `image_${index}.jpg`;
    const destinationUri = joinStoragePath(tempDir, safeName);
    const extractedUri = await extractNativeZipEntryToTemp(zipUri, entry.name, destinationUri);
    setCurrentImageUri(extractedUri);
  }

  async function saveCurrentToAlbum() {
    if (!currentImageUri || isBusy) {
      return;
    }
    setIsBusy(true);
    try {
      await saveImageToSystemAlbum(currentImageUri);
      showToast('已保存到相册');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`保存失败：${message}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function openSaveToIp() {
    const ips = await runWithDatabaseSpace('normal', (db) => ipRepository.findLibraryItems(db));
    setNormalIps(ips);
    setIpPickerVisible(true);
  }

  async function saveCurrentToIp(ipId: number) {
    if (!currentImageUri || !currentEntry || isBusy) {
      return;
    }
    setIsBusy(true);
    try {
      const sizeInfo = await FileSystem.getInfoAsync(currentImageUri);
      const dimensions = await getImageDimensions(currentImageUri);
      const pickedAsset: PickedImageAsset = {
        uri: currentImageUri,
        width: dimensions.width,
        height: dimensions.height,
        fileName: currentEntry.name.split('/').pop() ?? 'archive-image.jpg',
        fileSize: sizeInfo.exists && !sizeInfo.isDirectory ? sizeInfo.size ?? undefined : undefined,
        mimeType: guessImageMimeType(currentEntry.name),
        type: 'image',
      };
      await importImagesToIp({ space: 'normal', ipId, pickedAssets: [pickedAsset] });
      showToast('已保存到 IP');
      setIpPickerVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`保存到 IP 失败：${message}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function createIpAndSave() {
    const preparedName = newIpName.trim();
    if (!preparedName || isBusy) {
      return;
    }
    setIsBusy(true);
    try {
      const createdIp = await runWithDatabaseSpace('normal', (db) => ipRepository.create(db, { name: preparedName }));
      setNewIpDialogVisible(false);
      setNewIpName('');
      setIsBusy(false);
      await saveCurrentToIp(createdIp.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`新建 IP 失败：${message}`);
      setIsBusy(false);
    }
  }

  function move(delta: number) {
    setIndex((current) => Math.min(entries.length - 1, Math.max(0, current + delta)));
  }

  return (
    <View style={styles.shell}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing[2] }]}>
        <Pressable onPress={onBack} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons color={colors.text.inverse} name="chevron-back" size={26} />
        </Pressable>
        <Text numberOfLines={1} style={styles.title}>{archiveName}</Text>
        <Pressable onPress={() => setMoreVisible(true)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons color={colors.text.inverse} name="ellipsis-vertical" size={22} />
        </Pressable>
      </View>

      <Pressable delayLongPress={260} onLongPress={() => setMoreVisible(true)} style={styles.imageStage}>
        {currentImageUri ? (
          <Image resizeMode="contain" source={{ uri: currentImageUri }} style={styles.image} />
        ) : (
          <Text style={styles.loadingText}>正在读取图片...</Text>
        )}
      </Pressable>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing[3] }]}>
        <Pressable disabled={index <= 0} onPress={() => move(-1)} style={({ pressed }) => [styles.navButton, index <= 0 ? styles.disabled : null, pressed && styles.pressed]}>
          <Ionicons color={colors.text.inverse} name="chevron-back" size={20} />
        </Pressable>
        <Text style={styles.counter}>{entries.length > 0 ? `${index + 1} / ${entries.length}` : '0 / 0'}</Text>
        <Pressable disabled={index >= entries.length - 1} onPress={() => move(1)} style={({ pressed }) => [styles.navButton, index >= entries.length - 1 ? styles.disabled : null, pressed && styles.pressed]}>
          <Ionicons color={colors.text.inverse} name="chevron-forward" size={20} />
        </Pressable>
      </View>

      <AppActionSheet items={moreItems} onClose={() => setMoreVisible(false)} title="图片操作" visible={moreVisible} />
      <AppActionSheet
        items={[
          { key: 'new', label: '新建 IP 并保存', icon: 'add-circle-outline', onPress: () => setNewIpDialogVisible(true) },
          ...normalIps.map((ip) => ({
            key: String(ip.id),
            label: ip.name,
            icon: 'albums-outline' as const,
            meta: `${ip.imageCount} 个素材`,
            onPress: () => void saveCurrentToIp(ip.id),
          })),
        ]}
        message="只显示普通空间 IP。保存完成后会回到临时阅读。"
        onClose={() => setIpPickerVisible(false)}
        title="保存到 IP"
        visible={ipPickerVisible}
      />
      <AppDialog
        onClose={() => setNewIpDialogVisible(false)}
        onPrimary={() => void createIpAndSave()}
        primaryDisabled={!newIpName.trim() || isBusy}
        primaryLabel={isBusy ? '保存中' : '新建并保存'}
        title="新建 IP"
        visible={newIpDialogVisible}
      >
        <TextInput
          editable={!isBusy}
          onChangeText={setNewIpName}
          placeholder="IP 名称"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.dialogInput}
          value={newIpName}
        />
      </AppDialog>
    </View>
  );
}

function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 })
    );
  });
}

function guessImageMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#050607',
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    left: 0,
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[2],
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  iconButton: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  title: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
    flex: 1,
  },
  imageStage: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  loadingText: {
    ...typography.textStyles.body,
    color: colors.text.inverse,
  },
  bottomBar: {
    alignItems: 'center',
    bottom: 0,
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'center',
    left: 0,
    paddingTop: spacing[2],
    position: 'absolute',
    right: 0,
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  counter: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: '800',
  },
  dialogInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
  disabled: {
    opacity: 0.38,
  },
  pressed: {
    opacity: 0.78,
  },
});
