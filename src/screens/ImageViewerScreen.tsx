import { Ionicons } from '@expo/vector-icons';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { imageRepository, runWithDatabaseSpace, type ImageListItem } from '../database';
import { SecureImage } from '../components/SecureImage';
import { colors, radius, spacing, typography } from '../design/tokens';
import type { ImageViewerContext } from '../navigation/imageViewerContext';
import { saveImageToSystemAlbum } from '../services/mediaLibraryService';
import { AppActionSheet } from '../components/AppActionSheet';
import { useToast } from '../components/AppToast';
import {
  loadImageViewerPreferences,
  saveImageViewerPreferences,
  type ImageFitMode,
  type ImageReaderMode,
} from '../services/mediaExperiencePreferences';

const DOUBLE_TAP_ZOOM_SCALE = 2.5;
const DOUBLE_TAP_INTERVAL_MS = 260;
const MAX_ZOOM_SCALE = 4;
const MIN_ZOOM_SCALE = 1;
const READER_ZONE_EDGE_RATIO = 0.34;
const FILMSTRIP_ITEM_WIDTH = 44;
const FILMSTRIP_ITEM_GAP = spacing[2];

interface ImageViewerScreenProps {
  imageId: number;
  context: ImageViewerContext;
  refreshToken: number;
  onBack: () => void;
  onOpenDetail: (imageId: number) => void;
}

