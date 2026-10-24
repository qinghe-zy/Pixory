import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import type { AiSidebarSpatialPreset, PixorySpace } from '../database';
import { colors, radius, rhythm, spacing, typography } from '../design/tokens';
import {
  AI_SIDEBAR_SPATIAL_PRESET_CONFIGS,
  AI_SIDEBAR_SPATIAL_PRESET_LIST,
  useAiSidebarSpatialPresetPreference,
  useAiSidebarStylePreference,
  useProfilePageStylePreference,
} from '../services/aiChatPreferences';

interface AppearanceSettingsScreenProps {
  onBack: () => void;
  space: PixorySpace;
  onOpenChatAppearance?: () => void;
}

const PREVIEW_INITIAL_DELAY_MS = 320;
const PREVIEW_OPEN_DURATION_MS = 560;
const PREVIEW_OPEN_HOLD_MS = 2600;
const PREVIEW_CLOSE_DURATION_MS = 460;
const PREVIEW_CLOSED_HOLD_MS = 900;

/** 循环驱动 0 -> 1 -> 0 的预览动画进度，切换档位时立即定格展示推进展开态 2600ms */
function usePreviewCycleProgress(resetTriggerKey?: string): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  const hasMountedRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const runCloseThenLoop = () => {
      if (cancelled) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(progress, {
          toValue: 0,
          duration: PREVIEW_CLOSE_DURATION_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          if (cancelled) return;
          timer = setTimeout(runFullCycle, PREVIEW_CLOSED_HOLD_MS);
        });
      }, PREVIEW_OPEN_HOLD_MS);
    };

    const runFullCycle = () => {
      if (cancelled) return;
      progress.setValue(0);

      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(progress, {
          toValue: 1,
          duration: PREVIEW_OPEN_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          if (cancelled) return;
          runCloseThenLoop();
        });
      }, PREVIEW_INITIAL_DELAY_MS);
    };

    if (hasMountedRef.current && resetTriggerKey) {
      progress.stopAnimation();
      Animated.timing(progress, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        if (cancelled) return;
        runCloseThenLoop();
      });
    } else {
      hasMountedRef.current = true;
      runFullCycle();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      progress.stopAnimation();
    };
  }, [progress, resetTriggerKey]);

  return progress;
}

/** 迷你聊天主屏幕骨架内容 */
function MiniChatSurface() {
  return (
    <>
      <View style={styles.miniHeader}>
        <View style={styles.headerDot} />
        <View style={styles.headerDot} />
        <View style={styles.headerDot} />
      </View>
      <View style={styles.miniCanvas}>
        <View style={styles.avatarDot} />
        <View style={styles.bubble}>
          <View style={[styles.skeletonBar, { width: '75%' }]} />
          <View style={[styles.skeletonBar, { width: '100%' }]} />
          <View style={[styles.skeletonBar, { width: '88%' }]} />
        </View>
      </View>
      <View style={styles.mockInputBar}>
        <View style={styles.inputPill} />
        <View style={styles.sendButton} />
      </View>
    </>
  );
}

