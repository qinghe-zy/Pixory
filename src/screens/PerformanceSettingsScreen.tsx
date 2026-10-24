import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenScaffold } from '../components/ScreenScaffold';
import type { PixorySpace } from '../database';
import { colors, spacing, typography } from '../design/tokens';
import {
  useAiHistoryLongMessageFoldingPreference,
  useAiStreamingPacingPreference,
} from '../services/aiChatPreferences';

interface PerformanceSettingsScreenProps {
  onBack: () => void;
  space: PixorySpace;
}

/** 连续平滑推流：从完全空白开始，文字行平稳、不闪烁、一行一行向上滑动升入，无预设底轨 */
function SmoothStreamingSkeletonPreview() {
  const animY = useRef(new Animated.Value(48)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    // 4 行骨架线从底部一行一行平稳向上滑动进入，目标位移依次为 36 -> 24 -> 12 -> 0
    const TARGET_STEPS = [36, 24, 12, 0];

    const runCycle = () => {
      if (cancelled) return;
      animY.setValue(48);
      fadeAnim.setValue(1);

      let step = 0;

      const slideNextLine = () => {
        if (cancelled) return;
        if (step >= TARGET_STEPS.length) {
          // 全部 4 行滑动就位，停留 1.6 秒后平滑淡出重播
          timer = setTimeout(() => {
            if (cancelled) return;
            Animated.timing(fadeAnim, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              if (cancelled) return;
              timer = setTimeout(runCycle, 240);
            });
          }, 1600);
          return;
        }

        const targetY = TARGET_STEPS[step];
        step += 1;

        Animated.timing(animY, {
          toValue: targetY,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          if (cancelled) return;
          timer = setTimeout(slideNextLine, 260);
        });
      };

      timer = setTimeout(slideNextLine, 140);
    };

    runCycle();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [animY, fadeAnim]);

  return (
    <View style={styles.miniScreen}>
      {/* 迷你顶栏 */}
      <View style={styles.miniHeader}>
        <View style={styles.headerDot} />
        <View style={styles.headerDot} />
        <View style={styles.headerDot} />
      </View>

      {/* 迷你聊天内容区：不闪烁，从空开始一行一行平稳向上滑动 */}
      <View style={styles.miniCanvas}>
        <View style={styles.avatarDot} />
        <View style={styles.bubble}>
          <Animated.View
            style={[
              styles.slidingTrack,
              { opacity: fadeAnim, transform: [{ translateY: animY }] },
            ]}
          >
            <View style={[styles.lineSlot, { width: '75%' }]}>
              <View style={styles.skeletonBar} />
            </View>
            <View style={[styles.lineSlot, { width: '100%' }]}>
              <View style={styles.skeletonBar} />
            </View>
            <View style={[styles.lineSlot, { width: '100%' }]}>
              <View style={styles.skeletonBar} />
            </View>
            <View style={[styles.lineSlot, { width: '100%' }]}>
              <View style={styles.skeletonBar} />
            </View>
          </Animated.View>
        </View>
      </View>

      {/* 迷你输入框模拟 */}
      <View style={styles.mockInputBar}>
        <View style={styles.inputPill} />
        <View style={styles.sendButton} />
      </View>
    </View>
  );
}

const TYPEWRITER_BURSTS = [
  // Line 1 (目标 75%)
  { line: 1, width: 35, delay: 90 },
  { line: 1, width: 75, delay: 100 },
  // Line 2 (目标 100%)
  { line: 2, width: 35, delay: 90 },
  { line: 2, width: 70, delay: 85 },
  { line: 2, width: 100, delay: 100 },
  // Line 3 (目标 100%)
  { line: 3, width: 40, delay: 90 },
  { line: 3, width: 75, delay: 85 },
  { line: 3, width: 100, delay: 100 },
  // Line 4 (目标 100%)
  { line: 4, width: 45, delay: 90 },
  { line: 4, width: 80, delay: 85 },
  { line: 4, width: 100, delay: 110 },
];

