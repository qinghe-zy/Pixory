import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  useAnimatedReaction,
  withTiming,
} from 'react-native-reanimated';

import { aiLightColors } from '../../components/ai/aiLightTheme';
import { radius, spacing, typography } from '../../design/tokens';
import {
  BRANCH_TREE_MAX_SCALE,
  BRANCH_TREE_MIN_SCALE,
  buildRecenterTransform,
} from '../engine/branchTreeViewport';
import {
  BRANCH_TREE_NODE_HEIGHT,
  BRANCH_TREE_NODE_WIDTH,
  layoutBranchTreeGraph,
} from '../engine/layoutBranchTreeGraph';
import {
  buildBranchTreeVisibleWindow,
  filterBranchTreeVisibleLayout,
} from '../engine/branchTreeViewportVirtualization';
import type { BranchTreeGraph, BranchTreeSnapshot, BranchTreeViewportSize, BranchTreeViewportTransform } from '../engine/types';
import { BranchTreeDrawer } from './BranchTreeDrawer';
import { BranchTreeGrid } from './BranchTreeGrid';
import { BranchTreeLinks } from './BranchTreeLinks';
import { BranchTreeNodeCard } from './BranchTreeNodeCard';

interface BranchTreeCanvasProps {
  graph: BranchTreeGraph;
  selectedNodeId: string | null;
  snapshot: BranchTreeSnapshot | null;
  snapshotLoading?: boolean;
  snapshotVisible: boolean;
  onCheckoutNode: (nodeId: string) => void;
  onCloseSnapshot: () => void;
  onOpenSnapshotNode: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
}

