import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { imageRepository, ipRepository, settingsRepository } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import { copyProfileAvatarToAppStorage } from '../services/fileStorageService';
import { formatFileSize } from '../utils/formatters';

interface MeScreenProps {
  refreshToken: number;
  footer?: ReactNode;
  onOpenFavorites: () => void;
  onOpenRecentViewed: () => void;
  onOpenTrash: () => void;
  onOpenBackup: () => void;
}

interface MeStats {
  ipCount: number;
  activeImageCount: number;
  favoriteImageCount: number;
  deletedImageCount: number;
  profileAvatarUri: string | null;
  totalOriginalBytes: number;
}

const ENTRY_ITEMS = [
  {
    key: 'favorites',
    label: '收藏图片',
    description: '查看当前所有已收藏图片',
    icon: 'star-outline',
  },
  {
    key: 'recent',
    label: '最近查看',
    description: '查看最近打开过的图片',
    icon: 'time-outline',
  },
  {
    key: 'trash',
    label: '回收站',
    description: '恢复已软删除图片，或清空后物理删除',
    icon: 'trash-outline',
  },
  {
    key: 'backup',
    label: '备份导出',
    description: '完整备份 SQLite、原图、缩略图和 manifest',
    icon: 'archive-outline',
  },
  {
    key: 'settings',
    label: '设置',
    description: '本地偏好与应用信息',
    icon: 'settings-outline',
  },
] as const;

