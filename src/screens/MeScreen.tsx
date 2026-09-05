import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, { cancelAnimation, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay, Easing as REasing } from 'react-native-reanimated';

import { ContentCard } from '../components/ContentCard';
import { ScreenScaffold } from '../components/ScreenScaffold';
import { imageRepository, ipRepository, runWithDatabaseSpace, settingsRepository, type PixorySpace } from '../database';
import { colors, radius, rhythm, shadows, spacing, typography } from '../design/tokens';
import { useScreenLoad } from '../hooks/useScreenLoad';
import { useToast } from '../components/AppToast';
import { copyProfileAvatarToAppStorage } from '../services/fileStorageService';
import { formatFileSize } from '../utils/formatters';
import { ProfileRenameDialog } from '../components/ProfileRenameDialog';
import { OrbitalSpectralRing } from '../components/OrbitalSpectralRing';
import { MagneticLiquidContainer } from '../components/MagneticLiquidContainer';

interface MeScreenProps {
  refreshToken: number;
  isActive?: boolean;
  space?: PixorySpace;
  personalSessionState: PersonalSessionState;
  footer?: ReactNode;
  onOpenFavorites: () => void;
  onOpenRecentViewed: () => void;
  onOpenTrash: () => void;
  onOpenBackup: () => void;
  onOpenStorageUsage: () => void;
  onOpenDuplicateReview: () => void;
  onOpenAbout: () => void;
  onOpenDiagnostics: () => void;
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
  profileNickname: string | null;
  imageOriginalBytes: number;
  videoOriginalBytes: number;
}

// ENTRY_ITEMS removed for dashboard layout

function ProfileMemoryCore({ isActive }: { isActive: boolean }) {
  const rot1 = useSharedValue(0);
  const rot2 = useSharedValue(0);
  const rot3 = useSharedValue(0);
  const rot4 = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!isActive) {
      cancelAnimation(rot1);
      cancelAnimation(rot2);
      cancelAnimation(rot3);
      cancelAnimation(rot4);
      cancelAnimation(pulse);
      rot1.value = 0;
      rot2.value = 0;
      rot3.value = 0;
      rot4.value = 0;
      pulse.value = 1;
      return;
    }
    rot1.value = withRepeat(withTiming(360, { duration: 8000, easing: REasing.linear }), -1, false);
    rot2.value = withRepeat(withTiming(-360, { duration: 12000, easing: REasing.linear }), -1, false);
    rot3.value = withRepeat(withTiming(360, { duration: 18000, easing: REasing.linear }), -1, false);
    rot4.value = withRepeat(withTiming(-360, { duration: 30000, easing: REasing.linear }), -1, false);
    pulse.value = withRepeat(withTiming(0.7, { duration: 3000, easing: REasing.inOut(REasing.ease) }), -1, true);
    return () => {
      cancelAnimation(rot1);
      cancelAnimation(rot2);
      cancelAnimation(rot3);
      cancelAnimation(rot4);
      cancelAnimation(pulse);
    };
  }, [isActive, rot1, rot2, rot3, rot4, pulse]);

  const style1 = useAnimatedStyle(() => {
    const a = (rot1.value * Math.PI) / 180;
    const x = 11 * Math.cos(a);
    const y = 11 * Math.sin(a);
    return { transform: [{ translateX: x }, { translateY: y }] };
  });

  const style2 = useAnimatedStyle(() => {
    const a = (rot2.value * Math.PI) / 180;
    const x = 16 * Math.cos(a);
    const y = 16 * Math.sin(a) * 0.342; // cos(70)
    return { transform: [{ translateX: x }, { translateY: y }] };
  });

  const style3 = useAnimatedStyle(() => {
    const a = (rot3.value * Math.PI) / 180;
    const x = 21 * Math.cos(a);
    const y = 21 * Math.sin(a) * 0.422; // cos(65)
    return { transform: [{ translateX: x }, { translateY: y }] };
  });

  const style4 = useAnimatedStyle(() => {
    const a = (rot4.value * Math.PI) / 180;
    const x = 27 * Math.cos(a);
    const y = 27 * Math.sin(a) * 0.258; // cos(75)
    return { transform: [{ translateX: x }, { translateY: y }] };
  });

  const coreStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: pulse.value }));

  return (
    <View style={styles.coreContainer}>
      <Reanimated.View style={[styles.coreDot, coreStyle]} />
      
      {/* 静止的虚线轨道体系 - 还原原始正确的旋转顺序 (先 rotateZ 再 rotateX) */}
      <View style={styles.orbit1} />
      <View style={[styles.orbit2, { transform: [{ rotateX: '70deg' }] }]} />
      <View style={[styles.orbit3, { transform: [{ rotateZ: '60deg' }, { rotateX: '65deg' }] }]} />
      <View style={[styles.orbit4, { transform: [{ rotateZ: '-45deg' }, { rotateX: '75deg' }] }]} />

      {/* 运动的星球实体 (绝对居中，依靠 translateX/Y 实现运动) */}
      <Reanimated.View style={[styles.planet1, style1]} />
      
      <Reanimated.View style={[styles.planet2, style2]} />
      
      <View style={{ position: 'absolute', transform: [{ rotateZ: '60deg' }] }}>
        <Reanimated.View style={[styles.planet3, style3]} />
      </View>
      
      <View style={{ position: 'absolute', transform: [{ rotateZ: '-45deg' }] }}>
        <Reanimated.View style={[styles.planet4, style4]} />
      </View>
    </View>
  );
}