export function BranchTreeCanvas({
  graph,
  onCheckoutNode,
  onCloseSnapshot,
  onOpenSnapshotNode,
  onSelectNode,
  selectedNodeId,
  snapshot,
  snapshotLoading = false,
  snapshotVisible,
}: BranchTreeCanvasProps) {
  const layout = useMemo(() => layoutBranchTreeGraph(graph), [graph]);
  const initialDimensions = useMemo(() => Dimensions.get('window'), []);
  const headCenterPoint = useMemo(
    () =>
      layout.headNode
        ? {
            x: layout.headNode.x + BRANCH_TREE_NODE_WIDTH / 2,
            y: layout.headNode.y + BRANCH_TREE_NODE_HEIGHT / 2,
          }
        : null,
    [layout.headNode]
  );
  const initialTransform = useMemo(() => {
    if (!headCenterPoint || initialDimensions.width <= 0 || initialDimensions.height <= 0) {
      return { scale: 1, translateX: 0, translateY: 0 };
    }
    return buildRecenterTransform(headCenterPoint, initialDimensions, 0.8);
  }, [headCenterPoint, initialDimensions]);

  const [viewport, setViewport] = useState<BranchTreeViewportSize>({
    height: initialDimensions.height,
    width: initialDimensions.width,
  });
  const [transformState, setTransformState] = useState<BranchTreeViewportTransform>(initialTransform);
  const translateX = useSharedValue(initialTransform.translateX);
  const translateY = useSharedValue(initialTransform.translateY);
  const scale = useSharedValue(initialTransform.scale);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);
  const visibleWindow = useMemo(
    () => buildBranchTreeVisibleWindow(viewport, transformState),
    [transformState.scale, transformState.translateX, transformState.translateY, viewport.height, viewport.width]
  );
  const visibleLayout = useMemo(
    () => filterBranchTreeVisibleLayout(layout, visibleWindow, selectedNodeId),
    [layout, selectedNodeId, visibleWindow]
  );

  function syncTransform(nextTranslateX: number, nextTranslateY: number, nextScale: number) {
    setTransformState({
      scale: nextScale,
      translateX: nextTranslateX,
      translateY: nextTranslateY,
    });
  }

  const graphStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = panStartX.value + event.translationX;
      translateY.value = panStartY.value + event.translationY;
    })
    .onFinalize(() => {
      runOnJS(syncTransform)(translateX.value, translateY.value, scale.value);
    });

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      pinchStartScale.value = scale.value;
    })
    .onUpdate((event) => {
      const nextScale = pinchStartScale.value * event.scale;
      scale.value = Math.min(BRANCH_TREE_MAX_SCALE, Math.max(BRANCH_TREE_MIN_SCALE, nextScale));
    })
    .onFinalize(() => {
      runOnJS(syncTransform)(translateX.value, translateY.value, scale.value);
    });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const [headOutside, setHeadOutside] = useState(false);
  const didInitialFocusRef = useRef(false);

  function handleLayout(event: LayoutChangeEvent) {
    const nextWidth = event.nativeEvent.layout.width;
    const nextHeight = event.nativeEvent.layout.height;
    if (Math.abs(nextHeight - viewport.height) > 10 || Math.abs(nextWidth - viewport.width) > 10) {
      setViewport({
        height: nextHeight,
        width: nextWidth,
      });
    }
  }

  function recenterHead() {
    if (!headCenterPoint || viewport.width <= 0 || viewport.height <= 0) {
      return;
    }
    const next = buildRecenterTransform(headCenterPoint, viewport, scale.value);
    scale.value = withTiming(next.scale);
    translateX.value = withTiming(next.translateX);
    translateY.value = withTiming(next.translateY);
    setTransformState(next);
  }

  function zoomIn() {
    const nextScale = Math.min(BRANCH_TREE_MAX_SCALE, scale.value * 1.25);
    scale.value = withTiming(nextScale);
    syncTransform(translateX.value, translateY.value, nextScale);
  }

  function zoomOut() {
    const nextScale = Math.max(BRANCH_TREE_MIN_SCALE, scale.value * 0.8);
    scale.value = withTiming(nextScale);
    syncTransform(translateX.value, translateY.value, nextScale);
  }

  useEffect(() => {
    if (didInitialFocusRef.current) {
      return;
    }
    if (!headCenterPoint || viewport.width <= 0 || viewport.height <= 0) {
      return;
    }

    didInitialFocusRef.current = true;
    const next = buildRecenterTransform(headCenterPoint, viewport, 0.8);
    scale.value = next.scale;
    translateX.value = next.translateX;
    translateY.value = next.translateY;
    setTransformState(next);
  }, [headCenterPoint, viewport.height, viewport.width]);

  useAnimatedReaction(
    () => {
      if (snapshotVisible) {
        return false;
      }
      if (!headCenterPoint || viewport.width <= 0 || viewport.height <= 0) {
        return false;
      }
      const screenX = headCenterPoint.x * scale.value + translateX.value;
      const screenY = headCenterPoint.y * scale.value + translateY.value;
      return (
        screenX < -100 ||
        screenX > viewport.width + 100 ||
        screenY < -100 ||
        screenY > viewport.height + 100
      );
    },
    (next, previous) => {
      if (next !== previous) {
        runOnJS(setHeadOutside)(next);
      }
    },
    [headCenterPoint, viewport.height, viewport.width, snapshotVisible]
  );

  function selectedOrFallbackNodeId(): string | null {
    return selectedNodeId ?? graph.headNodeId ?? graph.activeNodeId;
  }

  return (
    <View onLayout={handleLayout} style={styles.root}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View
          style={[styles.canvas, { height: layout.height, width: layout.width }, graphStyle]}
        >
          <View pointerEvents="none" style={styles.layer}>
            <BranchTreeGrid height={layout.height} visibleWindow={visibleWindow} width={layout.width} />
          </View>
          <View pointerEvents="none" style={styles.layer}>
            <BranchTreeLinks edges={visibleLayout.edges} />
          </View>
          {visibleLayout.nodes.map((node) => (
            <View key={node.id} style={[styles.nodePosition, { left: node.x, top: node.y }]}>
              <GestureDetector
                gesture={Gesture.Exclusive(
                  Gesture.Tap().numberOfTaps(2).runOnJS(true).onEnd(() => onOpenSnapshotNode(node.id)),
                  Gesture.Tap().numberOfTaps(1).runOnJS(true).onEnd(() => onSelectNode(node.id))
                )}
              >
                <Animated.View>
                  <BranchTreeNodeCard node={node} selected={node.id === selectedNodeId} />
                </Animated.View>
              </GestureDetector>
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
      {headOutside ? (
        <Pressable
          accessibilityRole="button"
          onPress={recenterHead}
          style={({ pressed }) => [styles.recenterPill, { bottom: snapshotVisible ? 238 : 38 }, pressed && styles.pressed]}
        >
          <Text style={styles.recenterText}>最新节点已偏离 · 一键回正</Text>
        </Pressable>
      ) : null}
      <View
        pointerEvents="box-none"
        style={[
          styles.floatingToolbar,
          { bottom: snapshotVisible ? 310 : 32 },
        ]}
      >
        <Pressable
          accessibilityLabel="放大视口"
          accessibilityRole="button"
          hitSlop={8}
          onPress={zoomIn}
          style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
        >
          <Text style={styles.toolButtonText}>+</Text>
        </Pressable>
        <View style={styles.toolDivider} />
        <Pressable
          accessibilityLabel="缩小视口"
          accessibilityRole="button"
          hitSlop={8}
          onPress={zoomOut}
          style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
        >
          <Text style={styles.toolButtonText}>−</Text>
        </Pressable>
        <View style={styles.toolDivider} />
        <Pressable
          accessibilityLabel="一键回正至最新HEAD"
          accessibilityRole="button"
          hitSlop={8}
          onPress={recenterHead}
          style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
        >
          <Text style={styles.toolButtonIconText}>⌖</Text>
        </Pressable>
      </View>
      {snapshotVisible ? (
        <BranchTreeDrawer
          loading={snapshotLoading}
          onCheckout={() => {
            const nodeId = selectedOrFallbackNodeId();
            if (nodeId) {
              onCheckoutNode(nodeId);
            }
          }}
          onClose={onCloseSnapshot}
          snapshot={snapshot}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    elevation: 0,
    minHeight: 720,
    minWidth: 720,
    transformOrigin: '0px 0px',
  },
  nodePosition: {
    position: 'absolute',
  },
  layer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  floatingToolbar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 3,
    flexDirection: 'row',
    position: 'absolute',
    right: spacing[4],
    shadowColor: '#000000',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    zIndex: 10,
  },
  toolButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  toolButtonIconText: {
    color: '#D07C60',
    fontSize: 16,
    fontWeight: '700',
  },
  toolButtonText: {
    color: aiLightColors.ink,
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 20,
  },
  toolDivider: {
    backgroundColor: aiLightColors.hairline,
    height: 18,
    width: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.76,
  },
  recenterPill: {
    alignSelf: 'center',
    backgroundColor: '#D07C60',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    position: 'absolute',
  },
  recenterText: {
    ...typography.textStyles.caption,
    color: aiLightColors.onDark,
  },
  root: {
    backgroundColor: aiLightColors.canvas,
    flex: 1,
    overflow: 'hidden',
  },
});
