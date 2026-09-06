import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Alert, LayoutAnimation, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeInDown, useAnimatedScrollHandler, useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useEffect, useState, useRef } from 'react';
import * as Updates from 'expo-updates';

import { ScreenScaffold } from '../components/ScreenScaffold';
import { useToast } from '../components/AppToast';
import { checkForAppUpdate } from '../services/updateCheckService';
import { getAppMilestones, type AppMilestones } from '../services/milestoneService';
import {
  getPreloadedProductDocumentationMarkdown,
  prefetchProductDocumentationAssets,
} from '../services/productDocumentationService';
import { colors, radius, shadows, spacing, typography } from '../design/tokens';
import type { PixorySpace } from '../database';
import { ParallaxLightSweep } from '../components/ParallaxLightSweep';
import { isDeveloperModeRevealEnabled, setDeveloperModeEnabled } from '../utils/dev';
import { JournalAchievementChapter } from '../components/about/JournalAchievementChapter';
import {
  getJournalAchievementProjection,
  markJournalAchievementRead,
  type JournalAchievementProjection,
  type JournalAchievementRecord,
} from '../services/journalAchievementService';

interface AboutScreenProps {
  onBack: () => void;
  onPushRoute: (route: any) => void;
  space?: PixorySpace;
}

interface AboutJournalUiState {
  expandedNodes: Record<string, boolean>;
  expandedCategoryIds: Set<string>;
  openAchievementId: string | null;
}

const aboutJournalUiStateBySpace = new Map<PixorySpace, AboutJournalUiState>();