export function MeScreen({
  refreshToken,
  isActive = true,
  space = 'normal',
  personalSessionState,
  footer,
  onOpenFavorites,
  onOpenRecentViewed,
  onOpenTrash,
  onOpenBackup,
  onOpenStorageUsage,
  onOpenDuplicateReview,
  onOpenAbout,
  onOpenDiagnostics,
  onRequestPersonalUnlock,
  onLockPersonalSpace,
}: MeScreenProps) {
  const { showToast } = useToast();
  const [avatarOverrideUri, setAvatarOverrideUri] = useState<string | null>(null);
  const [isRenameDialogVisible, setIsRenameDialogVisible] = useState(false);
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
        profileNickname,
      ] = await runWithDatabaseSpace(space, (db) => Promise.all([
        ipRepository.count(db),
        imageRepository.count(db, { mediaType: 'all' }),
        imageRepository.countRecentViewed(db),
        imageRepository.countFavorites(db),
        imageRepository.countDeleted(db),
        imageRepository.sumFileSize(db, { includeDeleted: true, mediaType: 'image' }),
        imageRepository.sumFileSize(db, { includeDeleted: true, mediaType: 'video' }),
        settingsRepository.getProfileAvatarUri(db),
        settingsRepository.getProfileNickname(db),
      ]));

      return {
        ipCount,
        activeAssetCount,
        recentViewedCount,
        favoriteImageCount,
        deletedImageCount,
        profileAvatarUri,
        profileNickname,
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

  function handleEntryPress(key: 'favorites' | 'recent' | 'trash' | 'backup' | 'duplicate-review' | 'storage-usage' | 'about' | 'diagnostics') {
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
      return;
    }

    if (key === 'about') {
      onOpenAbout();
      return;
    }
    if (key === 'diagnostics') onOpenDiagnostics();
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
    <ScreenScaffold backgroundVariant="profile" errorMessage={errorMessage} footer={footer} scrollable showHeader={false}>
      <MagneticLiquidContainer damping={16} magneticStrength={0.15} stiffness={400} stretchFactor={0.001} maxScale={1.02} maxTranslation={10}>
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
              <Ionicons color={colors.border.strong} name="lock-open-outline" size={19} />
            </Animated.View>
            <Animated.View style={[styles.personalLockIconLayer, { opacity: lockClosedOpacity }]}>
              <Ionicons color={colors.text.primary} name="lock-closed-outline" size={19} />
            </Animated.View>
          </Animated.View>
        </Pressable>
        <View style={styles.profileRow}>
          <MagneticLiquidContainer damping={14} stiffness={350} maxTranslation={12} stretchFactor={0.02}>
            <Pressable onPress={handleAvatarPress} style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}>
              <View style={styles.avatar}>
                {avatarUri ? (
                  <Image resizeMode="cover" source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <Ionicons color={colors.primary.active} name="person" size={34} />
                )}
              </View>
              <OrbitalSpectralRing avatarSize={68} isActive={false} padding={2} />
              <View style={styles.avatarEditBadge}>
                <Ionicons color={colors.primary.active} name="camera-outline" size={13} />
              </View>
            </Pressable>
          </MagneticLiquidContainer>
          <View style={styles.profileCopy}>
            <View style={styles.nameRow}>
              <Pressable onPress={() => setIsRenameDialogVisible(true)} hitSlop={12} style={({ pressed }) => [styles.heroTitleContainer, pressed && styles.pressed]}>
                <MagneticLiquidContainer damping={14} stiffness={350} maxTranslation={8} stretchFactor={0.01}>
                  <Text style={styles.heroTitle}>{data?.profileNickname || '本地空间'}</Text>
                </MagneticLiquidContainer>
              </Pressable>
              <ProfileMemoryCore isActive={isActive} />
            </View>
          </View>
        </View>
        <View style={styles.libraryStatsRow}>
          <StatBlock label="素材总数" value={data?.activeAssetCount ?? 0} />
          <View style={styles.statDivider} />
          <StatBlock label="IP 数量" value={data?.ipCount ?? 0} />
        </View>
        <View style={styles.storageBlock}>
          <View style={styles.storageVisualContainer}>
            <View style={styles.storageHeader}>
              <Text style={styles.storageTotalLabel}>存储总计</Text>
              <Text style={styles.storageTotalValue}>{formatFileSize(imageBytes + videoBytes)}</Text>
            </View>
            <View style={styles.storageProgressBar}>
              <View style={[styles.storageProgressSegment, { backgroundColor: colors.semantic.success, width: `${(imageBytes / (imageBytes + videoBytes || 1)) * 100}%` }]} />
              <View style={[styles.storageProgressSegment, { backgroundColor: colors.primary.weak, width: `${(videoBytes / (imageBytes + videoBytes || 1)) * 100}%` }]} />
            </View>
            <View style={styles.storageLegendRow}>
              <View style={styles.storageInlineRow}>
                <View style={[styles.storageLegendDot, { backgroundColor: colors.semantic.success }]} />
                <Text style={styles.storageLegendText}>图片原图</Text>
                <Text style={styles.storageValue}>{formatFileSize(imageBytes)}</Text>
              </View>
              <View style={styles.storageInlineRow}>
                <View style={[styles.storageLegendDot, { backgroundColor: colors.primary.weak }]} />
                <Text style={styles.storageLegendText}>视频存储</Text>
                <Text style={styles.storageValue}>{formatFileSize(videoBytes)}</Text>
              </View>
            </View>
          </View>

        </View>
        </ContentCard>
      </MagneticLiquidContainer>

      <View style={styles.entryList}>
        {/* BLOCK 1: Core Assets (Side-by-side squares) */}
        <View style={styles.coreAssetsRow}>
          <MagneticLiquidContainer damping={16} magneticStrength={0.15} stiffness={400} stretchFactor={0.001} maxScale={1.02} maxTranslation={10} style={{ flex: 1 }}>
            <Pressable
              accessibilityLabel="收藏图片"
              accessibilityRole="button"
            onPress={() => handleEntryPress('favorites')}
            style={({ pressed }) => [styles.coreAssetCard, pressed && styles.pressed]}
          >
            <View style={styles.coreAssetHeader}>
              <Ionicons color="#22C55E" name="star" size={28} />
              <View style={styles.arrowButtonBadge}>
                <Ionicons color={colors.text.tertiary} name="arrow-forward" size={14} style={{ transform: [{ rotate: '-45deg' }] }} />
              </View>
            </View>
            <View style={styles.coreAssetBody}>
              <View style={styles.coreAssetCountRow}>
                <MagneticLiquidContainer damping={14} stiffness={350} maxTranslation={8} stretchFactor={0.01}>
                  <Text style={styles.coreAssetCount}>{data?.favoriteImageCount ?? 0}</Text>
                </MagneticLiquidContainer>
                <AnimatedSparkline active={isActive} heights={[6, 12, 4, 9]} />
              </View>
              <Text style={styles.coreAssetTitle}>收藏图片</Text>
            </View>
          </Pressable>
          </MagneticLiquidContainer>

          <MagneticLiquidContainer damping={16} magneticStrength={0.15} stiffness={400} stretchFactor={0.001} maxScale={1.02} maxTranslation={10} style={{ flex: 1 }}>
            <Pressable
              accessibilityLabel="最近查看"
              accessibilityRole="button"
            onPress={() => handleEntryPress('recent')}
            style={({ pressed }) => [styles.coreAssetCard, pressed && styles.pressed]}
          >
            <View style={styles.coreAssetHeader}>
              <Ionicons color={colors.text.secondary} name="time-outline" size={28} />
              <View style={styles.arrowButtonBadge}>
                <Ionicons color={colors.text.tertiary} name="arrow-forward" size={14} style={{ transform: [{ rotate: '-45deg' }] }} />
              </View>
            </View>
            <View style={styles.coreAssetBody}>
              <View style={styles.coreAssetCountRow}>
                <MagneticLiquidContainer damping={14} stiffness={350} maxTranslation={8} stretchFactor={0.01}>
                  <Text style={styles.coreAssetCount}>{data?.recentViewedCount ?? 0}</Text>
                </MagneticLiquidContainer>
                <AnimatedSparkline active={isActive} heights={[4, 9, 11, 5]} />
              </View>
              <Text style={styles.coreAssetTitle}>最近查看</Text>
            </View>
          </Pressable>
          </MagneticLiquidContainer>
        </View>

        {/* BLOCK 2: Tools Grid (4 columns) */}
        <MagneticLiquidContainer damping={16} magneticStrength={0.15} stiffness={400} stretchFactor={0.001} maxScale={1.02} maxTranslation={10}>
          <ContentCard style={styles.toolsGroup}>
          <View style={styles.toolsGrid}>
            <Pressable onPress={() => handleEntryPress('trash')} style={({ pressed }) => [styles.toolGridItem, pressed && styles.pressed]}>
              <View style={styles.toolIconWrap}>
                <Ionicons color={colors.semantic.danger} name="trash-outline" size={22} />
              </View>
              <Text style={styles.toolTitle}>回收站</Text>
            </Pressable>

            <Pressable onPress={() => handleEntryPress('backup')} style={({ pressed }) => [styles.toolGridItem, pressed && styles.pressed]}>
              <View style={styles.toolIconWrap}>
                <Ionicons color={colors.primary.active} name="archive-outline" size={22} />
              </View>
              <Text style={styles.toolTitle}>备份导出</Text>
            </Pressable>

            <Pressable onPress={() => handleEntryPress('duplicate-review')} style={({ pressed }) => [styles.toolGridItem, pressed && styles.pressed]}>
              <View style={styles.toolIconWrap}>
                <Ionicons color={colors.primary.active} name="copy-outline" size={22} />
              </View>
              <Text style={styles.toolTitle}>重复检测</Text>
            </Pressable>

            <Pressable onPress={() => handleEntryPress('storage-usage')} style={({ pressed }) => [styles.toolGridItem, pressed && styles.pressed]}>
              <View style={styles.toolIconWrap}>
                <View style={{ transform: [{ scale: 0.85 }] }}>
                  <StorageUsageGlyph />
                </View>
              </View>
              <Text style={styles.toolTitle}>存储占用</Text>
            </Pressable>
          </View>
        </ContentCard>
        </MagneticLiquidContainer>

        {/* BLOCK 3: System List */}
        <MagneticLiquidContainer damping={16} magneticStrength={0.15} stiffness={400} stretchFactor={0.001} maxScale={1.02} maxTranslation={10}>
          <ContentCard style={styles.systemGroup}>
          <Pressable onPress={() => handleEntryPress('about')} style={({ pressed }) => [styles.systemListItem, pressed && styles.pressed]}>
            <View style={styles.systemListIcon}>
              <Ionicons color={colors.primary.active} name="information-circle-outline" size={20} />
            </View>
            <Text style={styles.systemListTitle}>关于</Text>
            <Ionicons color={colors.text.secondary} name="chevron-forward" size={18} />
          </Pressable>
          <View style={styles.systemListDivider} />
          <Pressable onPress={() => handleEntryPress('diagnostics')} style={({ pressed }) => [styles.systemListItem, pressed && styles.pressed]}>
            <View style={styles.systemListIcon}>
              <Ionicons color={colors.primary.active} name="settings-outline" size={20} />
            </View>
            <Text style={styles.systemListTitle}>性能与诊断</Text>
            <Ionicons color={colors.text.secondary} name="chevron-forward" size={18} />
          </Pressable>
        </ContentCard>
        </MagneticLiquidContainer>
      </View>

      {isLoading ? <Text style={styles.loadingText}>正在刷新本地统计…</Text> : null}
      {errorMessage ? (
        <Text onPress={reload} style={styles.retryText}>
          重新加载
        </Text>
      ) : null}

      <ProfileRenameDialog
        currentNickname={data?.profileNickname || null}
        onClose={() => setIsRenameDialogVisible(false)}
        onRenamed={() => {
          setIsRenameDialogVisible(false);
          reload();
        }}
        space={space}
        visible={isRenameDialogVisible}
      />
    </ScreenScaffold>
  );
}


