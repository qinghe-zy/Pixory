import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useFonts, PlayfairDisplay_400Regular, PlayfairDisplay_400Regular_Italic } from '@expo-google-fonts/playfair-display';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { MaShanZheng_400Regular } from '@expo-google-fonts/ma-shan-zheng';
import { ZCOOLXiaoWei_400Regular } from '@expo-google-fonts/zcool-xiaowei';
import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, InteractionManager, Linking, Platform, StyleSheet, Text, View, ScrollView, Dimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SQLiteDatabase } from 'expo-sqlite';

import { AppDialog } from './src/components/AppDialog';
import { AppScreen, FloatingFooterContext } from './src/components/AppScreen';
import { AppToastProvider, useToast } from './src/components/AppToast';
import { ArchiveReaderScreen } from './src/screens/ArchiveReaderScreen';
import { BackupExportManagerScreen } from './src/screens/BackupExportManagerScreen';
import { BackupScreen } from './src/screens/BackupScreen';
import { BottomTabBar, type RootTabKey } from './src/components/BottomTabBar';
import { StrictPager } from './src/components/StrictPager';
import { PersonalUnlockModal } from './src/components/PersonalUnlockModal';
import { PrimaryButton } from './src/components/PrimaryButton';
import { clearPersonalImageCache } from './src/components/SecureImage';
import { colors, spacing, typography, componentTokens, layout, radius, shadows } from './src/design/tokens';
import { imageRepository, initDatabase, resetDatabaseSpaceCache, runWithDatabaseSpace, settingsRepository, type IpLibraryFilter, type PixorySpace } from './src/database';
import { AllImagesScreen } from './src/screens/AllImagesScreen';
import { BatchManageImagesScreen } from './src/screens/BatchManageImagesScreen';
import { CreateGroupScreen } from './src/screens/CreateGroupScreen';
import { CreateIpScreen } from './src/screens/CreateIpScreen';
import { EditGroupScreen } from './src/screens/EditGroupScreen';
import { EditIpScreen } from './src/screens/EditIpScreen';
import { EditImageScreen } from './src/screens/EditImageScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { GlobalGroupsScreen } from './src/screens/GlobalGroupsScreen';
import { GlobalSearchScreen } from './src/screens/GlobalSearchScreen';
import { GroupImagesScreen } from './src/screens/GroupImagesScreen';
import { GroupCoverPickerScreen } from './src/screens/GroupCoverPickerScreen';
import { GroupOverviewScreen } from './src/screens/GroupOverviewScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { HomeLibraryScreen } from './src/screens/HomeLibraryScreen';
import { AiBranchTreeScreen } from './src/screens/AiBranchTreeScreen';
import { AiChatScreen } from './src/screens/AiChatScreen';
import { AiChatSearchScreen } from './src/screens/AiChatSearchScreen';
import { AiDocumentReaderScreen } from './src/screens/AiDocumentReaderScreen';
import { AiHistoryScreen } from './src/screens/AiHistoryScreen';
import { AiHomeScreen } from './src/screens/AiHomeScreen';
import { AiIpPickerScreen } from './src/screens/AiIpPickerScreen';
import { AiKnowledgeBaseScreen } from './src/screens/AiKnowledgeBaseScreen';
import { AiMaterialImportScreen } from './src/screens/AiMaterialImportScreen';
import { AiMaterialListScreen } from './src/screens/AiMaterialListScreen';
import { AiMemoryBoardScreen } from './src/screens/AiMemoryBoardScreen';
import { AiProviderSettingsScreen } from './src/screens/AiProviderSettingsScreen';
import { AiRoleCardEditorScreen } from './src/screens/AiRoleCardEditorScreen';
import { AiRoleCardDetailScreen } from './src/screens/AiRoleCardDetailScreen';
import { AiRoleLibraryScreen } from './src/screens/AiRoleLibraryScreen';
import { AiSessionConfigScreen } from './src/screens/AiSessionConfigScreen';
import { DiaryReaderScreen } from './src/screens/DiaryReaderScreen';
import { DreamReaderScreen } from './src/screens/DreamReaderScreen';
import { CompanionInnerLifeScreen } from './src/screens/CompanionInnerLifeScreen';
import { CompanionRuntimeManagerScreen } from './src/screens/CompanionRuntimeManagerScreen';
import { applyRoleCardToThread, createNormalThreadFromRoleCard, type AiMessageFavoriteListItem } from './src/ai/aiChatService';
import { adoptBranchSelection } from './src/ai/aiBranchTreeService';
import type { ComposerEntranceReason } from './src/ai/aiComposerEntrancePolicy';
import { resumeCompanionMemoryMaintenance, scheduleCompanionMemoryMaintenance, suspendCompanionMemoryMaintenance } from './src/ai/aiMemoryMaintenanceService';
import { reconcileThoughtSessions, settleActiveThoughtSessions } from './src/ai/thought/thoughtSessionCoordinator';
import { resumeDiaryBackgroundTasks, suspendDiaryBackgroundTasks } from './src/ai/diary/diaryGenerationManager';
import { coordinateDiaryRuntime } from './src/ai/diary/diaryRuntimeCoordinator';
import { resumePersonalCompanionMaintenance, runCompanionMaintenancePass, suspendCompanionMaintenance } from './src/ai/companion/companionMaintenanceQueue';
import { aiGenerationManager } from './src/ai/aiGenerationManager';
import type { AiBranchScope } from './src/database/repositories/aiThreadRepository';
import { ImageDetailScreen } from './src/screens/ImageDetailScreen';
import { ImageViewerScreen } from './src/screens/ImageViewerScreen';
import { ImportDevelopmentScreen } from './src/screens/ImportDevelopmentScreen';
import { DuplicateReviewScreen } from './src/screens/DuplicateReviewScreen';
import { ImportBatchHistoryScreen } from './src/screens/ImportBatchHistoryScreen';
import { ImportBatchReviewScreen, type BatchInitialMode } from './src/screens/ImportBatchReviewScreen';
import { ImportImagesScreen } from './src/screens/ImportImagesScreen';
import { IpDetailScreen } from './src/screens/IpDetailScreen';
import { IpCoverPickerScreen } from './src/screens/IpCoverPickerScreen';
import { IpStorageDetailScreen } from './src/screens/IpStorageDetailScreen';
import { MeScreen } from './src/screens/MeScreen';
import { MoveImageGroupScreen } from './src/screens/MoveImageGroupScreen';
import { OriginalStorageScreen } from './src/screens/OriginalStorageScreen';
import { OrganizeScreen } from './src/screens/OrganizeScreen';
import { PlaceholderScreen } from './src/screens/PlaceholderScreen';
import { ProductDocumentationScreen } from './src/screens/ProductDocumentationScreen';
import { QuickOrganizeScreen } from './src/screens/QuickOrganizeScreen';
import { RecentViewedScreen } from './src/screens/RecentViewedScreen';
import { TagResultScreen } from './src/screens/TagResultScreen';
import { TagsOverviewScreen } from './src/screens/TagsOverviewScreen';
import { GlobalTrashScreen } from './src/screens/GlobalTrashScreen';
import { VideoDetailScreen } from './src/screens/VideoDetailScreen';
import { VideoPlayerScreen } from './src/screens/VideoPlayerScreen';
import type { ImageViewerContext } from './src/navigation/imageViewerContext';
import {
  BACKGROUND_MEMORY_CACHE_CLEAR_DELAY_MS,
  cleanupDailyAppTempCache,
  cleanupOldTempFiles,
  clearImageMemoryCache,
} from './src/services/cacheCleanupService';
import { clearExpiredTrashOnIdle } from './src/services/trashService';
import { ensureAppDirectories } from './src/services/fileStorageService';
import { checkForAppUpdate, type AppUpdateInfo } from './src/services/updateCheckService';
import { checkForRemoteAnnouncement, type RemoteAnnouncementInfo } from './src/services/announcementService';
import {
  changePersonalPassword,
  hasPersonalPassword,
  resetPersonalSystemData,
  setPersonalPassword,
  verifyPersonalPassword,
} from './src/services/personalSystemService';
import { createPersonalTaskToken, invalidatePersonalTaskToken, waitForPersonalTasks, type PersonalTaskToken } from './src/services/personalTaskToken';
import { isDevToolsEnabled } from './src/utils/dev';
import {
  addNativeIntentListener,
  finishNativeShareActivity,
  getInitialExternalOpen,
  getInitialShareIntent,
  type NativeExternalOpen,
  type NativeShareIntent,
  type NativeShareItem,
} from './src/native/pixoryMediaModule';
import { ShareCollectScreen } from './src/screens/ShareCollectScreen';
import { StorageUsageScreen } from './src/screens/StorageUsageScreen';
import { ChatStorageUsageScreen } from './src/screens/ChatStorageUsageScreen';
import { MilestonesDetailScreen } from './src/screens/MilestonesDetailScreen';
import type { AiDocumentReaderLocator } from './src/ai/readers/readerTypes';