export function ImageViewerScreen({
  imageId,
  context,
  refreshToken,
  onBack,
  onOpenDetail,
}: ImageViewerScreenProps) {
  const listRef = useRef<FlatList<ImageListItem>>(null);
  const verticalListRef = useRef<FlatList<ImageListItem>>(null);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { width, height } = useWindowDimensions();
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingToAlbum, setIsSavingToAlbum] = useState(false);
  const [isPagingEnabled, setIsPagingEnabled] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionImage, setActionImage] = useState<ImageListItem | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [viewerProgressWidth, setViewerProgressWidth] = useState(1);
  const [readerMode, setReaderMode] = useState<ImageReaderMode>('horizontal-ltr');
  const [fitMode, setFitMode] = useState<ImageFitMode>('contain');
  const [showFilmstrip, setShowFilmstrip] = useState(false);
  const [readerSettingsVisible, setReaderSettingsVisible] = useState(false);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const filmstripSwitchProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(filmstripSwitchProgress, {
      toValue: showFilmstrip ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [filmstripSwitchProgress, showFilmstrip]);

  useEffect(() => {
    let isMounted = true;

    loadImageViewerPreferences()
      .then((preferences) => {
        if (!isMounted) {
          return;
        }
        setReaderMode(preferences.readerMode);
        setFitMode(preferences.fitMode);
        setShowFilmstrip(preferences.showFilmstrip);
      })
      .catch(() => {
        // Preference files are best-effort; the reader should always open.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadImages() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const items = await loadImagesForContext(context);
        if (!isMounted) {
          return;
        }

        const initialIndex = Math.max(0, items.findIndex((item) => item.id === imageId));
        setImages(items);
        setActiveIndex(initialIndex);

        if (items.length > 0) {
          requestAnimationFrame(() => {
            listRef.current?.scrollToIndex({
              animated: false,
              index: initialIndex,
            });
            verticalListRef.current?.scrollToIndex({
              animated: false,
              index: initialIndex,
            });
          });
        }
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取大图失败：${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadImages();

    return () => {
      isMounted = false;
    };
  }, [context, imageId, refreshToken]);

  const activeImage = images[activeIndex] ?? null;
  const pageSize = Math.max(1, width);
  const pageHeight = Math.max(1, height);
  const isVerticalContinuous = readerMode === 'vertical-continuous';
  const viewerProgress = images.length > 1 ? activeIndex / Math.max(1, images.length - 1) : 0;
  const filmstripSwitchTrackColor = filmstripSwitchProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.12)', colors.primary.weak],
  });
  const filmstripSwitchKnobTranslateX = filmstripSwitchProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 24],
  });
  const viewerViewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;
  const handleViewerViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const nextIndex = viewableItems.find((item) => item.isViewable && typeof item.index === 'number')?.index;
    if (typeof nextIndex === 'number') {
      setActiveIndex(nextIndex);
    }
  }).current;

  useEffect(() => {
    Animated.timing(controlsOpacity, {
      toValue: controlsVisible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [controlsOpacity, controlsVisible]);

  useEffect(() => {
    if (!activeImage) {
      return;
    }

    void runWithDatabaseSpace(context.space, (db) => imageRepository.touchLastViewedAt(db, activeImage.id));
  }, [activeImage, context.space]);

  const counterLabel = useMemo(() => {
    if (images.length === 0) {
      return '0 / 0';
    }

    return `${activeIndex + 1} / ${images.length}`;
  }, [activeIndex, images.length]);

  const handleZoomStateChange = useCallback((zoomed: boolean) => {
    setIsPagingEnabled(!zoomed);
  }, []);

  const goToRelativeImage = useCallback(
    (offset: number) => {
      if (images.length <= 1) {
        return;
      }
      jumpToImageIndex(activeIndex + offset);
    },
    [activeIndex, images.length]
  );

  const handleReaderZonePress = useCallback(
    (locationX: number) => {
      const leftBoundary = pageSize * READER_ZONE_EDGE_RATIO;
      const rightBoundary = pageSize * (1 - READER_ZONE_EDGE_RATIO);

      if (locationX <= leftBoundary) {
        goToRelativeImage(readerMode === 'horizontal-rtl' ? 1 : -1);
        return;
      }

      if (locationX >= rightBoundary) {
        goToRelativeImage(readerMode === 'horizontal-rtl' ? -1 : 1);
        return;
      }

      setControlsVisible((visible) => !visible);
    },
    [goToRelativeImage, pageSize, readerMode]
  );

  const onPanAttemptBlockedByZoom = useCallback(() => {
    setControlsVisible(false);
  }, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ImageListItem>) => (
      <ZoomableImage
        fitMode={fitMode}
        height={height}
        image={item}
        onLongPress={handleImageLongPress}
        onPanAttemptBlockedByZoom={onPanAttemptBlockedByZoom}
        onSingleTap={handleReaderZonePress}
        onZoomStateChange={handleZoomStateChange}
        space={context.space}
        width={pageSize}
      />
    ),
    [context.space, fitMode, handleReaderZonePress, handleZoomStateChange, height, onPanAttemptBlockedByZoom, pageSize]
  );

  const renderVerticalItem = useCallback(
    ({ item }: ListRenderItemInfo<ImageListItem>) => (
      <ZoomableImage
        fitMode={fitMode}
        height={pageHeight}
        image={item}
        onLongPress={handleImageLongPress}
        onPanAttemptBlockedByZoom={onPanAttemptBlockedByZoom}
        onSingleTap={handleReaderZonePress}
        onZoomStateChange={handleZoomStateChange}
        space={context.space}
        width={pageSize}
      />
    ),
    [context.space, fitMode, handleReaderZonePress, handleZoomStateChange, onPanAttemptBlockedByZoom, pageHeight, pageSize]
  );

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageSize);
    if (nextIndex >= 0 && nextIndex < images.length) {
      setActiveIndex(nextIndex);
    }
  }

  function handleVerticalMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.y / pageHeight);
    if (nextIndex >= 0 && nextIndex < images.length) {
      setActiveIndex(nextIndex);
    }
  }

  function handleImageLongPress(image: ImageListItem) {
    setActionImage(image);
  }

  function handleReverseOrder() {
    setImages((currentImages) => {
      if (currentImages.length <= 1) {
        return currentImages;
      }

      const nextImages = [...currentImages].reverse();
      const nextIndex = activeIndex;
      setActiveIndex(nextIndex);
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          animated: false,
          index: nextIndex,
        });
        verticalListRef.current?.scrollToIndex({
          animated: false,
          index: nextIndex,
        });
      });
      return nextImages;
    });
  }

  async function handleSaveToAlbum(image: ImageListItem) {
    if (isSavingToAlbum) {
      return;
    }

    setIsSavingToAlbum(true);

    try {
      await saveImageToSystemAlbum(image.originalFileUri);
      showToast('已保存到相册');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`保存相册失败：${message}`);
    } finally {
      setIsSavingToAlbum(false);
    }
  }

  async function toggleFavorite() {
    const image = activeImage;
    if (!image) {
      return;
    }
    const nextFavorite = !image.isFavorite;
    setImages((current) => current.map((item) => (item.id === image.id ? { ...item, isFavorite: nextFavorite } : item)));
    try {
      await runWithDatabaseSpace(context.space, (db) => imageRepository.updateFavorite(db, image.id, nextFavorite));
    } catch (error) {
      setImages((current) => current.map((item) => (item.id === image.id ? { ...item, isFavorite: image.isFavorite } : item)));
      showToast(error instanceof Error ? `更新收藏失败：${error.message}` : '更新收藏失败');
    }
  }

  function persistImageViewerPreferences(nextPreferences: Partial<{
    readerMode: ImageReaderMode;
    fitMode: ImageFitMode;
    showFilmstrip: boolean;
  }>) {
    void saveImageViewerPreferences({
      readerMode,
      fitMode,
      showFilmstrip,
      ...nextPreferences,
    });
  }

  function updateReaderMode(nextMode: ImageReaderMode) {
    setReaderMode(nextMode);
    persistImageViewerPreferences({ readerMode: nextMode });
    requestAnimationFrame(() => jumpToImageIndex(activeIndex));
  }

  function updateFitMode(nextMode: ImageFitMode) {
    setFitMode(nextMode);
    persistImageViewerPreferences({ fitMode: nextMode });
  }

  function updateFilmstripVisibility(nextVisible: boolean) {
    setShowFilmstrip(nextVisible);
    persistImageViewerPreferences({ showFilmstrip: nextVisible });
  }

  function jumpToImageIndex(index: number) {
    if (images.length === 0) {
      return;
    }
    const nextIndex = Math.min(images.length - 1, Math.max(0, index));
    setActiveIndex(nextIndex);
    listRef.current?.scrollToIndex({ animated: false, index: nextIndex });
    verticalListRef.current?.scrollToIndex({ animated: false, index: nextIndex });
  }

  function jumpToProgressLocation(locationX: number) {
    if (images.length <= 1 || viewerProgressWidth <= 0) {
      return;
    }
    jumpToImageIndex(Math.round((locationX / viewerProgressWidth) * (images.length - 1)));
  }

  const viewerProgressPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => jumpToProgressLocation(event.nativeEvent.locationX),
        onPanResponderMove: (event) => jumpToProgressLocation(event.nativeEvent.locationX),
      }),
    [images.length, viewerProgressWidth]
  );

  return (
    <View style={styles.shell}>
      <ExpoStatusBar backgroundColor="#05070A" style="light" translucent />
      <Animated.View style={[styles.topBar, { paddingTop: insets.top + spacing[3], opacity: controlsOpacity }]}>
        <Pressable
          accessibilityLabel="返回"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons color={colors.text.inverse} name="chevron-back" size={22} />
        </Pressable>
        <Text numberOfLines={1} style={styles.counter}>
          {counterLabel}
        </Text>
        <View style={styles.topActions}>
          <Pressable
            accessibilityLabel="阅读设置"
            hitSlop={10}
            onPress={() => setReaderSettingsVisible((visible) => !visible)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.text.inverse} name="options-outline" size={20} />
          </Pressable>
          <Pressable
            accessibilityLabel="一键逆序"
            hitSlop={10}
            onPress={handleReverseOrder}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons color={colors.text.inverse} name="swap-horizontal-outline" size={20} />
          </Pressable>
        </View>
      </Animated.View>

      {readerSettingsVisible ? (
        <Animated.View style={[styles.readerSettingsPanel, { top: insets.top + 74, opacity: controlsOpacity }]}>
          <Text style={styles.readerSettingsTitle}>阅读设置</Text>
          <Text style={styles.readerSettingsLabel}>阅读模式</Text>
          <View style={styles.segmentRow}>
            {([
              ['horizontal-ltr', '横向'],
              ['horizontal-rtl', 'RTL'],
              ['vertical-continuous', '纵向连续'],
            ] as const).map(([mode, label]) => (
              <Pressable
                key={mode}
                onPress={() => updateReaderMode(mode)}
                style={[styles.segmentPill, readerMode === mode && styles.segmentPillActive]}
              >
                <Text style={[styles.segmentText, readerMode === mode && styles.segmentTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.readerSettingsLabel}>适配模式</Text>
          <View style={styles.segmentRow}>
            {([
              ['contain', '完整'],
              ['width', '填宽'],
              ['original', '原始'],
            ] as const).map(([mode, label]) => (
              <Pressable
                key={mode}
                onPress={() => updateFitMode(mode)}
                style={[styles.segmentPill, fitMode === mode && styles.segmentPillActive]}
              >
                <Text style={[styles.segmentText, fitMode === mode && styles.segmentTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => updateFilmstripVisibility(!showFilmstrip)}
            style={({ pressed }) => [styles.readerSwitchRow, pressed && styles.pressed]}
          >
            <Text style={styles.readerSwitchText}>底部缩略图胶片条</Text>
            <Animated.View
              accessibilityLabel={showFilmstrip ? '关闭底部缩略图胶片条' : '打开底部缩略图胶片条'}
              accessibilityRole="switch"
              accessibilityState={{ checked: showFilmstrip }}
              style={[styles.readerSwitchTrack, { backgroundColor: filmstripSwitchTrackColor }]}
            >
              <Animated.View style={[styles.readerSwitchKnob, { transform: [{ translateX: filmstripSwitchKnobTranslateX }] }]} />
            </Animated.View>
          </Pressable>
        </Animated.View>
      ) : null}

      {errorMessage ? (
        <View style={styles.stateWrap}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>正在读取原图...</Text>
        </View>
      ) : images.length === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>没有可浏览的图片。</Text>
        </View>
      ) : isVerticalContinuous ? (
        <FlatList
          data={images}
          getItemLayout={(_, index) => ({
            index,
            length: pageHeight,
            offset: pageHeight * index,
          })}
          initialNumToRender={3}
          key="vertical-continuous"
          keyExtractor={(item) => String(item.id)}
          onMomentumScrollEnd={handleVerticalMomentumScrollEnd}
          onViewableItemsChanged={handleViewerViewableItemsChanged}
          onScrollToIndexFailed={({ index }) => {
            if (images.length === 0) {
              return;
            }

            requestAnimationFrame(() => {
              verticalListRef.current?.scrollToIndex({
                animated: false,
                index: Math.min(index, images.length - 1),
              });
            });
          }}
          ref={verticalListRef}
          renderItem={renderVerticalItem}
          scrollEnabled={isPagingEnabled}
          showsVerticalScrollIndicator={false}
          viewabilityConfig={viewerViewabilityConfig}
          windowSize={5}
        />
      ) : (
        <FlatList
          data={images}
          getItemLayout={(_, index) => ({
            index,
            length: pageSize,
            offset: pageSize * index,
          })}
          horizontal
          initialNumToRender={3}
          inverted={readerMode === 'horizontal-rtl'}
          key={readerMode}
          keyExtractor={(item) => String(item.id)}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onViewableItemsChanged={handleViewerViewableItemsChanged}
          onScrollToIndexFailed={({ index }) => {
            if (images.length === 0) {
              return;
            }

            requestAnimationFrame(() => {
              listRef.current?.scrollToIndex({
                animated: false,
                index: Math.min(index, images.length - 1),
              });
            });
          }}
          pagingEnabled
          ref={listRef}
          renderItem={renderItem}
          scrollEnabled={isPagingEnabled}
          showsHorizontalScrollIndicator={false}
          viewabilityConfig={viewerViewabilityConfig}
          windowSize={3}
        />
      )}

      {activeImage ? (
        <>
          {showFilmstrip ? (
            <Animated.View style={[styles.filmstripDock, { bottom: insets.bottom + 92, opacity: controlsOpacity }]}>
              <Filmstrip
                activeIndex={activeIndex}
                images={images}
                onSelect={jumpToImageIndex}
                space={context.space}
              />
            </Animated.View>
          ) : null}
          <Animated.View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing[4], opacity: controlsOpacity }]}>
            <View style={styles.filenameBlock}>
              <Text numberOfLines={1} style={styles.filename}>
                {activeImage.originalFilename}
              </Text>
              <Text numberOfLines={1} style={styles.metaText}>
                {readerMode === 'vertical-continuous' ? '纵向连续阅读' : readerMode === 'horizontal-rtl' ? 'RTL 阅读' : '横向单页阅读'}
              </Text>
            </View>
            <View
              {...viewerProgressPanResponder.panHandlers}
              onLayout={(event) => setViewerProgressWidth(Math.max(1, event.nativeEvent.layout.width))}
              style={styles.viewerProgressHitArea}
            >
              <View style={styles.viewerProgressTrack}>
                <View style={[styles.viewerProgressFill, { width: `${viewerProgress * 100}%` }]} />
              </View>
              <Text style={styles.viewerProgressText}>{counterLabel}</Text>
            </View>
            <Pressable onPress={() => void toggleFavorite()} style={styles.favoritePill}>
              <Ionicons
                color={activeImage.isFavorite ? colors.semantic.favorite : colors.text.inverse}
                name={activeImage.isFavorite ? 'star' : 'star-outline'}
                size={14}
              />
              <Text style={styles.favoriteText}>{activeImage.isFavorite ? '已收藏' : '未收藏'}</Text>
            </Pressable>
          </Animated.View>
        </>
      ) : null}
      <AppActionSheet
        items={actionImage ? [
          { key: 'detail', label: '查看详情', icon: 'information-circle-outline', onPress: () => onOpenDetail(actionImage.id) },
          { key: 'save', label: isSavingToAlbum ? '保存中' : '保存到相册', icon: 'download-outline', disabled: isSavingToAlbum, onPress: () => void handleSaveToAlbum(actionImage) },
        ] : []}
        onClose={() => setActionImage(null)}
        title={actionImage?.originalFilename ?? '图片操作'}
        visible={Boolean(actionImage)}
      />
    </View>
  );
}

function Filmstrip({
  activeIndex,
  images,
  onSelect,
  space,
}: {
  activeIndex: number;
  images: ImageListItem[];
  onSelect: (index: number) => void;
  space: ImageViewerContext['space'];
}) {
  const filmstripRef = useRef<FlatList<ImageListItem>>(null);

  useEffect(() => {
    if (images.length === 0 || activeIndex < 0 || activeIndex >= images.length) {
      return;
    }

    filmstripRef.current?.scrollToIndex({
      animated: true,
      index: activeIndex,
      viewPosition: 0.5,
    });
  }, [activeIndex, images.length]);

  return (
    <FlatList
      contentContainerStyle={styles.filmstripContent}
      data={images}
      getItemLayout={(_, index) => ({
        index,
        length: FILMSTRIP_ITEM_WIDTH + FILMSTRIP_ITEM_GAP,
        offset: (FILMSTRIP_ITEM_WIDTH + FILMSTRIP_ITEM_GAP) * index,
      })}
      horizontal
      keyExtractor={(item) => `filmstrip-${item.id}`}
      onScrollToIndexFailed={({ index }) => {
        requestAnimationFrame(() => {
          filmstripRef.current?.scrollToIndex({
            animated: true,
            index: Math.min(index, images.length - 1),
            viewPosition: 0.5,
          });
        });
      }}
      ref={filmstripRef}
      renderItem={({ item, index }) => (
        <Pressable
          accessibilityLabel={`跳到第 ${index + 1} 张`}
          onPress={() => onSelect(index)}
          style={[styles.filmstripItem, index === activeIndex && styles.filmstripItemActive]}
        >
          <SecureImage contentFit="cover" space={space} style={styles.filmstripImage} uri={item.thumbnailFileUri ?? item.originalFileUri} />
        </Pressable>
      )}
      showsHorizontalScrollIndicator={false}
    />
  );
}

function ZoomableImage({
  fitMode,
  height,
  image,
  onLongPress,
  onPanAttemptBlockedByZoom,
  onSingleTap,
  onZoomStateChange,
  space,
  width,
}: {
  fitMode: ImageFitMode;
  height: number;
  image: ImageListItem;
  onLongPress: (image: ImageListItem) => void;
  onPanAttemptBlockedByZoom: () => void;
  onSingleTap: (locationX: number) => void;
  onZoomStateChange: (zoomed: boolean) => void;
  space: ImageViewerContext['space'];
  width: number;
}) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const animatedScale = useRef(new Animated.Value(1)).current;
  const lastTapAtRef = useRef(0);
  const lastTouchPointRef = useRef<{ x: number; y: number } | null>(null);
  const tapStartLocationRef = useRef<{ x: number; y: number } | null>(null);
  const didHandleDoubleTapRef = useRef(false);
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);

  useEffect(() => {
    setScale(1);
    animatedScale.setValue(1);
    setTranslate({ x: 0, y: 0 });
    onZoomStateChange(false);
  }, [image.id, onZoomStateChange]);

  function updateScale(nextScale: number) {
    const clampedScale = clamp(nextScale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    setScale(clampedScale);
    animatedScale.setValue(clampedScale);
    if (clampedScale <= 1.01) {
      setTranslate({ x: 0, y: 0 });
      onZoomStateChange(false);
      return;
    }
    onZoomStateChange(true);
  }

  function animateScaleTo(nextScale: number) {
    const clampedScale = clamp(nextScale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    Animated.timing(animatedScale, {
      toValue: clampedScale,
      duration: 180,
      useNativeDriver: true,
    }).start(() => updateScale(clampedScale));
  }

  function handleTouchStart(event: GestureResponderEvent) {
    const touches = event.nativeEvent.touches;
    if (touches.length >= 2) {
      pinchStartRef.current = {
        distance: getTouchDistance(touches[0], touches[1]),
        scale,
      };
      return;
    }

    const touch = touches[0];
    if (!touch) {
      return;
    }
    tapStartLocationRef.current = { x: touch.locationX, y: touch.locationY };

    const now = Date.now();
    if (now - lastTapAtRef.current <= DOUBLE_TAP_INTERVAL_MS) {
      didHandleDoubleTapRef.current = true;
      animateScaleTo(scale > 1.01 ? 1 : DOUBLE_TAP_ZOOM_SCALE);
      lastTapAtRef.current = 0;
      return;
    }

    lastTapAtRef.current = now;
    lastTouchPointRef.current = { x: touch.pageX, y: touch.pageY };
  }

  function handleTouchMove(event: GestureResponderEvent) {
    const touches = event.nativeEvent.touches;
    if (touches.length >= 2 && pinchStartRef.current) {
      const nextDistance = getTouchDistance(touches[0], touches[1]);
      if (pinchStartRef.current.distance > 0) {
        updateScale(pinchStartRef.current.scale * (nextDistance / pinchStartRef.current.distance));
      }
      return;
    }

    const touch = touches[0];
    if (!touch || scale <= 1.01 || !lastTouchPointRef.current) {
      return;
    }

    onPanAttemptBlockedByZoom();
    const deltaX = touch.pageX - lastTouchPointRef.current.x;
    const deltaY = touch.pageY - lastTouchPointRef.current.y;
    lastTouchPointRef.current = { x: touch.pageX, y: touch.pageY };
    setTranslate((current) => ({
      x: current.x + deltaX,
      y: current.y + deltaY,
    }));
  }

  function handleTouchEnd() {
    pinchStartRef.current = null;
    lastTouchPointRef.current = null;
    if (didHandleDoubleTapRef.current) {
      didHandleDoubleTapRef.current = false;
      tapStartLocationRef.current = null;
      return;
    }
    if (scale <= 1.01) {
      updateScale(1);
      onSingleTap(tapStartLocationRef.current?.x ?? width / 2);
    }
    tapStartLocationRef.current = null;
  }

  const imageFit: 'cover' | 'contain' = fitMode === 'width' ? 'cover' : 'contain';

  return (
    <Pressable
      accessibilityLabel={`查看原图：${image.originalFilename}`}
      accessibilityRole="imagebutton"
      onLongPress={() => onLongPress(image)}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      style={[styles.page, { height, width }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.zoomLayer,
          {
            transform: [
              { translateX: translate.x },
              { translateY: translate.y },
              { scale: animatedScale },
            ],
          },
        ]}
      >
        <SecureImage contentFit={imageFit} space={space} style={styles.image} uri={image.originalFileUri} />
      </Animated.View>
    </Pressable>
  );
}

function getTouchDistance(
  first: GestureResponderEvent['nativeEvent']['touches'][number],
  second: GestureResponderEvent['nativeEvent']['touches'][number]
): number {
  const deltaX = first.pageX - second.pageX;
  const deltaY = first.pageY - second.pageY;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function loadImagesForContext(context: ImageViewerContext): Promise<ImageListItem[]> {
  return runWithDatabaseSpace(context.space, async (db) => {
    if (context.type === 'ip-recent') {
      return imageRepository.findRecentByIpId(db, context.ipId, context.limit);
    }

    if (context.type === 'import-batch') {
      return imageRepository.findByImportBatchId(db, context.importBatchId);
    }

    if (context.type === 'image-scope') {
      return imageRepository.findByIds(db, context.imageIds);
    }

    if (context.type === 'ip-all') {
      const { filter } = context;
      if (filter.type === 'favorite') {
        return imageRepository.findByIpId(db, context.ipId, { favoritesOnly: true });
      }

      if (filter.type === 'ungrouped') {
        return imageRepository.findByIpId(db, context.ipId, { ungroupedOnly: true });
      }

      if (filter.type === 'untagged') {
        return imageRepository.findByIpId(db, context.ipId, { untaggedOnly: true });
      }

      if (filter.type === 'recent-viewed') {
        return imageRepository.findByIpId(db, context.ipId, { recentlyViewedOnly: true, orderBy: 'lastViewedAtDesc' });
      }

      if (filter.type === 'mime') {
        return imageRepository.findByIpId(db, context.ipId, { mimeType: filter.mimeType });
      }

      if (filter.type === 'aspect') {
        return imageRepository.findByIpId(db, context.ipId, { aspectRatio: filter.aspectRatio });
      }

      if (filter.type === 'size') {
        return imageRepository.findByIpId(db, context.ipId, {
          minFileSize: filter.minFileSize,
          maxFileSize: filter.maxFileSize,
        });
      }

      if (filter.type === 'group') {
        return imageRepository.findByGroupId(db, filter.groupId);
      }

      if (filter.type === 'tag') {
        return imageRepository.findByIpId(db, context.ipId, { tagId: filter.tagId });
      }

      return imageRepository.findByIpId(db, context.ipId);
    }

    if (context.type === 'group') {
      return imageRepository.findByGroupId(db, context.groupId);
    }

    if (context.type === 'tag') {
      return imageRepository.findByTagId(db, context.tagId);
    }

    if (context.type === 'favorites') {
      return imageRepository.findFavorites(db);
    }

    return imageRepository.findRecentViewed(db);
  });
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#05070A',
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  counter: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
  },
  topActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  readerSettingsPanel: {
    backgroundColor: 'rgba(20, 24, 30, 0.94)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    left: spacing[4],
    padding: spacing[3],
    position: 'absolute',
    right: spacing[4],
    zIndex: 3,
  },
  readerSettingsTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
  },
  readerSettingsLabel: {
    ...typography.textStyles.micro,
    color: 'rgba(255,255,255,0.58)',
    fontWeight: '700',
    marginTop: spacing[1],
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  segmentPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 70,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  segmentPillActive: {
    backgroundColor: colors.primary.weak,
  },
  segmentText: {
    ...typography.textStyles.micro,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '700',
    textAlign: 'center',
  },
  segmentTextActive: {
    color: colors.primary.active,
  },
  readerSwitchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  readerSwitchText: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
  },
  readerSwitchTrack: {
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 52,
  },
  readerSwitchKnob: {
    backgroundColor: colors.text.inverse,
    borderRadius: radius.pill,
    height: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.24,
    shadowRadius: 3,
    width: 22,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  zoomLayer: {
    height: '100%',
    width: '100%',
  },
  filmstripDock: {
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 2,
  },
  filmstripContent: {
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  filmstripItem: {
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.md,
    borderWidth: 1,
    height: 58,
    opacity: 0.72,
    overflow: 'hidden',
    width: 44,
  },
  filmstripItemActive: {
    borderColor: colors.primary.hover,
    opacity: 1,
    transform: [{ translateY: -3 }],
  },
  filmstripImage: {
    height: '100%',
    width: '100%',
  },
  bottomBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 7, 10, 0.66)',
    flexDirection: 'row',
    gap: spacing[3],
    left: 0,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  viewerProgressHitArea: {
    flex: 1,
    gap: spacing[1],
    justifyContent: 'center',
    minHeight: 36,
  },
  viewerProgressTrack: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    height: 3,
    overflow: 'hidden',
  },
  viewerProgressFill: {
    backgroundColor: colors.primary.hover,
    borderRadius: radius.pill,
    height: '100%',
  },
  viewerProgressText: {
    ...typography.textStyles.micro,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'right',
  },
  filenameBlock: {
    flex: 0.9,
    gap: spacing[1],
    minWidth: 0,
  },
  filename: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
  },
  metaText: {
    ...typography.textStyles.micro,
    color: 'rgba(255, 255, 255, 0.68)',
  },
  favoritePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 32,
    paddingHorizontal: spacing[2],
  },
  favoriteText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '500',
  },
  stateWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing[5],
  },
  stateText: {
    ...typography.textStyles.body,
    color: colors.text.inverse,
    textAlign: 'center',
  },
  errorText: {
    ...typography.textStyles.body,
    color: colors.semantic.danger,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});
