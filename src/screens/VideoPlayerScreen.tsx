import { applyPitchPreservingRate } from "../media/videoPlaybackRate";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import * as Brightness from "expo-brightness";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  FlatList,
  InteractionManager,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type ListRenderItemInfo,
  type PanResponderGestureState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VolumeManager } from "react-native-volume-manager";

import {
  AppActionSheet,
  type AppActionSheetItem,
} from "../components/AppActionSheet";
import { AppDialog } from "../components/AppDialog";
import { SecureImage } from "../components/SecureImage";
import { globalViewState } from "../services/globalViewState";
import {
  assetRepository,
  imageRepository,
  ipRepository,
  runWithDatabaseSpace,
  type ImageDetailRecord,
  type ImageListItem,
  type IpListItem,
  type PixorySpace,
} from "../database";
import { colors, metrics, radius, spacing, typography } from "../design/tokens";
import { useToast } from "../components/AppToast";
import {
  importVideosToIp,
  saveVideoToSystemAlbum,
  type PickedVideoAsset,
} from "../services/videoImportService";
import {
  loadVideoPlayerPreferences,
  saveVideoPlayerPreferences,
  type VideoPlaybackOrder,
} from "../services/mediaExperiencePreferences";
import { formatDuration } from "../utils/formatters";
import { VideoShuffleSession } from "../media/videoShuffleSession";
import {
  resolveVideoSwipe,
  VIDEO_SWIPE_DISTANCE_RATIO,
  VIDEO_SWIPE_VELOCITY_THRESHOLD,
} from "../media/videoSwipePolicy";
import {
  computeVerticalGestureValue,
  type VerticalGestureKind,
} from "../media/videoVerticalGesture";
import { DrawerQueueRow } from "../components/video/DrawerQueueRow";
import { VerticalGestureHud } from "../components/video/VerticalGestureHud";

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 2, 3] as const;
const VIDEO_FULLSCREEN_OPTIONS = { enable: false } as const;
const VIDEO_KEEP_AWAKE_TAG = "pixory-video-player";
const HUD_BUTTON_HIT_SLOP = { top: 4, right: 4, bottom: 4, left: 4 } as const;
const DRAWER_CLOSE_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 } as const;
const DRAWER_ITEM_HEIGHT = 60;
const DRAWER_ITEM_GAP = spacing[2];
const CONTROL_HIDE_DELAY_MS = 5000;
const VERTICAL_HUD_HIDE_DELAY_MS = 750;
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
const COMPLETED_PLAYBACK_RESTART_THRESHOLD_MS = 1500;
// Grace period before the loading cover appears. For local files the first
// frame typically arrives within this window, so the cover never shows at all.
// The cover only appears as a fallback for slower sources (large files, etc.).
const COVER_SHOW_GRACE_MS = 800;
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

type GestureFeedbackKind =
  | "seek-backward"
  | "seek-forward"
  | "locked"
  | "unlocked";

interface GestureFeedbackState {
  kind: GestureFeedbackKind;
  label: string;
}

interface VideoPlayerScreenProps {
  videoId?: number;
  externalSource?: PickedVideoAsset;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
  onOpenDetail?: (videoId: number) => void;
}

type VideoSwitchHistoryMode = "append" | "back" | "forward";

function getLandscapeStateFromOrientation(
  orientation: ScreenOrientation.Orientation,
): boolean | null {
  if (
    orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
    orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
  ) {
    return true;
  }
  if (
    orientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
    orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
  ) {
    return false;
  }
  return null;
}

function resolveInitialPlaybackTimeSeconds(
  lastPlaybackPositionMs?: number | null,
  durationMs?: number | null,
): number {
  // Always play from the beginning per user request
  return 0;
}

