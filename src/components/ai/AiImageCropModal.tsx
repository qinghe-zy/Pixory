/**
 * AiImageCropModal
 *
 * 完全应用内的 1:1 图片裁剪器，避免依赖 Android 系统 CROP intent
 * （部分厂商 ROM 的 CROP intent 裁剪框无确认按钮）。
 *
 * 交互：
 *   - 单指拖拽移动图片
 *   - 双指捏合缩放图片
 *   - 确认：用 expo-image-manipulator 裁剪并回调 onConfirm(uri)
 *   - 取消：回调 onCancel()
 */
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image as RNImage,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

import { aiLightColors } from './aiLightTheme';
import { spacing, typography } from '../../design/tokens';

// ─── 常量 ──────────────────────────────────────────────────────────────────

const SCREEN = Dimensions.get('window');
// 裁剪框尺寸：屏幕宽度减左右内边距
const CROP_BOX = Math.min(SCREEN.width - spacing[8] * 2, SCREEN.width * 0.85);
// 初始最小缩放：让图片短边至少填满裁剪框（运行时动态计算）
// 最大缩放：允许基于初始缩放放大 5 倍
const MAX_ZOOM_MULTIPLIER = 5;

// ─── 类型 ──────────────────────────────────────────────────────────────────

interface AiImageCropModalProps {
  /** 待裁剪图片的本地 URI */
  sourceUri: string | null;
  /** 裁剪确认后的回调，返回裁剪结果 URI */
  onConfirm: (croppedUri: string) => void;
  /** 取消回调 */
  onCancel: () => void;
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────

/** 将值限制在 [min, max] 内 */
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** 两点之间的距离 */
function pinchDistance(touches: { pageX: number; pageY: number }[]) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── 组件 ──────────────────────────────────────────────────────────────────

export function AiImageCropModal({ sourceUri, onConfirm, onCancel }: AiImageCropModalProps) {
  const insets = useSafeAreaInsets();

  // 图片原始尺寸
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  // 缩放和偏移（相对于裁剪框中心）
  const scale = useRef(1);
  const minScale = useRef(0.1);
  const offsetX = useRef(0);
  const offsetY = useRef(0);
  // 用于触发重渲染的计数器（PanResponder 回调中直接改 ref，手势结束后同步一次）
  const [renderTick, setRenderTick] = useState(0);
  const forceRender = useCallback(() => setRenderTick((t) => t + 1), []);

  const [processing, setProcessing] = useState(false);

  // 双指捏合状态
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchScale = useRef(1);

  // ── 图片加载后初始化缩放 ──────────────────────────────────────────────
  useEffect(() => {
    if (!sourceUri) {
      return;
    }
    // 重置状态
    scale.current = 1;
    minScale.current = 0.1;
    offsetX.current = 0;
    offsetY.current = 0;
    setImgSize(null);
    setProcessing(false);

    RNImage.getSize(
      sourceUri,
      (w, h) => {
        setImgSize({ w, h });
        // 初始缩放：让图片短边正好填满裁剪框
        const fitScale = CROP_BOX / Math.min(w, h);
        scale.current = fitScale;
        minScale.current = fitScale;
        forceRender();
      },
      () => {
        // 读不到尺寸时用 fallback 值
        setImgSize({ w: CROP_BOX, h: CROP_BOX });
        scale.current = 1;
        minScale.current = 1;
        forceRender();
      },
    );
  }, [sourceUri, forceRender]);

  // ── PanResponder ─────────────────────────────────────────────────────────
  // 记录上一帧手势累积值，用于计算帧间增量
  const lastDx = useRef(0);
  const lastDy = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        // 新一轮手势开始，重置所有追踪状态
        lastDx.current = 0;
        lastDy.current = 0;
        lastPinchDist.current = null;
        lastPinchScale.current = scale.current;
      },

      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length === 2) {
          // ── 双指缩放 ──────────────────────────────────────────────────
          const dist = pinchDistance(Array.from(touches));
          if (lastPinchDist.current !== null) {
            const delta = dist / lastPinchDist.current;
            scale.current = clamp(
              lastPinchScale.current * delta,
              minScale.current,
              minScale.current * MAX_ZOOM_MULTIPLIER,
            );
          }
          lastPinchDist.current = dist;
          lastPinchScale.current = scale.current;
          // 双指时重置单指基准，防止切换手指时突变
          lastDx.current = gestureState.dx;
          lastDy.current = gestureState.dy;
        } else if (touches.length === 1) {
          // ── 单指拖拽：计算帧间增量叠加 ───────────────────────────────
          lastPinchDist.current = null;
          offsetX.current += gestureState.dx - lastDx.current;
          offsetY.current += gestureState.dy - lastDy.current;
          lastDx.current = gestureState.dx;
          lastDy.current = gestureState.dy;
        }
        forceRender();
      },

      onPanResponderRelease: () => {
        lastPinchDist.current = null;
        forceRender();
      },
    }),
  ).current;

  // ── 确认裁剪 ─────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!sourceUri || !imgSize) {
      return;
    }
    setProcessing(true);
    try {
      // 图片在屏幕上渲染的实际宽高
      const renderedW = imgSize.w * scale.current;
      const renderedH = imgSize.h * scale.current;

      // 裁剪框中心相对于图片左上角的位置
      // offsetX/Y 是图片中心相对于裁剪框中心的偏移
      const imgCenterX = CROP_BOX / 2 + offsetX.current;
      const imgCenterY = CROP_BOX / 2 + offsetY.current;

      // 裁剪框左上角相对于图片左上角的位置（渲染坐标系）
      const cropLeft = imgCenterX - renderedW / 2;
      const cropTop = imgCenterY - renderedH / 2;

      // 转换为原始图片像素坐标
      const pixelX = (-cropLeft / scale.current);
      const pixelY = (-cropTop / scale.current);
      const pixelSize = CROP_BOX / scale.current;

      // 边界保护
      const safeX = clamp(pixelX, 0, imgSize.w - 1);
      const safeY = clamp(pixelY, 0, imgSize.h - 1);
      const safeSize = Math.min(pixelSize, imgSize.w - safeX, imgSize.h - safeY);

      const result = await ImageManipulator.manipulateAsync(
        sourceUri,
        [
          {
            crop: {
              originX: safeX,
              originY: safeY,
              width: safeSize,
              height: safeSize,
            },
          },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
      );
      onConfirm(result.uri);
    } catch {
      // 裁剪失败时直接用原图
      onConfirm(sourceUri);
    } finally {
      setProcessing(false);
    }
  }, [sourceUri, imgSize, onConfirm]);

  // ── 渲染图片尺寸（保持比例，适配裁剪框） ─────────────────────────────────
  const displayW = imgSize ? imgSize.w * scale.current : CROP_BOX;
  const displayH = imgSize ? imgSize.h * scale.current : CROP_BOX;

  const visible = sourceUri !== null;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent={false}
      visible={visible}
    >
      <View style={styles.root}>
        {/* 顶部栏（加上 SafeAreaInset） */}
        <View style={[styles.topBar, { paddingTop: insets.top, height: TOP_BAR_HEIGHT + insets.top }]}>
          <Pressable
            accessibilityLabel="取消"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onCancel}
            style={({ pressed }) => [styles.topBarButton, pressed && styles.pressed]}
          >
            <Text style={styles.topBarButtonText}>取消</Text>
          </Pressable>
          <Text style={styles.topBarTitle}>裁剪头像</Text>
          <Pressable
            accessibilityLabel="确认裁剪"
            accessibilityRole="button"
            disabled={processing || !imgSize}
            hitSlop={12}
            onPress={() => void handleConfirm()}
            style={({ pressed }) => [styles.topBarButton, pressed && styles.pressed]}
          >
            {processing ? (
              <ActivityIndicator color={aiLightColors.primary} size="small" />
            ) : (
              <Text style={[styles.topBarButtonText, styles.topBarConfirm]}>使用</Text>
            )}
          </Pressable>
        </View>

        {/* 画布区 */}
        <View style={styles.canvas}>
          {/* 图片 + 手势区 */}
          <View
            {...panResponder.panHandlers}
            style={styles.gestureArea}
          >
            {imgSize ? (
              <Image
                contentFit="contain"
                source={{ uri: sourceUri ?? undefined }}
                style={{
                  width: displayW,
                  height: displayH,
                  transform: [
                    { translateX: offsetX.current },
                    { translateY: offsetY.current },
                  ],
                }}
              />
            ) : (
              <ActivityIndicator color={aiLightColors.primary} size="large" />
            )}
          </View>

          {/* 裁剪框叠层（不拦截手势） */}
          <View style={styles.cropFrameContainer} pointerEvents="none">
            {/* 上遮罩 */}
            <View style={styles.maskTop} />
            <View style={styles.cropRow}>
              {/* 左遮罩 */}
              <View style={styles.maskSide} />
              {/* 裁剪框 */}
              <View style={styles.cropBox}>
                {/* 四角标记 */}
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                {/* 三分线（可选辅助线） */}
                <View style={styles.gridH1} />
                <View style={styles.gridH2} />
                <View style={styles.gridV1} />
                <View style={styles.gridV2} />
              </View>
              {/* 右遮罩 */}
              <View style={styles.maskSide} />
            </View>
            {/* 下遮罩 */}
            <View style={styles.maskBottom} />
          </View>
        </View>

        {/* 底部提示 */}
        <View style={styles.hint}>
          <Ionicons color={aiLightColors.muted} name="information-circle-outline" size={14} />
          <Text style={styles.hintText}>拖动或捏合调整，方框内区域将被裁剪</Text>
        </View>
      </View>
    </Modal>
  );
}

