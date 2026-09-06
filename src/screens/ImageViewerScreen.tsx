import { VolumeManager } from 'react-native-volume-manager';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  PixelRatio,
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

import {
  imageRepository,
  runWithDatabaseSpace,
  type ImageListItem,
  type MediaPageCursor,
  type MediaPageResult,
} from '../database';
import { SecureImage } from '../components/SecureImage';
import { colors, radius, spacing, typography } from '../design/tokens';
import type { ImageViewerContext } from '../navigation/imageViewerContext';
import { saveImageToSystemAlbum } from '../services/mediaLibraryService';
import { AppActionSheet } from '../components/AppActionSheet';
import { useToast } from '../components/AppToast';
import { addNativeMemoryPressureListener } from '../native/pixoryMediaModule';
import { globalViewState } from '../services/globalViewState';
import {
  loadImageViewerPreferences,
  saveImageViewerPreferences,
  type ImageFitMode,
  type ImageReaderMode,
} from '../services/mediaExperiencePreferences';
import { getDataEpoch } from '../services/dataEpochService';
import { MediaImagePrefetchCoordinator } from '../media/mediaImagePrefetchCoordinator';
import type { MediaMemoryPressure } from '../media/mediaPrefetchPolicy';
import { MediaLastViewedQueue } from '../media/mediaLastViewedQueue';
import {
  buildMediaReaderCursorRequest,
  MEDIA_READER_INITIAL_WINDOW_SIZE,
  MEDIA_READER_PAGE_SIZE,
} from '../media/mediaReaderContextQuery';
import {
  createMediaReaderContextKey,
  getMediaReaderSession,
  setMediaReaderSession,
  type MediaReaderSessionBoundary,
} from '../media/mediaReaderSessionCache';

const DOUBLE_TAP_ZOOM_SCALE = 2.5;
const DOUBLE_TAP_INTERVAL_MS = 260;
const MAX_ZOOM_SCALE = 4;
const MIN_ZOOM_SCALE = 1;
const READER_ZONE_EDGE_RATIO = 0.34;
const FILMSTRIP_ITEM_WIDTH = 30;
const FILMSTRIP_ITEM_GAP = spacing[2];
const MEDIA_READER_BOUNDARY_THRESHOLD = 40;

interface ReaderWindowResult {
  items: ImageListItem[];
  leadingBoundary: MediaReaderSessionBoundary;
  trailingBoundary: MediaReaderSessionBoundary;
}

interface ImageViewerScreenProps {
  imageId: number;
  context: ImageViewerContext;
  refreshToken: number;
  onBack: () => void;
  onRefreshed: () => void;
  onOpenDetail: (imageId: number) => void;
}