function AnimatedSparklineBar({ active, baseHeight, delay }: { active: boolean; baseHeight: number; delay: number }) {
  const currentHeight = useSharedValue(baseHeight);
  
  useEffect(() => {
    if (!active) {
      cancelAnimation(currentHeight);
      currentHeight.value = baseHeight;
      return;
    }
    const max = 13;
    const min = 3;
    const gen = () => Math.floor(Math.random() * (max - min + 1)) + min;
    const dur = () => 400 + Math.random() * 400;

    // 生成一系列随机高度，每次循环所有柱子都有机会达到最大高度 13 或最小高度 3
    currentHeight.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(gen(), { duration: dur() }),
        withTiming(gen(), { duration: dur() }),
        withTiming(gen(), { duration: dur() }),
        withTiming(gen(), { duration: dur() }),
        withTiming(gen(), { duration: dur() }),
        withTiming(gen(), { duration: dur() }),
        withTiming(baseHeight, { duration: dur() }),
      ),
      -1, // infinite
      true // reverse
    ));
    return () => cancelAnimation(currentHeight);
  }, [active, baseHeight, delay, currentHeight]);

  const style = useAnimatedStyle(() => ({
    height: currentHeight.value,
  }));

  return <Reanimated.View style={[styles.sparklineBar, style]} />;
}