type AppRoute =
  | { name: 'root'; tab: RootTabKey; initialFilter?: IpLibraryFilter }
  | { name: 'create-ip'; space: PixorySpace }
  | { name: 'ip-detail'; ipId: number; space: PixorySpace }
  | { name: 'ip-cover-picker'; ipId: number; space: PixorySpace }
  | { name: 'group-cover-picker'; ipId: number; groupId: number; space: PixorySpace }
  | { name: 'edit-ip'; ipId: number; space: PixorySpace }
  | { name: 'edit-group'; ipId: number; groupId: number; space: PixorySpace }
  | { name: 'edit-image'; imageId: number; space: PixorySpace }
  | { name: 'edit-media'; imageId: number; space: PixorySpace }
  | { name: 'group-overview'; ipId: number; space: PixorySpace }
  | { name: 'create-group'; ipId: number; space: PixorySpace }
  | { name: 'group-images'; ipId: number; groupId: number; space: PixorySpace }
  | {
      name: 'batch-manage-images';
      ipId: number;
      space: PixorySpace;
      source: 'ip-detail' | 'all-images' | 'group-images';
      groupId?: number | null;
      importBatchId?: number | null;
      scopeImageIds?: number[];
      initialSelectedImageIds?: number[];
      initialMode?: BatchInitialMode;
    }
  | { name: 'import-images'; ipId: number; groupId?: number | null; initialMediaPicker?: 'images' | 'videos'; space: PixorySpace }
  | { name: 'import-result'; ipId: number; imageIds: number[]; importBatchId: number | null; space: PixorySpace }
  | { name: 'import-batch-history'; ipId: number; space: PixorySpace }
  | { name: 'duplicate-review'; ipId?: number; importBatchId?: number | null; space: PixorySpace }
  | { name: 'all-images'; ipId: number; space: PixorySpace }
  | { name: 'image-viewer'; imageId: number; space: PixorySpace; context: ImageViewerContext }
  | { name: 'image-detail'; imageId: number; space: PixorySpace; context?: ImageViewerContext }
  | { name: 'video-detail'; videoId: number; space: PixorySpace }
  | { name: 'video-player'; videoId: number; space: PixorySpace }
  | { name: 'external-video-player'; uri: string; fileName: string; mimeType?: string | null; fileSize?: number | null }
  | { name: 'archive-reader'; uri: string; fileName: string }
  | { name: 'external-package-placeholder'; fileName: string }
  | { name: 'share-collect'; items: NativeShareItem[] }
  | { name: 'move-image-group'; imageId: number; space: PixorySpace }
  | { name: 'tag-result'; tagId: number; space: PixorySpace }
  | { name: 'favorites'; space: PixorySpace }
  | { name: 'recent-viewed'; space: PixorySpace }
  | { name: 'quick-organize'; ipId?: number; importBatchId?: number | null; space: PixorySpace }
  | { name: 'global-search'; query?: string; space: PixorySpace }
  | { name: 'global-groups'; space: PixorySpace }
  | { name: 'tags-overview'; space: PixorySpace }
  | { name: 'trash'; space: PixorySpace; storageMode?: boolean }
  | { name: 'backup'; space: PixorySpace }
  | { name: 'storage-usage'; space: PixorySpace }
  | { name: 'chat-storage-usage'; space: PixorySpace }
  | { name: 'milestones-detail'; space: PixorySpace; preloadedMarkdown?: string | null }
  | { name: 'product-doc'; space: PixorySpace; preloadedMarkdown?: string | null }
  | { name: 'original-storage'; space: PixorySpace }
  | { name: 'about'; space: PixorySpace }
  | { name: 'ip-storage-detail'; ipId: number; space: PixorySpace }
  | { name: 'backup-export-manager'; space: PixorySpace }
  | {
      name: 'ai-chat';
      space: PixorySpace;
      contextTitle?: string;
      contextType?: 'normal' | 'ip' | 'knowledge_base';
      ipId?: number;
      knowledgeBaseId?: string;
      includeIpDocuments?: boolean;
      threadId?: string;
      routeKey?: string;
      modelRefreshKey?: number;
      searchTargetMessageId?: string;
      searchTargetKey?: string;
      searchTargetBranchScopes?: AiBranchScope[];
      composerEntranceReason?: ComposerEntranceReason;
      branchTreeSelection?: {
        branchRootMessageId: string;
        branchVersionIndex: number;
        selectionMap: Record<string, number>;
      };
    }
  | {
      name: 'ai-branch-tree';
      space: PixorySpace;
      threadId: string;
      contextTitle?: string;
      contextType?: 'normal' | 'ip' | 'knowledge_base';
      currentBranchScopes?: AiBranchScope[];
    }
  | {
      name: 'ai-chat-search';
      space: PixorySpace;
      threadId: string;
      contextTitle?: string;
      contextType?: 'normal' | 'ip' | 'knowledge_base';
      branchScopes?: AiBranchScope[];
    }
  | { name: 'ai-session-config'; space: PixorySpace; threadId?: string; contextTitle?: string; contextType?: 'normal' | 'ip' | 'knowledge_base' }
  | { name: 'diary-reader'; space: PixorySpace; diaryId: string; versionId?: string }
  | { name: 'dream-reader'; space: PixorySpace; dreamId: string }
  | { name: 'companion-inner-life'; space: PixorySpace; threadId: string }
  | { name: 'companion-runtime-manager'; space: PixorySpace; threadId: string }
  | { name: 'ai-memory-board'; space: PixorySpace; threadId: string }
  | { name: 'ai-provider-settings'; space: PixorySpace }
  | { name: 'ai-role-library'; space: PixorySpace; threadId?: string; mode?: 'library' | 'apply_to_thread' }
  | { name: 'ai-role-card-detail'; space: PixorySpace; roleCardId: string; threadId?: string; mode?: 'library' | 'apply_to_thread' }
  | { name: 'ai-role-card-editor'; space: PixorySpace; roleCardId?: string; threadId?: string }
  | { name: 'ai-ip-picker'; space: PixorySpace }
  | { name: 'ai-knowledge-base'; space: PixorySpace }
  | { name: 'ai-material-import'; space: PixorySpace; knowledgeBaseId?: string; threadId?: string; initialSource?: 'ip' | 'file' | 'manual_text' }
  | { name: 'ai-material-list'; space: PixorySpace; knowledgeBaseId?: string }
  | { name: 'ai-thread-material-list'; space: PixorySpace; threadId: string; title?: string }
  | { name: 'ai-document-reader'; space: PixorySpace; documentId?: string; title?: string; locator?: AiDocumentReaderLocator }
  | { name: 'ai-history'; space: PixorySpace }
  | { name: 'placeholder'; title: string; description: string }
  | { name: 'import-development' };

type PersonalSessionState = 'locked' | 'unlocking' | 'unlocked' | 'locking';
type PersonalLockReason = 'manual' | 'background' | 'auth-expired' | 'error';

type SpaceSession = {
  space: PixorySpace;
  sessionId: string;
  generation: number;
  db: SQLiteDatabase;
  taskToken: PersonalTaskToken;
  assertActive: () => void;
};

const INITIAL_ROUTE: AppRoute = { name: 'root', tab: 'home' };
const PERSONAL_BACKGROUND_LOCK_GRACE_MS = 60 * 1000;
const APPLIED_UPDATE_NOTICE_DURATION_MS = 2200;
const OTA_UPDATE_FETCH_NOTICE_DURATION_MS = 2200;

function isPersonalRoute(route: AppRoute): boolean {
  return 'space' in route && route.space === 'personal';
}

function isExternalEntryRoute(route: AppRoute): boolean {
  return route.name === 'external-video-player' || route.name === 'archive-reader' || route.name === 'external-package-placeholder' || route.name === 'share-collect';
}

function scheduleAiChatMemoryMaintenanceForRoute(route: AppRoute | undefined, reason: 'leave_chat' | 'app_background'): void {
  if (route?.name !== 'ai-chat' || !route.threadId) {
    return;
  }
  void scheduleCompanionMemoryMaintenance({
    reason,
    space: route.space,
    threadId: route.threadId,
  });
}

function buildAiChatRouteFromBranchTree(
  branchTreeRoute: Extract<AppRoute, { name: 'ai-branch-tree' }>,
  selection: {
    branchRootMessageId: string;
    branchVersionIndex: number;
    selectionMap: Record<string, number>;
  },
  previousRoute?: AppRoute
): Extract<AppRoute, { name: 'ai-chat' }> {
  const previousChat = previousRoute?.name === 'ai-chat' ? previousRoute : undefined;
  return {
    branchTreeSelection: selection,
    composerEntranceReason: 'replace_current',
    contextTitle: branchTreeRoute.contextTitle ?? previousChat?.contextTitle,
    contextType: branchTreeRoute.contextType ?? previousChat?.contextType ?? 'normal',
    includeIpDocuments: previousChat?.includeIpDocuments,
    ipId: previousChat?.ipId,
    knowledgeBaseId: previousChat?.knowledgeBaseId,
    routeKey: previousChat?.routeKey,
    space: branchTreeRoute.space,
    threadId: branchTreeRoute.threadId,
    name: 'ai-chat',
  };
}

function buildAiChatRouteFromSearch(
  searchRoute: Extract<AppRoute, { name: 'ai-chat-search' }>,
  result: { messageId: string },
  branchScopes: AiBranchScope[],
  previousRoute?: AppRoute
): Extract<AppRoute, { name: 'ai-chat' }> {
  const previousChat = previousRoute?.name === 'ai-chat' ? previousRoute : undefined;
  return {
    composerEntranceReason: 'replace_current',
    contextTitle: searchRoute.contextTitle ?? previousChat?.contextTitle,
    contextType: searchRoute.contextType ?? previousChat?.contextType ?? 'normal',
    includeIpDocuments: previousChat?.includeIpDocuments,
    ipId: previousChat?.ipId,
    knowledgeBaseId: previousChat?.knowledgeBaseId,
    routeKey: previousChat?.routeKey,
    searchTargetBranchScopes: branchScopes,
    searchTargetKey: `${result.messageId}:${Date.now()}`,
    searchTargetMessageId: result.messageId,
    space: searchRoute.space,
    threadId: searchRoute.threadId,
    name: 'ai-chat',
  };
}

function buildAiChatRouteFromFavorite(
  favorite: AiMessageFavoriteListItem,
  space: PixorySpace
): Extract<AppRoute, { name: 'ai-chat' }> {
  return {
    composerEntranceReason: 'replace_current',
    contextTitle: favorite.threadTitle,
    contextType: favorite.contextType,
    includeIpDocuments: favorite.includeIpDocuments,
    ipId: favorite.boundIpId ?? undefined,
    knowledgeBaseId: favorite.boundKnowledgeBaseId ?? undefined,
    searchTargetBranchScopes: favorite.branchScopes,
    searchTargetKey: `${favorite.messageId}:${Date.now()}`,
    searchTargetMessageId: favorite.messageId,
    space,
    threadId: favorite.threadId,
    name: 'ai-chat',
  };
}

let aiChatRouteInstanceCounter = 0;

function createAiChatRouteInstanceKey(): string {
  aiChatRouteInstanceCounter += 1;
  return `ai-chat-route-${aiChatRouteInstanceCounter}`;
}

function prepareAiChatRouteForPush(route: Extract<AppRoute, { name: 'ai-chat' }>): Extract<AppRoute, { name: 'ai-chat' }> {
  return { ...route, composerEntranceReason: route.composerEntranceReason ?? 'open_thread', routeKey: route.routeKey ?? createAiChatRouteInstanceKey() };
}

function prepareAiChatRouteForReplace(
  route: Extract<AppRoute, { name: 'ai-chat' }>,
  previousRoute?: AppRoute
): Extract<AppRoute, { name: 'ai-chat' }> {
  const previousKey = previousRoute?.name === 'ai-chat' ? previousRoute.routeKey : undefined;
  return { ...route, composerEntranceReason: route.composerEntranceReason ?? 'replace_current', routeKey: route.routeKey ?? previousKey ?? createAiChatRouteInstanceKey() };
}

function aiChatRouteKey(route: Extract<AppRoute, { name: 'ai-chat' }>, stackDepth: number): string {
  if (route.routeKey) {
    return route.routeKey;
  }
  return [
    route.name,
    stackDepth,
    route.space,
    route.contextType ?? 'normal',
    route.ipId ?? 'none',
    route.knowledgeBaseId ?? 'none',
    route.includeIpDocuments ? 'with-docs' : 'without-docs',
  ].join(':');
}

function popRouteStack(current: AppRoute[]): AppRoute[] {
  const closingRoute = current[current.length - 1];
  const next = current.slice(0, -1);
  const previousRoute = next[next.length - 1];
  if (
    closingRoute?.name === 'ai-session-config' &&
    previousRoute?.name === 'ai-chat' &&
    previousRoute.space === closingRoute.space &&
    (!closingRoute.threadId || previousRoute.threadId === closingRoute.threadId)
  ) {
    next[next.length - 1] = {
      ...previousRoute,
      modelRefreshKey: (previousRoute.modelRefreshKey ?? 0) + 1,
    };
  }
  return next;
}

function isArchiveMimeType(mimeType: string | null | undefined): boolean {
  return mimeType === 'application/zip' || mimeType === 'application/x-cbz' || mimeType === 'application/vnd.comicbook+zip';
}

function resolveExternalEntryFileName(externalOpen: NativeExternalOpen, fallbackName: string): string {
  const [cleanUri] = (externalOpen.uri ?? '').split('?');
  return externalOpen.name ?? cleanUri.split('/').pop() ?? fallbackName;
}

function resolveExternalEntryRoute(externalOpen: NativeExternalOpen | null | undefined): AppRoute | null {
  if (!externalOpen?.uri) {
    return null;
  }

  const candidateName = (externalOpen.name ?? externalOpen.uri).toLowerCase();
  const mimeType = externalOpen.mimeType ?? null;
  if (
    externalOpen.action === 'android.intent.action.VIEW' &&
    (mimeType?.startsWith('video/') || /\.(mp4|mkv|mov|webm|m4v|avi)(\?|$)/.test(candidateName))
  ) {
    return {
      name: 'external-video-player',
      uri: externalOpen.uri,
      fileName: resolveExternalEntryFileName(externalOpen, 'external-video.mp4'),
      mimeType,
      fileSize: externalOpen.fileSize ?? null,
    };
  }

  if (
    externalOpen.action === 'android.intent.action.VIEW' &&
    (isArchiveMimeType(mimeType) || /\.(zip|cbz)(\?|$)/.test(candidateName))
  ) {
    return {
      name: 'archive-reader',
      uri: externalOpen.uri,
      fileName: resolveExternalEntryFileName(externalOpen, 'external.zip'),
    };
  }

  if (externalOpen.action === 'android.intent.action.VIEW' && /\.(pixorypack)(\?|$)/.test(candidateName)) {
    return {
      name: 'external-package-placeholder',
      fileName: resolveExternalEntryFileName(externalOpen, 'external.pixorypack'),
    };
  }

  return null;
}

