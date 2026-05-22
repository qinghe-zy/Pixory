import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppDialog } from '../components/AppDialog';
import { EmptyState } from '../components/EmptyState';
import { OptionSelectRow } from '../components/OptionSelectRow';
import { PrimaryButton } from '../components/PrimaryButton';
import { SecureImage } from '../components/SecureImage';
import { useToast } from '../components/AppToast';
import { ipRepository, runWithDatabaseSpace, type IpRecord } from '../database';
import { colors, layout, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { finishNativeShareActivity, type NativeShareItem } from '../native/pixoryMediaModule';
import { importSingleImage, type PickedImageAsset } from '../services/imageImportService';
import { importVideosToIp, type PickedVideoAsset } from '../services/videoImportService';

const shareSheetPatternImage = require('../../docs/black.png');

interface ShareCollectScreenProps {
  items: NativeShareItem[];
  onClose: () => void;
  onSaved: () => void;
}

type ShareMediaKind = 'image' | 'video' | 'file';

interface ShareCollectItem extends NativeShareItem {
  kind: ShareMediaKind;
}

function inferKind(item: NativeShareItem): ShareMediaKind {
  const mimeType = item.mimeType?.toLowerCase() ?? '';
  const name = item.name?.toLowerCase() ?? item.uri.toLowerCase();
  if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp|heic|heif)(\?|$)/.test(name)) {
    return 'image';
  }
  if (mimeType.startsWith('video/') || /\.(mp4|mkv|mov|webm|m4v|avi)(\?|$)/.test(name)) {
    return 'video';
  }
  return 'file';
}

function buildImagePickedAsset(item: ShareCollectItem): PickedImageAsset {
  const pickedAsset = {
    uri: item.uri,
    fileName: item.name ?? 'shared-image.jpg',
    fileSize: item.size ?? 0,
    width: 0,
    height: 0,
    mimeType: item.mimeType ?? 'image/jpeg',
    type: 'image',
  } as PickedImageAsset;
  return pickedAsset;
}

function buildVideoPickedAsset(item: ShareCollectItem): PickedVideoAsset {
  return {
    uri: item.uri,
    fileName: item.name ?? 'shared-video.mp4',
    mimeType: item.mimeType ?? 'video/mp4',
    fileSize: item.size ?? null,
  };
}

