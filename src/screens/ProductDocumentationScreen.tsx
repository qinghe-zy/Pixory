import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withDelay, 
  withSequence, 
  Easing, 
  interpolate 
} from 'react-native-reanimated';

import { useToast } from '../components/AppToast';
import { AppScreen } from '../components/AppScreen';
import { AiMarkdownReader } from '../components/ai/AiMarkdownReader';
import type { AiReadableDocument } from '../ai/readers/readerTypes';
import { colors, layout, spacing, typography, radius } from '../design/tokens';
import { getProductDocumentationMarkdown, ProductDocKey } from '../services/productDocumentationService';
import { ParallaxLightSweep } from '../components/ParallaxLightSweep';
import Constants from 'expo-constants';
import { Path, Svg, Polyline, Line } from 'react-native-svg';

interface ProductDocumentationScreenProps {
  onBack: () => void;
  preloadedMarkdown?: string | null;
}

const DOCS_META: Record<ProductDocKey, { title: string; desc: string }> = {
  readme: { title: '项目首页', desc: '全局概览与特性简介' },
  manual: { title: '产品使用指南', desc: '从安装到日常使用的完整说明' },
  handbook: { title: '产品手册', desc: '产品理念、用户场景和功能介绍' },
  feature: { title: '功能清单', desc: '底层能力与产品特性说明' },
  algorithms: { title: '算法说明', desc: '核心引擎与底层架构解析' },
};

const DOC_KEYS: ProductDocKey[] = ['readme', 'manual', 'handbook', 'feature', 'algorithms'];

