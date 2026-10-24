import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { SystemTaskSnapshot } from '../../ai/systemAssistant/systemAssistantTypes';
import {
  getSystemProgressRows,
  getSystemProgressState,
  getSystemProgressSummary,
  shouldShowSystemProgress,
  type SystemProgressRow,
} from '../../ai/systemAssistant/systemAssistantPresentation';
import { metrics, radius, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface SystemAssistantProgressProps {
  task?: SystemTaskSnapshot | null;
  messageStatus: string;
  hasAnswer: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

function SmoothSpinner({ size = 14, color = aiLightColors.primaryActive }: { size?: number; color?: string }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.spinnerNode, animatedStyle]}>
      <Ionicons color={color} name="sync-outline" size={size} />
    </Animated.View>
  );
}

function StepNode({ tone, busy }: { tone: SystemProgressRow['tone']; busy: boolean }) {
  if (busy) {
    return (
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.nodeWrapper}>
        <SmoothSpinner color={aiLightColors.primaryActive} size={13} />
      </Animated.View>
    );
  }

  if (tone === 'success') {
    return (
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={[styles.badgeNode, styles.successBadge]}>
        <Ionicons color="#059669" name="checkmark" size={10} />
      </Animated.View>
    );
  }

  if (tone === 'danger') {
    return (
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={[styles.badgeNode, styles.dangerBadge]}>
        <Ionicons color="#DC2626" name="close" size={10} />
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={[styles.badgeNode, styles.neutralBadge]}>
      <View style={styles.neutralDot} />
    </Animated.View>
  );
}

function HeaderNode({ tone, busy }: { tone: string; busy: boolean }) {
  if (busy) {
    return (
      <View style={styles.headerIconWrapper}>
        <SmoothSpinner color={aiLightColors.primaryActive} size={14} />
      </View>
    );
  }

  if (tone === 'success') {
    return (
      <Animated.View entering={FadeIn.duration(180)} style={[styles.headerIconWrapper, styles.headerSuccessWrapper]}>
        <Ionicons color="#059669" name="checkmark-circle" size={16} />
      </Animated.View>
    );
  }

  if (tone === 'danger') {
    return (
      <Animated.View entering={FadeIn.duration(180)} style={[styles.headerIconWrapper, styles.headerDangerWrapper]}>
        <Ionicons color="#DC2626" name="close-circle" size={16} />
      </Animated.View>
    );
  }

  return (
    <View style={styles.headerIconWrapper}>
      <Ionicons color={aiLightColors.mutedReadable} name="ellipse-outline" size={15} />
    </View>
  );
}

export function SystemAssistantProgress({
  task,
  messageStatus,
  hasAnswer,
  defaultExpanded = false,
  onExpandedChange,
}: SystemAssistantProgressProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const chevronRotation = useSharedValue(expanded ? 180 : 0);

  useEffect(() => {
    chevronRotation.value = withTiming(expanded ? 180 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, chevronRotation]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  if (!shouldShowSystemProgress(task)) return null;

  const state = getSystemProgressState(task, messageStatus, hasAnswer);
  const rows = getSystemProgressRows(task, state);
  const summary = getSystemProgressSummary(task, state, rows);

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    onExpandedChange?.(next);
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel={summary.title}
        accessibilityRole="button"
        accessibilityState={{ expanded, busy: state.busy }}
        onPress={handleToggle}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerLeft}>
          <HeaderNode busy={summary.busy} tone={summary.tone} />
          <Text numberOfLines={1} style={styles.headerTitle}>
            {summary.title}
          </Text>
          {summary.badge ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{summary.badge}</Text>
            </View>
          ) : null}
        </View>

        <Animated.View style={[styles.chevronBox, chevronStyle]}>
          <Ionicons color={aiLightColors.muted} name="chevron-down" size={14} />
        </Animated.View>
      </Pressable>

      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          layout={LinearTransition.springify().damping(18).stiffness(200)}
          style={styles.stepsContainer}
        >
          <View style={styles.divider} />
          <View accessibilityLiveRegion="polite" style={styles.stepsList}>
            {rows.map((row, index) => {
              const isLast = index === rows.length - 1;
              const nextRow = rows[index + 1];
              const isTrackCompleted = row.tone === 'success' && nextRow?.tone === 'success';

              return (
                <Animated.View
                  entering={FadeInDown.delay(index * 35).duration(180)}
                  key={`${index}:${row.label}`}
                  style={styles.stepRow}
                >
                  <View style={styles.trackColumn}>
                    {!isLast ? (
                      <View
                        style={[
                          styles.connector,
                          isTrackCompleted && styles.connectorCompleted,
                        ]}
                      />
                    ) : null}
                    <StepNode busy={row.busy} tone={row.tone} />
                  </View>
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.stepLabel,
                      row.busy && styles.stepLabelBusy,
                      row.tone === 'danger' && styles.stepLabelDanger,
                    ]}
                  >
                    {row.label}
                  </Text>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: spacing[1],
    minWidth: 0,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
  },
  headerLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing[1.5],
    minWidth: 0,
  },
  headerIconWrapper: {
    alignItems: 'center',
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  headerSuccessWrapper: {},
  headerDangerWrapper: {},
  headerTitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  headerBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.045)',
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },
  headerBadgeText: {
    ...typography.textStyles.micro,
    color: aiLightColors.mutedReadable,
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 14,
  },
  chevronBox: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  divider: {
    backgroundColor: aiLightColors.hairline,
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing[3],
  },
  stepsContainer: {
    alignSelf: 'stretch',
    paddingBottom: spacing[2],
  },
  stepsList: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
  },
  stepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 28,
  },
  trackColumn: {
    alignItems: 'center',
    alignSelf: 'stretch',
    width: 16,
  },
  connector: {
    backgroundColor: aiLightColors.hairline,
    bottom: -2,
    left: 7.5,
    position: 'absolute',
    top: 14,
    width: StyleSheet.hairlineWidth * 1.5,
  },
  connectorCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.45)',
  },
  nodeWrapper: {
    alignItems: 'center',
    height: 16,
    justifyContent: 'center',
    width: 16,
  },
  spinnerNode: {
    alignItems: 'center',
    height: 16,
    justifyContent: 'center',
    width: 16,
  },
  badgeNode: {
    alignItems: 'center',
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    marginTop: 1,
    width: 16,
  },
  successBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.28)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  dangerBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.28)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  neutralBadge: {
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderWidth: StyleSheet.hairlineWidth * 1.5,
  },
  neutralDot: {
    backgroundColor: aiLightColors.mutedSoft,
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  stepLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.mutedReadable,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    minWidth: 0,
    paddingBottom: spacing[1.5],
  },
  stepLabelBusy: {
    color: aiLightColors.ink,
    fontWeight: '500',
  },
  stepLabelDanger: {
    color: '#DC2626',
  },
  pressed: {
    opacity: 0.72,
  },
});
