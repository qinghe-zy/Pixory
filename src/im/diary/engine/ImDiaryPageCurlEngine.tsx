import React, { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import type { DiarySpreadPair } from '../types';
import { ImDiaryPageSpread } from '../components/ImDiaryPageSpread';

export interface ImDiaryPageCurlEngineProps {
  currSpread: DiarySpreadPair;
  nextSpread: DiarySpreadPair | null;
  prevSpread: DiarySpreadPair | null;
  onTurnNext: () => void;
  onTurnPrev: () => void;
  canNext: boolean;
  canPrev: boolean;
}

/**
 * 小说级跟手 3D 卷页翻页引擎 (Zero-Jump 3D Page Curl Engine)
 * 核心铁律：文字随 3D 旋转刚体绑定，背面真实镜像展露，任何拖拽角度绝不跳变！
 */
export function ImDiaryPageCurlEngine({
  currSpread,
  nextSpread,
  prevSpread,
  onTurnNext,
  onTurnPrev,
  canNext,
  canPrev,
}: ImDiaryPageCurlEngineProps) {
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'forward' | 'backward'>('forward');
  const animProgress = useRef(new Animated.Value(0)).current;

  const canNextRef = useRef(canNext);
  canNextRef.current = canNext;
  const canPrevRef = useRef(canPrev);
  canPrevRef.current = canPrev;
  const onTurnNextRef = useRef(onTurnNext);
  onTurnNextRef.current = onTurnNext;
  const onTurnPrevRef = useRef(onTurnPrev);
  onTurnPrevRef.current = onTurnPrev;

  const flipDirectionRef = useRef<'forward' | 'backward'>('forward');
  const isFlippingRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 12,
      onPanResponderGrant: (_, gesture) => {
        if (gesture.dx < 0 && canNextRef.current) {
          flipDirectionRef.current = 'forward';
          setFlipDirection('forward');
          isFlippingRef.current = true;
          setIsFlipping(true);
          animProgress.setValue(0);
        } else if (gesture.dx > 0 && canPrevRef.current) {
          flipDirectionRef.current = 'backward';
          setFlipDirection('backward');
          isFlippingRef.current = true;
          setIsFlipping(true);
          animProgress.setValue(0);
        }
      },
      onPanResponderMove: (_, gesture) => {
        if (!isFlippingRef.current) {
          if (gesture.dx < -10 && canNextRef.current) {
            flipDirectionRef.current = 'forward';
            setFlipDirection('forward');
            isFlippingRef.current = true;
            setIsFlipping(true);
          } else if (gesture.dx > 10 && canPrevRef.current) {
            flipDirectionRef.current = 'backward';
            setFlipDirection('backward');
            isFlippingRef.current = true;
            setIsFlipping(true);
          }
        }
        const width = 300;
        const dir = flipDirectionRef.current;
        if (dir === 'forward' && canNextRef.current) {
          const p = Math.max(0, Math.min(1, -gesture.dx / width));
          animProgress.setValue(p);
        } else if (dir === 'backward' && canPrevRef.current) {
          const p = Math.max(0, Math.min(1, gesture.dx / width));
          animProgress.setValue(p);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const width = 300;
        const p = Math.abs(gesture.dx) / width;
        const dir = flipDirectionRef.current;
        if (p > 0.35) {
          Animated.timing(animProgress, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            isFlippingRef.current = false;
            setIsFlipping(false);
            animProgress.setValue(0);
            if (dir === 'forward') onTurnNextRef.current();
            else onTurnPrevRef.current();
          });
        } else {
          Animated.timing(animProgress, {
            toValue: 0,
            duration: 160,
            useNativeDriver: true,
          }).start(() => {
            isFlippingRef.current = false;
            setIsFlipping(false);
          });
        }
      },
    })
  ).current;

  // 3D 旋转角度映射
  const rotateY = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: flipDirection === 'forward' ? ['0deg', '-180deg'] : ['0deg', '180deg'],
  });

  const leafShadowOpacity = animProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.45, 0],
  });

  // 底层静止对开页：物理级防穿帮，动态露出掀开面下的目标页
  const bottomSpread = isFlipping
    ? flipDirection === 'forward'
      ? { leftPage: currSpread.leftPage, rightPage: nextSpread?.rightPage || currSpread.rightPage }
      : { leftPage: prevSpread?.leftPage || currSpread.leftPage, rightPage: currSpread.rightPage }
    : currSpread;

  return (
    <View style={styles.engineContainer} {...panResponder.panHandlers}>
      {/* 1. 底层静止对开页 */}
      <View style={StyleSheet.absoluteFill}>
        <ImDiaryPageSpread leftPage={bottomSpread.leftPage} rightPage={bottomSpread.rightPage} />
      </View>

      {/* 2. 运动翻转叶片 (3D Flip Leaf) */}
      {isFlipping && (
        <Animated.View
          style={[
            flipDirection === 'forward' ? styles.flipLeafRight : styles.flipLeafLeft,
            { transform: [{ perspective: 1200 }, { rotateY }] },
          ]}
        >
          {/* 正面：当前页翻起 */}
          <View style={flipDirection === 'forward' ? styles.faceFrontRight : styles.faceFrontLeft}>
            <ImDiaryPageSpread leftPage={currSpread.leftPage} rightPage={currSpread.rightPage} />
          </View>

          {/* 背面：目标对开页真实镜像展露 */}
          <View style={flipDirection === 'forward' ? styles.faceBackRight : styles.faceBackLeft}>
            {flipDirection === 'forward' ? (
              <ImDiaryPageSpread
                leftPage={nextSpread?.leftPage || currSpread.leftPage}
                rightPage={nextSpread?.rightPage || currSpread.rightPage}
              />
            ) : (
              <ImDiaryPageSpread
                leftPage={prevSpread?.leftPage || currSpread.leftPage}
                rightPage={prevSpread?.rightPage || currSpread.rightPage}
              />
            )}
          </View>

          <Animated.View style={[styles.lightingOverlay, { opacity: leafShadowOpacity }]} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  engineContainer: { flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 14 },
  flipLeafRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%', zIndex: 35, transformOrigin: 'left center', backfaceVisibility: 'hidden' },
  flipLeafLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%', zIndex: 35, transformOrigin: 'right center', backfaceVisibility: 'hidden' },
  faceFrontRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '200%', backfaceVisibility: 'hidden' },
  faceBackRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '200%', transform: [{ rotateY: '180deg' }], backfaceVisibility: 'hidden' },
  faceFrontLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '200%', backfaceVisibility: 'hidden' },
  faceBackLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '200%', transform: [{ rotateY: '180deg' }], backfaceVisibility: 'hidden' },
  lightingOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(70, 40, 20, 0.28)' },
});