export function ImageViewerScreen({
  imageId,
  context,
  onBack,
  onRefreshed,
  onOpenDetail,
}: ImageViewerScreenProps) {
  const listRef = useRef<FlatList<ImageListItem>>(null);
  const verticalListRef = useRef<FlatList<ImageListItem>>(null);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { width, height } = useWindowDimensions();
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [initialListIndex, setInitialListIndex] = useState(0);
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
  const [memoryPressure, setMemoryPressure] = useState<MediaMemoryPressure>('normal');
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const filmstripSwitchProgress = useRef(new Animated.Value(0)).current;
  const leadingBoundaryRef = useRef<MediaReaderSessionBoundary>({ cursor: null, direction: 'before', hasMore: false });
  const trailingBoundaryRef = useRef<MediaReaderSessionBoundary>({ cursor: null, direction: 'after', hasMore: false });
  const isLoadingBoundaryRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const pendingRetainedImageIdRef = useRef<number | null>(null);
  const lastScrollSampleRef = useRef<{ direction: -1 | 1; velocity: number }>({ direction: 1, velocity: 0 });
  const onRefreshedRef = useRef(onRefreshed);
  onRefreshedRef.current = onRefreshed;
  const sessionContextKey = useMemo(
    () => createMediaReaderContextKey(context),
    [context]
  );
  const mediaEpoch = useMemo(
    () => getDataEpoch('media', context.space),
    [context.space, imageId, sessionContextKey]
  );
  const decodeMaxWidth = Math.max(1, Math.ceil(width * PixelRatio.get()));
  const decodeMaxHeight = Math.max(1, Math.ceil(height * PixelRatio.get()));
  const prefetchCoordinator = useMemo(
    () => new MediaImagePrefetchCoordinator({
      decodeImage: (uri) => ExpoImage.loadAsync(uri, { maxWidth: decodeMaxWidth, maxHeight: decodeMaxHeight }),
      prefetchEncoded: (uri, cachePolicy) => ExpoImage.prefetch(uri, { cachePolicy }),
    }),
    [decodeMaxHeight, decodeMaxWidth]
  );
  const lastViewedQueue = useMemo(
    () => new MediaLastViewedQueue({
      flushIds: (ids) => runWithDatabaseSpace(context.space, (db) => imageRepository.touchLastViewedAtMany(db, [...ids])),
      // Do NOT call onRefreshed here — lastViewedAt is silent background metadata.
      // Triggering onRefreshed causes the parent list (AllImagesScreen etc.) to
      // re-fetch and flash its thumbnails every time the user returns from the viewer.
    }),
    [context.space]
  );

  useEffect(() => () => prefetchCoordinator.dispose(), [prefetchCoordinator]);
  useEffect(() => () => { void lastViewedQueue.dispose(); }, [lastViewedQueue]);
  useEffect(() => {
    const subscription = addNativeMemoryPressureListener((event) => {
      if (event.high) {
        setMemoryPressure('high');
      }
    });
    return () => subscription.remove();
  }, []);

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
    const generation = ++loadGenerationRef.current;

    async function loadImages() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const cached = getMediaReaderSession<ImageListItem>(context.space, sessionContextKey, mediaEpoch);
        const restored = cached?.entryId === imageId ? cached : undefined;
        const window = restored
          ? {
              items: [...restored.items],
              leadingBoundary: restored.leadingBoundary ?? {
                cursor: restored.newerCursor,
                direction: 'before' as const,
                hasMore: restored.hasNewer,
              },
              trailingBoundary: restored.trailingBoundary ?? {
                cursor: restored.olderCursor,
                direction: 'after' as const,
                hasMore: restored.hasOlder,
              },
            }
          : await loadImageReaderWindow(context, imageId);
        if (!isMounted || generation !== loadGenerationRef.current) {
          return;
        }

        const targetId = restored?.currentId ?? imageId;
        const initialIndex = Math.max(0, window.items.findIndex((item) => item.id === targetId));
        leadingBoundaryRef.current = window.leadingBoundary;
        trailingBoundaryRef.current = window.trailingBoundary;
        setInitialListIndex(initialIndex);
        setImages(window.items);
        setActiveIndex(initialIndex);
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
  }, [context, imageId, mediaEpoch, sessionContextKey]);

  const activeImage = images[activeIndex] ?? null;
  const pageSize = Math.max(1, width);
  const pageHeight = Math.max(1, height);
  const isVerticalContinuous = readerMode === 'vertical-continuous';
  const displayIndex = scrubIndex !== null ? scrubIndex : activeIndex;
  const viewerProgress = images.length > 1 ? displayIndex / Math.max(1, images.length - 1) : 0;
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
    lastViewedQueue.enqueue(activeImage.id);
    globalViewState.lastViewedImageId = activeImage.id;
  }, [activeImage, lastViewedQueue]);

  useEffect(() => {
    if (images.length === 0) {
      return;
    }
    prefetchCoordinator.updateTarget({
      items: images,
      index: activeIndex,
      direction: lastScrollSampleRef.current.direction,
      memoryPressure,
      velocity: lastScrollSampleRef.current.velocity,
      space: context.space,
    });
  }, [activeIndex, context.space, images, memoryPressure, prefetchCoordinator]);

  useEffect(() => {
    if (!activeImage || images.length === 0) {
      return;
    }
    const halfWindow = Math.floor(MEDIA_READER_INITIAL_WINDOW_SIZE / 2);
    const start = Math.max(0, activeIndex - halfWindow);
    const end = Math.min(images.length, start + MEDIA_READER_INITIAL_WINDOW_SIZE);
    const adjustedStart = Math.max(0, end - MEDIA_READER_INITIAL_WINDOW_SIZE);
    const sessionItems = images.slice(adjustedStart, end);
    const sessionIndex = Math.max(0, sessionItems.findIndex((item) => item.id === activeImage.id));
    const cursorRequest = buildMediaReaderCursorRequest(context);
    const leadingBoundary = adjustedStart > 0 && sessionItems[0] && cursorRequest
      ? {
          cursor: createReaderCursor(sessionItems[0], cursorRequest.orderBy),
          direction: leadingBoundaryRef.current.direction,
          hasMore: true,
        }
      : leadingBoundaryRef.current;
    const trailingBoundary = end < images.length && sessionItems[sessionItems.length - 1] && cursorRequest
      ? {
          cursor: createReaderCursor(sessionItems[sessionItems.length - 1], cursorRequest.orderBy),
          direction: trailingBoundaryRef.current.direction,
          hasMore: true,
        }
      : trailingBoundaryRef.current;

    setMediaReaderSession(context.space, sessionContextKey, mediaEpoch, {
      currentId: activeImage.id,
      currentIndex: sessionIndex,
      entryId: imageId,
      hasNewer: leadingBoundary.hasMore,
      hasOlder: trailingBoundary.hasMore,
      items: sessionItems,
      leadingBoundary,
      newerCursor: leadingBoundary.cursor,
      olderCursor: trailingBoundary.cursor,
      trailingBoundary,
    });
  }, [activeImage, activeIndex, context, context.space, imageId, images, mediaEpoch, sessionContextKey]);

  const counterLabel = useMemo(() => {
    if (images.length === 0) {
      return '0 / 0';
    }

    return `${displayIndex + 1} / ${images.length}`;
  }, [displayIndex, images.length]);

  const handleZoomStateChange = useCallback((zoomed: boolean) => {
    setIsPagingEnabled(!zoomed);
  }, []);

  const imagesLengthRef = useRef(images.length);
  imagesLengthRef.current = images.length;

  const jumpToImageIndex = useCallback((index: number) => {
    if (imagesLengthRef.current === 0) {
      return;
    }
    const nextIndex = Math.min(imagesLengthRef.current - 1, Math.max(0, index));
    setActiveIndex(nextIndex);
    listRef.current?.scrollToIndex({ animated: false, index: nextIndex });
    verticalListRef.current?.scrollToIndex({ animated: false, index: nextIndex });
  }, []);

  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const activeImageIdRef = useRef(activeImage?.id ?? null);
  activeImageIdRef.current = activeImage?.id ?? null;

  useLayoutEffect(() => {
    const retainedId = pendingRetainedImageIdRef.current;
    if (retainedId == null) {
      return;
    }
    pendingRetainedImageIdRef.current = null;
    const retainedIndex = images.findIndex((item) => item.id === retainedId);
    if (retainedIndex < 0) {
      return;
    }
    setActiveIndex(retainedIndex);
    listRef.current?.scrollToIndex({ animated: false, index: retainedIndex });
    verticalListRef.current?.scrollToIndex({ animated: false, index: retainedIndex });
  }, [images]);

  const loadReaderBoundary = useCallback(async (placement: 'leading' | 'trailing') => {
    if (isLoadingBoundaryRef.current) {
      return;
    }
    const request = buildMediaReaderCursorRequest(context);
    const boundaryRef = placement === 'leading' ? leadingBoundaryRef : trailingBoundaryRef;
    const boundary = boundaryRef.current;
    if (!request || !boundary.hasMore || !boundary.cursor) {
      return;
    }

    isLoadingBoundaryRef.current = true;
    const generation = loadGenerationRef.current;
    try {
      const page = await runWithDatabaseSpace(context.space, (db) => imageRepository.findFilteredCursorPage(db, {
        ...request,
        cursor: boundary.cursor as MediaPageCursor,
        direction: boundary.direction,
        limit: MEDIA_READER_PAGE_SIZE,
      }));
      if (generation !== loadGenerationRef.current) {
        return;
      }
      if (page.items.length === 0) {
        boundaryRef.current = { ...boundary, hasMore: false };
        return;
      }

      boundaryRef.current = resolveNextReaderBoundary(page, boundary.direction);
      const displayedItems = leadingBoundaryRef.current.direction === 'after'
        ? [...page.items].reverse()
        : page.items;
      const activeId = activeImageIdRef.current;
      if (placement === 'leading') {
        pendingRetainedImageIdRef.current = activeId;
      }
      setImages((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        const uniqueItems = displayedItems.filter((item) => !existingIds.has(item.id));
        if (uniqueItems.length === 0) {
          pendingRetainedImageIdRef.current = null;
          return current;
        }
        const next = placement === 'leading'
          ? [...uniqueItems, ...current]
          : [...current, ...uniqueItems];
        return next;
      });
    } catch (error) {
      console.warn('Pixory image reader boundary load failed.', {
        message: error instanceof Error ? error.message : 'unknown reader boundary error',
        placement,
      });
    } finally {
      isLoadingBoundaryRef.current = false;
    }
  }, [context]);

  useEffect(() => {
    if (images.length === 0) {
      return;
    }
    if (activeIndex <= MEDIA_READER_BOUNDARY_THRESHOLD) {
      void loadReaderBoundary('leading');
    }
    if (activeIndex >= images.length - 1 - MEDIA_READER_BOUNDARY_THRESHOLD) {
      void loadReaderBoundary('trailing');
    }
  }, [activeIndex, images.length, loadReaderBoundary]);

  const goToRelativeImage = useCallback(
    (offset: number) => {
      if (imagesLengthRef.current <= 1) {
        return;
      }
      jumpToImageIndex(activeIndexRef.current + offset);
    },
    [jumpToImageIndex]
  );


  const baselineVolumeRef = useRef<number | null>(null);

  useEffect(() => {
    const isVideo = activeImage?.mediaType === 'video';
    
    if (isVideo) {
      VolumeManager.showNativeVolumeUI({ enabled: true });
      return;
    }

    VolumeManager.showNativeVolumeUI({ enabled: false });

    VolumeManager.getVolume().then(({ volume }) => {
      // 保证基准音量不在极端值，否则按键可能无法触发系统事件
      if (volume <= 0.05 || volume >= 0.95) {
        baselineVolumeRef.current = 0.5;
        VolumeManager.setVolume(0.5);
      } else {
        baselineVolumeRef.current = volume;
      }
    });

    const subscription = VolumeManager.addVolumeListener((result) => {
      if (baselineVolumeRef.current === null) return;

      // 如果是代码调用 setVolume 引起的恢复事件，或者是极微小的浮点数误差，忽略
      if (Math.abs(result.volume - baselineVolumeRef.current) < 0.001) {
        return;
      }

      if (result.volume > baselineVolumeRef.current) {
        // 音量加 -> 往前翻
        goToRelativeImage(-1);
      } else {
        // 音量减 -> 往后翻
        goToRelativeImage(1);
      }

      // 翻页后，立即将系统音量恢复到基准值，从而做到“拦截且不改变真实音量”
      VolumeManager.setVolume(baselineVolumeRef.current);
    });

    return () => {
      VolumeManager.showNativeVolumeUI({ enabled: true });
      subscription.remove();
    };
  }, [activeImage?.mediaType, goToRelativeImage]);

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

  const handleImageLongPress = useCallback((image: ImageListItem) => {
    setActionImage(image);
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
    [context.space, fitMode, handleReaderZonePress, handleZoomStateChange, height, onPanAttemptBlockedByZoom, pageSize, handleImageLongPress]
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
    [context.space, fitMode, handleReaderZonePress, handleZoomStateChange, onPanAttemptBlockedByZoom, pageHeight, pageSize, handleImageLongPress]
  );

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageSize);
    if (nextIndex >= 0 && nextIndex < images.length) {
      const indexDelta = nextIndex - activeIndexRef.current;
      lastScrollSampleRef.current = {
        direction: indexDelta < 0 ? -1 : 1,
        velocity: Math.abs(event.nativeEvent.velocity?.x ?? indexDelta),
      };
      setActiveIndex(nextIndex);
    }
  }

  function handleVerticalMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.y / pageHeight);
    if (nextIndex >= 0 && nextIndex < images.length) {
      const indexDelta = nextIndex - activeIndexRef.current;
      lastScrollSampleRef.current = {
        direction: indexDelta < 0 ? -1 : 1,
        velocity: Math.abs(event.nativeEvent.velocity?.y ?? indexDelta),
      };
      setActiveIndex(nextIndex);
    }
  }

  function handleReverseOrder() {
    if (images.length <= 1) {
      return;
    }
    const nextIndex = images.length - 1 - activeIndexRef.current;
    const previousLeadingBoundary = leadingBoundaryRef.current;
    leadingBoundaryRef.current = trailingBoundaryRef.current;
    trailingBoundaryRef.current = previousLeadingBoundary;
    setInitialListIndex(nextIndex);
    setImages([...images].reverse());
    setActiveIndex(nextIndex);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ animated: false, index: nextIndex });
      verticalListRef.current?.scrollToIndex({ animated: false, index: nextIndex });
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
      onRefreshed();
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
    setInitialListIndex(activeIndexRef.current);
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

  function calculateScrubIndex(locationX: number) {
    if (images.length <= 1 || viewerProgressWidth <= 0) {
      return 0;
    }
    return clamp(Math.round((locationX / viewerProgressWidth) * (images.length - 1)), 0, images.length - 1);
  }

  const viewerProgressPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          setScrubIndex(calculateScrubIndex(event.nativeEvent.locationX));
        },
        onPanResponderMove: (event) => {
          setScrubIndex(calculateScrubIndex(event.nativeEvent.locationX));
        },
        onPanResponderRelease: (event) => {
          const finalIndex = calculateScrubIndex(event.nativeEvent.locationX);
          setScrubIndex(null);
          jumpToImageIndex(finalIndex);
        },
        onPanResponderTerminate: () => setScrubIndex(null),
      }),
    [images.length, viewerProgressWidth, jumpToImageIndex]
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
          initialScrollIndex={initialListIndex}
          initialNumToRender={5}
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
          windowSize={7}
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
          initialScrollIndex={initialListIndex}
          initialNumToRender={5}
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
          windowSize={5}
        />
      )}

      {activeImage ? (
        <Animated.View style={[styles.bottomContainer, { paddingBottom: Math.max(insets.bottom, spacing[2]), opacity: controlsOpacity }]}>
          {showFilmstrip ? (
            <View style={styles.filmstripDock}>
              <Filmstrip
                activeIndex={activeIndex}
                images={images}
                onSelect={jumpToImageIndex}
                space={context.space}
              />
            </View>
          ) : null}
          <View style={styles.bottomBarRow}>
            <Text style={styles.viewerProgressText}>{counterLabel}</Text>
            <View
              {...viewerProgressPanResponder.panHandlers}
              onLayout={(event) => setViewerProgressWidth(Math.max(1, event.nativeEvent.layout.width))}
              style={styles.viewerProgressHitArea}
            >
              <View style={styles.viewerProgressTrack}>
                <View style={[styles.viewerProgressFill, { width: `${viewerProgress * 100}%` }]} />
              </View>
            </View>
            <View style={styles.bottomToolbar}>
              <Pressable accessibilityLabel={activeImage.isFavorite ? '取消收藏' : '收藏'} onPress={() => void toggleFavorite()} style={styles.toolbarIcon}>
                <Ionicons
                  color={activeImage.isFavorite ? colors.semantic.favorite : colors.text.inverse}
                  name={activeImage.isFavorite ? 'star' : 'star-outline'}
                  size={20}
                />
              </Pressable>
              <Pressable accessibilityLabel="详细信息" onPress={() => onOpenDetail(activeImage.id)} style={styles.toolbarIcon}>
                <Ionicons name="information-circle-outline" size={24} color={colors.text.inverse} />
              </Pressable>
            </View>
          </View>
        </Animated.View>
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

const ZoomableImage = memo(function ZoomableImage({
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
});

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

async function loadImageReaderWindow(context: ImageViewerContext, anchorId: number): Promise<ReaderWindowResult> {
  return runWithDatabaseSpace(context.space, async (db) => {
    if (context.type === 'ip-recent') {
      const items = await imageRepository.findRecentByIpId(db, context.ipId, context.limit);
      return {
        items,
        leadingBoundary: { cursor: null, direction: 'before', hasMore: false },
        trailingBoundary: { cursor: null, direction: 'after', hasMore: false },
      };
    }

    const request = buildMediaReaderCursorRequest(context);
    if (!request) {
      return {
        items: [],
        leadingBoundary: { cursor: null, direction: 'before', hasMore: false },
        trailingBoundary: { cursor: null, direction: 'after', hasMore: false },
      };
    }
    const items = await imageRepository.findAllFiltered(db, request);
    return {
      items,
      leadingBoundary: { cursor: null, direction: 'before', hasMore: false },
      trailingBoundary: { cursor: null, direction: 'after', hasMore: false },
    };
  });
}

function resolveNextReaderBoundary(
  page: MediaPageResult<ImageListItem>,
  direction: 'before' | 'after'
): MediaReaderSessionBoundary {
  return direction === 'before'
    ? { cursor: page.newerCursor, direction, hasMore: page.hasNewer }
    : { cursor: page.olderCursor, direction, hasMore: page.hasOlder };
}

function createReaderCursor(
  item: ImageListItem,
  orderBy: import('../database').MediaCursorSortOrder | undefined
): MediaPageCursor {
  if (orderBy === 'lastViewedAtDesc') {
    return { id: item.id, sortValue: item.lastViewedAt };
  }
  if (orderBy === 'sourceOrderAsc') {
    return { id: item.id, sortValue: item.sourceOrder ?? item.id };
  }
  return { id: item.id, sortValue: item.createdAt };
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
    width: '100%',
    marginBottom: spacing[1],
  },
  filmstripContent: {
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3], // Provide vertical space so scaled item isn't clipped
  },
  filmstripItem: {
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 30,
    opacity: 0.5,
    overflow: 'hidden',
    width: 30,
  },
  filmstripItemActive: {
    borderColor: colors.text.inverse,
    opacity: 1,
    transform: [{ scale: 1.25 }], // More pronounced scale, now it won't clip
  },
  filmstripImage: {
    height: '100%',
    width: '100%',
  },
  bottomContainer: {
    backgroundColor: 'rgba(5, 7, 10, 0.72)',
    bottom: 0,
    left: 0,
    paddingTop: spacing[2],
    position: 'absolute',
    right: 0,
  },
  bottomBarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    height: 44,
    paddingHorizontal: spacing[4],
    width: '100%',
  },
  viewerProgressText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    minWidth: 54,
  },
  viewerProgressHitArea: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  viewerProgressTrack: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    height: 4,
    overflow: 'hidden',
  },
  viewerProgressFill: {
    backgroundColor: colors.text.inverse,
    borderRadius: radius.pill,
    height: '100%',
  },
  bottomToolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  toolbarIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    width: 32,
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