export function VideoPlayerScreen({
  videoId,
  externalSource,
  space = "normal",
  refreshToken,
  onBack,
  onOpenDetail,
}: VideoPlayerScreenProps) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const wasPlayingRef = useRef(false);
  const [activeVideoId, setActiveVideoId] = useState(videoId ?? 0);
  const [video, setVideo] = useState<ImageDetailRecord | null>(null);
  const [queue, setQueue] = useState<ImageListItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [holdSpeed, setHoldSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(3);
  const [playbackOrder, setPlaybackOrder] =
    useState<VideoPlaybackOrder>("sequence");
  const playbackOrderRef = useRef<VideoPlaybackOrder>(playbackOrder);
  playbackOrderRef.current = playbackOrder;
  const [shuffleRevision, setShuffleRevision] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speedMenuVisible, setSpeedMenuVisible] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [holdSpeedVisible, setHoldSpeedVisible] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isSurfaceScrubbing, setIsSurfaceScrubbing] = useState(false);
  const [scrubDisplayTime, setScrubDisplayTime] = useState(0);
  const [scrubGestureHint, setScrubGestureHint] = useState<string | null>(null);
  const [isPlayerLocked, setIsPlayerLocked] = useState(false);
  const [gestureFeedback, setGestureFeedback] =
    useState<GestureFeedbackState | null>(null);
  const [verticalHud, setVerticalHud] = useState<{
    kind: VerticalGestureKind | null;
    value: number;
    visible: boolean;
  }>({ kind: null, value: 0.5, visible: false });
  const [personalExportConfirmVisible, setPersonalExportConfirmVisible] =
    useState(false);
  const [isAppActive, setIsAppActive] = useState(
    AppState.currentState === "active",
  );
  const [ipPickerVisible, setIpPickerVisible] = useState(false);
  const [normalIps, setNormalIps] = useState<IpListItem[]>([]);
  const [newIpDialogVisible, setNewIpDialogVisible] = useState(false);
  const [newIpName, setNewIpName] = useState("");
  const [isSavingToIp, setIsSavingToIp] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isVideoSwitchTransitioning, setIsVideoSwitchTransitioning] =
    useState(false);
  const [switchPreviewVideo, setSwitchPreviewVideo] =
    useState<ImageListItem | null>(null);
  const [loadingCoverVideo, setLoadingCoverVideo] = useState<
    ImageListItem | ImageDetailRecord | null
  >(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [trackWidth, setTrackWidth] = useState(1);
  const [surfaceWidth, setSurfaceWidth] = useState(1);
  const [surfaceHeight, setSurfaceHeight] = useState(1);
  const [videoContentFit, setVideoContentFit] = useState<"contain" | "cover">(
    "contain",
  );
  const drawerTranslateX = useRef(new Animated.Value(320)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const gestureFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const verticalHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const previewSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pendingPreviewSeekTimeRef = useRef<number | null>(null);
  const switchCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const switchSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isMountedRef = useRef(true);
  const lastPreviewSeekAtRef = useRef(0);
  const progressTrackRef = useRef<View>(null);
  const trackPageXRef = useRef(0);
  const trackWidthRef = useRef(1);
  const committedSeekTargetRef = useRef<number | null>(null);
  const committedSeekStartedAtRef = useRef(0);
  const sourceLoadVersionRef = useRef(0);
  const coverOpacityAnim = useRef(new Animated.Value(1)).current;
  const coverDismissVersionRef = useRef(0);
  const coverShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTimeRef = useRef(0);
  const currentPlaybackVideoIdRef = useRef<number | null>(null);
  const spaceRef = useRef(space);
  const historyRef = useRef<number[]>(videoId ? [videoId] : []);
  const historyCursorRef = useRef(0);
  const scrubDisplayTimeRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const holdWasPlayingRef = useRef(false);
  const isHoldingFastForwardRef = useRef(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const holdSpeedRef = useRef(holdSpeed);
  holdSpeedRef.current = holdSpeed;
  const controlsVisibleRef = useRef(controlsVisible);
  const controlsVisibleBeforeHoldRef = useRef(false);
  const scrubStartTimeRef = useRef(0);
  const verticalGestureStartValueRef = useRef(0.5);
  const verticalGestureKindRef = useRef<VerticalGestureKind | null>(null);
  const verticalGestureTokenRef = useRef(0);
  const verticalGestureAnchorDyRef = useRef(0);
  const verticalGestureLatestDyRef = useRef(0);
  const lastBrightnessRef = useRef(0.5);
  const lastVolumeRef = useRef(0.5);
  const playbackErrorRef = useRef<string | null>(null);
  playbackErrorRef.current = playbackError;
  const isSavingLocalRef = useRef(false);
  const handleSaveLocalRef = useRef<(() => Promise<void>) | null>(null);
  const openSaveToIpRef = useRef<(() => Promise<void>) | null>(null);
  const loadedQueueMetaRef = useRef<{
    space: PixorySpace;
    ipId: number;
    refreshToken: number;
  } | null>(null);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const handlePlayToEndRef = useRef<(() => void) | null>(null);
  const switchVideoRef = useRef<
    ((
      nextVideoId: number,
      nextVideo?: ImageListItem,
      options?: {
        showControls?: boolean;
        pauseBeforeSwitch?: boolean;
        historyMode?: VideoSwitchHistoryMode;
      },
    ) => void) | null
  >(null);
  const surfaceGestureModeRef = useRef<
    "pending" | "scrub" | "vertical" | "video-switch" | "hold" | null
  >(null);
  const lastSurfaceTapAtRef = useRef(0);
  const lastSurfacePressLocationXRef = useRef(0);
  const queueVisibleRef = useRef(false);
  const videoPreferencesLoadedRef = useRef(false);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const floatingMenuOpacity = useRef(new Animated.Value(0)).current;
  const floatingMenuTranslateY = useRef(new Animated.Value(10)).current;
  const videoSwitchTranslateY = useRef(new Animated.Value(0)).current;
  const shuffleSessionRef = useRef<VideoShuffleSession | null>(null);
  const [previousSwitchVideo, setPreviousSwitchVideo] =
    useState<ImageListItem | null>(null);
  const [nextSwitchVideo, setNextSwitchVideo] = useState<ImageListItem | null>(
    null,
  );
  const swipeSettlingRef = useRef(false);
  const isReplacingRef = useRef(false);

  const activeVideoSource = switchPreviewVideo ?? video;
  const sourceUri =
    externalSource?.uri ?? activeVideoSource?.originalFileUri ?? null;
  const sourceFileName =
    externalSource?.fileName ??
    activeVideoSource?.originalFilename ??
    "video.mp4";

  const poolDirectionRef = useRef<1 | -1>(1);

  const player = useVideoPlayer(null, (instance) => {
    instance.timeUpdateEventInterval = 0.25;
    applyPitchPreservingRate(instance, speed);
    instance.loop = true;
  });

  const isExternal = Boolean(externalSource);
  const currentIndex = queue.findIndex((item) => item.id === activeVideoId);

  useEffect(() => {
    spaceRef.current = space;
  }, [space]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    controlsVisibleRef.current = controlsVisible;
    Animated.timing(controlsOpacity, {
      toValue: controlsVisible ? 1 : 0,
      duration: controlsVisible ? 140 : 180,
      useNativeDriver: true,
    }).start();
  }, [controlsOpacity, controlsVisible]);

  useEffect(() => {
    const isFloatingMenuVisible =
      speedMenuVisible || queueVisible || moreVisible;
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
  }, [
    floatingMenuOpacity,
    floatingMenuTranslateY,
    moreVisible,
    queueVisible,
    speedMenuVisible,
  ]);

  useEffect(() => {
    queueVisibleRef.current = queueVisible;
    if (queueVisible) {
      setDrawerMounted(true);
      setControlsVisible(true);
      clearHideTimer();
    }
    Animated.spring(drawerTranslateX, {
      toValue: queueVisible ? 0 : 320,
      useNativeDriver: true,
      damping: 25,
      mass: 0.8,
      stiffness: 200,
    }).start();
  }, [queueVisible, drawerTranslateX]);

  useEffect(() => {
    if (isPlaying && !playbackError) {
      void activateKeepAwakeAsync(VIDEO_KEEP_AWAKE_TAG).catch(() => undefined);
      return () => {
        void deactivateKeepAwake(VIDEO_KEEP_AWAKE_TAG).catch(() => undefined);
      };
    }
    void deactivateKeepAwake(VIDEO_KEEP_AWAKE_TAG).catch(() => undefined);
    return undefined;
  }, [isPlaying, playbackError]);

  useEffect(() => {
    let isMounted = true;
    const syncLandscapeState = (orientation: ScreenOrientation.Orientation) => {
      const nextIsLandscape = getLandscapeStateFromOrientation(orientation);
      if (isMounted && nextIsLandscape != null) {
        setIsLandscape(nextIsLandscape);
      }
    };

    const orientationSubscription =
      ScreenOrientation.addOrientationChangeListener((event) => {
        syncLandscapeState(event.orientationInfo.orientation);
      });

    void loadVideoPlayerPreferences().then((preferences) => {
      if (!isMounted) {
        return;
      }
      if (
        SPEED_OPTIONS.includes(
          preferences.speed as (typeof SPEED_OPTIONS)[number],
        )
      ) {
        setSpeed(preferences.speed as (typeof SPEED_OPTIONS)[number]);
      }
      if (
        SPEED_OPTIONS.includes(
          preferences.holdSpeed as (typeof SPEED_OPTIONS)[number],
        )
      ) {
        setHoldSpeed(preferences.holdSpeed as (typeof SPEED_OPTIONS)[number]);
      }
      setPlaybackOrder(preferences.playbackOrder || "sequence");
      setIsPlayerLocked(preferences.lockedByDefault);
      const shouldUseLandscape =
        preferences.orientationPreference === "landscape";
      setIsLandscape(shouldUseLandscape);
      videoPreferencesLoadedRef.current = true;
      void ScreenOrientation.lockAsync(
        shouldUseLandscape
          ? ScreenOrientation.OrientationLock.LANDSCAPE
          : ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => undefined);
    });
    return () => {
      isMounted = false;
      ScreenOrientation.removeOrientationChangeListener(
        orientationSubscription,
      );
      if (gestureFeedbackTimerRef.current) {
        clearTimeout(gestureFeedbackTimerRef.current);
        gestureFeedbackTimerRef.current = null;
      }
      if (verticalHudTimerRef.current) {
        clearTimeout(verticalHudTimerRef.current);
        verticalHudTimerRef.current = null;
      }
      void deactivateKeepAwake(VIDEO_KEEP_AWAKE_TAG).catch(() => undefined);
      void Brightness.restoreSystemBrightnessAsync().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    setActiveVideoId(videoId ?? 0);
    setSwitchPreviewVideo(null);
    historyRef.current = videoId ? [videoId] : [];
    historyCursorRef.current = 0;
  }, [videoId]);

  useEffect(() => {
    if (externalSource) {
      setVideo(null);
      setSwitchPreviewVideo(null);
      setLoadingCoverVideo(null);
      loadedQueueMetaRef.current = null;
      setQueue([]);
      currentPlaybackVideoIdRef.current = null;
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
      const detail = await runWithDatabaseSpace(space, (db) =>
        assetRepository.findVideoDetailById(db, activeVideoId),
      );
      if (!isMounted) {
        return;
      }
      if (!detail) {
        showToast("没有找到这个视频");
        onBack();
        return;
      }
      setVideo(detail);
      currentPlaybackVideoIdRef.current = detail.id;
      setSwitchPreviewVideo((current) =>
        current?.id === detail.id ? null : current,
      );
      const savedTime = resolveInitialPlaybackTimeSeconds(
        detail.lastPlaybackPositionMs,
        detail.durationMs,
      );
      currentTimeRef.current = savedTime;
      setCurrentTime(savedTime);
      const cachedQueueMatches =
        loadedQueueMetaRef.current?.space === space &&
        loadedQueueMetaRef.current?.ipId === detail.ipId &&
        loadedQueueMetaRef.current?.refreshToken === refreshToken &&
        queueRef.current.some((item) => item.id === detail.id);
      const queueItems = cachedQueueMatches
        ? null
        : await runWithDatabaseSpace(space, (db) =>
            assetRepository.findQueueVideosByIpId(db, detail.ipId),
          );
      if (isMounted) {
        if (queueItems) {
          loadedQueueMetaRef.current = {
            space,
            ipId: detail.ipId,
            refreshToken,
          };
          setQueue(queueItems);
        }
        void runWithDatabaseSpace(space, (db) =>
          imageRepository.touchLastViewedAt(db, detail.id),
        );
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [activeVideoId, externalSource, onBack, refreshToken, showToast, space]);

  // Initialize or sync shuffle session when queue or playback order changes
  useEffect(() => {
    if (externalSource || queue.length <= 1) {
      if (shuffleSessionRef.current) {
        shuffleSessionRef.current = null;
        setShuffleRevision((v) => v + 1);
      }
      return;
    }
    const queueIds = queue.map((item) => item.id);
    if (playbackOrder === "shuffle") {
      if (!shuffleSessionRef.current) {
        shuffleSessionRef.current = new VideoShuffleSession({
          queueIds,
          currentId: activeVideoId,
        });
        setShuffleRevision((v) => v + 1);
      } else if (shuffleSessionRef.current.syncQueue(queueIds)) {
        setShuffleRevision((v) => v + 1);
      }
    } else if (shuffleSessionRef.current) {
      shuffleSessionRef.current = null;
      setShuffleRevision((v) => v + 1);
    }
  }, [activeVideoId, externalSource, playbackOrder, queue]);

  // Compute adjacent slot videos for three-slot vertical swipe
  useEffect(() => {
    if (externalSource || isLandscape || queue.length <= 1) {
      setPreviousSwitchVideo(null);
      setNextSwitchVideo(null);
      return;
    }
    const prevVideo = getVideoByOffset(-1);
    const nextVideo = getVideoByOffset(1);
    setPreviousSwitchVideo(prevVideo);
    setNextSwitchVideo(nextVideo);
  }, [
    activeVideoId,
    currentIndex,
    externalSource,
    isLandscape,
    playbackOrder,
    queue,
    shuffleRevision,
  ]);

  useEffect(() => {
    if (!sourceUri) {
      return;
    }
    let isActive = true;
    setPlaybackError(null);
    const loadVersion = sourceLoadVersionRef.current + 1;
    sourceLoadVersionRef.current = loadVersion;
    safePausePlayer();
    const initialDisplayTime = !externalSource
      ? resolveInitialPlaybackTimeSeconds(
          activeVideoSource?.lastPlaybackPositionMs,
          activeVideoSource?.durationMs,
        )
      : 0;
    currentTimeRef.current = initialDisplayTime;
    setCurrentTime(initialDisplayTime);
    setDuration(0);
    committedSeekTargetRef.current = initialDisplayTime;
    committedSeekStartedAtRef.current = Date.now();
    setIsPlaying(false);
    // Optimistic no-cover: for local files the first frame typically arrives
    // within COVER_SHOW_GRACE_MS, so the cover never appears and there is no
    // visible stutter. The cover shows only as a fallback for slower sources.
    coverOpacityAnim.stopAnimation();
    coverOpacityAnim.setValue(1);
    coverDismissVersionRef.current += 1;
    const showVersion = coverDismissVersionRef.current;
    if (coverShowTimerRef.current) {
      clearTimeout(coverShowTimerRef.current);
    }
    coverShowTimerRef.current = setTimeout(() => {
      coverShowTimerRef.current = null;
      if (coverDismissVersionRef.current === showVersion) {
        setLoadingCoverVideo(activeVideoSource);
      }
    }, COVER_SHOW_GRACE_MS);
    isReplacingRef.current = true;
    void player
      .replaceAsync({ uri: sourceUri })
      .then(() => {
        isReplacingRef.current = false;
        if (!isActive || sourceLoadVersionRef.current !== loadVersion) {
          return;
        }
        player.timeUpdateEventInterval = 0.25;
        applyPitchPreservingRate(player, speedRef.current);
        player.loop = Boolean(externalSource) || queue.length <= 1;
        if (initialDisplayTime > 0) {
          player.currentTime = initialDisplayTime;
          currentTimeRef.current = initialDisplayTime;
        }
        safePlayPlayer();
        // Cover (if it appeared) is dismissed by onFirstFrameRender.
      })
      .catch((error) => {
        isReplacingRef.current = false;
        if (isActive) {
          if (coverShowTimerRef.current) {
            clearTimeout(coverShowTimerRef.current);
            coverShowTimerRef.current = null;
          }
          setLoadingCoverVideo(null);
          const errorMessage = formatPlaybackErrorMessage(error);
          setPlaybackError(errorMessage);
          showToast(errorMessage);
        }
      });
    return () => {
      isActive = false;
      if (coverShowTimerRef.current) {
        clearTimeout(coverShowTimerRef.current);
        coverShowTimerRef.current = null;
      }
    };
  }, [
    activeVideoSource?.id,
    externalSource,
    player,
    queue.length,
    reloadToken,
    showToast,
    sourceUri,
  ]);

  useEffect(() => {
    player.loop = Boolean(externalSource) || queue.length <= 1;
  }, [externalSource, player, queue.length]);

  useEffect(() => {
    applyPitchPreservingRate(player, speed);
    if (videoPreferencesLoadedRef.current) {
      void saveVideoPlayerPreferences({ speed });
    }
  }, [player, speed]);

  useEffect(() => {
    if (videoPreferencesLoadedRef.current) {
      void saveVideoPlayerPreferences({ holdSpeed });
    }
  }, [holdSpeed]);

  useEffect(() => {
    if (videoPreferencesLoadedRef.current) {
      void saveVideoPlayerPreferences({ playbackOrder });
    }
  }, [playbackOrder]);

  useEffect(() => {
    const timeSubscription = player.addListener("timeUpdate", (payload) => {
      if (isScrubbingRef.current) {
        return;
      }
      if (shouldIgnoreStaleTimeUpdate(payload.currentTime)) {
        return;
      }
      currentTimeRef.current = payload.currentTime;
      setCurrentTime(payload.currentTime);
      setDuration((prevDuration) =>
        Number.isFinite(player.duration) && player.duration > 0
          ? player.duration
          : prevDuration,
      );
    });
    const playingSubscription = player.addListener(
      "playingChange",
      (payload) => {
        isPlayingRef.current = payload.isPlaying;
        setIsPlaying(payload.isPlaying);
      },
    );
    const sourceSubscription = player.addListener("sourceLoad", (payload) => {
      setDuration(payload.duration);
    });
    const playToEndSubscription = player.addListener("playToEnd", () => {
      handlePlayToEndRef.current?.();
    });

    return () => {
      timeSubscription.remove();
      playingSubscription.remove();
      sourceSubscription.remove();
      playToEndSubscription.remove();
    };
  }, [player]);

  useEffect(() => {
    isMountedRef.current = true;
    resetHideTimer();
    return () => {
      isMountedRef.current = false;
      resetHoldFastForwardState();
      clearHideTimer();
      clearVideoSwitchTimers();
      clearPreviewSeekTimer();
      safePausePlayer();
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => undefined);
      if (currentPlaybackVideoIdRef.current) {
        void runWithDatabaseSpace(spaceRef.current, (db) =>
          assetRepository.updatePlaybackPosition(
            db,
            currentPlaybackVideoIdRef.current as number,
            Math.round(currentTimeRef.current * 1000),
          ),
        );
      }
    };
  }, []);

  useEffect(() => {
    const persistPlaybackPosition = () => {
      if (!externalSource && video) {
        void runWithDatabaseSpace(space, (db) =>
          assetRepository.updatePlaybackPosition(
            db,
            video.id,
            Math.round(currentTimeRef.current * 1000),
          ),
        );
      }
    };
    const interval =
      !externalSource && video
        ? setInterval(
            persistPlaybackPosition,
            PLAYBACK_PROGRESS_SAVE_INTERVAL_MS,
          )
        : null;
    const subscription = AppState.addEventListener("change", (state) => {
      const nextActive = state === "active";
      setIsAppActive(nextActive);
      if (!nextActive) {
        // Never auto-resume personal-space playback on foreground return to protect privacy.
        wasPlayingRef.current = space === "personal" ? false : isPlayingRef.current;
        safePausePlayer();
        persistPlaybackPosition();
        resetHoldFastForwardState();
        verticalGestureTokenRef.current += 1;
        verticalGestureKindRef.current = null;
        setVerticalHud((current) =>
          current.visible ? { ...current, visible: false } : current,
        );
        if (space === "personal") {
          setPersonalExportConfirmVisible(false);
          setMoreVisible(false);
          setQueueVisible(false);
        }
      } else if (
        space !== "personal" &&
        wasPlayingRef.current &&
        !playbackErrorRef.current
      ) {
        safePlayPlayer();
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
  const progress =
    duration > 0 ? Math.min(1, Math.max(0, displayTime / duration)) : 0;
  const floatingPanelAnimatedStyle = {
    opacity: floatingMenuOpacity,
    transform: [{ translateY: floatingMenuTranslateY }],
  };
  const videoSwitchAnimatedStyle = {
    transform: [{ translateY: videoSwitchTranslateY }],
  };

  const moreItems: AppActionSheetItem[] = useMemo(
    () => [
      ...(externalSource
        ? []
        : [
            {
              key: "detail",
              label: "视频详情",
              icon: "information-circle-outline" as const,
              onPress: () => {
                setMoreVisible(false);
                if (activeVideoId && onOpenDetail) {
                  onOpenDetail(activeVideoId);
                }
              },
            },
          ]),
      {
        key: "save-local",
        label: "保存本地",
        icon: "download-outline",
        onPress: () => {
          void handleSaveLocalRef.current?.();
        },
      },
      ...(externalSource
        ? [
            {
              key: "save-ip",
              label: "保存到 IP",
              icon: "albums-outline" as const,
              onPress: () => {
                void openSaveToIpRef.current?.();
              },
            },
          ]
        : []),
    ],
    [externalSource, activeVideoId, onOpenDetail],
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
    [duration, player, trackWidth],
  );

  const surfacePanHandlersRef = useRef<{
    onMoveShouldSetPanResponder: (
      event: GestureResponderEvent,
      gestureState: PanResponderGestureState,
    ) => boolean;
    onPanResponderGrant: (event: GestureResponderEvent) => void;
    onPanResponderMove: (
      event: GestureResponderEvent,
      gestureState: PanResponderGestureState,
    ) => void;
    onPanResponderRelease: (
      event: GestureResponderEvent,
      gestureState: PanResponderGestureState,
    ) => void;
    onPanResponderTerminate: () => void;
  } | null>(null);

  surfacePanHandlersRef.current = {
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
      surfaceGestureModeRef.current = "pending";
      lastSurfacePressLocationXRef.current = event.nativeEvent.locationX;
      controlsVisibleBeforeHoldRef.current = controlsVisibleRef.current;
      if (isPlayerLocked || isVideoSwitchTransitioning) {
        return;
      }
      clearLongPressTimer();
      longPressTimerRef.current = setTimeout(() => {
        if (surfaceGestureModeRef.current !== "pending") {
          return;
        }
        surfaceGestureModeRef.current = "hold";
        startHoldFastForward();
      }, 260);
    },
    onPanResponderMove: (event, gestureState) => {
      if (isPlayerLocked || isVideoSwitchTransitioning) {
        return;
      }
      const absDx = Math.abs(gestureState.dx);
      const absDy = Math.abs(gestureState.dy);
      if (surfaceGestureModeRef.current === "pending") {
        const shouldScrub =
          absDx > SURFACE_SCRUB_ACTIVATION_PX && absDx > absDy;
        const shouldAdjustVertically =
          absDy > VERTICAL_GESTURE_ACTIVATION_PX && absDy > absDx;
        if (!shouldScrub && !shouldAdjustVertically) {
          return;
        }
        clearLongPressTimer();
        if (shouldAdjustVertically) {
          if (
            shouldSwitchVideoFromCenterVerticalGesture(
              event.nativeEvent.locationX,
              absDx,
              absDy,
            )
          ) {
            surfaceGestureModeRef.current = "video-switch";
            updateVideoSwitchDrag(gestureState.dy);
            return;
          }
          surfaceGestureModeRef.current = "vertical";
          void beginVerticalGesture(event, gestureState.dy);
          return;
        }
        surfaceGestureModeRef.current = "scrub";
        beginScrub("surface");
        scrubStartTimeRef.current = currentTimeRef.current;
      }
      if (verticalGestureKindRef.current) {
        updateVerticalGesture(gestureState.dy);
        return;
      }
      if (surfaceGestureModeRef.current === "video-switch") {
        updateVideoSwitchDrag(gestureState.dy);
        return;
      }
      if (surfaceGestureModeRef.current !== "scrub") {
        return;
      }
      updateScrubFromSurfaceGesture(gestureState.dx, gestureState.dy);
    },
    onPanResponderRelease: (_event, gestureState) => {
      if (surfaceGestureModeRef.current === "pending") {
        surfaceGestureModeRef.current = null;
        clearLongPressTimer();
        handleSurfacePress();
        return;
      }
      if (surfaceGestureModeRef.current === "hold") {
        surfaceGestureModeRef.current = null;
        finishHoldFastForward();
        return;
      }
      if (verticalGestureKindRef.current) {
        surfaceGestureModeRef.current = null;
        finishVerticalGesture();
        return;
      }
      if (surfaceGestureModeRef.current === "video-switch") {
        surfaceGestureModeRef.current = null;
        finishCenterVideoSwitchGesture(gestureState.dy, gestureState.vy);
        return;
      }
      surfaceGestureModeRef.current = null;
      commitScrub();
    },
    onPanResponderTerminate: () => {
      if (surfaceGestureModeRef.current === "hold") {
        finishHoldFastForward();
        surfaceGestureModeRef.current = null;
        return;
      }
      if (verticalGestureKindRef.current) {
        finishVerticalGesture();
        surfaceGestureModeRef.current = null;
        return;
      }
      if (surfaceGestureModeRef.current === "video-switch") {
        surfaceGestureModeRef.current = null;
        resetVideoSwitchDrag();
        return;
      }
      if (surfaceGestureModeRef.current === "scrub") {
        cancelScrub();
      } else {
        resetHoldFastForwardState();
      }
      surfaceGestureModeRef.current = null;
    },
  };

  // Delegate through a render-updated ref so panHandlers stay stable across state
  // changes (e.g. hold fast-forward or play toggles) without capturing stale adjacent
  // switch targets or playback state in PanResponder closures.
  const surfacePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (event, gestureState) =>
          surfacePanHandlersRef.current?.onMoveShouldSetPanResponder(
            event,
            gestureState,
          ) ?? false,
        onPanResponderGrant: (event) => {
          surfacePanHandlersRef.current?.onPanResponderGrant(event);
        },
        onPanResponderMove: (event, gestureState) => {
          surfacePanHandlersRef.current?.onPanResponderMove(
            event,
            gestureState,
          );
        },
        onPanResponderRelease: (event, gestureState) => {
          surfacePanHandlersRef.current?.onPanResponderRelease(
            event,
            gestureState,
          );
        },
        onPanResponderTerminate: () => {
          surfacePanHandlersRef.current?.onPanResponderTerminate();
        },
        onShouldBlockNativeResponder: () => true,
      }),
    [],
  );

  async function executeSaveLocal() {
    if (!isMountedRef.current || !sourceUri || isSavingLocalRef.current) {
      return;
    }
    isSavingLocalRef.current = true;
    try {
      await saveVideoToSystemAlbum(sourceUri, sourceFileName);
      if (isMountedRef.current) {
        showToast("已保存到系统视频目录");
      }
    } catch (error) {
      if (isMountedRef.current) {
        showToast(`保存失败：${formatActionErrorMessage(error, "请检查存储权限后重试")}`);
      }
    } finally {
      isSavingLocalRef.current = false;
    }
  }

  async function handleSaveLocal() {
    if (!isMountedRef.current || !sourceUri || isSavingLocalRef.current) {
      return;
    }
    if (space === "personal") {
      setPersonalExportConfirmVisible(true);
      return;
    }
    await executeSaveLocal();
  }

  handleSaveLocalRef.current = handleSaveLocal;

  async function openSaveToIp() {
    if (!externalSource || !isMountedRef.current) {
      return;
    }
    const ips = await runWithDatabaseSpace("normal", (db) =>
      ipRepository.findLibraryItems(db),
    );
    if (!isMountedRef.current) {
      return;
    }
    setNormalIps(ips);
    setIpPickerVisible(true);
  }

  openSaveToIpRef.current = openSaveToIp;

  async function saveExternalVideoToIp(ipId: number) {
    if (!externalSource || isSavingToIp || !isMountedRef.current) {
      return;
    }
    setIsSavingToIp(true);
    try {
      await importExternalVideoToIp(ipId);
      if (isMountedRef.current) {
        showToast("已保存到 IP");
        setIpPickerVisible(false);
      }
    } catch (error) {
      if (isMountedRef.current) {
        showToast(`保存到 IP 失败：${formatActionErrorMessage(error, "导入失败，请重试")}`);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSavingToIp(false);
      }
    }
  }

  async function createIpAndSaveExternalVideo() {
    const preparedName = newIpName.trim();
    if (!preparedName || isSavingToIp || !isMountedRef.current) {
      return;
    }
    setIsSavingToIp(true);
    let createdIpId: number | null = null;
    try {
      const createdIp = await runWithDatabaseSpace("normal", (db) =>
        ipRepository.create(db, { name: preparedName }),
      );
      createdIpId = createdIp.id;
      await importExternalVideoToIp(createdIp.id);
      if (isMountedRef.current) {
        setNewIpDialogVisible(false);
        setNewIpName("");
        setIpPickerVisible(false);
        showToast("已新建 IP 并保存");
      }
    } catch (error) {
      if (createdIpId != null) {
        await runWithDatabaseSpace("normal", (db) =>
          db.runAsync("DELETE FROM ips WHERE id = ?", createdIpId),
        ).catch(() => undefined);
      }
      if (isMountedRef.current) {
        showToast(`新建 IP 失败：${formatActionErrorMessage(error, "创建失败，请重试")}`);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSavingToIp(false);
      }
    }
  }

  async function importExternalVideoToIp(ipId: number) {
    if (!externalSource) {
      throw new Error("外部视频不可用。");
    }
    await importVideosToIp({
      space: "normal",
      ipId,
      pickedAssets: [externalSource],
      title: "保存外部视频",
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
    if (queueVisibleRef.current || !isPlayingRef.current) {
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
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function clearHoldProgressInterval() {
    if (holdProgressIntervalRef.current) {
      clearInterval(holdProgressIntervalRef.current);
      holdProgressIntervalRef.current = null;
    }
  }

  function clearPreviewSeekTimer() {
    if (previewSeekTimerRef.current) {
      clearTimeout(previewSeekTimerRef.current);
      previewSeekTimerRef.current = null;
    }
    pendingPreviewSeekTimeRef.current = null;
  }

  function clearVideoSwitchTimers() {
    if (switchCommitTimerRef.current) {
      clearTimeout(switchCommitTimerRef.current);
      switchCommitTimerRef.current = null;
    }
    if (switchSafetyTimerRef.current) {
      clearTimeout(switchSafetyTimerRef.current);
      switchSafetyTimerRef.current = null;
    }
  }

  function resetHoldFastForwardState() {
    if (isHoldingFastForwardRef.current) {
      applyPitchPreservingRate(player, speedRef.current);
      isHoldingFastForwardRef.current = false;
    }
    clearLongPressTimer();
    clearHoldProgressInterval();
    setHoldSpeedVisible(false);
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
      isPlayingRef.current = false;
      setIsPlaying(false);
    } catch {
      // The expo-video shared object may already be released during teardown.
    }
  }

  function safePlayPlayer() {
    try {
      player.play();
      isPlayingRef.current = true;
      setIsPlaying(true);
    } catch (error) {
      showToast(
        error instanceof Error ? `播放失败：${error.message}` : "播放失败",
      );
      isPlayingRef.current = false;
      setIsPlaying(false);
    }
  }

  function persistPlaybackPosition(videoId: number, positionMs: number) {
    return runWithDatabaseSpace(spaceRef.current, (db) =>
      assetRepository.updatePlaybackPosition(db, videoId, positionMs),
    );
  }

  function startHoldFastForward() {
    clearLongPressTimer();
    clearHideTimer();
    clearHoldProgressInterval();
    isHoldingFastForwardRef.current = true;
    holdWasPlayingRef.current = isPlayingRef.current;
    setHoldSpeedVisible(true);
    applyPitchPreservingRate(player, holdSpeedRef.current);
    safePlayPlayer();
    holdProgressIntervalRef.current = setInterval(() => {
      currentTimeRef.current = player.currentTime;
      setCurrentTime(player.currentTime);
    }, 150);
  }

  function finishHoldFastForward() {
    const wasHolding = isHoldingFastForwardRef.current;
    resetHoldFastForwardState();
    if (wasHolding && !holdWasPlayingRef.current) {
      safePausePlayer();
    }
    if (controlsVisibleBeforeHoldRef.current) {
      setControlsVisible(true);
      resetHideTimer();
    } else {
      setControlsVisible(false);
      clearHideTimer();
    }
  }

  function togglePlay() {
    showControls();
    if (isPlayingRef.current) {
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
    gestureFeedbackTimerRef.current = setTimeout(() => {
      setGestureFeedback(null);
      gestureFeedbackTimerRef.current = null;
    }, 900);
  }

  function showVerticalHud(kind: VerticalGestureKind, value: number) {
    if (verticalHudTimerRef.current) {
      clearTimeout(verticalHudTimerRef.current);
      verticalHudTimerRef.current = null;
    }
    setVerticalHud({ kind, value, visible: true });
  }

  function scheduleVerticalHudHide() {
    if (verticalHudTimerRef.current) {
      clearTimeout(verticalHudTimerRef.current);
    }
    verticalHudTimerRef.current = setTimeout(() => {
      verticalHudTimerRef.current = null;
      setVerticalHud((current) => ({ ...current, visible: false }));
    }, VERTICAL_HUD_HIDE_DELAY_MS);
  }

  function handleSurfacePress() {
    if (isPlayerLocked) {
      showControls();
      return;
    }
    const now = Date.now();
    if (now - lastSurfaceTapAtRef.current <= DOUBLE_TAP_PAUSE_WINDOW_MS) {
      lastSurfaceTapAtRef.current = 0;
      handlePartitionDoubleTap(lastSurfacePressLocationXRef.current);
      return;
    }
    lastSurfaceTapAtRef.current = now;
    toggleControls();
  }

  function handlePartitionDoubleTap(locationX: number) {
    const leftBoundary = surfaceWidth / 3;
    const rightBoundary = (surfaceWidth * 2) / 3;
    if (locationX < leftBoundary) {
      seekByOffset(-GESTURE_DOUBLE_TAP_SEEK_SECONDS);
      showGestureFeedback({
        kind: "seek-backward",
        label: `后退 ${GESTURE_DOUBLE_TAP_SEEK_SECONDS}s`,
      });
      return;
    }
    if (locationX > rightBoundary) {
      seekByOffset(GESTURE_DOUBLE_TAP_SEEK_SECONDS);
      showGestureFeedback({
        kind: "seek-forward",
        label: `前进 ${GESTURE_DOUBLE_TAP_SEEK_SECONDS}s`,
      });
      return;
    }
    togglePlay();
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
        verticalGestureTokenRef.current += 1;
        verticalGestureKindRef.current = null;
        setVerticalHud((current) =>
          current.visible ? { ...current, visible: false } : current,
        );
        setControlsVisible(false);
        setSpeedMenuVisible(false);
        setQueueVisible(false);
        setMoreVisible(false);
      } else {
        showControls();
      }
      void saveVideoPlayerPreferences({ lockedByDefault: nextLocked });
      showGestureFeedback({
        kind: nextLocked ? "locked" : "unlocked",
        label: nextLocked ? "已锁定" : "已解锁",
      });
      return nextLocked;
    });
  }

  async function beginVerticalGesture(
    event: GestureResponderEvent,
    initialDy = 0,
  ) {
    const gestureKind: VerticalGestureKind =
      event.nativeEvent.locationX < surfaceWidth / 2 ? "brightness" : "volume";
    const token = verticalGestureTokenRef.current + 1;
    verticalGestureTokenRef.current = token;
    verticalGestureKindRef.current = gestureKind;
    verticalGestureAnchorDyRef.current = initialDy;
    verticalGestureLatestDyRef.current = initialDy;

    const cachedStart =
      gestureKind === "brightness"
        ? lastBrightnessRef.current
        : lastVolumeRef.current;
    verticalGestureStartValueRef.current = cachedStart;
    showVerticalHud(gestureKind, cachedStart);

    const resolvedStart =
      gestureKind === "brightness"
        ? await Brightness.getBrightnessAsync().catch(() => cachedStart)
        : await VolumeManager.getVolume()
            .then((result) => result.volume)
            .catch(() => cachedStart);

    if (
      !isMountedRef.current ||
      verticalGestureTokenRef.current !== token ||
      verticalGestureKindRef.current !== gestureKind
    ) {
      return;
    }

    verticalGestureStartValueRef.current = resolvedStart;
    const effectiveDy =
      verticalGestureLatestDyRef.current - verticalGestureAnchorDyRef.current;
    if (effectiveDy === 0) {
      if (gestureKind === "brightness") {
        lastBrightnessRef.current = resolvedStart;
      } else {
        lastVolumeRef.current = resolvedStart;
      }
      showVerticalHud(gestureKind, resolvedStart);
      return;
    }

    const rebasedValue = computeVerticalGestureValue(
      resolvedStart,
      effectiveDy,
      surfaceHeight,
      VERTICAL_GESTURE_FULL_HEIGHT_RATIO,
    );
    if (gestureKind === "brightness") {
      void adjustBrightnessFromGesture(rebasedValue);
    } else {
      void adjustVolumeFromGesture(rebasedValue);
    }
    showVerticalHud(gestureKind, rebasedValue);
  }

  function updateVerticalGesture(deltaY: number) {
    const gestureKind = verticalGestureKindRef.current;
    if (!gestureKind) {
      return;
    }
    verticalGestureLatestDyRef.current = deltaY;
    const effectiveDy = deltaY - verticalGestureAnchorDyRef.current;
    const nextValue = computeVerticalGestureValue(
      verticalGestureStartValueRef.current,
      effectiveDy,
      surfaceHeight,
      VERTICAL_GESTURE_FULL_HEIGHT_RATIO,
    );
    if (gestureKind === "brightness") {
      void adjustBrightnessFromGesture(nextValue);
      showVerticalHud("brightness", nextValue);
      return;
    }
    void adjustVolumeFromGesture(nextValue);
    showVerticalHud("volume", nextValue);
  }

  function finishVerticalGesture() {
    verticalGestureTokenRef.current += 1;
    verticalGestureKindRef.current = null;
    verticalGestureAnchorDyRef.current = 0;
    verticalGestureLatestDyRef.current = 0;
    scheduleVerticalHudHide();
    if (controlsVisibleRef.current) {
      resetHideTimer();
    }
  }

  function togglePlaybackOrder() {
    const currentOrder = playbackOrderRef.current;
    const nextOrder: VideoPlaybackOrder =
      currentOrder === "sequence"
        ? "shuffle"
        : currentOrder === "shuffle"
          ? "single"
          : "sequence";
    playbackOrderRef.current = nextOrder;
    setPlaybackOrder(nextOrder);

    if (nextOrder === "shuffle") {
      if (!externalSource && queue.length > 1) {
        shuffleSessionRef.current = new VideoShuffleSession({
          queueIds: queue.map((item) => item.id),
          currentId: activeVideoId,
        });
      }
      historyRef.current = activeVideoId ? [activeVideoId] : [];
      historyCursorRef.current = 0;
    } else {
      shuffleSessionRef.current = null;
    }
    setShuffleRevision((v) => v + 1);
    showControls();
  }

  function shouldSwitchVideoFromCenterVerticalGesture(
    locationX: number,
    absDx: number,
    absDy: number,
  ) {
    if (isLandscape || externalSource || queue.length <= 1) {
      return false;
    }
    const centerLeft = surfaceWidth * CENTER_VIDEO_SWITCH_LEFT_RATIO;
    const centerRight = surfaceWidth * CENTER_VIDEO_SWITCH_RIGHT_RATIO;
    return (
      locationX >= centerLeft &&
      locationX <= centerRight &&
      absDy > absDx * CENTER_VIDEO_SWITCH_DOMINANCE_RATIO
    );
  }

  function finishCenterVideoSwitchGesture(deltaY: number, velocityY?: number) {
    const effectiveVelocityY = velocityY ?? 0;
    const resolution = resolveVideoSwipe({
      canGoNext: nextSwitchVideo != null,
      canGoPrevious: previousSwitchVideo != null,
      translationY: deltaY,
      velocityY: effectiveVelocityY,
      viewportHeight: surfaceHeight,
    });
    if (resolution.action === "cancel") {
      const hasVelocityCommit =
        Math.abs(effectiveVelocityY) >= VIDEO_SWIPE_VELOCITY_THRESHOLD;
      const hasDistanceCommit =
        surfaceHeight > 0 &&
        Math.abs(deltaY) >= surfaceHeight * VIDEO_SWIPE_DISTANCE_RATIO;
      if (hasVelocityCommit || hasDistanceCommit) {
        const intendedDirection = hasVelocityCommit
          ? effectiveVelocityY < 0
            ? 1
            : -1
          : deltaY < 0
            ? 1
            : -1;
        if (intendedDirection === -1 && previousSwitchVideo == null) {
          showToast("已经是第一个视频");
        } else if (intendedDirection === 1 && nextSwitchVideo == null) {
          showToast("已经是最后一个视频");
        }
      }
      resetVideoSwitchDrag();
      return;
    }
    const nextVideo =
      resolution.direction === 1 ? nextSwitchVideo : previousSwitchVideo;
    if (!nextVideo) {
      resetVideoSwitchDrag();
      return;
    }
    switchVideoWithTransition(
      nextVideo,
      resolution.direction as 1 | -1,
      getVideoSwitchHistoryMode(resolution.direction as 1 | -1),
    );
  }

  function updateVideoSwitchDrag(deltaY: number) {
    if (swipeSettlingRef.current) {
      // Reverse interception during settle: stop the settle animation and resume drag
      swipeSettlingRef.current = false;
      clearVideoSwitchTimers();
      videoSwitchTranslateY.stopAnimation(() => {
        if (isMountedRef.current) {
          setIsVideoSwitchTransitioning(false);
        }
      });
    }
    const maxTranslate = Math.max(1, surfaceHeight);
    videoSwitchTranslateY.setValue(
      Math.max(-maxTranslate, Math.min(maxTranslate, deltaY)),
    );
  }

  function resetVideoSwitchDrag() {
    swipeSettlingRef.current = true;
    Animated.spring(videoSwitchTranslateY, {
      toValue: 0,
      damping: 22,
      mass: 0.8,
      stiffness: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      swipeSettlingRef.current = false;
      if (finished && isMountedRef.current) {
        resetHideTimer();
      }
    });
  }

  function switchVideoWithTransition(
    nextVideo: ImageListItem,
    direction: 1 | -1,
    historyMode: VideoSwitchHistoryMode = "append",
  ) {
    if (isVideoSwitchTransitioning && !swipeSettlingRef.current) {
      return;
    }
    clearVideoSwitchTimers();
    setIsVideoSwitchTransitioning(true);
    swipeSettlingRef.current = true;
    resetHoldFastForwardState();
    clearHideTimer();
    setSpeedMenuVisible(false);
    setQueueVisible(false);
    setMoreVisible(false);

    // 1. Exit: slide the current surface out in the swipe direction.
    // The adjacent cover (which sits at +/- surfaceHeight) will slide into the viewport.
    const transitionHeight = Math.max(1, surfaceHeight);
    Animated.timing(videoSwitchTranslateY, {
      toValue: direction * -transitionHeight,
      duration: VIDEO_SWITCH_EXIT_DURATION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!isMountedRef.current || !finished) {
        clearVideoSwitchTimers();
        swipeSettlingRef.current = false;
        if (isMountedRef.current) {
          setIsVideoSwitchTransitioning(false);
          videoSwitchTranslateY.setValue(0);
        }
        return;
      }
      // 2. The adjacent cover is now perfectly covering the screen.
      // We seamlessly swap the VideoView to screen pos 0 and load the new video.

      // Set the loading cover immediately.
      coverOpacityAnim.setValue(1);
      setLoadingCoverVideo(nextVideo);
      safePausePlayer(); // instantly stop playing old audio during transition delay

      // Delay coordinate reset AND the actual switch to prevent React from
      // instantly changing the adjacent cover we just dragged in to the next-next cover.
      // This prevents a rapid flash of the next-next video's cover during the 50ms mount window.
      switchCommitTimerRef.current = setTimeout(() => {
        switchCommitTimerRef.current = null;
        clearVideoSwitchTimers();
        if (!isMountedRef.current) {
          return;
        }
        videoSwitchTranslateY.setValue(0);
        switchVideo(nextVideo.id, nextVideo, {
          historyMode,
          pauseBeforeSwitch: false,
          showControls: false,
        });
        swipeSettlingRef.current = false;
        setIsVideoSwitchTransitioning(false);
        resetHideTimer();
      }, 50);
    });

    // Safety unlock: if the animation chain is interrupted without a finish callback
    switchSafetyTimerRef.current = setTimeout(
      () => {
        switchSafetyTimerRef.current = null;
        if (isMountedRef.current && swipeSettlingRef.current) {
          swipeSettlingRef.current = false;
          setIsVideoSwitchTransitioning(false);
          videoSwitchTranslateY.setValue(0);
          resetHideTimer();
        }
      },
      VIDEO_SWITCH_EXIT_DURATION_MS + 250,
    );
  }

  async function adjustBrightnessFromGesture(value: number) {
    lastBrightnessRef.current = value;
    await Brightness.setBrightnessAsync(value).catch(() => undefined);
  }

  async function adjustVolumeFromGesture(value: number) {
    lastVolumeRef.current = value;
    await VolumeManager.setVolume(value, {
      type: "music",
      showUI: false,
      playSound: false,
    }).catch(() => undefined);
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
    return duration > 0
      ? duration
      : Number.isFinite(player.duration) && player.duration > 0
        ? player.duration
        : 0;
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

    const isSettled =
      Math.abs(nextTime - targetTime) <= COMMITTED_SEEK_TOLERANCE_SECONDS;
    if (isSettled) {
      committedSeekTargetRef.current = null;
      return false;
    }

    const isStillSettling =
      Date.now() - committedSeekStartedAtRef.current <
      COMMITTED_SEEK_SETTLE_TIMEOUT_MS;
    if (isStillSettling) {
      return true;
    }

    committedSeekTargetRef.current = null;
    player.currentTime = targetTime;
    currentTimeRef.current = targetTime;
    setCurrentTime(targetTime);
    return true;
  }

  function beginScrub(source: "controls" | "surface" = "controls") {
    resetHoldFastForwardState();
    clearHideTimer();
    const isSurfaceSource = source === "surface";
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
    return effectiveDuration > 0
      ? Math.min(effectiveDuration, Math.max(0, nextTime))
      : 0;
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
    const rawTargetTime =
      ((pageX - trackPageXRef.current) / measuredWidth) * effectiveDuration;
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
    const rawTargetTime =
      scrubStartTimeRef.current + dragRatio * secondsPerScreen * fineTuneFactor;
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
      Math.max(
        SURFACE_SEEK_SUPER_LONG_MIN_SECONDS_PER_SCREEN,
        effectiveDuration * SURFACE_SEEK_SUPER_LONG_TARGET_RATIO,
      ),
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
        (ratio - SURFACE_SEEK_DAMPING_LOW_RATIO) *
          SURFACE_SEEK_DAMPING_MID_FACTOR;
    } else {
      dampedRatio =
        SURFACE_SEEK_DAMPING_LOW_RATIO * SURFACE_SEEK_DAMPING_LOW_FACTOR +
        (SURFACE_SEEK_DAMPING_HIGH_RATIO - SURFACE_SEEK_DAMPING_LOW_RATIO) *
          SURFACE_SEEK_DAMPING_MID_FACTOR +
        (ratio - SURFACE_SEEK_DAMPING_HIGH_RATIO) *
          SURFACE_SEEK_DAMPING_HIGH_FACTOR;
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

  function getScrubBoundaryHint(
    rawTargetTime: number,
    effectiveDuration: number,
  ) {
    if (rawTargetTime < 0) {
      return "已到开头";
    }
    if (rawTargetTime > effectiveDuration) {
      return "已到结尾";
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
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
        setIsLandscape(false);
        void saveVideoPlayerPreferences({ orientationPreference: "portrait" });
      } else {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE,
        );
        setIsLandscape(true);
        void saveVideoPlayerPreferences({ orientationPreference: "landscape" });
      }
      showControls();
    } catch {
      showToast("横竖屏切换失败");
    }
  }

  function switchVideo(
    nextVideoId: number,
    nextVideo?: ImageListItem,
    options?: {
      historyMode?: VideoSwitchHistoryMode;
      pauseBeforeSwitch?: boolean;
      showControls?: boolean;
    },
  ) {
    resetHoldFastForwardState();
    if (!externalSource && video) {
      const positionMs = Math.round(currentTimeRef.current * 1000);
      void persistPlaybackPosition(video.id, positionMs);
      setQueue((prevQueue) =>
        prevQueue.map((item) =>
          item.id === video.id
            ? { ...item, lastPlaybackPositionMs: positionMs }
            : item,
        ),
      );
    }
    if (options?.pauseBeforeSwitch !== false) {
      safePausePlayer();
    }
    // Commit to shuffle session
    const session = shuffleSessionRef.current;
    if (session) {
      session.setPrevious(activeVideoId);
      if (
        options?.historyMode !== "back" &&
        options?.historyMode !== "forward"
      ) {
        // If the next video matches what peekNext returned, commitNext to advance.
        // Otherwise it's a queue tap — just markPlayed.
        if (session.peekNext() === nextVideoId) {
          session.commitNext();
        } else {
          session.markPlayed(nextVideoId);
        }
        setShuffleRevision((v) => v + 1);
      }
    }
    setSwitchPreviewVideo(nextVideo ?? null);
    setActiveVideoId(nextVideoId);
    if (options?.historyMode === "back") {
      historyCursorRef.current = Math.max(0, historyCursorRef.current - 1);
    } else if (options?.historyMode === "forward") {
      historyCursorRef.current = Math.min(
        historyRef.current.length - 1,
        historyCursorRef.current + 1,
      );
    } else {
      historyRef.current = historyRef.current.slice(
        0,
        historyCursorRef.current + 1,
      );
      historyRef.current.push(nextVideoId);
      historyCursorRef.current++;
    }
    setQueueVisible(false);
    if (options?.showControls === false) {
      resetHideTimer();
    } else {
      showControls();
    }
  }

  switchVideoRef.current = switchVideo;

  function getSequenceVideoByOffset(offset: 1 | -1) {
    if (queue.length === 0 || currentIndex < 0) {
      return null;
    }
    const nextIndex = (currentIndex + offset + queue.length) % queue.length;
    const nextVideo = queue[nextIndex];
    return nextVideo && nextVideo.id !== activeVideoId ? nextVideo : null;
  }

  function getShuffleNextVideo() {
    const session = shuffleSessionRef.current;
    if (!session || queue.length <= 1) {
      return null;
    }
    const nextId = session.peekNext();
    return nextId != null
      ? (queue.find((item) => item.id === nextId) ?? null)
      : null;
  }

  function getPreviousWatchedVideo() {
    if (historyCursorRef.current > 0) {
      const id = historyRef.current[historyCursorRef.current - 1];
      return queue.find((item) => item.id === id) ?? null;
    }
    return null;
  }

  function getForwardWatchedVideo() {
    if (historyCursorRef.current < historyRef.current.length - 1) {
      const id = historyRef.current[historyCursorRef.current + 1];
      return queue.find((item) => item.id === id) ?? null;
    }
    return null;
  }

  function getVideoByOffset(offset: 1 | -1) {
    if (playbackOrder === "shuffle") {
      if (offset === -1) {
        return getPreviousWatchedVideo();
      } else {
        const forward = getForwardWatchedVideo();
        return forward ? forward : getShuffleNextVideo();
      }
    }
    return getSequenceVideoByOffset(offset);
  }

  function getVideoSwitchHistoryMode(offset: 1 | -1): VideoSwitchHistoryMode {
    if (playbackOrder === "shuffle") {
      if (offset === -1) return "back";
      if (offset === 1 && getForwardWatchedVideo()) return "forward";
    }
    return "append";
  }

  function switchVideoByOffset(offset: 1 | -1) {
    const nextVideo = getVideoByOffset(offset);
    if (nextVideo) {
      switchVideo(nextVideo.id, nextVideo, {
        historyMode: getVideoSwitchHistoryMode(offset),
      });
    }
  }

  function handlePlayToEnd() {
    if (externalSource || queue.length <= 1 || isReplacingRef.current) {
      return;
    }
    // Reject ghost playToEnd events from the previous video
    if (player.duration > 0 && player.currentTime < player.duration - 1) {
      return;
    }
    if (currentPlaybackVideoIdRef.current) {
      currentTimeRef.current = 0;
      setCurrentTime(0);
      const finishedId = currentPlaybackVideoIdRef.current;
      void persistPlaybackPosition(finishedId, 0);
      setQueue((prevQueue) =>
        prevQueue.map((item) =>
          item.id === finishedId
            ? { ...item, lastPlaybackPositionMs: 0 }
            : item,
        ),
      );
    }

    if (playbackOrder === "single") {
      player.replay();
      return;
    }

    const nextVideo =
      playbackOrder === "shuffle"
        ? getShuffleNextVideo()
        : getSequenceVideoByOffset(1);
    if (nextVideo) {
      switchVideo(nextVideo.id, nextVideo, { showControls: false });
    }
  }

  handlePlayToEndRef.current = handlePlayToEnd;

  const title = sourceFileName;

  function handleBack() {
    safePausePlayer();
    onBack();
  }

  const topBarNode = useMemo(
    () => (
      <View
        style={[
          styles.topBar,
          isLandscape ? styles.landscapeTopBar : null,
          { paddingTop: insets.top + spacing[2] },
        ]}
      >
        <View style={styles.topLeft}>
          <Pressable
            accessibilityLabel="返回"
            onPress={handleBack}
            style={({ pressed }) => [
              styles.hudButton,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons color="#fff" name="chevron-left" size={28} />
          </Pressable>
          <View style={styles.topTitleGroup}>
            <Text numberOfLines={1} style={styles.playerTitle}>
              {title}
            </Text>
          </View>
        </View>
        <View style={styles.topRight}>
          <Pressable
            accessibilityLabel="更多"
            onPress={() => {
              setMoreVisible((current) => !current);
              showControls();
            }}
            style={({ pressed }) => [
              styles.hudButton,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons color="#fff" name="more-vert" size={24} />
          </Pressable>
        </View>
      </View>
    ),
    [insets.top, isLandscape, title],
  );

  const displayQueue = useMemo(() => {
    if (playbackOrder === "shuffle" && shuffleSessionRef.current) {
      const session = shuffleSessionRef.current;
      const queueById = new Map(queue.map((item) => [item.id, item]));
      const playedItems = Array.from(session.getPlayedIds())
        .map((id) => queueById.get(id))
        .filter((item): item is ImageListItem => Boolean(item));
      const candidateItems = session
        .getCandidates()
        .map((id) => queueById.get(id))
        .filter((item): item is ImageListItem => Boolean(item));

      const combined = [...playedItems, ...candidateItems];
      if (activeVideoId && !combined.some((v) => v.id === activeVideoId)) {
        const currentItem = queueById.get(activeVideoId);
        if (currentItem) {
          combined.splice(playedItems.length, 0, currentItem);
        }
      }
      return combined;
    }
    return queue;
  }, [queue, playbackOrder, activeVideoId, shuffleRevision]);

  const drawerKeyExtractor = useCallback(
    (item: ImageListItem) => String(item.id),
    [],
  );

  const getDrawerItemLayout = useCallback(
    (_data: ArrayLike<ImageListItem> | null | undefined, index: number) => ({
      index,
      length: DRAWER_ITEM_HEIGHT,
      offset: (DRAWER_ITEM_HEIGHT + DRAWER_ITEM_GAP) * index,
    }),
    [],
  );

  const renderDrawerSeparator = useCallback(
    () => <View style={styles.drawerItemSeparator} />,
    [],
  );

  const drawerEmptyNode = useMemo(
    () => (
      <View style={styles.drawerEmptyState}>
        <Ionicons
          color="rgba(255,255,255,0.52)"
          name="film-outline"
          size={26}
        />
        <Text style={styles.drawerEmptyTitle}>暂无可切换视频</Text>
        <Text style={styles.drawerEmptyHint}>
          {externalSource
            ? "当前为外部打开的视频文件"
            : "当前所属分类下没有其他视频"}
        </Text>
      </View>
    ),
    [externalSource],
  );

  const drawerDisplayTimeSec = queueVisible ? Math.floor(displayTime) : 0;

  const handleSelectDrawerItem = useCallback((selectedItem: ImageListItem) => {
    switchVideoRef.current?.(selectedItem.id, selectedItem);
  }, []);

  const renderDrawerItem = useCallback(
    ({ item }: ListRenderItemInfo<ImageListItem>) => {
      const isActive = item.id === activeVideoId;
      return (
        <DrawerQueueRow
          activeDisplayTimeSec={isActive ? drawerDisplayTimeSec : 0}
          height={DRAWER_ITEM_HEIGHT}
          isActive={isActive}
          item={item}
          onSelect={handleSelectDrawerItem}
          space={space}
        />
      );
    },
    [activeVideoId, drawerDisplayTimeSec, handleSelectDrawerItem, space],
  );

  const handleVideoFirstFrameRender = useCallback(() => {
    // Cancel pending cover-show: for fast local files, the first frame
    // arrives before the grace period expires, so the cover never shows.
    if (coverShowTimerRef.current) {
      clearTimeout(coverShowTimerRef.current);
      coverShowTimerRef.current = null;
    }
    // If the cover is already showing (slow source or resumed after
    // background), fade it out smoothly. Version guard protects against
    // stale callbacks from a previous source or a quality-track change.
    const dismissVersion = coverDismissVersionRef.current;
    Animated.timing(coverOpacityAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (
        finished &&
        isMountedRef.current &&
        coverDismissVersionRef.current === dismissVersion
      ) {
        setLoadingCoverVideo(null);
      }
    });
  }, [coverOpacityAnim]);

  const displayQueueIndex = useMemo(() => {
    const idx = displayQueue.findIndex((item) => item.id === activeVideoId);
    return idx >= 0 ? idx + 1 : 0;
  }, [displayQueue, activeVideoId]);

  const adjacentCoverOpacity = useMemo(
    () =>
      videoSwitchTranslateY.interpolate({
        inputRange: [-1, -0.01, 0, 0.01, 1],
        outputRange: [1, 1, 0, 1, 1],
        extrapolate: "clamp",
      }),
    [videoSwitchTranslateY],
  );

  function renderAdjacentSwitchCover(
    targetVideo: ImageListItem | null,
    topOffset: number,
  ) {
    if (!targetVideo || surfaceHeight <= 1) {
      return null;
    }
    const coverUri =
      targetVideo.coverThumbnailFileUri ?? targetVideo.thumbnailFileUri;
    return (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.videoAdjacentCoverSlot,
          {
            top: topOffset,
            height: surfaceHeight,
            opacity: adjacentCoverOpacity,
          },
        ]}
      >
        {coverUri ? (
          <SecureImage
            contentFit={videoContentFit}
            space={space}
            style={styles.videoAdjacentCoverImage}
            uri={coverUri}
          />
        ) : (
          <View style={styles.videoAdjacentPlaceholder} />
        )}
      </Animated.View>
    );
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
        {/* Adjacent video covers sit one screen above/below, visible only during manual drag */}
        {renderAdjacentSwitchCover(previousSwitchVideo, -surfaceHeight)}
        {renderAdjacentSwitchCover(nextSwitchVideo, surfaceHeight)}
        <VideoView
          allowsPictureInPicture={false}
          contentFit={videoContentFit}
          fullscreenOptions={VIDEO_FULLSCREEN_OPTIONS}
          nativeControls={false}
          onFirstFrameRender={handleVideoFirstFrameRender}
          player={player}
          startsPictureInPictureAutomatically={false}
          style={styles.videoView}
        />
        {(loadingCoverVideo?.coverThumbnailFileUri ??
        loadingCoverVideo?.thumbnailFileUri) ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.videoLoadingCover, { opacity: coverOpacityAnim }]}
          >
            <SecureImage
              contentFit={videoContentFit}
              space={space}
              style={styles.videoLoadingCoverImage}
              uri={
                (loadingCoverVideo.coverThumbnailFileUri ??
                  loadingCoverVideo.thumbnailFileUri) as string
              }
            />
          </Animated.View>
        ) : null}
        <View
          {...surfacePanResponder.panHandlers}
          style={styles.videoGestureLayer}
        />
      </Animated.View>

      {playbackError ? (
        <View pointerEvents="box-none" style={styles.playbackErrorOverlay}>
          <View style={styles.playbackErrorCard}>
            <Ionicons
              color={colors.text.inverse}
              name="alert-circle-outline"
              size={28}
            />
            <Text style={styles.playbackErrorTitle}>视频暂时无法播放</Text>
            <Text numberOfLines={2} style={styles.playbackErrorMessage}>
              {playbackError}
            </Text>
            <View style={styles.playbackErrorActions}>
              <Pressable
                accessibilityLabel="重试播放"
                accessibilityRole="button"
                onPress={() => {
                  setPlaybackError(null);
                  setReloadToken((n) => n + 1);
                }}
                style={({ pressed }) => [
                  styles.playbackErrorPrimaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.playbackErrorPrimaryText}>重试</Text>
              </Pressable>
              {!externalSource && queue.length > 1 ? (
                <Pressable
                  accessibilityLabel="播放下一个视频"
                  accessibilityRole="button"
                  onPress={() => switchVideoByOffset(1)}
                  style={({ pressed }) => [
                    styles.playbackErrorSecondaryButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.playbackErrorSecondaryText}>下一个</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      <VerticalGestureHud
        kind={verticalHud.kind}
        leftInset={insets.left}
        rightInset={insets.right}
        value={verticalHud.value}
        visible={verticalHud.visible}
      />

      {gestureFeedback ? (
        <View pointerEvents="none" style={styles.gestureFeedback}>
          <Ionicons
            color={colors.text.inverse}
            name={getGestureFeedbackIcon(gestureFeedback.kind)}
            size={24}
          />
          <Text style={styles.gestureFeedbackText}>
            {gestureFeedback.label}
          </Text>
        </View>
      ) : null}

      {isSurfaceScrubbing && isScrubbing ? (
        <View pointerEvents="none" style={styles.surfaceScrubOverlay}>
          <Text style={styles.surfaceScrubTime}>
            {formatDuration(displayTime * 1000)} /{" "}
            {formatDuration(duration * 1000)}
          </Text>
          <View style={styles.surfaceScrubTrack}>
            <View
              style={[styles.surfaceScrubFill, { width: `${progress * 100}%` }]}
            />
          </View>
          <Text style={styles.surfaceScrubMeta}>
            {formatScrubMeta(
              displayTime - scrubStartTimeRef.current,
              scrubGestureHint,
            )}
          </Text>
        </View>
      ) : null}

      {holdSpeedVisible ? (
        <View
          pointerEvents="none"
          style={[
            styles.holdSpeedCenterContainer,
            {
              bottom: insets.bottom + (isLandscape ? spacing[3] : spacing[6]),
            },
          ]}
        >
          <View
            accessibilityLabel={`${holdSpeed}倍速快进`}
            accessibilityRole="text"
            style={[
              styles.holdSpeedBadge,
              styles.holdSpeedFloatingBadge,
              styles.holdSpeedCenterBadge,
            ]}
          >
            <Ionicons
              color={colors.primary.hover}
              name="play-forward"
              size={14}
            />
            <Text style={styles.holdSpeedBadgeText}>
              {holdSpeed}x 快进
            </Text>
          </View>
        </View>
      ) : null}

      <Animated.View
        pointerEvents={
          controlsVisible && !isPlayerLocked && !holdSpeedVisible
            ? "box-none"
            : "none"
        }
        style={[
          styles.controlsLayer,
          { opacity: controlsOpacity },
          holdSpeedVisible ? styles.layerHiddenDuringHold : null,
        ]}
      >
        {!isPlayerLocked && (
          <>
            {topBarNode}

            {moreVisible ? (
              <>
                <Pressable
                  accessibilityLabel="关闭视频操作菜单"
                  onPress={() => setMoreVisible(false)}
                  style={styles.menuDismissLayer}
                />
                <Animated.View
                  style={[
                    styles.moreMenu,
                    { top: insets.top + 58, right: spacing[3] },
                    floatingPanelAnimatedStyle,
                  ]}
                >
                  {moreItems.map((item) => (
                    <Pressable
                      accessibilityLabel={item.label}
                      accessibilityRole="button"
                      key={item.key}
                      onPress={() => {
                        setMoreVisible(false);
                        item.onPress();
                      }}
                      style={({ pressed }) => [
                        styles.moreMenuRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      {item.icon ? (
                        <Ionicons
                          color={colors.text.inverse}
                          name={item.icon}
                          size={17}
                        />
                      ) : null}
                      <Text style={styles.moreMenuText}>{item.label}</Text>
                    </Pressable>
                  ))}
                </Animated.View>
              </>
            ) : null}

            {speedMenuVisible ? (
              <Animated.View
                style={[
                  styles.speedPanel,
                  { bottom: insets.bottom + (isLandscape ? 88 : 116) },
                  floatingPanelAnimatedStyle,
                ]}
              >
                <View style={styles.speedGroup}>
                  <View style={styles.speedGroupHeader}>
                    <Text style={styles.speedTitle}>播放速度</Text>
                    <Text style={styles.speedTitleSub}>SPEED RATE</Text>
                  </View>
                  <View style={styles.speedGrid}>
                    {SPEED_OPTIONS.map((option) => (
                      <Pressable
                        accessibilityLabel={`播放速度 ${option} 倍`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: speed === option }}
                        key={option}
                        onPress={() => {
                          setSpeed(option);
                          setSpeedMenuVisible(false);
                          showControls();
                        }}
                        style={[
                          styles.speedChip,
                          speed === option ? styles.speedChipActive : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.speedChipText,
                            speed === option ? styles.speedChipTextActive : null,
                          ]}
                        >
                          {option}x
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.speedGroupLast}>
                  <View style={styles.speedGroupHeader}>
                    <Text style={styles.speedTitle}>长按快进</Text>
                    <Text style={styles.speedTitleSub}>LONG PRESS</Text>
                  </View>
                  <View style={styles.longPressGrid}>
                    {SPEED_OPTIONS.filter((option) => option >= 1).map(
                      (option) => (
                        <Pressable
                          accessibilityLabel={`长按快进 ${option} 倍`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: holdSpeed === option }}
                          key={option}
                          onPress={() => setHoldSpeed(option)}
                          style={[
                            styles.longPressChip,
                            holdSpeed === option ? styles.longPressChipActive : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.longPressChipText,
                              holdSpeed === option
                                ? styles.longPressChipTextActive
                                : null,
                            ]}
                          >
                            {option}x
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {queueVisible && (
              <Pressable
                accessibilityLabel="关闭播放队列"
                accessibilityRole="button"
                style={StyleSheet.absoluteFill}
                onPress={() => setQueueVisible(false)}
              />
            )}
            <View
              pointerEvents={queueVisible ? "none" : "box-none"}
              style={[
                styles.bottomBar,
                isLandscape ? styles.landscapeBottomBar : null,
                {
                  paddingBottom:
                    insets.bottom + (isLandscape ? spacing[1] : spacing[3]),
                },
              ]}
            >
              <View style={styles.scrubberTouchzone}>
                <View style={styles.scrubberHeader}>
                  <View style={styles.scrubberHeaderLeft}>
                    <Text style={styles.tcCurrent}>
                      {formatDuration(displayTime * 1000)}
                    </Text>
                    <Text style={styles.tcSlash}>/</Text>
                    <Text style={styles.tcTotal}>
                      {formatDuration(duration * 1000)}
                    </Text>
                  </View>
                  <View style={styles.scrubberHeaderCenter}>
                    {isScrubbing ? (
                      <View style={styles.centerBadgeRow}>
                        <Text style={styles.scrubBubbleTimeInline}>
                          {formatDuration(displayTime * 1000)}
                        </Text>
                        <Text style={styles.scrubBubbleMetaInline}>
                          {formatScrubMeta(
                            displayTime - scrubStartTimeRef.current,
                            scrubGestureHint,
                          )}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.tcRemaining}>
                    -{formatDuration((duration - displayTime) * 1000)}
                  </Text>
                </View>
                <View
                  {...seekPanResponder.panHandlers}
                  accessibilityLabel="视频播放进度"
                  accessibilityRole="progressbar"
                  accessibilityValue={{
                    min: 0,
                    max: Math.round(duration),
                    now: Math.round(displayTime),
                    text: `${formatDuration(displayTime * 1000)} / ${formatDuration(duration * 1000)}`,
                  }}
                  accessible={true}
                  ref={progressTrackRef}
                  onLayout={(event) =>
                    handleProgressTrackLayout(event.nativeEvent.layout.width)
                  }
                  style={styles.progressHitArea}
                >
                  <View style={styles.progressTrackBg}>
                    <View
                      style={[
                        styles.progressTrackFill,
                        { width: `${progress * 100}%` },
                      ]}
                    />
                  </View>
                  <View
                    style={[
                      styles.progressKnobWrap,
                      { left: `${progress * 100}%` },
                    ]}
                  >
                    <View style={styles.progressKnobDot} />
                  </View>
                </View>
              </View>

              <View style={styles.masterControlDock}>
                <View style={styles.dockLeft}>
                  <Pressable
                    accessibilityLabel={
                      videoContentFit === "cover"
                        ? "切换为完整显示"
                        : "切换为铺满画面"
                    }
                    accessibilityRole="button"
                    hitSlop={HUD_BUTTON_HIT_SLOP}
                    onPress={() =>
                      setVideoContentFit((prev) =>
                        prev === "contain" ? "cover" : "contain",
                      )
                    }
                    style={styles.hudButton}
                  >
                    <MaterialIcons name="aspect-ratio" size={22} color="#fff" />
                  </Pressable>
                </View>
                <View style={styles.dockCenter} pointerEvents="box-none">
                  <Pressable
                    accessibilityLabel={
                      playbackOrder === "shuffle"
                        ? "随机播放"
                        : playbackOrder === "single"
                          ? "单曲循环"
                          : "顺序播放"
                    }
                    accessibilityRole="button"
                    hitSlop={HUD_BUTTON_HIT_SLOP}
                    onPress={togglePlaybackOrder}
                    style={styles.hudButton}
                  >
                    <MaterialIcons
                      name={
                        playbackOrder === "shuffle"
                          ? "shuffle"
                          : playbackOrder === "single"
                            ? "repeat-one"
                            : "repeat"
                      }
                      size={22}
                      color="#fff"
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="上一个视频"
                    accessibilityRole="button"
                    hitSlop={HUD_BUTTON_HIT_SLOP}
                    onPress={() => switchVideoByOffset(-1)}
                    style={styles.hudButton}
                  >
                    <MaterialIcons
                      name="skip-previous"
                      size={26}
                      color="#fff"
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={isPlaying ? "暂停" : "播放"}
                    accessibilityRole="button"
                    hitSlop={HUD_BUTTON_HIT_SLOP}
                    onPress={togglePlay}
                    style={styles.masterPlayToggle}
                  >
                    <MaterialIcons
                      name={isPlaying ? "pause" : "play-arrow"}
                      size={26}
                      color="#000"
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="下一个视频"
                    accessibilityRole="button"
                    hitSlop={HUD_BUTTON_HIT_SLOP}
                    onPress={() => switchVideoByOffset(1)}
                    style={styles.hudButton}
                  >
                    <MaterialIcons name="skip-next" size={26} color="#fff" />
                  </Pressable>
                </View>
                <View style={styles.dockRight}>
                  <Pressable
                    accessibilityLabel={`播放速度 ${speed} 倍`}
                    accessibilityRole="button"
                    hitSlop={HUD_BUTTON_HIT_SLOP}
                    onPress={() => {
                      setSpeedMenuVisible((current) => !current);
                      setQueueVisible(false);
                      showControls();
                    }}
                    style={[
                      styles.hudButtonTextPill,
                      speed !== 1 ? styles.hudButtonTextPillSelected : null,
                      speedMenuVisible ? styles.hudButtonTextPillActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.hudButtonText,
                        speed !== 1 ? styles.hudButtonTextSelected : null,
                        speedMenuVisible ? styles.hudButtonTextActive : null,
                      ]}
                    >
                      {speed}x
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={isLandscape ? "切换为竖屏" : "切换为横屏"}
                    accessibilityRole="button"
                    hitSlop={HUD_BUTTON_HIT_SLOP}
                    onPress={toggleOrientation}
                    style={styles.hudButton}
                  >
                    <MaterialIcons
                      name="screen-rotation"
                      size={22}
                      color="#fff"
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="播放队列"
                    accessibilityRole="button"
                    hitSlop={HUD_BUTTON_HIT_SLOP}
                    onPress={() => {
                      setQueueVisible((current) => !current);
                      setSpeedMenuVisible(false);
                      showControls();
                    }}
                    style={[
                      styles.hudButton,
                      queueVisible && styles.hudButtonActive,
                    ]}
                  >
                    <MaterialIcons
                      name="video-library"
                      size={22}
                      color={queueVisible ? "#000" : "#fff"}
                    />
                  </Pressable>
                </View>
              </View>
            </View>

            <Animated.View
              pointerEvents={queueVisible ? "auto" : "none"}
              style={[
                styles.playlistDrawer,
                { transform: [{ translateX: drawerTranslateX }] },
              ]}
            >
              <View
                style={[
                  styles.drawerHeader,
                  { paddingTop: insets.top + spacing[3] },
                ]}
              >
                <View style={styles.drawerHeaderLeft}>
                  <Text style={styles.drawerTitle}>播放队列</Text>
                  <Text style={styles.drawerSubtitle}>
                    {displayQueueIndex.toString().padStart(2, "0")} /{" "}
                    {queue.length} 剪辑片段
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="关闭播放队列"
                  accessibilityRole="button"
                  hitSlop={DRAWER_CLOSE_HIT_SLOP}
                  onPress={() => setQueueVisible(false)}
                  style={styles.drawerCloseButton}
                >
                  <MaterialIcons name="close" size={20} color="#fff" />
                </Pressable>
              </View>
              {drawerMounted ? (
                <FlatList
                  ItemSeparatorComponent={renderDrawerSeparator}
                  ListEmptyComponent={drawerEmptyNode}
                  contentContainerStyle={[
                    styles.drawerScrollContent,
                    { paddingBottom: insets.bottom + spacing[3] },
                  ]}
                  data={displayQueue}
                  extraData={
                    queueVisible
                      ? `${activeVideoId}:${drawerDisplayTimeSec}`
                      : activeVideoId
                  }
                  getItemLayout={getDrawerItemLayout}
                  initialNumToRender={8}
                  keyExtractor={drawerKeyExtractor}
                  maxToRenderPerBatch={6}
                  nestedScrollEnabled={true}
                  removeClippedSubviews={true}
                  renderItem={renderDrawerItem}
                  showsVerticalScrollIndicator={false}
                  style={styles.drawerScroll}
                  windowSize={5}
                />
              ) : null}
            </Animated.View>
          </>
        )}
      </Animated.View>

      <Animated.View
        pointerEvents={controlsVisible && !holdSpeedVisible ? "box-none" : "none"}
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: controlsOpacity },
          holdSpeedVisible ? styles.layerHiddenDuringHold : null,
        ]}
      >
        {isPlayerLocked || controlsVisible ? (
          <Pressable
            accessibilityLabel={isPlayerLocked ? "解锁播放器" : "锁定播放器"}
            accessibilityRole="button"
            onPress={togglePlayerLock}
            style={[
              styles.rightSideLockButton,
              { bottom: insets.bottom + 120 },
            ]}
          >
            <MaterialIcons
              color="rgba(255,255,255,0.3)"
              name={isPlayerLocked ? "lock" : "lock-open"}
              size={24}
            />
          </Pressable>
        ) : null}
      </Animated.View>

      <AppActionSheet
        items={[
          {
            key: "new",
            label: "新建 IP 并保存",
            icon: "add-circle-outline",
            onPress: () => setNewIpDialogVisible(true),
          },
          ...normalIps.map((ip) => ({
            key: String(ip.id),
            label: ip.name,
            icon: "albums-outline" as const,
            meta: `${ip.imageCount + (ip.videoCount ?? 0)} 个素材`,
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
        primaryLabel={isSavingToIp ? "保存中" : "新建并保存"}
        title="新建 IP"
        visible={newIpDialogVisible}
      >
        <Text style={styles.dialogHint}>
          外部视频会按正式导入流程复制到 Pixory 私有目录。
        </Text>
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
      <AppDialog
        danger
        message="当前视频位于私密空间，保存到系统相册后将脱离应用内隐私加密隔离保护，确定继续导出？"
        onClose={() => setPersonalExportConfirmVisible(false)}
        onPrimary={() => {
          setPersonalExportConfirmVisible(false);
          void executeSaveLocal();
        }}
        primaryLabel="仍然保存"
        title="导出私密视频"
        visible={personalExportConfirmVisible}
      />
      {space === "personal" && !isAppActive ? (
        <View pointerEvents="none" style={styles.personalPrivacyCurtain} />
      ) : null}
    </View>
  );
}

function formatPlaybackErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message.toLowerCase() : "";
  if (
    rawMessage.includes("enoent") ||
    rawMessage.includes("not found") ||
    rawMessage.includes("no such file")
  ) {
    return "视频文件不存在或已被移动";
  }
  if (
    rawMessage.includes("codec") ||
    rawMessage.includes("format") ||
    rawMessage.includes("decoder") ||
    rawMessage.includes("unsupported")
  ) {
    return "暂不支持当前视频编码格式";
  }
  return "无法读取视频内容，请重试";
}

function formatActionErrorMessage(error: unknown, fallback: string): string {
  const rawMessage = error instanceof Error ? error.message.toLowerCase() : "";
  if (rawMessage.includes("permission") || rawMessage.includes("denied")) {
    return "缺少媒体存储权限";
  }
  if (
    rawMessage.includes("enoent") ||
    rawMessage.includes("not found") ||
    rawMessage.includes("no such file")
  ) {
    return "原视频文件不可用";
  }
  if (rawMessage.includes("enospc") || rawMessage.includes("space")) {
    return "设备可用存储空间不足";
  }
  return fallback;
}

function formatScrubDelta(deltaSeconds: number): string {
  const absoluteDelta = Math.abs(deltaSeconds);
  if (absoluteDelta < 0.5) {
    return "预览中";
  }
  return `${deltaSeconds >= 0 ? "快进" : "后退"} ${formatDuration(absoluteDelta * 1000)}`;
}

function formatScrubMeta(deltaSeconds: number, hint: string | null): string {
  const deltaLabel = formatScrubDelta(deltaSeconds);
  return hint ? `${deltaLabel} · ${hint}` : deltaLabel;
}

function getGestureFeedbackIcon(kind: GestureFeedbackKind) {
  if (kind === "seek-backward") return "play-back";
  if (kind === "seek-forward") return "play-forward";
  if (kind === "locked") return "lock-closed-outline";
  if (kind === "unlocked") return "lock-open-outline";
  return "information-circle-outline";
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: "#050607",
    flex: 1,
  },
  videoSurface: {
    flex: 1,
  },
  videoGestureLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  videoView: {
    height: "100%",
    width: "100%",
  },
  videoAdjacentSlot: {
    ...StyleSheet.absoluteFillObject,
    // Dark video theater backdrop has no semantic token in light-mode colors.ts
    backgroundColor: "#050607",
  },
  videoAdjacentCoverSlot: {
    // Dark video theater backdrop has no semantic token in light-mode colors.ts
    backgroundColor: "#050607",
    left: 0,
    position: "absolute",
    right: 0,
  },
  videoAdjacentCoverImage: {
    height: "100%",
    width: "100%",
  },
  videoAdjacentPlaceholder: {
    flex: 1,
    backgroundColor: "#050607",
  },
  videoLoadingCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#050607",
  },
  videoLoadingCoverImage: {
    height: "100%",
    width: "100%",
  },
  personalPrivacyCurtain: {
    ...StyleSheet.absoluteFillObject,
    // Theater black matches shell background to conceal personal frame in background snapshots.
    backgroundColor: "#050607",
    zIndex: 100,
  },
  gestureFeedback: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(12, 15, 13, 0.82)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    justifyContent: "center",
    minHeight: 86,
    minWidth: 112,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    position: "absolute",
    top: "42%",
  },
  gestureFeedbackText: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: "800",
  },
  surfaceScrubOverlay: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(12, 15, 13, 0.58)",
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    minWidth: 180,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    position: "absolute",
    top: "56%",
  },
  surfaceScrubTime: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: "800",
  },
  surfaceScrubTrack: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: radius.pill,
    height: 3,
    overflow: "hidden",
    width: 148,
  },
  surfaceScrubFill: {
    backgroundColor: colors.primary.hover,
    borderRadius: radius.pill,
    height: "100%",
  },
  surfaceScrubMeta: {
    ...typography.textStyles.micro,
    color: "rgba(255,255,255,0.64)",
    fontWeight: "700",
  },
  unlockButton: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 13, 0.76)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: "center",
    position: "absolute",
    right: spacing[3],
    width: 40,
  },
  controlsLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.24)",
    flexDirection: "row",
    gap: spacing[2],
    left: 0,
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
    position: "absolute",
    right: 0,
    top: 0,
  },
  landscapeTopBar: {
    backgroundColor: "transparent",
    paddingBottom: spacing[1],
  },
  iconButtonBare: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  playerTitle: {
    ...typography.textStyles.body,
    color: colors.text.inverse,
    fontWeight: "600",
    lineHeight: 28,
  },
  menuDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  moreMenu: {
    backgroundColor: "rgba(12, 15, 13, 0.92)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[1],
    minWidth: 152,
    padding: spacing[2],
    position: "absolute",
    zIndex: 12,
  },
  moreMenuRow: {
    alignItems: "center",
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing[2],
    minHeight: 38,
    paddingHorizontal: spacing[2],
  },
  moreMenuText: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: "700",
  },
  rightSideLockButton: {
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    right: spacing[4],
    width: 44,
    height: 44,
  },
  holdSpeedBadge: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 13, 0.78)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing[1],
    minHeight: 28,
    paddingHorizontal: spacing[2],
  },
  holdSpeedFloatingBadge: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(12, 15, 13, 0.78)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    marginBottom: spacing[2],
  },
  holdSpeedBadgeText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  holdSpeedCenterContainer: {
    alignItems: "center",
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 40,
  },
  holdSpeedCenterBadge: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 13, 0.88)",
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 0,
  },
  layerHiddenDuringHold: {
    opacity: 0,
  },
  bottomBar: {
    backgroundColor: "rgba(0, 0, 0, 0.42)",
    bottom: 0,
    gap: spacing[2],
    left: 0,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    position: "absolute",
    right: 0,
  },
  landscapeBottomBar: {
    gap: spacing[1],
    paddingTop: spacing[1],
  },
  portraitScrubBubbleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-start",
    minHeight: 30,
  },
  progressInfoText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    flex: 1,
    fontWeight: "800",
    minWidth: 0,
  },
  progressHitArea: {
    justifyContent: "center",
    minHeight: 36,
  },
  scrubBubble: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 13, 0.86)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing[2],
    maxWidth: 300,
    minHeight: 30,
    paddingHorizontal: spacing[3],
  },
  scrubBubbleTimeInline: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
  scrubBubbleMetaInline: {
    ...typography.textStyles.micro,
    color: colors.primary.hover,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
  scrubBubbleTime: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: "800",
  },
  scrubBubbleMeta: {
    ...typography.textStyles.micro,
    color: "rgba(255,255,255,0.72)",
    fontWeight: "700",
    textAlign: "center",
  },
  landscapeScrubBubbleRow: {
    alignItems: "flex-start",
    minHeight: 30,
  },
  controlRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[2],
    justifyContent: "space-between",
  },
  landscapeControlRow: {
    minHeight: 38,
  },
  controlLeft: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
  },
  portraitControlLeft: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  landscapeTimeText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: "800",
    marginLeft: spacing[1],
    minWidth: 86,
  },
  controlActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    flexWrap: "nowrap",
    gap: spacing[2],
    justifyContent: "flex-end",
    minWidth: 0,
  },
  controlButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  controlButtonActive: {
    backgroundColor: "rgba(213, 228, 202, 0.16)",
    borderRadius: radius.pill,
  },
  timeText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    flex: 1,
    minWidth: 0,
  },
  pillButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing[1],
    minHeight: 32,
    paddingHorizontal: spacing[2],
  },
  pillButtonText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: "800",
  },
  speedPanel: {
    backgroundColor: "rgba(22, 24, 30, 0.88)",
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    position: "absolute",
    left: "50%",
    marginLeft: -144,
    width: 288,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.85,
    shadowRadius: 50,
    elevation: 24,
  },
  speedGroup: {
    marginBottom: 10,
  },
  speedGroupLast: {
    marginBottom: 0,
  },
  speedGroupHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  speedTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 0.5,
  },
  speedTitleSub: {
    fontSize: 10,
    fontWeight: "500",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 1,
  },
  speedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    gap: 6,
  },
  speedChip: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    minHeight: 28,
    width: 76,
  },
  speedChipActive: {
    backgroundColor: "#ffffff",
    shadowColor: "rgba(255,255,255,0.1)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
    transform: [{ scale: 1.02 }],
  },
  speedChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.7)",
  },
  speedChipTextActive: {
    color: "#000000",
    fontWeight: "600",
  },
  longPressGrid: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    gap: 6,
  },
  longPressChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    minHeight: 28,
  },
  longPressChipActive: {
    backgroundColor: "#ffffff",
    shadowColor: "rgba(255,255,255,0.1)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
    transform: [{ scale: 1.02 }],
  },
  longPressChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
  },
  longPressChipTextActive: {
    color: "#000000",
    fontWeight: "600",
  },
  queuePanel: {
    backgroundColor: "rgba(12, 15, 13, 0.84)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    maxHeight: 250,
    padding: spacing[2],
    position: "absolute",
    right: spacing[3],
    width: 260,
    maxWidth: "80%",
  },
  queueTitle: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: "800",
  },
  queueScroll: {
    maxHeight: 190,
  },
  queueScrollContent: {
    gap: spacing[1],
    paddingBottom: spacing[1],
  },
  queueRow: {
    alignItems: "center",
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing[2],
    minHeight: 38,
    paddingHorizontal: spacing[2],
  },
  queueRowActive: {
    backgroundColor: "rgba(213, 228, 202, 0.18)",
  },
  queueCover: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.sm,
    height: 30,
    justifyContent: "center",
    overflow: "hidden",
    width: 44,
  },
  queueCoverImage: {
    height: "100%",
    width: "100%",
  },
  queueName: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    flex: 1,
    minWidth: 0,
  },
  queueDuration: {
    ...typography.textStyles.micro,
    color: "rgba(255,255,255,0.68)",
  },
  queueNowPlaying: {
    ...typography.textStyles.micro,
    color: colors.primary.hover,
    fontWeight: "800",
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

  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    flex: 1,
    minWidth: 0,
  },
  topTitleGroup: {
    flex: 1,
    justifyContent: "center",
    paddingLeft: spacing[2],
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  dolbyBadge: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: spacing[1],
  },
  dolbyText: {
    ...typography.textStyles.micro,
    color: "#e2e2e2",
    fontWeight: "800",
    fontSize: 9,
    letterSpacing: 1.2,
  },
  scrubberTouchzone: {
    flexDirection: "column",
    gap: spacing[1],
    width: "100%",
  },
  scrubberHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scrubberHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tcCurrent: {
    ...typography.textStyles.micro,
    color: "#ffffff",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tcSlash: {
    ...typography.textStyles.micro,
    color: "rgba(255,255,255,0.5)",
  },
  tcTotal: {
    ...typography.textStyles.micro,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.5,
  },
  centerBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  scrubberHeaderCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  badgeLabel: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: radius.sm,
    paddingHorizontal: 4,
  },
  badgeText: {
    ...typography.textStyles.micro,
    color: "#c4c7c7",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  fpsText: {
    ...typography.textStyles.micro,
    color: "#c4c7c7",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  tcRemaining: {
    ...typography.textStyles.micro,
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 0.5,
  },
  progressTrackBg: {
    backgroundColor: "rgba(226,226,226,0.3)",
    borderRadius: radius.pill,
    height: 4,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  progressTrackFill: {
    backgroundColor: "#ffffff",
    borderRadius: radius.pill,
    height: "100%",
    position: "absolute",
    left: 0,
    top: 0,
  },
  progressKnobWrap: {
    position: "absolute",
    top: "50%",
    marginTop: -7,
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  progressKnobDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#000000",
  },
  masterControlDock: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing[1],
    paddingTop: spacing[2],
    position: "relative",
  },
  dockLeft: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-start",
    zIndex: 10,
  },
  dockCenter: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[1],
    justifyContent: "center",
    pointerEvents: "box-none",
    zIndex: 5,
  },
  dockRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[1],
    justifyContent: "flex-end",
  },
  hudButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  masterPlayToggle: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  hudButtonActive: {
    backgroundColor: "#ffffff",
  },
  hudButtonTextPill: {
    height: 36,
    paddingHorizontal: 0,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
    width: 52,
  },
  hudButtonTextPillSelected: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  hudButtonTextPillActive: {
    backgroundColor: "#ffffff",
  },
  hudButtonText: {
    ...typography.textStyles.caption,
    color: "#ffffff",
    fontWeight: "800",
  },
  hudButtonTextSelected: {
    color: colors.primary.hover,
  },
  hudButtonTextActive: {
    color: "#000000",
  },
  playlistDrawer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 320,
    maxWidth: "85%",
    backgroundColor: "rgba(0,0,0,0.9)",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(255,255,255,0.1)",
    zIndex: 100,
    shadowColor: "#000",
    shadowOpacity: 0.8,
    shadowRadius: 20,
    shadowOffset: { width: -4, height: 0 },
  },
  drawerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
  },
  drawerHeaderLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing[2],
  },
  drawerTitle: {
    ...typography.textStyles.bodyStrong,
    color: "#ffffff",
    fontSize: 16,
  },
  drawerSubtitle: {
    ...typography.textStyles.micro,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "800",
  },
  drawerCloseButton: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerScroll: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingHorizontal: spacing[3],
  },
  drawerItemSeparator: {
    height: DRAWER_ITEM_GAP,
  },
  drawerEmptyState: {
    alignItems: "center",
    gap: spacing[2],
    justifyContent: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[8],
  },
  drawerEmptyTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
  },
  drawerEmptyHint: {
    ...typography.textStyles.caption,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
  playbackErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
    zIndex: 30,
  },
  playbackErrorCard: {
    alignItems: "center",
    backgroundColor: "rgba(12, 15, 13, 0.88)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    maxWidth: 320,
    padding: spacing[5],
    width: "100%",
  },
  playbackErrorTitle: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
  },
  playbackErrorMessage: {
    ...typography.textStyles.caption,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
  },
  playbackErrorActions: {
    flexDirection: "row",
    gap: spacing[3],
    marginTop: spacing[2],
  },
  playbackErrorPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.background.surface,
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[5],
  },
  playbackErrorPrimaryText: {
    ...typography.textStyles.caption,
    color: colors.text.title,
    fontWeight: "700",
  },
  playbackErrorSecondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.pill,
    justifyContent: "center",
    minHeight: metrics.minTouchSize,
    paddingHorizontal: spacing[5],
  },
  playbackErrorSecondaryText: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: "700",
  },
});
