import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Brightness from 'expo-brightness';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VolumeManager } from 'react-native-volume-manager';

import { AppActionSheet, type AppActionSheetItem } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { SecureImage } from '../components/SecureImage';
import { assetRepository, imageRepository, ipRepository, runWithDatabaseSpace, type ImageDetailRecord, type ImageListItem, type IpListItem, type PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useToast } from '../components/AppToast';
import { importVideosToIp, saveVideoToSystemAlbum, type PickedVideoAsset } from '../services/videoImportService';
import { loadVideoPlayerPreferences, saveVideoPlayerPreferences } from '../services/mediaExperiencePreferences';
import { formatDuration } from '../utils/formatters';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 2, 3] as const;
const CONTROL_HIDE_DELAY_MS = 5000;
const PLAYBACK_PROGRESS_SAVE_INTERVAL_MS = 10000;
const DOUBLE_TAP_PAUSE_WINDOW_MS = 280;
const SCRUB_PREVIEW_SEEK_INTERVAL_MS = 90;
const SURFACE_SCRUB_ACTIVATION_PX = 3;
const GESTURE_DOUBLE_TAP_SEEK_SECONDS = 10;
const VERTICAL_GESTURE_ACTIVATION_PX = 8;
const VERTICAL_GESTURE_FULL_HEIGHT_RATIO = 0.58;
const CENTER_VIDEO_SWITCH_LEFT_RATIO = 0.28;
const CENTER_VIDEO_SWITCH_RIGHT_RATIO = 0.72;
const CENTER_VIDEO_SWITCH_MIN_DISTANCE_PX = 72;
const CENTER_VIDEO_SWITCH_DOMINANCE_RATIO = 1.25;
const VIDEO_SWITCH_EXIT_DURATION_MS = 170;
const VIDEO_SWITCH_ENTER_DURATION_MS = 210;
const VIDEO_SWITCH_CANCEL_DURATION_MS = 140;
const COMMITTED_SEEK_SETTLE_TIMEOUT_MS = 1400;
const COMMITTED_SEEK_TOLERANCE_SECONDS = 0.35;
const SURFACE_SEEK_SHORT_SECONDS = 30;
const SURFACE_SEEK_MEDIUM_SECONDS = 5 * 60;
const SURFACE_SEEK_LONG_SECONDS = 30 * 60;
const SURFACE_SEEK_EPISODE_SECONDS = 120 * 60;
const SURFACE_SEEK_SHORT_SCREEN_RATIO = 0.5;
const SURFACE_SEEK_MEDIUM_SCREEN_RATIO = 0.3;
const SURFACE_SEEK_LONG_SCREEN_RATIO = 0.22;
const SURFACE_SEEK_EPISODE_SCREEN_RATIO = 0.15;
const SURFACE_SEEK_SUPER_LONG_MIN_SECONDS_PER_SCREEN = 15 * 60;
const SURFACE_SEEK_SUPER_LONG_MAX_SECONDS_PER_SCREEN = 20 * 60;
const SURFACE_SEEK_SUPER_LONG_TARGET_RATIO = 0.08;
const SURFACE_SEEK_DAMPING_LOW_RATIO = 0.2;
const SURFACE_SEEK_DAMPING_HIGH_RATIO = 0.55;
const SURFACE_SEEK_DAMPING_LOW_FACTOR = 0.7;
const SURFACE_SEEK_DAMPING_MID_FACTOR = 1;
const SURFACE_SEEK_DAMPING_HIGH_FACTOR = 1.25;
const SURFACE_SEEK_FINE_LIGHT_PX = 60;
const SURFACE_SEEK_FINE_MEDIUM_PX = 120;
const SURFACE_SEEK_FINE_HIGH_PX = 200;
const SURFACE_SEEK_FINE_LIGHT_FACTOR = 0.6;
const SURFACE_SEEK_FINE_MEDIUM_FACTOR = 0.35;
const SURFACE_SEEK_FINE_HIGH_FACTOR = 0.15;

type GestureFeedbackKind = 'seek-backward' | 'seek-forward' | 'play' | 'pause' | 'brightness' | 'volume' | 'locked' | 'unlocked';

interface GestureFeedbackState {
  kind: GestureFeedbackKind;
  label: string;
  value?: number;
}

interface VideoPlayerScreenProps {
  videoId?: number;
  externalSource?: PickedVideoAsset;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
}

function getLandscapeStateFromOrientation(orientation: ScreenOrientation.Orientation): boolean | null {
  if (orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT || orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT) {
    return true;
  }
  if (orientation === ScreenOrientation.Orientation.PORTRAIT_UP || orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN) {
    return false;
  }
  return null;
}