export function ShareCollectScreen({ items, onClose, onSaved }: ShareCollectScreenProps) {
  const { showToast } = useToast();
  const shareItems = useMemo<ShareCollectItem[]>(() => items.map((item) => ({ ...item, kind: inferKind(item) })), [items]);
  const [ips, setIps] = useState<IpRecord[]>([]);
  const [selectedIpId, setSelectedIpId] = useState<number | null>(null);
  const [newIpDialogVisible, setNewIpDialogVisible] = useState(false);
  const [newIpName, setNewIpName] = useState('');
  const [previewModalItem, setPreviewModalItem] = useState<ShareCollectItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState('准备保存分享素材');
  const unsupportedCount = shareItems.filter((item) => item.kind === 'file').length;

  useEffect(() => {
    let mounted = true;
    void runWithDatabaseSpace('normal', async (db) => ipRepository.findAll(db))
      .then((nextIps) => {
        if (!mounted) {
          return;
        }
        setIps(nextIps);
        setSelectedIpId((current) => current ?? nextIps[0]?.id ?? null);
      })
      .catch((error) => {
        showToast(error instanceof Error ? `读取 IP 失败：${error.message}` : '读取 IP 失败');
      });

    return () => {
      mounted = false;
    };
  }, [showToast]);

  async function finishShareEntry() {
    try {
      await finishNativeShareActivity();
    } catch {
      onClose();
    }
  }

  async function saveToIp(targetIpId: number | null) {
    if (targetIpId == null) {
      showToast('请先创建一个普通模式 IP');
      return;
    }

    const importableItems = shareItems.filter((item) => item.kind !== 'file');
    if (importableItems.length === 0) {
      showToast('Pixory 暂不支持保存这些文件');
      return;
    }

    setIsSaving(true);
    let successCount = 0;
    let failedCount = unsupportedCount;

    for (const [index, item] of importableItems.entries()) {
      setStatusText(`正在保存 ${index + 1}/${importableItems.length}：${item.name ?? '分享素材'}`);
      try {
        if (item.kind === 'image') {
          await importSingleImage({
            space: 'normal',
            ipId: targetIpId,
            groupIds: [],
            tagNames: [],
            pickedAsset: buildImagePickedAsset({
              ...item,
              sourceUri: item.uri,
            } as ShareCollectItem & { sourceUri: string }),
          });
        } else {
          await importVideosToIp({
            space: 'normal',
            ipId: targetIpId,
            groupIds: [],
            tagNames: [],
            pickedAssets: [buildVideoPickedAsset(item)],
            title: '分享视频保存',
          });
        }
        successCount += 1;
      } catch (error) {
        failedCount += 1;
        console.warn('Pixory share collect item failed.', {
          uri: item.uri,
          message: error instanceof Error ? error.message : 'unknown share import error',
        });
      }
    }

    setStatusText(`已保存 ${successCount} 个，失败 ${failedCount} 个`);
    setIsSaving(false);
    if (successCount > 0) {
      showToast(failedCount > 0 ? `已保存 ${successCount} 个，${failedCount} 个失败` : `已保存 ${successCount} 个`);
      onSaved();
      await finishShareEntry();
      return;
    }
    showToast('保存失败，请回到 Pixory 后重试');
  }

  async function handleSave() {
    await saveToIp(selectedIpId);
  }

  async function createIpAndSave() {
    const name = newIpName.trim();
    if (!name) {
      showToast('请输入新 IP 名称');
      return;
    }

    try {
      setIsSaving(true);
      const ip = await runWithDatabaseSpace('normal', (db) => ipRepository.create(db, { name }));
      setIps((current) => [ip, ...current]);
      setSelectedIpId(ip.id);
      setNewIpName('');
      setNewIpDialogVisible(false);
      setIsSaving(false);
      await saveToIp(ip.id);
    } catch (error) {
      setIsSaving(false);
      showToast(error instanceof Error ? `创建 IP 失败：${error.message}` : '创建 IP 失败');
    }
  }

  return (
    <View style={styles.overlay}>
      <Pressable disabled={isSaving} onPress={finishShareEntry} style={styles.backdrop} />
      <View style={styles.sheet}>
        <Image resizeMode="stretch" source={shareSheetPatternImage} style={styles.sheetPatternImage} />
        <View style={styles.handle} />
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>保存到 Pixory</Text>
            <Text style={styles.meta}>
              {shareItems.length} 个素材{unsupportedCount > 0 ? `，${unsupportedCount} 个暂不支持` : ''}
            </Text>
          </View>
          <Pressable disabled={isSaving} hitSlop={8} onPress={finishShareEntry} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Ionicons color={colors.text.secondary} name="close" size={20} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRow}>
          {shareItems.slice(0, 6).map((item, index) => (
            <Pressable key={`${item.uri}-${index}`} onPress={() => setPreviewModalItem(item)} style={({ pressed }) => [styles.previewTile, pressed && styles.pressed]}>
              {item.kind === 'image' ? (
                <SecureImage contentFit="cover" space="normal" style={styles.previewImage} uri={item.uri} />
              ) : (
                <View style={styles.filePreview}>
                  <Ionicons color={item.kind === 'video' ? colors.primary.default : colors.text.secondary} name={item.kind === 'video' ? 'play-circle-outline' : 'document-outline'} size={22} />
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>

        {ips.length === 0 ? (
          <EmptyState
            actionLabel="关闭"
            description="分享保存需要一个普通模式 IP 作为归属。"
            iconName="albums-outline"
            onAction={finishShareEntry}
            title="还没有可保存的 IP"
          />
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>目标 IP</Text>
              <Pressable disabled={isSaving} onPress={() => setNewIpDialogVisible(true)} style={({ pressed }) => [styles.createIpButton, pressed && styles.pressed]}>
                <Ionicons color={colors.primary.active} name="add-circle-outline" size={16} />
                <Text style={styles.createIpText}>新建 IP 并保存</Text>
              </Pressable>
              <View style={styles.optionList}>
                {ips.slice(0, 6).map((ip) => (
                  <OptionSelectRow key={ip.id} label={ip.name} meta="普通模式" onPress={() => setSelectedIpId(ip.id)} selected={selectedIpId === ip.id} />
                ))}
              </View>
            </View>
            <Text style={styles.status}>{statusText}</Text>
            <PrimaryButton label={isSaving ? '保存中' : '保存'} loading={isSaving} onPress={handleSave} />
          </>
        )}
      </View>
      {previewModalItem ? (
        <Pressable onPress={() => setPreviewModalItem(null)} style={styles.previewModalBackdrop}>
          <View style={styles.previewModalCard}>
            <Image resizeMode="stretch" source={shareSheetPatternImage} style={styles.previewModalPatternImage} />
            {previewModalItem.kind === 'image' ? (
              <SecureImage contentFit="contain" space="normal" style={styles.previewModalImage} uri={previewModalItem.uri} />
            ) : (
              <View style={styles.previewModalFile}>
                <Ionicons color={colors.primary.default} name={previewModalItem.kind === 'video' ? 'play-circle-outline' : 'document-outline'} size={42} />
                <Text numberOfLines={2} style={styles.previewModalName}>{previewModalItem.name ?? '分享素材'}</Text>
              </View>
            )}
          </View>
        </Pressable>
      ) : null}
      <AppDialog
        message="新建后会直接把这次分享素材保存到该 IP。"
        onClose={() => setNewIpDialogVisible(false)}
        onPrimary={createIpAndSave}
        primaryLabel="创建并保存"
        title="新建 IP"
        visible={newIpDialogVisible}
      >
        <TextInput
          autoFocus
          editable={!isSaving}
          onChangeText={setNewIpName}
          placeholder="例如：角色设定参考"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.input}
          value={newIpName}
        />
      </AppDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30, 34, 28, 0.18)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: colors.background.page,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: rhythm.entryCardGap,
    maxHeight: '86%',
    overflow: 'hidden',
    paddingBottom: spacing[6],
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[2],
    ...shadows.floating,
  },
  sheetPatternImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.24,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border.default,
    borderRadius: radius.pill,
    height: 4,
    width: 42,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.textStyles.navTitle,
    color: colors.text.title,
  },
  meta: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  previewRow: {
    paddingRight: spacing[2],
    flexDirection: 'row',
    gap: rhythm.compactGridGap,
  },
  previewTile: {
    backgroundColor: colors.background.empty,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: 54,
    overflow: 'hidden',
    width: 54,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  filePreview: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  section: {
    gap: rhythm.listCardGap,
  },
  sectionTitle: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  optionList: {
    gap: rhythm.listCardGap,
    maxHeight: 168,
  },
  createIpButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  createIpText: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '700',
  },
  input: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 46,
    paddingHorizontal: spacing[3],
  },
  status: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  previewModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(28, 31, 26, 0.74)',
    justifyContent: 'center',
    padding: spacing[5],
  },
  previewModalCard: {
    backgroundColor: colors.background.page,
    borderRadius: radius.lg,
    maxHeight: '80%',
    overflow: 'hidden',
    width: '100%',
  },
  previewModalPatternImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.24,
  },
  previewModalImage: {
    aspectRatio: 1,
    width: '100%',
  },
  previewModalFile: {
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 220,
    justifyContent: 'center',
    padding: spacing[5],
  },
  previewModalName: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
