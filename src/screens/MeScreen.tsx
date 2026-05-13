import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '../components/ContentCard';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { imageRepository, ipRepository, runWithDatabaseSpace, settingsRepository, type PixorySpace } from '../database';
import { colors, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import { copyProfileAvatarToAppStorage } from '../services/fileStorageService';
import { formatFileSize } from '../utils/formatters';

interface MeScreenProps {
  refreshToken: number;
  space?: PixorySpace;
  personalSessionState: PersonalSessionState;
  footer?: ReactNode;
  onOpenFavorites: () => void;
  onOpenRecentViewed: () => void;
  onOpenTrash: () => void;
  onOpenBackup: () => void;
  onOpenStorageUsage: () => void;
  onOpenDuplicateReview: () => void;
  onRequestPersonalUnlock: () => void;
  onLockPersonalSpace: () => void;
}

type PersonalSessionState = 'locked' | 'unlocking' | 'unlocked' | 'locking';

interface MeStats {
  ipCount: number;
  activeAssetCount: number;
  recentViewedCount: number;
  favoriteImageCount: number;
  deletedImageCount: number;
  profileAvatarUri: string | null;
  imageOriginalBytes: number;
  videoOriginalBytes: number;
}

const ENTRY_ITEMS = [
  {
    key: 'favorites',
    label: '收藏图片',
    icon: 'star-outline',
  },
  {
    key: 'recent',
    label: '最近查看',
    icon: 'time-outline',
  },
  {
    key: 'trash',
    label: '回收站',
    icon: 'trash-outline',
  },
  {
    key: 'backup',
    label: '备份导出',
    icon: 'archive-outline',
  },
  {
    key: 'duplicate-review',
    label: '重复检测',
    icon: 'copy-outline',
  },
  {
    key: 'storage-usage',
    label: '存储占用',
    icon: 'pie-chart-outline',
  },
  {
    key: 'settings',
    label: '设置',
    icon: 'settings-outline',
  },
] as const;

export function MeScreen({
  refreshToken,
  space = 'normal',
  personalSessionState,
  footer,
  onOpenFavorites,
  onOpenRecentViewed,
  onOpenTrash,
  onOpenBackup,
  onOpenStorageUsage,
  onOpenDuplicateReview,
  onRequestPersonalUnlock,
  onLockPersonalSpace,
}: MeScreenProps) {
  const { showToast } = useToast();
  const [avatarOverrideUri, setAvatarOverrideUri] = useState<string | null>(null);
  const isPersonalMode = space === 'personal';
  const isPersonalSwitchBusy = personalSessionState === 'unlocking' || personalSessionState === 'locking';
  const lockTransition = useRef(new Animated.Value(isPersonalMode ? 1 : 0)).current;
  const lockPulse = useRef(new Animated.Value(1)).current;
  const { data, isLoading, errorMessage, reload } = useScreenLoad<MeStats>(
    async () => {
      const [
        ipCount,
        activeAssetCount,
        recentViewedCount,
        favoriteImageCount,
        deletedImageCount,
        imageOriginalBytes,
        videoOriginalBytes,
        profileAvatarUri,
      ] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.count(db),
        imageRepository.count(db, { mediaType: 'all' }),
        imageRepository.countRecentViewed(db),
        imageRepository.countFavorites(db),
        imageRepository.countDeleted(db),
        imageRepository.sumFileSize(db, { includeDeleted: true, mediaType: 'image' }),
        imageRepository.sumFileSize(db, { includeDeleted: true, mediaType: 'video' }),
        settingsRepository.getProfileAvatarUri(db),
      ]));

      return {
        ipCount,
        activeAssetCount,
        recentViewedCount,
        favoriteImageCount,
        deletedImageCount,
        profileAvatarUri,
        imageOriginalBytes,
        videoOriginalBytes,
      };
    },
    [refreshToken, space],
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
      return;
    }

    if (key === 'duplicate-review') {
      onOpenDuplicateReview();
      return;
    }

    if (key === 'storage-usage') {
      onOpenStorageUsage();
    }
  }

  function handlePersonalToggle() {
    if (isPersonalSwitchBusy) {
      return;
    }

    if (space === 'personal') {
      onLockPersonalSpace();
      return;
    }

    onRequestPersonalUnlock();
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
      await runWithDatabaseSpace(space, (db) => settingsRepository.setProfileAvatarUri(db, avatarUri));
      setAvatarOverrideUri(avatarUri);
      reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`更换头像失败：${message}`);
    }
  }

  const imageBytes = data?.imageOriginalBytes ?? 0;
  const videoBytes = data?.videoOriginalBytes ?? 0;
  const avatarUri = avatarOverrideUri ?? data?.profileAvatarUri ?? null;
  const lockOpenOpacity = lockTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const lockClosedOpacity = lockTransition;
  const lockRotate = lockTransition.interpolate({
    inputRange: [0, 1],
    outputRange: ['-12deg', '0deg'],
  });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(lockTransition, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
        toValue: isPersonalMode ? 1 : 0,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(lockPulse, {
          duration: 90,
          easing: Easing.out(Easing.cubic),
          toValue: 0.9,
          useNativeDriver: true,
        }),
        Animated.spring(lockPulse, {
          friction: 5,
          tension: 140,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [isPersonalMode, lockPulse, lockTransition]);

  return (
    <ScreenScaffold backgroundVariant="profile" decorativeTitle={space === 'personal' ? 'Private' : 'Me'} errorMessage={errorMessage} footer={footer} scrollable title="我的">
      <ContentCard style={styles.heroCard}>
        <Pressable
          accessibilityLabel={space === 'personal' ? '返回普通模式' : '进入隐私模式'}
          accessibilityRole="button"
          accessibilityState={{ busy: isPersonalSwitchBusy, selected: isPersonalMode }}
          disabled={isPersonalSwitchBusy}
          hitSlop={12}
          onPress={handlePersonalToggle}
          style={({ pressed }) => [
            styles.personalLockButton,
            isPersonalMode && styles.personalLockButtonActive,
            isPersonalSwitchBusy && styles.personalLockButtonBusy,
            pressed && !isPersonalSwitchBusy && styles.pressed,
          ]}
        >
          <Animated.View style={[styles.personalLockIconStage, { transform: [{ scale: lockPulse }, { rotate: lockRotate }] }]}>
            <Animated.View style={[styles.personalLockIconLayer, { opacity: lockOpenOpacity }]}>
              <Ionicons color={colors.primary.active} name="lock-open-outline" size={19} />
            </Animated.View>
            <Animated.View style={[styles.personalLockIconLayer, { opacity: lockClosedOpacity }]}>
              <Ionicons color={colors.text.inverse} name="lock-closed-outline" size={19} />
            </Animated.View>
          </Animated.View>
        </Pressable>
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
            </View>
          </View>
        </View>
        <View style={styles.storageBlock}>
          <View style={styles.storageHeader}>
            <View style={styles.storageInlineRow}>
              <Text numberOfLines={1} style={styles.storageLabel}>图片原图</Text>
              <Text numberOfLines={1} style={styles.storageValue}>{formatFileSize(imageBytes)}</Text>
            </View>
            <View style={styles.storageInlineRow}>
              <Text numberOfLines={1} style={styles.storageLabel}>视频存储</Text>
              <Text numberOfLines={1} style={styles.storageValue}>{formatFileSize(videoBytes)}</Text>
            </View>
          </View>
          <View style={styles.libraryStatsRow}>
            <StatBlock label="IP数量" value={String(data?.ipCount ?? 0)} />
            <StatBlock label="素材总数" value={String(data?.activeAssetCount ?? 0)} />
            <StatBlock label="收藏数" value={String(data?.favoriteImageCount ?? 0)} />
            <StatBlock label="回收站" value={String(data?.deletedImageCount ?? 0)} />
          </View>
        </View>
      </ContentCard>

      <View style={styles.entryList}>
        {ENTRY_ITEMS.map((item) => {
          const isSettings = item.key === 'settings';
          const entryTitle = item.label;
          const entryAccessibilityLabel = isSettings ? '设置，未开放' : entryTitle;
          const entryContent = (
            <>
              <View style={[styles.entryIconWrap, item.key === 'trash' && styles.trashIconWrap]}>
                {item.key === 'storage-usage' ? (
                  <StorageUsageGlyph />
                ) : (
                  <Ionicons
                    color={item.key === 'trash' ? colors.semantic.danger : colors.primary.active}
                    name={item.icon}
                    size={21}
                  />
                )}
              </View>
              <View style={styles.entryCopy}>
                <Text style={styles.entryTitle}>{entryTitle}</Text>
              </View>
              {isSettings ? (
                <Text style={styles.unavailableBadge}>未开放</Text>
              ) : (
                <Text style={styles.entryCount}>
                  {item.key === 'favorites'
                    ? data?.favoriteImageCount ?? 0
                    : item.key === 'recent'
                      ? data?.recentViewedCount ?? 0
                      : item.key === 'trash'
                        ? data?.deletedImageCount ?? 0
                        : item.key === 'duplicate-review'
                          ? '扫描'
                        : item.key === 'storage-usage'
                          ? '查看'
                          : data?.ipCount ?? 0}
                </Text>
              )}
              {isSettings ? null : <Ionicons color={colors.text.secondary} name="chevron-forward" size={18} />}
            </>
          );

          return isSettings ? (
            <View accessibilityLabel={entryAccessibilityLabel} accessible key={item.key} style={[styles.entryCard, styles.disabledEntry]}>
              {entryContent}
            </View>
          ) : (
            <Pressable
              accessibilityLabel={entryAccessibilityLabel}
              accessibilityRole="button"
              key={item.key}
              onPress={() => handleEntryPress(item.key)}
              style={({ pressed }) => [styles.entryCard, pressed && styles.pressed]}
            >
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

function StorageUsageGlyph() {
  return (
    <View style={styles.storageGlyph}>
      <View style={styles.storageGlyphTop}>
        <View style={[styles.storageGlyphSlice, styles.storageGlyphSlicePrimary]} />
        <View style={[styles.storageGlyphSlice, styles.storageGlyphSliceGold]} />
        <View style={[styles.storageGlyphSlice, styles.storageGlyphSliceSoft]} />
      </View>
      <View style={styles.storageGlyphFace}>
        <View style={[styles.storageGlyphBar, styles.storageGlyphBarTall]} />
        <View style={[styles.storageGlyphBar, styles.storageGlyphBarMid]} />
        <View style={[styles.storageGlyphBar, styles.storageGlyphBarShort]} />
      </View>
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
    marginBottom: rhythm.heroToListGap,
  },
  profileRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[4],
    paddingRight: 50,
    zIndex: 1,
  },
  personalLockButton: {
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing[4],
    top: spacing[4],
    width: 42,
    zIndex: 2,
  },
  personalLockButtonActive: {
    backgroundColor: colors.primary.active,
    borderColor: colors.primary.dark,
  },
  personalLockButtonBusy: {
    opacity: 0.7,
  },
  personalLockIconStage: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  personalLockIconLayer: {
    position: 'absolute',
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
  heroTitle: {
    ...typography.textStyles.pageTitle,
    fontSize: 20,
    lineHeight: 28,
  },
  libraryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing[2],
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
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: spacing[2],
  },
  storageLabel: {
    ...typography.textStyles.caption,
    color: colors.primary.active,
    fontWeight: '700',
  },
  storageInlineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'flex-start',
    minHeight: 28,
  },
  storageValue: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: '700',
  },
  entryList: {
    gap: rhythm.entryCardGap,
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
    ...shadows.xs,
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
  storageGlyph: {
    alignItems: 'center',
    height: 27,
    justifyContent: 'center',
    transform: [{ rotateZ: '-6deg' }],
    width: 28,
  },
  storageGlyphTop: {
    alignItems: 'flex-end',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 2,
    height: 13,
    justifyContent: 'center',
    paddingBottom: 2,
    paddingHorizontal: 3,
    position: 'absolute',
    top: 1,
    transform: [{ skewX: '-12deg' }],
    width: 23,
  },
  storageGlyphFace: {
    alignItems: 'flex-end',
    backgroundColor: colors.primary.default,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 7,
    borderColor: colors.primary.dark,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 2,
    height: 17,
    justifyContent: 'center',
    paddingBottom: 3,
    paddingHorizontal: 4,
    position: 'absolute',
    top: 8,
    width: 25,
  },
  storageGlyphSlice: {
    borderRadius: 2,
    width: 4,
  },
  storageGlyphSlicePrimary: {
    backgroundColor: colors.primary.default,
    height: 8,
  },
  storageGlyphSliceGold: {
    backgroundColor: colors.semantic.warning,
    height: 6,
  },
  storageGlyphSliceSoft: {
    backgroundColor: colors.support.sky300,
    height: 9,
  },
  storageGlyphBar: {
    borderRadius: 2,
    width: 4,
  },
  storageGlyphBarTall: {
    backgroundColor: colors.background.surface,
    height: 10,
  },
  storageGlyphBarMid: {
    backgroundColor: colors.semantic.warningBackground,
    height: 7,
  },
  storageGlyphBarShort: {
    backgroundColor: colors.support.sky100,
    height: 5,
  },
  entryCopy: {
    flex: 1,
    gap: spacing[1],
  },
  entryTitle: {
    ...typography.textStyles.bodyStrong,
  },
  entryCount: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    minWidth: 32,
    textAlign: 'right',
  },
  unavailableBadge: {
    ...typography.textStyles.micro,
    backgroundColor: colors.background.tag,
    borderRadius: radius.pill,
    color: colors.text.secondary,
    overflow: 'hidden',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
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
