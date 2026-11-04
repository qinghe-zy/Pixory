/**
 * 按需下载表情扩展中心抽屉/弹窗 (Sticker Market Modal)
 *
 * 遵循 .impeccable.md 与极简规范：
 * 1. 严格禁止在按钮与标题中加入任何装饰性 Emoji 符号；
 * 2. 状态明确：下载 / 下载中进度 / 已安装 / 删除；
 * 3. 布局精致、间距规整、支持一键全部下载与单独卸载。
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PixorySpace } from '../../database';
import {
  PRESET_STICKER_PACKS,
  StickerPackDownloadService,
  type StickerPackManifest,
  type PackDownloadProgress,
} from './stickerPackDownloadService';

export interface StickerMarketModalProps {
  visible: boolean;
  onClose: () => void;
  space?: PixorySpace;
  onPacksUpdated?: () => void;
}

export function StickerMarketModal({
  visible,
  onClose,
  space = 'normal',
  onPacksUpdated,
}: StickerMarketModalProps) {
  const [installedPackIds, setInstalledPackIds] = useState<string[]>([]);
  const [downloadingPackId, setDownloadingPackId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isBulkDownloading, setIsBulkDownloading] = useState<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadInstalledStatus = useCallback(async () => {
    try {
      const ids = await StickerPackDownloadService.getInstalledPackIds(space);
      if (isMountedRef.current) {
        setInstalledPackIds(ids);
      }
    } catch {}
  }, [space]);

  useEffect(() => {
    if (visible) {
      void loadInstalledStatus();
    }
  }, [visible, loadInstalledStatus]);

  const triggerHaptic = useCallback(() => {
    try {
      void Haptics.selectionAsync();
    } catch {}
  }, []);

  const handleDownloadPack = async (pack: StickerPackManifest) => {
    triggerHaptic();
    setDownloadingPackId(pack.id);
    setDownloadProgress(0);

    try {
      await StickerPackDownloadService.downloadPack(pack.id, space, (progress: PackDownloadProgress) => {
        if (isMountedRef.current) {
          setDownloadProgress(progress.percent);
        }
      });
      await loadInstalledStatus();
      onPacksUpdated?.();
      Alert.alert('下载完成', `「${pack.name}」已安装成功，已同步建立认知！`);
    } catch (err: any) {
      Alert.alert('下载失败', err?.message || '网络连接超时，请重试');
    } finally {
      if (isMountedRef.current) {
        setDownloadingPackId(null);
        setDownloadProgress(0);
      }
    }
  };

  const handleRemovePack = (pack: StickerPackManifest) => {
    triggerHaptic();
    Alert.alert('删除表情包', `确定要删除「${pack.name}」吗？将释放本地存储空间。`, [
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await StickerPackDownloadService.removePack(pack.id, space);
            await loadInstalledStatus();
            onPacksUpdated?.();
          } catch (err: any) {
            Alert.alert('删除失败', err?.message || '操作异常');
          }
        },
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const handleDownloadAll = async () => {
    triggerHaptic();
    const uninstalledPacks = PRESET_STICKER_PACKS.filter((p) => !installedPackIds.includes(p.id));
    if (uninstalledPacks.length === 0) {
      Alert.alert('提示', '所有预置扩展包均已安装');
      return;
    }

    setIsBulkDownloading(true);
    try {
      for (const pack of uninstalledPacks) {
        if (!isMountedRef.current) break;
        setDownloadingPackId(pack.id);
        setDownloadProgress(0);
        await StickerPackDownloadService.downloadPack(pack.id, space, (p: PackDownloadProgress) => {
          if (isMountedRef.current) {
            setDownloadProgress(p.percent);
          }
        });
      }
      await loadInstalledStatus();
      onPacksUpdated?.();
      Alert.alert('全部安装完成', '所有扩展微动表情包已全部安装完毕！');
    } catch (err: any) {
      Alert.alert('下载中断', err?.message || '部分表情包下载异常，请重试');
    } finally {
      if (isMountedRef.current) {
        setIsBulkDownloading(false);
        setDownloadingPackId(null);
        setDownloadProgress(0);
      }
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable onPress={onClose} style={styles.backdropTouch} />
        <View style={styles.container}>
          {/* 顶栏控制 */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>获取更多表情</Text>
              <Text style={styles.subtitle}>按需下载高精度微动效表情包，随时可删除释放空间</Text>
            </View>
            <Pressable
              accessibilityLabel="关闭"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            >
              <Ionicons color="#374151" name="close" size={22} />
            </Pressable>
          </View>

          {/* 一键全部下载快捷栏 */}
          <View style={styles.bulkRow}>
            <Text style={styles.bulkText}>
              已安装 {installedPackIds.length} / {PRESET_STICKER_PACKS.length} 个扩展包
            </Text>
            {installedPackIds.length < PRESET_STICKER_PACKS.length && (
              <Pressable
                accessibilityLabel="全部下载"
                accessibilityRole="button"
                disabled={Boolean(downloadingPackId) || isBulkDownloading}
                onPress={() => void handleDownloadAll()}
                style={({ pressed }) => [styles.bulkBtn, pressed && styles.btnPressed]}
              >
                {isBulkDownloading ? (
                  <ActivityIndicator color="#111827" size="small" />
                ) : (
                  <Text style={styles.bulkBtnText}>全部下载</Text>
                )}
              </Pressable>
            )}
          </View>

          {/* 表情包卡片列表 */}
          <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {PRESET_STICKER_PACKS.map((pack) => {
              const isInstalled = installedPackIds.includes(pack.id);
              const isDownloading = downloadingPackId === pack.id;

              return (
                <View key={pack.id} style={styles.packCard}>
                  <View style={styles.packLeft}>
                    <View style={styles.packTitleRow}>
                      <Text style={styles.packName}>{pack.name}</Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{pack.itemCount} 款</Text>
                      </View>
                      <View style={styles.badgeSecondary}>
                        <Text style={styles.badgeSecondaryText}>{pack.estimatedSize}</Text>
                      </View>
                    </View>
                    <Text numberOfLines={2} style={styles.packDesc}>
                      {pack.description}
                    </Text>
                  </View>

                  {/* 右侧动作按钮区 */}
                  <View style={styles.packRight}>
                    {isDownloading ? (
                      <View style={styles.progressBtn}>
                        <ActivityIndicator color="#111827" size="small" style={{ marginRight: 6 }} />
                        <Text style={styles.progressText}>{downloadProgress}%</Text>
                      </View>
                    ) : isInstalled ? (
                      <View style={styles.installedRow}>
                        <View style={styles.installedBadge}>
                          <Text style={styles.installedText}>已安装</Text>
                        </View>
                        <Pressable
                          accessibilityLabel={`删除${pack.name}`}
                          accessibilityRole="button"
                          hitSlop={8}
                          onPress={() => handleRemovePack(pack)}
                          style={({ pressed }) => [styles.deleteBtn, pressed && styles.btnPressed]}
                        >
                          <Ionicons color="#9CA3AF" name="trash-outline" size={17} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityLabel={`下载${pack.name}`}
                        accessibilityRole="button"
                        disabled={Boolean(downloadingPackId) || isBulkDownloading}
                        onPress={() => void handleDownloadPack(pack)}
                        style={({ pressed }) => [styles.downloadBtn, pressed && styles.btnPressed]}
                      >
                        <Text style={styles.downloadBtnText}>下载</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  container: {
    maxHeight: '82%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 16,
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderRadius: 8,
  },
  btnPressed: {
    opacity: 0.65,
  },
  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  bulkText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  bulkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D5DB',
  },
  bulkBtnText: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },
  listContent: {
    paddingTop: 12,
    gap: 12,
  },
  packCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  packLeft: {
    flex: 1,
    marginRight: 12,
  },
  packTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  packName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  badgeText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '500',
  },
  badgeSecondary: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
  },
  badgeSecondaryText: {
    fontSize: 11,
    color: '#6B7280',
  },
  packDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  packRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 70,
  },
  downloadBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  downloadBtnText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  progressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  progressText: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },
  installedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  installedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  installedText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  deleteBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderRadius: 6,
  },
});