/** 机械打字机：从空开始，一节一节在行内横向蹦跳长出，无光标，无预设底轨 */
function TypewriterSkeletonPreview() {
  const [stepIndex, setStepIndex] = useState(-1);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let currentStep = -1;

    const tick = () => {
      if (cancelled) return;
      currentStep += 1;
      if (currentStep >= TYPEWRITER_BURSTS.length) {
        // 完成后停留 1.6 秒淡出并重播
        timer = setTimeout(() => {
          if (cancelled) return;
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            if (cancelled) return;
            currentStep = -1;
            setStepIndex(-1);
            fadeAnim.setValue(1);
            timer = setTimeout(tick, 220);
          });
        }, 1600);
        return;
      }
      setStepIndex(currentStep);
      const delay = TYPEWRITER_BURSTS[currentStep].delay;
      timer = setTimeout(tick, delay);
    };

    timer = setTimeout(tick, 120);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fadeAnim]);

  const activeBurst = stepIndex >= 0 ? TYPEWRITER_BURSTS[stepIndex] : null;
  const activeLine = activeBurst ? activeBurst.line : 1;
  const activeWidth = activeBurst ? activeBurst.width : 0;

  const line1 = activeLine > 1 ? 75 : (activeLine === 1 ? activeWidth : 0);
  const line2 = activeLine > 2 ? 100 : (activeLine === 2 ? activeWidth : 0);
  const line3 = activeLine > 3 ? 100 : (activeLine === 3 ? activeWidth : 0);
  const line4 = activeLine === 4 ? activeWidth : 0;

  return (
    <View style={styles.miniScreen}>
      {/* 迷你顶栏 */}
      <View style={styles.miniHeader}>
        <View style={styles.headerDot} />
        <View style={styles.headerDot} />
        <View style={styles.headerDot} />
      </View>

      {/* 迷你聊天气泡内容区：一节一节蹦跳，已彻底移除光标，纯透明无预设底轨 */}
      <View style={styles.miniCanvas}>
        <View style={styles.avatarDot} />
        <Animated.View style={[styles.bubble, { opacity: fadeAnim }]}>
          <View style={[styles.lineSlot, { width: '75%' }]}>
            {line1 > 0 && <View style={[styles.skeletonBar, { width: `${line1}%` }]} />}
          </View>
          <View style={[styles.lineSlot, { width: '100%' }]}>
            {line2 > 0 && <View style={[styles.skeletonBar, { width: `${line2}%` }]} />}
          </View>
          <View style={[styles.lineSlot, { width: '100%' }]}>
            {line3 > 0 && <View style={[styles.skeletonBar, { width: `${line3}%` }]} />}
          </View>
          <View style={[styles.lineSlot, { width: '100%' }]}>
            {line4 > 0 && <View style={[styles.skeletonBar, { width: `${line4}%` }]} />}
          </View>
        </Animated.View>
      </View>

      {/* 迷你输入框模拟 */}
      <View style={styles.mockInputBar}>
        <View style={styles.inputPill} />
        <View style={styles.sendButton} />
      </View>
    </View>
  );
}

