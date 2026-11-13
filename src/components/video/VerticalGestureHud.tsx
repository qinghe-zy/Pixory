import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../design/tokens';
import {
  clampGestureValue,
  formatVerticalGesturePercent,
  getVerticalGestureIconName,
  type VerticalGestureKind,
} from '../../media/videoVerticalGesture';

export interface VerticalGestureHudProps {
  kind: VerticalGestureKind | null;
  value: number;
  visible: boolean;
  leftInset: number;
  rightInset: number;
}

const PILL_SLIDE_OFFSET_PX = 8;

/**
 * Minimalist edge-anchored vertical slider pill for brightness (left) and volume (right).
 * Displays only a crisp icon, fill bar, and numeric percentage wrapped in a hairline frame.
 */
export function VerticalGestureHud({
  kind,
  value,
  visible,
  leftInset,
  rightInset,
}: VerticalGestureHudProps) {
  const isShown = visible && kind !== null;
  const [isExiting, setIsExiting] = useState(false);
  const lastSnapshotRef = useRef<{
    kind: VerticalGestureKind;
    value: number;
  } | null>(null);
  if (isShown && kind) {
    lastSnapshotRef.current = { kind, value };
  }

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    if (isShown) {
      setIsExiting(false);
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!lastSnapshotRef.current) {
      return;
    }
    setIsExiting(true);
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.94,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        lastSnapshotRef.current = null;
        setIsExiting(false);
      }
    });
  }, [isShown, opacityAnim, scaleAnim]);

  const activeKind = isShown ? kind : isExiting ? lastSnapshotRef.current?.kind ?? null : null;
  if (!activeKind) {
    return null;
  }

  const activeValue = clampGestureValue(
    isShown ? value : lastSnapshotRef.current?.value ?? 0,
  );
  const isBrightness = activeKind === 'brightness';
  const isMutedOrZero = !isBrightness && activeValue <= 0.01;
  const edgeAnchorStyle = isBrightness
    ? { left: leftInset + spacing[3] }
    : { right: rightInset + spacing[3] };
  const slideTranslateX = opacityAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isBrightness ? -PILL_SLIDE_OFFSET_PX : PILL_SLIDE_OFFSET_PX, 0],
  });

  return (
    <View pointerEvents="none" style={[styles.anchorWrap, edgeAnchorStyle]}>
      <Animated.View
        style={[
          styles.pill,
          {
            opacity: opacityAnim,
            transform: [{ translateX: slideTranslateX }, { scale: scaleAnim }],
          },
        ]}
      >
        <Text style={styles.percentText}>
          {formatVerticalGesturePercent(activeValue)}
        </Text>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              isMutedOrZero && styles.fillMuted,
              { height: `${Math.round(activeValue * 100)}%` },
            ]}
          />
        </View>
        <Ionicons
          color={isMutedOrZero ? 'rgba(255,255,255,0.62)' : colors.text.inverse}
          name={getVerticalGestureIconName(activeKind, activeValue)}
          size={15}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchorWrap: {
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    zIndex: 25,
  },
  pill: {
    alignItems: 'center',
    // Translucent dark theater glass has no equivalent in light-mode colors.ts.
    backgroundColor: 'rgba(12, 15, 13, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: spacing[2],
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[3],
    shadowColor: colors.primary.dark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    // Slim 38dp edge capsule avoids encroaching on centered video subject.
    width: 38,
  },
  percentText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  track: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: radius.pill,
    // Fixed vertical slider track height inside the slim capsule.
    height: 82,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: 3,
  },
  fill: {
    backgroundColor: colors.text.inverse,
    borderRadius: radius.pill,
    width: '100%',
  },
  fillMuted: {
    backgroundColor: 'rgba(255, 255, 255, 0.52)',
  },
});