export function MeScreen({
  refreshToken,
  footer,
  onOpenFavorites,
  onOpenRecentViewed,
  onOpenTrash,
  onOpenBackup,
}: MeScreenProps) {
  const { showToast } = useToast();
  const [avatarOverrideUri, setAvatarOverrideUri] = useState<string | null>(null);
  const { data, isLoading, errorMessage, reload } = useScreenLoad<MeStats>(
    async () => {
      const [
        ipCount,
        activeImageCount,
        favoriteImageCount,
        deletedImageCount,
        totalOriginalBytes,
        profileAvatarUri,
      ] = await Promise.all([
        ipRepository.count(),
        imageRepository.count(),
        imageRepository.countFavorites(),
        imageRepository.countDeleted(),
        imageRepository.sumFileSize({ includeDeleted: true }),
        settingsRepository.getProfileAvatarUri(),
      ]);

      return {
        ipCount,
        activeImageCount,
        favoriteImageCount,
        deletedImageCount,
        profileAvatarUri,
        totalOriginalBytes,
      };
    },
    [refreshToken],
    {
      formatError: (error) => {
        const message = error instanceof Error ? error.message : '未知错误';
        return `读取个人页数据失败：${message}`;
      },
    }
  );

  function handleEntryPress(key: (typeof ENTRY_ITEMS)[number]['key']) {
    if (key === 'favorites') {
      onOpenFavorites();
      return;
    }

    if (key === 'recent') {
      onOpenRecentViewed();
      return;
    }

    if (key === 'trash') {
      onOpenTrash();
      return;
    }

    if (key === 'backup') {
      onOpenBackup();
    }
  }

  async function handleAvatarPress() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast('Pixory 需要访问相册来选择本地头像');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ['images'],
        quality: 1,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const sourceUri = result.assets[0]?.uri;
      if (!sourceUri) {
        throw new Error('没有读取到所选图片。');
      }

      const avatarUri = await copyProfileAvatarToAppStorage(sourceUri);
      await settingsRepository.setProfileAvatarUri(avatarUri);
      setAvatarOverrideUri(avatarUri);
      reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`更换头像失败：${message}`);
    }
  }

  const totalBytes = data?.totalOriginalBytes ?? 0;
  const avatarUri = avatarOverrideUri ?? data?.profileAvatarUri ?? null;
  const storageFillWidth = totalBytes > 0 ? '34%' : '8%';

  return (
    <ScreenScaffold decorativeTitle="Me" errorMessage={errorMessage} footer={footer} scrollable title="我的">
      <ContentCard style={styles.heroCard}>
        <View style={styles.profileRow}>
          <Pressable onPress={handleAvatarPress} style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}>
            <View style={styles.avatar}>
              {avatarUri ? (
                <Image resizeMode="cover" source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Ionicons color={colors.primary.active} name="person" size={34} />
              )}
            </View>
            <View style={styles.avatarEditBadge}>
              <Ionicons color={colors.primary.active} name="camera-outline" size={13} />
            </View>
          </Pressable>
          <View style={styles.profileCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.heroTitle}>本地空间</Text>
              <Text style={styles.badge}>Local</Text>
            </View>
            <Text style={styles.heroDescription}>愿你被世界温柔以待。</Text>
          </View>
        </View>
        <View style={styles.storageBlock}>
          <View style={styles.storageHeader}>
            <View>
              <Text style={styles.storageLabel}>本地原图存储</Text>
              <Text style={styles.storageValue}>{formatFileSize(totalBytes)}</Text>
            </View>
            <View style={styles.storageBadge}>
              <Text style={styles.storageBadgeText}>Offline</Text>
            </View>
          </View>
          <View style={styles.storageTrack}>
            <View style={[styles.storageFill, { width: storageFillWidth }]} />
          </View>
          <Text style={styles.storageHint}>仅统计已导入原图，缩略图占用未单独展开。</Text>
        </View>
      </ContentCard>

      <ContentCard style={styles.statsCard}>
        <StatBlock label="IP数量" value={String(data?.ipCount ?? 0)} />
        <StatBlock label="图片总数" value={String(data?.activeImageCount ?? 0)} />
        <StatBlock label="收藏数" value={String(data?.favoriteImageCount ?? 0)} />
        <StatBlock label="回收站" value={String(data?.deletedImageCount ?? 0)} />
      </ContentCard>

      <View style={styles.entryList}>
        {ENTRY_ITEMS.map((item) => {
          const isSettings = item.key === 'settings';
          const entryContent = (
            <>
              <View style={[styles.entryIconWrap, item.key === 'trash' && styles.trashIconWrap]}>
                <Ionicons
                  color={item.key === 'trash' ? colors.semantic.danger : colors.primary.active}
                  name={item.icon}
                  size={21}
                />
              </View>
              <View style={styles.entryCopy}>
                <Text style={styles.entryTitle}>{item.label}</Text>
                <Text style={styles.entryDescription}>{item.description}</Text>
              </View>
              {isSettings ? null : (
                <Text style={styles.entryCount}>
                  {item.key === 'favorites'
                    ? data?.favoriteImageCount ?? 0
                    : item.key === 'recent'
                      ? data?.activeImageCount ?? 0
                      : item.key === 'trash'
                        ? data?.deletedImageCount ?? 0
                        : data?.ipCount ?? 0}
                </Text>
              )}
              {isSettings ? null : <Ionicons color={colors.text.secondary} name="chevron-forward" size={18} />}
            </>
          );

          return isSettings ? (
            <View key={item.key} style={[styles.entryCard, styles.disabledEntry]}>
              {entryContent}
            </View>
          ) : (
            <Pressable key={item.key} onPress={() => handleEntryPress(item.key)} style={({ pressed }) => [styles.entryCard, pressed && styles.pressed]}>
              {entryContent}
            </Pressable>
          );
        })}
      </View>

      {isLoading ? <Text style={styles.loadingText}>正在刷新本地统计…</Text> : null}
      {errorMessage ? (
        <Text onPress={reload} style={styles.retryText}>
          重新加载
        </Text>
      ) : null}
    </ScreenScaffold>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text numberOfLines={1} style={styles.statValue}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.background.surface,
    gap: spacing[6],
    minHeight: 202,
    padding: spacing[4],
    overflow: 'hidden',
    marginBottom: spacing[1],
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[4],
    zIndex: 1,
  },
  avatarButton: {
    position: 'relative',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderColor: colors.background.surface,
    borderRadius: 34,
    borderWidth: 3,
    height: 68,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 68,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  avatarEditBadge: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: -1,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 24,
  },
  profileCopy: {
    flex: 1,
    gap: spacing[1],
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  badge: {
    ...typography.textStyles.micro,
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    color: colors.primary.active,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  heroTitle: {
    ...typography.textStyles.pageTitle,
    fontSize: 20,
    lineHeight: 28,
  },
  heroDescription: {
    ...typography.textStyles.body,
    color: colors.text.body,
  },
  statsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  statItem: {
    alignItems: 'center',
    gap: spacing[1],
    width: '25%',
  },
  statValue: {
    ...typography.textStyles.statNumber,
  },
  statLabel: {
    ...typography.textStyles.statLabel,
  },
  storageBlock: {
    gap: spacing[2],
  },
  storageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  storageLabel: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
  },
  storageValue: {
    ...typography.textStyles.statNumber,
  },
  storageBadge: {
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  storageBadgeText: {
    ...typography.textStyles.micro,
    color: colors.primary.active,
    fontWeight: '600',
  },
  storageTrack: {
    backgroundColor: colors.background.sunken,
    borderRadius: radius.pill,
    height: 8,
    overflow: 'hidden',
  },
  storageFill: {
    backgroundColor: colors.primary.default,
    borderRadius: radius.pill,
    height: '100%',
  },
  storageHint: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  entryList: {
    gap: spacing[3],
  },
  entryCard: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
  },
  entryIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderRadius: radius.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  trashIconWrap: {
    backgroundColor: colors.semantic.dangerBackground,
  },
  entryCopy: {
    flex: 1,
    gap: spacing[1],
  },
  entryTitle: {
    ...typography.textStyles.bodyStrong,
  },
  entryDescription: {
    ...typography.textStyles.caption,
    color: colors.text.body,
  },
  entryCount: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    minWidth: 32,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.82,
  },
  disabledEntry: {
    opacity: 0.78,
  },
  loadingText: {
    ...typography.textStyles.caption,
    textAlign: 'center',
  },
  retryText: {
    ...typography.textStyles.caption,
    color: colors.primary.default,
    textAlign: 'center',
  },
});