export function PerformanceSettingsScreen({ onBack, space }: PerformanceSettingsScreenProps) {
  const [foldingEnabled, setFoldingEnabled] = useAiHistoryLongMessageFoldingPreference(space);
  const [pacingMode, setPacingMode] = useAiStreamingPacingPreference(space);
  const isContinuousStreaming = pacingMode === 'continuous';

  return (
    <ScreenScaffold
      contentContainerStyle={styles.scrollContent}
      onBack={onBack}
      scrollable
      title="性能设置"
    >
      <View style={styles.container}>
        {/* 顶部标题 */}
        <Text style={styles.sectionHeader}>流式输出呈现</Text>

        {/* 左右并列双选竖向卡片 */}
        <View style={styles.selectorRow}>
          {/* 左卡片：连续平滑推流 */}
          <Pressable
            accessibilityLabel="连续平滑推流模式"
            accessibilityRole="radio"
            accessibilityState={{ checked: isContinuousStreaming }}
            onPress={() => setPacingMode('continuous')}
            style={[
              styles.selectorTile,
              isContinuousStreaming ? styles.selectorTileActive : styles.selectorTileInactive,
            ]}
          >
            <SmoothStreamingSkeletonPreview />
            <View style={styles.tileFooter}>
              <View style={styles.tileHeaderRow}>
                <Text style={styles.tileTitle}>连续平滑推流</Text>
                <View
                  style={[
                    styles.radioCircle,
                    isContinuousStreaming && styles.radioCircleActive,
                  ]}
                >
                  {isContinuousStreaming && <View style={styles.radioDot} />}
                </View>
              </View>
              <Text style={styles.tileSubtitle}>一行一行匀速上滑</Text>
            </View>
          </Pressable>

          {/* 右卡片：经典机械打字机 */}
          <Pressable
            accessibilityLabel="机械打字机模式"
            accessibilityRole="radio"
            accessibilityState={{ checked: !isContinuousStreaming }}
            onPress={() => setPacingMode('typewriter')}
            style={[
              styles.selectorTile,
              !isContinuousStreaming ? styles.selectorTileActive : styles.selectorTileInactive,
            ]}
          >
            <TypewriterSkeletonPreview />
            <View style={styles.tileFooter}>
              <View style={styles.tileHeaderRow}>
                <Text style={styles.tileTitle}>经典机械打字机</Text>
                <View
                  style={[
                    styles.radioCircle,
                    !isContinuousStreaming && styles.radioCircleActive,
                  ]}
                >
                  {!isContinuousStreaming && <View style={styles.radioDot} />}
                </View>
              </View>
              <Text style={styles.tileSubtitle}>一节一节突发蹦跳</Text>
            </View>
          </Pressable>
        </View>

        {/* 下方通用排版优化设置 */}
        <Text style={[styles.sectionHeader, { marginTop: 4 }]}>排版优化</Text>
        <View style={styles.insetListGroup}>
          <View style={styles.fullWidthListGroup}>
            <View style={[styles.fullWidthRow, styles.lastRow]}>
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>历史长消息智能折叠</Text>
                <Text style={styles.rowDescription}>
                  历史记录中超长富文本消息自动折叠，保持列表极速流畅
                </Text>
              </View>
              <Switch
                accessibilityLabel="历史长消息智能折叠"
                onValueChange={setFoldingEnabled}
                thumbColor="#FFFFFF"
                trackColor={{ false: colors.border.subtle, true: '#1A1C1C' }}
                value={foldingEnabled}
              />
            </View>
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
    paddingVertical: 10,
    backgroundColor: '#F9F9F9',
    gap: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717A',
    paddingHorizontal: 12,
  },
  selectorRow: {
    flexDirection: 'row',
    marginHorizontal: 8,
    gap: 10,
  },
  selectorTile: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    gap: 8,
  },
  selectorTileActive: {
    borderWidth: 2,
    borderColor: '#18181B',
  },
  selectorTileInactive: {
    borderWidth: 1,
    borderColor: '#E4E4E7',
  },
  miniScreen: {
    height: 116,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  miniHeader: {
    height: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 6,
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
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 4,
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
    height: 53,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  slidingTrack: {
    gap: 5,
  },
  lineSlot: {
    height: 7,
    position: 'relative',
    justifyContent: 'center',
  },
  skeletonBar: {
    width: '100%',
    height: 7,
    borderRadius: 3.5,
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
    gap: 4,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileFooter: {
    paddingHorizontal: 2,
    gap: 3,
  },
  tileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181B',
  },
  tileSubtitle: {
    fontSize: 11,
    color: '#71717A',
  },
  radioCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D4D4D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#18181B',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#18181B',
  },
  insetListGroup: {
    marginHorizontal: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  fullWidthListGroup: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  fullWidthRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  rowContent: {
    flex: 1,
    marginRight: spacing[3],
    gap: 2,
  },
  rowTitle: {
    ...typography.textStyles.body,
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1C1C',
  },
  rowDescription: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
});
