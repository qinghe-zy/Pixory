import { createContext, useContext } from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { ImageDetailRecord, ImageListItem, PixorySpace } from '../database';
import type { PickedVideoAsset } from '../services/videoImportService';

export interface VideoPlayerContextValue {
  insets: EdgeInsets;
  showToast: (message: string) => void;
  activeVideoId: number;
  video: ImageDetailRecord | null;
  queue: ImageListItem[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  speed: number;
  setSpeed: (speed: number) => void;
  holdSpeed: number;
  setHoldSpeed: (speed: number) => void;
  playbackOrder: 'ordered' | 'shuffle';
  setPlaybackOrder: (order: 'ordered' | 'shuffle') => void;
  controlsVisible: boolean;
  queueVisible: boolean;
  setQueueVisible: (visible: boolean) => void;
  speedMenuVisible: boolean;
  setSpeedMenuVisible: (visible: boolean) => void;
  moreVisible: boolean;
  setMoreVisible: (visible: boolean) => void;
  isPlayerLocked: boolean;
  togglePlayerLock: () => void;
  switchVideo: (id: number, item?: ImageListItem) => void;
  onBack: () => void;
  onOpenDetail?: (imageId: number) => void;
  space: PixorySpace;
  displayTime: number;
  progress: number;
  isScrubbing: boolean;
  isSurfaceScrubbing: boolean;
  formatDuration: (ms: number) => string;
  floatingMenuOpacity: any;
  floatingMenuTranslateY: any;
  controlsOpacity: any;
  externalSource?: PickedVideoAsset;
  seekToTime: (time: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  saveVideoToSystemAlbum: (item: PickedVideoAsset | ImageListItem) => void;
}

export const VideoPlayerContext = createContext<VideoPlayerContextValue | null>(null);

export function useVideoPlayerContext() {
  const ctx = useContext(VideoPlayerContext);
  if (!ctx) throw new Error('Missing VideoPlayerContext');
  return ctx;
}