/** 推挤缩放式预览：底层高定冷灰画布，顶层主界面向右推挤并按所选档位呈现 3D 透视折角与悬浮阴影 */
function PushScaleDrawerPreview({
  spatialPreset,
}: {
  spatialPreset: AiSidebarSpatialPreset;
}) {
  const progress = usePreviewCycleProgress(spatialPreset);
  const preset =
    AI_SIDEBAR_SPATIAL_PRESET_CONFIGS[spatialPreset] ??
    AI_SIDEBAR_SPATIAL_PRESET_CONFIGS.level_2;

  const targetTranslateX = Math.round(92 - 140 * ((1 - preset.previewScale) / 2));
  const cardTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetTranslateX],
  });
  const cardTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, preset.previewLiftY],
  });
  const cardScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, preset.previewScale],
  });
  const cardRotateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `-${preset.previewTiltDeg}deg`],
  });
  const whiteVeilOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.42],
  });
  const leftShadowOpacity = progress.interpolate({
    inputRange: [0, 0.15, 1],
    outputRange: [0, 0.65, 1],
  });
  const sidebarTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-16, 0],
  });

  const cardTransforms =
    preset.previewTiltDeg > 0 && preset.previewPerspective > 0
      ? [
          { perspective: preset.previewPerspective },
          { translateX: cardTranslateX },
          { translateY: cardTranslateY },
          { scale: cardScale },
          { rotateY: cardRotateY },
        ]
      : [
          { translateX: cardTranslateX },
          { translateY: cardTranslateY },
          { scale: cardScale },
        ];

  return (
    <View style={styles.miniScreenPushScale}>
      {/* 底层画布：左侧边栏列表 */}
      <Animated.View
        style={[
          styles.miniUnderlaySidebar,
          { transform: [{ translateX: sidebarTranslateX }] },
        ]}
      >
        <View style={styles.miniSearchPill} />
        <View style={styles.miniSidebarActiveRow}>
          <View style={styles.miniSidebarActiveBar} />
        </View>
        <View style={styles.miniSidebarIsland}>
          <View style={[styles.miniSidebarBar, { width: '74%' }]} />
          <View style={[styles.miniSidebarBar, { width: '58%' }]} />
          <View style={[styles.miniSidebarBar, { width: '66%' }]} />
        </View>
      </Animated.View>

      {/* 顶层主界面：推挤 + 缩放 + 5档 3D 透视旋转 + 左侧立体漫射阴影带 */}
      <Animated.View
        style={[
          styles.miniFloatingMainCardWrap,
          {
            transform: cardTransforms,
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.miniLeftShadowBand, { opacity: leftShadowOpacity }]}
        />
        <View style={styles.miniFloatingMainCard}>
          <MiniChatSurface />
          <Animated.View
            pointerEvents="none"
            style={[styles.miniWhiteVeil, { opacity: whiteVeilOpacity }]}
          />
        </View>
      </Animated.View>

      {/* 左下角实时角度与缩放徽标 */}
      <View pointerEvents="none" style={styles.miniPresetBadge}>
        <Text style={styles.miniPresetBadgeText}>
          {`${preset.tiltDeg}° · ${Math.round(preset.scale * 100)}%`}
        </Text>
      </View>
    </View>
  );
}

/** 经典覆盖式预览：主界面静止不动，覆上黑色半透明遮罩，侧边栏从左侧滑出覆盖于主屏上方 */
function ClassicOverlayDrawerPreview() {
  const progress = usePreviewCycleProgress();

  const drawerTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-96, 0],
  });
  const scrimOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.34],
  });

  return (
    <View style={styles.miniScreenClassic}>
      <MiniChatSurface />

      {/* 黑色半透明遮罩 */}
      <Animated.View
        pointerEvents="none"
        style={[styles.miniDarkScrim, { opacity: scrimOpacity }]}
      />

      {/* 顶层滑出抽屉 */}
      <Animated.View
        style={[
          styles.miniOverlayDrawer,
          { transform: [{ translateX: drawerTranslateX }] },
        ]}
      >
        <View style={styles.miniSearchPill} />
        <View style={styles.miniSidebarActiveRow}>
          <View style={styles.miniSidebarActiveBar} />
        </View>
        <View style={[styles.miniSidebarBar, { width: '68%' }]} />
        <View style={[styles.miniSidebarBar, { width: '54%' }]} />
      </Animated.View>
    </View>
  );
}