export function VideoPlayerScreen({
  videoId,
  externalSource,
  space = 'normal',
  refreshToken,
  onBack,
}: VideoPlayerScreenProps) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [activeVideoId, setActiveVideoId] = useState(videoId ?? 0);
  const [video, setVideo] = useState<ImageDetailRecord | null>(null);
  const [queue, setQueue] = useState<ImageListItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [holdSpeed, setHoldSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(3);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speedMenuVisible, setSpeedMenuVisible] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [holdSpeedVisible, setHoldSpeedVisible] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isSurfaceScrubbing, setIsSurfaceScrubbing] = useState(false);
  const [scrubDisplayTime, setScrubDisplayTime] = useState(0);
  const [scrubGestureHint, setScrubGestureHint] = useState<string | null>(null);
  const [isPlayerLocked, setIsPlayerLocked] = useState(false);
  const [gestureFeedback, setGestureFeedback] = useState<GestureFeedbackState | null>(null);
  const [brightnessOverlayOpacity, setBrightnessOverlayOpacity] = useState(0);
  const [ipPickerVisible, setIpPickerVisible] = useState(false);
  const [normalIps, setNormalIps] = useState<IpListItem[]>([]);
  const [newIpDialogVisible, setNewIpDialogVisible] = useState(false);
  const [newIpName, setNewIpName] = useState('');
  const [isSavingToIp, setIsSavingToIp] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isVideoSwitchTransitioning, setIsVideoSwitchTransitioning] = useState(false);
  const [switchPreviewVideo, setSwitchPreviewVideo] = useState<ImageListItem | null>(null);
  const [trackWidth, setTrackWidth] = useState(1);
  const [surfaceWidth, setSurfaceWidth] = useState(1);
  const [surfaceHeight, setSurfaceHeight] = useState(1);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPreviewSeekTimeRef = useRef<number | null>(null);
  const lastPreviewSeekAtRef = useRef(0);
  const progressTrackRef = useRef<View>(null);
  const trackPageXRef = useRef(0);
  const trackWidthRef = useRef(1);
  const committedSeekTargetRef = useRef<number | null>(null);
  const committedSeekStartedAtRef = useRef(0);
  const sourceLoadVersionRef = useRef(0);
  const currentTimeRef = useRef(0);
  const scrubDisplayTimeRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const holdWasPlayingRef = useRef(false);
  const isHoldingFastForwardRef = useRef(false);
  const scrubStartTimeRef = useRef(0);
  const verticalGestureStartValueRef = useRef(0);
  const verticalGestureKindRef = useRef<'brightness' | 'volume' | null>(null);
  const surfaceGestureModeRef = useRef<'pending' | 'scrub' | 'vertical' | 'video-switch' | 'hold' | null>(null);
  const lastSurfaceTapAtRef = useRef(0);
  const lastSurfacePressLocationXRef = useRef(0);
  const queueVisibleRef = useRef(false);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const floatingMenuOpacity = useRef(new Animated.Value(0)).current;
  const floatingMenuTranslateY = useRef(new Animated.Value(10)).current;
  const videoSwitchTranslateY = useRef(new Animated.Value(0)).current;

  const activeVideoSource = switchPreviewVideo ?? video;
  const sourceUri = externalSource?.uri ?? activeVideoSource?.originalFileUri ?? null;
  const sourceFileName = externalSource?.fileName ?? activeVideoSource?.originalFilename ?? 'video.mp4';

  const player = useVideoPlayer(null, (instance) => {
    instance.timeUpdateEventInterval = 0.25;
    instance.playbackRate = speed;
    instance.loop = true;
  });

  useEffect(() => {
    Animated.timing(controlsOpacity, {
      toValue: controlsVisible ? 1 : 0,
      duration: controlsVisible ? 140 : 180,
      useNativeDriver: true,
    }).start();
  }, [controlsOpacity, controlsVisible]);

  useEffect(() => {
    const isFloatingMenuVisible = speedMenuVisible || queueVisible || moreVisible;
    if (isFloatingMenuVisible) {
      floatingMenuTranslateY.setValue(10);
    }
    Animated.parallel([
      Animated.timing(floatingMenuOpacity, {
        toValue: isFloatingMenuVisible ? 1 : 0,
        duration: isFloatingMenuVisible ? 150 : 110,
        useNativeDriver: true,
      }),
      Animated.spring(floatingMenuTranslateY, {
        toValue: isFloatingMenuVisible ? 0 : 8,
        damping: 18,
        mass: 0.7,
        stiffness: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [floatingMenuOpacity, floatingMenuTranslateY, moreVisible, queueVisible, speedMenuVisible]);

  useEffect(() => {
    queueVisibleRef.current = queueVisible;
    if (queueVisible) {
      setControlsVisible(true);
      clearHideTimer();
    }
  }, [queueVisible]);

  useEffect(() => {
    let isMounted = true;
    const syncLandscapeState = (orientation: ScreenOrientation.Orientation) => {
      const nextIsLandscape = getLandscapeStateFromOrientation(orientation);
      if (isMounted && nextIsLandscape != null) {
        setIsLandscape(nextIsLandscape);
      }
    };

    void ScreenOrientation.getOrientationAsync().then(syncLandscapeState).catch(() => undefined);
    const orientationSubscription = ScreenOrientation.addOrientationChangeListener((event) => {
      syncLandscapeState(event.orientationInfo.orientation);
    });

    void loadVideoPlayerPreferences().then((preferences) => {
      if (!isMounted) {
        return;
      }
      if (SPEED_OPTIONS.includes(preferences.speed as (typeof SPEED_OPTIONS)[number])) {
        setSpeed(preferences.speed as (typeof SPEED_OPTIONS)[number]);
      }
      if (SPEED_OPTIONS.includes(preferences.holdSpeed as (typeof SPEED_OPTIONS)[number])) {
        setHoldSpeed(preferences.holdSpeed as (typeof SPEED_OPTIONS)[number]);
      }
      setIsPlayerLocked(preferences.lockedByDefault);
      if (preferences.orientationPreference === 'landscape') {
        setIsLandscape(true);
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
      }
    });
    void VolumeManager.showNativeVolumeUI({ enabled: false }).catch(() => undefined);
    return () => {
      isMounted = false;
      ScreenOrientation.removeOrientationChangeListener(orientationSubscription);
      if (gestureFeedbackTimerRef.current) {
        clearTimeout(gestureFeedbackTimerRef.current);
        gestureFeedbackTimerRef.current = null;
      }
      void Brightness.restoreSystemBrightnessAsync().catch(() => undefined);
      void VolumeManager.showNativeVolumeUI({ enabled: true }).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    setActiveVideoId(videoId ?? 0);
    setSwitchPreviewVideo(null);
  }, [videoId]);

  useEffect(() => {
    if (externalSource) {
      setVideo(null);
      setSwitchPreviewVideo(null);
      setQueue([]);
      const initialDisplayTime = 0;
      currentTimeRef.current = initialDisplayTime;
      setCurrentTime(initialDisplayTime);
      setDuration(0);
      return;
    }
    if (!activeVideoId) {
      return;
    }
    let isMounted = true;

    async function load() {
      const detail = await runWithDatabaseSpace(space, (db) => assetRepository.findVideoDetailById(db, activeVideoId));
      if (!isMounted) {
        return;
      }
      if (!detail) {
        showToast('没有找到这个视频');
        onBack();
        return;
      }
      setVideo(detail);
      setSwitchPreviewVideo((current) => (current?.id === detail.id ? null : current));
      const savedTime = (detail.lastPlaybackPositionMs ?? 0) / 1000;
      currentTimeRef.current = savedTime;
      setCurrentTime(savedTime);
      const queueItems = await runWithDatabaseSpace(space, (db) => assetRepository.findQueueVideosByIpId(db, detail.ipId));
      if (isMounted) {
        setQueue(queueItems);
        void runWithDatabaseSpace(space, (db) => imageRepository.touchLastViewedAt(db, detail.id));
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [activeVideoId, externalSource, onBack, refreshToken, showToast, space]);

  useEffect(() => {
    if (!sourceUri) {
      return;
    }
    let isActive = true;
    const loadVersion = sourceLoadVersionRef.current + 1;
    sourceLoadVersionRef.current = loadVersion;
    safePausePlayer();
    const initialDisplayTime = !externalSource && activeVideoSource?.lastPlaybackPositionMs && activeVideoSource.lastPlaybackPositionMs > 1000
      ? activeVideoSource.lastPlaybackPositionMs / 1000
      : 0;
    currentTimeRef.current = initialDisplayTime;
    setCurrentTime(initialDisplayTime);
    setDuration(0);
    committedSeekTargetRef.current = initialDisplayTime > 0 ? initialDisplayTime : null;
    committedSeekStartedAtRef.current = Date.now();
    setIsPlaying(false);
    void player.replaceAsync({ uri: sourceUri }).then(() => {
      if (!isActive || sourceLoadVersionRef.current !== loadVersion) {
        return;
      }
      player.timeUpdateEventInterval = 0.25;
      player.playbackRate = speed;
      player.loop = true;
      if (initialDisplayTime > 0) {
        player.currentTime = initialDisplayTime;
        currentTimeRef.current = initialDisplayTime;
      }
      safePlayPlayer();
    }).catch((error) => {
      if (isActive) {
        showToast(error instanceof Error ? `视频加载失败：${error.message}` : '视频加载失败');
      }
    });
    return () => {
      isActive = false;
    };
  }, [activeVideoSource?.id, externalSource, player, showToast, sourceUri]);

  useEffect(() => {
    player.playbackRate = speed;
    void saveVideoPlayerPreferences({ speed });
  }, [player, speed]);

  useEffect(() => {
    void saveVideoPlayerPreferences({ holdSpeed });
  }, [holdSpeed]);

  useEffect(() => {
    const timeSubscription = player.addListener('timeUpdate', (payload) => {
      if (isScrubbingRef.current) {
        return;
      }
      if (shouldIgnoreStaleTimeUpdate(payload.currentTime)) {
        return;
      }
      currentTimeRef.current = payload.currentTime;
      setCurrentTime(payload.currentTime);
      setDuration(Number.isFinite(player.duration) && player.duration > 0 ? player.duration : duration);
    });
    const playingSubscription = player.addListener('playingChange', (payload) => {
      setIsPlaying(payload.isPlaying);
    });
    const sourceSubscription = player.addListener('sourceLoad', (payload) => {
      setDuration(payload.duration);
    });

    return () => {
      timeSubscription.remove();
      playingSubscription.remove();
      sourceSubscription.remove();
    };
  }, [duration, player]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      clearHideTimer();
      clearLongPressTimer();
      clearPreviewSeekTimer();
      safePausePlayer();
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
      if (!externalSource && video) {
        void runWithDatabaseSpace(space, (db) => assetRepository.updatePlaybackPosition(db, video.id, Math.round(currentTimeRef.current * 1000)));
      }
    };
  }, [externalSource, space, video]);

  useEffect(() => {
    const persistPlaybackPosition = () => {
      if (!externalSource && video) {
        void runWithDatabaseSpace(space, (db) => assetRepository.updatePlaybackPosition(db, video.id, Math.round(currentTimeRef.current * 1000)));
      }
    };
    const interval = !externalSource && video ? setInterval(persistPlaybackPosition, PLAYBACK_PROGRESS_SAVE_INTERVAL_MS) : null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        safePausePlayer();
        persistPlaybackPosition();
      }
    });

    return () => {
      if (interval) {
        clearInterval(interval);
      }
      subscription.remove();
    };
  }, [externalSource, player, space, video]);

  const displayTime = isScrubbing ? scrubDisplayTime : currentTime;
  const progress = duration > 0 ? Math.min(1, Math.max(0, displayTime / duration)) : 0;
  const currentIndex = queue.findIndex((item) => item.id === activeVideoId);
  const floatingPanelAnimatedStyle = {
    opacity: floatingMenuOpacity,
    transform: [{ translateY: floatingMenuTranslateY }],
  };
  const videoSwitchAnimatedStyle = {
    transform: [{ translateY: videoSwitchTranslateY }],
  };

  const moreItems: AppActionSheetItem[] = useMemo(
    () => [
      {
        key: 'save-local',
        label: '保存本地',
        icon: 'download-outline',
        onPress: handleSaveLocal,
      },
      ...(externalSource
        ? [
            {
              key: 'save-ip',
              label: '保存到 IP',
              icon: 'albums-outline' as const,
              onPress: openSaveToIp,
            },
          ]
        : []),
    ],
    [externalSource, video]
  );

  const seekPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          showControls();
          beginScrub();
          measureProgressTrack();
          updateScrubFromTrackPageX(event.nativeEvent.pageX);
        },
        onPanResponderMove: (event) => {
          updateScrubFromTrackPageX(event.nativeEvent.pageX);
        },
        onPanResponderRelease: commitScrub,
        onPanResponderTerminate: cancelScrub,
      }),
    [duration, player, trackWidth]
  );

  const surfacePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          if (isPlayerLocked || isVideoSwitchTransitioning) {
            return false;
          }
          const absDx = Math.abs(gestureState.dx);
          const absDy = Math.abs(gestureState.dy);
          return (
            (absDx > SURFACE_SCRUB_ACTIVATION_PX && absDx > absDy) ||
            (absDy > VERTICAL_GESTURE_ACTIVATION_PX && absDy > absDx)
          );
        },
        onPanResponderGrant: (event) => {
          surfaceGestureModeRef.current = 'pending';
          lastSurfacePressLocationXRef.current = event.nativeEvent.locationX;
          if (isPlayerLocked || isVideoSwitchTransitioning) {
            return;
          }
          longPressTimerRef.current = setTimeout(() => {
            if (surfaceGestureModeRef.current !== 'pending') {
              return;
            }
            surfaceGestureModeRef.current = 'hold';
            startHoldFastForward();
          }, 260);
        },
        onPanResponderMove: (event, gestureState) => {
          if (isPlayerLocked || isVideoSwitchTransitioning) {
            return;
          }
          const absDx = Math.abs(gestureState.dx);
          const absDy = Math.abs(gestureState.dy);
          if (surfaceGestureModeRef.current === 'pending') {
            const shouldScrub = absDx > SURFACE_SCRUB_ACTIVATION_PX && absDx > absDy;
            const shouldAdjustVertically = absDy > VERTICAL_GESTURE_ACTIVATION_PX && absDy > absDx;
            if (!shouldScrub && !shouldAdjustVertically) {
              return;
            }
            clearLongPressTimer();
            if (shouldAdjustVertically) {
              if (shouldSwitchVideoFromCenterVerticalGesture(event.nativeEvent.locationX, absDx, absDy)) {
                surfaceGestureModeRef.current = 'video-switch';
                updateVideoSwitchDrag(gestureState.dy);
                return;
              }
              showControls();
              surfaceGestureModeRef.current = 'vertical';
              void beginVerticalGesture(event);
              return;
            }
            surfaceGestureModeRef.current = 'scrub';
            beginScrub('surface');
            scrubStartTimeRef.current = currentTimeRef.current;
          }
          if (verticalGestureKindRef.current) {
            updateVerticalGesture(gestureState.dy);
            return;
          }
          if (surfaceGestureModeRef.current === 'video-switch') {
            updateVideoSwitchDrag(gestureState.dy);
            return;
          }
          if (surfaceGestureModeRef.current !== 'scrub') {
            return;
          }
          updateScrubFromSurfaceGesture(gestureState.dx, gestureState.dy);
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (surfaceGestureModeRef.current === 'pending') {
            surfaceGestureModeRef.current = null;
            clearLongPressTimer();
            handleSurfacePress();
            return;
          }
          if (surfaceGestureModeRef.current === 'hold') {
            surfaceGestureModeRef.current = null;
            finishHoldFastForward();
            return;
          }
          if (verticalGestureKindRef.current) {
            surfaceGestureModeRef.current = null;
            finishVerticalGesture();
            return;
          }
          if (surfaceGestureModeRef.current === 'video-switch') {
            surfaceGestureModeRef.current = null;
            finishCenterVideoSwitchGesture(gestureState.dy);
            return;
          }
          surfaceGestureModeRef.current = null;
          commitScrub();
        },
        onPanResponderTerminate: () => {
          if (surfaceGestureModeRef.current === 'hold') {
            finishHoldFastForward();
            surfaceGestureModeRef.current = null;
            return;
          }
          if (verticalGestureKindRef.current) {
            finishVerticalGesture();
            surfaceGestureModeRef.current = null;
            return;
          }
          if (surfaceGestureModeRef.current === 'video-switch') {
            surfaceGestureModeRef.current = null;
            resetVideoSwitchDrag();
            return;
          }
          if (surfaceGestureModeRef.current === 'scrub') {
            cancelScrub();
          } else {
            clearLongPressTimer();
          }
          surfaceGestureModeRef.current = null;
        },
        onShouldBlockNativeResponder: () => true,
      }),
    [activeVideoId, currentIndex, duration, externalSource, holdSpeed, isLandscape, isPlayerLocked, isPlaying, isVideoSwitchTransitioning, player, queue.length, speed, surfaceWidth, surfaceHeight]
  );

  async function handleSaveLocal() {
    if (!sourceUri) {
      return;
    }
    try {
      await saveVideoToSystemAlbum(sourceUri, sourceFileName);
      showToast('已保存到系统视频目录');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`保存失败：${message}`);
    }
  }

  async function openSaveToIp() {
    if (!externalSource) {
      return;
    }
    const ips = await runWithDatabaseSpace('normal', (db) => ipRepository.findLibraryItems(db));
    setNormalIps(ips);
    setIpPickerVisible(true);
  }

  async function saveExternalVideoToIp(ipId: number) {
    if (!externalSource || isSavingToIp) {
      return;
    }
    setIsSavingToIp(true);
    try {
      await importExternalVideoToIp(ipId);
      showToast('已保存到 IP');
      setIpPickerVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`保存到 IP 失败：${message}`);
    } finally {
      setIsSavingToIp(false);
    }
  }

  async function createIpAndSaveExternalVideo() {
    const preparedName = newIpName.trim();
    if (!preparedName || isSavingToIp) {
      return;
    }
    setIsSavingToIp(true);
    let createdIpId: number | null = null;
    try {
      const createdIp = await runWithDatabaseSpace('normal', (db) => ipRepository.create(db, { name: preparedName }));
      createdIpId = createdIp.id;
      await importExternalVideoToIp(createdIp.id);
      setNewIpDialogVisible(false);
      setNewIpName('');
      setIpPickerVisible(false);
      showToast('已新建 IP 并保存');
    } catch (error) {
      if (createdIpId != null) {
        await runWithDatabaseSpace('normal', (db) => db.runAsync('DELETE FROM ips WHERE id = ?', createdIpId)).catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`新建 IP 失败：${message}`);
    } finally {
      setIsSavingToIp(false);
    }
  }

  async function importExternalVideoToIp(ipId: number) {
    if (!externalSource) {
      throw new Error('外部视频不可用。');
    }
    await importVideosToIp({
      space: 'normal',
      ipId,
      pickedAssets: [externalSource],
      title: '保存外部视频',
    });
  }

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function resetHideTimer() {
    clearHideTimer();
    if (queueVisibleRef.current) {
      return;
    }
    hideTimerRef.current = setTimeout(() => {
      if (queueVisibleRef.current) {
        hideTimerRef.current = null;
        return;
      }
      setControlsVisible(false);
      setSpeedMenuVisible(false);
      setQueueVisible(false);
    }, CONTROL_HIDE_DELAY_MS);
  }

  function showControls() {
    setControlsVisible(true);
    resetHideTimer();
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearInterval(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setHoldSpeedVisible(false);
  }

  function clearPreviewSeekTimer() {
    if (previewSeekTimerRef.current) {
      clearTimeout(previewSeekTimerRef.current);
      previewSeekTimerRef.current = null;
    }
    pendingPreviewSeekTimeRef.current = null;
  }

  function flushPreviewSeek() {
    const pendingTime = pendingPreviewSeekTimeRef.current;
    pendingPreviewSeekTimeRef.current = null;
    if (pendingTime == null) {
      return;
    }
    player.currentTime = pendingTime;
    lastPreviewSeekAtRef.current = Date.now();
  }

  function safePausePlayer() {
    try {
      player.pause();
      setIsPlaying(false);
    } catch {
      // The expo-video shared object may already be released during teardown.
    }
  }

  function safePlayPlayer() {
    try {
      player.play();
      setIsPlaying(true);
    } catch (error) {
      showToast(error instanceof Error ? `播放失败：${error.message}` : '播放失败');
      setIsPlaying(false);
    }
  }

  function startHoldFastForward() {
    showControls();
    clearLongPressTimer();
    isHoldingFastForwardRef.current = true;
    holdWasPlayingRef.current = isPlaying;
    setHoldSpeedVisible(true);
    const previousSpeed = player.playbackRate;
    player.playbackRate = holdSpeed;
    safePlayPlayer();
    longPressTimerRef.current = setInterval(() => {
      currentTimeRef.current = player.currentTime;
      setCurrentTime(player.currentTime);
    }, 150);
    return () => {
      player.playbackRate = previousSpeed;
      clearLongPressTimer();
    };
  }

  function finishHoldFastForward() {
    player.playbackRate = speed;
    if (isHoldingFastForwardRef.current && !holdWasPlayingRef.current) {
      safePausePlayer();
    }
    isHoldingFastForwardRef.current = false;
    clearLongPressTimer();
  }

  function togglePlay() {
    showControls();
    if (isPlaying) {
      safePausePlayer();
    } else {
      safePlayPlayer();
    }
  }

  function showGestureFeedback(nextFeedback: GestureFeedbackState) {
    if (gestureFeedbackTimerRef.current) {
      clearTimeout(gestureFeedbackTimerRef.current);
    }
    setGestureFeedback(nextFeedback);
    if (nextFeedback.kind === 'brightness') {
      setBrightnessOverlayOpacity(Math.max(0, Math.min(0.46, 0.46 - (nextFeedback.value ?? 0.5) * 0.36)));
    }
    gestureFeedbackTimerRef.current = setTimeout(() => {
      setGestureFeedback(null);
      setBrightnessOverlayOpacity(0);
      gestureFeedbackTimerRef.current = null;
    }, 900);
  }

  function handleSurfacePress() {
    if (isPlayerLocked) {
      showGestureFeedback({ kind: 'locked', label: '播放器已锁定' });
      return;
    }
    const now = Date.now();
    if (now - lastSurfaceTapAtRef.current <= DOUBLE_TAP_PAUSE_WINDOW_MS) {
      lastSurfaceTapAtRef.current = 0;
      const locationX = lastSurfacePressLocationXRef.current;
      const leftBoundary = surfaceWidth / 3;
      const rightBoundary = surfaceWidth * 2 / 3;
      if (locationX < leftBoundary) {
        seekByOffset(-GESTURE_DOUBLE_TAP_SEEK_SECONDS);
        showGestureFeedback({ kind: 'seek-backward', label: `后退 ${GESTURE_DOUBLE_TAP_SEEK_SECONDS}s` });
        return;
      }
      if (locationX > rightBoundary) {
        seekByOffset(GESTURE_DOUBLE_TAP_SEEK_SECONDS);
        showGestureFeedback({ kind: 'seek-forward', label: `前进 ${GESTURE_DOUBLE_TAP_SEEK_SECONDS}s` });
        return;
      }
      togglePlay();
      showGestureFeedback({ kind: isPlaying ? 'pause' : 'play', label: isPlaying ? '暂停' : '播放' });
      return;
    }
    lastSurfaceTapAtRef.current = now;
    toggleControls();
  }

  function handlePartitionDoubleTap(locationX: number) {
    const leftBoundary = surfaceWidth / 3;
    const rightBoundary = surfaceWidth * 2 / 3;
    if (locationX < leftBoundary) {
      seekByOffset(-GESTURE_DOUBLE_TAP_SEEK_SECONDS);
      showGestureFeedback({ kind: 'seek-backward', label: `后退 ${GESTURE_DOUBLE_TAP_SEEK_SECONDS}s` });
      return;
    }
    if (locationX > rightBoundary) {
      seekByOffset(GESTURE_DOUBLE_TAP_SEEK_SECONDS);
      showGestureFeedback({ kind: 'seek-forward', label: `前进 ${GESTURE_DOUBLE_TAP_SEEK_SECONDS}s` });
      return;
    }
    togglePlay();
    showGestureFeedback({ kind: isPlaying ? 'pause' : 'play', label: isPlaying ? '暂停' : '播放' });
  }

  function seekByOffset(offsetSeconds: number) {
    seekToTime(currentTimeRef.current + offsetSeconds);
    showControls();
  }

  function togglePlayerLock() {
    setIsPlayerLocked((locked) => {
      const nextLocked = !locked;
      if (nextLocked) {
        clearHideTimer();
        setControlsVisible(false);
        setSpeedMenuVisible(false);
        setQueueVisible(false);
        setMoreVisible(false);
      } else {
        showControls();
      }
      void saveVideoPlayerPreferences({ lockedByDefault: nextLocked });
      showGestureFeedback({ kind: nextLocked ? 'locked' : 'unlocked', label: nextLocked ? '已锁定' : '已解锁' });
      return nextLocked;
    });
  }

  async function beginVerticalGesture(event: GestureResponderEvent) {
    const isBrightnessGesture = event.nativeEvent.locationX < surfaceWidth / 2;
    verticalGestureKindRef.current = isBrightnessGesture ? 'brightness' : 'volume';
    if (isBrightnessGesture) {
      const currentBrightness = await Brightness.getBrightnessAsync().catch(() => 0.5);
      verticalGestureStartValueRef.current = currentBrightness;
      showGestureFeedback({ kind: 'brightness', label: '亮度', value: currentBrightness });
      return;
    }
    const currentVolume = await VolumeManager.getVolume().catch(() => ({ volume: 0.5 }));
    verticalGestureStartValueRef.current = currentVolume.volume;
    showGestureFeedback({ kind: 'volume', label: '音量', value: currentVolume.volume });
  }

  function updateVerticalGesture(deltaY: number) {
    const gestureKind = verticalGestureKindRef.current;
    if (!gestureKind) {
      return;
    }
    const nextValue = clamp01(verticalGestureStartValueRef.current - deltaY / Math.max(1, surfaceHeight * VERTICAL_GESTURE_FULL_HEIGHT_RATIO));
    if (gestureKind === 'brightness') {
      void adjustBrightnessFromGesture(nextValue);
      showGestureFeedback({ kind: 'brightness', label: '亮度', value: nextValue });
      return;
    }
    void adjustVolumeFromGesture(nextValue);
    showGestureFeedback({ kind: 'volume', label: '音量', value: nextValue });
  }

  function finishVerticalGesture() {
    verticalGestureKindRef.current = null;
    resetHideTimer();
  }

  function shouldSwitchVideoFromCenterVerticalGesture(locationX: number, absDx: number, absDy: number) {
    if (isLandscape || externalSource || queue.length <= 1) {
      return false;
    }
    const centerLeft = surfaceWidth * CENTER_VIDEO_SWITCH_LEFT_RATIO;
    const centerRight = surfaceWidth * CENTER_VIDEO_SWITCH_RIGHT_RATIO;
    return locationX >= centerLeft && locationX <= centerRight && absDy > absDx * CENTER_VIDEO_SWITCH_DOMINANCE_RATIO;
  }

  function finishCenterVideoSwitchGesture(deltaY: number) {
    const offset = deltaY < 0 ? 1 : -1;
    const nextVideo = getVideoByOffset(offset);
    if (Math.abs(deltaY) < CENTER_VIDEO_SWITCH_MIN_DISTANCE_PX) {
      resetVideoSwitchDrag();
      return;
    }
    if (!nextVideo) {
      resetVideoSwitchDrag();
      return;
    }
    switchVideoWithTransition(nextVideo, offset);
  }

  function updateVideoSwitchDrag(deltaY: number) {
    const maxTranslate = Math.max(1, surfaceHeight);
    videoSwitchTranslateY.setValue(Math.max(-maxTranslate, Math.min(maxTranslate, deltaY)));
  }

  function resetVideoSwitchDrag() {
    Animated.timing(videoSwitchTranslateY, {
      toValue: 0,
      duration: VIDEO_SWITCH_CANCEL_DURATION_MS,
      useNativeDriver: true,
    }).start(() => {
      resetHideTimer();
    });
  }

  function switchVideoWithTransition(nextVideo: ImageListItem, direction: 1 | -1) {
    if (isVideoSwitchTransitioning) {
      return;
    }
    setIsVideoSwitchTransitioning(true);
    clearHideTimer();
    clearLongPressTimer();
    setSpeedMenuVisible(false);
    setQueueVisible(false);
    setMoreVisible(false);
    const transitionHeight = Math.max(1, surfaceHeight);
    Animated.timing(videoSwitchTranslateY, {
      toValue: -direction * transitionHeight,
      duration: VIDEO_SWITCH_EXIT_DURATION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        videoSwitchTranslateY.setValue(0);
        setIsVideoSwitchTransitioning(false);
        resetHideTimer();
        return;
      }
      switchVideo(nextVideo.id, nextVideo, { showControls: false });
      videoSwitchTranslateY.setValue(direction * transitionHeight);
      requestAnimationFrame(() => {
        Animated.timing(videoSwitchTranslateY, {
          toValue: 0,
          duration: VIDEO_SWITCH_ENTER_DURATION_MS,
          useNativeDriver: true,
        }).start(() => {
          setIsVideoSwitchTransitioning(false);
          resetHideTimer();
        });
      });
    });
  }

  async function adjustBrightnessFromGesture(value: number) {
    await Brightness.setBrightnessAsync(value).catch(() => undefined);
  }

  async function adjustVolumeFromGesture(value: number) {
    await VolumeManager.setVolume(value, { type: 'music', showUI: false, playSound: false }).catch(() => undefined);
  }

  function toggleControls() {
    setControlsVisible((visible) => {
      const nextVisible = !visible;
      if (nextVisible) {
        resetHideTimer();
      } else {
        clearHideTimer();
        setSpeedMenuVisible(false);
        setQueueVisible(false);
      }
      return nextVisible;
    });
  }

  function getEffectiveDuration() {
    return duration > 0 ? duration : Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
  }

  function seekToTime(nextTime: number) {
    const effectiveDuration = getEffectiveDuration();
    if (effectiveDuration <= 0) {
      return;
    }
    const clampedTime = Math.min(effectiveDuration, Math.max(0, nextTime));
    player.currentTime = clampedTime;
    currentTimeRef.current = clampedTime;
    setCurrentTime(clampedTime);
  }

  function shouldIgnoreStaleTimeUpdate(nextTime: number) {
    const targetTime = committedSeekTargetRef.current;
    if (targetTime == null) {
      return false;
    }

    const isSettled = Math.abs(nextTime - targetTime) <= COMMITTED_SEEK_TOLERANCE_SECONDS;
    if (isSettled) {
      committedSeekTargetRef.current = null;
      return false;
    }

    const isStillSettling = Date.now() - committedSeekStartedAtRef.current < COMMITTED_SEEK_SETTLE_TIMEOUT_MS;
    if (isStillSettling) {
      return true;
    }

    committedSeekTargetRef.current = null;
    player.currentTime = targetTime;
    currentTimeRef.current = targetTime;
    setCurrentTime(targetTime);
    return true;
  }

  function beginScrub(source: 'controls' | 'surface' = 'controls') {
    clearHideTimer();
    clearLongPressTimer();
    const isSurfaceSource = source === 'surface';
    setIsSurfaceScrubbing(isSurfaceSource);
    if (isSurfaceSource) {
      setControlsVisible(false);
      setSpeedMenuVisible(false);
      setQueueVisible(false);
      setMoreVisible(false);
    }
    setIsScrubbing(true);
    isScrubbingRef.current = true;
    scrubDisplayTimeRef.current = currentTimeRef.current;
    setScrubDisplayTime(currentTimeRef.current);
    setScrubGestureHint(null);
  }

  function normalizeScrubTime(nextTime: number) {
    const effectiveDuration = getEffectiveDuration();
    return effectiveDuration > 0 ? Math.min(effectiveDuration, Math.max(0, nextTime)) : 0;
  }

  function schedulePreviewSeek(nextTime: number) {
    pendingPreviewSeekTimeRef.current = nextTime;
    const now = Date.now();
    if (now - lastPreviewSeekAtRef.current >= SCRUB_PREVIEW_SEEK_INTERVAL_MS) {
      clearPreviewSeekTimer();
      pendingPreviewSeekTimeRef.current = nextTime;
      flushPreviewSeek();
      return;
    }
    if (previewSeekTimerRef.current) {
      return;
    }
    previewSeekTimerRef.current = setTimeout(() => {
      previewSeekTimerRef.current = null;
      flushPreviewSeek();
    }, SCRUB_PREVIEW_SEEK_INTERVAL_MS);
  }

  function updateScrubTime(nextTime: number) {
    const clampedTime = normalizeScrubTime(nextTime);
    currentTimeRef.current = clampedTime;
    scrubDisplayTimeRef.current = clampedTime;
    setScrubDisplayTime(clampedTime);
    setCurrentTime(clampedTime);
  }

  function updateScrubFromTrackPageX(pageX: number) {
    const effectiveDuration = getEffectiveDuration();
    const measuredWidth = trackWidthRef.current;
    if (effectiveDuration <= 0 || measuredWidth <= 0) {
      return;
    }
    const rawTargetTime = ((pageX - trackPageXRef.current) / measuredWidth) * effectiveDuration;
    setScrubGestureHint(getScrubBoundaryHint(rawTargetTime, effectiveDuration));
    updateScrubTime(rawTargetTime);
  }

  function measureProgressTrack() {
    progressTrackRef.current?.measure((_x, _y, width, _height, pageX) => {
      if (Number.isFinite(width) && width > 0) {
        trackWidthRef.current = width;
      }
      if (Number.isFinite(pageX)) {
        trackPageXRef.current = pageX;
      }
    });
  }

  function handleProgressTrackLayout(width: number) {
    const measuredWidth = Math.max(1, width);
    trackWidthRef.current = measuredWidth;
    setTrackWidth(measuredWidth);
    requestAnimationFrame(measureProgressTrack);
  }

  function updateScrubFromSurfaceDelta(deltaX: number) {
    updateScrubFromSurfaceGesture(deltaX, 0);
  }

  function updateScrubFromSurfaceGesture(deltaX: number, deltaY: number) {
    const effectiveDuration = getEffectiveDuration();
    if (effectiveDuration <= 0 || surfaceWidth <= 0) {
      return;
    }
    const secondsPerScreen = getSurfaceSeekSecondsPerScreen(effectiveDuration);
    const dragRatio = getDampedSurfaceDragRatio(deltaX / surfaceWidth);
    const fineTuneFactor = getSurfaceSeekFineTuneFactor(deltaY);
    const rawTargetTime = scrubStartTimeRef.current + dragRatio * secondsPerScreen * fineTuneFactor;
    setScrubGestureHint(getScrubBoundaryHint(rawTargetTime, effectiveDuration));
    updateScrubTime(rawTargetTime);
  }

  function seekFromSurfaceDelta(deltaX: number) {
    updateScrubFromSurfaceDelta(deltaX);
  }

  function getSurfaceSeekSecondsPerScreen(effectiveDuration: number) {
    if (effectiveDuration <= SURFACE_SEEK_SHORT_SECONDS) {
      return effectiveDuration * SURFACE_SEEK_SHORT_SCREEN_RATIO;
    }
    if (effectiveDuration <= SURFACE_SEEK_MEDIUM_SECONDS) {
      return effectiveDuration * SURFACE_SEEK_MEDIUM_SCREEN_RATIO;
    }
    if (effectiveDuration <= SURFACE_SEEK_LONG_SECONDS) {
      return effectiveDuration * SURFACE_SEEK_LONG_SCREEN_RATIO;
    }
    if (effectiveDuration <= SURFACE_SEEK_EPISODE_SECONDS) {
      return effectiveDuration * SURFACE_SEEK_EPISODE_SCREEN_RATIO;
    }
    return Math.min(
      SURFACE_SEEK_SUPER_LONG_MAX_SECONDS_PER_SCREEN,
      Math.max(SURFACE_SEEK_SUPER_LONG_MIN_SECONDS_PER_SCREEN, effectiveDuration * SURFACE_SEEK_SUPER_LONG_TARGET_RATIO),
    );
  }

  function getDampedSurfaceDragRatio(screenRatio: number) {
    const direction = Math.sign(screenRatio);
    const ratio = Math.min(1, Math.abs(screenRatio));
    let dampedRatio = 0;
    if (ratio <= SURFACE_SEEK_DAMPING_LOW_RATIO) {
      dampedRatio = ratio * SURFACE_SEEK_DAMPING_LOW_FACTOR;
    } else if (ratio <= SURFACE_SEEK_DAMPING_HIGH_RATIO) {
      dampedRatio =
        SURFACE_SEEK_DAMPING_LOW_RATIO * SURFACE_SEEK_DAMPING_LOW_FACTOR +
        (ratio - SURFACE_SEEK_DAMPING_LOW_RATIO) * SURFACE_SEEK_DAMPING_MID_FACTOR;
    } else {
      dampedRatio =
        SURFACE_SEEK_DAMPING_LOW_RATIO * SURFACE_SEEK_DAMPING_LOW_FACTOR +
        (SURFACE_SEEK_DAMPING_HIGH_RATIO - SURFACE_SEEK_DAMPING_LOW_RATIO) * SURFACE_SEEK_DAMPING_MID_FACTOR +
        (ratio - SURFACE_SEEK_DAMPING_HIGH_RATIO) * SURFACE_SEEK_DAMPING_HIGH_FACTOR;
    }
    return direction * Math.min(1, dampedRatio);
  }

  function getSurfaceSeekFineTuneFactor(deltaY: number) {
    if (deltaY >= -SURFACE_SEEK_FINE_LIGHT_PX) {
      return 1;
    }
    if (deltaY > -SURFACE_SEEK_FINE_MEDIUM_PX) {
      return SURFACE_SEEK_FINE_LIGHT_FACTOR;
    }
    if (deltaY > -SURFACE_SEEK_FINE_HIGH_PX) {
      return SURFACE_SEEK_FINE_MEDIUM_FACTOR;
    }
    return SURFACE_SEEK_FINE_HIGH_FACTOR;
  }

  function getScrubBoundaryHint(rawTargetTime: number, effectiveDuration: number) {
    if (rawTargetTime < 0) {
      return '已到开头';
    }
    if (rawTargetTime > effectiveDuration) {
      return '已到结尾';
    }
    return null;
  }

  function commitScrub() {
    const finalTime = scrubDisplayTimeRef.current;
    clearPreviewSeekTimer();
    seekToTime(finalTime);
    committedSeekTargetRef.current = finalTime;
    committedSeekStartedAtRef.current = Date.now();
    setIsScrubbing(false);
    setIsSurfaceScrubbing(false);
    setScrubGestureHint(null);
    isScrubbingRef.current = false;
    resetHideTimer();
  }

  function cancelScrub() {
    clearPreviewSeekTimer();
    committedSeekTargetRef.current = null;
    setIsScrubbing(false);
    setIsSurfaceScrubbing(false);
    setScrubGestureHint(null);
    isScrubbingRef.current = false;
    resetHideTimer();
  }

  async function toggleOrientation() {
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
        void saveVideoPlayerPreferences({ orientationPreference: 'portrait' });
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setIsLandscape(true);
        void saveVideoPlayerPreferences({ orientationPreference: 'landscape' });
      }
      showControls();
    } catch {
      showToast('横竖屏切换失败');
    }
  }

  function switchVideo(nextVideoId: number, nextVideo?: ImageListItem, options?: { showControls?: boolean }) {
    if (!externalSource && video) {
      void runWithDatabaseSpace(space, (db) => assetRepository.updatePlaybackPosition(db, video.id, Math.round(currentTimeRef.current * 1000)));
    }
    safePausePlayer();
    setSwitchPreviewVideo(nextVideo ?? null);
    setActiveVideoId(nextVideoId);
    setQueueVisible(false);
    if (options?.showControls === false) {
      resetHideTimer();
    } else {
      showControls();
    }
  }

  function getVideoByOffset(offset: 1 | -1) {
    if (queue.length === 0 || currentIndex < 0) {
      return null;
    }
    const nextIndex = Math.max(0, Math.min(queue.length - 1, currentIndex + offset));
    const nextVideo = queue[nextIndex];
    return nextVideo && nextVideo.id !== activeVideoId ? nextVideo : null;
  }

  function switchVideoByOffset(offset: 1 | -1) {
    const nextVideo = getVideoByOffset(offset);
    if (nextVideo) {
      switchVideo(nextVideo.id, nextVideo);
    }
  }

  const title = sourceFileName;

  function handleBack() {
    safePausePlayer();
    onBack();
  }

  return (
    <View style={styles.shell}>
      <ExpoStatusBar hidden />
      <Animated.View
        onLayout={(event) => {
          setSurfaceWidth(Math.max(1, event.nativeEvent.layout.width));
          setSurfaceHeight(Math.max(1, event.nativeEvent.layout.height));
        }}
        style={[styles.videoSurface, videoSwitchAnimatedStyle]}
      >
        <VideoView
          allowsPictureInPicture={false}
          contentFit="contain"
          fullscreenOptions={{ enable: false }}
          nativeControls={false}
          player={player}
          startsPictureInPictureAutomatically={false}
          style={styles.videoView}
        />
        <View
          {...surfacePanResponder.panHandlers}
          style={styles.videoGestureLayer}
        />
      </Animated.View>

      {brightnessOverlayOpacity > 0 ? <View pointerEvents="none" style={[styles.brightnessOverlay, { opacity: brightnessOverlayOpacity }]} /> : null}

      {gestureFeedback ? (
        <View pointerEvents="none" style={styles.gestureFeedback}>
          <Ionicons color={colors.text.inverse} name={getGestureFeedbackIcon(gestureFeedback.kind)} size={24} />
          <Text style={styles.gestureFeedbackText}>{gestureFeedback.label}</Text>
          {gestureFeedback.value != null ? (
            <View style={styles.gestureFeedbackBar}>
              <View style={[styles.gestureFeedbackFill, { width: `${Math.round(gestureFeedback.value * 100)}%` }]} />
            </View>
          ) : null}
        </View>
      ) : null}

      {isSurfaceScrubbing && isScrubbing ? (
        <View pointerEvents="none" style={styles.surfaceScrubOverlay}>
          <Text style={styles.surfaceScrubTime}>{formatDuration(displayTime * 1000)} / {formatDuration(duration * 1000)}</Text>
          <View style={styles.surfaceScrubTrack}>
            <View style={[styles.surfaceScrubFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.surfaceScrubMeta}>{formatScrubMeta(displayTime - scrubStartTimeRef.current, scrubGestureHint)}</Text>
        </View>
      ) : null}

      {holdSpeedVisible ? (
        <View style={[styles.holdSpeedFloatingBadge, { bottom: insets.bottom + 118 }]}>
          <Ionicons color={colors.primary.hover} name="play-forward" size={13} />
          <Text style={styles.holdSpeedBadgeText}>{holdSpeed}x 快进</Text>
        </View>
      ) : null}

      <Animated.View pointerEvents={controlsVisible && !isPlayerLocked ? 'box-none' : 'none'} style={[styles.controlsLayer, { opacity: controlsOpacity }]}>
          <View style={[styles.topBar, isLandscape ? styles.landscapeTopBar : null, { paddingTop: insets.top + spacing[2] }]}>
            <Pressable accessibilityLabel="返回" onPress={handleBack} style={({ pressed }) => [styles.iconButtonBare, pressed && styles.pressed]}>
              <Ionicons color={colors.text.inverse} name="chevron-back" size={26} />
            </Pressable>
            <Text numberOfLines={1} style={styles.playerTitle}>{title}</Text>
            <Pressable
              accessibilityLabel="更多"
              onPress={() => {
                setMoreVisible((current) => !current);
                showControls();
              }}
              style={({ pressed }) => [styles.iconButtonBare, pressed && styles.pressed]}
            >
              <Ionicons color={colors.text.inverse} name="ellipsis-vertical" size={22} />
            </Pressable>
          </View>

          {moreVisible ? (
            <>
              <Pressable accessibilityLabel="关闭视频操作菜单" onPress={() => setMoreVisible(false)} style={styles.menuDismissLayer} />
              <Animated.View style={[styles.moreMenu, { top: insets.top + 58, right: spacing[3] }, floatingPanelAnimatedStyle]}>
                {moreItems.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    key={item.key}
                    onPress={() => {
                      setMoreVisible(false);
                      item.onPress();
                    }}
                    style={({ pressed }) => [styles.moreMenuRow, pressed && styles.pressed]}
                  >
                    {item.icon ? <Ionicons color={colors.text.inverse} name={item.icon} size={17} /> : null}
                    <Text style={styles.moreMenuText}>{item.label}</Text>
                  </Pressable>
                ))}
              </Animated.View>
            </>
          ) : null}

          {queueVisible ? (
            <Animated.View style={[styles.queuePanel, { bottom: insets.bottom + 152 }, floatingPanelAnimatedStyle]}>
              <Text style={styles.queueTitle}>待播放</Text>
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.queueScroll} contentContainerStyle={styles.queueScrollContent}>
                {queue.map((item) => (
                  <Pressable key={item.id} onPress={() => switchVideo(item.id, item)} style={({ pressed }) => [styles.queueRow, item.id === activeVideoId ? styles.queueRowActive : null, pressed && styles.pressed]}>
                    <View style={styles.queueCover}>
                      {item.coverThumbnailFileUri ?? item.thumbnailFileUri ? (
                        <SecureImage contentFit="cover" space={space} style={styles.queueCoverImage} uri={(item.coverThumbnailFileUri ?? item.thumbnailFileUri) as string} />
                      ) : (
                        <Ionicons color={item.id === activeVideoId ? colors.primary.active : colors.text.inverse} name="play-circle-outline" size={18} />
                      )}
                    </View>
                    <Text numberOfLines={1} style={styles.queueName}>{item.originalFilename}</Text>
                    {item.id === activeVideoId ? <Text style={styles.queueNowPlaying}>当前视频</Text> : null}
                    <Text style={styles.queueDuration}>{formatDuration(item.durationMs)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}

          {speedMenuVisible ? (
            <Animated.View style={[styles.speedPanel, { bottom: insets.bottom + 152 }, floatingPanelAnimatedStyle]}>
              <Text style={styles.speedTitle}>播放速度</Text>
              <View style={styles.speedGrid}>
                {SPEED_OPTIONS.map((option) => (
                  <Pressable key={option} onPress={() => { setSpeed(option); setSpeedMenuVisible(false); showControls(); }} style={[styles.speedChip, speed === option ? styles.speedChipActive : null]}>
                    <Text style={[styles.speedChipText, speed === option ? styles.speedChipTextActive : null]}>{option}x</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.speedTitle}>长按快进</Text>
              <View style={styles.speedGrid}>
                {SPEED_OPTIONS.filter((option) => option >= 1).map((option) => (
                  <Pressable key={option} onPress={() => setHoldSpeed(option)} style={[styles.speedChip, holdSpeed === option ? styles.speedChipActive : null]}>
                    <Text style={[styles.speedChipText, holdSpeed === option ? styles.speedChipTextActive : null]}>{option}x</Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          ) : null}

          <View style={[styles.bottomBar, isLandscape ? styles.landscapeBottomBar : null, { paddingBottom: insets.bottom + (isLandscape ? spacing[1] : spacing[2]) }]}>
            {isLandscape && isScrubbing ? (
              <View style={styles.landscapeScrubBubbleRow}>
                <View style={styles.scrubBubble}>
                  <Text style={styles.scrubBubbleTime}>{formatDuration(displayTime * 1000)}</Text>
                  <Text style={styles.scrubBubbleMeta}>{formatScrubMeta(displayTime - scrubStartTimeRef.current, scrubGestureHint)}</Text>
                </View>
              </View>
            ) : null}
            <View
              {...seekPanResponder.panHandlers}
              ref={progressTrackRef}
              onLayout={(event) => handleProgressTrackLayout(event.nativeEvent.layout.width)}
              style={[styles.progressHitArea, isLandscape ? styles.landscapeProgressHitArea : null]}
            >
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                <View style={[styles.progressKnob, { left: `${progress * 100}%` }]} />
              </View>
            </View>
            {!isLandscape ? (
              <View style={styles.progressInfoRow}>
                <Text style={styles.progressInfoText}>{formatDuration(displayTime * 1000)} / {formatDuration(duration * 1000)}</Text>
                {isScrubbing ? (
                  <View style={styles.scrubBubble}>
                    <Text style={styles.scrubBubbleTime}>{formatDuration(displayTime * 1000)}</Text>
                    <Text style={styles.scrubBubbleMeta}>{formatScrubMeta(displayTime - scrubStartTimeRef.current, scrubGestureHint)}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={[styles.controlRow, isLandscape ? styles.landscapeControlRow : null]}>
              <View style={styles.controlLeft}>
                {isLandscape ? (
                  <Pressable accessibilityLabel="上一个视频" onPress={() => switchVideoByOffset(-1)} style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}>
                    <Ionicons color={colors.text.inverse} name="play-skip-back" size={18} />
                  </Pressable>
                ) : null}
                <Pressable accessibilityLabel={isPlaying ? '暂停' : '播放'} onPress={togglePlay} style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}>
                  <Ionicons color={colors.text.inverse} name={isPlaying ? 'pause' : 'play'} size={20} />
                </Pressable>
                {isLandscape ? (
                  <Pressable accessibilityLabel="下一个视频" onPress={() => switchVideoByOffset(1)} style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}>
                    <Ionicons color={colors.text.inverse} name="play-skip-forward" size={18} />
                  </Pressable>
                ) : null}
                {isLandscape ? (
                  <Text numberOfLines={1} style={styles.landscapeTimeText}>{formatDuration(displayTime * 1000)} / {formatDuration(duration * 1000)}</Text>
                ) : null}
              </View>
              <View style={styles.controlActions}>
                <Pressable onPress={() => { setSpeedMenuVisible((current) => !current); setQueueVisible(false); showControls(); }} style={({ pressed }) => [styles.pillButton, pressed && styles.pressed]}>
                  <Text style={styles.pillButtonText}>{speed}x</Text>
                </Pressable>
                <Pressable accessibilityLabel="横竖屏" onPress={toggleOrientation} style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}>
                  <Ionicons color={colors.text.inverse} name={isLandscape ? 'phone-portrait-outline' : 'phone-landscape-outline'} size={19} />
                </Pressable>
                <Pressable onPress={() => { setQueueVisible((current) => !current); setSpeedMenuVisible(false); showControls(); }} style={({ pressed }) => [styles.pillButton, pressed && styles.pressed]}>
                  <Ionicons color={colors.text.inverse} name="list-outline" size={16} />
                  <Text style={styles.pillButtonText}>待播放</Text>
                </Pressable>
                <Pressable accessibilityLabel="锁定播放器" onPress={togglePlayerLock} style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}>
                  <Ionicons color={colors.text.inverse} name="lock-closed-outline" size={18} />
                </Pressable>
              </View>
            </View>
          </View>
        </Animated.View>

      {isPlayerLocked ? (
        <Pressable accessibilityLabel="解锁播放器" onPress={togglePlayerLock} style={[styles.unlockButton, { bottom: insets.bottom + spacing[2] }]}>
          <Ionicons color={colors.text.inverse} name="lock-closed" size={18} />
        </Pressable>
      ) : null}

      <AppActionSheet
        items={[
          { key: 'new', label: '新建 IP 并保存', icon: 'add-circle-outline', onPress: () => setNewIpDialogVisible(true) },
          ...normalIps.map((ip) => ({
            key: String(ip.id),
            label: ip.name,
            icon: 'albums-outline' as const,
            meta: `${ip.imageCount} 个素材`,
            onPress: () => void saveExternalVideoToIp(ip.id),
          })),
        ]}
        message="只显示普通空间 IP。保存完成后会留在当前播放位置。"
        onClose={() => setIpPickerVisible(false)}
        title="保存到 IP"
        visible={ipPickerVisible}
      />
      <AppDialog
        onClose={() => setNewIpDialogVisible(false)}
        onPrimary={() => void createIpAndSaveExternalVideo()}
        primaryDisabled={!newIpName.trim() || isSavingToIp}
        primaryLabel={isSavingToIp ? '保存中' : '新建并保存'}
        title="新建 IP"
        visible={newIpDialogVisible}
      >
        <Text style={styles.dialogHint}>外部视频会按正式导入流程复制到 Pixory 私有目录。</Text>
        <TextInput
          editable={!isSavingToIp}
          onChangeText={setNewIpName}
          placeholder="IP 名称"
          placeholderTextColor={colors.text.placeholder}
          selectionColor={colors.primary.default}
          style={styles.dialogInput}
          value={newIpName}
        />
      </AppDialog>
    </View>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function formatScrubDelta(deltaSeconds: number): string {
  const absoluteDelta = Math.abs(deltaSeconds);
  if (absoluteDelta < 0.5) {
    return '预览中';
  }
  return `${deltaSeconds >= 0 ? '快进' : '后退'} ${formatDuration(absoluteDelta * 1000)}`;
}

function formatScrubMeta(deltaSeconds: number, hint: string | null): string {
  const deltaLabel = formatScrubDelta(deltaSeconds);
  return hint ? `${deltaLabel} · ${hint}` : deltaLabel;
}

function getGestureFeedbackIcon(kind: GestureFeedbackKind) {
  if (kind === 'seek-backward') return 'play-back';
  if (kind === 'seek-forward') return 'play-forward';
  if (kind === 'brightness') return 'sunny-outline';
  if (kind === 'volume') return 'volume-high-outline';
  if (kind === 'locked') return 'lock-closed-outline';
  if (kind === 'unlocked') return 'lock-open-outline';
  return kind === 'pause' ? 'pause' : 'play';
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#050607',
    flex: 1,
  },
  videoSurface: {
    flex: 1,
  },
  videoGestureLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  videoView: {
    height: '100%',
    width: '100%',
  },
  brightnessOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  gestureFeedback: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(12, 15, 13, 0.82)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    justifyContent: 'center',
    minHeight: 104,
    minWidth: 126,
    padding: spacing[4],
    position: 'absolute',
    top: '42%',
  },
  gestureFeedbackText: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: '800',
  },
  gestureFeedbackBar: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.pill,
    height: 4,
    overflow: 'hidden',
    width: 82,
  },
  gestureFeedbackFill: {
    backgroundColor: colors.primary.hover,
    borderRadius: radius.pill,
    height: '100%',
  },
  surfaceScrubOverlay: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(12, 15, 13, 0.78)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    minWidth: 180,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    position: 'absolute',
    top: '42%',
  },
  surfaceScrubTime: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: '800',
  },
  surfaceScrubTrack: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    height: 3,
    overflow: 'hidden',
    width: 148,
  },
  surfaceScrubFill: {
    backgroundColor: colors.primary.hover,
    borderRadius: radius.pill,
    height: '100%',
  },
  surfaceScrubMeta: {
    ...typography.textStyles.micro,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '700',
  },
  unlockButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 15, 13, 0.76)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing[3],
    width: 40,
  },
  controlsLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
    flexDirection: 'row',
    gap: spacing[2],
    left: 0,
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
    position: 'absolute',
    right: 0,
    top: 0,
  },
  landscapeTopBar: {
    backgroundColor: 'transparent',
    paddingBottom: spacing[1],
  },
  iconButtonBare: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  playerTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
    flex: 1,
    minWidth: 0,
  },
  menuDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  moreMenu: {
    backgroundColor: 'rgba(12, 15, 13, 0.92)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    minWidth: 152,
    padding: spacing[2],
    position: 'absolute',
    zIndex: 12,
  },
  moreMenuRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 38,
    paddingHorizontal: spacing[2],
  },
  moreMenuText: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: '700',
  },
  holdSpeedBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 15, 13, 0.78)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 28,
    paddingHorizontal: spacing[2],
  },
  holdSpeedFloatingBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(12, 15, 13, 0.78)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 30,
    paddingHorizontal: spacing[3],
    position: 'absolute',
  },
  holdSpeedBadgeText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '800',
  },
  bottomBar: {
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    bottom: 0,
    gap: spacing[2],
    left: 0,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    position: 'absolute',
    right: 0,
  },
  landscapeBottomBar: {
    gap: spacing[1],
    paddingTop: spacing[1],
  },
  progressInfoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 30,
  },
  progressInfoText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    flex: 1,
    fontWeight: '800',
    minWidth: 0,
  },
  progressTrack: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    height: 3,
    position: 'relative',
  },
  progressHitArea: {
    justifyContent: 'center',
    minHeight: 34,
  },
  landscapeProgressHitArea: {
    minHeight: 24,
  },
  progressFill: {
    backgroundColor: colors.primary.hover,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressKnob: {
    backgroundColor: colors.text.inverse,
    borderRadius: radius.pill,
    height: 8,
    marginLeft: -4,
    position: 'absolute',
    top: -2.5,
    width: 8,
  },
  scrubBubble: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 15, 13, 0.86)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    maxWidth: 300,
    minHeight: 30,
    paddingHorizontal: spacing[3],
  },
  scrubBubbleTime: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: '800',
  },
  scrubBubbleMeta: {
    ...typography.textStyles.micro,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '700',
    textAlign: 'center',
  },
  landscapeScrubBubbleRow: {
    alignItems: 'flex-start',
    minHeight: 30,
  },
  controlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'space-between',
  },
  landscapeControlRow: {
    minHeight: 38,
  },
  controlLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
  },
  landscapeTimeText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '800',
    marginLeft: spacing[1],
    minWidth: 86,
  },
  controlActions: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  controlButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  timeText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    flex: 1,
    minWidth: 0,
  },
  pillButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 32,
    paddingHorizontal: spacing[2],
  },
  pillButtonText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '800',
  },
  speedPanel: {
    backgroundColor: 'rgba(12, 15, 13, 0.84)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    maxWidth: 300,
    padding: spacing[2],
    position: 'absolute',
    right: spacing[3],
    width: 236,
  },
  speedTitle: {
    ...typography.textStyles.micro,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '700',
  },
  speedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
  },
  speedChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    minHeight: 28,
    minWidth: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  speedChipActive: {
    backgroundColor: colors.primary.hover,
  },
  speedChipText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '700',
  },
  speedChipTextActive: {
    color: colors.text.title,
  },
  queuePanel: {
    backgroundColor: 'rgba(12, 15, 13, 0.84)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    maxHeight: 238,
    padding: spacing[2],
    position: 'absolute',
    right: spacing[3],
    width: '72%',
  },
  queueTitle: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: '800',
  },
  queueScroll: {
    maxHeight: 190,
  },
  queueScrollContent: {
    gap: spacing[1],
    paddingBottom: spacing[1],
  },
  queueRow: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[2],
    minHeight: 38,
    paddingHorizontal: spacing[2],
  },
  queueRowActive: {
    backgroundColor: 'rgba(213, 228, 202, 0.18)',
  },
  queueCover: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.sm,
    height: 30,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  queueCoverImage: {
    height: '100%',
    width: '100%',
  },
  queueName: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    flex: 1,
    minWidth: 0,
  },
  queueDuration: {
    ...typography.textStyles.micro,
    color: 'rgba(255,255,255,0.68)',
  },
  queueNowPlaying: {
    ...typography.textStyles.micro,
    color: colors.primary.hover,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
  },
  dialogHint: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
    marginBottom: spacing[2],
  },
  dialogInput: {
    ...typography.textStyles.body,
    backgroundColor: colors.background.input,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text.title,
    minHeight: 44,
    paddingHorizontal: spacing[3],
  },
});