export function ProductDocumentationScreen({
  onBack,
  preloadedMarkdown,
}: ProductDocumentationScreenProps) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [activeDocKey, setActiveDocKey] = useState<ProductDocKey>('manual');
  const [markdown, setMarkdown] = useState<string | null>(preloadedMarkdown ?? null);
  const [showSweep, setShowSweep] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const version = Constants.expoConfig?.version ?? '2.8.6';

  const readable = useMemo<Pick<AiReadableDocument, 'text'> | null>(
    () => (markdown ? { text: markdown } : null),
    [markdown]
  );

  useEffect(() => {
    const timer = setTimeout(() => setShowSweep(false), 750);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    getProductDocumentationMarkdown(activeDocKey)
      .then((content) => {
        if (isMounted) {
          setMarkdown(content);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoading(false);
          showToast('加载产品文档失败');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeDocKey, showToast]);

  const handleLinkPress = (url: string) => {
    void Linking.openURL(url).catch(() => {
      showToast('打开链接失败');
    });
  };

  const currentDocMeta = DOCS_META[activeDocKey];

  // --- Animations ---
  
  const openProgress = useSharedValue(0);
  const hopProgress = useSharedValue(0);

  useEffect(() => {
    // Replicate buttonAttentionHop
    // 2s duration, delay 0.8s, run 2 times.
    // 0% -> 15% (-5px, 1.15) -> 30% (1px, 0.92) -> 45% (-3px, 1.06) -> 60% (0, 1)
    const runHop = () => {
      hopProgress.value = withSequence(
        withTiming(0.15, { duration: 300, easing: Easing.bezier(0.34, 1.2, 0.64, 1) }),
        withTiming(0.30, { duration: 300, easing: Easing.bezier(0.34, 1.2, 0.64, 1) }),
        withTiming(0.45, { duration: 300, easing: Easing.bezier(0.34, 1.2, 0.64, 1) }),
        withTiming(0.60, { duration: 300, easing: Easing.bezier(0.34, 1.2, 0.64, 1) }),
        withTiming(1, { duration: 800 })
      );
    };

    const delayId = setTimeout(() => {
      runHop();
      const intervalId = setInterval(runHop, 2000);
      // Clean up interval after running a second time
      setTimeout(() => clearInterval(intervalId), 2500); 
    }, 800);

    return () => clearTimeout(delayId);
  }, []);

  useEffect(() => {
    if (isOpen) {
      openProgress.value = withTiming(1, { duration: 500, easing: Easing.bezier(0.5, 0.1, 0.1, 1) });
    } else {
      openProgress.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) });
    }
  }, [isOpen]);

  const triggerAnimatedStyle = useAnimatedStyle(() => {
    const y = interpolate(
      hopProgress.value,
      [0, 0.15, 0.3, 0.45, 0.6, 1],
      [0, -5, 1, -3, 0, 0]
    );
    const s = interpolate(
      hopProgress.value,
      [0, 0.15, 0.3, 0.45, 0.6, 1],
      [1, 1.15, 0.92, 1.06, 1, 1]
    );
    return {
      transform: [{ translateY: y }, { scale: s }]
    };
  });

  const menuIconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(openProgress.value, [0, 1], [1, 0]),
      transform: [
        { rotate: `${interpolate(openProgress.value, [0, 1], [0, 90])}deg` },
        { scale: interpolate(openProgress.value, [0, 1], [1, 0.5]) }
      ]
    };
  });

  const closeIconStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(openProgress.value, [0, 1], [0, 1]),
      transform: [
        { rotate: `${interpolate(openProgress.value, [0, 1], [-90, 0])}deg` },
        { scale: interpolate(openProgress.value, [0, 1], [0.5, 1]) }
      ]
    };
  });

  const popoverStyle = useAnimatedStyle(() => {
    return {
      opacity: openProgress.value,
      transformOrigin: 'top right',
      transform: [
        { scale: interpolate(openProgress.value, [0, 1], [0.05, 1]) }
      ],
      pointerEvents: openProgress.value > 0 ? 'auto' : 'none',
    };
  });

  const overlayStyle = useAnimatedStyle(() => {
    return {
      opacity: openProgress.value,
      pointerEvents: openProgress.value > 0 ? 'auto' : 'none',
    };
  });

  return (
    <>
      <AppScreen backgroundColor={DOC_CANVAS} contentStyle={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing[3] }]}>
          <Pressable
            accessibilityLabel="返回"
            hitSlop={10}
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Ionicons color={colors.text.title} name="arrow-back" size={28} />
            <Text style={styles.backText}>返回</Text>
          </Pressable>

          <View pointerEvents="none" style={styles.brandWrap}>
            <Text style={styles.brandText}>{currentDocMeta.title}</Text>
          </View>

          <View style={styles.headerRight}>
            <Animated.View style={[styles.switcherTriggerWrap, triggerAnimatedStyle]}>
              <Pressable
                onPress={() => setIsOpen(true)}
                style={({ pressed }) => [
                  styles.switcherTrigger,
                  pressed && { backgroundColor: 'rgba(0,0,0,0.05)' }
                ]}
              >
                <Animated.View style={[StyleSheet.absoluteFill, styles.iconContainer, menuIconStyle]}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text.title} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <Polyline points="14 2 14 8 20 8" />
                    <Line x1="16" y1="13" x2="8" y2="13" />
                    <Line x1="16" y1="17" x2="8" y2="17" />
                    <Polyline points="10 9 9 9 8 9" />
                  </Svg>
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, styles.iconContainer, closeIconStyle]}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text.title} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M18 6L6 18" />
                    <Path d="M6 6l12 12" />
                  </Svg>
                </Animated.View>
              </Pressable>
            </Animated.View>
          </View>
        </View>

        <View style={styles.container}>
          {isLoading && !readable ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.text.title} size="large" />
            </View>
          ) : readable ? (
            <AiMarkdownReader onLinkPress={handleLinkPress} readable={readable} />
          ) : null}
        </View>
      </AppScreen>

      <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsOpen(false)} />
      </Animated.View>

      <Animated.View style={[styles.popover, popoverStyle, { top: insets.top + spacing[3] + 4 }]}>
        <View style={styles.popoverHeader}>
          <Text style={styles.popoverTitle}>阅读文档</Text>
          <View style={styles.appInfoCompact}>
            <Image source={require('../../assets/app-icon.png')} style={styles.appIconPlaceholder} />
            <Text style={styles.appVersion}>v{version}</Text>
          </View>
        </View>

        {DOC_KEYS.map((key, index) => {
          const meta = DOCS_META[key];
          const isActive = key === activeDocKey;
          
          return (
            <AnimatedDocCard 
              key={key} 
              index={index} 
              isActive={isActive} 
              meta={meta} 
              isOpen={isOpen}
              onPress={() => {
                setActiveDocKey(key);
                setIsOpen(false);
              }} 
            />
          );
        })}
        
        <Pressable
          onPress={() => setIsOpen(false)}
          style={styles.popoverCloseBtn}
          hitSlop={10}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text.title} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 6L6 18" />
            <Path d="M6 6l12 12" />
          </Svg>
        </Pressable>
      </Animated.View>

      <ParallaxLightSweep fadeDuration={750} opacity={0.35} visible={showSweep} />
    </>
  );
}