function resolveShareRoute(shareIntent: NativeShareIntent | null | undefined): AppRoute | null {
  if (!shareIntent?.hasShare || shareIntent.items.length === 0) {
    return null;
  }

  return { name: 'share-collect', items: shareIntent.items };
}

function getUpdateVersionKey(update: AppUpdateInfo): string {
  return update.versionCode != null ? `code:${update.versionCode}` : `version:${update.version}`;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_400Regular_Italic,
    JetBrainsMono_400Regular,
    DiaryHandwriting: MaShanZheng_400Regular,
    DiaryKai: ZCOOLXiaoWei_400Regular,
  });
  const [status, setStatus] = useState('正在初始化 Pixory 本地数据库与文件目录...');
  const [isReady, setIsReady] = useState(false);
  const [routeStack, setRouteStack] = useState<AppRoute[]>([INITIAL_ROUTE]);
  const routeStackRef = useRef(routeStack);
  const [libraryRefreshToken, setLibraryRefreshToken] = useState(0);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [initializationKey, setInitializationKey] = useState(0);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [personalSessionState, setPersonalSessionState] = useState<PersonalSessionState>('locked');
  const [personalSession, setPersonalSession] = useState<SpaceSession | null>(null);
  const [personalCredentialAvailable, setPersonalCredentialAvailable] = useState<boolean | null>(null);
  const [personalUnlockVisible, setPersonalUnlockVisible] = useState(false);
  const [personalAuthBusy, setPersonalAuthBusy] = useState(false);
  const [privacyShieldVisible, setPrivacyShieldVisible] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const [availableAnnouncement, setAvailableAnnouncement] = useState<RemoteAnnouncementInfo | null>(null);
  const personalGenerationRef = useRef(0);
  const personalTaskTokenRef = useRef<PersonalTaskToken | null>(null);
  const personalSessionStateRef = useRef(personalSessionState);
  const personalBackgroundedAtRef = useRef<number | null>(null);
  const backgroundLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundMemoryCacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentRoute = routeStack[routeStack.length - 1] ?? INITIAL_ROUTE;
  const activeSpace = personalSessionState === 'unlocked' ? 'personal' : 'normal';

  const currentRouteRef = useRef(currentRoute);
  currentRouteRef.current = currentRoute;

  const rootTabsScrollViewRef = useRef<any>(null);
  const ROOT_TABS: RootTabKey[] = ['home', 'organize', 'ai', 'me'];
  const currentTab = currentRoute.name === 'root' ? currentRoute.tab : undefined;
  const [renderedTabs, setRenderedTabs] = useState<Set<RootTabKey>>(
    new Set([currentTab ?? 'home'])
  );
  // Incremented when the user navigates back to root from an overlay (e.g.
  // chat). Causes AiHomeScreen to refresh its thread list without unmounting.
  const [aiHomeRefreshToken, setAiHomeRefreshToken] = useState(0);
  const prevOverlayDepthRef = useRef(routeStack.length);

  const previousRouteNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentRoute.name === 'root') {
      const timer = setTimeout(() => {
        setRenderedTabs(new Set(['home', 'organize', 'ai', 'me']));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [currentRoute.name]);

  useEffect(() => {
    if (currentRoute.name === 'root' && currentTab) {
      setRenderedTabs((prev) => {
        if (prev.has(currentTab)) return prev;
        const next = new Set(prev);
        next.add(currentTab);
        return next;
      });
      
      const index = ROOT_TABS.indexOf(currentTab);
      if (index !== -1 && rootTabsScrollViewRef.current) {
        const shouldAnimate = previousRouteNameRef.current === 'root';
        rootTabsScrollViewRef.current.scrollTo({ x: index * Dimensions.get('window').width, animated: shouldAnimate });
      }
    }
    previousRouteNameRef.current = currentRoute.name;
  }, [currentRoute.name, currentTab]);

  // Refresh AI home data when returning from any overlay to root.
  useEffect(() => {
    const depth = routeStack.length;
    if (depth === 1 && prevOverlayDepthRef.current > 1) {
      setAiHomeRefreshToken((t) => t + 1);
    }
    prevOverlayDepthRef.current = depth;
  }, [routeStack.length]);

  const handleRootScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (currentRoute.name !== 'root') return;
    const offsetX = e.nativeEvent.contentOffset.x;
    const width = e.nativeEvent.layoutMeasurement.width;
    const index = Math.round(offsetX / width);
    const tab = ROOT_TABS[index];
    if (tab && currentRoute.tab !== tab) {
      switchRootTab(tab);
    }
  };

  async function checkRemoteNotices(isStillActive: () => boolean = () => true) {
    const activeRoute = routeStackRef.current[routeStackRef.current.length - 1] ?? INITIAL_ROUTE;
    if (!isStillActive() || isExternalEntryRoute(activeRoute)) {
      return;
    }

    const updateInfo = await checkForAppUpdate();
    if (!isStillActive()) {
      return;
    }
    if (updateInfo) {
      const skippedUpdateVersionKey = await runWithDatabaseSpace('normal', (db) => settingsRepository.getSkippedUpdateVersionKey(db)).catch(() => null);
      if (!isStillActive()) {
        return;
      }
      if (skippedUpdateVersionKey !== getUpdateVersionKey(updateInfo)) {
        setAvailableAnnouncement(null);
        setAvailableUpdate(updateInfo);
        return;
      }
    }

    const announcement = await checkForRemoteAnnouncement();
    if (!isStillActive() || !announcement) {
      return;
    }
    const activeRouteAfterAnnouncement = routeStackRef.current[routeStackRef.current.length - 1] ?? INITIAL_ROUTE;
    const dismissedAnnouncementId = await runWithDatabaseSpace('normal', (db) => settingsRepository.getDismissedAnnouncementId(db)).catch(() => null);
    if (isStillActive() && !isExternalEntryRoute(activeRouteAfterAnnouncement) && announcement.id !== dismissedAnnouncementId) {
      setAvailableAnnouncement(announcement);
    }
  }

  useEffect(() => {
    routeStackRef.current = routeStack;
  }, [routeStack]);

  useEffect(() => {
    personalSessionStateRef.current = personalSessionState;
  }, [personalSessionState]);

  function resumeCompanionRuntimes(): void {
    void reconcileThoughtSessions('normal').then(() => runCompanionMaintenancePass({ space: 'normal' })).catch(() => undefined);
    void coordinateDiaryRuntime({ space: 'normal' }).catch(() => undefined);
    if (personalSessionStateRef.current === 'unlocked') {
      void reconcileThoughtSessions('personal').then(() => runCompanionMaintenancePass({ allowRemoteModelForPersonal: true, space: 'personal' })).catch(() => undefined);
      void coordinateDiaryRuntime({ allowPersonal: true, space: 'personal' }).catch(() => undefined);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      setInitializationError(null);
      setIsReady(false);
      setStatus('正在初始化 Pixory 本地数据库与文件目录...');

      try {
        await ensureAppDirectories();
        await initDatabase();
        void coordinateDiaryRuntime({ space: 'normal' }).catch(() => undefined);
        void aiGenerationManager.reconcileInterruptedGenerations('normal').catch(() => undefined);
        void reconcileThoughtSessions('normal').catch(() => undefined);
        void runCompanionMaintenancePass({ space: 'normal' }).catch(() => undefined);
        void cleanupOldTempFiles('personal', 0).catch((error) => {
          console.warn('Pixory personal temp startup cleanup failed.', {
            message: error instanceof Error ? error.message : 'unknown personal temp cleanup error',
          });
        });
        void cleanupDailyAppTempCache().catch((error) => {
          console.warn('Pixory temp cache cleanup failed.', {
            message: error instanceof Error ? error.message : 'unknown temp cache cleanup error',
          });
        });
        setTimeout(() => {
          InteractionManager.runAfterInteractions(() => {
            void clearExpiredTrashOnIdle('normal').catch((error) => {
              console.warn('Pixory normal trash idle cleanup failed.', {
                message: error instanceof Error ? error.message : 'unknown trash cleanup error',
              });
            });
          });
        }, 1400);

        if (isMounted) {
          setIsReady(true);
          setStatus('Pixory 本地数据环境已就绪。');
        }
      } catch (error) {
        if (isMounted) {
          setIsReady(false);
          const message = error instanceof Error ? error.message : '未知错误';
          setInitializationError(message);
          setStatus(`Pixory 初始化失败：${message}`);
        }
      }
    }

    initialize();

    return () => {
      isMounted = false;
    };
  }, [initializationKey]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let isMounted = true;
    void checkRemoteNotices(() => isMounted).catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [isReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    let isMounted = true;
    void (async () => {
      const shareIntent = await getInitialShareIntent().catch(() => null);
      const shareRoute = resolveShareRoute(shareIntent);
      if (isMounted && shareRoute) {
        setRouteStack([shareRoute]);
        return;
      }

      const externalOpen = await getInitialExternalOpen().catch(() => null);
      if (!isMounted) {
        return;
      }
      const externalRoute = resolveExternalEntryRoute(externalOpen);
      if (externalRoute) {
        setRouteStack([externalRoute]);
      }
    })()
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [isReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const subscription = addNativeIntentListener((event) => {
      if (event.kind === 'share') {
        const shareRoute = resolveShareRoute(event.shareIntent);
        if (shareRoute) {
          setRouteStack([shareRoute]);
        }
        return;
      }

      if (event.kind === 'externalOpen') {
        const externalRoute = resolveExternalEntryRoute(event.externalOpen);
        if (externalRoute) {
          setRouteStack([externalRoute]);
        }
      }
    });

    return () => subscription.remove();
  }, [isReady]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const backgroundedAt = personalBackgroundedAtRef.current;
        const elapsedMs = backgroundedAt == null ? 0 : Date.now() - personalBackgroundedAtRef.current!;
        personalBackgroundedAtRef.current = null;
        clearPendingPersonalBackgroundLock();
        clearPendingBackgroundMemoryCacheCleanup();
        if (personalSessionStateRef.current === 'unlocked' && elapsedMs >= PERSONAL_BACKGROUND_LOCK_GRACE_MS) {
          void lockPersonalSpace('background');
          return;
        }
        setPrivacyShieldVisible(false);
        void checkRemoteNotices().catch(() => undefined);
        resumeCompanionRuntimes();
        return;
      }

      personalBackgroundedAtRef.current = Date.now();
      schedulePersonalBackgroundLock();
      void settleActiveThoughtSessions().catch(() => undefined);
      scheduleAiChatMemoryMaintenanceForRoute(routeStackRef.current[routeStackRef.current.length - 1], 'app_background');
      scheduleBackgroundMemoryCacheCleanup();
    });

    return () => {
      clearPendingPersonalBackgroundLock();
      clearPendingBackgroundMemoryCacheCleanup();
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    void hasPersonalPassword().then((nextValue) => {
      if (isMounted) {
        setPersonalCredentialAvailable(nextValue);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (personalSessionState !== 'unlocked' && isPersonalRoute(currentRoute)) {
      setRouteStack([INITIAL_ROUTE]);
    }
  }, [currentRoute, personalSessionState]);

  function clearPendingPersonalBackgroundLock() {
    if (backgroundLockTimerRef.current) {
      clearTimeout(backgroundLockTimerRef.current);
      backgroundLockTimerRef.current = null;
    }
  }

  function clearPendingBackgroundMemoryCacheCleanup() {
    if (backgroundMemoryCacheTimerRef.current) {
      clearTimeout(backgroundMemoryCacheTimerRef.current);
      backgroundMemoryCacheTimerRef.current = null;
    }
  }

  function scheduleBackgroundMemoryCacheCleanup() {
    clearPendingBackgroundMemoryCacheCleanup();
    backgroundMemoryCacheTimerRef.current = setTimeout(() => {
      backgroundMemoryCacheTimerRef.current = null;
      void clearImageMemoryCache().catch(reportBackgroundMemoryCacheCleanupFailure);
    }, BACKGROUND_MEMORY_CACHE_CLEAR_DELAY_MS);
  }

  function reportBackgroundMemoryCacheCleanupFailure(error: unknown) {
    console.warn('Pixory background memory cache cleanup failed.', {
      message: error instanceof Error ? error.message : 'unknown memory cache cleanup error',
    });
  }

  function schedulePersonalBackgroundLock() {
    if (personalSessionStateRef.current !== 'unlocked') {
      return;
    }

    setPrivacyShieldVisible(true);
    clearPendingPersonalBackgroundLock();
    backgroundLockTimerRef.current = setTimeout(() => {
      backgroundLockTimerRef.current = null;
      if (personalSessionStateRef.current === 'unlocked') {
        void lockPersonalSpace('background');
        return;
      }
      setPrivacyShieldVisible(false);
    }, PERSONAL_BACKGROUND_LOCK_GRACE_MS);
  }

  async function unlockPersonalSpace(secret: string) {
    setPersonalAuthBusy(true);
    setPersonalSessionState('unlocking');
    personalSessionStateRef.current = 'unlocking';
    try {
      const result = await verifyPersonalPassword(secret);
      if (!result.ok) {
        throw new Error(result.message ?? '隐私模式验证失败。');
      }
      await ensureAppDirectories('personal');
      const db = await initDatabase('personal');
      const generation = personalGenerationRef.current + 1;
      personalGenerationRef.current = generation;
      const sessionId = `${Date.now()}-${generation}`;
      const taskToken = createPersonalTaskToken(sessionId, generation);
      personalTaskTokenRef.current = taskToken;
      setRenderedTabs(new Set([currentRouteRef.current.name === 'root' ? currentRouteRef.current.tab : 'home']));
      const session: SpaceSession = {
        space: 'personal',
        sessionId,
        generation,
        db,
        taskToken,
        assertActive: () => {
          if (!taskToken.isActive() || personalGenerationRef.current !== generation) {
            throw new Error('Personal session is no longer active.');
          }
        },
      };
      setPersonalSession(session);
      setPersonalSessionState('unlocked');
      personalSessionStateRef.current = 'unlocked';
      aiGenerationManager.resumeSpace('personal');
      resumePersonalCompanionMaintenance();
      resumeCompanionMemoryMaintenance('personal');
      resumeDiaryBackgroundTasks('personal');
      void coordinateDiaryRuntime({ allowPersonal: true, space: 'personal' }).catch(() => undefined);
      void aiGenerationManager.reconcileInterruptedGenerations('personal').catch(() => undefined);
      void reconcileThoughtSessions('personal')
        .then(() => runCompanionMaintenancePass({ allowRemoteModelForPersonal: true, space: 'personal' }))
        .catch(() => undefined);
      setPersonalUnlockVisible(false);
      setLibraryRefreshToken((current) => current + 1);
      setTimeout(() => {
        if (taskToken.isActive()) {
          InteractionManager.runAfterInteractions(() => {
            if (taskToken.isActive()) {
              void clearExpiredTrashOnIdle('personal').catch((error) => {
                console.warn('Pixory personal trash idle cleanup failed.', {
                  message: error instanceof Error ? error.message : 'unknown personal trash cleanup error',
                });
              });
            }
          });
        }
      }, 1400);
    } catch (error) {
      setPersonalSessionState('locked');
      personalSessionStateRef.current = 'locked';
      setPrivacyShieldVisible(false);
      throw error;
    } finally {
      setPersonalAuthBusy(false);
    }
  }

  async function setupPersonalSpace(secret: string) {
    setPersonalAuthBusy(true);
    try {
      await setPersonalPassword(secret);
      setPersonalCredentialAvailable(true);
      await unlockPersonalSpace(secret);
    } finally {
      setPersonalAuthBusy(false);
    }
  }

  async function updatePersonalPassword(currentSecret: string, nextSecret: string) {
    setPersonalAuthBusy(true);
    try {
      await changePersonalPassword(currentSecret, nextSecret);
      setPersonalCredentialAvailable(true);
    } finally {
      setPersonalAuthBusy(false);
    }
  }

  async function resetPersonalDataFromSettings() {
    setPersonalAuthBusy(true);
    try {
      await resetPersonalSystemData();
      setPersonalCredentialAvailable(false);
      await lockPersonalSpace('manual');
    } finally {
      setPersonalAuthBusy(false);
    }
  }

  async function lockPersonalSpace(reason: PersonalLockReason) {
    clearPendingPersonalBackgroundLock();
    if (personalSessionStateRef.current === 'locked' && !personalTaskTokenRef.current) {
      setPrivacyShieldVisible(false);
      return;
    }

    setPrivacyShieldVisible(true);
    setPersonalSessionState((current) => (current === 'locked' ? 'locked' : 'locking'));
    personalSessionStateRef.current = 'locking';
    const lockingTaskToken = personalTaskTokenRef.current;
    invalidatePersonalTaskToken(lockingTaskToken);
    const runtimeResults = await Promise.allSettled([
      aiGenerationManager.suspendSpace('personal'),
      suspendCompanionMaintenance('personal'),
      suspendCompanionMemoryMaintenance('personal'),
      suspendDiaryBackgroundTasks('personal'),
      waitForPersonalTasks(lockingTaskToken),
    ]);
    for (const runtimeResult of runtimeResults) {
      if (runtimeResult.status === 'rejected') {
        console.warn('Pixory personal runtime suspension failed.', {
          message: runtimeResult.reason instanceof Error ? runtimeResult.reason.message : 'unknown runtime suspension error',
        });
      }
    }
    personalTaskTokenRef.current = null;
    personalGenerationRef.current += 1;
    setPersonalSession(null);
    setPersonalUnlockVisible(false);
    setGlobalSearchQuery('');
    setLibraryRefreshToken((current) => current + 1);

    const cleanupResults = await Promise.allSettled([
      clearPersonalImageCache(),
      cleanupOldTempFiles('personal', 0),
      resetDatabaseSpaceCache('personal'),
    ]);
    for (const cleanupResult of cleanupResults) {
      if (cleanupResult.status === 'rejected') {
        console.warn('Pixory personal lock cleanup failed.', {
          message: cleanupResult.reason instanceof Error ? cleanupResult.reason.message : 'unknown cleanup error',
        });
      }
    }

    setPersonalSessionState('locked');
    personalSessionStateRef.current = 'locked';
    setPrivacyShieldVisible(false);
  }

  function pushRoute(route: AppRoute) {
    if (route.name === 'ai-chat') {
      scheduleAiChatMemoryMaintenanceForRoute(routeStackRef.current[routeStackRef.current.length - 1], 'leave_chat');
      const nextRoute = prepareAiChatRouteForPush(route);
      setRouteStack((current) => [...current, nextRoute]);
      return;
    }
    setRouteStack((current) => [...current, route]);
  }

  function openAiChatRoute(route: Extract<AppRoute, { name: 'ai-chat' }>) {
    scheduleAiChatMemoryMaintenanceForRoute(routeStackRef.current[routeStackRef.current.length - 1], 'leave_chat');
    const nextRoute = prepareAiChatRouteForPush(route);
    setRouteStack((current) => {
      const currentRoute = current[current.length - 1];
      if (currentRoute?.name === 'ai-chat') {
        return [...current.slice(0, -1), nextRoute];
      }
      if (currentRoute?.name === 'ai-history') {
        const previousRoute = current[current.length - 2];
        if (previousRoute?.name === 'ai-chat') {
          return [...current.slice(0, -2), nextRoute];
        }
        return [...current.slice(0, -1), nextRoute];
      }
      return [...current, nextRoute];
    });
  }

  function openNewAiChat(space: PixorySpace) {
    openAiChatRoute({
      name: 'ai-chat',
      composerEntranceReason: 'new_chat',
      contextTitle: '普通聊天',
      contextType: 'normal',
      space,
    });
  }

  async function startChatWithRoleCard(space: PixorySpace, roleCardId: string) {
    scheduleAiChatMemoryMaintenanceForRoute(routeStackRef.current[routeStackRef.current.length - 1], 'leave_chat');
    const thread = await createNormalThreadFromRoleCard({ roleCardId, space });
    replaceAiChatFlowWithRoute({
      name: 'ai-chat',
      contextTitle: thread.title,
      contextType: 'normal',
      space,
      threadId: thread.id,
    });
  }

  function popRoute() {
    const current = routeStackRef.current;
    if (current.length > 1) {
      scheduleAiChatMemoryMaintenanceForRoute(current[current.length - 1], 'leave_chat');
    }
    setRouteStack((currentStack) => (currentStack.length > 1 ? popRouteStack(currentStack) : currentStack));
  }

  function closeDeletedAiThread(threadId?: string) {
    setRouteStack((current) => {
      const next = current.slice(0, -1);
      const previousRoute = next[next.length - 1];
      if (threadId && previousRoute?.name === 'ai-chat' && previousRoute.threadId === threadId) {
        return next.length > 1 ? next.slice(0, -1) : [INITIAL_ROUTE];
      }
      return next.length > 0 ? next : [INITIAL_ROUTE];
    });
  }

  function exitExternalEntry() {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
      return;
    }
    setRouteStack([INITIAL_ROUTE]);
  }

  function exitShareEntry() {
    if (Platform.OS === 'android') {
      void finishNativeShareActivity().catch(() => BackHandler.exitApp());
      return;
    }
    setRouteStack([INITIAL_ROUTE]);
  }

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const current = routeStackRef.current;
      let nextRouteStack: AppRoute[] | null = null;

      if (current.length > 1) {
        nextRouteStack = popRouteStack(current);
      } else {
        const [rootRoute] = current;
        if (rootRoute && isExternalEntryRoute(rootRoute)) {
          BackHandler.exitApp();
          return true;
        }
        if (rootRoute?.name === 'root' && rootRoute.tab !== 'home') {
          nextRouteStack = [INITIAL_ROUTE];
        } else if (rootRoute?.name !== 'root') {
          nextRouteStack = [INITIAL_ROUTE];
        }
      }

      if (!nextRouteStack) {
        return false;
      }

      scheduleAiChatMemoryMaintenanceForRoute(current[current.length - 1], 'leave_chat');
      routeStackRef.current = nextRouteStack;
      setRouteStack(nextRouteStack);
      return true;
    });

    return () => subscription.remove();
  }, []);

  function popAndRefresh() {
    setLibraryRefreshToken((current) => current + 1);
    popRoute();
  }

  function refreshLibrary() {
    setLibraryRefreshToken((current) => current + 1);
  }

  function resetHome(filter: IpLibraryFilter = 'all') {
    setRouteStack([{ name: 'root', tab: 'home', initialFilter: filter }]);
  }

  function switchRootTab(tab: RootTabKey) {
    setRouteStack([{ name: 'root', tab }]);
  }

  function openImageViewer(imageId: number, context: ImageViewerContext) {
    pushRoute({ name: 'image-viewer', imageId, space: context.space, context });
  }

  function openImageDetail(imageId: number, context?: ImageViewerContext) {
    const routeSpace = context?.space ?? activeSpace;
    void runWithDatabaseSpace(routeSpace, (db) => imageRepository.findById(db, imageId, { includeDeleted: true, mediaType: 'all' }))
      .then((asset) => {
        if (asset?.mediaType === 'video') {
          pushRoute({ name: 'video-detail', videoId: imageId, space: routeSpace });
          return;
        }
        pushRoute({ name: 'image-detail', imageId, space: routeSpace, context });
      })
      .catch(() => {
        pushRoute({ name: 'image-detail', imageId, space: routeSpace, context });
      });
  }

  function replaceCurrentRoute(route: AppRoute) {
    setRouteStack((current) => {
      const previousRoute = current[current.length - 1];
      const nextRoute = route.name === 'ai-chat' ? prepareAiChatRouteForReplace(route, previousRoute) : route;
      return [...current.slice(0, -1), nextRoute];
    });
  }

  function replaceAiChatFlowWithRoute(route: Extract<AppRoute, { name: 'ai-chat' }>) {
    const nextRoute = prepareAiChatRouteForPush(route);
    setRouteStack((current) => {
      const stableRoutes = current.filter((entry) => ![
        'ai-chat',
        'ai-role-library',
        'ai-role-card-detail',
        'ai-role-card-editor',
      ].includes(entry.name));
      return [...(stableRoutes.length ? stableRoutes : [INITIAL_ROUTE]), nextRoute];
    });
  }

  async function applyRoleToCurrentThread(space: PixorySpace, threadId: string | undefined, roleCardId: string) {
    if (!threadId) {
      throw new Error('未找到当前会话，无法应用角色。');
    }
    const updated = await applyRoleCardToThread({ roleCardId, space, threadId });
    if (!updated) {
      throw new Error('当前会话不存在或已被删除。');
    }
    setRouteStack((current) => {
      const next = [...current];
      while (next.length > 1) {
        const top = next[next.length - 1];
        if (!['ai-role-library', 'ai-role-card-detail', 'ai-role-card-editor'].includes(top.name)) {
          break;
        }
        next.pop();
      }
      return next.length ? next : [INITIAL_ROUTE];
    });
  }

  function updateCurrentAiChatRoute(patch: Partial<Extract<AppRoute, { name: 'ai-chat' }>>, expectedRouteKey?: string) {
    setRouteStack((current) => {
      const currentRoute = current[current.length - 1];
      if (currentRoute?.name !== 'ai-chat') {
        return current;
      }
      if (expectedRouteKey && currentRoute.routeKey !== expectedRouteKey) {
        return current;
      }
      const nextRoute = prepareAiChatRouteForReplace({ ...currentRoute, ...patch }, currentRoute);
      return [...current.slice(0, -1), nextRoute];
    });
  }

  function openAvailableUpdate() {
    const downloadUrl = availableUpdate?.downloadUrl;
    setAvailableUpdate(null);
    if (!downloadUrl) {
      return;
    }

    void Linking.openURL(downloadUrl).catch((error) => {
      console.warn('Pixory update link open failed.', {
        message: error instanceof Error ? error.message : 'unknown link error',
      });
    });
  }

  function skipAvailableUpdate() {
    const update = availableUpdate;
    setAvailableUpdate(null);
    if (!update) {
      return;
    }

    void runWithDatabaseSpace('normal', (db) => settingsRepository.setSkippedUpdateVersionKey(db, getUpdateVersionKey(update))).catch((error) => {
      console.warn('Pixory update skip save failed.', {
        message: error instanceof Error ? error.message : 'unknown update skip error',
      });
    });
  }

  function dismissAvailableAnnouncement() {
    const announcement = availableAnnouncement;
    setAvailableAnnouncement(null);
    if (!announcement) {
      return;
    }

    void runWithDatabaseSpace('normal', (db) => settingsRepository.setDismissedAnnouncementId(db, announcement.id)).catch((error) => {
      console.warn('Pixory announcement dismiss save failed.', {
        message: error instanceof Error ? error.message : 'unknown announcement dismiss error',
      });
    });
  }

  if (!isReady || (!fontsLoaded && !fontError)) {
    return (
      <SafeAreaProvider>
        <AppScreen contentStyle={styles.stateScreen}>
          <View style={styles.stateCard}>
            <Text style={styles.title}>Pixory</Text>
            <Text style={styles.message}>{status}</Text>
            {initializationError ? (
              <PrimaryButton label="重新初始化" onPress={() => setInitializationKey((current) => current + 1)} variant="outline" />
            ) : null}
          </View>
          <StatusBar style="dark" />
        </AppScreen>
      </SafeAreaProvider>
    );
  }

  const rootFooter = undefined;

  // The base route is always routeStack[0]. It's a 'root' route except in
  // external-entry flows (share, archive) which replace the entire stack.
  const baseRoute = routeStack[0];
  const baseRootRoute = baseRoute?.name === 'root'
    ? (baseRoute as Extract<AppRoute, { name: 'root' }>)
    : null;
  const sw = Dimensions.get('window').width;

  // Always-mounted root tab pager. Stays alive while overlay screens are shown
  // on top, eliminating the mount/unmount flash on every back-navigation.
  const rootTabContent = baseRootRoute ? (
    <FloatingFooterProvider>
      <StrictPager
        activeIndex={baseRootRoute.tab ? ROOT_TABS.indexOf(baseRootRoute.tab) : 0}
        onChange={(index) => {
          const tab = ROOT_TABS[index];
          if (tab && baseRootRoute.tab !== tab) {
            switchRootTab(tab);
          }
        }}
      >
        <View style={{ width: sw, flex: 1 }}>
          {renderedTabs.has('home') ? (
            <HomeLibraryScreen
              initialFilter={baseRootRoute.initialFilter ?? 'all'}
              onCreateIp={() => pushRoute({ name: 'create-ip', space: activeSpace })}
              onOpenGlobalSearch={() => {
                setGlobalSearchQuery('');
                pushRoute({ name: 'global-search', space: activeSpace });
              }}
              onOpenNeedsOrganizing={() => pushRoute({ name: 'quick-organize', space: activeSpace })}
              onOpenIp={(ipId) => pushRoute({ name: 'ip-detail', ipId, space: activeSpace })}
              refreshKey={libraryRefreshToken}
              space={activeSpace}
            />
          ) : null}
        </View>
        <View style={{ width: sw, flex: 1 }}>
          {renderedTabs.has('organize') ? (
            <OrganizeScreen
              space={activeSpace}
              onCreateFirstIp={() => pushRoute({ name: 'create-ip', space: activeSpace })}
              onOpenCoverPicker={(ipId, groupId) => pushRoute({ name: 'group-cover-picker', ipId, groupId, space: activeSpace })}
              onEditGroup={(ipId, groupId) => pushRoute({ name: 'edit-group', ipId, groupId, space: activeSpace })}
              onImportImagesToGroup={(ipId, groupId) => pushRoute({ name: 'import-images', ipId, groupId, initialMediaPicker: 'images', space: activeSpace })}
              onImportVideosToGroup={(ipId, groupId) => pushRoute({ name: 'import-images', ipId, groupId, initialMediaPicker: 'videos', space: activeSpace })}
              onOpenGroup={(ipId, groupId) => pushRoute({ name: 'group-images', ipId, groupId, space: activeSpace })}
              onOpenTag={(tagId) => pushRoute({ name: 'tag-result', tagId, space: activeSpace })}
              refreshToken={libraryRefreshToken}
            />
          ) : null}
        </View>
        <View style={{ width: sw, flex: 1 }}>
          {renderedTabs.has('ai') ? (
            <AiHomeScreen
              onOpenGlobalMaterials={() => pushRoute({ name: 'ai-material-list', space: activeSpace })}
              onOpenHistory={() => pushRoute({ name: 'ai-history', space: activeSpace })}
              onOpenIpChatPicker={() => pushRoute({ name: 'ai-ip-picker', space: activeSpace })}
              onOpenKnowledgeBase={() => pushRoute({ name: 'ai-knowledge-base', space: activeSpace })}
              onOpenProviderSettings={() => pushRoute({ name: 'ai-provider-settings', space: activeSpace })}
              onOpenRoleLibrary={() => pushRoute({ name: 'ai-role-library', space: activeSpace })}
              onOpenThread={(thread) =>
                openAiChatRoute({
                  name: 'ai-chat',
                  composerEntranceReason: 'open_thread',
                  contextTitle: thread.title,
                  contextType: thread.contextType,
                  includeIpDocuments: thread.includeIpDocuments,
                  ipId: thread.boundIpId ?? undefined,
                  knowledgeBaseId: thread.boundKnowledgeBaseId ?? undefined,
                  space: activeSpace,
                  threadId: thread.id,
                })
              }
              onStartNormalChat={() =>
                pushRoute({
                  name: 'ai-chat',
                  contextTitle: '普通聊天',
                  contextType: 'normal',
                  space: activeSpace,
                })
              }
              onStartChatWithRole={(roleCardId) => startChatWithRoleCard(activeSpace, roleCardId)}
              refreshToken={aiHomeRefreshToken}
              space={activeSpace}
            />
          ) : null}
        </View>
        <View style={{ width: sw, flex: 1 }}>
          {renderedTabs.has('me') ? (
            <MeScreen
              space={activeSpace}
              onOpenProviderSettings={() => pushRoute({ name: 'ai-provider-settings', space: activeSpace })}
              onOpenFavorites={() => pushRoute({ name: 'favorites', space: activeSpace })}
              onOpenBackup={() => pushRoute({ name: 'backup', space: activeSpace })}
              onOpenDuplicateReview={() => pushRoute({ name: 'duplicate-review', space: activeSpace })}
              onOpenAbout={() => pushRoute({ name: 'about', space: activeSpace })}
              onOpenStorageUsage={() => pushRoute({ name: 'storage-usage', space: activeSpace })}
              onRequestPersonalUnlock={() => setPersonalUnlockVisible(true)}
              onLockPersonalSpace={() => {
                void lockPersonalSpace('manual');
              }}
              onOpenRecentViewed={() => pushRoute({ name: 'recent-viewed', space: activeSpace })}
              onOpenTrash={() => pushRoute({ name: 'trash', space: activeSpace })}
              personalSessionState={personalSessionState}
              refreshToken={libraryRefreshToken}
            />
          ) : null}
        </View>
      </StrictPager>
    </FloatingFooterProvider>
  ) : null;

  let content;

  if (isPersonalRoute(currentRoute) && personalSessionState !== 'unlocked') {
    content = (
      <AppScreen contentStyle={styles.stateScreen}>
        <View style={styles.stateCard}>
          <Text style={styles.title}>Pixory</Text>
          <Text style={styles.message}>隐私模式已锁定，正在返回普通空间。</Text>
        </View>
      </AppScreen>
    );
  } else if (currentRoute.name === 'create-ip') {
    content = (
      <CreateIpScreen
        space={currentRoute.space}
        onCancel={() => resetHome()}
        onCreated={(ipId) => {
          setLibraryRefreshToken((current) => current + 1);
          if (currentRoute.space === 'personal') {
            replaceCurrentRoute({ name: 'ip-detail', ipId, space: currentRoute.space });
            return;
          }
          resetHome('recent');
        }}
      />
    );
  } else if (currentRoute.name === 'ip-detail') {
    content = (
      <IpDetailScreen
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onCreateGroup={() => pushRoute({ name: 'create-group', ipId: currentRoute.ipId, space: currentRoute.space })}
        onEdit={() => pushRoute({ name: 'edit-ip', ipId: currentRoute.ipId, space: currentRoute.space })}
        onEditGroup={(groupId) => pushRoute({ name: 'edit-group', ipId: currentRoute.ipId, groupId, space: currentRoute.space })}
        onImportImages={() => pushRoute({ name: 'import-images', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenAllImages={() => pushRoute({ name: 'all-images', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenBatchManagement={(imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId: currentRoute.ipId,
            space: currentRoute.space,
            source: 'ip-detail',
            initialSelectedImageIds: imageId ? [imageId] : undefined,
          })
        }
        onOpenImportBatches={() => pushRoute({ name: 'import-batch-history', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenNeedsOrganizing={() => pushRoute({ name: 'quick-organize', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenGroups={() => pushRoute({ name: 'group-overview', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenGroup={(groupId) => pushRoute({ name: 'group-images', ipId: currentRoute.ipId, groupId, space: currentRoute.space })}
        onOpenGroupCoverPicker={(groupId) => pushRoute({ name: 'group-cover-picker', ipId: currentRoute.ipId, groupId, space: currentRoute.space })}
        onOpenCoverPicker={() => pushRoute({ name: 'ip-cover-picker', ipId: currentRoute.ipId, space: currentRoute.space })}
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        onChanged={refreshLibrary}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'ip-cover-picker') {
    content = (
      <IpCoverPickerScreen
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onChanged={refreshLibrary}
      />
    );
  } else if (currentRoute.name === 'group-cover-picker') {
    content = (
      <GroupCoverPickerScreen
        groupId={currentRoute.groupId}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onChanged={refreshLibrary}
      />
    );
  } else if (currentRoute.name === 'edit-ip') {
    content = <EditIpScreen ipId={currentRoute.ipId} space={currentRoute.space} onBack={popRoute} onSaved={popAndRefresh} />;
  } else if (currentRoute.name === 'edit-group') {
    content = (
      <EditGroupScreen
        groupId={currentRoute.groupId}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onDeleted={popAndRefresh}
        onSaved={popAndRefresh}
      />
    );
  } else if (currentRoute.name === 'edit-image') {
    content = (
      <EditImageScreen
        imageId={currentRoute.imageId}
        space={currentRoute.space}
        onBack={popRoute}
        onSaved={popAndRefresh}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'group-overview') {
    content = (
      <GroupOverviewScreen
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onCreateGroup={() => pushRoute({ name: 'create-group', ipId: currentRoute.ipId, space: currentRoute.space })}
        onEditGroup={(groupId) => pushRoute({ name: 'edit-group', ipId: currentRoute.ipId, groupId, space: currentRoute.space })}
        onOpenCoverPicker={(groupId) => pushRoute({ name: 'group-cover-picker', ipId: currentRoute.ipId, groupId, space: currentRoute.space })}
        onOpenGroup={(groupId) => pushRoute({ name: 'group-images', ipId: currentRoute.ipId, groupId, space: currentRoute.space })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'create-group') {
    content = <CreateGroupScreen ipId={currentRoute.ipId} space={currentRoute.space} onBack={popRoute} onCreated={popAndRefresh} />;
  } else if (currentRoute.name === 'group-images') {
    content = (
      <GroupImagesScreen
        groupId={currentRoute.groupId}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onImportImages={() =>
          pushRoute({
            name: 'import-images',
            ipId: currentRoute.ipId,
            groupId: currentRoute.groupId,
            space: currentRoute.space,
          })
        }
        onStartBatchManagement={(imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId: currentRoute.ipId,
            space: currentRoute.space,
            source: 'group-images',
            groupId: currentRoute.groupId,
            initialSelectedImageIds: [imageId],
          })
        }
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'batch-manage-images') {
    content = (
      <BatchManageImagesScreen
        groupId={currentRoute.groupId ?? null}
        space={currentRoute.space}
        initialSelectedImageIds={currentRoute.initialSelectedImageIds}
        importBatchId={currentRoute.importBatchId ?? null}
        initialMode={currentRoute.initialMode}
        ipId={currentRoute.ipId}
        onBack={popRoute}
        onChanged={refreshLibrary}
        onDeleted={popAndRefresh}
        onImportImages={() =>
          pushRoute({
            name: 'import-images',
            ipId: currentRoute.ipId,
            groupId: currentRoute.groupId ?? null,
            space: currentRoute.space,
          })
        }
        onOpenImage={openImageViewer}
        refreshToken={libraryRefreshToken}
        scopeImageIds={currentRoute.scopeImageIds}
        source={currentRoute.source}
      />
    );
  } else if (currentRoute.name === 'import-images') {
    content = (
      <ImportImagesScreen
        defaultGroupId={currentRoute.groupId ?? null}
        initialMediaPicker={currentRoute.initialMediaPicker}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        taskToken={currentRoute.space === 'personal' ? personalSession?.taskToken ?? null : null}
        onBack={popRoute}
        onImported={(imageIds, importBatchId) => {
          refreshLibrary();
          replaceCurrentRoute({ name: 'import-result', ipId: currentRoute.ipId, imageIds, importBatchId, space: currentRoute.space });
        }}
      />
    );
  } else if (currentRoute.name === 'import-result') {
    content = (
      <ImportBatchReviewScreen
        imageIds={currentRoute.imageIds}
        importBatchId={currentRoute.importBatchId}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onBatchOrganize={(imageIds, initialMode) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId: currentRoute.ipId,
            space: currentRoute.space,
            source: 'all-images',
            importBatchId: currentRoute.importBatchId,
            scopeImageIds: imageIds,
            initialSelectedImageIds: imageIds,
            initialMode,
          })
        }
        onOpenDuplicateReview={(importBatchId) =>
          pushRoute({ name: 'duplicate-review', ipId: currentRoute.ipId, importBatchId, space: currentRoute.space })
        }
        onImportAgain={() => replaceCurrentRoute({ name: 'import-images', ipId: currentRoute.ipId, space: currentRoute.space })}
        onQuickOrganize={(importBatchId) => pushRoute({ name: 'quick-organize', ipId: currentRoute.ipId, importBatchId, space: currentRoute.space })}
        onOpenImageDetail={openImageDetail}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'import-batch-history') {
    content = (
      <ImportBatchHistoryScreen
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onOpenBatch={(batch) =>
          pushRoute({
            name: 'import-result',
            ipId: currentRoute.ipId,
            imageIds: [],
            importBatchId: batch.id,
            space: currentRoute.space,
          })
        }
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'duplicate-review') {
    content = (
      <DuplicateReviewScreen
        importBatchId={currentRoute.importBatchId ?? null}
        space={currentRoute.space}
        onBack={popRoute}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'all-images') {
    content = (
      <AllImagesScreen
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onImportImages={() => pushRoute({ name: 'import-images', ipId: currentRoute.ipId, space: currentRoute.space })}
        onStartBatchManagement={(imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId: currentRoute.ipId,
            space: currentRoute.space,
            source: 'all-images',
            initialSelectedImageIds: [imageId],
          })
        }
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'image-viewer') {
    content = (
      <ImageViewerScreen
        context={currentRoute.context}
        imageId={currentRoute.imageId}
        onBack={popRoute}
        onOpenDetail={(imageId) => openImageDetail(imageId, currentRoute.context)}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'image-detail') {
    content = (
      <ImageDetailScreen
        imageId={currentRoute.imageId}
        space={currentRoute.space}
        context={currentRoute.context}
        onBack={popRoute}
        onDeleted={popAndRefresh}
        onEdit={(imageId) => pushRoute({ name: 'edit-image', imageId, space: currentRoute.space })}
        onMoveGroup={(imageId) => pushRoute({ name: 'move-image-group', imageId, space: currentRoute.space })}
        onNavigateImage={(imageId, context) => replaceCurrentRoute({ name: 'image-detail', imageId, space: context?.space ?? currentRoute.space, context })}
        onRefreshed={() => setLibraryRefreshToken((current) => current + 1)}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'video-detail') {
    content = (
      <VideoDetailScreen
        videoId={currentRoute.videoId}
        space={currentRoute.space}
        onBack={popRoute}
        onDeleted={popAndRefresh}
        onEdit={(videoId) => pushRoute({ name: 'edit-media', imageId: videoId, space: currentRoute.space })}
        onPlay={(videoId) => pushRoute({ name: 'video-player', videoId, space: currentRoute.space })}
        onRefreshed={refreshLibrary}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'edit-media') {
    content = (
      <EditImageScreen
        imageId={currentRoute.imageId}
        space={currentRoute.space}
        refreshToken={libraryRefreshToken}
        onBack={popRoute}
        onSaved={popAndRefresh}
      />
    );
  } else if (currentRoute.name === 'video-player') {
    content = (
      <VideoPlayerScreen
        videoId={currentRoute.videoId}
        space={currentRoute.space}
        onBack={popRoute}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'external-video-player') {
    content = (
      <VideoPlayerScreen
        externalSource={{
          uri: currentRoute.uri,
          fileName: currentRoute.fileName,
          mimeType: currentRoute.mimeType ?? 'video/mp4',
          fileSize: currentRoute.fileSize ?? null,
        }}
        onBack={exitExternalEntry}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'archive-reader') {
    content = (
      <ArchiveReaderScreen
        archiveName={currentRoute.fileName}
        archiveUri={currentRoute.uri}
        onBack={exitExternalEntry}
      />
    );
  } else if (currentRoute.name === 'external-package-placeholder') {
    content = (
      <PlaceholderScreen
        description={`Pixory 资源包暂时需要在应用内导入。\n\n请先进入 Pixory，打开目标 IP，再使用“选择资源包”导入 ${currentRoute.fileName}。`}
        onBack={exitExternalEntry}
        title="资源包入口待接入"
      />
    );
  } else if (currentRoute.name === 'share-collect') {
    content = (
      <ShareCollectScreen
        items={currentRoute.items}
        onClose={exitShareEntry}
        onSaved={refreshLibrary}
      />
    );
  } else if (currentRoute.name === 'move-image-group') {
    content = (
      <MoveImageGroupScreen
        imageId={currentRoute.imageId}
        space={currentRoute.space}
        onBack={popRoute}
        onSaved={popAndRefresh}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'tag-result') {
    content = (
      <TagResultScreen
        onBack={popRoute}
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        onStartBatchManagement={(ipId, imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId,
            space: currentRoute.space,
            source: 'all-images',
            initialSelectedImageIds: [imageId],
          })
        }
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
        tagId={currentRoute.tagId}
      />
    );
  } else if (currentRoute.name === 'favorites') {
    content = (
      <FavoritesScreen
        onBack={popRoute}
        onOpenAiMessageFavorite={(favorite) =>
          openAiChatRoute(buildAiChatRouteFromFavorite(favorite, currentRoute.space))
        }
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        onStartBatchManagement={(ipId, imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId,
            space: currentRoute.space,
            source: 'all-images',
            initialSelectedImageIds: [imageId],
          })
        }
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'recent-viewed') {
    content = (
      <RecentViewedScreen
        onBack={popRoute}
        onOpenImage={openImageViewer}
        onOpenImageDetail={openImageDetail}
        onStartBatchManagement={(ipId, imageId) =>
          pushRoute({
            name: 'batch-manage-images',
            ipId,
            space: currentRoute.space,
            source: 'all-images',
            initialSelectedImageIds: [imageId],
          })
        }
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'quick-organize') {
    content = (
      <QuickOrganizeScreen
        importBatchId={currentRoute.importBatchId ?? null}
        ipId={currentRoute.ipId}
        space={currentRoute.space}
        onBack={popRoute}
        onChanged={refreshLibrary}
        onOpenImage={openImageViewer}
      />
    );
  } else if (currentRoute.name === 'global-search') {
    content = (
      <GlobalSearchScreen
        space={currentRoute.space}
        onBack={popRoute}
        onChangeQuery={setGlobalSearchQuery}
        onOpenGroup={(ipId, groupId) => pushRoute({ name: 'group-images', ipId, groupId, space: currentRoute.space })}
        onOpenImageDetail={(imageId) => pushRoute({ name: 'image-detail', imageId, space: currentRoute.space })}
        onOpenIp={(ipId) => pushRoute({ name: 'ip-detail', ipId, space: currentRoute.space })}
        onOpenTag={(tagId) => pushRoute({ name: 'tag-result', tagId, space: currentRoute.space })}
        query={globalSearchQuery}
      />
    );
  } else if (currentRoute.name === 'global-groups') {
    content = (
      <GlobalGroupsScreen
        space={currentRoute.space}
        onCreateFirstIp={() => pushRoute({ name: 'create-ip', space: currentRoute.space })}
        onOpenCoverPicker={(ipId, groupId) => pushRoute({ name: 'group-cover-picker', ipId, groupId, space: currentRoute.space })}
        onEditGroup={(ipId, groupId) => pushRoute({ name: 'edit-group', ipId, groupId, space: currentRoute.space })}
        onImportImagesToGroup={(ipId, groupId) => pushRoute({ name: 'import-images', ipId, groupId, initialMediaPicker: 'images', space: currentRoute.space })}
        onImportVideosToGroup={(ipId, groupId) => pushRoute({ name: 'import-images', ipId, groupId, initialMediaPicker: 'videos', space: currentRoute.space })}
        onOpenGroup={(ipId, groupId) => pushRoute({ name: 'group-images', ipId, groupId, space: currentRoute.space })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'tags-overview') {
    content = (
      <TagsOverviewScreen
        space={currentRoute.space}
        onOpenTag={(tagId) => pushRoute({ name: 'tag-result', tagId, space: currentRoute.space })}
        refreshToken={libraryRefreshToken}
      />
    );
  } else if (currentRoute.name === 'trash') {
    content = <GlobalTrashScreen onBack={popRoute} onChanged={refreshLibrary} refreshToken={libraryRefreshToken} space={currentRoute.space} storageMode={currentRoute.storageMode} />;
  } else if (currentRoute.name === 'backup') {
    content = (
      <BackupScreen
        onBack={popRoute}
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
        taskToken={currentRoute.space === 'personal' ? personalSession?.taskToken ?? null : null}
      />
    );
  } else if (currentRoute.name === 'storage-usage') {
    content = (
      <StorageUsageScreen
        onBack={popRoute}
        onOpenBackups={() => pushRoute({ name: 'backup-export-manager', space: currentRoute.space })}
        onOpenOriginals={() => pushRoute({ name: 'original-storage', space: currentRoute.space })}
        onOpenTrash={() => pushRoute({ name: 'trash', space: currentRoute.space, storageMode: true })}
        onOpenChatStorage={() => pushRoute({ name: 'chat-storage-usage', space: currentRoute.space })}
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'chat-storage-usage') {
    content = (
      <ChatStorageUsageScreen
        onBack={popRoute}
        onOpenChat={(threadId) => pushRoute({ name: 'ai-chat', threadId, space: currentRoute.space })}
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'about') {
    content = <AboutScreen onBack={popRoute} onPushRoute={pushRoute} space={currentRoute.space} />;
  } else if (currentRoute.name === 'original-storage') {
    content = (
      <OriginalStorageScreen
        onBack={popRoute}
        onOpenIp={(ipId) => pushRoute({ name: 'ip-storage-detail', ipId, space: currentRoute.space })}
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'ip-storage-detail') {
    content = (
      <IpStorageDetailScreen
        ipId={currentRoute.ipId}
        onBack={popRoute}
        onOpenImage={(imageId) => pushRoute({ name: 'image-detail', imageId, space: currentRoute.space })}
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'backup-export-manager') {
    content = (
      <BackupExportManagerScreen
        onBack={popRoute}
        refreshToken={libraryRefreshToken}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'ai-chat') {
    content = (
      <AiChatScreen
        key={aiChatRouteKey(currentRoute, routeStack.length)}
        composerEntranceKey={currentRoute.routeKey}
        composerEntranceReason={currentRoute.composerEntranceReason ?? 'replace_current'}
        contextTitle={currentRoute.contextTitle}
        contextType={currentRoute.contextType ?? 'normal'}
        boundIpId={currentRoute.ipId}
        boundKnowledgeBaseId={currentRoute.knowledgeBaseId}
        includeIpDocuments={currentRoute.includeIpDocuments}
        branchTreeSelection={currentRoute.branchTreeSelection}
        onOpenHistory={() => pushRoute({ name: 'ai-history', space: currentRoute.space })}
        onOpenRoleLibrary={() => pushRoute({ name: 'ai-role-library', space: currentRoute.space })}
        onOpenGlobalMaterials={() => pushRoute({ name: 'ai-material-list', space: currentRoute.space })}
        onOpenSessionConfig={(threadId) =>
          pushRoute({
            name: 'ai-session-config',
            contextTitle: currentRoute.contextTitle,
            contextType: currentRoute.contextType,
            space: currentRoute.space,
            threadId,
          })
        }
        onOpenMemoryBoard={(threadId) => pushRoute({ name: 'ai-memory-board', space: currentRoute.space, threadId })}
        onOpenDiary={(diaryId, versionId) => pushRoute({ name: 'diary-reader', space: currentRoute.space, diaryId, versionId })}
        onOpenDream={(dreamId) => pushRoute({ name: 'dream-reader', space: currentRoute.space, dreamId })}
        onNewChat={() => openNewAiChat(currentRoute.space)}
        onOpenThread={(thread) =>
          openAiChatRoute({
            name: 'ai-chat',
            composerEntranceReason: 'open_thread',
            contextTitle: thread.title,
            contextType: thread.contextType,
            includeIpDocuments: thread.includeIpDocuments,
            ipId: thread.boundIpId ?? undefined,
            knowledgeBaseId: thread.boundKnowledgeBaseId ?? undefined,
            space: currentRoute.space,
            threadId: thread.id,
          })
        }
        onOpenImageSource={(imageId) => pushRoute({ name: 'image-detail', imageId, space: currentRoute.space })}
        onOpenIpSource={(ipId) => pushRoute({ name: 'ip-detail', ipId, space: currentRoute.space })}
        onOpenSource={(documentId, title, locator) => pushRoute({ name: 'ai-document-reader', documentId, locator, title, space: currentRoute.space })}
        onThreadReady={(threadId) => updateCurrentAiChatRoute({ threadId }, currentRoute.routeKey)}
        onThreadTitleChange={(title) => updateCurrentAiChatRoute({ contextTitle: title }, currentRoute.routeKey)}
        modelRefreshKey={currentRoute.modelRefreshKey}
        searchTargetBranchScopes={currentRoute.searchTargetBranchScopes}
        searchTargetKey={currentRoute.searchTargetKey}
        searchTargetMessageId={currentRoute.searchTargetMessageId}
        space={currentRoute.space}
        threadId={currentRoute.threadId}
      />
    );
  } else if (currentRoute.name === 'diary-reader') {
    content = <DiaryReaderScreen diaryId={currentRoute.diaryId} onBack={popRoute} space={currentRoute.space} versionId={currentRoute.versionId} />;
  } else if (currentRoute.name === 'ai-branch-tree') {
    const previousRoute = routeStack[routeStack.length - 2];
    content = (
      <AiBranchTreeScreen
        currentBranchScopes={currentRoute.currentBranchScopes}
        onBack={popRoute}
        onCheckoutBranch={async (selection) => {
          const adoptedSelection = await adoptBranchSelection({
            branchRootMessageId: selection.branchRootMessageId,
            branchVersionIndex: selection.branchVersionIndex,
            space: currentRoute.space,
            threadId: currentRoute.threadId,
          });
          const nextRoute = buildAiChatRouteFromBranchTree(currentRoute, adoptedSelection, previousRoute);
          setRouteStack((current) => [...current.slice(0, -1), nextRoute]);
        }}
        onDeriveBranch={(selection) => {
          const nextRoute = buildAiChatRouteFromBranchTree(currentRoute, selection, previousRoute);
          setRouteStack((current) => [...current.slice(0, -1), nextRoute]);
        }}
        space={currentRoute.space}
        threadId={currentRoute.threadId}
      />
    );
  } else if (currentRoute.name === 'ai-chat-search') {
    const previousRoute = routeStack[routeStack.length - 2];
    content = (
      <AiChatSearchScreen
        branchScopes={currentRoute.branchScopes}
        contextTitle={currentRoute.contextTitle}
        onBack={popRoute}
        onSelectResult={(result, branchScopes) => {
          const nextRoute = buildAiChatRouteFromSearch(currentRoute, result, branchScopes, previousRoute);
          setRouteStack((current) => [...current.slice(0, -1), nextRoute]);
        }}
        space={currentRoute.space}
        threadId={currentRoute.threadId}
      />
    );
  } else if (currentRoute.name === 'ai-session-config') {
    content = (
      <AiSessionConfigScreen
        contextTitle={currentRoute.contextTitle}
        contextType={currentRoute.contextType}
        onBack={popRoute}
        onCurrentThreadDeleted={() => closeDeletedAiThread(currentRoute.threadId)}
        onOpenProviderSettings={() => pushRoute({ name: 'ai-provider-settings', space: currentRoute.space })}
        onOpenRoleLibrary={() => pushRoute({ name: 'ai-role-library', space: currentRoute.space, threadId: currentRoute.threadId, mode: 'apply_to_thread' })}
        onOpenBranchTree={
          currentRoute.threadId
            ? () =>
                pushRoute({
                  name: 'ai-branch-tree',
                  contextTitle: currentRoute.contextTitle,
                  contextType: currentRoute.contextType,
                  space: currentRoute.space,
                  threadId: currentRoute.threadId as string,
                })
            : undefined
        }
        onOpenThreadMaterials={
          currentRoute.threadId
            ? () => pushRoute({ name: 'ai-thread-material-list', space: currentRoute.space, threadId: currentRoute.threadId as string, title: currentRoute.contextTitle })
            : undefined
        }
        onOpenChatSearch={
          currentRoute.threadId
            ? () => pushRoute({ name: 'ai-chat-search', contextTitle: currentRoute.contextTitle, contextType: currentRoute.contextType, space: currentRoute.space, threadId: currentRoute.threadId as string })
            : undefined
        }
        onOpenMemoryBoard={
          currentRoute.threadId
            ? () => pushRoute({ name: 'ai-memory-board', space: currentRoute.space, threadId: currentRoute.threadId as string })
            : undefined
        }
        onOpenInnerLife={
          currentRoute.threadId
            ? () => pushRoute({ name: 'companion-inner-life', space: currentRoute.space, threadId: currentRoute.threadId as string })
            : undefined
        }
        onOpenCompanionRuntime={
          currentRoute.threadId
            ? () => pushRoute({ name: 'companion-runtime-manager', space: currentRoute.space, threadId: currentRoute.threadId as string })
            : undefined
        }
        onStartChat={popRoute}
        space={currentRoute.space}
        threadId={currentRoute.threadId}
      />
    );
  } else if (currentRoute.name === 'ai-memory-board') {
    content = <AiMemoryBoardScreen onBack={popRoute} space={currentRoute.space} threadId={currentRoute.threadId} />;
  } else if (currentRoute.name === 'dream-reader') {
    content = <DreamReaderScreen dreamId={currentRoute.dreamId} onBack={popRoute} space={currentRoute.space} />;
  } else if (currentRoute.name === 'companion-inner-life') {
    content = <CompanionInnerLifeScreen onBack={popRoute} onOpenDiary={(diaryId, versionId) => pushRoute({ name: 'diary-reader', space: currentRoute.space, diaryId, versionId })} onOpenDream={(dreamId) => pushRoute({ name: 'dream-reader', space: currentRoute.space, dreamId })} space={currentRoute.space} threadId={currentRoute.threadId} />;
  } else if (currentRoute.name === 'companion-runtime-manager') {
    content = <CompanionRuntimeManagerScreen onBack={popRoute} space={currentRoute.space} threadId={currentRoute.threadId} />;
  } else if (currentRoute.name === 'milestones-detail') {
    content = <MilestonesDetailScreen onBack={popRoute} onPushRoute={pushRoute} space={currentRoute.space} preloadedMarkdown={currentRoute.preloadedMarkdown} />;
  } else if (currentRoute.name === 'product-doc') {
    content = <ProductDocumentationScreen onBack={popRoute} preloadedMarkdown={currentRoute.preloadedMarkdown} />;
  } else if (currentRoute.name === 'ai-provider-settings') {
    content = <AiProviderSettingsScreen onBack={popRoute} space={currentRoute.space} />;
  } else if (currentRoute.name === 'ai-role-library') {
    content = (
      <AiRoleLibraryScreen
        onBack={popRoute}
        onCreateRole={() => pushRoute({ name: 'ai-role-card-editor', space: currentRoute.space, threadId: currentRoute.threadId })}
        onImportRole={() => pushRoute({ name: 'ai-role-card-editor', space: currentRoute.space, threadId: currentRoute.threadId })}
        onApplyRoleToThread={(roleCardId) => applyRoleToCurrentThread(currentRoute.space, currentRoute.threadId, roleCardId)}
        onOpenRoleDetail={(roleCardId) => pushRoute({ name: 'ai-role-card-detail', roleCardId, space: currentRoute.space, threadId: currentRoute.threadId, mode: currentRoute.mode })}
        onStartChatWithRole={(roleCardId) => startChatWithRoleCard(currentRoute.space, roleCardId)}
        mode={currentRoute.mode ?? 'library'}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'ai-role-card-detail') {
    content = (
      <AiRoleCardDetailScreen
        onBack={popRoute}
        onEditRole={(roleCardId) => pushRoute({ name: 'ai-role-card-editor', roleCardId, space: currentRoute.space, threadId: currentRoute.threadId })}
        onApplyRoleToThread={(roleCardId) => applyRoleToCurrentThread(currentRoute.space, currentRoute.threadId, roleCardId)}
        onStartChatWithRole={(roleCardId) => startChatWithRoleCard(currentRoute.space, roleCardId)}
        mode={currentRoute.mode ?? 'library'}
        roleCardId={currentRoute.roleCardId}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'ai-role-card-editor') {
    content = (
      <AiRoleCardEditorScreen
        onApplyRoleCard={popRoute}
        onBack={popRoute}
        onStartChatWithRole={(roleCardId) => startChatWithRoleCard(currentRoute.space, roleCardId)}
        roleCardId={currentRoute.roleCardId}
        space={currentRoute.space}
        threadId={currentRoute.threadId}
      />
    );
  } else if (currentRoute.name === 'ai-ip-picker') {
    content = (
      <AiIpPickerScreen
        onBack={popRoute}
        onSelectIp={(ipId, title, includeIpDocuments) =>
          pushRoute({
            name: 'ai-chat',
            contextTitle: title,
            contextType: 'ip',
            includeIpDocuments,
            ipId,
            space: currentRoute.space,
          })
        }
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'ai-knowledge-base') {
    content = (
      <AiKnowledgeBaseScreen
        onBack={popRoute}
        onImportMaterial={(knowledgeBaseId) => pushRoute({ name: 'ai-material-import', knowledgeBaseId, space: currentRoute.space })}
        onOpenMaterials={(knowledgeBaseId) => pushRoute({ name: 'ai-material-list', knowledgeBaseId, space: currentRoute.space })}
        onStartChat={(knowledgeBaseId, title) =>
          pushRoute({
            name: 'ai-chat',
            contextTitle: title,
            contextType: 'knowledge_base',
            knowledgeBaseId,
            space: currentRoute.space,
          })
        }
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'ai-material-import') {
    content = <AiMaterialImportScreen initialSource={currentRoute.initialSource} knowledgeBaseId={currentRoute.knowledgeBaseId} onBack={popRoute} space={currentRoute.space} threadId={currentRoute.threadId} />;
  } else if (currentRoute.name === 'ai-material-list') {
    content = (
      <AiMaterialListScreen
        knowledgeBaseId={currentRoute.knowledgeBaseId}
        onBack={popRoute}
        onOpenDocument={(documentId, title) => pushRoute({ name: 'ai-document-reader', documentId, title, space: currentRoute.space })}
        onOpenThreadMaterials={(threadId, title) => pushRoute({ name: 'ai-thread-material-list', space: currentRoute.space, threadId, title })}
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'ai-thread-material-list') {
    content = (
      <AiMaterialListScreen
        onBack={popRoute}
        onImportMaterial={(threadId, source) => pushRoute({ name: 'ai-material-import', initialSource: source, space: currentRoute.space, threadId })}
        onOpenDocument={(documentId, title) => pushRoute({ name: 'ai-document-reader', documentId, title, space: currentRoute.space })}
        space={currentRoute.space}
        threadId={currentRoute.threadId}
      />
    );
  } else if (currentRoute.name === 'ai-document-reader') {
    content = <AiDocumentReaderScreen documentId={currentRoute.documentId} locator={currentRoute.locator} onBack={popRoute} space={currentRoute.space} title={currentRoute.title} />;
  } else if (currentRoute.name === 'ai-history') {
    content = (
      <AiHistoryScreen
        onBack={popRoute}
        onOpenThread={(thread) =>
          openAiChatRoute({
            name: 'ai-chat',
            composerEntranceReason: 'open_thread',
            contextTitle: thread.title,
            contextType: thread.contextType,
            includeIpDocuments: thread.includeIpDocuments,
            ipId: thread.boundIpId ?? undefined,
            knowledgeBaseId: thread.boundKnowledgeBaseId ?? undefined,
            space: currentRoute.space,
            threadId: thread.id,
          })
        }
        space={currentRoute.space}
      />
    );
  } else if (currentRoute.name === 'placeholder') {
    content = <PlaceholderScreen description={currentRoute.description} onBack={popRoute} title={currentRoute.title} />;
  } else if (currentRoute.name === 'import-development') {
    content = isDevToolsEnabled ? (
      <ImportDevelopmentScreen onBack={popRoute} />
    ) : (
      <PlaceholderScreen
        description="这个入口仅用于开发回归，非开发环境下不会显示。"
        onBack={popRoute}
        title="开发入口不可用"
      />
    );
  } else if (currentRoute.name === 'root') {
    // Root tabs are always mounted via rootTabContent above the overlay layer.
    // No overlay content is needed when the user is at the root level.
    content = null;
  }

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
      <KeyboardProvider>
      <AppToastProvider>
        <AppUpdateAppliedNotice isReady={isReady} />
        <AppOtaUpdateFetchNotice isReady={isReady} />
        <View style={{ flex: 1 }}>
          {/* Always-mounted base layer: root tab pager stays alive under overlays */}
          {rootTabContent}
          {/* Overlay: pushed screens sit on top via absoluteFill so the base layer survives */}
          {content != null ? (
            <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
              {content}
            </View>
          ) : null}
          {/* Tab bar: only show when no overlay is covering the base layer */}
          {content == null && baseRootRoute ? (
            <FloatingRootFooter activeTab={baseRootRoute.tab} onSelectTab={switchRootTab} />
          ) : null}
        </View>
        <PersonalUnlockModal
          hasCredential={personalCredentialAvailable}
          loading={personalAuthBusy}
          onChangePassword={updatePersonalPassword}
          onClose={() => setPersonalUnlockVisible(false)}
          onResetPersonalData={resetPersonalDataFromSettings}
          onSetup={setupPersonalSpace}
          onUnlock={unlockPersonalSpace}
          visible={personalUnlockVisible}
        />
        <AppDialog
          actionLayout="primaryThenSplit"
          backgroundVariant="home"
          compactActions
          message={availableUpdate?.message}
          onClose={() => setAvailableUpdate(null)}
          onPrimary={openAvailableUpdate}
          primaryLabel="去更新"
          secondaryLabel="稍后"
          tertiaryLabel="跳过此版本"
          onTertiary={skipAvailableUpdate}
          title={availableUpdate?.title ?? '发现 Pixory 新版本'}
          visible={Boolean(availableUpdate)}
        >
          {availableUpdate?.releaseNotes.length ? (
            <View style={styles.updateNotes}>
              <Text style={styles.updateVersion}>最新版本 {availableUpdate.version}</Text>
              {availableUpdate.releaseNotes.map((note) => (
                <Text key={note} style={styles.updateNote}>
                  {note}
                </Text>
              ))}
            </View>
          ) : availableUpdate ? (
            <Text style={styles.updateVersion}>最新版本 {availableUpdate.version}</Text>
          ) : null}
        </AppDialog>
        <AppDialog
          message={availableAnnouncement?.message}
          onClose={dismissAvailableAnnouncement}
          onPrimary={dismissAvailableAnnouncement}
          primaryLabel={availableAnnouncement?.actionLabel ?? '知道了'}
          secondaryLabel="关闭"
          title={availableAnnouncement?.title ?? '公告'}
          visible={Boolean(availableAnnouncement) && !availableUpdate}
        >
          {availableAnnouncement?.detailLines.length ? (
            <View style={styles.updateNotes}>
              {availableAnnouncement.detailLines.map((line) => (
                <Text key={line} style={styles.updateNote}>
                  {line}
                </Text>
              ))}
            </View>
          ) : null}
        </AppDialog>
        {personalSessionState === 'unlocked' ? <PersonalModeBanner /> : null}
        {privacyShieldVisible ? (
          <View style={styles.privacyShield}>
            <Text style={styles.privacyShieldText}>Pixory</Text>
          </View>
        ) : null}
        <StatusBar style="dark" />
      </AppToastProvider>
      </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function FloatingFooterProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const floatingFooterHeight = spacing[2] + Math.max(58, componentTokens.bottomTab.height - 10) + insets.bottom + layout.stickyFooterBottomOffset;
  return <FloatingFooterContext.Provider value={floatingFooterHeight}>{children}</FloatingFooterContext.Provider>;
}

function FloatingRootFooter({ activeTab, onSelectTab }: { activeTab: RootTabKey; onSelectTab: (tab: RootTabKey) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: layout.pagePaddingHorizontal,
        paddingBottom: insets.bottom + layout.stickyFooterBottomOffset,
      }}
    >
      <BottomTabBar activeTab={activeTab} onSelectTab={onSelectTab} />
    </View>
  );
}

function AppUpdateAppliedNotice({ isReady }: { isReady: boolean }) {
  const { showToast } = useToast();
  const notifiedUpdateIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady || !Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.updateId) {
      return undefined;
    }

    const updateId = Updates.updateId;
    if (notifiedUpdateIdRef.current === updateId) {
      return undefined;
    }

    let isMounted = true;
    void runWithDatabaseSpace('normal', async (db) => {
      const lastNoticeId = await settingsRepository.getLastAppliedUpdateNoticeId(db);
      if (lastNoticeId === updateId) {
        return false;
      }
      await settingsRepository.setLastAppliedUpdateNoticeId(db, updateId);
      return true;
    })
      .then((shouldShowNotice) => {
        if (!isMounted || !shouldShowNotice) {
          return;
        }
        notifiedUpdateIdRef.current = updateId;
        showToast({
          durationMs: APPLIED_UPDATE_NOTICE_DURATION_MS,
          message: '已在后台热更新',
          tone: 'success',
        });
      })
      .catch((error) => {
        console.warn('Pixory applied update notice failed.', {
          message: error instanceof Error ? error.message : 'unknown applied update notice error',
        });
      });

    return () => {
      isMounted = false;
    };
  }, [isReady, showToast]);

  return null;
}

function AppOtaUpdateFetchNotice({ isReady }: { isReady: boolean }) {
  const { showToast } = useToast();
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (!isReady || !Updates.isEnabled || hasCheckedRef.current) {
      return undefined;
    }

    hasCheckedRef.current = true;
    let isMounted = true;
    void Updates.checkForUpdateAsync()
      .then(async (checkResult) => {
        if (!isMounted || !checkResult.isAvailable) {
          return;
        }
        showToast({
          durationMs: OTA_UPDATE_FETCH_NOTICE_DURATION_MS,
          message: '发现热更新，正在后台更新',
          tone: 'info',
        });

        const fetchResult = await Updates.fetchUpdateAsync();
        if (!isMounted || (!fetchResult.isNew && !fetchResult.isRollBackToEmbedded)) {
          return;
        }
        showToast({
          durationMs: OTA_UPDATE_FETCH_NOTICE_DURATION_MS,
          message: '热更新已准备好，下次打开生效',
          tone: 'success',
        });
      })
      .catch((error) => {
        console.warn('Pixory OTA update fetch notice failed.', {
          message: error instanceof Error ? error.message : 'unknown OTA update fetch notice error',
        });
      });

    return () => {
      isMounted = false;
    };
  }, [isReady, showToast]);

  return null;
}

function PersonalModeBanner() {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="none" style={[styles.personalBanner, { top: insets.top }]}>
      <Text style={styles.personalBannerText}>隐私模式</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
    backgroundColor: colors.background.page,
  },
  stateScreen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing[4],
    padding: spacing[6],
    width: '100%',
  },
  title: {
    ...typography.textStyles.navTitle,
    textAlign: 'center',
  },
  message: {
    ...typography.textStyles.body,
    textAlign: 'center',
  },
  personalBanner: {
    alignItems: 'center',
    backgroundColor: colors.primary.active,
    borderRadius: 999,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    position: 'absolute',
    right: spacing[3],
    top: spacing[3],
  },
  personalBannerText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
  },
  privacyShield: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: colors.background.page,
    justifyContent: 'center',
    zIndex: 1000,
  },
  privacyShieldText: {
    ...typography.textStyles.navTitle,
    color: colors.text.title,
  },
  updateNotes: {
    gap: spacing[2],
  },
  updateVersion: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  updateNote: {
    ...typography.textStyles.body,
    color: colors.text.body,
    lineHeight: 22,
  },
});
