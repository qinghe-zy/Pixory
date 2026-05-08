import type { RefObject } from 'react';
import { useMemo, useRef } from 'react';
import { Dimensions, PanResponder, type GestureResponderEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';

import type { AssetMediaType } from '../database';

interface SwipeGridItem {
  id: number;
  mediaType: AssetMediaType;
}

interface SwipeGridLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseSwipeGridSelectionParams {
  items: SwipeGridItem[];
  selectedIds: number[];
  setSelectedIds: (updater: (current: number[]) => number[]) => void;
  scrollViewRef: RefObject<ScrollView | null>;
  selectableMediaTypes?: AssetMediaType[];
}

export const AUTO_SCROLL_EDGE_SIZE = 72;
const AUTO_SCROLL_STEP = 22;
const AUTO_SCROLL_INTERVAL_MS = 48;

export function useSwipeGridSelection({
  items,
  selectedIds,
  setSelectedIds,
  scrollViewRef,
  selectableMediaTypes = ['image'],
}: UseSwipeGridSelectionParams) {
  const itemLayoutsRef = useRef(new Map<number, SwipeGridLayout>());
  const selectableTypeSet = useMemo(() => new Set(selectableMediaTypes), [selectableMediaTypes]);
  const selectableIdSet = useMemo(() => new Set(items.filter((item) => selectableTypeSet.has(item.mediaType)).map((item) => item.id)), [items, selectableTypeSet]);
  const selectedIdsRef = useRef(selectedIds);
  const dragVisitedIdsRef = useRef(new Set<number>());
  const isDraggingRef = useRef(false);
  const scrollYRef = useRef(0);
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoScrollDirectionRef = useRef<1 | -1 | 0>(0);

  selectedIdsRef.current = selectedIds;

  function registerItemLayout(imageId: number, layout: SwipeGridLayout) {
    itemLayoutsRef.current.set(imageId, layout);
  }

  function addItemToSelection(itemId: number | null) {
    if (itemId == null || !selectableIdSet.has(itemId) || dragVisitedIdsRef.current.has(itemId)) {
      return;
    }

    dragVisitedIdsRef.current.add(itemId);
    setSelectedIds((current) => (current.includes(itemId) ? current : [...current, itemId]));
  }

  function findItemIdAtLocation(x: number, y: number): number | null {
    for (const [itemId, layout] of itemLayoutsRef.current.entries()) {
      if (x >= layout.x && x <= layout.x + layout.width && y >= layout.y && y <= layout.y + layout.height) {
        return itemId;
      }
    }
    return null;
  }

  function stopAutoScroll() {
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
    autoScrollDirectionRef.current = 0;
  }

  function startAutoScroll(direction: 1 | -1) {
    if (autoScrollDirectionRef.current === direction && autoScrollTimerRef.current) {
      return;
    }

    stopAutoScroll();
    autoScrollDirectionRef.current = direction;
    autoScrollTimerRef.current = setInterval(() => {
      const nextY = Math.max(0, scrollYRef.current + direction * AUTO_SCROLL_STEP);
      scrollViewRef.current?.scrollTo({ y: nextY, animated: false });
      scrollYRef.current = nextY;
    }, AUTO_SCROLL_INTERVAL_MS);
  }

  function updateAutoScroll(event: GestureResponderEvent) {
    const pageY = event.nativeEvent.pageY;
    const windowHeight = Dimensions.get('window').height;
    if (pageY < AUTO_SCROLL_EDGE_SIZE) {
      startAutoScroll(-1);
      return;
    }
    if (windowHeight > 0 && pageY > windowHeight - AUTO_SCROLL_EDGE_SIZE) {
      startAutoScroll(1);
      return;
    }
    stopAutoScroll();
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isDraggingRef.current,
        onMoveShouldSetPanResponder: (_event, gestureState) => isDraggingRef.current && Math.abs(gestureState.dy) + Math.abs(gestureState.dx) > 2,
        onPanResponderGrant: (event) => {
          const location = event.nativeEvent;
          addItemToSelection(findItemIdAtLocation(location.locationX, location.locationY));
        },
        onPanResponderMove: (event) => {
          const location = event.nativeEvent;
          addItemToSelection(findItemIdAtLocation(location.locationX, location.locationY));
          updateAutoScroll(event);
        },
        onPanResponderRelease: () => {
          isDraggingRef.current = false;
          dragVisitedIdsRef.current.clear();
          stopAutoScroll();
        },
        onPanResponderTerminate: () => {
          isDraggingRef.current = false;
          dragVisitedIdsRef.current.clear();
          stopAutoScroll();
        },
      }),
    [selectableIdSet]
  );

  function beginSwipeSelection(itemId: number) {
    if (!selectableIdSet.has(itemId)) {
      return;
    }
    isDraggingRef.current = true;
    dragVisitedIdsRef.current = new Set([itemId]);
    setSelectedIds((current) => (current.includes(itemId) ? current : [itemId]));
  }

  return {
    beginSwipeSelection,
    onScroll,
    panHandlers: panResponder.panHandlers,
    registerItemLayout,
  };
}