function AnimatedSparkline({ active, heights }: { active: boolean; heights: number[] }) {
  return (
    <View style={styles.sparkline}>
      {heights.map((h, i) => (
        <AnimatedSparklineBar active={active} key={i} baseHeight={h} delay={i * 200} />
      ))}
    </View>
  );
}

function StatBlock({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
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
    backgroundColor: colors.background.surface,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing[4],
    top: spacing[4],
    width: 42,
    zIndex: 2,
  },
  personalLockButtonActive: {
    backgroundColor: colors.background.surface,
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
    ...shadows.sm,
    alignItems: 'center',
    backgroundColor: colors.primary.weak,
    borderColor: colors.border.default,
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
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
    justifyContent: 'space-between',
  },
  heroTitleContainer: {
    flexShrink: 1,
    marginRight: spacing[4],
  },
  heroTitle: {
    ...typography.textStyles.pageTitle,
    fontSize: 20,
    lineHeight: 28,
  },

  storageBlock: {
    gap: spacing[4],
    paddingTop: spacing[2],
  },
  storageVisualContainer: {
    gap: spacing[2],
  },
  storageHeader: {
    flexDirection: 'row',
    gap: spacing[2],
    alignItems: 'center',
    marginBottom: spacing[1],
  },
  storageTotalLabel: {
    fontFamily: typography.family.base,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.title,
  },
  storageTotalValue: {
    fontFamily: typography.family.stat,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary.active,
  },
  storageProgressBar: {
    ...shadows.sm,
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background.empty,
    borderColor: colors.border.default,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  storageProgressSegment: {
    height: '100%',
  },
  storageLegendRow: {
    flexDirection: 'row',
    gap: spacing[4],
    marginTop: spacing[1],
  },
  storageInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    justifyContent: 'flex-start',
  },
  coreContainer: {
    width: 54,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing[2],
  },
  coreDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text.primary,
  },
  orbitWrapper: {
    position: 'absolute',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  orbit1: {
    position: 'absolute',
    width: 23,
    height: 23,
    borderRadius: 11.5,
    borderWidth: 1,
    borderColor: colors.text.tertiary,
    borderStyle: 'dashed',
    opacity: 0.3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planet1: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.support.mint300,
  },
  orbit2: {
    position: 'absolute',
    width: 33,
    height: 33,
    borderRadius: 16.5,
    borderWidth: 1,
    borderColor: colors.text.tertiary,
    borderStyle: 'dashed',
    opacity: 0.3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planet2: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.support.lilac300,
  },
  orbit3: {
    position: 'absolute',
    width: 43,
    height: 43,
    borderRadius: 21.5,
    borderWidth: 1,
    borderColor: colors.text.tertiary,
    borderStyle: 'dashed',
    opacity: 0.3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planet3: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.support.sky300,
  },
  orbit4: {
    position: 'absolute',
    width: 55,
    height: 55,
    borderRadius: 27.5,
    borderWidth: 1,
    borderColor: colors.text.tertiary,
    borderStyle: 'dashed',
    opacity: 0.3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planet4: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.support.coral400,
  },
  storageLegendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  storageLegendText: {
    fontFamily: typography.family.base,
    fontSize: 11,
    color: colors.text.secondary,
  },
  storageValue: {
    ...typography.textStyles.caption,
    color: colors.text.primary,
    fontWeight: '600',
  },
  libraryStatsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[4],
  },
  statDivider: {
    backgroundColor: colors.border.strong,
    height: 14,
    width: StyleSheet.hairlineWidth,
  },
  statBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  statValue: {
    fontFamily: typography.family.stat,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.title,
  },
  statLabel: {
    ...typography.textStyles.body,
    color: colors.text.secondary,
  },
  entryList: {
    gap: rhythm.entryCardGap,
  },
  coreAssetsRow: {
    flexDirection: 'row',
    gap: spacing[4],
  },
  coreAssetCard: {
    ...shadows.sm,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    padding: spacing[4],
    aspectRatio: 1.15,
    justifyContent: 'space-between',
  },
  coreAssetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  coreAssetBody: {
    gap: spacing[1],
  },
  coreAssetCountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    paddingBottom: 8,
  },
  sparklineBar: {
    width: 3,
    backgroundColor: colors.border.strong,
    borderRadius: radius.pill,
  },
  arrowButtonBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreAssetCount: {
    fontFamily: typography.family.monoBold,
    fontSize: 42,
    color: colors.text.title,
    lineHeight: 48,
  },
  coreAssetTitle: {
    fontFamily: typography.family.stat,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  toolsGroup: {
    paddingVertical: spacing[5],
    paddingHorizontal: spacing[2],
  },
  toolsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
  },
  toolGridItem: {
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
  },
  toolIconWrap: {
    ...shadows.sm,
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  toolTitle: {
    ...typography.textStyles.micro,
    color: colors.text.title,
    fontWeight: '500',
  },
  systemGroup: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  systemListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[4],
    gap: spacing[3],
  },
  systemListDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.subtle,
    marginLeft: 36,
  },
  systemListIcon: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemListTitle: {
    ...typography.textStyles.body,
    flex: 1,
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
