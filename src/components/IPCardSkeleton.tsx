import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export function IPCardSkeleton() {
  const shimmerProgress = useRef(new Animated.Value(0)).current;
  const [cardWidth, setCardWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) {
          setReduceMotion(enabled);
        }
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    shimmerProgress.stopAnimation();
    shimmerProgress.setValue(0);
    if (reduceMotion || cardWidth <= 0) {
      return;
    }

    const animation = Animated.loop(
      Animated.timing(shimmerProgress, {
        duration: 1500,
        easing: Easing.inOut(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [cardWidth, reduceMotion, shimmerProgress]);

  const shimmerTranslateX = shimmerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-cardWidth, cardWidth],
  });

  function handleLayout(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    setCardWidth((current) => (current === nextWidth ? current : nextWidth));
  }

  const renderShimmer = () => {
    if (reduceMotion) return null;
    return (
      <AnimatedLinearGradient
        colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0)']}
        end={{ x: 1, y: 0.5 }}
        pointerEvents="none"
        start={{ x: 0, y: 0.5 }}
        style={[styles.shimmer, { transform: [{ translateX: shimmerTranslateX }] }]}
      />
    );
  };

  return (
    <View accessibilityLabel="正在加载 IP 卡片" accessibilityRole="progressbar" style={styles.container} onLayout={handleLayout}>
      
      {/* Hero Skeleton */}
      <View style={styles.heroWrapper}>
        <View style={styles.heroCard}>
          <View style={styles.heroImage} />
          <View style={styles.heroFooter}>
            <View style={[styles.skeletonBlock, { width: 60, height: 36 }]} />
            <View style={{ flexDirection: 'row', gap: 6, flex: 1, justifyContent: 'flex-end' }}>
              <View style={[styles.skeletonBlock, { width: 60, height: 36 }]} />
              <View style={[styles.skeletonBlock, { width: 90, height: 36 }]} />
            </View>
          </View>
          {renderShimmer()}
        </View>
      </View>

      {/* Standard Skeleton 1 */}
      <View style={styles.stdWrapper}>
        <View style={styles.stdCard}>
          <View style={styles.stdImage} />
          <View style={styles.stdBody}>
            <View style={[styles.skeletonBlock, { width: '40%', height: 24, marginBottom: 8 }]} />
            <View style={styles.stdFooterRow}>
              <View style={[styles.skeletonBlock, { width: 80, height: 16 }]} />
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={[styles.skeletonBlock, { width: 50, height: 28 }]} />
                <View style={[styles.skeletonBlock, { width: 60, height: 28 }]} />
              </View>
            </View>
          </View>
          {renderShimmer()}
        </View>
      </View>

      {/* Standard Skeleton 2 */}
      <View style={styles.stdWrapper}>
        <View style={styles.stdCard}>
          <View style={styles.stdImage} />
          <View style={styles.stdBody}>
            <View style={[styles.skeletonBlock, { width: '40%', height: 24, marginBottom: 8 }]} />
            <View style={styles.stdFooterRow}>
              <View style={[styles.skeletonBlock, { width: 80, height: 16 }]} />
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={[styles.skeletonBlock, { width: 50, height: 28 }]} />
                <View style={[styles.skeletonBlock, { width: 60, height: 28 }]} />
              </View>
            </View>
          </View>
          {renderShimmer()}
        </View>
      </View>

      {/* Grid Skeleton */}
      <View style={styles.gridRow}>
        <View style={styles.gridCol}>
          <View style={styles.gridCard}>
            <View style={styles.gridImage} />
            <View style={styles.gridBody}>
              <View style={[styles.skeletonBlock, { width: '70%', height: 18, marginBottom: 4 }]} />
              <View style={[styles.skeletonBlock, { width: '40%', height: 12, marginBottom: 8 }]} />
              <View style={styles.gridFooterRow}>
                <View style={[styles.skeletonBlock, { width: 60, height: 16 }]} />
                <View style={[styles.skeletonBlock, { width: 24, height: 24, borderRadius: 4 }]} />
              </View>
            </View>
            {renderShimmer()}
          </View>
        </View>
        <View style={styles.gridCol}>
          <View style={styles.gridCard}>
            <View style={styles.gridImage} />
            <View style={styles.gridBody}>
              <View style={[styles.skeletonBlock, { width: '60%', height: 18, marginBottom: 4 }]} />
              <View style={[styles.skeletonBlock, { width: '50%', height: 12, marginBottom: 8 }]} />
              <View style={styles.gridFooterRow}>
                <View style={[styles.skeletonBlock, { width: 60, height: 16 }]} />
                <View style={[styles.skeletonBlock, { width: 24, height: 24, borderRadius: 4 }]} />
              </View>
            </View>
            {renderShimmer()}
          </View>
        </View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 0,
  },
  skeletonBlock: {
    backgroundColor: '#e2e2e2',
    borderRadius: 6,
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    width: '50%',
  },
  
  // Hero
  heroWrapper: {
    
    paddingTop: 8,
    paddingBottom: 12,
  },
  heroCard: {
    width: '100%',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#f3f3f4',
  },
  heroFooter: {
    flexDirection: 'row',
    padding: 8,
    gap: 4,
    backgroundColor: '#ffffff',
  },

  // Standard
  stdWrapper: {
    
    paddingBottom: 20,
  },
  stdCard: {
    backgroundColor: '#ffffff',
    borderRadius: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  stdImage: {
    width: '100%',
    aspectRatio: 21 / 9,
    backgroundColor: '#f3f3f4',
  },
  stdBody: {
    padding: 8,
  },
  stdFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },

  // Grid
  gridRow: {
    flexDirection: 'row',
    
    paddingBottom: 16,
    gap: 12,
  },
  gridCol: {
    flex: 1,
  },
  gridCard: {
    backgroundColor: '#ffffff',
    borderRadius: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    flex: 1,
  },
  gridImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#f3f3f4',
  },
  gridBody: {
    padding: 8,
  },
  gridFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  }
});