// Inner Card Drop Component
function AnimatedDocCard({ index, isActive, meta, isOpen, onPress }: any) {
  const dropProgress = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      // 1.0s cubic-bezier(0.34, 1.1, 0.64, 1) backwards
      // Delays: 0.1s, 0.2s, 0.3s, 0.4s
      const delay = (index + 1) * 100;
      dropProgress.value = withDelay(
        delay, 
        withTiming(1, { duration: 1000, easing: Easing.bezier(0.34, 1.1, 0.64, 1) })
      );
    } else {
      dropProgress.value = 0;
    }
  }, [isOpen, index]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: dropProgress.value,
      transform: [
        { translateY: interpolate(dropProgress.value, [0, 1], [-16, 0]) }
      ]
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.docCard,
          isActive && styles.docCardActive,
          !isActive && pressed && { backgroundColor: 'rgba(0,0,0,0.025)' }
        ]}
      >
        <Text style={[styles.docCardTitle, isActive && styles.docCardTitleActive]}>
          {meta.title}
        </Text>
        <Text style={styles.docCardDesc}>{meta.desc}</Text>
      </Pressable>
    </Animated.View>
  );
}

const DOC_CANVAS = '#FAF9F5';

const styles = StyleSheet.create({
  screen: {
    gap: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  header: {
    alignItems: 'center',
    backgroundColor: DOC_CANVAS,
    borderBottomColor: colors.border.default,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: layout.headerHeight + spacing[2],
    paddingHorizontal: spacing[5],
    zIndex: 10,
  },
  backButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    minWidth: 70,
    paddingVertical: spacing[2],
  },
  backButtonPressed: {
    opacity: 0.72,
  },
  backText: {
    ...typography.textStyles.body,
    color: colors.text.title,
    fontSize: 18,
    lineHeight: 24,
  },
  brandWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  brandText: {
    color: '#141413',
    fontFamily: typography.family.serif,
    fontSize: 20,
    lineHeight: 28,
  },
  headerRight: {
    minWidth: 70,
    alignItems: 'flex-end',
  },
  switcherTriggerWrap: {
    width: 40,
    height: 40,
  },
  switcherTrigger: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    backgroundColor: DOC_CANVAS,
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  overlay: {
    backgroundColor: 'transparent', // The original manual.html doesn't dim the bg
    zIndex: 100,
  },
  popover: {
    position: 'absolute',
    right: spacing[4], // Match the button's approximate position (spacing[5] is 20)
    width: 260, // clamp(240px, 61.8vw, 260px) in CSS, we use max 260
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 0, // Removes the harsh black edge on Android during scale
    zIndex: 101,
  },
  popoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingTop: 6,
    paddingLeft: 6,
    paddingRight: 44,
  },
  popoverTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#141413',
    letterSpacing: 0.2,
  },
  appInfoCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  appIconPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 4.5,
    backgroundColor: colors.background.secondary,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  appVersion: {
    fontFamily: typography.family.monoBold,
    fontSize: 12,
    color: '#141413',
  },
  docCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  docCardActive: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(93, 76, 52, 0.05)',
    shadowColor: '#5d4c34',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 0,
  },
  docCardTitle: {
    fontSize: 14.5,
    fontWeight: '500',
    color: '#3d3d3a',
    marginBottom: 3,
  },
  docCardTitleActive: {
    color: '#141413',
    fontWeight: '600',
  },
  docCardDesc: {
    fontSize: 12.5,
    color: '#6c6a64',
    lineHeight: 18,
  },
  popoverCloseBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
});
