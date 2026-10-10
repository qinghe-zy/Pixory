import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  useAnimatedRef,
  useAnimatedScrollHandler,
  scrollTo,
  type SharedValue,
  useFrameCallback,
  runOnUI,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';

import { typography } from '../design/tokens';
import { protoColors } from './OrganizeShared';
import { loadIpRailOrders, saveIpRailOrder, sortIpsByOrder } from '../utils/ipRailOrderStore';

export interface IpRailItem {
  id: number;
  name: string;
  groupCount?: number;
}

interface IpRailProps {
  ips: IpRailItem[];
  selectedIpId: number | null;
  onSelectIp: (id: number | null) => void;
  showAllOption?: boolean;
  allOptionLabel?: string;
  allOptionBadgeCount?: number;
  onCreateIp?: () => void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  railId?: string;
}

const DODGE_SPRING = { damping: 24, stiffness: 260, mass: 0.8 };
const DROP_SPRING = { damping: 30, stiffness: 300, mass: 1 };
const GAP = 6;

function SortableIpPill({
  ip,
  isSelected,
  onSelectIp,
  svDomOrder,
  currentOrder,
  itemWidths,
  isDraggingId,
  onDragEnd,
  scrollViewRef,
  scrollX,
  railWidth,
  contentWidth,
}: {
  ip: IpRailItem;
  isSelected: boolean;
  onSelectIp: (id: number | null) => void;
  svDomOrder: SharedValue<number[]>;
  currentOrder: SharedValue<number[]>;
  itemWidths: SharedValue<Record<number, number>>;
  isDraggingId: SharedValue<number>;
  onDragEnd: (newOrder: number[]) => void;
  scrollViewRef: any;
  scrollX: SharedValue<number>;
  railWidth: SharedValue<number>;
  contentWidth: SharedValue<number>;
}) {
  const isDragging = useSharedValue(false);
  const translateX = useSharedValue(0); // For resting and dodging
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const zIndex = useSharedValue(0);
  
  // Drag state
  const startX = useSharedValue(0);
  const fingerTranslationX = useSharedValue(0);
  const initialScrollX = useSharedValue(0);

  const getOriginalX = useCallback(() => {
    'worklet';
    let x = 0;
    const domOrder = svDomOrder.value;
    for (let i = 0; i < domOrder.length; i++) {
      const id = domOrder[i];
      if (id === ip.id) break;
      x += (itemWidths.value[id] || 0) + GAP;
    }
    return x;
  }, [ip.id]);

  const getTargetX = useCallback((curOrder: number[]) => {
    'worklet';
    let x = 0;
    for (let i = 0; i < curOrder.length; i++) {
      const id = curOrder[i];
      if (id === ip.id) break;
      x += (itemWidths.value[id] || 0) + GAP;
    }
    return x;
  }, [ip.id]);

  useAnimatedReaction(
    () => {
      return { cur: currentOrder.value, dom: svDomOrder.value };
    },
    ({ cur, dom }) => {
      if (isDraggingId.value === ip.id) return;
      
      const myCurIndex = cur.indexOf(ip.id);
      const myDomIndex = dom.indexOf(ip.id);
      if (myCurIndex === -1 || myDomIndex === -1) return;
      
      const originalX = getOriginalX();
      const targetX = getTargetX(cur);
      
      translateX.value = withSpring(targetX - originalX, DODGE_SPRING);
    }
  );

  const evaluateDodging = () => {
    'worklet';
    const originalX = getOriginalX();
    const currentVisualX = originalX + startX.value + fingerTranslationX.value + (scrollX.value - initialScrollX.value);
    const myWidth = itemWidths.value[ip.id] || 0;
    
    const rightEdge = currentVisualX + myWidth;
    const leftEdge = currentVisualX;
    
    const curOrder = [...currentOrder.value];
    const myIndex = curOrder.indexOf(ip.id);
    
    let newIndex = myIndex;
    let visualX = 0;
    
    // Leading-Edge-to-Center collision model
    for (let i = 0; i < curOrder.length; i++) {
      const itemId = curOrder[i];
      const width = itemWidths.value[itemId] || 0;
      const itemCenter = visualX + width / 2;
      
      if (i !== myIndex && width > 0) {
        if (myIndex < i && rightEdge > itemCenter) {
          newIndex = i;
        } else if (myIndex > i && leftEdge < itemCenter) {
          newIndex = i;
          break;
        }
      }
      visualX += width + GAP;
    }
    
    if (newIndex !== myIndex) {
      curOrder.splice(myIndex, 1);
      curOrder.splice(newIndex, 0, ip.id);
      currentOrder.value = curOrder;
    }
  };

  const frameCallback = useFrameCallback(() => {
    if (!isDragging.value) return;
    
    const originalX = getOriginalX();
    const currentVisualX = originalX + startX.value + fingerTranslationX.value + (scrollX.value - initialScrollX.value);
    
    // Calculate button position relative to the visible screen frame
    const screenX = currentVisualX - scrollX.value; 
    const myWidth = itemWidths.value[ip.id] || 0;
    const screenRight = screenX + myWidth;
    
    let scrollDelta = 0;
    const HOT_ZONE = 100; // Increased hot zone distance to leave more operational space
    const MAX_SPEED = 12; // Max speed at the extreme edge
    const MIN_SPEED = 2;  // Min speed when just entering the hot zone
    
    if (railWidth.value > 0) {
      if (screenRight > railWidth.value - HOT_ZONE) {
        // Calculate how deep the item is into the right hot zone (0 to HOT_ZONE)
        const penetration = Math.min(HOT_ZONE, screenRight - (railWidth.value - HOT_ZONE));
        scrollDelta = MIN_SPEED + (penetration / HOT_ZONE) * (MAX_SPEED - MIN_SPEED);
      } else if (screenX < HOT_ZONE) {
        // Calculate how deep the item is into the left hot zone (0 to HOT_ZONE)
        const penetration = Math.min(HOT_ZONE, HOT_ZONE - screenX);
        scrollDelta = -(MIN_SPEED + (penetration / HOT_ZONE) * (MAX_SPEED - MIN_SPEED));
      }
    }
    
    if (scrollDelta !== 0 && railWidth.value > 0) {
      const maxScroll = Math.max(0, contentWidth.value - railWidth.value);
      const newScroll = Math.max(0, Math.min(scrollX.value + scrollDelta, maxScroll));
      
      if (newScroll !== scrollX.value) {
        scrollTo(scrollViewRef, newScroll, 0, false);
        // We evaluate dodging here because scrolling changes visual X relative to siblings
        evaluateDodging();
      }
    }
  }, false); // start paused

  const setFrameCallbackActive = (active: boolean) => {
    frameCallback.setActive(active);
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(150)
    .onStart(() => {
      isDragging.value = true;
      isDraggingId.value = ip.id;
      
      // Visually shrink and make transparent to see buttons underneath
      scale.value = withSpring(0.9, { damping: 15, stiffness: 300 });
      opacity.value = withTiming(0.65, { duration: 150 });
      zIndex.value = 100;
      
      startX.value = translateX.value;
      fingerTranslationX.value = 0;
      initialScrollX.value = scrollX.value;
      runOnJS(setFrameCallbackActive)(true);
    })
    .onUpdate((e) => {
      fingerTranslationX.value = e.translationX;
      evaluateDodging();
    })
    .onEnd(() => {
      if (!isDragging.value) return;
      isDragging.value = false;
      isDraggingId.value = -1;
      runOnJS(setFrameCallbackActive)(false);
      
      scale.value = withSpring(1, DROP_SPRING);
      opacity.value = withTiming(1, { duration: 150 });
      zIndex.value = 0;
      
      const curOrder = currentOrder.value;
      const originalX = getOriginalX();
      const targetX = getTargetX(curOrder);
      
      // Ensure translateX captures the final dragged position (including auto-scroll offsets)
      // so it springs back seamlessly instead of jumping.
      translateX.value = startX.value + fingerTranslationX.value + (scrollX.value - initialScrollX.value);
      translateX.value = withSpring(targetX - originalX, DROP_SPRING);
      
      runOnJS(onDragEnd)(curOrder);
    });

  const dragTranslateX = useSharedValue(0);
  
  useAnimatedReaction(
    () => {
      if (!isDragging.value) return translateX.value;
      return startX.value + fingerTranslationX.value + (scrollX.value - initialScrollX.value);
    },
    (res) => {
      dragTranslateX.value = res;
    }
  );

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: isDragging.value ? dragTranslateX.value : translateX.value },
        { scale: scale.value }
      ],
      opacity: opacity.value,
      zIndex: zIndex.value,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: isDragging.value ? 6 : 0 },
      shadowOpacity: isDragging.value ? 0.2 : 0,
      shadowRadius: isDragging.value ? 10 : 0,
      elevation: isDragging.value ? 8 : 0,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View 
        style={animatedStyle}
        onLayout={(e) => {
          const { width } = e.nativeEvent.layout;
          const id = ip.id;
          runOnUI((pillId: number, pillWidth: number) => {
            'worklet';
            if (itemWidths.value[pillId] !== pillWidth) {
              const newWidths = { ...itemWidths.value };
              newWidths[pillId] = pillWidth;
              itemWidths.value = newWidths;
              currentOrder.value = [...currentOrder.value];
            }
          })(id, width);
        }}
      >
        <Animated.View style={styles.pressableContainer}>
          <Pressable onPress={() => onSelectIp(ip.id)} style={[styles.ipPill, isSelected ? styles.ipPillActive : styles.ipPillInactive]}>
            {!isSelected && <View style={styles.ipPillDot} />}
            <Text style={[styles.ipPillText, isSelected ? styles.ipPillTextActive : styles.ipPillTextInactive]}>{ip.name}</Text>
            {ip.groupCount !== undefined && (
              <View style={isSelected ? styles.ipPillBadgeActive : styles.ipPillBadgeInactive}>
                <Text style={[styles.ipPillBadgeText, isSelected ? styles.ipPillBadgeTextActive : styles.ipPillBadgeTextInactive]}>{ip.groupCount}</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

export function IpRail({
  ips: rawIps,
  selectedIpId,
  onSelectIp,
  showAllOption = true,
  allOptionLabel = '全部 IP',
  allOptionBadgeCount,
  onCreateIp,
  style,
  contentContainerStyle,
  railId,
}: IpRailProps) {
  const latestOrderRef = useRef<number[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    if (railId) {
      loadIpRailOrders().then((orders) => {
        if (active) {
          if (orders[railId]) {
            latestOrderRef.current = orders[railId];
          }
          setIsLoaded(true);
        }
      });
    } else {
      setIsLoaded(true);
    }
    return () => { active = false; };
  }, [railId]);

  const [domOrderIds, setDomOrderIds] = useState<number[]>([]);
  const domOrderIdsRef = useRef<number[]>([]);
  
  const svDomOrder = useSharedValue<number[]>([]);
  const currentOrder = useSharedValue<number[]>([]);
  const itemWidths = useSharedValue<Record<number, number>>({});
  const isDraggingId = useSharedValue(-1);
  
  const scrollX = useSharedValue(0);
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>();
  const railWidth = useSharedValue(0);
  const contentWidth = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
      contentWidth.value = e.contentSize.width;
      railWidth.value = e.layoutMeasurement.width;
    },
  });

  useEffect(() => {
    if (!isLoaded) return;
    
    const currentRawIds = rawIps.map(ip => ip.id);
    const prevDomIds = domOrderIdsRef.current;
    
    const isSameSet = prevDomIds.length === currentRawIds.length && 
                      prevDomIds.every(id => currentRawIds.includes(id));
                      
    if (!isSameSet) {
      const ordered = sortIpsByOrder(rawIps, latestOrderRef.current);
      const newDomIds = ordered.map(ip => ip.id);
      domOrderIdsRef.current = newDomIds;
      setDomOrderIds(newDomIds);
    }
  }, [rawIps, isLoaded]);

  useEffect(() => {
    if (domOrderIds.length > 0) {
      svDomOrder.value = domOrderIds;
      if (isDraggingId.value === -1) {
        currentOrder.value = domOrderIds;
      }
    }
  }, [domOrderIds]);

  const handleDragEnd = useCallback((newOrder: number[]) => {
    latestOrderRef.current = newOrder; 
    if (railId) {
      saveIpRailOrder(railId, newOrder);
    }
  }, [railId]);

  const renderedIps = useMemo(() => {
    if (domOrderIds.length === 0) return [];
    
    const map = new Map(rawIps.map(ip => [ip.id, ip]));
    const result: IpRailItem[] = [];
    
    for (const id of domOrderIds) {
      if (map.has(id)) result.push(map.get(id)!);
    }
    
    for (const ip of rawIps) {
      if (!domOrderIds.includes(ip.id)) result.push(ip);
    }
    return result;
  }, [rawIps, domOrderIds]);

  if (!isLoaded || renderedIps.length === 0) {
    return null;
  }

  return (
    <Animated.ScrollView 
      ref={scrollViewRef}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      horizontal 
      showsHorizontalScrollIndicator={false} 
      style={style}
      contentContainerStyle={[styles.ipRail, contentContainerStyle]}
    >
      {showAllOption && (
        <Pressable
          onPress={() => onSelectIp(null)}
          style={[styles.ipPill, selectedIpId === null ? styles.ipPillActive : styles.ipPillInactive]}
        >
          <Text style={[styles.ipPillText, selectedIpId === null ? styles.ipPillTextActive : styles.ipPillTextInactive]}>{allOptionLabel}</Text>
          {allOptionBadgeCount !== undefined && (
            <View style={selectedIpId === null ? styles.ipPillBadgeActive : styles.ipPillBadgeInactive}>
              <Text style={[styles.ipPillBadgeText, selectedIpId === null ? styles.ipPillBadgeTextActive : styles.ipPillBadgeTextInactive]}>{allOptionBadgeCount}</Text>
            </View>
          )}
        </Pressable>
      )}

      {renderedIps.map((ip) => (
        <SortableIpPill
          key={ip.id}
          ip={ip}
          isSelected={selectedIpId === ip.id}
          onSelectIp={onSelectIp}
          svDomOrder={svDomOrder}
          currentOrder={currentOrder}
          itemWidths={itemWidths}
          isDraggingId={isDraggingId}
          onDragEnd={handleDragEnd}
          scrollViewRef={scrollViewRef}
          scrollX={scrollX}
          railWidth={railWidth}
          contentWidth={contentWidth}
        />
      ))}

      {onCreateIp && (
        <Pressable onPress={onCreateIp} style={styles.createBtn}>
          <MaterialIcons name="add" size={16} color={protoColors.onSurface} />
          <Text style={styles.createBtnText}>新建 IP</Text>
        </Pressable>
      )}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  ipRail: {
    gap: 6,
    paddingVertical: 4, 
    alignItems: 'center',
    paddingHorizontal: 16,
    flexDirection: 'row',
  },
  pressableContainer: {
  },
  ipPill: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ipPillActive: {
    backgroundColor: protoColors.primary,
  },
  ipPillInactive: {
    backgroundColor: protoColors.surfaceContainerLowest,
    borderColor: 'rgba(196,199,199,0.3)',
    borderWidth: StyleSheet.hairlineWidth,
  },
  ipPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: protoColors.primary,
  },
  ipPillText: {
    fontFamily: typography.family.base,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    fontWeight: '600',
  },
  ipPillTextActive: {
    color: protoColors.onPrimary,
  },
  ipPillTextInactive: {
    color: protoColors.onSurface,
  },
  ipPillBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  ipPillBadgeInactive: {
    backgroundColor: protoColors.surfaceContainerLow,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  ipPillBadgeText: {
    fontFamily: typography.family.mono,
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '500',
    letterSpacing: 0.72,
  },
  ipPillBadgeTextActive: {
    color: protoColors.onPrimary,
  },
  ipPillBadgeTextInactive: {
    color: protoColors.secondary,
  },
  createBtn: {
    height: 28,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: protoColors.surfaceContainerLowest,
    borderColor: 'rgba(196,199,199,0.3)',
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  createBtnText: {
    fontFamily: typography.family.base,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.66,
    fontWeight: '600',
    color: protoColors.onSurface,
  },
});