export function AppearanceSettingsScreen({
  onBack,
  space,
  onOpenChatAppearance,
}: AppearanceSettingsScreenProps) {
  const [sidebarStyleMode, setSidebarStyleMode] = useAiSidebarStylePreference(space);
  const [spatialPreset, setSpatialPreset] = useAiSidebarSpatialPresetPreference(space);
  const [profileStyleMode, setProfileStyleMode] = useProfilePageStylePreference(space);
  const isPushScale = sidebarStyleMode === 'push_scale';
  const activePresetConfig =
    AI_SIDEBAR_SPATIAL_PRESET_CONFIGS[spatialPreset] ??
    AI_SIDEBAR_SPATIAL_PRESET_CONFIGS.level_2;

  return (
    <ScreenScaffold
      contentContainerStyle={styles.scrollContent}
      onBack={onBack}
      scrollable
      title="外观设置"
    >
      <View style={styles.container}>
        <Text style={styles.sectionHeader}>AI侧边栏样式切换</Text>

        <View style={styles.selectorRow}>
          {/* 左卡片：推挤缩放式侧边栏 */}
          <Pressable
            accessibilityLabel="推挤缩放式侧边栏"
            accessibilityRole="radio"
            accessibilityState={{ checked: isPushScale }}
            onPress={() => setSidebarStyleMode('push_scale')}
            style={[
              styles.selectorTile,
              isPushScale ? styles.selectorTileActive : styles.selectorTileInactive,
            ]}
          >
            <PushScaleDrawerPreview spatialPreset={spatialPreset} />
            <View style={styles.tileFooter}>
              <View style={styles.tileHeaderRow}>
                <Text style={styles.tileTitle}>推挤缩放卡片</Text>
                <View
                  style={[
                    styles.radioCircle,
                    isPushScale && styles.radioCircleActive,
                  ]}
                >
                  {isPushScale && <View style={styles.radioDot} />}
                </View>
              </View>
              <Text style={styles.tileSubtitle}>底层画布，主屏缩为悬浮卡片</Text>
            </View>
          </Pressable>

          {/* 右卡片：经典覆盖式侧边栏 */}
          <Pressable
            accessibilityLabel="经典覆盖式侧边栏"
            accessibilityRole="radio"
            accessibilityState={{ checked: !isPushScale }}
            onPress={() => setSidebarStyleMode('classic')}
            style={[
              styles.selectorTile,
              !isPushScale ? styles.selectorTileActive : styles.selectorTileInactive,
            ]}
          >
            <ClassicOverlayDrawerPreview />
            <View style={styles.tileFooter}>
              <View style={styles.tileHeaderRow}>
                <Text style={styles.tileTitle}>经典覆盖抽屉</Text>
                <View
                  style={[
                    styles.radioCircle,
                    !isPushScale && styles.radioCircleActive,
                  ]}
                >
                  {!isPushScale && <View style={styles.radioDot} />}
                </View>
              </View>
              <Text style={styles.tileSubtitle}>传统黑幕，侧栏浮于主屏上方</Text>
            </View>
          </Pressable>
        </View>

        {isPushScale ? (
          <View style={styles.spatialSection}>
            <View style={styles.spatialHeaderRow}>
              <Text style={styles.sectionHeader}>空间透视角度（五档调节）</Text>
              <Text style={styles.spatialCurrentSpec}>
                {`倾角 ${activePresetConfig.tiltDeg}° · 缩放 ${Math.round(activePresetConfig.scale * 100)}%`}
              </Text>
            </View>

            <View style={styles.spatialCard}>
              <View style={styles.spatialPillsRow}>
                {AI_SIDEBAR_SPATIAL_PRESET_LIST.map((item) => {
                  const selected = item.key === spatialPreset;
                  return (
                    <Pressable
                      accessibilityLabel={`空间角度${item.shortLabel}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={item.key}
                      onPress={() => setSpatialPreset(item.key)}
                      style={[
                        styles.spatialPill,
                        selected ? styles.spatialPillActive : styles.spatialPillInactive,
                      ]}
                    >
                      <View style={styles.spatialPillTopRow}>
                        <Text
                          style={[
                            styles.spatialPillAngle,
                            selected && styles.spatialPillTextActive,
                          ]}
                        >
                          {`${item.tiltDeg}°`}
                        </Text>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.spatialPillLabel,
                          selected && styles.spatialPillTextActive,
                        ]}
                      >
                        {item.shortLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}

        {/* 经典态下的视觉与排版定制入口保留在外观设置 */}
        {profileStyleMode === 'classic' && onOpenChatAppearance ? (
          <View style={styles.categorySection}>
            <Text style={styles.sectionHeader}>聊天与气泡视觉</Text>
            <View style={styles.insetGroup}>
              <Pressable
                accessibilityLabel="聊天视觉定制"
                accessibilityRole="button"
                onPress={onOpenChatAppearance}
                style={({ pressed }) => [styles.entryRow, pressed && styles.entryRowPressed]}
              >
                <View style={styles.entryRowLeft}>
                  <View style={styles.entryIconWrap}>
                    <Ionicons color="#1A1C1C" name="chatbubble-ellipses-outline" size={20} />
                  </View>
                  <View style={styles.entryTextWrap}>
                    <Text style={styles.entryTitle}>聊天视觉与排版定制</Text>
                    <Text style={styles.entrySubtitle}>微信绿等7色色卡 · 双圆角滑杆 · 5档文本排版微调</Text>
                  </View>
                </View>
                <View style={styles.entryRowRight}>
                  <Ionicons color="#C4C7C7" name="chevron-forward" size={17} />
                </View>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* 我的页面风格切换：默认极简模式 */}
        <View style={styles.categorySection}>
          <Text style={styles.sectionHeader}>「我的」页面风格</Text>
          <View style={styles.selectorRow}>
            {/* 极简模式（默认） */}
            <Pressable
              accessibilityLabel="简约模式"
              accessibilityRole="radio"
              accessibilityState={{ checked: profileStyleMode === 'minimalist' }}
              onPress={() => setProfileStyleMode('minimalist')}
              style={[
                styles.styleModeTile,
                profileStyleMode === 'minimalist' ? styles.selectorTileActive : styles.selectorTileInactive,
              ]}
            >
              <View style={styles.styleModeHeader}>
                <Ionicons
                  color={profileStyleMode === 'minimalist' ? '#3B82F6' : '#64748B'}
                  name="list-outline"
                  size={20}
                />
                <View
                  style={[
                    styles.radioCircle,
                    profileStyleMode === 'minimalist' && styles.radioCircleActive,
                  ]}
                >
                  {profileStyleMode === 'minimalist' && <View style={styles.radioDot} />}
                </View>
              </View>
              <Text style={styles.styleModeTitle}>简约模式（默认）</Text>
              <Text style={styles.styleModeDesc}>纯净列表与统一黑白图标，10px 窄空行物理分隔</Text>
            </Pressable>

            {/* 经典模式 */}
            <Pressable
              accessibilityLabel="经典模式"
              accessibilityRole="radio"
              accessibilityState={{ checked: profileStyleMode === 'classic' }}
              onPress={() => setProfileStyleMode('classic')}
              style={[
                styles.styleModeTile,
                profileStyleMode === 'classic' ? styles.selectorTileActive : styles.selectorTileInactive,
              ]}
            >
              <View style={styles.styleModeHeader}>
                <Ionicons
                  color={profileStyleMode === 'classic' ? '#3B82F6' : '#64748B'}
                  name="apps-outline"
                  size={20}
                />
                <View
                  style={[
                    styles.radioCircle,
                    profileStyleMode === 'classic' && styles.radioCircleActive,
                  ]}
                >
                  {profileStyleMode === 'classic' && <View style={styles.radioDot} />}
                </View>
              </View>
              <Text style={styles.styleModeTitle}>经典模式</Text>
              <Text style={styles.styleModeDesc}>全彩大卡片、存储占用进度条与多维数据统计图表</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 0,
  },
  container: {
    // 10px vertical padding and gap match PerformanceSettingsScreen
    paddingVertical: 10,
    backgroundColor: '#F9F9F9',
    gap: rhythm.listCardGap,
  },
  sectionHeader: {
    ...typography.textStyles.caption,
    fontWeight: '600',
    color: colors.text.secondary,
    paddingHorizontal: spacing[3],
  },
  selectorRow: {
    flexDirection: 'row',
    marginHorizontal: spacing[2],
    // 10px gap matches PerformanceSettingsScreen dual-tile row
    gap: 10,
  },
  selectorTile: {
    flex: 1,
    backgroundColor: colors.background.surface,
    borderRadius: radius.md,
    padding: spacing[2],
    gap: spacing[2],
  },
  selectorTileActive: {
    // 2px active outline matches PerformanceSettingsScreen selector tiles
    borderWidth: 2,
    borderColor: colors.text.primary,
  },
  selectorTileInactive: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  miniScreenPushScale: {
    // 148px mini-screen preview height gives ample vertical breathing room for 3D perspective slant
    height: 148,
    backgroundColor: '#ECEEF1',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
  },
  miniScreenClassic: {
    // 148px mini-screen preview height matches PushScale
    height: 148,
    backgroundColor: '#F1F5F9',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    justifyContent: 'space-between',
    position: 'relative',
  },
  miniUnderlaySidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 92,
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
    gap: spacing[1.5],
    backgroundColor: 'transparent',
  },
  miniSearchPill: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    width: '92%',
  },
  miniSidebarActiveRow: {
    height: 14,
    borderRadius: radius.xs,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    paddingHorizontal: spacing[1],
    width: '92%',
  },
  miniSidebarActiveBar: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#3B82F6',
    width: '66%',
  },
  miniSidebarBar: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
    // 2px optical alignment with active row padding
    marginLeft: 2,
  },
  miniFloatingMainCardWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  miniLeftShadowBand: {
    position: 'absolute',
    left: -12,
    top: 14,
    bottom: 14,
    width: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.22)',
    borderRadius: radius.pill,
  },
  miniFloatingMainCard: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    justifyContent: 'space-between',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  miniSidebarIsland: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xs,
    padding: spacing[1],
    gap: 3.5,
    width: '92%',
  },
  miniPresetBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: radius.pill,
    zIndex: 10,
  },
  miniPresetBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: typography.family.mono,
  },
  miniWhiteVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
  },
  miniDarkScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
  },
  miniOverlayDrawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 88,
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: radius.sm,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
    gap: spacing[1.5],
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  miniHeader: {
    height: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: spacing[1.5],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  headerDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  miniCanvas: {
    flex: 1,
    paddingHorizontal: spacing[1.5],
    paddingTop: spacing[1.5],
    paddingBottom: spacing[1],
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarDot: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#94A3B8',
    marginRight: 5,
    marginTop: 2,
  },
  bubble: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 5,
    gap: 5,
    height: 46,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  skeletonBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#64748B',
  },
  mockInputBar: {
    height: 22,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  inputPill: {
    flex: 1,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  sendButton: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#0F172A',
  },
  tileFooter: {
    // 2px optical inset matches PerformanceSettingsScreen tileFooter
    paddingHorizontal: 2,
    gap: 3,
  },
  tileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileTitle: {
    ...typography.textStyles.caption,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  tileSubtitle: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
  },
  radioCircle: {
    width: spacing[4],
    height: spacing[4],
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: colors.text.primary,
  },
  radioDot: {
    width: spacing[2],
    height: spacing[2],
    borderRadius: radius.pill,
    backgroundColor: colors.text.primary,
  },
  spatialSection: {
    marginHorizontal: spacing[2],
    gap: 8,
    marginTop: 2,
  },
  spatialHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing[2],
  },
  spatialCurrentSpec: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  spatialCard: {
    backgroundColor: colors.background.surface,
    borderRadius: radius.md,
    padding: spacing[3],
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  spatialPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  spatialPill: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
  },
  spatialPillActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#3B82F6',
  },
  spatialPillInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  spatialPillTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  spatialPillAngle: {
    ...typography.textStyles.caption,
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text.primary,
  },
  spatialPillLabel: {
    ...typography.textStyles.micro,
    fontSize: 9.5,
    color: colors.text.secondary,
  },
  spatialPillTextActive: {
    color: '#2563EB',
  },
  categorySection: {
    gap: rhythm.listCardGap,
    marginTop: 6,
  },
  insetGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    minHeight: 56,
    backgroundColor: '#FFFFFF',
  },
  entryRowPressed: {
    backgroundColor: '#F3F3F4',
  },
  entryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing[3],
  },
  entryIconWrap: {
    width: 28,
    alignItems: 'center',
  },
  entryTextWrap: {
    flex: 1,
    paddingVertical: 10,
  },
  entryTitle: {
    ...typography.textStyles.body,
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1C1C',
  },
  entrySubtitle: {
    ...typography.textStyles.caption,
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  entryRowRight: {
    marginLeft: spacing[2],
  },
  styleModeTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing[3],
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  styleModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  styleModeTitle: {
    ...typography.textStyles.body,
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 2,
  },
  styleModeDesc: {
    ...typography.textStyles.caption,
    fontSize: 11,
    color: colors.text.secondary,
    lineHeight: 15,
  },
});
