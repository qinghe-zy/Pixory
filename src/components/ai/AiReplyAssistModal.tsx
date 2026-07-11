import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { radius, shadows, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

const SHEET_HEIGHT = 456;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface AiReplyAssistModalProps {
  visible: boolean;
  mode: 'short' | 'long';
  pages: string[][];
  pageIndex: number;
  loading?: boolean;
  errorMessage?: string | null;
  bottomInset?: number;
  onClose: () => void;
  onRefresh: () => void;
  onSelectSuggestion: (suggestion: string) => void;
  onSetMode: (mode: 'short' | 'long') => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}

export function AiReplyAssistModal({
  visible,
  mode,
  pages,
  pageIndex,
  loading = false,
  errorMessage = null,
  bottomInset = 0,
  onClose,
  onRefresh,
  onSelectSuggestion,
  onSetMode,
  onPreviousPage,
  onNextPage,
}: AiReplyAssistModalProps) {
  const totalPages = Math.max(1, pages.length);
  const safePageIndex = Math.min(Math.max(pageIndex, 0), totalPages - 1);
  const activePage = pages[safePageIndex] ?? [];
  const pageLabel = `${safePageIndex + 1}/${totalPages}`;
  const canGoPrevious = safePageIndex > 0;
  const canGoNext = safePageIndex < totalPages - 1;

  // Animation for loading state
  const loadingOpacity = useSharedValue(0.3);
  useEffect(() => {
    if (loading) {
      loadingOpacity.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 600 }),
          withTiming(0.3, { duration: 600 })
        ),
        -1,
        true
      );
    } else {
      loadingOpacity.value = withTiming(0, { duration: 50 }); // Fast exit to reveal text instantly
    }
  }, [loading, loadingOpacity]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: loadingOpacity.value,
  }));

  // Haptics & Refresh Animation
  const refreshRotation = useSharedValue(0);

  useEffect(() => {
    if (loading) {
      // Spin continuously while loading
      refreshRotation.value = withRepeat(
        withTiming(refreshRotation.value + 360, { duration: 700, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      // Gracefully finish the current spin and stop
      cancelAnimation(refreshRotation);
      const remainder = refreshRotation.value % 360;
      if (remainder > 0) {
        refreshRotation.value = withTiming(
          refreshRotation.value + (360 - remainder),
          { duration: 250, easing: Easing.out(Easing.quad) }
        );
      }
    }
  }, [loading, refreshRotation]);

  const handleRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRefresh(); // Triggers loading=true in parent
  };

  const refreshIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${refreshRotation.value}deg` }],
  }));

  const handleSetMode = (newMode: 'short' | 'long') => {
    if (newMode !== mode) {
      Haptics.selectionAsync();
      onSetMode(newMode);
    }
  };

  const handlePrevPage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPreviousPage();
  };

  const handleNextPage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onNextPage();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <BlurView intensity={85} style={[styles.sheet, { marginBottom: Math.max(bottomInset, spacing[3]) }]} tint="light">

          {/* Ambient Smooth Wash using brand blue */}
          <LinearGradient
            colors={['rgba(91, 156, 246, 0.1)', 'rgba(255, 255, 255, 0)']}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            start={{ x: 0, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Top accent strip — gradient bar at the very top of the sheet */}
          <LinearGradient
            colors={[aiLightColors.primaryActive, aiLightColors.primary]}
            end={{ x: 1, y: 0 }}
            pointerEvents="none"
            start={{ x: 0, y: 0 }}
            style={styles.sheetAccentStrip}
          />

          <View style={styles.handle} />

          {/* ── Header ── */}
          <View style={styles.header}>
            {/* Left Column: Label */}
            <View style={styles.headerLeft}>
              <View style={[styles.glassButton, styles.labelGlass]}>
                <Ionicons color={aiLightColors.primary} name="sparkles-outline" size={13} />
                <Text style={styles.headerLabelText}>AI 帮答</Text>
              </View>
            </View>

            {/* Center Column: Mode switch */}
            <View style={styles.headerCenter}>
              <View style={styles.modeSwitchTrack}>
                <Pressable
                  accessibilityLabel="切换到短句帮答"
                  accessibilityRole="button"
                  onPress={() => handleSetMode('short')}
                  style={({ pressed }) => [
                    styles.modeButton,
                    mode === 'short' && styles.modeButtonActive,
                    pressed && !mode && styles.pressed,
                  ]}
                >
                  <Text style={[styles.modeButtonText, mode === 'short' && styles.modeButtonTextActive]}>短句</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="切换到长句帮答"
                  accessibilityRole="button"
                  onPress={() => handleSetMode('long')}
                  style={({ pressed }) => [
                    styles.modeButton,
                    mode === 'long' && styles.modeButtonActive,
                    pressed && !mode && styles.pressed,
                  ]}
                >
                  <Text style={[styles.modeButtonText, mode === 'long' && styles.modeButtonTextActive]}>长句</Text>
                </Pressable>
              </View>
            </View>

            {/* Right Column: Refresh + Close */}
            <View style={styles.headerRight}>
              <Pressable
                accessibilityLabel="刷新帮答候选"
                accessibilityRole="button"
                disabled={loading}
                onPress={handleRefresh}
                style={({ pressed }) => [
                  styles.glassButton,
                  styles.iconButton,
                  loading && styles.disabled,
                  pressed && !loading && styles.pressed,
                ]}
              >
                <Animated.View style={refreshIconStyle}>
                  <Ionicons color={aiLightColors.primary} name="refresh-outline" size={16} />
                </Animated.View>
              </Pressable>

              <Pressable
                accessibilityLabel="关闭帮答"
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [styles.glassButton, styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color={aiLightColors.muted} name="close" size={16} />
              </Pressable>
            </View>
          </View>

          {/* ── Card list ── */}
          <View style={styles.body}>
            {Array.from({ length: mode === 'short' ? 3 : 1 }, (_, index) => {
              const suggestion = activePage[index] ?? '';
              return (
                <SuggestionCard
                  index={index}
                  key={`${mode}-${safePageIndex}-${index}`}
                  mode={mode}
                  onSelect={onSelectSuggestion}
                  suggestion={suggestion}
                />
              );
            })}

            <Animated.View pointerEvents={loading ? 'auto' : 'none'} style={[styles.loadingOverlay, shimmerStyle]}>
              <View style={styles.loadingShimmerBar} />
              <View style={[styles.loadingShimmerBar, { width: '60%' }]} />
              {mode === 'short' && (
                <>
                  <View style={[styles.loadingShimmerBar, { marginTop: spacing[4] }]} />
                  <View style={[styles.loadingShimmerBar, { width: '40%' }]} />
                </>
              )}
            </Animated.View>
          </View>

          {/* ── Footer pagination ── */}
          <View style={styles.footer}>
            <Pressable
              accessibilityLabel="上一页帮答候选"
              accessibilityRole="button"
              disabled={!canGoPrevious}
              onPress={handlePrevPage}
              style={({ pressed }) => [
                styles.navButton,
                !canGoPrevious && styles.disabled,
                pressed && canGoPrevious && styles.pressed,
              ]}
            >
              <Ionicons
                color={canGoPrevious ? aiLightColors.ink : aiLightColors.mutedSoft}
                name="chevron-back"
                size={16}
              />
            </Pressable>

            <View style={styles.pageLabelWrap}>
              <Text style={styles.pageLabel}>{pageLabel}</Text>
            </View>

            <Pressable
              accessibilityLabel="下一页帮答候选"
              accessibilityRole="button"
              disabled={!canGoNext}
              onPress={handleNextPage}
              style={({ pressed }) => [
                styles.navButton,
                !canGoNext && styles.disabled,
                pressed && canGoNext && styles.pressed,
              ]}
            >
              <Ionicons
                color={canGoNext ? aiLightColors.ink : aiLightColors.mutedSoft}
                name="chevron-forward"
                size={16}
              />
            </Pressable>
          </View>

          {errorMessage ? (
            <Text numberOfLines={1} style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : null}
        </BlurView>
      </View>
    </Modal>
  );
}

// ── Subcomponents ──

function SuggestionCard({
  suggestion,
  mode,
  index,
  onSelect,
}: {
  suggestion: string;
  mode: 'short' | 'long';
  index: number;
  onSelect: (s: string) => void;
}) {
  const isPlaceholder = !suggestion;
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!isPlaceholder) {
      scale.value = withTiming(0.97, { duration: 100 });
    }
  };

  const handlePressOut = () => {
    if (!isPlaceholder) {
      scale.value = withTiming(1, { duration: 150 });
    }
  };

  const handlePress = () => {
    if (!isPlaceholder) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSelect(suggestion);
    }
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      disabled={isPlaceholder}
      entering={FadeInUp.delay(index * 60).springify().damping(16).stiffness(200)}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.cardContainer,
        mode === 'long' ? styles.longCardContainer : styles.shortCardContainer,
        isPlaceholder && styles.cardPlaceholder,
        animatedStyle,
      ]}
    >
      <View style={styles.cardGlass}>
        {/* Left accent bar */}
        <LinearGradient
          colors={isPlaceholder ? [aiLightColors.mutedSoft, aiLightColors.mutedSoft] : [aiLightColors.primaryActive, aiLightColors.primary]}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
          start={{ x: 0, y: 0 }}
          style={[styles.cardAccentBar, isPlaceholder && styles.cardAccentBarPlaceholder]}
        />

        {/* Content row: text + forward arrow */}
        <View style={[styles.cardContent, mode === 'long' && styles.cardContentLong]}>
          <Text
            numberOfLines={mode === 'short' ? 2 : 6}
            style={[styles.cardText, isPlaceholder && styles.placeholderText]}
          >
            {suggestion || ' '}
          </Text>
          {!isPlaceholder && (
            <Ionicons color={aiLightColors.mutedSoft} name="arrow-forward" size={14} style={styles.cardArrow} />
          )}
        </View>
      </View>
    </AnimatedPressable>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(28, 28, 30, 0.28)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    alignSelf: 'stretch',
    backgroundColor: aiLightColors.cardWash,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    height: SHEET_HEIGHT,
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    ...shadows.floating,
    overflow: 'hidden', // Contain the ambient wash
  },

  /* Top 3px accent stripe — gives the sheet a branded top edge */
  sheetAccentStrip: {
    backgroundColor: aiLightColors.primary,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    height: 3,
    left: 0,
    opacity: 0.85,
    position: 'absolute',
    right: 0,
    top: 0,
  },

  handle: {
    alignSelf: 'center',
    backgroundColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    height: 4,
    marginBottom: spacing[2],
    marginTop: spacing[1],
    width: 40,
  },

  /* ── Header ── */
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: spacing[10],
    marginBottom: spacing[1],
  },
  headerLeft: {
    flex: 1,
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing[2],
  },

  /* Base Glass Button Texture for Protruding Items */
  glassButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 1)', // Stronger top highlight
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.6)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0, 0, 0, 0.12)', // Darker and thicker bottom edge
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },

  labelGlass: {
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    height: 32,
  },
  headerLabelText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primary,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  /* Mode switch — Recessed Track */
  modeSwitchTrack: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)', // Darker cavity
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(0, 0, 0, 0.06)', // Dark inner shadow at top
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0, 0, 0, 0.02)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(0, 0, 0, 0.02)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.7)', // Light catching the bottom lip
    borderRadius: radius.pill,
    flexDirection: 'row',
    padding: 2,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 48,
    paddingHorizontal: spacing[3],
  },
  modeButtonActive: {
    /* Protruding Pill inside the Track */
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1, // Safe here because opacity is 0.9 (mostly solid)
  },
  modeButtonText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: aiLightColors.ink,
  },

  /* Icon buttons (refresh / close) */
  iconButton: {
    height: 32,
    width: 32,
  },

  /* ── Card list ── */
  body: {
    flex: 1,
    gap: spacing[2],
    justifyContent: 'center',
    paddingTop: spacing[1],
    position: 'relative',
  },
  cardContainer: {
    /* Shadow and container spacing */
    backgroundColor: 'transparent',
    borderRadius: radius.xl,
  },
  cardGlass: {
    /* Glassmorphism card body - Thicker frost for readability */
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    /* Apple-style Bevel & Thickness */
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 1)', // Stronger top highlight
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.6)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0, 0, 0, 0.12)', // Darker, thicker 3px bottom edge for obvious volume
    borderRadius: radius.xl,
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingLeft: 26,
    paddingRight: spacing[4],
    paddingVertical: spacing[3],
  },
  shortCardContainer: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 0,
  },
  longCardContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    minHeight: 0,
  },
  cardPlaceholder: {
    opacity: 0.45,
  },

  /* 3px vertical accent bar on the left edge of each card */
  cardAccentBar: {
    backgroundColor: aiLightColors.primary,
    borderRadius: radius.pill,
    bottom: spacing[3],
    left: spacing[3],
    opacity: 0.6,
    position: 'absolute',
    top: spacing[3],
    width: 3,
  },
  cardAccentBarPlaceholder: {
    backgroundColor: aiLightColors.mutedSoft,
    opacity: 0.4,
  },

  /* Inner row: text + trailing arrow */
  cardContent: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  cardContentLong: {
    alignItems: 'flex-start',
  },
  cardText: {
    ...typography.textStyles.body,
    color: aiLightColors.ink,
    flex: 1,
    lineHeight: 24,
  },
  cardArrow: {
    marginLeft: spacing[2],
  },
  placeholderText: {
    color: aiLightColors.mutedSoft,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: radius.xl,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
    zIndex: 10,
  },
  loadingShimmerBar: {
    backgroundColor: aiLightColors.primarySoft,
    borderRadius: radius.pill,
    height: 14,
    marginBottom: spacing[2],
    width: '85%',
  },

  /* ── Footer pagination ── */
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  /* Nav chevron buttons — given a circle background for clear affordance */
  navButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    height: spacing[8],
    justifyContent: 'center',
    width: spacing[8],
  },
  pageLabelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    paddingHorizontal: spacing[2],
  },
  pageLabel: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: '600',
    textAlign: 'center',
  },

  errorText: {
    ...typography.textStyles.micro,
    color: aiLightColors.muted,
    marginTop: spacing[1],
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.36,
  },
  pressed: {
    opacity: 0.75,
  },
});
