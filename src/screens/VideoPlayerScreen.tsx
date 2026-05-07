import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppActionSheet, type AppActionSheetItem } from '../components/AppActionSheet';
import { AppDialog } from '../components/AppDialog';
import { assetRepository, imageRepository, ipRepository, runWithDatabaseSpace, type ImageDetailRecord, type ImageListItem, type IpListItem, type PixorySpace } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import { useToast } from '../components/AppToast';
import { importVideosToIp, saveVideoToSystemAlbum, type PickedVideoAsset } from '../services/videoImportService';
import { formatDuration } from '../utils/formatters';

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 2, 3] as const;
const CONTROL_HIDE_DELAY_MS = 3000;
const PLAYBACK_PROGRESS_SAVE_INTERVAL_MS = 10000;

interface VideoPlayerScreenProps {
  videoId?: number;
  externalSource?: PickedVideoAsset;
  space?: PixorySpace;
  refreshToken: number;
  onBack: () => void;
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
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(1);
  const [holdSpeed, setHoldSpeed] = useState<(typeof SPEED_OPTIONS)[number]>(3);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speedMenuVisible, setSpeedMenuVisible] = useState(false);
  const [queueVisible, setQueueVisible] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [ipPickerVisible, setIpPickerVisible] = useState(false);
  const [normalIps, setNormalIps] = useState<IpListItem[]>([]);
  const [newIpDialogVisible, setNewIpDialogVisible] = useState(false);
  const [newIpName, setNewIpName] = useState('');
  const [isSavingToIp, setIsSavingToIp] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [trackWidth, setTrackWidth] = useState(1);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceLoadVersionRef = useRef(0);

  const sourceUri = externalSource?.uri ?? video?.originalFileUri ?? null;
  const sourceFileName = externalSource?.fileName ?? video?.originalFilename ?? 'video.mp4';

  const player = useVideoPlayer(sourceUri ? { uri: sourceUri } : null, (instance) => {
    instance.timeUpdateEventInterval = 0.25;
    instance.playbackRate = speed;
    instance.play();
  });

  useEffect(() => {
    setActiveVideoId(videoId ?? 0);
  }, [videoId]);

  useEffect(() => {
    if (externalSource) {
      setVideo(null);
      setQueue([]);
      setCurrentTime(0);
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
      setCurrentTime((detail.lastPlaybackPositionMs ?? 0) / 1000);
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
    void player.replaceAsync({ uri: sourceUri }).then(() => {
      if (!isActive || sourceLoadVersionRef.current !== loadVersion) {
        player.pause();
        return;
      }
      player.timeUpdateEventInterval = 0.25;
      player.playbackRate = speed;
      if (!externalSource && video?.lastPlaybackPositionMs && video.lastPlaybackPositionMs > 1000) {
        player.currentTime = video.lastPlaybackPositionMs / 1000;
      }
      player.play();
      setIsPlaying(true);
    }).catch((error) => {
      if (isActive) {
        showToast(error instanceof Error ? `视频加载失败：${error.message}` : '视频加载失败');
      }
    });
    return () => {
      isActive = false;
    };
  }, [externalSource, player, showToast, sourceUri, video?.id]);

  useEffect(() => {
    player.playbackRate = speed;
  }, [player, speed]);

  useEffect(() => {
    const timeSubscription = player.addListener('timeUpdate', (payload) => {
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
      player.pause();
      if (!externalSource && video) {
        void runWithDatabaseSpace(space, (db) => assetRepository.updatePlaybackPosition(db, video.id, Math.round(player.currentTime * 1000)));
      }
    };
  }, [player, space, video]);

  useEffect(() => {
    if (externalSource || !video) {
      return;
    }

    const persistPlaybackPosition = () => {
      void runWithDatabaseSpace(space, (db) => assetRepository.updatePlaybackPosition(db, video.id, Math.round(player.currentTime * 1000)));
    };
    const interval = setInterval(persistPlaybackPosition, PLAYBACK_PROGRESS_SAVE_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        persistPlaybackPosition();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [externalSource, player, space, video]);

  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const currentIndex = queue.findIndex((item) => item.id === activeVideoId);

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
          seekFromLocation(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          seekFromLocation(event.nativeEvent.locationX);
        },
        onPanResponderRelease: resetHideTimer,
        onPanResponderTerminate: resetHideTimer,
      }),
    [duration, player, trackWidth]
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
    hideTimerRef.current = setTimeout(() => {
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
  }

  function startHoldFastForward() {
    showControls();
    clearLongPressTimer();
    const previousSpeed = player.playbackRate;
    player.playbackRate = holdSpeed;
    player.play();
    longPressTimerRef.current = setInterval(() => {
      setCurrentTime(player.currentTime);
    }, 150);
    return () => {
      player.playbackRate = previousSpeed;
      clearLongPressTimer();
    };
  }

  function togglePlay() {
    showControls();
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }

  function seekFromLocation(locationX: number) {
    if (duration <= 0 || trackWidth <= 0) {
      return;
    }
    const nextTime = Math.min(duration, Math.max(0, (locationX / trackWidth) * duration));
    player.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  async function toggleOrientation() {
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setIsLandscape(true);
      }
      showControls();
    } catch {
      showToast('横竖屏切换失败');
    }
  }

  function switchVideo(nextVideoId: number) {
    if (!externalSource && video) {
      void runWithDatabaseSpace(space, (db) => assetRepository.updatePlaybackPosition(db, video.id, Math.round(player.currentTime * 1000)));
    }
    setActiveVideoId(nextVideoId);
    setQueueVisible(false);
    showControls();
  }

  const title = sourceFileName;

  return (
    <View style={styles.shell}>
      <ExpoStatusBar hidden />
      <Pressable
        delayLongPress={260}
        onLongPress={() => {
          const stop = startHoldFastForward();
          longPressTimerRef.current = setInterval(() => {
            setCurrentTime(player.currentTime);
          }, 120);
          return stop;
        }}
        onPress={showControls}
        onPressOut={() => {
          player.playbackRate = speed;
          clearLongPressTimer();
        }}
        style={styles.videoSurface}
      >
        <VideoView allowsFullscreen={false} contentFit="contain" nativeControls={false} player={player} style={styles.videoView} />
      </Pressable>

      {controlsVisible ? (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + spacing[2] }]}>
            <Pressable accessibilityLabel="返回" onPress={onBack} style={({ pressed }) => [styles.iconButtonBare, pressed && styles.pressed]}>
              <Ionicons color={colors.text.inverse} name="chevron-back" size={26} />
            </Pressable>
            <Text numberOfLines={1} style={styles.playerTitle}>{title}</Text>
            <Pressable accessibilityLabel="更多" onPress={() => setMoreVisible(true)} style={({ pressed }) => [styles.iconButtonBare, pressed && styles.pressed]}>
              <Ionicons color={colors.text.inverse} name="ellipsis-vertical" size={22} />
            </Pressable>
          </View>

          {queueVisible ? (
            <View style={[styles.queuePanel, { bottom: insets.bottom + 86 }]}>
              <Text style={styles.queueTitle}>待播放</Text>
              {queue.slice(Math.max(0, currentIndex - 1), currentIndex + 5).map((item) => (
                <Pressable key={item.id} onPress={() => switchVideo(item.id)} style={({ pressed }) => [styles.queueRow, item.id === activeVideoId ? styles.queueRowActive : null, pressed && styles.pressed]}>
                  <Ionicons color={item.id === activeVideoId ? colors.primary.active : colors.text.inverse} name="play-circle-outline" size={18} />
                  <Text numberOfLines={1} style={styles.queueName}>{item.originalFilename}</Text>
                  <Text style={styles.queueDuration}>{formatDuration(item.durationMs)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {speedMenuVisible ? (
            <View style={[styles.speedPanel, { bottom: insets.bottom + 86 }]}>
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
            </View>
          ) : null}

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing[2] }]}>
            <View
              {...seekPanResponder.panHandlers}
              onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
              style={styles.progressTrack}
            >
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              <View style={[styles.progressKnob, { left: `${progress * 100}%` }]} />
            </View>
            <View style={styles.controlRow}>
              <Pressable accessibilityLabel={isPlaying ? '暂停' : '播放'} onPress={togglePlay} style={({ pressed }) => [styles.controlButton, pressed && styles.pressed]}>
                <Ionicons color={colors.text.inverse} name={isPlaying ? 'pause' : 'play'} size={20} />
              </Pressable>
              <Text style={styles.timeText}>{formatDuration(currentTime * 1000)} / {formatDuration(duration * 1000)}</Text>
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
            </View>
          </View>
        </>
      ) : null}

      <AppActionSheet items={moreItems} onClose={() => setMoreVisible(false)} title="视频操作" visible={moreVisible} />
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

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#050607',
    flex: 1,
  },
  videoSurface: {
    flex: 1,
  },
  videoView: {
    height: '100%',
    width: '100%',
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
  progressTrack: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.pill,
    height: 6,
    position: 'relative',
  },
  progressFill: {
    backgroundColor: colors.primary.hover,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressKnob: {
    backgroundColor: colors.text.inverse,
    borderRadius: radius.pill,
    height: 14,
    marginLeft: -7,
    position: 'absolute',
    top: -4,
    width: 14,
  },
  controlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
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
    backgroundColor: 'rgba(12, 15, 13, 0.9)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    padding: spacing[3],
    position: 'absolute',
    right: spacing[3],
    width: 210,
  },
  speedTitle: {
    ...typography.textStyles.micro,
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '700',
  },
  speedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  speedChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.pill,
    minHeight: 30,
    minWidth: 52,
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
    backgroundColor: 'rgba(12, 15, 13, 0.9)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[2],
    maxHeight: 260,
    padding: spacing[3],
    position: 'absolute',
    right: spacing[3],
    width: '72%',
  },
  queueTitle: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    fontWeight: '800',
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
