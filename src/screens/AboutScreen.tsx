import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { Alert, LayoutAnimation, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeInDown } from 'react-native-reanimated';
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

interface AboutScreenProps {
  onBack: () => void;
  onPushRoute: (route: any) => void;
  space?: PixorySpace;
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
  const version = Constants.expoConfig?.version ?? '2.6.6';
  const [milestones, setMilestones] = useState<AppMilestones | null>(null);

  const [expandedNodes, setExpandedNodes] = useState<{ [key: string]: boolean }>({});
  const [detailMd, setDetailMd] = useState<string | null>(null);
  const [productDocMd, setProductDocMd] = useState<string>(() => getPreloadedProductDocumentationMarkdown());
  const [activeStatIndex, setActiveStatIndex] = useState<number | null>(null);

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
    void getAppMilestones().then((data) => {
      if (isMounted) {
        setMilestones(data);
        // Expand the first node by default for a nice opening
        setExpandedNodes({ storyBegins: true });
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
  }, []);

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const handleCheckAllUpdates = async () => {
    try {
      showToast('正在检查更新...');
      const [versionInfo, otaUpdate] = await Promise.all([
        checkForAppUpdate().catch(() => null),
        Updates.checkForUpdateAsync().catch(() => null)
      ]);

      if (versionInfo) {
        Alert.alert('发现新版本', `新版本 v${versionInfo.version} 已发布，是否前往下载？`, [
          { text: '稍后', style: 'cancel' },
          { text: '前往', onPress: () => openUrl(versionInfo.downloadUrl) }
        ]);
        return;
      }

      if (otaUpdate?.isAvailable) {
        showToast('发现新热更新，正在下载...');
        await Updates.fetchUpdateAsync();
        Alert.alert('热更新完成', '是否立即重启应用以应用更新？', [
          { text: '稍后', style: 'cancel' },
          { text: '重启', onPress: () => Updates.reloadAsync() }
        ]);
      } else {
        showToast('当前已是最新版本');
      }
    } catch (error) {
      showToast('更新检查失败');
    }
  };

  const toggleNode = (nodeKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedNodes(prev => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
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
    <ScreenScaffold
      backgroundVariant="profile"
      decorativeTitle={space === 'personal' ? 'Journal' : 'Journal'}
      onBack={onBack}
      scrollable
      title=""
    >
      <View style={styles.container}>
        <View style={styles.heroArea}>
          <Animated.Text entering={FadeIn.duration(1000)} style={styles.heroLabel}>
            已陪伴你
          </Animated.Text>
          <Animated.View entering={FadeInUp.delay(150).duration(1000).springify()} style={styles.heroNumberContainer}>
            <Text style={styles.heroNumber}>
              {milestones ? milestones.daysTogether : '...'}
            </Text>
            <Text style={styles.heroUnit}>天</Text>
          </Animated.View>
        </View>

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
                  <View style={styles.nodeContent}>
                    <Text style={styles.poetryText}>
                      {formatDate(milestones.firstUseDate)}，你初次翻开这里。{'\n'}
                      彼时的空白，如今已被时光填满。
                    </Text>
                  </View>
                )}
              </View>

              {/* NODE 2: 最初的印记 */}
              <View style={styles.timelineNode}>
                <Pressable onPress={() => toggleNode('firstFootprints')} style={styles.nodeHeader} hitSlop={12}>
                  <View style={[styles.pearl, expandedNodes.firstFootprints && styles.pearlActive]} />
                  <Text style={styles.nodeTitle}>最初的印记</Text>
                </Pressable>
                {expandedNodes.firstFootprints && (
                  <View style={styles.nodeContent}>
                    {(!milestones.firstImageDate && !milestones.firstThreadDate) ? (
                      <Text style={styles.poetryText}>时光静候，等待你落笔的第一份记忆...</Text>
                    ) : (
                      <View style={styles.footprintsContainer}>
                        {milestones.firstImageDate && (
                          <Pressable
                            style={styles.footprintRow}
                            onPress={() => onPushRoute({ name: 'image-detail', imageId: milestones.firstImageId, space })}
                          >
                            <Text style={styles.footprintIcon}>🖼️</Text>
                            <Text style={styles.footprintText}>第一份光影：{formatDate(milestones.firstImageDate)}</Text>
                            <Feather name="arrow-right" size={14} color={colors.text.tertiary} style={styles.footprintArrow} />
                          </Pressable>
                        )}
                        {milestones.firstThreadDate && (
                          <Pressable
                            style={styles.footprintRow}
                            onPress={() => onPushRoute({ 
                              name: 'ai-chat', 
                              threadId: milestones.firstThreadId, 
                              searchTargetMessageId: milestones.firstMessageId ?? undefined,
                              space 
                            })}
                          >
                            <Text style={styles.footprintIcon}>💬</Text>
                            <Text style={styles.footprintText}>第一次对话：{formatDate(milestones.firstThreadDate)}</Text>
                            <Feather name="arrow-right" size={14} color={colors.text.tertiary} style={styles.footprintArrow} />
                          </Pressable>
                        )}
                      </View>
                    )}
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
          <Text style={styles.brandLogoText}>Pixory</Text>
          <Text style={styles.colophonVersion}>v{version}</Text>
          <Text style={styles.colophonCopyright}>© {new Date().getFullYear()} Pixory.</Text>
        </Animated.View>

      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[2],
    paddingBottom: spacing[12],
    minHeight: 700,
  },

  /* --- Hero Area --- */
  heroArea: {
    alignItems: 'flex-start',
    marginTop: 0,
    marginBottom: spacing[4],
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
  },
  heroNumber: {
    fontFamily: typography.family.serif,
    fontSize: 52,
    lineHeight: 60,
    color: colors.text.title,
    includeFontPadding: false,
  },
  heroUnit: {
    ...typography.textStyles.body,
    color: colors.text.tertiary,
    marginLeft: spacing[1],
    marginBottom: spacing[1],
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
