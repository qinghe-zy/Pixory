import { useMemo, useState } from 'react';
import { ImageBackground, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { diaryThemeAssets } from '../../ai/diary/diaryThemeAssets';
import { beijingDiaryDate, type DiaryBodyFontKey, type DiaryThemeKey } from '../../ai/diary/diaryTypes';
import type { DiaryPageContent } from '../../ai/diary/diaryPaginationService';
import { colors, radius, spacing, typography } from '../../design/tokens';

interface DiaryDeckPagerProps {
  createdAt: string;
  diaryDate: string;
  fontKey: DiaryBodyFontKey;
  pages: DiaryPageContent[];
  themeKey: DiaryThemeKey;
}

const spring = { damping: 20, stiffness: 220, mass: 0.8 };

function weekdayAndTime(createdAt: string): string {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(createdAt));
  const weekday = formatted.find((part) => part.type === 'weekday')?.value?.toUpperCase() ?? 'DIARY';
  const hour = formatted.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = formatted.find((part) => part.type === 'minute')?.value ?? '00';
  return `${weekday} · ${hour}:${minute}`;
}

function bodyFont(fontKey: DiaryBodyFontKey): string {
  return fontKey === 'wenkai' ? 'DiaryKai' : 'DiaryHandwriting';
}

export function DiaryDeckPager({ createdAt, diaryDate, fontKey, pages, themeKey }: DiaryDeckPagerProps) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const translateX = useSharedValue(0);
  const exitingOpacity = useSharedValue(1);
  const paperWidth = Math.min(width - spacing[8], 360);
  const visiblePages = useMemo(() => [0, 1, 2].map((offset) => pages[(activeIndex + offset) % pages.length]).filter(Boolean), [activeIndex, pages]);

  const advance = (direction: 1 | -1) => {
    setActiveIndex((current) => (current + direction + pages.length) % pages.length);
    translateX.value = 0;
    exitingOpacity.value = 1;
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-14, 14])
    .onUpdate((event) => { translateX.value = event.translationX; })
    .onEnd((event) => {
      const direction = event.translationX < -paperWidth * 0.18 || event.velocityX < -560 ? 1 : event.translationX > paperWidth * 0.18 || event.velocityX > 560 ? -1 : 0;
      if (direction === 0 || pages.length < 2) {
        translateX.value = withSpring(0, spring);
        return;
      }
      exitingOpacity.value = withTiming(0, { duration: 120 });
      translateX.value = withTiming(direction * -paperWidth * 1.05, { duration: 170 }, () => runOnJS(advance)(direction as 1 | -1));
    });
  const frontStyle = useAnimatedStyle(() => ({ opacity: exitingOpacity.value, transform: [{ translateX: translateX.value }, { rotate: `${translateX.value / paperWidth * 4}deg` }] }));

  return (
    <View style={styles.host}>
      <GestureDetector gesture={pan}>
        <View style={[styles.deck, { height: paperWidth / 0.69, width: paperWidth }]}>
          {visiblePages.slice(0, 3).reverse().map((page, reverseIndex) => {
            const slot = 2 - reverseIndex;
            const isFront = slot === 0;
            const top = slot === 0 ? 0 : slot === 1 ? 10 : 20;
            const rotate = slot === 0 ? '0deg' : slot === 1 ? '2.5deg' : '-2.5deg';
            return (
              <Animated.View key={`${page.index}:${slot}`} style={[styles.sheet, { top, transform: [{ rotate }] }, isFront && frontStyle]}>
                <ImageBackground imageStyle={styles.paperImage} source={diaryThemeAssets[themeKey].letter} style={styles.paper}>
                  <Text style={styles.header}>{page.index === 0 ? weekdayAndTime(createdAt) : 'CONTINUED'}</Text>
                  <Text style={[styles.body, { fontFamily: bodyFont(fontKey) }]}>{page.body}</Text>
                  <Text style={styles.footer}>{page.index === 0 && diaryDate === beijingDiaryDate(new Date()) ? '写给今天' : diaryDate.replaceAll('-', '.')}</Text>
                </ImageBackground>
              </Animated.View>
            );
          })}
        </View>
      </GestureDetector>
      <Text style={styles.pageCount}>{activeIndex + 1} / {pages.length}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingTop: spacing[8] },
  deck: { marginBottom: spacing[7] },
  sheet: { bottom: 0, elevation: 2, left: 0, position: 'absolute', right: 0, shadowColor: '#39443B', shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.12, shadowRadius: 10 },
  paper: { aspectRatio: 9 / 13, borderRadius: radius.xs, overflow: 'hidden', paddingBottom: spacing[6], paddingHorizontal: spacing[6], paddingTop: spacing[7] },
  paperImage: { borderRadius: radius.xs },
  header: { ...typography.textStyles.caption, color: colors.text.secondary, fontWeight: '600', letterSpacing: 0 },
  body: { ...typography.textStyles.body, color: '#1F2420', flex: 1, fontSize: 15, lineHeight: 28, marginTop: spacing[7] },
  footer: { ...typography.textStyles.caption, color: colors.text.secondary },
  pageCount: { ...typography.textStyles.bodyStrong, color: colors.text.secondary, letterSpacing: 0 },
});