function getAboutJournalUiState(space: PixorySpace): AboutJournalUiState {
  const existing = aboutJournalUiStateBySpace.get(space);
  if (existing) return existing;
  const initial: AboutJournalUiState = {
    expandedNodes: { storyBegins: true, firstFootprints: false },
    expandedCategoryIds: new Set(),
    openAchievementId: null,
  };
  aboutJournalUiStateBySpace.set(space, initial);
  return initial;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function AboutScreen({ onBack, onPushRoute, space = 'normal' }: AboutScreenProps) {
  const { showToast } = useToast();
  const version = Constants.expoConfig?.version ?? '2.8.1';
  const initialJournalUiState = getAboutJournalUiState(space);
  const [milestones, setMilestones] = useState<AppMilestones | null>(null);
  const [journal, setJournal] = useState<JournalAchievementProjection | null>(null);

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    ...initialJournalUiState.expandedNodes,
    storyBegins: false,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      if (initialJournalUiState.expandedNodes.storyBegins !== false) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedNodes((prev) => ({ ...prev, storyBegins: true }));
      }
    }, 1100);
    return () => clearTimeout(timer);
  }, [initialJournalUiState.expandedNodes.storyBegins]);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(initialJournalUiState.expandedCategoryIds);
  const [openAchievementId, setOpenAchievementId] = useState<string | null>(initialJournalUiState.openAchievementId);
  const [detailMd, setDetailMd] = useState<string | null>(null);
  const [productDocMd, setProductDocMd] = useState<string>(() => getPreloadedProductDocumentationMarkdown());
  const [activeStatIndex, setActiveStatIndex] = useState<number | null>(null);
  const [showSweep, setShowSweep] = useState(true);
  const revealTapRef = useRef({ count: 0, startedAt: 0 });
  const insets = useSafeAreaInsets();

  // Scroll-driven sticky header — runs entirely on the UI thread via JSI
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      scrollY.value = event.contentOffset.y;
    },
  });

  // Hero fades out as it slides toward the status bar (50 → 120 px)
  const heroFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [50, 120], [1, 0], Extrapolation.CLAMP),
  }));

  // Sticky bar fades in slightly after hero starts fading (70 → 130 px),
  // and slides down from 12px above its resting position for a natural feel
  const stickyBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [70, 130], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [70, 130], [-12, 0], Extrapolation.CLAMP) },
    ],
  }));
  const handleDeveloperTap = () => { if (!isDeveloperModeRevealEnabled) return; const now = Date.now(); const current = revealTapRef.current; const count = now - current.startedAt <= 10000 ? current.count + 1 : 1; revealTapRef.current = { count, startedAt: count === 1 ? now : current.startedAt }; if (count >= 7) { revealTapRef.current = { count: 0, startedAt: 0 }; void setDeveloperModeEnabled(true); showToast('开发者模式已开启'); } };

  useEffect(() => {
    const timer = setTimeout(() => setShowSweep(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (activeStatIndex !== null) {
      timeout = setTimeout(() => {
        setActiveStatIndex(null);
      }, 5000);
    }
    return () => clearTimeout(timeout);
  }, [activeStatIndex]);

  useEffect(() => {
    let isMounted = true;
    void getJournalAchievementProjection(space).then((data) => {
      if (isMounted) setJournal(data);
    }).catch(console.warn);
    void getAppMilestones(space).then((data) => {
      if (isMounted) {
        setMilestones(data);
      }
    }).catch(console.warn);

    // Background prefetch of the detailed markdown so the reader opens instantly
    import('../services/milestoneService').then(({ generateMilestonesDetailMarkdown }) => {
      generateMilestonesDetailMarkdown(space).then((md) => {
        if (isMounted) {
          setDetailMd(md);
        }
      }).catch(() => {});
    });

    prefetchProductDocumentationAssets()
      .then(() => {
        if (isMounted) {
          setProductDocMd(getPreloadedProductDocumentationMarkdown());
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [space]);

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const handleCheckAllUpdates = async () => {
    try {
      showToast({ message: '正在检查更新...', durationMs: 999999 });
      const [versionInfo, otaUpdate] = await Promise.all([
        checkForAppUpdate().catch(() => null),
        __DEV__ 
          ? Promise.resolve(null)
          : Promise.race([
              Updates.checkForUpdateAsync(),
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error('OTA_TIMEOUT')), 10000))
            ])
      ]);

      if (versionInfo) {
        showToast({ message: '发现新版本', durationMs: 3000, tone: 'success' });
        Alert.alert('发现新版本', `新版本 v${versionInfo.version} 已发布，是否前往下载？`, [
          { text: '稍后', style: 'cancel' },
          { text: '前往', onPress: () => openUrl(versionInfo.downloadUrl) }
        ]);
        return;
      }

      if (otaUpdate?.isAvailable) {
        showToast({ message: '发现新热更新，正在下载...', durationMs: 999999 });
        await Updates.fetchUpdateAsync();
        showToast({ message: '热更新下载完成', durationMs: 3000, tone: 'success' });
        Alert.alert('热更新完成', '是否立即重启应用以应用更新？', [
          { text: '稍后', style: 'cancel' },
          { text: '重启', onPress: () => Updates.reloadAsync() }
        ]);
      } else {
        showToast('当前已是最新版本');
      }
    } catch (error: any) {
      if (error?.message === 'OTA_TIMEOUT' || error?.message?.includes('timeout') || error?.message?.includes('network')) {
        showToast({ message: '网络问题，检查超时', tone: 'error' });
      } else {
        showToast({ message: '更新检查失败', tone: 'error' });
      }
    }
  };

  const toggleNode = (nodeKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedNodes(prev => {
      const next = { ...prev, [nodeKey]: !prev[nodeKey] };
      const stored = getAboutJournalUiState(space);
      aboutJournalUiStateBySpace.set(space, { ...stored, expandedNodes: next });
      return next;
    });
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategoryIds((previous) => {
      const next = new Set(previous);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      const stored = getAboutJournalUiState(space);
      aboutJournalUiStateBySpace.set(space, { ...stored, expandedCategoryIds: next });
      return next;
    });
  };

  const openAchievement = async (achievement: JournalAchievementRecord) => {
    setOpenAchievementId((current) => {
      const next = current === achievement.achievementId ? null : achievement.achievementId;
      const stored = getAboutJournalUiState(space);
      aboutJournalUiStateBySpace.set(space, { ...stored, openAchievementId: next });
      return next;
    });
    if (achievement.readAt === null) {
      await markJournalAchievementRead(space, achievement.achievementId).catch(() => {});
      setJournal((current) => current ? {
        ...current,
        categories: current.categories.map((category) => ({
          ...category,
          achievements: category.achievements.map((item) =>
            item.achievementId === achievement.achievementId ? { ...item, readAt: Date.now() } : item,
          ),
          hasUnread: category.achievements.some((item) =>
            item.achievementId !== achievement.achievementId && item.readAt === null,
          ),
        })),
        unreadCategoryIds: current.unreadCategoryIds.map((id) => {
          if (id !== achievement.category) return id;
          const category = current.categories.find((item) => item.id === id);
          return category && category.achievements.some((item) =>
            item.achievementId !== achievement.achievementId && item.readAt === null,
          ) ? id : null;
        }).filter((id): id is JournalAchievementProjection['unreadCategoryIds'][number] => id !== null),
      } : current);
    }
  };

  const navigateAchievement = (achievement: JournalAchievementRecord) => {
    void openAchievement(achievement);
    const payload = achievement.sourcePayload;
    switch (achievement.routeKind) {
      case 'asset':
        if (achievement.sourceId) onPushRoute({ name: 'image-detail', imageId: Number(achievement.sourceId), space });
        break;
      case 'thread':
        if (achievement.sourceId) onPushRoute({
          name: 'ai-chat',
          threadId: achievement.sourceId,
          searchTargetMessageId: typeof payload.messageId === 'string' ? payload.messageId : undefined,
          space,
        });
        break;
      case 'memory-board':
        if (typeof payload.threadId === 'string') {
          onPushRoute({ name: 'ai-memory-board', threadId: payload.threadId, space });
        }
        break;
      case 'diary':
        if (achievement.sourceId) onPushRoute({ name: 'diary-reader', diaryId: achievement.sourceId, space });
        break;
      case 'dream':
        if (achievement.sourceId) onPushRoute({ name: 'dream-reader', dreamId: achievement.sourceId, space });
        break;
      case 'ip':
        if (achievement.sourceId) onPushRoute({ name: 'ip-detail', ipId: Number(achievement.sourceId), space });
        break;
      case 'group':
        if (achievement.sourceId && typeof payload.ipId === 'number') {
          onPushRoute({ name: 'group-images', ipId: payload.ipId, groupId: Number(achievement.sourceId), space });
        }
        break;
      case 'tag':
        if (achievement.sourceId) onPushRoute({ name: 'tag-result', tagId: Number(achievement.sourceId), space });
        break;
      case 'all-assets':
        onPushRoute({ name: 'all-images', space });
        break;
      case 'knowledge':
        if (achievement.sourceId) onPushRoute({ name: 'ai-document-reader', documentId: achievement.sourceId, space });
        break;
      case 'role':
        if (achievement.sourceId) onPushRoute({ name: 'ai-role-card-detail', roleCardId: achievement.sourceId, space });
        break;
      case 'branch-tree':
        if (achievement.sourceId) onPushRoute({ name: 'ai-branch-tree', threadId: achievement.sourceId, space });
        break;
      default:
        break;
    }
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  const renderStatsGrid = () => {
    if (!milestones) return null;
    const stats = [
      { label: '光影瞬间', value: milestones.totalImages, explanation: `累计保存了 ${milestones.totalImages} 份图片与视频素材` },
      { label: '思维交汇', value: milestones.totalAiMessages, explanation: `累计产生了 ${milestones.totalAiMessages} 条对话消息` },
      { label: '专属世界', value: milestones.totalIps, explanation: `共建立了 ${milestones.totalIps} 个 IP 设定` },
      { label: '记忆结晶', value: milestones.totalMemories, explanation: `已沉淀 ${milestones.totalMemories} 个核心记忆切片` },
      { label: '特别珍藏', value: milestones.totalFavoriteImages, explanation: `共收藏了 ${milestones.totalFavoriteImages} 份重要素材` },
      { label: '存储占用', value: formatBytes(milestones.totalStorageBytes), explanation: `当前本地数据共占用 ${formatBytes(milestones.totalStorageBytes)} 存储空间` },
    ];
    const statRows = [0, 2, 4];

    return (
      <View style={styles.gridContainer}>
        {statRows.map((rowStart) => {
          const activeIndexInRow =
            activeStatIndex !== null && activeStatIndex >= rowStart && activeStatIndex < rowStart + 2
              ? activeStatIndex
              : null;
          return (
            <View key={rowStart} style={styles.statRow}>
              <View style={styles.statCells}>
                {stats.slice(rowStart, rowStart + 2).map((stat, offset) => {
                  const index = rowStart + offset;
                  return (
                    <Pressable
                      key={stat.label}
                      onPress={() => setActiveStatIndex(activeStatIndex === index ? null : index)}
                      style={styles.gridItem}
                    >
                      <Text style={styles.gridValue}>{stat.value}</Text>
                      <Text style={styles.gridLabel}>{stat.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {activeIndexInRow !== null ? (
                <Animated.Text entering={FadeInDown.duration(200)} style={styles.statExplanation}>
                  {stats[activeIndexInRow].explanation}
                </Animated.Text>
              ) : null}
            </View>
          );
        })}
        <Pressable
          onPress={() => onPushRoute({ name: 'milestones-detail', space, preloadedMarkdown: detailMd })}
          style={styles.detailLinkBtn}
          hitSlop={12}
        >
          <Text style={styles.detailLinkText}>查看详细信息 ↗</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/*
        ScreenScaffold is non-scrollable here — we own the ScrollView so we can wire
        the reanimated handler directly and keep everything on the UI thread.
      */}
      <ScreenScaffold
        backgroundVariant="profile"
        scrollable={false}
        showHeader={false}
        contentContainerStyle={{ padding: 0, gap: 0, flex: 1 }}
      >
        <Animated.ScrollView
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing[12] },
          ]}
        >
          {/* HERO — fades out as it approaches the status bar */}
          <Animated.View style={[styles.heroArea, heroFadeStyle]}>
            <View style={styles.heroLabelRow}>
              <Pressable
                accessibilityLabel="返回"
                hitSlop={16}
                onPress={onBack}
                style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
              >
                <Feather color={colors.text.title} name="arrow-left" size={20} />
              </Pressable>
              <Animated.Text entering={FadeIn.duration(1000)} style={styles.heroLabel}>
                已陪伴你
              </Animated.Text>
            </View>
            <Animated.View entering={FadeInUp.delay(150).duration(1000).springify()} style={styles.heroNumberContainer}>
              <Text style={styles.heroNumber}>
                {milestones ? milestones.daysTogether : '...'}
              </Text>
              <Text style={styles.heroUnit}>天</Text>
            </Animated.View>
          </Animated.View>

          {/* TIMELINE AREA */}
          <View style={styles.timelineArea}>
            <View style={styles.timelineHairline} />

            {milestones ? (
              <Animated.View entering={FadeInUp.delay(300).duration(800).springify()}>

                {/* NODE 1: 故事开始 */}
                <View style={styles.timelineNode}>
                  <Pressable onPress={() => toggleNode('storyBegins')} style={styles.nodeHeader} hitSlop={12}>
                    <View style={[styles.pearl, expandedNodes.storyBegins && styles.pearlActive]} />
                    <Text style={styles.nodeTitle}>故事开始</Text>
                  </Pressable>
                  {expandedNodes.storyBegins && (
                    <Animated.View entering={FadeInDown.duration(280)} style={styles.nodeContent}>
                      <Text style={styles.poetryText}>
                        {formatDate(milestones.firstUseDate)}，你初次翻开这里。{'\n'}
                        彼时的空白，如今已被时光填满。
                      </Text>
                    </Animated.View>
                  )}
                </View>

                {/* NODE 2: 岁月有声 */}
                <View style={styles.timelineNode}>
                  <Pressable onPress={() => toggleNode('firstFootprints')} style={styles.nodeHeader} hitSlop={12}>
                    <View style={[styles.pearl, expandedNodes.firstFootprints && styles.pearlActive]} />
                    <Text style={styles.nodeTitle}>岁月有声</Text>
                  </Pressable>
                  {expandedNodes.firstFootprints && (
                    <View style={styles.nodeContent}>
                      <View style={styles.achievementList}>
                        {journal?.categories.map((category) => (
                          <JournalAchievementChapter
                            category={category}
                            expanded={expandedCategoryIds.has(category.id)}
                            formatDate={formatDate}
                            key={category.id}
                            onNavigate={navigateAchievement}
                            onOpenAchievement={openAchievement}
                            onToggle={() => toggleCategory(category.id)}
                            openAchievementId={openAchievementId}
                          />
                        ))}
                        {!journal?.categories.length ? (
                          <Text style={styles.poetryText}>时光静候，等待你落笔的第一份记忆...</Text>
                        ) : null}
                      </View>
                    </View>
                  )}
                </View>

                {/* NODE 3: 至今 */}
                <View style={styles.timelineNode}>
                  <Pressable onPress={() => toggleNode('now')} style={styles.nodeHeader} hitSlop={12}>
                    <View style={[styles.pearl, expandedNodes.now && styles.pearlActive]} />
                    <Text style={styles.nodeTitle}>至今</Text>
                  </Pressable>
                  {expandedNodes.now && (
                    <View style={styles.nodeContent}>
                      {renderStatsGrid()}
                    </View>
                  )}
                </View>
              </Animated.View>
            ) : (
              <View style={{ height: 200 }} />
            )}
          </View>

          <View style={styles.spacer} />

          {/* ACTION AREA */}
          <Animated.View entering={FadeInUp.delay(750).duration(800).springify()} style={styles.linksContainer}>
            <Pressable onPress={() => openUrl('https://mist01.com')} style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}>
              <Text style={styles.linkText}>访问官方网站</Text>
              <Feather color={colors.text.placeholder} name="arrow-right" size={16} />
            </Pressable>
            <View style={styles.linkSeparator} />
            <Pressable onPress={() => onPushRoute({ name: 'product-doc', space, preloadedMarkdown: productDocMd })} style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}>
              <Text style={styles.linkText}>产品文档</Text>
              <Feather color={colors.text.placeholder} name="arrow-right" size={16} />
            </Pressable>
            <View style={styles.linkSeparator} />
            <Pressable onPress={handleCheckAllUpdates} style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}>
              <Text style={styles.linkText}>检查更新</Text>
              <Feather color={colors.text.placeholder} name="arrow-right" size={16} />
            </Pressable>
          </Animated.View>

          {/* COLOPHON */}
          <Animated.View entering={FadeInDown.delay(900).duration(800).springify()} style={styles.colophon}>
            <Pressable onPress={handleDeveloperTap}><Text style={styles.brandLogoText}>Pixory</Text></Pressable>
            <Pressable onPress={handleDeveloperTap}><Text style={styles.colophonVersion}>v{version}</Text></Pressable>
            <Text style={styles.colophonCopyright}>© {new Date().getFullYear()} Pixory.</Text>
          </Animated.View>
        </Animated.ScrollView>
      </ScreenScaffold>

      {/*
        STICKY FLOATING HEADER
        Absolutely positioned above the ScrollView, entirely outside the scroll tree.
        Driven by scrollY on the UI thread — no JS involvement after mount.
        pointerEvents="box-none" lets touches pass through the transparent container
        while the back Pressable inside still responds normally when visible.
      */}
      <Animated.View
        pointerEvents="box-none"
        style={[styles.stickyBar, { top: insets.top }, stickyBarStyle]}
      >
        <Pressable
          accessibilityLabel="返回"
          hitSlop={12}
          onPress={onBack}
          style={({ pressed }) => [styles.stickyBackBtn, pressed && styles.stickyBackBtnPressed]}
        >
          <Feather color={colors.text.title} name="arrow-left" size={18} />
        </Pressable>
        <Text numberOfLines={1} style={styles.stickyTitle}>
          已陪伴你 · {milestones ? milestones.daysTogether : '...'} 天
        </Text>
      </Animated.View>

      <ParallaxLightSweep opacity={0.35} visible={showSweep} />
    </View>
  );
}

const styles = StyleSheet.create({
  /* ScrollView content container — replaces the old static container View */
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[8],
    minHeight: 700,
  },

  /* --- Sticky Floating Header --- */
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    height: 48,
  },
  stickyBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[2],
  },
  stickyBackBtnPressed: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  stickyTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    letterSpacing: 0.5,
    flex: 1,
  },

  /* --- Hero Area --- */
  heroArea: {
    alignItems: 'flex-start',
    marginTop: spacing[2],
    marginBottom: spacing[8],
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[2],
    marginLeft: -spacing[2],
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[1],
  },
  backBtnPressed: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  heroLabel: {
    ...typography.textStyles.caption,
    letterSpacing: 2,
    color: colors.text.secondary,
    marginBottom: 0,
  },
  heroNumberContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: spacing[2],
  },
  heroNumber: {
    fontFamily: typography.family.serif,
    fontSize: 56,
    lineHeight: 64,
    color: colors.text.title,
    includeFontPadding: false,
  },
  heroUnit: {
    ...typography.textStyles.body,
    color: colors.text.tertiary,
    marginLeft: spacing[2],
    marginBottom: spacing[2],
  },

  /* --- Pearl Timeline Area --- */
  timelineArea: {
    paddingHorizontal: spacing[4],
    position: 'relative',
    marginBottom: spacing[6],
  },
  timelineHairline: {
    position: 'absolute',
    left: spacing[4] + 3, // 4 to center the 8px pearl
    top: 16,
    bottom: 24,
    width: 1,
    backgroundColor: colors.border.default,
  },
  timelineNode: {
    marginBottom: spacing[8],
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
  },
  pearl: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.text.placeholder,
    marginRight: spacing[4],
  },
  pearlActive: {
    backgroundColor: colors.text.title,
    transform: [{ scale: 1.2 }],
  },
  nodeTitle: {
    fontFamily: typography.family.serif,
    fontSize: 22,
    color: colors.text.title,
    letterSpacing: 1,
  },
  nodeContent: {
    marginLeft: spacing[4] + 7,
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    overflow: 'hidden',
  },
  poetryText: {
    ...typography.textStyles.body,
    color: colors.text.secondary,
    lineHeight: 24,
    fontFamily: typography.family.mono,
  },

  /* Footprints */
  footprintsContainer: {
    gap: spacing[4],
  },
  achievementList: {
    marginTop: spacing[1],
  },
  achievementRow: {
    alignItems: 'center',
    borderBottomColor: colors.border.subtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 36,
    paddingVertical: spacing[2],
  },
  achievementName: {
    ...typography.textStyles.body,
    color: colors.text.primary,
    flex: 1,
  },
  achievementDate: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
    textAlign: 'right',
    width: 86,
  },
  achievementAction: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: 28,
  },
  footprintRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footprintIcon: {
    fontSize: 16,
    marginRight: spacing[3],
  },
  footprintText: {
    ...typography.textStyles.body,
    color: colors.text.primary,
    fontFamily: typography.family.mono,
  },
  footprintArrow: {
    marginLeft: spacing[2],
  },

  /* 6-Grid Stats */
  gridContainer: {
    marginTop: spacing[2],
  },
  statRow: {
    marginBottom: spacing[6],
    width: '100%',
  },
  statCells: {
    flexDirection: 'row',
  },
  gridItem: {
    flex: 1,
    minWidth: 0,
  },
  gridValue: {
    fontFamily: typography.family.mono, // Precision feel
    fontSize: 20,
    color: colors.text.title,
    marginBottom: 4,
    fontWeight: '500',
  },
  gridLabel: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
    fontFamily: typography.family.base,
  },
  detailLinkBtn: {
    width: '100%',
    alignItems: 'flex-end',
    marginTop: spacing[2],
  },
  detailLinkText: {
    ...typography.textStyles.caption,
    color: colors.text.placeholder,
    letterSpacing: 0.5,
  },
  statExplanation: {
    ...typography.textStyles.caption,
    color: colors.text.tertiary,
    lineHeight: 18,
    marginTop: spacing[2],
    width: '100%',
  },

  spacer: {
    height: spacing[4],
  },

  /* --- Action Area --- */
  linksContainer: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.subtle,
    ...shadows.sm,
    marginBottom: spacing[10],
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[5],
  },
  linkButtonPressed: {
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  linkText: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.title,
    letterSpacing: 0.5,
  },
  linkSeparator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.04)',
    marginHorizontal: spacing[5],
  },

  /* --- Colophon --- */
  colophon: {
    alignItems: 'center',
  },
  brandLogoText: {
    fontFamily: typography.family.serif,
    fontSize: 24,
    color: colors.text.primary,
    marginBottom: spacing[1],
  },
  colophonVersion: {
    fontFamily: typography.family.mono,
    fontSize: 11,
    color: colors.text.secondary,
    marginBottom: spacing[1],
  },
  colophonCopyright: {
    ...typography.textStyles.micro,
    color: colors.text.placeholder,
    letterSpacing: 0.5,
  },
});