// ─── 样式 ──────────────────────────────────────────────────────────────────

const MASK_COLOR = 'rgba(0,0,0,0.55)';
const CORNER_SIZE = 20;
const CORNER_THICKNESS = 3;
const GRID_COLOR = 'rgba(255,255,255,0.25)';
const TOP_BAR_HEIGHT = 56;
const BOTTOM_HINT_HEIGHT = 48;
const AVAILABLE_H = SCREEN.height - TOP_BAR_HEIGHT - BOTTOM_HINT_HEIGHT;
const MASK_V = (AVAILABLE_H - CROP_BOX) / 2;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111',
  },

  // ── 顶部栏 ──────────────────────────────────────────────────────────────
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    backgroundColor: '#1C1C1E',
  },
  topBarTitle: {
    ...typography.textStyles.bodyStrong,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  topBarButton: {
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[2],
  },
  topBarButtonText: {
    ...typography.textStyles.body,
    color: '#AEAEB2',
  },
  topBarConfirm: {
    color: aiLightColors.primary,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },

  // ── 画布 ────────────────────────────────────────────────────────────────
  canvas: {
    flex: 1,
    position: 'relative',
  },
  gestureArea: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── 裁剪框叠层 ───────────────────────────────────────────────────────────
  cropFrameContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  maskTop: {
    width: '100%',
    height: MASK_V,
    backgroundColor: MASK_COLOR,
  },
  cropRow: {
    flexDirection: 'row',
    height: CROP_BOX,
  },
  maskSide: {
    flex: 1,
    backgroundColor: MASK_COLOR,
  },
  maskBottom: {
    flex: 1,
    backgroundColor: MASK_COLOR,
  },
  cropBox: {
    width: CROP_BOX,
    height: CROP_BOX,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    position: 'relative',
  },

  // ── 四角标记 ─────────────────────────────────────────────────────────────
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: -CORNER_THICKNESS,
    left: -CORNER_THICKNESS,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: '#FFFFFF',
  },
  cornerTR: {
    top: -CORNER_THICKNESS,
    right: -CORNER_THICKNESS,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: '#FFFFFF',
  },
  cornerBL: {
    bottom: -CORNER_THICKNESS,
    left: -CORNER_THICKNESS,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: '#FFFFFF',
  },
  cornerBR: {
    bottom: -CORNER_THICKNESS,
    right: -CORNER_THICKNESS,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: '#FFFFFF',
  },

  // ── 三分辅助线 ───────────────────────────────────────────────────────────
  gridH1: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: CROP_BOX / 3,
    height: StyleSheet.hairlineWidth,
    backgroundColor: GRID_COLOR,
  },
  gridH2: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (CROP_BOX / 3) * 2,
    height: StyleSheet.hairlineWidth,
    backgroundColor: GRID_COLOR,
  },
  gridV1: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: CROP_BOX / 3,
    width: StyleSheet.hairlineWidth,
    backgroundColor: GRID_COLOR,
  },
  gridV2: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: (CROP_BOX / 3) * 2,
    width: StyleSheet.hairlineWidth,
    backgroundColor: GRID_COLOR,
  },

  // ── 底部提示 ─────────────────────────────────────────────────────────────
  hint: {
    height: BOTTOM_HINT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    backgroundColor: '#1C1C1E',
  },
  hintText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
});

