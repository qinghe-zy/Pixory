import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useReducer,
} from "react";
import {
  AccessibilityInfo,
  Alert,
  Animated,
  AppState,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PermissionsAndroid,
  Platform,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  ViewToken,
  View,
  Modal,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Live2DPetView,
  type Live2DPetViewRef,
} from "../components/ai/Live2DPetView";
import { PET_MODELS } from "../config/petModels";
import {
  AiChatComposer,
  type AiComposerAttachment,
} from "../components/ai/AiChatComposer";
import { AiChatErrorBanner } from "../components/ai/AiChatErrorBanner";
import { AiComprehensiveRecordDrawer } from "../components/ai/AiComprehensiveRecordDrawer";
import type { AiVoiceInputState } from "../components/ai/AiVoiceInputStatus";
import {
  aiLightColors,
  aiLightDisplayFont,
} from "../components/ai/aiLightTheme";
import { AiMemoryCaptureNotice } from "../components/ai/AiMemoryCaptureNotice";
import { AiCitationList } from "../components/ai/AiCitationList";
import {
  AiMessageBubble,
  AiMessageFooterActions,
} from "../components/ai/AiMessageBubble";
import { AiStreamingTailSpacer } from "../components/ai/AiStreamingTailSpacer";
import { AiStreamingTailContinuationBubble } from "../components/ai/AiStreamingTailContinuationBubble";
import { AiStreamingTailMessageSegment } from "../components/ai/AiStreamingTailMessageSegment";
import { SecureImage } from "../components/SecureImage";
import { AiScrollToLatestButton } from "../components/ai/AiScrollToLatestButton";
import { AppScreen } from "../components/AppScreen";
import { recognizeSpeech } from "../native/pixoryMediaModule";
import {
  deleteMemory,
  dismissMemoryCapture,
  listRecentMemoryCaptures,
  markMemoryInaccurate,
  replaceRecentMemoryCaptures,
  updateMemoryContent,
  type MemoryCaptureNoticeItem,
} from "../ai/aiMemoryService";
import {
  createThreadFromContext,
  DEFAULT_AI_USER_AVATAR_ENABLED,
  deleteAiThreads,
  flushStreamingMessageSnapshot,
  getCurrentChatModelLabel,
  getCurrentChatModelIconBrand,
  listThreadMessages,
  loadThreadContinuityMilestones,
  loadThreadMessageAppearanceConfig,
  loadThreadTitle,
  listAiHistoryThreads,
  renameAiThread,
  rollbackThreadContinuityImport,
  listFavoriteAssistantMessageKeys,
  toggleAssistantMessageFavorite,
  type AiMessageWithCitations,
  type AiStreamingMessagePatch,
} from "../ai/aiChatService";
import type { AiModelIconBrand } from "../ai/aiModelIconService";
import {
  aiGenerationManager,
  type AiGenerationSubscriber,
} from "../ai/aiGenerationManager";
import {
  getActiveBranchForNextMessageFromVisibleMessages,
  getSelectedMessageVersionIndex as resolveSelectedMessageVersionIndex,
  messageMatchesSelectedBranchPath,
} from "../ai/aiBranching";
import { buildBranchSelectionMap } from "../ai/aiBranchTreeService";
import {
  createComposerEntranceRun,
  isCurrentComposerEntranceRun,
  shouldStartComposerEntrance,
  type ComposerEntranceReason,
  type ComposerEntranceRun,
} from "../ai/aiComposerEntrancePolicy";
import {
  clearStreamingMessage,
  getStreamingMessageSnapshot,
  publishStreamingMessage,
  type AiStreamingMessageIdentity,
} from "../ai/aiStreamingMessageStore";
import {
  groupPromotedStreamingTailBlocks,
  type AiStreamingTailContinuationGroup,
} from "../ai/aiStreamingTailContinuation";
import {
  calculateRemainingStreamingTailHeight,
  calculateEffectiveTotalReservedHeight,
  createEmptyStreamingTailState,
  mergeStreamingTailPatch,
  promoteStreamingTailBlocks,
  settleStreamingTailShrinkDebt,
  startStreamingTailDetach,
  updateStreamingTailBlockMeasurement,
  type AiStreamingTailState,
} from "../ai/aiStreamingTailModel";
import {
  getAssistantBubbleContentWidthFallback,
  getLatestAssistantBubbleContentWidth,
} from "../ai/aiStreamingBubbleWidthRegistry";
import {
  deriveStreamingTailViewportPolicy,
  type StreamingTailViewportPolicy,
} from "../ai/aiStreamingTailViewportPolicy";
import { streamingTailPerfDebug } from "../ai/aiStreamingPerfDebug";
import {
  getAiTailReplaySingleBubbleEnabled,
  refreshAiTailReplaySingleBubbleEnabled,
} from "../ai/aiStreamingTailFeatureFlags";
import {
  buildTailMessageSegments,
  createTailDebtSpacer,
  footerVisible,
  getTailReplayItemKey,
  selectVisibleMessage,
  shouldPayoffDebt,
  stitchTailSegmentEdgeAfterFrozenPrefix,
  type AiTailDebtSpacerItem,
  type AiTailMessageSegment,
  type AiTailSegmentEdge,
} from "../ai/aiStreamingTailRenderContract";
import {
  clearComposerDraft,
  getComposerDraft,
  setComposerDraft,
} from "../ai/aiComposerDraftService";
import type { AiCitationRecord, AiContextType } from "../ai/types";
import type { AiDocumentReaderLocator } from "../ai/readers/readerTypes";
import {
  aiThreadRepository,
  runWithDatabaseSpace,
  settingsRepository,
  type PixorySpace,
} from "../database";
import type {
  AiBranchScope,
  AiThreadContinuityMilestoneRecord,
  AiThreadHistoryItem,
} from "../database/repositories/aiThreadRepository";
import {
  layout,
  radius,
  rhythm,
  shadows,
  spacing,
  typography,
} from "../design/tokens";

const MESSAGE_STREAM_FOLLOW_THRESHOLD = 48;
const MESSAGE_SCROLL_BUTTON_THRESHOLD = 2400;
const MESSAGE_SAFE_FLUSH_OFFSET = 1;
const STICK_TO_BOTTOM_OFFSET_PX = 70;
const USER_SCROLL_IDLE_TIMEOUT_MS = 150;
const SHRINK_DEBOUNCE_MS = 150;
const SHRINK_STABLE_DELAY_MS = 200;
const RETAIN_RECONCILE_WINDOW_MS = 350;
const MESSAGE_LIST_ANCHOR_CONFIG = { minIndexForVisible: 0 };
const CHAT_MESSAGE_PAGE_SIZE = 60;
const COMPOSER_ENTRANCE_DURATION_MS = 500;
const COMPOSER_FOCUS_VISIBILITY_DELAYS_MS = [80, 260];
const ACTIVE_LATEST_JUMP_RETRY_DELAYS_MS = [80, 260, 520];
const BRANCH_TREE_SCROLL_RETRY_DELAYS_MS = [80, 260, 520];
const SEARCH_SCROLL_RETRY_DELAYS_MS = [80, 260, 520, 900, 1400, 2200, 3400];
const SEARCH_HIGHLIGHT_DURATION_MS = 1800;
const INLINE_EDIT_VISIBILITY_SCROLL_DELAYS_MS = [80, 320];
const INLINE_EDIT_SCROLL_RETRY_DELAY_MS = 120;
const DRAWER_SWIPE_ACTIVATION_DISTANCE = 6;
const DRAWER_SWIPE_RELEASE_DISTANCE = 10;
const DRAWER_SWIPE_HORIZONTAL_RATIO = 1.2;
// Pixel-level badge alignment; spacing tokens are too coarse for this small overlay.
const NEW_CHAT_BADGE_OFFSET = 1;
// Scroll affordance copy: 回到最新.

const CHAT_DOCUMENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "*/*",
];

function getFileNameFromUri(uri: string, fallback: string): string {
  const rawName = uri.split(/[\\/]/).pop()?.split("?")[0]?.trim();
  return rawName ? decodeURIComponent(rawName) : fallback;
}

function describeAttachmentKind(kind: AiComposerAttachment["kind"]): string {
  if (kind === "image") {
    return "图片";
  }
  return "文档";
}

function buildChatMessageContent(
  text: string,
  attachments: AiComposerAttachment[],
): string {
  if (!attachments.length) {
    return text;
  }
  const attachmentLines = attachments.map((attachment) => {
    const type = attachment.mimeType ? `，类型：${attachment.mimeType}` : "";
    return `- ${describeAttachmentKind(attachment.kind)}：${attachment.name}${type}`;
  });
  return [
    text || "请根据以下附件继续对话。",
    "",
    "[附件]",
    ...attachmentLines,
  ].join("\n");
}

function createStreamingAssistantMessage(
  threadId: string,
  assistantMessageId: string,
): AiMessageWithCitations {
  const now = new Date().toISOString();
  return {
    branchRootMessageId: null,
    branchVersionIndex: null,
    citations: [],
    completedAt: null,
    continuityImportSessionId: null,
    continuitySyntheticKind: null,
    content: "",
    createdAt: now,
    errorMessage: null,
    id: assistantMessageId,
    messageVersions: [],
    modelId: null,
    modelSnapshotJson: "",
    promptSnapshotJson: "",
    providerId: null,
    reasoningText: null,
    role: 'assistant',
    status: 'generating',
    threadId,
    updatedAt: now,
    versionIndex: 0,
    versionTotal: 1,
  };
}

function applyStreamingPatchToMessage(
  message: AiMessageWithCitations,
  patch: AiStreamingMessagePatch,
): AiMessageWithCitations {
  return {
    ...message,
    status: patch.status ?? message.status,
    content: patch.content ?? message.content,
    reasoningText:
      patch.reasoningText === undefined
        ? message.reasoningText
        : patch.reasoningText,
    errorMessage:
      patch.errorMessage === undefined
        ? message.errorMessage
        : patch.errorMessage,
    providerId:
      patch.providerId === undefined ? message.providerId : patch.providerId,
    modelId: patch.modelId === undefined ? message.modelId : patch.modelId,
    modelSnapshotJson: patch.modelSnapshotJson ?? message.modelSnapshotJson,
    promptSnapshotJson: patch.promptSnapshotJson ?? message.promptSnapshotJson,
    createdAt: patch.createdAt ?? message.createdAt,
    completedAt:
      patch.completedAt === undefined ? message.completedAt : patch.completedAt,
    citations: patch.citations ?? message.citations,
    updatedAt: patch.completedAt ?? new Date().toISOString(),
  };
}

function formatDateSeparator(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  if (startOfDate === startOfToday) {
    return "今天";
  }
  if (startOfDate === startOfToday - 24 * 60 * 60 * 1000) {
    return "昨天";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getAiChatGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) {
    return "今天想聊点什么？";
  }
  if (hour < 18) {
    return "现在想聊点什么？";
  }
  return "今晚想聊点什么？";
}

const STARTER_SUGGESTIONS = [
  "整理这段资料",
  "帮我发散想法",
  "总结当前设定",
] as const;

function shouldShowDateSeparator(
  messages: AiMessageWithCitations[],
  index: number,
): boolean {
  if (index <= 0) {
    return true;
  }
  const current = new Date(messages[index]?.createdAt ?? "");
  const previous = new Date(messages[index - 1]?.createdAt ?? "");
  return (
    current.getFullYear() !== previous.getFullYear() ||
    current.getMonth() !== previous.getMonth() ||
    current.getDate() !== previous.getDate()
  );
}

function messageHasContextTrim(message: AiMessageWithCitations): boolean {
  try {
    const snapshot = message.promptSnapshotJson
      ? JSON.parse(message.promptSnapshotJson)
      : null;
    return Boolean(
      snapshot?.contextTrimmedByBudget ||
      snapshot?.contextTrimmedByCount ||
      snapshot?.contextTrimmed,
    );
  } catch {
    return false;
  }
}

type VisibleMessageItem =
  | {
      id: string;
      type: 'message';
      message: AiMessageWithCitations;
      showAvatar: boolean;
      showUserAvatar: boolean;
      showDateSeparator: boolean;
    }
  | {
      type: "streamTailSpacer";
      id: string;
      height: number;
    }
  | AiTailMessageSegment
  | AiTailDebtSpacerItem
  | {
      type: "streamTailContinuation";
      id: string;
      group: AiStreamingTailContinuationGroup;
    };

type ActiveStreamingIdentity = AiStreamingMessageIdentity;

type MessageFavoriteIdentity = {
  branchScopes: AiBranchScope[];
  key: string;
  messageVersionIndex?: number;
};

type ReloadMessagesOptions = {
  anchorMessageId?: string;
  branchScopes?: AiBranchScope[];
  forceToLatest?: boolean;
  limitOverride?: number;
};

type ActiveContinuityMilestone = AiThreadContinuityMilestoneRecord & {
  label: string;
  detailLines: string[];
};

function formatMinute(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function continuitySourceLabel(
  sourceKind: AiThreadContinuityMilestoneRecord["sourceKind"],
): string {
  return sourceKind === "pixory_native_markdown"
    ? "Pixory 原生连续性"
    : "外部连续性文档";
}

function continuityReviewLabel(
  reviewGateState: AiThreadContinuityMilestoneRecord["reviewGateState"],
): string {
  if (reviewGateState === "accepted" || reviewGateState === "not_required") {
    return "记忆审读：已通过";
  }
  if (reviewGateState === "failed") {
    return "记忆审读：未通过";
  }
  if (reviewGateState === "pending_review") {
    return "记忆审读：待审读";
  }
  return "记忆审读：不可用";
}

const shouldUseLiveStreamingPatch = (patch: AiStreamingMessagePatch) => {
  return (
    patch.status === "generating" &&
    patch.errorMessage === undefined &&
    patch.providerId === undefined &&
    patch.modelId === undefined &&
    patch.modelSnapshotJson === undefined &&
    patch.promptSnapshotJson === undefined &&
    patch.createdAt === undefined &&
    patch.completedAt === undefined &&
    patch.citations === undefined
  );
};

function findLatestAssistantMessage(
  messages: AiMessageWithCitations[],
): AiMessageWithCitations | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      return messages[index];
    }
  }
  return undefined;
}

function findLatestVisibleBranchRootMessageId(
  messages: AiMessageWithCitations[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const branchRootMessageId = messages[index]?.branchRootMessageId;
    if (
      typeof branchRootMessageId === "string" &&
      branchRootMessageId.length > 0
    ) {
      return branchRootMessageId;
    }
  }
  return null;
}

function AiChatStarterHints({
  onPickSuggestion,
}: {
  onPickSuggestion: (value: string) => void;
}) {
  return (
    <View style={styles.starterWrap}>
      <Text style={styles.starterGreeting}>{getAiChatGreeting()}</Text>
      <View style={styles.starterSuggestions}>
        {STARTER_SUGGESTIONS.map((suggestion) => (
          <Pressable
            accessibilityRole="button"
            key={suggestion}
            onPress={() => onPickSuggestion(suggestion)}
            style={({ pressed }) => [
              styles.starterChip,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.starterChipText}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

interface AiChatScreenProps {
  space: PixorySpace;
  contextType: AiContextType;
  contextTitle?: string;
  boundIpId?: number;
  boundKnowledgeBaseId?: string;
  composerEntranceKey?: string;
  composerEntranceReason?: ComposerEntranceReason;
  includeIpDocuments?: boolean;
  modelRefreshKey?: number;
  threadId?: string;
  searchTargetMessageId?: string;
  searchTargetKey?: string;
  searchTargetBranchScopes?: AiBranchScope[];
  branchTreeSelection?: {
    branchRootMessageId: string;
    branchVersionIndex: number;
    selectionMap: Record<string, number>;
  };
  onOpenHistory: () => void;
  onOpenRoleLibrary: () => void;
  onOpenGlobalMaterials: () => void;
  onOpenSessionConfig: (threadId: string) => void;
  onOpenChatSearch: (
    threadId: string,
    currentBranchScopes: AiBranchScope[],
  ) => void;
  onOpenMemoryBoard: (threadId: string) => void;
  onNewChat: () => void;
  onOpenThread: (thread: AiThreadHistoryItem) => void;
  onOpenSource: (
    documentId: string,
    title: string,
    locator?: AiDocumentReaderLocator,
  ) => void;
  onOpenIpSource: (ipId: number) => void;
  onOpenImageSource: (imageId: number) => void;
  onThreadReady?: (threadId: string) => void;
  onThreadTitleChange?: (title: string) => void;
}

export function AiChatScreen({
  space,
  contextType,
  contextTitle,
  boundIpId,
  boundKnowledgeBaseId,
  composerEntranceKey,
  composerEntranceReason = "replace_current",
  includeIpDocuments = false,
  modelRefreshKey,
  threadId,
  searchTargetMessageId,
  searchTargetKey,
  searchTargetBranchScopes,
  branchTreeSelection,
  onOpenHistory,
  onOpenRoleLibrary,
  onOpenGlobalMaterials,
  onOpenSessionConfig,
  onOpenChatSearch,
  onOpenMemoryBoard,
  onNewChat,
  onOpenThread,
  onOpenSource,
  onOpenIpSource,
  onOpenImageSource,
  onThreadReady,
  onThreadTitleChange,
}: AiChatScreenProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight =
    Platform.OS === "android"
      ? Math.max(StatusBar.currentHeight ?? 0, insets.top)
      : insets.top;
  const resolvedContextTitle =
    contextTitle ??
    (contextType === "ip"
      ? "IP 对话"
      : contextType === "knowledge_base"
        ? "知识库对话"
        : "普通聊天");
  const messageListRef = useRef<FlatList<VisibleMessageItem> | null>(null);
  const pendingBranchTreeScrollMessageIdRef = useRef<string | null>(null);
  const pendingSearchScrollMessageIdRef = useRef<string | null>(null);
  const appliedBranchTreeSelectionKeyRef = useRef<string | null>(null);
  const appliedSearchTargetKeyRef = useRef<string | null>(null);
  const activeMessageBranchScopesRef = useRef<AiBranchScope[] | undefined>(
    undefined,
  );
  const selectedVersionByMessageIdRef = useRef<Record<string, number>>({});

  const petRef = useRef<Live2DPetViewRef>(null);
  const [currentPetModelId, setCurrentPetModelId] = useState<string | null>(
    null,
  );
  const [loadedMotions, setLoadedMotions] = useState<string[]>([]);
  const [petVisible, setPetVisible] = useState(true);
  const petPan = useRef(new Animated.ValueXY()).current;
  const petScale = useRef(new Animated.Value(1)).current;
  const petScaleRef = useRef(1);
  const petOffsetRef = useRef({ x: 0, y: 0 });
  const resizeHandleOpacity = useRef(new Animated.Value(0.1)).current;
  const resizeHandleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const spaceRef = useRef(space);
  spaceRef.current = space;

  const showResizeHandle = useCallback(() => {
    if (resizeHandleTimeoutRef.current)
      clearTimeout(resizeHandleTimeoutRef.current);
    Animated.timing(resizeHandleOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: false,
    }).start();
    resizeHandleTimeoutRef.current = setTimeout(() => {
      Animated.timing(resizeHandleOpacity, {
        toValue: 0.1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }, 2000);
  }, [resizeHandleOpacity]);

  useEffect(() => {
    return () => {
      if (resizeHandleTimeoutRef.current)
        clearTimeout(resizeHandleTimeoutRef.current);
    };
  }, []);

  const loadPetSettings = useCallback(() => {
    void runWithDatabaseSpace(spaceRef.current, async (db) => {
      const [id, offsetX, offsetY, scaleVal] = await Promise.all([
        settingsRepository.getValue(db, "GLOBAL_PET_MODEL_ID"),
        settingsRepository.getValue(db, "GLOBAL_PET_OFFSET_X"),
        settingsRepository.getValue(db, "GLOBAL_PET_OFFSET_Y"),
        settingsRepository.getValue(db, "GLOBAL_PET_SCALE"),
      ]);

      setCurrentPetModelId(id || null);
      if (offsetX && offsetY) {
        petPan.setValue({ x: parseFloat(offsetX), y: parseFloat(offsetY) });
      } else {
        petPan.setValue({ x: 0, y: 0 });
      }
      if (scaleVal) {
        petScale.setValue(parseFloat(scaleVal));
      } else {
        petScale.setValue(1);
      }
    });
  }, [petPan, petScale]);

  useEffect(() => {
    const scaleId = petScale.addListener(({ value }) => {
      petScaleRef.current = value;
    });
    const panId = petPan.addListener((value) => {
      petOffsetRef.current = value;
    });

    loadPetSettings();

    let isMounted = true;
    import("react-native").then(({ DeviceEventEmitter }) => {
      const sub = DeviceEventEmitter.addListener("LIVE2D_MODEL_CHANGED", () => {
        if (isMounted) loadPetSettings();
      });
      // Store to clean up
      // We can't return an async cleanup, so we just use an inner variable
      (loadPetSettings as any).sub = sub;
    });

    return () => {
      isMounted = false;
      petScale.removeListener(scaleId);
      petPan.removeListener(panId);
      if ((loadPetSettings as any).sub) {
        (loadPetSettings as any).sub.remove();
      }
    };
  }, [petPan, petScale, loadPetSettings]);

  const currentPetModel = useMemo(
    () => PET_MODELS.find((m) => m.id === currentPetModelId),
    [currentPetModelId],
  );

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      if (!currentPetModel) return;
      const motions =
        loadedMotions.length > 0
          ? loadedMotions
          : currentPetModel?.motions || [];
      const walkMotion = motions.find((m) => {
        const l = m.toLowerCase();
        return l.includes("walk") || l.includes("run") || l.includes("move");
      });

      if (walkMotion) {
        // Before animating, flatten the offset so petPan.x represents the absolute translation from its original right:16 spawn point
        petPan.flattenOffset();

        const { width } = require("react-native").Dimensions.get("window");
        const petWidth = 240;
        const initialRightMargin = 16;
        // The center X of the pet when translation is 0
        const initialCenterX = width - initialRightMargin - petWidth / 2;

        // We want the pet to stay within 20% to 80% of the screen width
        const safeMinCenterX = width * 0.2;
        const safeMaxCenterX = width * 0.8;

        // This means the allowed total translations are:
        const minTranslationX = safeMinCenterX - initialCenterX;
        const maxTranslationX = safeMaxCenterX - initialCenterX;

        // Pick a random target translation within the safe bounds
        const targetX =
          minTranslationX + Math.random() * (maxTranslationX - minTranslationX);

        const currentX = petOffsetRef.current.x;
        const distance = Math.abs(targetX - currentX);

        // Only walk if the distance is meaningful (e.g. > 20 pixels)
        if (distance < 20) return;

        const duration = Math.max(distance * 15, 800);

        petRef.current?.playMotion(walkMotion);
        Animated.timing(petPan.x, {
          toValue: targetX,
          duration: duration,
          useNativeDriver: false,
        }).start(({ finished }) => {
          if (finished) {
            const idleMatch = motions.find((m) =>
              m.toLowerCase().includes("idle"),
            );
            if (idleMatch) {
              petRef.current?.playMotion(idleMatch);
            }
          }
        });
      }
    }, 20000);
  }, [currentPetModel, petPan]);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  const initialPinchDistance = useRef<number | null>(null);
  const initialPinchScale = useRef<number>(1);

  const petPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return (
          Math.abs(gestureState.dx) > 5 ||
          Math.abs(gestureState.dy) > 5 ||
          evt.nativeEvent.touches.length === 2
        );
      },
      onPanResponderGrant: () => {
        resetIdleTimer();
        petPan.extractOffset();
        initialPinchDistance.current = null;
        showResizeHandle();
      },
      onPanResponderMove: (evt, gestureState) => {
        if (evt.nativeEvent.touches.length > 0) {
          try {
            const touch = evt.nativeEvent.touches[0];
            // Pass global pixel coordinates to Live2D model,
            // pixi-live2d-display's model.focus() takes canvas coordinates
            petRef.current?.trackPointer?.(touch.pageX, touch.pageY);
          } catch (e) {}
        }

        if (evt.nativeEvent.touches.length === 2) {
          const touches = evt.nativeEvent.touches;
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (initialPinchDistance.current === null) {
            initialPinchDistance.current = distance;
            initialPinchScale.current = petScaleRef.current;
          } else {
            const scale =
              initialPinchScale.current *
              (distance / initialPinchDistance.current);
            const finalScale = Math.min(Math.max(scale, 0.5), 3.0);
            petScale.setValue(finalScale);
          }
        } else {
          initialPinchDistance.current = null;
          petPan.x.setValue(gestureState.dx);
          petPan.y.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: () => {
        petPan.flattenOffset();
        initialPinchDistance.current = null;

        let finalScale = petScaleRef.current;
        if (finalScale < 0.5) finalScale = 0.5;
        if (finalScale > 3.0) finalScale = 3.0;

        void runWithDatabaseSpace(spaceRef.current, async (db) => {
          await settingsRepository.setValue(
            db,
            "GLOBAL_PET_OFFSET_X",
            String(petOffsetRef.current.x),
          );
          await settingsRepository.setValue(
            db,
            "GLOBAL_PET_OFFSET_Y",
            String(petOffsetRef.current.y),
          );
          await settingsRepository.setValue(
            db,
            "GLOBAL_PET_SCALE",
            String(finalScale),
          );
        });
      },
    }),
  ).current;

  const scalePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        petScale.extractOffset();
        showResizeHandle();
      },
      onPanResponderMove: (evt, gestureState) => {
        // dx and dy increase the scale
        const scaleDelta = (gestureState.dx + gestureState.dy) / 400;
        petScale.setValue(scaleDelta);
      },
      onPanResponderRelease: () => {
        petScale.flattenOffset();
        let finalScale = petScaleRef.current;
        if (finalScale < 0.5) finalScale = 0.5;
        if (finalScale > 3.0) finalScale = 3.0;
        petScale.setValue(finalScale);
        void runWithDatabaseSpace(spaceRef.current, async (db) => {
          await settingsRepository.setValue(
            db,
            "GLOBAL_PET_SCALE",
            String(finalScale),
          );
        });
      },
    }),
  ).current;

  // Right-swipe anywhere on the chat surface opens the record drawer.
  const swipeDrawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        gs.dx > DRAWER_SWIPE_ACTIVATION_DISTANCE &&
        Math.abs(gs.dx) > Math.abs(gs.dy) * DRAWER_SWIPE_HORIZONTAL_RATIO,
      onPanResponderRelease: (_evt, gs) => {
        if (
          gs.dx > DRAWER_SWIPE_RELEASE_DISTANCE ||
          (gs.dx > DRAWER_SWIPE_ACTIVATION_DISTANCE && gs.vx > 0.18)
        ) {
          setRecordDrawerVisible(true);
        }
      },
    }),
  ).current;

  const handlePetHitArea = useCallback(
    (area: string) => {
      petPan.stopAnimation();
      resetIdleTimer();
      if (!currentPetModel) return;
      const lowerArea = area.toLowerCase();
      const motions =
        loadedMotions.length > 0
          ? loadedMotions
          : currentPetModel?.motions || [];

      // 1. Precise Match (exact area name)
      const exactMatch = motions.find(
        (m) =>
          m.toLowerCase().includes(lowerArea) ||
          m.toLowerCase() === `tap${lowerArea}`,
      );
      if (exactMatch) {
        petRef.current?.playMotion(exactMatch);
        return;
      }

      // 2. Semantic Fallback
      if (currentPetModel.semantic?.tap) {
        petRef.current?.playMotion(currentPetModel.semantic.tap);
        return;
      }

      // 3. Generic Interaction Fallback
      const interactionMatch = motions.find((m) => {
        const l = m.toLowerCase();
        return (
          l.includes("tap") ||
          l.includes("touch") ||
          l.includes("interact") ||
          l.includes("click") ||
          l.includes("poke")
        );
      });
      if (interactionMatch) {
        petRef.current?.playMotion(interactionMatch);
        return;
      }

      // 4. Ultimate Fallback (Random Safe Motion)
      const safeMotions = motions.filter((m) => {
        const l = m.toLowerCase();
        return (
          !l.includes("die") &&
          !l.includes("sleep") &&
          !l.includes("destroy") &&
          !l.includes("idle")
        );
      });
      if (safeMotions.length > 0) {
        const randomMotion =
          safeMotions[Math.floor(Math.random() * safeMotions.length)];
        petRef.current?.playMotion(randomMotion);
      }
    },
    [currentPetModel],
  );

  const loadedMessageLimitRef = useRef(CHAT_MESSAGE_PAGE_SIZE);
  const userScrolledAwayFromBottomRef = useRef(false);
  const bottomLockedRef = useRef(true);
  const isUserDraggingRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const escapedFromLockRef = useRef(false);
  const lastUserScrollAtRef = useRef(0);
  const showScrollToLatestRef = useRef(false);
  const messageScrollOffsetRef = useRef(0);
  const streamingReadBufferActiveRef = useRef(false);
  const bufferedStreamingPatchRef = useRef<AiStreamingMessagePatch | null>(
    null,
  );
  const pendingFinalReloadRef = useRef(false);
  const pendingFinalStreamingIdentityRef =
    useRef<ActiveStreamingIdentity | null>(null);
  const hasBufferedStreamingUpdateRef = useRef(false);
  const frozenStreamingMessageByIdRef = useRef(
    new Map<string, AiMessageWithCitations>(),
  );
  const messagesRef = useRef<AiMessageWithCitations[]>([]);
  const messageIndexByIdRef = useRef(new Map<string, number>());
  const visibleMessagesRef = useRef<AiMessageWithCitations[]>([]);
  const inlineEditSafeVisibleMessageIdsRef = useRef(new Set<string>());
  const inlineEditViewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 82,
  });
  const userScrollIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const shrinkSettlementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconcileRetainTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconcileAnimationFrameRef = useRef<number | null>(null);
  const reconcileForceRenderRef = useRef(false);
  const reconcileAllowFollowLatestRef = useRef(false);
  const reconcileReasonRef = useRef<string | null>(null);
  const allowFullShrinkSettlementRef = useRef(false);
  // prettier-ignore
  const handleInlineEditViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: ViewToken<VisibleMessageItem>[] }) => {
      const nextVisibleMessageIds = new Set(
        viewableItems
          .filter((item) => item.isViewable && item.item?.id)
          .map((item) => item.item.id),
      );
      inlineEditSafeVisibleMessageIdsRef.current = nextVisibleMessageIds;
      const pendingSearchMessageId = pendingSearchScrollMessageIdRef.current;
      if (
        pendingSearchMessageId &&
        nextVisibleMessageIds.has(pendingSearchMessageId)
      ) {
        pendingSearchScrollMessageIdRef.current = null;
        clearSearchScrollTimeouts();
      }
    },
  );
  const isLoadingEarlierRef = useRef(false);
  const displayTitleRef = useRef(resolvedContextTitle);
  const activeThreadIdRef = useRef<string | null>(threadId ?? null);
  const latestRequestRef = useRef({
    avatar: 0,
    continuity: 0,
    memory: 0,
    messages: 0,
    model: 0,
    title: 0,
  });
  const screenMountedRef = useRef(true);
  const appActiveRef = useRef(AppState.currentState === "active");
  const generationSubscriptionRef = useRef<(() => void) | null>(null);
  const activeStreamGenerationRef = useRef(0);
  const activeStreamingIdentityRef = useRef<ActiveStreamingIdentity | null>(
    null,
  );
  const generationBusyRef = useRef(false);
  const generationActionTokenRef = useRef(0);
  const newChatFeedbackTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const composerFocusVisibilityTimeoutsRef = useRef<
    Array<ReturnType<typeof setTimeout>>
  >([]);
  const latestJumpTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>(
    [],
  );
  const branchTreeScrollTimeoutsRef = useRef<
    Array<ReturnType<typeof setTimeout>>
  >([]);
  const searchScrollTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>(
    [],
  );
  const searchHighlightTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const inlineEditVisibilityTimeoutsRef = useRef<
    Array<ReturnType<typeof setTimeout>>
  >([]);
  const voiceResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const thinkingExpandedByMessageIdRef = useRef(new Map<string, boolean>());
  const playedComposerEntranceKeysRef = useRef(new Set<string>());
  const previousComposerEntranceKeyRef = useRef<string | undefined>(undefined);
  const composerEntranceRunRef = useRef<ComposerEntranceRun | null>(null);
  const shouldPrimeComposerEntrance = shouldStartComposerEntrance({
    nextRouteKey: composerEntranceKey,
    playedRouteKeys: playedComposerEntranceKeysRef.current,
    previousRouteKey: previousComposerEntranceKeyRef.current,
    reason: composerEntranceReason,
  });
  const composerEntranceProgress = useRef(
    new Animated.Value(shouldPrimeComposerEntrance ? 0 : 1),
  ).current;
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    threadId ?? null,
  );
  const [messages, setMessages] = useState<AiMessageWithCitations[]>([]);
  const [streamingTailVersion, forceUpdateTailState] = useReducer(
    (x) => x + 1,
    0,
  );
  const initialMessageViewportHeight = Dimensions.get("window").height;
  const streamingTailStateRef = useRef<AiStreamingTailState>(
    createEmptyStreamingTailState(),
  );
  const maxTailReservedHeightRef = useRef<number>(0);
  const maxTailReservedHeightMessageIdRef = useRef<string | null>(null);
  const messageViewportHeightRef = useRef(initialMessageViewportHeight);
  const previousMessageScrollOffsetRef = useRef(0);
  const scrollingTowardLatestRef = useRef(true);
  const tailViewportPolicyRef = useRef<StreamingTailViewportPolicy>(
    deriveStreamingTailViewportPolicy({
      scrollOffset: 0,
      scrollingTowardLatest: true,
      totalReservedHeight: 0,
      viewportHeight: initialMessageViewportHeight,
    }),
  );
  const [tailViewportPolicy, setTailViewportPolicy] =
    useState<StreamingTailViewportPolicy>(tailViewportPolicyRef.current);
  const updateStreamingLockStateSnapshot = useCallback((offsetY: number) => {
    const atBottom = offsetY <= MESSAGE_STREAM_FOLLOW_THRESHOLD;
    const nearBottom = offsetY <= STICK_TO_BOTTOM_OFFSET_PX;
    if (!hasPendingStreamingReadBuffer()) {
      bottomLockedRef.current = atBottom;
    }
    isNearBottomRef.current = nearBottom;
    escapedFromLockRef.current = !nearBottom;
    streamingTailPerfDebug.recordLockState({
      atBottom,
      escapedFromLock: escapedFromLockRef.current,
      nearBottom,
      });
  }, []);

  const syncTailViewportPolicy = useCallback((occupiedTailHeight: number) => {
    const nextPolicy = deriveStreamingTailViewportPolicy({
      scrollOffset: messageScrollOffsetRef.current,
      scrollingTowardLatest: scrollingTowardLatestRef.current,
      totalReservedHeight: occupiedTailHeight,
      viewportHeight: messageViewportHeightRef.current,
    });
    const currentPolicy = tailViewportPolicyRef.current;
    const changed =
      currentPolicy.hotZone !== nextPolicy.hotZone ||
      currentPolicy.prePromotionHeight !== nextPolicy.prePromotionHeight ||
      currentPolicy.targetDetachedFps !== nextPolicy.targetDetachedFps ||
      currentPolicy.shouldRelaxClipping !== nextPolicy.shouldRelaxClipping ||
      currentPolicy.shouldExpandRenderWindow !==
        nextPolicy.shouldExpandRenderWindow;
    tailViewportPolicyRef.current = nextPolicy;
    if (changed) {
      setTailViewportPolicy(nextPolicy);
    }
    return nextPolicy;
  }, []);

  const syncTailViewportPolicyForCurrentTailState = useCallback(() => {
    const tailState = streamingTailStateRef.current;
    if (tailState.status === "idle") {
      return syncTailViewportPolicy(0);
    }
    const thinkingDefaultExpanded = false;
    const isExpanded = tailState.messageId
      ? (thinkingExpandedByMessageIdRef.current.get(tailState.messageId) ??
          thinkingDefaultExpanded)
      : thinkingDefaultExpanded;
    const activeLanes: ("content" | "reasoning")[] = isExpanded
      ? ["content", "reasoning"]
      : ["content"];
    return syncTailViewportPolicy(
      calculateEffectiveTotalReservedHeight(tailState, activeLanes),
    );
  }, [syncTailViewportPolicy]);

  const recomputeVisibleStreamingTailForCurrentScroll = useCallback(
    (options?: { forceRender?: boolean }) => {
      const tailState = streamingTailStateRef.current;
      if (tailState.status === "idle") {
        syncTailViewportPolicy(0);
        return;
      }

      const thinkingDefaultExpanded = false;
      const isExpanded = tailState.messageId
        ? (thinkingExpandedByMessageIdRef.current.get(tailState.messageId) ??
            thinkingDefaultExpanded)
        : thinkingDefaultExpanded;

      const activeLanes: ("content" | "reasoning")[] = isExpanded
        ? ["content", "reasoning"]
        : ["content"];
      const effectiveReservedHeight = calculateEffectiveTotalReservedHeight(
        tailState,
        activeLanes,
      );

      let reservedHeight = effectiveReservedHeight;
      if (!isExpanded) {
        maxTailReservedHeightMessageIdRef.current = tailState.messageId;
        maxTailReservedHeightRef.current = effectiveReservedHeight;
      } else if (
        tailState.messageId === maxTailReservedHeightMessageIdRef.current
      ) {
        reservedHeight = Math.max(
          maxTailReservedHeightRef.current,
          effectiveReservedHeight,
        );
        maxTailReservedHeightRef.current = reservedHeight;
      } else {
        maxTailReservedHeightMessageIdRef.current = tailState.messageId;
        maxTailReservedHeightRef.current = effectiveReservedHeight;
      }

      const tailViewportPolicy = syncTailViewportPolicy(reservedHeight);
      const visibleTailHeight = Math.max(
        0,
        reservedHeight - messageScrollOffsetRef.current,
      );
      const nextTailState = promoteStreamingTailBlocks({
        activeLanes,
        previous: tailState,
        replayHorizonHeight:
          visibleTailHeight + tailViewportPolicy.prePromotionHeight,
      });

      if (nextTailState !== tailState) {
        streamingTailStateRef.current = nextTailState;
        forceUpdateTailState();
      } else if (options?.forceRender) {
        forceUpdateTailState();
      }
    },
    [syncTailViewportPolicy],
  );

  const maybeSettleStreamingTailShrinkDebt = useCallback(
    (reason: string) => {
      const tailState = streamingTailStateRef.current;
      if (
        tailState.status === "idle" ||
        !tailState.debtPayoffEligible ||
        tailState.pendingShrinkHeight <= 0 ||
        tailState.shrinkStableSince == null
      ) {
        return;
      }
      if (Date.now() - tailState.shrinkStableSince < SHRINK_STABLE_DELAY_MS) {
        return;
      }
      const settleAllBlocks =
        allowFullShrinkSettlementRef.current ||
        reason === "return-to-latest" ||
        (bottomLockedRef.current && !hasPendingStreamingReadBuffer());
      const payoffSafe = shouldPayoffDebt({
        debtHeight: tailState.pendingShrinkHeight,
        isAtBottom: bottomLockedRef.current,
        isListIdle: !isUserDraggingRef.current,
        isMvcpCompensatedSide: false,
        isSpacerOffscreen:
          allowFullShrinkSettlementRef.current ||
          reason === "return-to-latest",
      });
      if (!payoffSafe) {
        return;
      }
      const nextTailState = settleStreamingTailShrinkDebt({
        canApplyBlock: (block) =>
          settleAllBlocks ||
          tailState.promotedBlockIds.has(block.blockId),
        previous: tailState,
      });
      allowFullShrinkSettlementRef.current = false;
      if (nextTailState !== tailState) {
        streamingTailStateRef.current = nextTailState;
        forceUpdateTailState();
      }
    },
    [],
  );

  const scheduleStreamingTailReconcile = useCallback(
    (
      reason: string,
      options?: {
        allowFollowLatest?: boolean;
        forceRender?: boolean;
        retainWindow?: boolean;
      },
    ) => {
      reconcileReasonRef.current = reason;
      reconcileForceRenderRef.current =
        reconcileForceRenderRef.current || Boolean(options?.forceRender);
      reconcileAllowFollowLatestRef.current =
        reconcileAllowFollowLatestRef.current ||
        Boolean(options?.allowFollowLatest);

      if (reconcileRetainTimeoutRef.current) {
        clearTimeout(reconcileRetainTimeoutRef.current);
        reconcileRetainTimeoutRef.current = null;
      }
      if (options?.retainWindow) {
        reconcileRetainTimeoutRef.current = setTimeout(() => {
          reconcileRetainTimeoutRef.current = null;
          scheduleStreamingTailReconcile(`${reason}:retained`, {
            allowFollowLatest: options.allowFollowLatest,
          });
        }, RETAIN_RECONCILE_WINDOW_MS);
      }

      if (reconcileAnimationFrameRef.current != null) {
        return;
      }
      reconcileAnimationFrameRef.current = requestAnimationFrame(() => {
        reconcileAnimationFrameRef.current = null;
        const now = Date.now();
        if (
          isUserDraggingRef.current &&
          now - lastUserScrollAtRef.current < USER_SCROLL_IDLE_TIMEOUT_MS &&
          tailViewportPolicyRef.current.hotZone === "cold"
        ) {
          return;
        }

        streamingTailPerfDebug.incrementReconcileCount();
        recomputeVisibleStreamingTailForCurrentScroll({
          forceRender: reconcileForceRenderRef.current,
        });
        maybeSettleStreamingTailShrinkDebt(
          reconcileReasonRef.current ?? reason,
        );

        if (
          reconcileAllowFollowLatestRef.current &&
          (bottomLockedRef.current || isNearBottomRef.current) &&
          !hasPendingStreamingReadBuffer()
        ) {
          followLatestMessage(false);
        }

        reconcileAllowFollowLatestRef.current = false;
        reconcileForceRenderRef.current = false;
      });
    },
    [maybeSettleStreamingTailShrinkDebt, recomputeVisibleStreamingTailForCurrentScroll],
  );

  const scheduleShrinkDebtSettlementCheck = useCallback(() => {
    if (shrinkSettlementTimeoutRef.current) {
      clearTimeout(shrinkSettlementTimeoutRef.current);
    }
    shrinkSettlementTimeoutRef.current = setTimeout(() => {
      shrinkSettlementTimeoutRef.current = null;
      scheduleStreamingTailReconcile("shrink-settle");
    }, SHRINK_DEBOUNCE_MS);
  }, [scheduleStreamingTailReconcile]);

  const handleMeasuredTailBlock = useCallback(
    (blockId: string, measuredHeight: number) => {
      const tailState = streamingTailStateRef.current;
      if (tailState.status === "idle") return;
      const nextTailState = updateStreamingTailBlockMeasurement({
        blockId,
        measuredAt: Date.now(),
        measuredHeight,
        previous: tailState,
      });
      if (nextTailState !== tailState) {
        streamingTailStateRef.current = nextTailState;
        forceUpdateTailState();
        scheduleShrinkDebtSettlementCheck();
        scheduleStreamingTailReconcile("measured-block", {
          allowFollowLatest: bottomLockedRef.current || isNearBottomRef.current,
          retainWindow: true,
        });
      }
    },
    [scheduleShrinkDebtSettlementCheck, scheduleStreamingTailReconcile],
  );

  function resetStreamingTailOccupancy() {
    maxTailReservedHeightRef.current = 0;
    maxTailReservedHeightMessageIdRef.current = null;
    allowFullShrinkSettlementRef.current = false;
    syncTailViewportPolicy(0);

    if (streamingTailStateRef.current.status !== "idle") {
      streamingTailStateRef.current = createEmptyStreamingTailState();
      forceUpdateTailState();
    }
  }

  useEffect(() => {
    return () => {
      if (userScrollIdleTimeoutRef.current) {
        clearTimeout(userScrollIdleTimeoutRef.current);
      }
      if (shrinkSettlementTimeoutRef.current) {
        clearTimeout(shrinkSettlementTimeoutRef.current);
      }
      if (reconcileRetainTimeoutRef.current) {
        clearTimeout(reconcileRetainTimeoutRef.current);
      }
      if (reconcileAnimationFrameRef.current != null) {
        cancelAnimationFrame(reconcileAnimationFrameRef.current);
      }
    };
  }, []);

  function getMessageItemIdAtIndex(index: number): string | null {
    const item = invertedMessageItems[index];
    return item?.type === "message" ? item.message.id : null;
  }

  const [loadedMessageLimit, setLoadedMessageLimit] = useState(
    CHAT_MESSAGE_PAGE_SIZE,
  );
  const [hasEarlierMessages, setHasEarlierMessages] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [singleBubbleTailReplayEnabled] = useState(
    getAiTailReplaySingleBubbleEnabled,
  );

  useEffect(() => {
    void refreshAiTailReplaySingleBubbleEnabled();
  }, []);

  useEffect(() => {
    if (generating) {
      petPan.stopAnimation();
      resetIdleTimer();
    }
    if (generating && currentPetModel) {
      const motions =
        loadedMotions.length > 0
          ? loadedMotions
          : currentPetModel?.motions || [];
      const safeMotions = motions.filter((m) => {
        const l = m.toLowerCase();
        return (
          !l.includes("die") &&
          !l.includes("sleep") &&
          !l.includes("destroy") &&
          !l.includes("damage") &&
          !l.includes("idle")
        );
      });
      if (safeMotions.length > 0) {
        const randomMotion =
          safeMotions[Math.floor(Math.random() * safeMotions.length)];
        petRef.current?.playMotion(randomMotion);
      } else if (currentPetModel.semantic?.tap) {
        petRef.current?.playMotion(currentPetModel.semantic.tap);
      }
    }
  }, [generating, currentPetModel]);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(
    null,
  );

  const draftThreadKey = threadId ?? "new_chat";
  const isComposerDraftLoadedRef = useRef(false);

  useEffect(() => {
    isComposerDraftLoadedRef.current = false;
    setComposerText("");
    let isMounted = true;
    void getComposerDraft(draftThreadKey).then((draft) => {
      if (!isMounted) return;
      isComposerDraftLoadedRef.current = true;
      if (draft) {
        setComposerText(draft);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [draftThreadKey]);

  useEffect(() => {
    if (!isComposerDraftLoadedRef.current) return;
    const timeout = setTimeout(() => {
      if (isComposerDraftLoadedRef.current) {
        void setComposerDraft(draftThreadKey, composerText);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [composerText, draftThreadKey]);
  const [editingUserMessageId, setEditingUserMessageId] = useState<
    string | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    AiComposerAttachment[]
  >([]);
  const [pendingMessageActionId, setPendingMessageActionId] = useState<
    string | null
  >(null);
  const [favoriteStateByKey, setFavoriteStateByKey] = useState<
    Record<string, boolean>
  >({});
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [favoritePendingByKey, setFavoritePendingByKey] = useState<
    Record<string, boolean>
  >({});
  const [selectedVersionByMessageId, setSelectedVersionByMessageId] = useState<
    Record<string, number>
  >({});
  const [persistedCurrentBranchScopes, setPersistedCurrentBranchScopes] =
    useState<AiBranchScope[]>([]);
  const [modelLabel, setModelLabel] = useState("");
  const [modelIconBrand, setModelIconBrand] =
    useState<AiModelIconBrand>("default");
  const [displayTitle, setDisplayTitle] = useState(resolvedContextTitle);
  const [participantAppearance, setParticipantAppearance] = useState({
    assistantAvatarEnabled: false,
    assistantAvatarUri: null as string | null,
    assistantName: null as string | null,
    userAvatarEnabled: DEFAULT_AI_USER_AVATAR_ENABLED,
    userAvatarUri: null as string | null,
    userNickname: null as string | null,
  });
  const [memoryCaptures, setMemoryCaptures] = useState<
    MemoryCaptureNoticeItem[]
  >([]);
  const [voiceState, setVoiceState] = useState<AiVoiceInputState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [composerPanelHeight, setComposerPanelHeight] = useState(0);
  const [recentThreads, setRecentThreads] = useState<AiThreadHistoryItem[]>([]);
  const [newChatFeedbackVisible, setNewChatFeedbackVisible] = useState(false);
  const [recordDrawerVisible, setRecordDrawerVisible] = useState(false);
  const [searchHighlightMessageId, setSearchHighlightMessageId] = useState<
    string | null
  >(null);
  const [continuityMilestones, setContinuityMilestones] = useState<
    AiThreadContinuityMilestoneRecord[]
  >([]);
  const editingUserMessageIdRef = useRef<string | null>(null);
  const thinking = generating;
  const inlineEditingActive = Boolean(editingUserMessageId);
  const composerEntranceTranslateY = composerEntranceProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [spacing[7], 0],
  });
  const composerEntranceStyle = {
    opacity: composerEntranceProgress,
    transform: [{ translateY: composerEntranceTranslateY }],
  };
  const latestAssistantMessage = useMemo(
    () => findLatestAssistantMessage(messages),
    [messages],
  );

  function getSelectedMessageVersionIndex(
    messageId: string,
    versionTotal: number,
  ): number {
    return resolveSelectedMessageVersionIndex(
      selectedVersionByMessageId,
      messageId,
      versionTotal,
    );
  }

  function getBoundMessageVersionIndex(
    message: AiMessageWithCitations,
    previousMessage?: AiMessageWithCitations,
  ): number {
      if (
        message.role === 'assistant' &&
        !message.branchRootMessageId &&
        previousMessage?.role === 'user'
      ) {
      const selectedUserVersionIndex =
        selectedVersionByMessageId[previousMessage.id];
      if (
        selectedUserVersionIndex &&
        selectedUserVersionIndex <= message.versionTotal
      ) {
        return selectedUserVersionIndex;
      }
    }
    return getSelectedMessageVersionIndex(message.id, message.versionTotal);
  }

  function messageMatchesSelectedBranch(
    message: AiMessageWithCitations,
  ): boolean {
    return messageMatchesSelectedBranchPath(
      message,
      messagesById,
      selectedVersionByMessageId,
    );
  }

  const visibleMessageState = useMemo(() => {
    const nextMessagesById = new Map<string, AiMessageWithCitations>();
    for (const message of messages) {
      nextMessagesById.set(message.id, message);
    }

    const nextVisibleMessages: AiMessageWithCitations[] = [];
    for (const message of messages) {
      if (!messageMatchesSelectedBranchPath(message, nextMessagesById, selectedVersionByMessageId)) {
        continue;
      }
      const previousMessage =
        nextVisibleMessages[nextVisibleMessages.length - 1];
      const selectedVersionIndex = getBoundMessageVersionIndex(
        message,
        previousMessage,
      );
      if (selectedVersionIndex >= message.versionTotal) {
        // prettier-ignore
        nextVisibleMessages.push(message.versionIndex === message.versionTotal ? message : { ...message, versionIndex: message.versionTotal });
        continue;
      }
      const selectedVersion = message.messageVersions.find(
        (version) => version.versionIndex === selectedVersionIndex,
      );
      if (!selectedVersion) {
        // prettier-ignore
        nextVisibleMessages.push(message.versionIndex === message.versionTotal ? message : { ...message, versionIndex: message.versionTotal });
        continue;
      }
      nextVisibleMessages.push({
        ...message,
        content: selectedVersion.content,
        reasoningText: selectedVersion.reasoningText,
        errorMessage: selectedVersion.errorMessage,
        providerId: selectedVersion.providerId,
        modelId: selectedVersion.modelId,
        modelSnapshotJson: selectedVersion.modelSnapshotJson,
        promptSnapshotJson: selectedVersion.promptSnapshotJson,
        citations: selectedVersion.citations,
        createdAt: selectedVersion.messageCreatedAt,
        updatedAt: selectedVersion.messageUpdatedAt,
        completedAt: selectedVersion.messageCompletedAt,
        status: selectedVersion.status,
        versionIndex: selectedVersion.versionIndex,
      });
    }

    const tailState = streamingTailStateRef.current;
    const tailOverride =
      tailState.status !== "idle" && tailState.messageId
        ? {
            frozenContent: tailState.frozenContent,
            frozenReasoningText: tailState.frozenReasoningText,
            messageId: tailState.messageId,
            status: tailState.status,
          }
        : undefined;
    // prettier-ignore
    const nextVisibleMessageItems = nextVisibleMessages.map((message, index): VisibleMessageItem => {
        message = selectVisibleMessage({
          message,
          tailOverride,
        });
        const previousMessage = nextVisibleMessages[index - 1];
        const showDateSeparator = shouldShowDateSeparator(
          nextVisibleMessages,
          index,
        );
        return {
          id: message.id,
          type: "message",
          message,
          showAvatar: message.role === 'assistant' && (showDateSeparator || previousMessage?.role !== 'assistant'),
          showUserAvatar: message.role === 'user' && (showDateSeparator || previousMessage?.role !== 'user'),
          showDateSeparator,
        };
      });
    const nextVisibleMessagesById = new Map<string, AiMessageWithCitations>();
    nextVisibleMessageItems.forEach((item) => {
      if (item.type === "message") {
        nextVisibleMessagesById.set(item.message.id, item.message);
      }
    });

    const nextInvertedMessageItems = nextVisibleMessageItems.slice().reverse();
    if (
      (tailState.status === "detached" || tailState.status === "completed") &&
      tailState.generationId
    ) {
      const isThinkingExpanded = tailState.messageId
        ? Boolean(
            thinkingExpandedByMessageIdRef.current.get(tailState.messageId),
          )
        : false;
      const activeLanes: ("content" | "reasoning")[] = isThinkingExpanded
        ? ["content", "reasoning"]
        : ["content"];
      const hiddenTailHeight = calculateRemainingStreamingTailHeight(
        tailState,
        activeLanes,
      );
      if (singleBubbleTailReplayEnabled && tailState.messageId) {
        const promotedBlocks = tailState.blocks.filter(
          (block) =>
            activeLanes.includes(block.lane) &&
            tailState.promotedBlockIds.has(block.blockId),
        );
        const promotedTailSegments = buildTailMessageSegments({
          blocks: promotedBlocks,
        }).map(
          (segment): VisibleMessageItem => ({
            ...segment,
            edge: stitchTailSegmentEdgeAfterFrozenPrefix(segment.edge),
          }),
        );
        for (let index = 0; index < promotedTailSegments.length; index += 1) {
          nextInvertedMessageItems.unshift(promotedTailSegments[index]);
        }
        nextInvertedMessageItems.unshift(
          createTailDebtSpacer(tailState.messageId, hiddenTailHeight),
        );
      } else {
        const promotedTailGroups = groupPromotedStreamingTailBlocks({
          activeLanes,
          blocks: tailState.blocks,
          promotedBlockIds: tailState.promotedBlockIds,
        }).map((group): VisibleMessageItem => ({
          group,
          id: group.groupId,
          type: "streamTailContinuation",
        }));
        for (let index = 0; index < promotedTailGroups.length; index += 1) {
          nextInvertedMessageItems.unshift(promotedTailGroups[index]);
        }
        if (hiddenTailHeight > 0) {
          nextInvertedMessageItems.unshift({
            height: hiddenTailHeight,
            id: "stream-tail-spacer",
            type: "streamTailSpacer",
          });
        }
      }
    }

    const nextInvertedMessageIndexById = new Map<string, number>();
    nextInvertedMessageItems.forEach((item, index) => {
      if (item.type === "message") {
        nextInvertedMessageIndexById.set(item.message.id, index);
      }
    });
    // prettier-ignore
    const latestVisibleAssistant = findLatestAssistantMessage(nextVisibleMessages);

    return {
      invertedMessageIndexById: nextInvertedMessageIndexById,
      invertedMessageItems: nextInvertedMessageItems,
      messagesById: nextMessagesById,
      visibleMessagesById: nextVisibleMessagesById,
      visibleMessageItems: nextVisibleMessageItems,
      visibleMessages: nextVisibleMessages,
    };
  }, [
    messages,
    selectedVersionByMessageId,
    singleBubbleTailReplayEnabled,
    streamingTailVersion,
  ]);
  const {
    invertedMessageIndexById,
    invertedMessageItems,
    messagesById,
    visibleMessagesById,
    visibleMessageItems,
    visibleMessages,
  } = visibleMessageState;
  const latestVisibleBranchRootMessageId = useMemo(
    () => findLatestVisibleBranchRootMessageId(visibleMessages),
    [visibleMessages],
  );
  // prettier-ignore
  const activeContinuityMilestone = useMemo<ActiveContinuityMilestone | null>(() => {
      if (continuityMilestones.length === 0) {
        return null;
      }
      const matched = latestVisibleBranchRootMessageId
        ? continuityMilestones.find(
            (milestone) =>
              milestone.branchRootMessageId ===
              latestVisibleBranchRootMessageId,
          )
        : null;
      if (!matched) {
        return null;
      }
      if (matched.rollbackState !== "available") {
        return null;
      }
      return {
        ...matched,
        label:
          matched.rollbackState === "available"
            ? `还可回退：剩余 ${matched.rollbackRoundsRemaining} 轮`
            : "回退窗口已关闭",
        detailLines: [
          continuitySourceLabel(matched.sourceKind),
          matched.sourcePlatform ? `来源平台：${matched.sourcePlatform}` : null,
          `导入时间：${formatMinute(matched.createdAt)}`,
          `恢复消息：${matched.parsedMessageCount} 条`,
          matched.containsCompressedContinuity
            ? "包含压缩连续性块"
            : "无压缩连续性块",
          continuityReviewLabel(matched.reviewGateState),
        ].filter((line): line is string => Boolean(line)),
      };
    }, [continuityMilestones, latestVisibleBranchRootMessageId]);
  const fallbackMemoryCaptures = useMemo(
    () => memoryCaptures.filter((item) => !item.sourceMessageId),
    [memoryCaptures],
  );
  const memoryCapturesBySourceMessageId = useMemo(() => {
    const map = new Map<string, MemoryCaptureNoticeItem[]>();
    for (const item of memoryCaptures) {
      if (!item.sourceMessageId) {
        continue;
      }
      const list = map.get(item.sourceMessageId) ?? [];
      list.push(item);
      map.set(item.sourceMessageId, list);
    }
    return map;
  }, [memoryCaptures]);
  function nextRequestId(kind: keyof typeof latestRequestRef.current): number {
    latestRequestRef.current[kind] += 1;
    return latestRequestRef.current[kind];
  }

  function isLatestRequest(
    kind: keyof typeof latestRequestRef.current,
    requestId: number,
    targetThreadId: string | null,
  ): boolean {
    return (
      latestRequestRef.current[kind] === requestId &&
      activeThreadIdRef.current === targetThreadId
    );
  }

  function isCurrentStream(
    targetThreadId: string,
    generation: number,
  ): boolean {
    return (
      activeStreamGenerationRef.current === generation &&
      activeThreadIdRef.current === targetThreadId
    );
  }

  function isCurrentStreamingPatch(
    targetThreadId: string,
    generation: number,
    patch: AiStreamingMessagePatch,
  ): boolean {
    if (!isCurrentStream(targetThreadId, generation)) {
      return false;
    }
    if (!activeStreamingIdentityRef.current) {
      return false;
    }
    if (
      patch.generationId !== activeStreamingIdentityRef.current.generationId
    ) {
      return false;
    }
    return patch.id === activeStreamingIdentityRef.current.messageId;
  }

  function shouldPublishLiveStreamingPatch(
    targetThreadId: string,
    generation: number,
    patch: AiStreamingMessagePatch,
  ): boolean {
    if (!isCurrentStreamingPatch(targetThreadId, generation, patch)) {
      return false;
    }
    return screenMountedRef.current && appActiveRef.current;
  }

  function promptRollbackContinuityImport(
    milestone: ActiveContinuityMilestone,
  ) {
    if (milestone.rollbackState !== "available") {
      return;
    }
    Alert.alert(
      "回退接回分支",
      "这会回到接回前的会话状态，并保留导入内容作为审计记录。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认回退",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await rollbackThreadContinuityImport({
                  importSessionId: milestone.importSessionId,
                  space,
                });
                const targetThreadId = activeThreadIdRef.current;
                if (targetThreadId) {
                  const currentBranchScopes =
                    await syncPersistedCurrentBranchRoute(targetThreadId, true);
                  await reloadMessages(targetThreadId, {
                    branchScopes: currentBranchScopes,
                    forceToLatest: false,
                  });
                }
              } catch (error) {
                setErrorMessage(
                  error instanceof Error ? error.message : "回退连续性导入失败",
                );
              }
            })();
          },
        },
      ],
    );
  }

  function showContinuityMilestoneDetails(
    milestone: ActiveContinuityMilestone,
  ) {
    const detailText = [
      ...milestone.detailLines,
      milestone.rollbackState === "available"
        ? `还可回退：剩余 ${milestone.rollbackRoundsRemaining} 轮`
        : "回退窗口已关闭",
    ].join("\n");
    if (milestone.rollbackState !== "available") {
      Alert.alert("接回详情", detailText);
      return;
    }
    Alert.alert("接回详情", detailText, [
      { text: "关闭", style: "cancel" },
      {
        text: "回退接回分支",
        style: "destructive",
        onPress: () => promptRollbackContinuityImport(milestone),
      },
    ]);
  }

  function clearActiveStreamingIdentity() {
    const identity = activeStreamingIdentityRef.current;
    if (identity) {
      clearStreamingMessage(identity);
    }
    activeStreamingIdentityRef.current = null;
  }

  function clearStreamingIdentity(identity: ActiveStreamingIdentity | null) {
    if (!identity) {
      return;
    }
    clearStreamingMessage(identity);
    if (
      activeStreamingIdentityRef.current?.generationId ===
        identity.generationId &&
      activeStreamingIdentityRef.current?.messageId === identity.messageId
    ) {
      activeStreamingIdentityRef.current = null;
    }
  }

  async function flushActiveStreamingSnapshot() {
    const identity = activeStreamingIdentityRef.current;
    if (!identity) {
      return;
    }
    const snapshot = getStreamingMessageSnapshot(identity);
    if (!snapshot.hasSnapshot) {
      return;
    }
    await flushStreamingMessageSnapshot({
      assistantMessageId: identity.messageId,
      content: snapshot.content,
      generationId: identity.generationId,
      reasoningText: snapshot.reasoningText,
      space: identity.space,
    });
  }

  function getActiveStreamingVisibility(
    targetThreadId: string,
    generation: number,
  ) {
    // prettier-ignore
    const routeFocused = screenMountedRef.current && appActiveRef.current && isCurrentStream(targetThreadId, generation);
    return {
      appActive: screenMountedRef.current && appActiveRef.current,
      // bottomLocked is an auto-scroll attachment signal; route/app focus controls live streaming publication.
      bottomLocked: bottomLockedRef.current,
      routeFocused,
    };
  }

  function clearGenerationSubscription() {
    generationSubscriptionRef.current?.();
    generationSubscriptionRef.current = null;
  }

  function getLatestAssistantThinkingExpanded(): boolean {
    for (
      let index = visibleMessagesRef.current.length - 1;
      index >= 0;
      index -= 1
    ) {
      const message = visibleMessagesRef.current[index];
      if (message?.role === "assistant") {
        return thinkingExpandedByMessageIdRef.current.get(message.id) ?? false;
      }
    }
    return false;
  }

  function createGenerationSubscriber(
    targetThreadId: string,
    generation: number,
  ): AiGenerationSubscriber {
    return {
      // prettier-ignore
      getStreamingVisibility: () => getActiveStreamingVisibility(targetThreadId, generation),
      onCreated: ({ assistantMessageId, generationId }) => {
        if (!isCurrentStream(targetThreadId, generation)) {
          return;
        }
        const streamingIdentity = {
          generationId,
          messageId: assistantMessageId,
          space,
          threadId: targetThreadId,
        };
        activeStreamingIdentityRef.current = streamingIdentity;
        // prettier-ignore
        publishStreamingMessage(streamingIdentity, { content: '', reasoningText: null, status: 'generating' });
        // prettier-ignore
        thinkingExpandedByMessageIdRef.current.set(assistantMessageId, getLatestAssistantThinkingExpanded());
        setActiveAssistantId(assistantMessageId);
        setMessages((current) => {
          const nextMessages = current.some((message) => message.id === assistantMessageId)
            ? current
            : [
                ...current,
                // prettier-ignore
                createStreamingAssistantMessage(targetThreadId, assistantMessageId),
              ];
          messagesRef.current = nextMessages;
          rebuildMessageIndex(nextMessages);
          return nextMessages;
        });
        scheduleIntentionalLatestJump(false);
      },
      onMessagePatch: (patch) => {
        if (!isCurrentStreamingPatch(targetThreadId, generation, patch)) {
          return;
        }
        applyOrBufferStreamingMessagePatch(targetThreadId, generation, patch);
      },
      onSettled: () => {
        if (
          !isCurrentStream(targetThreadId, generation) ||
          !screenMountedRef.current
        ) {
          return;
        }
        setGenerating(false);
        setActiveAssistantId(null);
        setPendingMessageActionId(null);
        clearGenerationSubscription();
        if (
          hasPendingStreamingReadBuffer() ||
          !bottomLockedRef.current ||
          userScrolledAwayFromBottomRef.current
        ) {
          streamingReadBufferActiveRef.current = true;
          pendingFinalReloadRef.current = true;
          hasBufferedStreamingUpdateRef.current = true;
          pendingFinalStreamingIdentityRef.current =
            activeStreamingIdentityRef.current;
          syncScrollToLatestVisibility();
          scheduleStreamingTailReconcile("final-completion", {
            forceRender: true,
            retainWindow: true,
          });
          return;
        }
        void (async () => {
          await reloadMessages(targetThreadId);
          await reloadContinuityMilestones(targetThreadId);
          await reloadMemoryCaptures(targetThreadId);
          if (isCurrentStream(targetThreadId, generation)) {
            clearActiveStreamingIdentity();
          }
        })();
      },
      onUpdated: () => {
        if (!isCurrentStream(targetThreadId, generation)) {
          return;
        }
        void reloadMessages(targetThreadId);
        void reloadContinuityMilestones(targetThreadId);
      },
    };
  }

  function beginStreamingRequest(targetThreadId: string): {
    generation: number;
    subscriber: AiGenerationSubscriber;
  } {
    clearGenerationSubscription();
    resetStreamingReadBufferState();
    clearActiveStreamingIdentity();
    activeStreamGenerationRef.current += 1;
    activeThreadIdRef.current = targetThreadId;
    const generation = activeStreamGenerationRef.current;
    return {
      generation,
      subscriber: createGenerationSubscriber(targetThreadId, generation),
    };
  }

  function beginGenerationAction(): number | null {
    if (generationBusyRef.current) {
      return null;
    }
    generationBusyRef.current = true;
    generationActionTokenRef.current += 1;
    return generationActionTokenRef.current;
  }

  function finishGenerationAction(actionToken: number) {
    if (generationActionTokenRef.current === actionToken) {
      generationBusyRef.current = false;
    }
  }

  function isGenerationActionCurrent(actionToken: number): boolean {
    return (
      generationBusyRef.current &&
      generationActionTokenRef.current === actionToken
    );
  }

  function cancelGenerationAction() {
    generationActionTokenRef.current += 1;
    generationBusyRef.current = false;
  }

  function abortActiveStreamingRequest() {
    void flushActiveStreamingSnapshot();
    clearGenerationSubscription();
    clearActiveStreamingIdentity();
    activeStreamGenerationRef.current += 1;
  }

  function hasPendingStreamingReadBuffer(): boolean {
    return (
      streamingReadBufferActiveRef.current ||
      hasBufferedStreamingUpdateRef.current ||
      pendingFinalReloadRef.current
    );
  }

  function setScrollToLatestVisible(nextValue: boolean) {
    if (showScrollToLatestRef.current === nextValue) {
      return;
    }
    showScrollToLatestRef.current = nextValue;
    setShowScrollToLatest(nextValue);
  }

  function syncScrollToLatestVisibility(offsetY = messageScrollOffsetRef.current) {
    const nextShowScrollToLatest = offsetY > MESSAGE_SCROLL_BUTTON_THRESHOLD;
    setScrollToLatestVisible(nextShowScrollToLatest);
  }

  function getStreamingBubbleWidth() {
    const screenWidth = Dimensions.get("window").width;
    return (
      getLatestAssistantBubbleContentWidth() ??
      getAssistantBubbleContentWidthFallback({
        bubbleHorizontalPadding: spacing[3],
        messageStackRatio: 0.88,
        pagePaddingHorizontal: layout.pagePaddingHorizontal,
        screenWidth,
      })
    );
  }

  function freezeVisibleStreamingMessage(messageId: string) {
    if (frozenStreamingMessageByIdRef.current.has(messageId)) {
      return;
    }
    const visibleMessage = messagesRef.current.find(
      (message) => message.id === messageId,
    );
    if (visibleMessage) {
      const streamingIdentity = activeStreamingIdentityRef.current;
      const streamingSnapshot =
        streamingIdentity?.messageId === messageId
          ? getStreamingMessageSnapshot(streamingIdentity)
          : null;
      frozenStreamingMessageByIdRef.current.set(
        messageId,
        streamingSnapshot?.hasSnapshot
          ? {
              ...visibleMessage,
              content: streamingSnapshot.content,
              reasoningText: streamingSnapshot.reasoningText,
              status: streamingSnapshot.status,
              updatedAt: new Date(streamingSnapshot.updatedAt).toISOString(),
            }
          : visibleMessage,
      );
    }
  }

  function mergeBufferedStreamingPatch(patch: AiStreamingMessagePatch) {
    const current = bufferedStreamingPatchRef.current;
    if (!current || current.id !== patch.id) {
      bufferedStreamingPatchRef.current = patch;
      return;
    }
    bufferedStreamingPatchRef.current = {
      ...current,
      ...patch,
      status: patch.status ?? current.status,
      content: patch.content ?? current.content,
      reasoningText:
        patch.reasoningText === undefined
          ? current.reasoningText
          : patch.reasoningText,
      errorMessage:
        patch.errorMessage === undefined
          ? current.errorMessage
          : patch.errorMessage,
      providerId:
        patch.providerId === undefined ? current.providerId : patch.providerId,
      modelId: patch.modelId === undefined ? current.modelId : patch.modelId,
      modelSnapshotJson: patch.modelSnapshotJson ?? current.modelSnapshotJson,
      promptSnapshotJson:
        patch.promptSnapshotJson ?? current.promptSnapshotJson,
      createdAt: patch.createdAt ?? current.createdAt,
      completedAt:
        patch.completedAt === undefined
          ? current.completedAt
          : patch.completedAt,
      citations: patch.citations ?? current.citations,
    };
  }

  function preserveReadModeFrozenMessages(
    nextMessages: AiMessageWithCitations[],
  ): AiMessageWithCitations[] {
    if (
      !hasPendingStreamingReadBuffer() ||
      frozenStreamingMessageByIdRef.current.size === 0
    ) {
      return nextMessages;
    }
    return nextMessages.map(
      (message) =>
        frozenStreamingMessageByIdRef.current.get(message.id) ?? message,
    );
  }

  // prettier-ignore
  function preserveLiveStreamingMessages(nextMessages: AiMessageWithCitations[]): AiMessageWithCitations[] {
    return nextMessages.map((message) => {
      if (message.status !== 'generating') {
        return message;
      }
      const currentIndex = messageIndexByIdRef.current.get(message.id);
      const currentMessage =
        currentIndex == null ? undefined : messagesRef.current[currentIndex];
      if (!currentMessage || currentMessage.status !== 'generating') {
        return message;
      }
      const currentContentLength =
        currentMessage.content.length +
        (currentMessage.reasoningText?.length ?? 0);
      const nextContentLength =
        message.content.length + (message.reasoningText?.length ?? 0);
      if (
        currentContentLength === 0 ||
        nextContentLength >= currentContentLength
      ) {
        return message;
      }
      return {
        ...message,
        citations: currentMessage.citations,
        content: currentMessage.content,
        reasoningText: currentMessage.reasoningText,
        updatedAt: currentMessage.updatedAt,
      };
    });
  }

  function resetStreamingReadBufferState() {
    streamingReadBufferActiveRef.current = false;
    bufferedStreamingPatchRef.current = null;
    pendingFinalReloadRef.current = false;
    pendingFinalStreamingIdentityRef.current = null;
    hasBufferedStreamingUpdateRef.current = false;
    frozenStreamingMessageByIdRef.current.clear();
    bottomLockedRef.current = true;
    isNearBottomRef.current = true;
    escapedFromLockRef.current = false;
    isUserDraggingRef.current = false;
    messageScrollOffsetRef.current = 0;
    previousMessageScrollOffsetRef.current = 0;
    scrollingTowardLatestRef.current = true;
    userScrolledAwayFromBottomRef.current = false;
    setScrollToLatestVisible(false);
    if (userScrollIdleTimeoutRef.current) {
      clearTimeout(userScrollIdleTimeoutRef.current);
      userScrollIdleTimeoutRef.current = null;
    }
    if (shrinkSettlementTimeoutRef.current) {
      clearTimeout(shrinkSettlementTimeoutRef.current);
      shrinkSettlementTimeoutRef.current = null;
    }

    resetStreamingTailOccupancy();
  }

  function markIntentionalLatestJump() {
    bottomLockedRef.current = true;
    isNearBottomRef.current = true;
    escapedFromLockRef.current = false;
    messageScrollOffsetRef.current = 0;
    previousMessageScrollOffsetRef.current = 0;
    scrollingTowardLatestRef.current = true;
    userScrolledAwayFromBottomRef.current = false;
    setScrollToLatestVisible(false);
    allowFullShrinkSettlementRef.current = true;
    syncTailViewportPolicyForCurrentTailState();
  }

  const scrollToLatestMessage = useCallback(
    (animated = true, force = false) => {
      if (!force && userScrolledAwayFromBottomRef.current) {
        return;
      }
      if (force) {
        messageScrollOffsetRef.current = 0;
        previousMessageScrollOffsetRef.current = 0;
        scrollingTowardLatestRef.current = true;
      }
      messageListRef.current?.scrollToOffset({ animated, offset: 0 });
    },
    [],
  );

  // prettier-ignore
  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    scrollingTowardLatestRef.current =
      contentOffset.y <= previousMessageScrollOffsetRef.current;
    previousMessageScrollOffsetRef.current = contentOffset.y;
    messageScrollOffsetRef.current = contentOffset.y;
    lastUserScrollAtRef.current = Date.now();
    updateStreamingLockStateSnapshot(contentOffset.y);
    syncTailViewportPolicyForCurrentTailState();
    userScrolledAwayFromBottomRef.current = !isNearBottomRef.current;
    const nextShowScrollToLatest = contentOffset.y > MESSAGE_SCROLL_BUTTON_THRESHOLD;
    setScrollToLatestVisible(nextShowScrollToLatest);
    scheduleStreamingTailReconcile("scroll");
  }, [scheduleStreamingTailReconcile, syncTailViewportPolicyForCurrentTailState, updateStreamingLockStateSnapshot]);

  const followLatestMessage = useCallback(
    (animated = true) => {
      userScrolledAwayFromBottomRef.current = false;
      bottomLockedRef.current = true;
      isNearBottomRef.current = true;
      escapedFromLockRef.current = false;
      messageScrollOffsetRef.current = 0;
      previousMessageScrollOffsetRef.current = 0;
      scrollingTowardLatestRef.current = true;
      setScrollToLatestVisible(false);
      syncTailViewportPolicyForCurrentTailState();
      scrollToLatestMessage(animated, true);
    },
    [scrollToLatestMessage, syncTailViewportPolicyForCurrentTailState],
  );

  const queueFollowLatestMessageAfterLayout = useCallback(
    (animated = false) => {
      requestAnimationFrame(() => {
        if (!screenMountedRef.current) {
          return;
        }
        followLatestMessage(animated);
      });
    },
    [followLatestMessage],
  );

  function clearLatestJumpTimeouts() {
    latestJumpTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    latestJumpTimeoutsRef.current = [];
  }

  function scheduleIntentionalLatestJump(animated = false) {
    clearLatestJumpTimeouts();
    markIntentionalLatestJump();
    followLatestMessage(animated);
    queueFollowLatestMessageAfterLayout(animated);
    ACTIVE_LATEST_JUMP_RETRY_DELAYS_MS.forEach((delay) => {
      latestJumpTimeoutsRef.current.push(
        setTimeout(() => {
          if (!screenMountedRef.current) {
            return;
          }
          markIntentionalLatestJump();
          followLatestMessage(animated);
        }, delay),
      );
    });
  }

  function clearComposerFocusVisibilityTimeouts() {
    composerFocusVisibilityTimeoutsRef.current.forEach((timeout) =>
      clearTimeout(timeout),
    );
    composerFocusVisibilityTimeoutsRef.current = [];
  }

  function scheduleComposerFocusVisibility() {
    clearComposerFocusVisibilityTimeouts();
    followLatestMessage(false);
    COMPOSER_FOCUS_VISIBILITY_DELAYS_MS.forEach((delay) => {
      composerFocusVisibilityTimeoutsRef.current.push(
        setTimeout(() => followLatestMessage(false), delay),
      );
    });
  }

  function handleComposerFocus() {
    if (editingUserMessageIdRef.current) {
      return;
    }
    if (hasPendingStreamingReadBuffer()) {
      return;
    }
    scheduleComposerFocusVisibility();
  }

  const handleComposerHeightChange = useCallback(() => {
    if (editingUserMessageIdRef.current) {
      return;
    }
    if (pendingSearchScrollMessageIdRef.current) {
      return;
    }
    if (
      hasPendingStreamingReadBuffer() ||
      userScrolledAwayFromBottomRef.current ||
      !bottomLockedRef.current
    ) {
      scheduleStreamingTailReconcile("composer-height", { forceRender: true });
      return;
    }
    scheduleStreamingTailReconcile("composer-height", {
      allowFollowLatest: true,
      retainWindow: true,
    });
  }, [scheduleStreamingTailReconcile]);

  function clearInlineEditVisibilityTimeouts() {
    inlineEditVisibilityTimeoutsRef.current.forEach((timeout) =>
      clearTimeout(timeout),
    );
    inlineEditVisibilityTimeoutsRef.current = [];
  }

  function clearBranchTreeScrollTimeouts() {
    branchTreeScrollTimeoutsRef.current.forEach((timeout) =>
      clearTimeout(timeout),
    );
    branchTreeScrollTimeoutsRef.current = [];
  }

  function clearSearchScrollTimeouts() {
    searchScrollTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    searchScrollTimeoutsRef.current = [];
  }

  function clearSearchHighlightTimeout() {
    if (searchHighlightTimeoutRef.current) {
      clearTimeout(searchHighlightTimeoutRef.current);
      searchHighlightTimeoutRef.current = null;
    }
  }

  function clearVoiceResetTimeout() {
    if (voiceResetTimeoutRef.current) {
      clearTimeout(voiceResetTimeoutRef.current);
      voiceResetTimeoutRef.current = null;
    }
  }

  function scrollBranchTreeTargetIntoView(messageId: string) {
    if (pendingBranchTreeScrollMessageIdRef.current !== messageId) {
      return;
    }
    const index = invertedMessageIndexById.get(messageId);
    if (index == null) {
      return;
    }
    messageListRef.current?.scrollToIndex({
      animated: true,
      index,
      viewPosition: 0.42,
    });
  }

  // prettier-ignore
  function retryBranchTreeScrollToIndex(info: { averageItemLength: number; index: number }) {
    const targetMessageId = pendingBranchTreeScrollMessageIdRef.current;
    if (!targetMessageId) {
      return;
    }
    const failedMessageId = getMessageItemIdAtIndex(info.index);
    if (failedMessageId !== targetMessageId) {
      return;
    }
    messageListRef.current?.scrollToOffset({
      animated: true,
      offset: Math.max(0, info.averageItemLength * info.index),
    });
    branchTreeScrollTimeoutsRef.current.push(
      setTimeout(
        () => scrollBranchTreeTargetIntoView(targetMessageId),
        INLINE_EDIT_SCROLL_RETRY_DELAY_MS,
      ),
    );
  }

  function scheduleBranchTreeTargetScroll(messageId: string) {
    clearBranchTreeScrollTimeouts();
    branchTreeScrollTimeoutsRef.current =
      BRANCH_TREE_SCROLL_RETRY_DELAYS_MS.map((delay) =>
        setTimeout(() => scrollBranchTreeTargetIntoView(messageId), delay),
      );
  }

  function scrollSearchTargetIntoView(messageId: string) {
    if (pendingSearchScrollMessageIdRef.current !== messageId) {
      return;
    }
    const index = invertedMessageIndexById.get(messageId);
    if (index == null) {
      return;
    }
    messageListRef.current?.scrollToIndex({
      animated: true,
      index,
      viewPosition: 0.42,
    });
  }

  // prettier-ignore
  function retrySearchScrollToIndex(info: { averageItemLength: number; index: number }) {
    const targetMessageId = pendingSearchScrollMessageIdRef.current;
    if (!targetMessageId) {
      return;
    }
    const failedMessageId = getMessageItemIdAtIndex(info.index);
    if (failedMessageId !== targetMessageId) {
      return;
    }
    messageListRef.current?.scrollToOffset({
      animated: true,
      offset: Math.max(0, info.averageItemLength * info.index),
    });
    searchScrollTimeoutsRef.current.push(
      setTimeout(
        () => scrollSearchTargetIntoView(targetMessageId),
        INLINE_EDIT_SCROLL_RETRY_DELAY_MS,
      ),
    );
  }

  function scheduleSearchTargetScroll(messageId: string) {
    clearSearchScrollTimeouts();
    searchScrollTimeoutsRef.current = SEARCH_SCROLL_RETRY_DELAYS_MS.map(
      (delay) => setTimeout(() => scrollSearchTargetIntoView(messageId), delay),
    );
  }

  function flashSearchHighlight(messageId: string) {
    clearSearchHighlightTimeout();
    setSearchHighlightMessageId(messageId);
    searchHighlightTimeoutRef.current = setTimeout(() => {
      setSearchHighlightMessageId((current) =>
        current === messageId ? null : current,
      );
      searchHighlightTimeoutRef.current = null;
    }, SEARCH_HIGHLIGHT_DURATION_MS);
  }

  function scrollInlineEditMessageIntoView(messageId: string) {
    if (editingUserMessageIdRef.current !== messageId) {
      return;
    }
    if (inlineEditSafeVisibleMessageIdsRef.current.has(messageId)) {
      return;
    }
    const index = invertedMessageIndexById.get(messageId);
    if (index == null) {
      return;
    }
    messageListRef.current?.scrollToIndex({
      animated: true,
      index,
      viewPosition: 0.42,
    });
  }

  function retryInlineEditScrollToIndex(info: {
    averageItemLength: number;
    index: number;
  }) {
    const failedMessageId = getMessageItemIdAtIndex(info.index);
    if (
      !failedMessageId ||
      editingUserMessageIdRef.current !== failedMessageId ||
      inlineEditSafeVisibleMessageIdsRef.current.has(failedMessageId)
    ) {
      return;
    }
    messageListRef.current?.scrollToOffset({
      animated: true,
      offset: Math.max(0, info.averageItemLength * info.index),
    });
    inlineEditVisibilityTimeoutsRef.current.push(
      setTimeout(
        () => scrollInlineEditMessageIntoView(failedMessageId),
        INLINE_EDIT_SCROLL_RETRY_DELAY_MS,
      ),
    );
  }

  function scheduleInlineEditVisibility(messageId: string) {
    clearInlineEditVisibilityTimeouts();
    inlineEditVisibilityTimeoutsRef.current =
      INLINE_EDIT_VISIBILITY_SCROLL_DELAYS_MS.map((delay) =>
        setTimeout(() => scrollInlineEditMessageIntoView(messageId), delay),
      );
  }

  function handleMessageScrollToIndexFailed(info: {
    averageItemLength: number;
    index: number;
  }) {
    retryInlineEditScrollToIndex(info);
    retryBranchTreeScrollToIndex(info);
    retrySearchScrollToIndex(info);
  }

  function showLatestMessageVersion(messageId: string) {
    setSelectedVersionByMessageId((current) => {
      if (!(messageId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  function getActiveBranchForNextMessage(): {
    branchRootMessageId: string;
    branchVersionIndex: number;
  } | null {
    return getActiveBranchForNextMessageFromVisibleMessages(
      visibleMessages,
      selectedVersionByMessageId,
    );
  }

  function getActiveBranchForSelection(selectionMap: Record<string, number>): AiBranchScope | null {
    const visibleBranchMessages = messages.filter((message) =>
      messageMatchesSelectedBranchPath(message, messagesById, selectionMap),
    );
    return getActiveBranchForNextMessageFromVisibleMessages(
      visibleBranchMessages,
      selectionMap,
    );
  }

  function getCurrentBranchScopesForSelection(
    selectionMap: Record<string, number>,
  ): AiBranchScope[] {
    const explicitScopes = Object.entries(selectionMap).map(
      ([branchRootMessageId, branchVersionIndex]) => ({
        branchRootMessageId,
        branchVersionIndex,
      }),
    );
    const activeBranch = getActiveBranchForSelection(selectionMap);
    if (!activeBranch) {
      return explicitScopes;
    }
    if (
      explicitScopes.some(
        (scope) =>
          scope.branchRootMessageId === activeBranch.branchRootMessageId,
      )
    ) {
      return explicitScopes;
    }
    return [...explicitScopes, activeBranch];
  }

  function branchScopesFromSelectionMap(
    selectionMap: Record<string, number>,
  ): AiBranchScope[] {
    return Object.entries(selectionMap).map(
      ([branchRootMessageId, branchVersionIndex]) => ({
        branchRootMessageId,
        branchVersionIndex,
      }),
    );
  }

  function getCurrentBranchScopes(): AiBranchScope[] {
    return getCurrentBranchScopesForSelection(selectedVersionByMessageId);
  }

  function getPersistedCurrentBranchScopes(): AiBranchScope[] {
    return persistedCurrentBranchScopes.length > 0
      ? persistedCurrentBranchScopes
      : getCurrentBranchScopes();
  }

  const favoriteBranchIdentityState = useMemo(() => {
    const branchScopes = getPersistedCurrentBranchScopes();
    const normalizedScopes = branchScopes.slice().sort((left, right) => {
      const rootCompare = left.branchRootMessageId.localeCompare(
        right.branchRootMessageId,
      );
      return rootCompare !== 0
        ? rootCompare
        : left.branchVersionIndex - right.branchVersionIndex;
    });
    return {
      branchScopeSignature: JSON.stringify(normalizedScopes),
      branchScopes,
    };
  }, [persistedCurrentBranchScopes, selectedVersionByMessageId]);

  function buildMessageFavoriteIdentity(
    message: AiMessageWithCitations,
  ): MessageFavoriteIdentity {
    const key = [
      space,
      message.id,
      favoriteBranchIdentityState.branchScopeSignature,
      message.versionIndex ?? "current",
    ].join("|");
    return {
      branchScopes: favoriteBranchIdentityState.branchScopes,
      key,
      messageVersionIndex: message.versionIndex,
    };
  }

  const favoriteIdentityByMessageId = useMemo(() => {
    const next = new Map<string, MessageFavoriteIdentity>();
    for (const message of visibleMessages) {
      if (message.role === "assistant") {
        next.set(message.id, buildMessageFavoriteIdentity(message));
      }
    }
    return next;
  }, [favoriteBranchIdentityState, space, visibleMessages]);

  const assistantFavoriteKeyState = useMemo(() => {
    // prettier-ignore
    const keys = Array.from(favoriteIdentityByMessageId.values()).map((identity) => identity.key);
    return {
      keys,
      // prettier-ignore
      signature: keys.join('\u001f'),
    };
  }, [favoriteIdentityByMessageId]);

  const applyDisplayTitle = useCallback(
    (title: string) => {
      if (title === displayTitleRef.current) {
        return;
      }
      displayTitleRef.current = title;
      setDisplayTitle(title);
      onThreadTitleChange?.(title);
    },
    [onThreadTitleChange],
  );

  function rebuildMessageIndex(nextMessages: AiMessageWithCitations[]): void {
    messageIndexByIdRef.current = new Map(
      nextMessages.map((message, index) => [message.id, index]),
    );
  }

  function replaceMessages(nextMessages: AiMessageWithCitations[]): void {
    messagesRef.current = nextMessages;
    rebuildMessageIndex(nextMessages);
    setMessages(nextMessages);
  }

  const reloadContinuityMilestones = useCallback(
    async (targetThreadId: string | null) => {
      const requestId = nextRequestId("continuity");
      if (!targetThreadId) {
        setContinuityMilestones([]);
        return;
      }
      const nextContinuityMilestones = await loadThreadContinuityMilestones(
        space,
        targetThreadId,
      );
      if (!isLatestRequest("continuity", requestId, targetThreadId)) {
        return;
      }
      setContinuityMilestones(nextContinuityMilestones);
    },
    [space],
  );

  const reloadMessages = useCallback(
    async (
      targetThreadId: string | null,
      forceToLatestOrOptions: boolean | ReloadMessagesOptions = false,
      branchScopesOverride?: AiBranchScope[],
      limitOverride?: number,
    ) => {
      const requestId = nextRequestId("messages");
      const options: ReloadMessagesOptions =
        typeof forceToLatestOrOptions === "object"
          ? forceToLatestOrOptions
          : {
              branchScopes: branchScopesOverride,
              forceToLatest: forceToLatestOrOptions,
              limitOverride,
            };
      if (!targetThreadId) {
        resetStreamingReadBufferState();
        replaceMessages([]);
        void reloadContinuityMilestones(null);
        setHasEarlierMessages(false);
        loadedMessageLimitRef.current = CHAT_MESSAGE_PAGE_SIZE;
        setLoadedMessageLimit(CHAT_MESSAGE_PAGE_SIZE);
        setMemoryCaptures([]);
        isLoadingEarlierRef.current = false;
        userScrolledAwayFromBottomRef.current = false;
        bottomLockedRef.current = true;
        setScrollToLatestVisible(false);
        return;
      }
      const forceToLatest = options.forceToLatest ?? false;
      const branchScopes = options.branchScopes;
      const messageLimit =
        options.limitOverride ?? loadedMessageLimitRef.current;
      const nextMessages = await listThreadMessages(space, targetThreadId, {
        anchorMessageId: options.anchorMessageId,
        branchScopes:
          branchScopes && branchScopes.length > 0 ? branchScopes : undefined,
        limit: messageLimit,
        selectedVersionByMessageId: selectedVersionByMessageIdRef.current,
      });
      if (!isLatestRequest("messages", requestId, targetThreadId)) {
        return;
      }
      activeMessageBranchScopesRef.current =
        branchScopes && branchScopes.length > 0 ? branchScopes : undefined;
      setHasEarlierMessages(
        options.anchorMessageId ? true : nextMessages.length >= messageLimit,
      );
      if (forceToLatest) {
        userScrolledAwayFromBottomRef.current = false;
        bottomLockedRef.current = true;
        messageScrollOffsetRef.current = 0;
        previousMessageScrollOffsetRef.current = 0;
        scrollingTowardLatestRef.current = true;
        setScrollToLatestVisible(false);
      }
      // prettier-ignore
      const renderedMessages = preserveLiveStreamingMessages(forceToLatest ? nextMessages : preserveReadModeFrozenMessages(nextMessages));
      replaceMessages(renderedMessages);
      const titleRequestId = nextRequestId("title");
      void loadThreadTitle(space, targetThreadId).then((title) => {
        if (title && isLatestRequest("title", titleRequestId, targetThreadId)) {
          applyDisplayTitle(title);
        }
      });
      void reloadContinuityMilestones(targetThreadId);
    },
    [applyDisplayTitle, reloadContinuityMilestones, space],
  );

  async function loadPersistedCurrentBranchScopes(targetThreadId: string): Promise<AiBranchScope[]> {
    return runWithDatabaseSpace(space, async (db) => {
      const thread = await aiThreadRepository.findThreadById(
        db,
        targetThreadId,
      );
      if (
        !thread?.currentBranchRootMessageId ||
        thread.currentBranchVersionIndex == null
      ) {
        return [];
      }
      return aiThreadRepository.resolveBranchLineage(
        db,
        thread.currentBranchRootMessageId,
        thread.currentBranchVersionIndex,
      );
    });
  }

  async function syncPersistedCurrentBranchRoute(targetThreadId: string, applySelection = false): Promise<AiBranchScope[]> {
    const currentBranchScopes =
      await loadPersistedCurrentBranchScopes(targetThreadId);
    if (
      !screenMountedRef.current ||
      activeThreadIdRef.current !== targetThreadId
    ) {
      return currentBranchScopes;
    }
    setPersistedCurrentBranchScopes(currentBranchScopes);
    if (applySelection) {
      setSelectedVersionByMessageId(buildBranchSelectionMap(currentBranchScopes));
    }
    return currentBranchScopes;
  }

  async function persistCurrentBranchRoute(activeBranch: AiBranchScope | null): Promise<void> {
    const targetThreadId = activeThreadIdRef.current;
    if (!targetThreadId) {
      return;
    }
    const branchRootMessageId = activeBranch ? activeBranch.branchRootMessageId : null;
    const branchVersionIndex = activeBranch ? activeBranch.branchVersionIndex : null;
    await runWithDatabaseSpace(space, async (db) => {
      await aiThreadRepository.setThreadCurrentBranch(db, {
        branchRootMessageId,
        branchVersionIndex,
        threadId: targetThreadId,
      });
    });
  }

  const applyStreamingMessagePatch = useCallback(
    (patch: AiStreamingMessagePatch) => {
      setMessages((current) => {
        const messageIndex = messageIndexByIdRef.current.get(patch.id);
        if (messageIndex != null && current[messageIndex]?.id === patch.id) {
          const nextMessages = current.slice();
          nextMessages[messageIndex] = applyStreamingPatchToMessage(
            current[messageIndex],
            patch,
          );
          messagesRef.current = nextMessages;
          return nextMessages;
        }
        const nextMessages = current.map((message) =>
          message.id === patch.id
            ? applyStreamingPatchToMessage(message, patch)
            : message,
        );
        messagesRef.current = nextMessages;
        rebuildMessageIndex(nextMessages);
        return nextMessages;
      });
    },
    [],
  );

  const applyOrBufferStreamingMessagePatch = useCallback(
    (
      targetThreadId: string,
      generation: number,
      patch: AiStreamingMessagePatch,
    ) => {
      const streamingIdentity = activeStreamingIdentityRef.current;
      const canPublishLive = Boolean(
        streamingIdentity &&
        patch.id === streamingIdentity.messageId &&
        patch.generationId === streamingIdentity.generationId &&
        shouldUseLiveStreamingPatch(patch) &&
        shouldPublishLiveStreamingPatch(targetThreadId, generation, patch),
      );

      // prettier-ignore
      const canAttachLiveLayout = bottomLockedRef.current && !hasPendingStreamingReadBuffer();

      if (canAttachLiveLayout && canPublishLive && streamingIdentity) {
        publishStreamingMessage(streamingIdentity, {
          content: patch.content,
          reasoningText: patch.reasoningText,
          status: patch.status === "generating" ? patch.status : undefined,
        });
      }

      if (canAttachLiveLayout) {
        if (canPublishLive) {
          return;
        }
        applyStreamingMessagePatch(patch);
      } else {
        streamingTailPerfDebug.incrementDetachedPatchCount();
        bottomLockedRef.current = false;
        const targetBubbleWidth = getStreamingBubbleWidth();
        streamingReadBufferActiveRef.current = true;
        hasBufferedStreamingUpdateRef.current = true;
        freezeVisibleStreamingMessage(patch.id);
        mergeBufferedStreamingPatch(patch);

        if (patch.generationId) {
          const currentTailState = streamingTailStateRef.current;
          const frozenMessage = frozenStreamingMessageByIdRef.current.get(
            patch.id,
          );
          const shouldStartDetachedTail =
            Boolean(frozenMessage) &&
            (currentTailState.status === "idle" ||
              currentTailState.messageId !== patch.id ||
              currentTailState.generationId !== patch.generationId);

          const tailStateToMerge =
            shouldStartDetachedTail && frozenMessage
              ? startStreamingTailDetach({
                  bubbleWidth: targetBubbleWidth,
                  currentContent: frozenMessage.content ?? "",
                  currentReasoningText: frozenMessage.reasoningText ?? null,
                  generationId: patch.generationId,
                  messageId: patch.id,
                  targetContent: patch.content ?? frozenMessage.content ?? "",
                  targetReasoningText:
                    patch.reasoningText ?? frozenMessage.reasoningText ?? null,
                })
              : currentTailState;
          if (shouldStartDetachedTail) {
            maxTailReservedHeightRef.current = 0;
            maxTailReservedHeightMessageIdRef.current = null;
          }
          const nextTailState = mergeStreamingTailPatch({
            bubbleWidth: targetBubbleWidth,
            patch,
            previous: tailStateToMerge,
          });
          if (nextTailState !== currentTailState) {
            streamingTailStateRef.current = nextTailState;
            forceUpdateTailState();
            scheduleStreamingTailReconcile("detached-patch", {
              forceRender: true,
            });
          }
        }

        syncScrollToLatestVisibility();
      }
    },
    [applyStreamingMessagePatch, scheduleStreamingTailReconcile],
  );

  const loadEarlierMessages = useCallback(() => {
    const targetThreadId = activeThreadIdRef.current;
    const nextLimit = loadedMessageLimitRef.current + CHAT_MESSAGE_PAGE_SIZE;
    isLoadingEarlierRef.current = true;
    loadedMessageLimitRef.current = nextLimit;
    setLoadedMessageLimit(nextLimit);
    if (targetThreadId) {
      // prettier-ignore
      void reloadMessages(targetThreadId, false, activeMessageBranchScopesRef.current, nextLimit);
    }
  }, [reloadMessages]);

  const reloadThreadTitle = useCallback(
    async (targetThreadId: string | null) => {
      const requestId = nextRequestId("title");
      if (!targetThreadId) {
        applyDisplayTitle(resolvedContextTitle);
        return;
      }
      const title = await loadThreadTitle(space, targetThreadId);
      if (title && isLatestRequest("title", requestId, targetThreadId)) {
        applyDisplayTitle(title);
      }
    },
    [applyDisplayTitle, resolvedContextTitle, space],
  );

  const reloadModelLabel = useCallback(
    async (targetThreadId: string | null) => {
      const requestId = nextRequestId("model");
      const [label, brand] = await Promise.all([
        getCurrentChatModelLabel(space, targetThreadId),
        getCurrentChatModelIconBrand(space, targetThreadId),
      ]);
      if (!isLatestRequest("model", requestId, targetThreadId)) {
        return;
      }
      setModelLabel(label);
      setModelIconBrand(brand);
    },
    [space],
  );

  const reloadParticipantAppearance = useCallback(
    async (targetThreadId: string | null) => {
      const requestId = nextRequestId("avatar");
      if (!targetThreadId) {
        setParticipantAppearance({
          assistantAvatarEnabled: false,
          assistantAvatarUri: null,
          assistantName: null,
          userAvatarEnabled: DEFAULT_AI_USER_AVATAR_ENABLED,
          userAvatarUri: null,
          userNickname: null,
        });
        return;
      }
      const [
        nextAppearanceConfig,
        nextUserAvatarUri,
        nextUserNickname,
      ] = await Promise.all([
        loadThreadMessageAppearanceConfig(space, targetThreadId),
        runWithDatabaseSpace(space, (db) =>
          settingsRepository.getProfileAvatarUri(db),
        ),
        runWithDatabaseSpace(space, (db) =>
          settingsRepository.getProfileNickname(db),
        ),
      ]);
      if (!isLatestRequest("avatar", requestId, targetThreadId)) {
        return;
      }
      setParticipantAppearance({
        assistantAvatarEnabled: nextAppearanceConfig.assistantAvatar.avatarEnabled,
        assistantAvatarUri: nextAppearanceConfig.assistantAvatar.avatarUri,
        assistantName: nextAppearanceConfig.assistantName,
        userAvatarEnabled: nextAppearanceConfig.userAvatarEnabled,
        userAvatarUri: nextUserAvatarUri,
        userNickname: nextUserNickname,
      });
    },
    [space],
  );

  const reloadMemoryCaptures = useCallback(
    async (targetThreadId: string | null) => {
      const requestId = nextRequestId("memory");
      if (!targetThreadId) {
        setMemoryCaptures([]);
        return;
      }
      const captures = await listRecentMemoryCaptures(space, targetThreadId);
      if (!isLatestRequest("memory", requestId, targetThreadId)) {
        return;
      }
      setMemoryCaptures(captures);
    },
    [space],
  );

  const reloadRecentThreads = useCallback(async () => {
    setRecentThreads(await listAiHistoryThreads({ limit: 15, space }));
  }, [space]);

  const flushBufferedStreamingState = useCallback(
    async ({ followLatest }: { followLatest: boolean }) => {
      const bufferedPatch = bufferedStreamingPatchRef.current;
      const shouldReloadFinal = pendingFinalReloadRef.current;
      const pendingFinalStreamingIdentity =
        pendingFinalStreamingIdentityRef.current;
      const targetThreadId = activeThreadIdRef.current;
      const shouldResetTailAfterFlush =
        followLatest ||
        bottomLockedRef.current ||
        messageScrollOffsetRef.current <= MESSAGE_SAFE_FLUSH_OFFSET;

      streamingReadBufferActiveRef.current = false;
      bufferedStreamingPatchRef.current = null;
      pendingFinalReloadRef.current = false;
      pendingFinalStreamingIdentityRef.current = null;
      hasBufferedStreamingUpdateRef.current = false;
      frozenStreamingMessageByIdRef.current.clear();
      bottomLockedRef.current = bottomLockedRef.current || followLatest || messageScrollOffsetRef.current <= MESSAGE_SAFE_FLUSH_OFFSET;
      isNearBottomRef.current = bottomLockedRef.current || messageScrollOffsetRef.current <= STICK_TO_BOTTOM_OFFSET_PX;
      escapedFromLockRef.current = !isNearBottomRef.current;
      if (followLatest) {
        allowFullShrinkSettlementRef.current = true;
        maybeSettleStreamingTailShrinkDebt("return-to-latest");
        followLatestMessage();
      } else {
        setScrollToLatestVisible(false);
      }
      if (bufferedPatch) {
        const streamingIdentity = activeStreamingIdentityRef.current;
        if (
          streamingIdentity &&
          bufferedPatch.id === streamingIdentity.messageId &&
          bufferedPatch.generationId === streamingIdentity.generationId
        ) {
          publishStreamingMessage(streamingIdentity, {
            content: bufferedPatch.content,
            reasoningText: bufferedPatch.reasoningText,
            status:
              bufferedPatch.status === "completed" ||
              bufferedPatch.status === "failed" ||
              bufferedPatch.status === "generating" ||
              bufferedPatch.status === "stopped"
                ? bufferedPatch.status
                : undefined,
          });
        }
        applyStreamingMessagePatch(bufferedPatch);
      }
      if (shouldResetTailAfterFlush) {
        resetStreamingTailOccupancy();
      }
      if (shouldReloadFinal && targetThreadId) {
        await reloadMessages(targetThreadId, followLatest);
        await reloadContinuityMilestones(targetThreadId);
        await reloadMemoryCaptures(targetThreadId);
        clearStreamingIdentity(pendingFinalStreamingIdentity);
      }
    },
    [
      applyStreamingMessagePatch,
      followLatestMessage,
      maybeSettleStreamingTailShrinkDebt,
      reloadContinuityMilestones,
      reloadMemoryCaptures,
      reloadMessages,
    ],
  );

  const handleMessageScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isUserDraggingRef.current = true;
      lastUserScrollAtRef.current = Date.now();
      scrollingTowardLatestRef.current =
        event.nativeEvent.contentOffset.y <= previousMessageScrollOffsetRef.current;
      previousMessageScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      messageScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      updateStreamingLockStateSnapshot(messageScrollOffsetRef.current);
      syncTailViewportPolicyForCurrentTailState();
      if (userScrollIdleTimeoutRef.current) {
        clearTimeout(userScrollIdleTimeoutRef.current);
        userScrollIdleTimeoutRef.current = null;
      }
    },
    [syncTailViewportPolicyForCurrentTailState, updateStreamingLockStateSnapshot],
  );

  const markScrollGestureSettled = useCallback(() => {
    if (userScrollIdleTimeoutRef.current) {
      clearTimeout(userScrollIdleTimeoutRef.current);
    }
    userScrollIdleTimeoutRef.current = setTimeout(() => {
      userScrollIdleTimeoutRef.current = null;
      if (Date.now() - lastUserScrollAtRef.current < USER_SCROLL_IDLE_TIMEOUT_MS) {
        markScrollGestureSettled();
        return;
      }
      isUserDraggingRef.current = false;
      scheduleStreamingTailReconcile("scroll-settled", {
        allowFollowLatest: bottomLockedRef.current || isNearBottomRef.current,
        retainWindow: true,
      });
    }, USER_SCROLL_IDLE_TIMEOUT_MS);
  }, [scheduleStreamingTailReconcile]);

  const handleMessageScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      scrollingTowardLatestRef.current =
        offsetY <= previousMessageScrollOffsetRef.current;
      previousMessageScrollOffsetRef.current = offsetY;
      messageScrollOffsetRef.current = offsetY;
      lastUserScrollAtRef.current = Date.now();
      updateStreamingLockStateSnapshot(offsetY);
      syncTailViewportPolicyForCurrentTailState();
      const hasPendingBufferedFlush = hasBufferedStreamingUpdateRef.current || pendingFinalReloadRef.current;
      if (event.nativeEvent.contentOffset.y <= MESSAGE_SAFE_FLUSH_OFFSET) {
        bottomLockedRef.current = true;
        isNearBottomRef.current = true;
        escapedFromLockRef.current = false;
        userScrolledAwayFromBottomRef.current = false;
        isUserDraggingRef.current = false;
        previousMessageScrollOffsetRef.current = 0;
        scrollingTowardLatestRef.current = true;
        if (!hasPendingBufferedFlush) {
          syncScrollToLatestVisibility(offsetY);
          markScrollGestureSettled();
          return;
        }
        void flushBufferedStreamingState({ followLatest: false });
        markScrollGestureSettled();
        return;
      }
      syncScrollToLatestVisibility(offsetY);
      markScrollGestureSettled();
    },
    [
      flushBufferedStreamingState,
      markScrollGestureSettled,
      syncTailViewportPolicyForCurrentTailState,
      updateStreamingLockStateSnapshot,
    ],
  );

  useEffect(() => {
    const tailState = streamingTailStateRef.current;
    if (
      !generating ||
      tailState.status !== "detached" ||
      tailViewportPolicy.hotZone === "cold"
    ) {
      return;
    }
    const intervalMs = Math.max(
      34,
      Math.ceil(1000 / tailViewportPolicy.targetDetachedFps),
    );
    const intervalId = setInterval(() => {
      scheduleStreamingTailReconcile("detached-fast-path");
    }, intervalMs);
    return () => {
      clearInterval(intervalId);
    };
  }, [
    generating,
    scheduleStreamingTailReconcile,
    streamingTailVersion,
    tailViewportPolicy.hotZone,
    tailViewportPolicy.targetDetachedFps,
  ]);

  const tailReplayReadinessActive =
    streamingTailStateRef.current.status !== "idle" &&
    tailViewportPolicy.shouldExpandRenderWindow;
  const shouldRelaxClipping =
    streamingTailStateRef.current.status !== "idle" &&
    tailViewportPolicy.shouldRelaxClipping;
  const shouldExpandRenderWindow = tailReplayReadinessActive;
  const tailListMaxToRenderPerBatch = shouldExpandRenderWindow ? 16 : 8;
  const tailListWindowSize = shouldExpandRenderWindow ? 15 : 11;
  const tailListUpdateCellsBatchingPeriod = shouldExpandRenderWindow ? 16 : 50;
  const tailListRemoveClippedSubviews =
    Platform.OS === "android" ? !shouldRelaxClipping : undefined;

  const handleReturnToLatestPress = useCallback(() => {
    bottomLockedRef.current = true;
    isNearBottomRef.current = true;
    escapedFromLockRef.current = false;
    userScrolledAwayFromBottomRef.current = false;
    messageScrollOffsetRef.current = 0;
    previousMessageScrollOffsetRef.current = 0;
    scrollingTowardLatestRef.current = true;
    setShowScrollToLatest(false);
    showScrollToLatestRef.current = false;
    syncTailViewportPolicyForCurrentTailState();
    void flushBufferedStreamingState({ followLatest: true });
  }, [flushBufferedStreamingState, syncTailViewportPolicyForCurrentTailState]);

  async function renameRecentThread(
    thread: AiThreadHistoryItem,
    title: string,
  ) {
    await renameAiThread(space, thread.id, title);
    await reloadRecentThreads();
    if (thread.id === activeThreadIdRef.current) {
      applyDisplayTitle(title);
    }
  }

  async function deleteRecentThread(thread: AiThreadHistoryItem) {
    await deleteAiThreads(space, [thread.id]);
    await reloadRecentThreads();
    if (thread.id === activeThreadIdRef.current) {
      onNewChat();
    }
  }

  useEffect(() => {
    const nextThreadId = threadId ?? null;
    const nextDisplayTitle =
      contextTitle ??
      (contextType === "ip"
        ? "IP 对话"
        : contextType === "knowledge_base"
          ? "知识库对话"
          : "普通聊天");
    if (activeThreadIdRef.current === nextThreadId) {
      setActiveThreadId(nextThreadId);
      applyDisplayTitle(nextDisplayTitle);
      return;
    }
    activeThreadIdRef.current = nextThreadId;
    setActiveThreadId(nextThreadId);
    thinkingExpandedByMessageIdRef.current.clear();
    clearComposerFocusVisibilityTimeouts();
    clearLatestJumpTimeouts();
    clearInlineEditVisibilityTimeouts();
    clearSearchScrollTimeouts();
    clearSearchHighlightTimeout();
    inlineEditSafeVisibleMessageIdsRef.current = new Set();
    pendingSearchScrollMessageIdRef.current = null;
    editingUserMessageIdRef.current = null;
    setEditingUserMessageId(null);
    setSelectedVersionByMessageId({});
    setPendingAttachments([]);
    clearGenerationSubscription();
    clearActiveStreamingIdentity();
    activeStreamGenerationRef.current += 1;
    resetStreamingReadBufferState();
    setGenerating(false);
    setActiveAssistantId(null);
    setLoadedMessageLimit(CHAT_MESSAGE_PAGE_SIZE);
    setHasEarlierMessages(false);
    setSearchHighlightMessageId(null);
    if (!nextThreadId) {
      replaceMessages([]);
      visibleMessagesRef.current = [];
      setMemoryCaptures([]);
    }
    userScrolledAwayFromBottomRef.current = false;
    bottomLockedRef.current = true;
    setScrollToLatestVisible(false);
    applyDisplayTitle(nextDisplayTitle);
  }, [applyDisplayTitle, contextTitle, contextType, threadId]);

  // prettier-ignore
  useEffect(() => {
    const targetThreadId = threadId ?? null;
    if (!targetThreadId) {
      scrollToLatestMessage(false, true);
      void reloadMessages(null, true);
      return;
    }
    let cancelled = false;
    const hasSearchTarget = Boolean(searchTargetMessageId);
    void (async () => {
      let currentBranchScopes: AiBranchScope[] = [];
      try {
        currentBranchScopes = searchTargetBranchScopes ?? await loadPersistedCurrentBranchScopes(targetThreadId);
      } catch {
        currentBranchScopes = [];
      }
      if (cancelled) {
        return;
      }
      setPersistedCurrentBranchScopes(currentBranchScopes);
      if (currentBranchScopes.length > 0) {
        setSelectedVersionByMessageId(buildBranchSelectionMap(currentBranchScopes));
      }
      await reloadMessages(targetThreadId, {
        anchorMessageId: searchTargetMessageId ?? undefined,
        branchScopes: currentBranchScopes,
        forceToLatest: !hasSearchTarget,
      });
      if (!cancelled) {
        if (hasSearchTarget) {
          return;
        }
        scrollToLatestMessage(false, true);
        scheduleIntentionalLatestJump(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadMessages, scrollToLatestMessage, searchTargetBranchScopes, searchTargetMessageId, threadId]);

  useEffect(() => {
    messagesRef.current = messages;
    rebuildMessageIndex(messages);
  }, [messages]);

  useEffect(() => {
    selectedVersionByMessageIdRef.current = selectedVersionByMessageId;
  }, [selectedVersionByMessageId]);

  useEffect(() => {
    visibleMessagesRef.current = visibleMessages;
  }, [visibleMessages]);

  useEffect(() => {
    const favoriteKeys = assistantFavoriteKeyState.keys;
    if (favoriteKeys.length === 0) {
      setFavoriteStateByKey({});
      return;
    }
    let cancelled = false;
    void (async () => {
      // prettier-ignore
      const favoritedKeys = await listFavoriteAssistantMessageKeys({ favoriteKeys, space });
      const entries = favoriteKeys.map(
        (key) => [key, favoritedKeys.has(key)] as const,
      );
      if (!cancelled) {
        setFavoriteStateByKey(Object.fromEntries(entries));
      }
    })().catch((error) => {
      if (!cancelled) {
        setErrorMessage(
          error instanceof Error ? error.message : "读取 AI 消息收藏状态失败",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assistantFavoriteKeyState.signature, space]);

  useEffect(() => {
    const targetThreadId = threadId ?? null;
    if (!targetThreadId) {
      return undefined;
    }
    const activeTask = aiGenerationManager.getActiveTaskForThread(
      space,
      targetThreadId,
    );
    if (
      !activeTask ||
      (activeTask.assistantMessageId &&
        !aiGenerationManager.hasActiveTask(activeTask.assistantMessageId))
    ) {
      return undefined;
    }
    const { generation, subscriber } = beginStreamingRequest(targetThreadId);
    const unsubscribe = aiGenerationManager.subscribeToThread(
      space,
      targetThreadId,
      subscriber,
    );
    generationSubscriptionRef.current = unsubscribe;
    setGenerating(true);
    setActiveAssistantId(activeTask.assistantMessageId);
    return () => {
      if (
        isCurrentStream(targetThreadId, generation) &&
        generationSubscriptionRef.current === unsubscribe
      ) {
        clearGenerationSubscription();
      } else {
        unsubscribe();
      }
    };
  }, [threadId, space]);

  useEffect(() => {
    void reloadModelLabel(threadId ?? null);
  }, [modelRefreshKey, reloadModelLabel, threadId]);

  useEffect(() => {
    void reloadParticipantAppearance(threadId ?? null);
  }, [reloadParticipantAppearance, threadId]);

  useEffect(() => {
    void reloadThreadTitle(threadId ?? null);
  }, [reloadThreadTitle, threadId]);

  useEffect(() => {
    void reloadMemoryCaptures(threadId ?? null);
  }, [reloadMemoryCaptures, threadId]);

  useEffect(() => {
    void reloadRecentThreads();
  }, [reloadRecentThreads, activeThreadId]);

  useEffect(() => {
    if (isLoadingEarlierRef.current) {
      const timeout = setTimeout(() => {
        isLoadingEarlierRef.current = false;
      }, 250);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [messages]);

  useEffect(() => {
    if (!branchTreeSelection) {
      return;
    }
    const selectionKey = [
      branchTreeSelection.branchRootMessageId,
      branchTreeSelection.branchVersionIndex,
      Object.entries(branchTreeSelection.selectionMap)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([messageId, versionIndex]) => `${messageId}:${versionIndex}`)
        .join("|"),
    ].join(":");
    if (appliedBranchTreeSelectionKeyRef.current === selectionKey) {
      return;
    }
    const targetThreadId = threadId;
    if (!targetThreadId) {
      return;
    }
    appliedBranchTreeSelectionKeyRef.current = selectionKey;
    pendingBranchTreeScrollMessageIdRef.current =
      branchTreeSelection.branchRootMessageId;
    const branchTreeScopes = branchScopesFromSelectionMap(branchTreeSelection.selectionMap);
    selectedVersionByMessageIdRef.current = branchTreeSelection.selectionMap;
    setPersistedCurrentBranchScopes(branchTreeScopes);
    setSelectedVersionByMessageId(branchTreeSelection.selectionMap);
    void reloadMessages(targetThreadId, {
      anchorMessageId: branchTreeSelection.branchRootMessageId,
      branchScopes: branchTreeScopes,
      forceToLatest: false,
    });
  }, [branchTreeSelection, reloadMessages, threadId]);

  useEffect(() => {
    const targetMessageId = pendingBranchTreeScrollMessageIdRef.current;
    if (!targetMessageId) {
      return;
    }
    if (
      branchTreeSelection &&
      selectedVersionByMessageId !== branchTreeSelection.selectionMap
    ) {
      return;
    }
    const index = invertedMessageIndexById.get(targetMessageId);
    if (index == null) {
      if (messagesRef.current.length === 0) {
        return;
      }
      if (hasEarlierMessages) {
        loadEarlierMessages();
        return;
      }
      if (!hasEarlierMessages) {
        pendingBranchTreeScrollMessageIdRef.current = null;
        setErrorMessage("已切换路线，但目标消息暂未加载。");
      }
      return;
    }
    clearBranchTreeScrollTimeouts();
    messageListRef.current?.scrollToIndex({
      animated: true,
      index,
      viewPosition: 0.42,
    });
    scheduleBranchTreeTargetScroll(targetMessageId);
    branchTreeScrollTimeoutsRef.current.push(
      setTimeout(
        () => {
          if (pendingBranchTreeScrollMessageIdRef.current === targetMessageId) {
            pendingBranchTreeScrollMessageIdRef.current = null;
          }
        },
        BRANCH_TREE_SCROLL_RETRY_DELAYS_MS.at(-1) ?? 0,
      ),
    );
  }, [
    branchTreeSelection,
    hasEarlierMessages,
    invertedMessageIndexById,
    loadEarlierMessages,
    selectedVersionByMessageId,
  ]);

  useEffect(() => {
    if (!searchTargetMessageId) {
      return;
    }
    const targetKey = searchTargetKey ?? searchTargetMessageId;
    if (appliedSearchTargetKeyRef.current === targetKey) {
      return;
    }
    appliedSearchTargetKeyRef.current = targetKey;
    pendingSearchScrollMessageIdRef.current = searchTargetMessageId;
    flashSearchHighlight(searchTargetMessageId);
    scheduleSearchTargetScroll(searchTargetMessageId);
  }, [searchTargetKey, searchTargetMessageId]);

  useEffect(() => {
    const targetMessageId = pendingSearchScrollMessageIdRef.current;
    if (!targetMessageId) {
      return;
    }
    const index = invertedMessageIndexById.get(targetMessageId);
    if (index == null) {
      if (messagesRef.current.length === 0) {
        return;
      }
      if (hasEarlierMessages) {
        loadEarlierMessages();
        return;
      }
      pendingSearchScrollMessageIdRef.current = null;
      setErrorMessage("没有在当前路线里找到这条搜索结果。");
      return;
    }
    if (inlineEditSafeVisibleMessageIdsRef.current.has(targetMessageId)) {
      pendingSearchScrollMessageIdRef.current = null;
      clearSearchScrollTimeouts();
      flashSearchHighlight(targetMessageId);
      return;
    }
    clearSearchScrollTimeouts();
    messageListRef.current?.scrollToIndex({
      animated: true,
      index,
      viewPosition: 0.42,
    });
    flashSearchHighlight(targetMessageId);
    scheduleSearchTargetScroll(targetMessageId);
  }, [hasEarlierMessages, invertedMessageIndexById, loadEarlierMessages]);

  useEffect(() => {
    // prettier-ignore
    const subscription = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === "active";
      if (state !== 'active') {
        void flushActiveStreamingSnapshot();
      }
    });
    return () => {
      screenMountedRef.current = false;
      void flushActiveStreamingSnapshot();
      subscription.remove();
      clearComposerFocusVisibilityTimeouts();
      clearLatestJumpTimeouts();
      clearInlineEditVisibilityTimeouts();
      clearBranchTreeScrollTimeouts();
      clearSearchScrollTimeouts();
      clearSearchHighlightTimeout();
      cancelGenerationAction();
      clearGenerationSubscription();
      clearActiveStreamingIdentity();
      activeStreamGenerationRef.current += 1;
      clearVoiceResetTimeout();
      if (newChatFeedbackTimeoutRef.current) {
        clearTimeout(newChatFeedbackTimeoutRef.current);
        newChatFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const shouldStart = shouldStartComposerEntrance({
      nextRouteKey: composerEntranceKey,
      playedRouteKeys: playedComposerEntranceKeysRef.current,
      previousRouteKey: previousComposerEntranceKeyRef.current,
      reason: composerEntranceReason,
    });
    previousComposerEntranceKeyRef.current = composerEntranceKey;
    if (!composerEntranceKey || !shouldStart) {
      composerEntranceRunRef.current = null;
      composerEntranceProgress.setValue(1);
      return;
    }

    const run = createComposerEntranceRun(composerEntranceKey);
    composerEntranceRunRef.current = run;

    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotionEnabled) => {
        // prettier-ignore
        if (cancelled || !isCurrentComposerEntranceRun(composerEntranceRunRef.current, run.key, run.token)) {
          return;
        }
        playedComposerEntranceKeysRef.current.add(composerEntranceKey);
        if (reduceMotionEnabled) {
          composerEntranceProgress.setValue(1);
          return;
        }
        composerEntranceProgress.setValue(0);
        Animated.timing(composerEntranceProgress, {
          duration: COMPOSER_ENTRANCE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }).start();
      })
      .catch(() => {
        // prettier-ignore
        if (cancelled || !isCurrentComposerEntranceRun(composerEntranceRunRef.current, run.key, run.token)) {
          return;
        }
        playedComposerEntranceKeysRef.current.add(composerEntranceKey);
        composerEntranceProgress.setValue(1);
      });

    return () => {
      cancelled = true;
      composerEntranceRunRef.current = null;
      composerEntranceProgress.stopAnimation();
    };
  }, [composerEntranceKey, composerEntranceProgress, composerEntranceReason]);

  function showNewChatFeedback() {
    if (newChatFeedbackTimeoutRef.current) {
      clearTimeout(newChatFeedbackTimeoutRef.current);
    }
    setNewChatFeedbackVisible(true);
    newChatFeedbackTimeoutRef.current = setTimeout(() => {
      setNewChatFeedbackVisible(false);
      newChatFeedbackTimeoutRef.current = null;
    }, 1400);
  }

  function handleNewChatPress() {
    if (generating) {
      Alert.alert(
        "停止当前回复并新建聊天？",
        "当前已生成内容会保留在原会话。",
        [
          { text: "取消", style: "cancel" },
          {
            text: "停止并新建",
            style: "destructive",
            onPress: () => {
              setNewChatFeedbackVisible(false);
              onNewChat();
              void stopCurrentGeneration({ reloadAfterStop: false }).catch(
                () => undefined,
              );
            },
          },
        ],
      );
      return;
    }

    const alreadyBlankNewChat =
      !activeThreadId &&
      messages.length === 0 &&
      composerText.trim().length === 0 &&
      pendingAttachments.length === 0 &&
      !errorMessage;

    if (alreadyBlankNewChat) {
      showNewChatFeedback();
      return;
    }
    setNewChatFeedbackVisible(false);
    onNewChat();
  }

  async function ensureThread(
    options?: { preserveComposerDraft?: boolean; },
  ): Promise<string | null> {
    if (!screenMountedRef.current) {
      return null;
    }
    if (activeThreadId || activeThreadIdRef.current) {
      return activeThreadId || activeThreadIdRef.current;
    }
    const thread = await createThreadFromContext({
      boundIpId: boundIpId ?? null,
      boundKnowledgeBaseId: boundKnowledgeBaseId ?? null,
      contextType,
      includeIpDocuments,
      space,
      title: resolvedContextTitle,
    });
    if (!screenMountedRef.current) {
      return null;
    }

    const preserveComposerDraft = options?.preserveComposerDraft !== false;
    if (preserveComposerDraft && composerText) {
      void setComposerDraft(thread.id, composerText);
      void clearComposerDraft(draftThreadKey);
    } else if (!preserveComposerDraft) {
      void clearComposerDraft(thread.id);
      void clearComposerDraft(draftThreadKey);
    }

    activeThreadIdRef.current = thread.id;
    setActiveThreadId(thread.id);
    onThreadReady?.(thread.id);
    void reloadModelLabel(thread.id);
    void reloadParticipantAppearance(thread.id);
    return thread.id;
  }

  async function handleOpenSessionConfig() {
    try {
      const nextThreadId = await ensureThread();
      if (!nextThreadId || !screenMountedRef.current) {
        return;
      }
      onOpenSessionConfig(nextThreadId);
    } catch (error) {
      if (!screenMountedRef.current) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "无法打开会话设置",
      );
    }
  }

  async function handleOpenChatSearch() {
    try {
      const nextThreadId = activeThreadIdRef.current ?? activeThreadId;
      if (!nextThreadId || !screenMountedRef.current) {
        setErrorMessage("当前还没有可搜索的聊天。");
        return;
      }
      onOpenChatSearch(nextThreadId, getPersistedCurrentBranchScopes());
    } catch (error) {
      if (!screenMountedRef.current) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "无法打开聊天搜索",
      );
    }
  }

  async function onOpenMemoryBoardFromChat() {
    try {
      const nextThreadId = await ensureThread();
      if (!nextThreadId || !screenMountedRef.current) {
        return;
      }
      onOpenMemoryBoard(nextThreadId);
    } catch (error) {
      if (!screenMountedRef.current) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "无法打开记忆管理",
      );
    }
  }

  async function persistMemoryCaptures(
    nextCaptures: MemoryCaptureNoticeItem[],
  ) {
    if (!activeThreadId) {
      setMemoryCaptures(nextCaptures);
      return;
    }
    setMemoryCaptures(nextCaptures);
    if (nextCaptures.length === 0) {
      await dismissMemoryCapture(space, activeThreadId);
      return;
    }
    await replaceRecentMemoryCaptures(space, activeThreadId, nextCaptures);
  }

  async function onUndoMemoryCapture(
    targetItems: MemoryCaptureNoticeItem[] = memoryCaptures,
  ) {
    if (!activeThreadId) {
      return;
    }
    try {
      const targetIds = new Set(targetItems.map((memory) => memory.id));
      const deletableItems = targetItems.filter(
        (memory) => memory.kind !== "conflict",
      );
      await Promise.all(
        deletableItems.map((memory) => deleteMemory(space, memory.id)),
      );
      await persistMemoryCaptures(
        memoryCaptures.filter((memory) => !targetIds.has(memory.id)),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "撤销记忆失败");
    }
  }

  async function onSaveMemoryCapture(memoryId: string, content: string) {
    if (!activeThreadId) {
      return;
    }
    try {
      const memory = await updateMemoryContent(space, memoryId, content);
      const next = memoryCaptures.map((item) =>
        item.id === memoryId
          ? { ...item, content: memory?.content ?? content }
          : item,
      );
      await persistMemoryCaptures(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "更新记忆失败");
    }
  }

  async function onMarkMemoryCaptureInaccurate(memoryId: string) {
    if (!activeThreadId) {
      return;
    }
    try {
      await markMemoryInaccurate(space, memoryId);
      const next = memoryCaptures.filter((item) => item.id !== memoryId);
      await persistMemoryCaptures(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "标记记忆失败");
    }
  }

  async function pickChatImages() {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error("需要相册权限才能上传图片。");
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
        quality: 1,
      });
      if (result.canceled) {
        return;
      }
      const picked = result.assets.map<AiComposerAttachment>(
        (asset, index) => ({
          id: `image-${Date.now()}-${index}-${asset.uri}`,
          kind: "image",
          mimeType: asset.mimeType ?? null,
          name:
            asset.fileName ??
            getFileNameFromUri(asset.uri, `image-${index + 1}`),
          size: asset.fileSize ?? null,
          uri: asset.uri,
        }),
      );
      setPendingAttachments((current) => [...current, ...picked]);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "选择图片失败");
    }
  }

  async function pickChatDocuments() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
        type: CHAT_DOCUMENT_TYPES,
      });
      if (result.canceled) {
        return;
      }
      const picked = result.assets.map<AiComposerAttachment>(
        (asset, index) => ({
          id: `document-${Date.now()}-${index}-${asset.uri}`,
          kind: "document",
          mimeType: asset.mimeType ?? null,
          name:
            asset.name ??
            getFileNameFromUri(asset.uri, `document-${index + 1}`),
          size: asset.size ?? null,
          uri: asset.uri,
        }),
      );
      setPendingAttachments((current) => [...current, ...picked]);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "选择文档失败");
    }
  }

  async function copyMessageContent(message: AiMessageWithCitations) {
    const content = message.content || message.errorMessage || "";
    if (!content.trim()) {
      return;
    }
    await Clipboard.setStringAsync(content);
    setErrorMessage(null);
  }

  async function handleSend() {
    const sendPressedAt = new Date().toISOString();
    const typedText = composerText.trim();
    const attachments = pendingAttachments;
    const content = buildChatMessageContent(typedText, attachments);
    if ((!typedText && !attachments.length) || generating) {
      return;
    }
    const actionToken = beginGenerationAction();
    if (!actionToken) {
      return;
    }
    let nextThreadId: string | null = null;
    let streamUnsubscribe: (() => void) | null = null;
    let streamGeneration = 0;
    try {
      markIntentionalLatestJump();
      await flushBufferedStreamingState({ followLatest: false });
      setComposerText("");
      void clearComposerDraft(draftThreadKey);
      setPendingAttachments([]);
      setGenerating(true);
      setErrorMessage(null);
      scheduleIntentionalLatestJump(false);
      nextThreadId = await ensureThread({ preserveComposerDraft: false });
      if (!nextThreadId || !screenMountedRef.current) {
        return;
      }
      if (!isGenerationActionCurrent(actionToken)) {
        return;
      }
      const targetThreadId = nextThreadId;
      const streamRequest = beginStreamingRequest(targetThreadId);
      streamGeneration = streamRequest.generation;
      const activeBranch = getActiveBranchForNextMessage();
      const managedGeneration = aiGenerationManager.startSendUserMessage({
        attachments,
        branchRootMessageId: activeBranch?.branchRootMessageId,
        branchVersionIndex: activeBranch?.branchVersionIndex,
        content,
        sendPressedAt,
        space,
        subscriber: streamRequest.subscriber,
        threadId: targetThreadId,
      });
      streamUnsubscribe = managedGeneration.unsubscribe;
      generationSubscriptionRef.current = managedGeneration.unsubscribe;
      await managedGeneration.promise;
      await syncPersistedCurrentBranchRoute(targetThreadId, true);
    } catch (error) {
      if (
        !screenMountedRef.current ||
        (nextThreadId && !isCurrentStream(nextThreadId, streamGeneration))
      ) {
        return;
      }
      setComposerText(typedText);
      setPendingAttachments(attachments);
      setErrorMessage(error instanceof Error ? error.message : "发送失败");
    } finally {
      finishGenerationAction(actionToken);
      if (!screenMountedRef.current) {
        return;
      }
      const stillCurrent =
        nextThreadId && streamGeneration
          ? isCurrentStream(nextThreadId, streamGeneration)
          : true;
      if (stillCurrent) {
        setGenerating(false);
        setActiveAssistantId(null);
        if (generationSubscriptionRef.current === streamUnsubscribe) {
          clearGenerationSubscription();
        }
      }
    }
  }

  async function handleSubmitInlineRewrite(
    messageId: string,
    nextContent: string,
  ) {
    const sendPressedAt = new Date().toISOString();
    const content = nextContent.trim();
    if (!content || generating || !activeThreadId) {
      return;
    }
    const userMessageId = messageId;
    const actionToken = beginGenerationAction();
    if (!actionToken) {
      return;
    }
    const targetThreadId = activeThreadId;
    let streamUnsubscribe: (() => void) | null = null;
    const { generation: streamGeneration, subscriber } =
      beginStreamingRequest(targetThreadId);
    try {
      markIntentionalLatestJump();
      await flushBufferedStreamingState({ followLatest: false });
      setPendingMessageActionId(userMessageId);
      editingUserMessageIdRef.current = null;
      setEditingUserMessageId(null);
      setGenerating(true);
      setErrorMessage(null);
      scheduleIntentionalLatestJump(false);
      const managedGeneration = aiGenerationManager.startRewriteUserMessage({
        content,
        sendPressedAt,
        space,
        subscriber: {
          ...subscriber,
          onCreated: ({ assistantMessageId, generationId }) => {
            if (!isCurrentStream(targetThreadId, streamGeneration)) {
              return;
            }
            subscriber.onCreated?.({
              userMessageId,
              assistantMessageId,
              generationId,
            });
            showLatestMessageVersion(userMessageId);
            showLatestMessageVersion(assistantMessageId);
          },
        },
        threadId: targetThreadId,
        userMessageId,
      });
      streamUnsubscribe = managedGeneration.unsubscribe;
      generationSubscriptionRef.current = managedGeneration.unsubscribe;
      await managedGeneration.promise;
      await syncPersistedCurrentBranchRoute(targetThreadId, true);
    } catch (error) {
      if (!isCurrentStream(targetThreadId, streamGeneration)) {
        return;
      }
      editingUserMessageIdRef.current = userMessageId;
      setEditingUserMessageId(userMessageId);
      setErrorMessage(error instanceof Error ? error.message : "重写失败");
    } finally {
      setPendingMessageActionId(null);
      finishGenerationAction(actionToken);
      if (isCurrentStream(targetThreadId, streamGeneration)) {
        setGenerating(false);
        setActiveAssistantId(null);
        if (generationSubscriptionRef.current === streamUnsubscribe) {
          clearGenerationSubscription();
        }
      }
    }
  }

  async function stopCurrentGeneration({
    reloadAfterStop,
  }: {
    reloadAfterStop: boolean;
  }) {
    const targetAssistantId = activeAssistantId;
    const targetThreadId = activeThreadIdRef.current;
    cancelGenerationAction();
    abortActiveStreamingRequest();
    setGenerating(false);
    setActiveAssistantId(null);
    if (!targetAssistantId && !targetThreadId) {
      setGenerating(false);
      return;
    }
    await aiGenerationManager.stopGeneration({ assistantMessageId: targetAssistantId, space, threadId: targetThreadId });
    if (reloadAfterStop && screenMountedRef.current) {
      await reloadMessages(targetThreadId);
    }
  }

  async function handleStop() {
    await stopCurrentGeneration({ reloadAfterStop: true });
  }

  async function handleRegenerate(messageId?: string) {
    const targetMessageId = messageId ?? latestAssistantMessage?.id;
    if (!targetMessageId || !activeThreadId) {
      return;
    }
    const targetThreadId = activeThreadId;
    const actionToken = beginGenerationAction();
    if (!actionToken) {
      return;
    }
    return handleConfirmedRegenerate(
      targetThreadId,
      targetMessageId,
      actionToken,
    );
  }

  async function handleConfirmedRegenerate(
    targetThreadId: string,
    targetMessageId: string,
    actionToken: number,
  ) {
    const sendPressedAt = new Date().toISOString();
    let streamUnsubscribe: (() => void) | null = null;
    const { generation: streamGeneration, subscriber } =
      beginStreamingRequest(targetThreadId);
    try {
      markIntentionalLatestJump();
      await flushBufferedStreamingState({ followLatest: false });
      setPendingMessageActionId(targetMessageId);
      setGenerating(true);
      setActiveAssistantId(targetMessageId);
      setErrorMessage(null);
      showLatestMessageVersion(targetMessageId);
      scheduleIntentionalLatestJump(false);
      const managedGeneration =
        aiGenerationManager.startRegenerateAssistantMessage({
          assistantMessageId: targetMessageId,
          sendPressedAt,
          space,
          subscriber,
          threadId: targetThreadId,
        });
      streamUnsubscribe = managedGeneration.unsubscribe;
      generationSubscriptionRef.current = managedGeneration.unsubscribe;
      await managedGeneration.promise;
      await syncPersistedCurrentBranchRoute(targetThreadId, true);
    } catch (error) {
      if (!isCurrentStream(targetThreadId, streamGeneration)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setPendingMessageActionId(null);
      finishGenerationAction(actionToken);
      if (isCurrentStream(targetThreadId, streamGeneration)) {
        setGenerating(false);
        setActiveAssistantId(null);
        if (generationSubscriptionRef.current === streamUnsubscribe) {
          clearGenerationSubscription();
        }
      }
    }
  }

  async function handleContinueAssistantMessage(messageId: string) {
    const targetThreadId = activeThreadId;
    if (!targetThreadId || generating) {
      return;
    }
    const actionToken = beginGenerationAction();
    if (!actionToken) {
      return;
    }
    const sendPressedAt = new Date().toISOString();
    let streamUnsubscribe: (() => void) | null = null;
    const { generation: streamGeneration, subscriber } =
      beginStreamingRequest(targetThreadId);
    const continuingMessage =
      messagesRef.current.find((message) => message.id === messageId) ?? null;
    try {
      markIntentionalLatestJump();
      await flushBufferedStreamingState({ followLatest: false });
      setPendingMessageActionId(messageId);
      setGenerating(true);
      setActiveAssistantId(messageId);
      setErrorMessage(null);
      showLatestMessageVersion(messageId);
      scheduleIntentionalLatestJump(false);
      const managedGeneration =
        aiGenerationManager.startContinueAssistantMessage({
          assistantMessageId: messageId,
          sendPressedAt,
          space,
          subscriber: {
            ...subscriber,
            onCreated: ({ assistantMessageId, generationId, userMessageId }) => {
              subscriber.onCreated?.({
                assistantMessageId,
                generationId,
                userMessageId,
              });
              if (
                !isCurrentStream(targetThreadId, streamGeneration) ||
                !continuingMessage
              ) {
                return;
              }
              publishStreamingMessage(
                {
                  generationId,
                  messageId: assistantMessageId,
                  space,
                  threadId: targetThreadId,
                },
                {
                  content: continuingMessage.content,
                  reasoningText: continuingMessage.reasoningText,
                  status: 'generating',
                },
              );
            },
          },
          threadId: targetThreadId,
        });
      streamUnsubscribe = managedGeneration.unsubscribe;
      generationSubscriptionRef.current = managedGeneration.unsubscribe;
      await managedGeneration.promise;
      await syncPersistedCurrentBranchRoute(targetThreadId, true);
    } catch (error) {
      if (!isCurrentStream(targetThreadId, streamGeneration)) {
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "继续生成失败");
    } finally {
      setPendingMessageActionId(null);
      finishGenerationAction(actionToken);
      if (isCurrentStream(targetThreadId, streamGeneration)) {
        setGenerating(false);
        setActiveAssistantId(null);
        if (generationSubscriptionRef.current === streamUnsubscribe) {
          clearGenerationSubscription();
        }
      }
    }
  }

  function handleEditUserMessage(messageId: string, content: string) {
    if (generating) {
      return;
    }
    editingUserMessageIdRef.current = messageId;
    setEditingUserMessageId(messageId);
    setErrorMessage(null);
    scheduleInlineEditVisibility(messageId);
  }

  function cancelInlineEdit() {
    clearInlineEditVisibilityTimeouts();
    editingUserMessageIdRef.current = null;
    setEditingUserMessageId(null);
  }

  async function handleVoiceInput() {
    try {
      clearVoiceResetTimeout();
      setVoiceState("listening");
      setVoiceError(null);
      if (Platform.OS === "android") {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          setVoiceState("error");
          setVoiceError("需要麦克风权限才能进行语音输入。");
          setErrorMessage("需要麦克风权限才能进行语音输入。");
          return;
        }
      }
      setVoiceState("recognizing");
      const result = await recognizeSpeech();
      const recognizedText = result.text.trim();
      if (!recognizedText) {
        setVoiceState("error");
        setVoiceError("没有识别到语音内容。");
        setErrorMessage("没有识别到语音内容。");
        return;
      }
      setComposerText((current) => {
        if (!current.trim()) {
          return recognizedText;
        }
        return `${current}${current.endsWith("\n") ? "" : "\n"}${recognizedText}`;
      });
      setVoiceState("idle");
      setErrorMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "语音识别失败";
      setVoiceState("error");
      setVoiceError(message);
      setErrorMessage(message);
    }
  }

  function handleCancelVoiceInput() {
    setVoiceState("cancelled");
    clearVoiceResetTimeout();
    voiceResetTimeoutRef.current = setTimeout(() => {
      setVoiceState("idle");
      voiceResetTimeoutRef.current = null;
    }, 1200);
  }

  function openCitation(citation: AiCitationRecord) {
    if (citation.sourceType === "document_chunk") {
      onOpenSource(
        citation.sourceId,
        citation.label,
        citation.locator as AiDocumentReaderLocator,
      );
      return;
    }
    // prettier-ignore
    if (citation.sourceType === 'ip_metadata') {
      const ipId =
        typeof citation.locator.ipId === "number"
          ? citation.locator.ipId
          : Number(citation.sourceId);
      if (Number.isFinite(ipId)) {
        onOpenIpSource(ipId);
      }
      return;
    }
    // prettier-ignore
    if (citation.sourceType === 'image_note') {
      const imageId =
        typeof citation.locator.imageId === "number"
          ? citation.locator.imageId
          : Number(citation.sourceId);
      if (Number.isFinite(imageId)) {
        onOpenImageSource(imageId);
      }
    }
  }

  function handleSelectMessageVersion(messageId: string, versionIndex: number) {
    const nextSelection = { ...selectedVersionByMessageId, [messageId]: versionIndex };
    const nextBranchScopes = getCurrentBranchScopesForSelection(nextSelection);
    const activeBranch = getActiveBranchForSelection(nextSelection);
    const targetThreadId = activeThreadIdRef.current;
    selectedVersionByMessageIdRef.current = nextSelection;
    setSelectedVersionByMessageId(nextSelection);
    setPersistedCurrentBranchScopes(nextBranchScopes);
    void persistCurrentBranchRoute(activeBranch);
    if (targetThreadId) {
      void reloadMessages(targetThreadId, false, nextBranchScopes);
    }
  }

  async function handleToggleMessageFavorite(message: AiMessageWithCitations) {
    const targetThreadId = activeThreadIdRef.current;
    if (!targetThreadId || message.role !== "assistant") {
      return;
    }
    const identity = buildMessageFavoriteIdentity(message);
    const nextFavorited = !favoriteStateByKey[identity.key];
    setFavoritePendingByKey((current) => ({
      ...current,
      [identity.key]: true,
    }));
    try {
      await toggleAssistantMessageFavorite({
        branchScopes: identity.branchScopes,
        favorited: nextFavorited,
        messageId: message.id,
        messageVersionIndex: identity.messageVersionIndex,
        space,
        threadId: targetThreadId,
      });
      setFavoriteStateByKey((current) => ({
        ...current,
        [identity.key]: nextFavorited,
      }));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "更新 AI 消息收藏失败",
      );
    } finally {
      setFavoritePendingByKey((current) => {
        const next = { ...current };
        delete next[identity.key];
        return next;
      });
    }
  }

  const messageKeyExtractor = useCallback(
    (item: VisibleMessageItem) =>
      item.type === "messageSegment" || item.type === "tailDebtSpacer"
        ? getTailReplayItemKey(item)
        : item.id,
    [],
  );

  const renderMessageItem = useCallback(
    ({ item }: { item: VisibleMessageItem }) => {
      if (item.type === "streamTailSpacer") {
        return <AiStreamingTailSpacer height={item.height} />;
      }
      if (item.type === "tailDebtSpacer") {
        return <AiStreamingTailSpacer height={item.height} />;
      }
      if (item.type === "streamTailContinuation") {
        return (
          <AiStreamingTailContinuationBubble
            bubbleWidth={getStreamingBubbleWidth()}
            group={item.group}
            onMeasured={handleMeasuredTailBlock}
          />
        );
      }
      if (item.type === "messageSegment") {
        const tailState = streamingTailStateRef.current;
        const blocks = tailState.blocks.filter(
          (block) =>
            block.messageId === item.messageId &&
            block.lane === item.blockRange.lane &&
            block.blockIndex >= item.blockRange.startBlockIndex &&
            block.blockIndex <= item.blockRange.endBlockIndex,
        );
        if (blocks.length === 0) {
          return null;
        }
        const message = visibleMessagesById.get(item.messageId) ?? null;
        const isThinkingExpanded = Boolean(
          thinkingExpandedByMessageIdRef.current.get(item.messageId),
        );
        const activeLanes: ("content" | "reasoning")[] = isThinkingExpanded
          ? ["content", "reasoning"]
          : ["content"];
        const hasPendingTail =
          calculateRemainingStreamingTailHeight(tailState, activeLanes) > 0;
        const terminalState =
          tailState.messageId === item.messageId && tailState.status === "completed"
            ? "completed"
            : message?.status === "completed" ||
                message?.status === "failed" ||
                message?.status === "stopped"
              ? message.status
            : "streaming";
        const segmentFavoriteIdentity =
          message?.role === "assistant"
            ? (favoriteIdentityByMessageId.get(message.id) ?? null)
            : null;
        const shouldShowFooter =
          Boolean(message) &&
          footerVisible({ hasPendingTail, terminalState }, item.edge);
        return (
          <AiStreamingTailMessageSegment
            blocks={blocks}
            bubbleWidth={getStreamingBubbleWidth()}
            citations={
              message ? (
                <AiCitationList
                  citations={message.citations}
                  onOpenCitation={openCitation}
                />
              ) : null
            }
            edge={item.edge}
            footer={
              shouldShowFooter && message ? (
                <AiMessageFooterActions
                  favoriteDisabledByGeneration={
                    generating && message.id === activeAssistantId
                  }
                  favorited={
                    segmentFavoriteIdentity
                      ? Boolean(favoriteStateByKey[segmentFavoriteIdentity.key])
                      : false
                  }
                  favoritePending={
                    segmentFavoriteIdentity
                      ? Boolean(favoritePendingByKey[segmentFavoriteIdentity.key])
                      : false
                  }
                  generating={generating}
                  message={message}
                  pendingActionMessageId={pendingMessageActionId}
                  onCopy={(targetMessage) => {
                    void copyMessageContent(targetMessage);
                  }}
                  onContinue={handleContinueAssistantMessage}
                  onEditUser={handleEditUserMessage}
                  onRegenerate={(messageId) => {
                    void handleRegenerate(messageId);
                  }}
                  onSelectVersion={handleSelectMessageVersion}
                  onToggleFavorite={(targetMessage) => {
                    void handleToggleMessageFavorite(targetMessage);
                  }}
                />
              ) : null
            }
            onMeasured={handleMeasuredTailBlock}
          />
        );
      }

      const { message } = item;
      const inlineMemoryCaptures =
        memoryCapturesBySourceMessageId.get(message.id) ?? [];
      const favoriteIdentity =
        message.role === "assistant"
          ? (favoriteIdentityByMessageId.get(message.id) ?? null)
          : null;
      const activeStreamingIdentity = activeStreamingIdentityRef.current;
      // prettier-ignore
      const streamingIdentity = activeStreamingIdentity?.messageId === message.id ? activeStreamingIdentity : null;
      // prettier-ignore
      const streamingReadModeActive = hasPendingStreamingReadBuffer() && message.status === 'generating';
      // prettier-ignore
      const streamingRendererActive = Boolean(streamingIdentity) && generating && message.id === activeAssistantId && !streamingReadModeActive;
      const activeTailState = streamingTailStateRef.current;
      const singleBubbleTailMessage =
        singleBubbleTailReplayEnabled &&
        activeTailState.messageId === message.id &&
        activeTailState.status !== "idle";
      const isThinkingExpanded = Boolean(
        thinkingExpandedByMessageIdRef.current.get(message.id),
      );
      const activeTailLanes: ("content" | "reasoning")[] = isThinkingExpanded
        ? ["content", "reasoning"]
        : ["content"];
      const activeTailPromotedBlockCount = singleBubbleTailMessage
        ? activeTailState.blocks.filter(
            (block) =>
              activeTailLanes.includes(block.lane) &&
              activeTailState.promotedBlockIds.has(block.blockId),
          ).length
        : 0;
      const baseTailEdge: AiTailSegmentEdge =
        singleBubbleTailMessage && activeTailPromotedBlockCount > 0
          ? "first"
          : "single";
      const baseTailHasPendingTail = singleBubbleTailMessage
        ? calculateRemainingStreamingTailHeight(activeTailState, activeTailLanes) > 0
        : false;
      const baseTailTerminalState =
        message.status === "completed" ||
        message.status === "failed" ||
        message.status === "stopped"
          ? message.status
          : "streaming";
      const baseTailFooterVisible = singleBubbleTailMessage
        ? footerVisible(
            {
              hasPendingTail: baseTailHasPendingTail,
              terminalState:
                activeTailState.status === "completed"
                  ? "completed"
                  : baseTailTerminalState,
            },
            baseTailEdge,
          )
        : true;
      const baseTailHideCitations =
        singleBubbleTailMessage && baseTailEdge !== "single";
      return (
        <>
          {item.showDateSeparator ? (
            <Text style={styles.dateSeparator}>
              {formatDateSeparator(message.createdAt)}
            </Text>
          ) : null}
          <View
            style={
              searchHighlightMessageId === message.id
                ? styles.searchHighlightWrap
                : undefined
            }
          >
            <AiMessageBubble
              assistantAvatar={{
                avatarEnabled: participantAppearance.assistantAvatarEnabled,
                avatarUri: participantAppearance.assistantAvatarUri,
              }}
              assistantDisplayName={participantAppearance.assistantName}
              editingMessageId={editingUserMessageId}
              favorited={
                favoriteIdentity
                  ? Boolean(favoriteStateByKey[favoriteIdentity.key])
                  : false
              }
              favoriteDisabledByGeneration={
                generating && message.id === activeAssistantId
              }
              favoritePending={
                favoriteIdentity
                  ? Boolean(favoritePendingByKey[favoriteIdentity.key])
                  : false
              }
              generating={generating}
              assistantBubbleEdge={singleBubbleTailMessage ? baseTailEdge : undefined}
              hideCitations={baseTailHideCitations}
              hideFooterActions={
                singleBubbleTailMessage ? !baseTailFooterVisible : false
              }
              message={message}
              onAttachmentPress={(attachment) => {
                if (attachment.kind === "document" && attachment.documentId) {
                  onOpenSource(attachment.documentId, attachment.name);
                } else if (attachment.kind === "image" && attachment.localUri) {
                  setPreviewImageUri(attachment.localUri);
                }
              }}
              pendingActionMessageId={pendingMessageActionId}
              showAvatar={item.showAvatar}
              showUserAvatar={item.showUserAvatar}
              space={space}
              streaming={streamingRendererActive}
              streamingIdentity={streamingIdentity}
              // prettier-ignore
              thinkingDefaultExpanded={thinkingExpandedByMessageIdRef.current.get(message.id) ?? false}
              onCopy={(targetMessage) => {
                void copyMessageContent(targetMessage);
              }}
              onCancelEdit={cancelInlineEdit}
              onContinue={handleContinueAssistantMessage}
              onEditUser={handleEditUserMessage}
              onOpenCitation={openCitation}
              onRegenerate={(messageId) => {
                void handleRegenerate(messageId);
              }}
              onSelectVersion={handleSelectMessageVersion}
              onSubmitEdit={(messageId, content) => {
                void handleSubmitInlineRewrite(messageId, content);
              }}
              onToggleFavorite={(targetMessage) => {
                void handleToggleMessageFavorite(targetMessage);
              }}
              onThinkingExpandedChange={(messageId, expanded) => {
                thinkingExpandedByMessageIdRef.current.set(messageId, expanded);
                const sameTailMessage =
                  streamingTailStateRef.current.messageId === messageId &&
                  streamingTailStateRef.current.status !== "idle";
                scheduleStreamingTailReconcile("thinking-expanded", {
                  allowFollowLatest:
                    bottomLockedRef.current || isNearBottomRef.current,
                  forceRender: true,
                  retainWindow: sameTailMessage,
                });
              }}
              userProfile={{
                avatarEnabled: participantAppearance.userAvatarEnabled,
                avatarUri: participantAppearance.userAvatarUri,
                nickname: participantAppearance.userNickname,
              }}
            />
          </View>
          {inlineMemoryCaptures.length > 0 ? (
            <View style={styles.inlineMemoryNotice}>
              <AiMemoryCaptureNotice
                count={inlineMemoryCaptures.length}
                items={inlineMemoryCaptures}
                summary={inlineMemoryCaptures[0]?.content}
                onManage={() => void onOpenMemoryBoardFromChat()}
                onMarkInaccurate={(memoryId) =>
                  void onMarkMemoryCaptureInaccurate(memoryId)
                }
                onSave={(memoryId, content) =>
                  void onSaveMemoryCapture(memoryId, content)
                }
                onUndo={() => void onUndoMemoryCapture(inlineMemoryCaptures)}
              />
            </View>
          ) : null}
        </>
      );
    },
    [
      activeAssistantId,
      participantAppearance,
      cancelInlineEdit,
      copyMessageContent,
      editingUserMessageId,
      favoritePendingByKey,
      favoriteStateByKey,
      favoriteIdentityByMessageId,
      generating,
      handleEditUserMessage,
      handleContinueAssistantMessage,
      handleRegenerate,
      handleSubmitInlineRewrite,
      handleSelectMessageVersion,
      handleToggleMessageFavorite,
      memoryCapturesBySourceMessageId,
      openCitation,
      pendingMessageActionId,
      searchHighlightMessageId,
      singleBubbleTailReplayEnabled,
      space,
      scheduleStreamingTailReconcile,
    ],
  );

  return (
    <AppScreen
      backgroundColor={aiLightColors.canvas}
      contentStyle={styles.drawerHost}
    >
      {/* prettier-ignore */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? 'height' : undefined}
        enabled={Platform.OS === 'android'}
        style={styles.keyboardAvoidingHost}
      >
        {/* prettier-ignore */}
        <View
          style={[styles.screenContent, { paddingTop: statusBarHeight + layout.pageTopOffset }]}
          {...swipeDrawerPanResponder.panHandlers}
        >
          <View style={styles.header}>
            {/* Left: drawer + search */}
            <View style={styles.headerSide}>
              <Pressable
                accessibilityLabel="打开综合记录"
                accessibilityRole="button"
                onPress={() => setRecordDrawerVisible(true)}
                style={({ pressed }) => [
                  styles.iconBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons color={aiLightColors.ink} name="menu-outline" size={22} />
              </Pressable>
              <Pressable
                accessibilityLabel="搜索当前聊天"
                accessibilityRole="button"
                accessibilityState={{ disabled: !activeThreadId }}
                disabled={!activeThreadId}
                onPress={() => void handleOpenChatSearch()}
                style={({ pressed }) => [
                  styles.iconBtn,
                  !activeThreadId && styles.iconBtnDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  color={activeThreadId ? aiLightColors.ink : aiLightColors.muted}
                  name="search-outline"
                  size={20}
                />
              </Pressable>
            </View>
            {/* Center: title */}
            <View style={styles.titleBlock}>
              <View style={styles.titleLine}>
                <Text numberOfLines={1} style={styles.title}>
                  {displayTitle}
                </Text>
                {thinking ? <View style={styles.liveDot} /> : null}
              </View>
              {modelLabel ? (
                <Text numberOfLines={1} style={styles.modelSubtitle}>
                  {modelLabel}
                </Text>
              ) : null}
            </View>
            {/* Right: session settings + new chat */}
            <View style={styles.headerSide}>
              <Pressable
                accessibilityLabel="会话设置"
                accessibilityRole="button"
                onPress={() => void handleOpenSessionConfig()}
                style={({ pressed }) => [
                  styles.iconBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons color={aiLightColors.ink} name="settings-outline" size={20} />
              </Pressable>
              <Pressable
                accessibilityLabel="开启新会话"
                accessibilityRole="button"
                onPress={() => void handleNewChatPress()}
                style={({ pressed }) => [
                  styles.iconBtn,
                  pressed && styles.pressed,
                ]}
              >
                <View pointerEvents="none" style={styles.newChatIconWrap}>
                  <Ionicons
                    color={aiLightColors.ink}
                    name="chatbubble-ellipses-outline"
                    size={23}
                  />
                  <View style={styles.newChatIconBadge}>
                    <Ionicons color={aiLightColors.canvas} name="add" size={10} />
                  </View>
                </View>
              </Pressable>
            </View>
          </View>
          {newChatFeedbackVisible ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.newChatFeedback}
            >
              <Ionicons
                color={aiLightColors.primaryActive}
                name="checkmark-circle-outline"
                size={14}
              />
              <Text style={styles.newChatFeedbackText}>已在新的空白聊天</Text>
            </View>
          ) : null}

          <View
            onLayout={(event) => {
              const nextViewportHeight = Math.round(
                event.nativeEvent.layout.height,
              );
              if (
                nextViewportHeight <= 0 ||
                nextViewportHeight === messageViewportHeightRef.current
              ) {
                return;
              }
              messageViewportHeightRef.current = nextViewportHeight;
              syncTailViewportPolicyForCurrentTailState();
              scheduleStreamingTailReconcile("viewport-height", {
                forceRender: true,
              });
            }}
            style={styles.messageArea}
          >
            <FlatList
              ref={messageListRef}
              data={invertedMessageItems}
              inverted
              initialNumToRender={10}
              keyboardDismissMode={inlineEditingActive ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              keyExtractor={messageKeyExtractor}
              maintainVisibleContentPosition={MESSAGE_LIST_ANCHOR_CONFIG}
              maxToRenderPerBatch={tailListMaxToRenderPerBatch}
              removeClippedSubviews={tailListRemoveClippedSubviews}
              updateCellsBatchingPeriod={tailListUpdateCellsBatchingPeriod}
              windowSize={tailListWindowSize}
              ListFooterComponent={
                <>
                  {errorMessage ? (
                    <AiChatErrorBanner
                      message={errorMessage}
                      onRetry={
                        latestAssistantMessage?.status === "failed"
                          ? () =>
                              void handleRegenerate(latestAssistantMessage.id)
                          : undefined
                      }
                    />
                  ) : null}
                  {hasEarlierMessages ? (
                    <Pressable
                      accessibilityLabel="加载更早消息"
                      accessibilityRole="button"
                      onPress={loadEarlierMessages}
                      style={({ pressed }) => [
                        styles.loadEarlierButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        color={aiLightColors.muted}
                        name="chevron-up"
                        size={15}
                      />
                      <Text style={styles.loadEarlierText}>加载更早消息</Text>
                    </Pressable>
                  ) : null}
                </>
              }
              onScrollBeginDrag={handleMessageScrollBeginDrag}
              onScroll={handleMessageScroll}
              onMomentumScrollEnd={handleMessageScrollEnd}
              onScrollEndDrag={handleMessageScrollEnd}
              onViewableItemsChanged={handleInlineEditViewableItemsChangedRef.current}
              onScrollToIndexFailed={handleMessageScrollToIndexFailed}
              renderItem={renderMessageItem}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              style={styles.messageScroller}
              contentContainerStyle={styles.messageScrollContent}
              viewabilityConfig={inlineEditViewabilityConfigRef.current}
            />
            {invertedMessageItems.length === 0 && !errorMessage ? (
              <View style={styles.starterOverlay}>
                <AiChatStarterHints onPickSuggestion={setComposerText} />
              </View>
            ) : null}
            <AiScrollToLatestButton bottomOffset={composerPanelHeight + spacing[1.5]} visible={showScrollToLatest && !inlineEditingActive} onPress={handleReturnToLatestPress} />
          </View>

          {inlineEditingActive ? null : (
            <Animated.View onLayout={(event) => setComposerPanelHeight(event.nativeEvent.layout.height)} style={[styles.composerPanel, composerEntranceStyle]}>
              {activeContinuityMilestone ? (
                <View style={styles.continuityInlineNotice}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      showContinuityMilestoneDetails(activeContinuityMilestone)
                    }
                    style={({ pressed }) => [
                      styles.continuityInlineNoticeMain,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      color={
                        activeContinuityMilestone.rollbackState === "available"
                          ? aiLightColors.primaryActive
                          : aiLightColors.muted
                      }
                      name={
                        activeContinuityMilestone.rollbackState === "available"
                          ? "git-branch-outline"
                          : "lock-closed-outline"
                      }
                      size={14}
                    />
                    <Text
                      numberOfLines={1}
                      style={styles.continuityInlineNoticeText}
                    >
                      {`${continuitySourceLabel(activeContinuityMilestone.sourceKind)} · ${activeContinuityMilestone.label}`}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      showContinuityMilestoneDetails(activeContinuityMilestone)
                    }
                    style={({ pressed }) => [
                      styles.continuityInlineNoticeDetail,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.continuityInlineNoticeDetailText}>
                      查看详情
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {fallbackMemoryCaptures.length > 0 ? (
                <AiMemoryCaptureNotice
                  count={fallbackMemoryCaptures.length}
                  items={fallbackMemoryCaptures}
                  summary={fallbackMemoryCaptures[0]?.content}
                  onManage={() => void onOpenMemoryBoardFromChat()}
                  onMarkInaccurate={(memoryId) =>
                    void onMarkMemoryCaptureInaccurate(memoryId)
                  }
                  onSave={(memoryId, content) =>
                    void onSaveMemoryCapture(memoryId, content)
                  }
                  onUndo={() =>
                    void onUndoMemoryCapture(fallbackMemoryCaptures)
                  }
                />
              ) : null}
              <AiChatComposer
                attachments={pendingAttachments}
                generating={generating}
                modelIconBrand={modelIconBrand}
                onAddDocumentAttachment={() => void pickChatDocuments()}
                onAddImageAttachment={() => void pickChatImages()}
                onChangeText={setComposerText}
                onComposerHeightChange={handleComposerHeightChange}
                onFocus={handleComposerFocus}
                onModelIconPress={() => void handleOpenSessionConfig()}
                onRemoveAttachment={(id) =>
                  setPendingAttachments((current) =>
                    current.filter((attachment) => attachment.id !== id),
                  )
                }
                placeholder=""
                onSend={() => {
                  void handleSend();
                }}
                onStop={() => {
                  void handleStop();
                }}
                onVoiceInput={() => {
                  void handleVoiceInput();
                }}
                onCancelVoiceInput={handleCancelVoiceInput}
                value={composerText}
                voiceError={voiceError}
                voiceState={voiceState}
              />
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
      <AiComprehensiveRecordDrawer
        activeThreadId={activeThreadId}
        recentThreads={recentThreads}
        visible={recordDrawerVisible}
        onClose={() => setRecordDrawerVisible(false)}
        onNewChat={() => {
          setRecordDrawerVisible(false);
          handleNewChatPress();
        }}
        onOpenRoleLibrary={() => {
          setRecordDrawerVisible(false);
          onOpenRoleLibrary();
        }}
        onOpenHistory={() => {
          setRecordDrawerVisible(false);
          onOpenHistory();
        }}
        onOpenGlobalMaterials={() => {
          setRecordDrawerVisible(false);
          onOpenGlobalMaterials();
        }}
        onOpenThread={(thread) => {
          setRecordDrawerVisible(false);
          onOpenThread(thread);
        }}
        onRenameThread={(thread, title) => renameRecentThread(thread, title)}
        onDeleteThread={(thread) => deleteRecentThread(thread)}
      />
      <Modal
        animationType="fade"
        onRequestClose={() => setPreviewImageUri(null)}
        transparent
        visible={Boolean(previewImageUri)}
      >
        <View style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.9)" }}>
            {previewImageUri ? (
              <SecureImage
                contentFit="contain"
                space={space}
                style={{ flex: 1 }}
                uri={previewImageUri}
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => setPreviewImageUri(null)}
              style={{
                position: "absolute",
                top: Math.max(statusBarHeight, 20) + 20,
                right: 20,
                padding: 10,
                backgroundColor: "rgba(255,255,255,0.2)",
                borderRadius: 30,
              }}
            >
              <Ionicons color="#fff" name="close" size={24} />
            </Pressable>
          </View>
        </View>
      </Modal>
      {currentPetModel ? (
        <Animated.View
          style={[
            {
              position: "absolute",
              bottom: Math.max(composerPanelHeight, 24),
              right: 16,
              width: 240,
              height: 320,
              transform: [
                { translateX: petPan.x },
                { translateY: petPan.y },
                { scale: petScale },
              ],
              zIndex: 9999,
            },
          ]}
        >
          {petVisible && (
            <View
              {...petPanResponder.panHandlers}
              style={{ flex: 1, position: "relative" }}
            >
              <Live2DPetView
                ref={petRef}
                modelUrl={currentPetModel.url}
                onLoadSuccess={(motions) => {
                  if (motions) setLoadedMotions(motions);
                }}
                style={{ width: "100%", height: "100%" }}
                onHitAreaClicked={handlePetHitArea}
              />
              <Animated.View
                {...scalePanResponder.panHandlers}
                style={{
                  position: "absolute",
                  bottom: -10,
                  right: -10,
                  width: 48,
                  height: 48,
                  backgroundColor: "rgba(255,255,255,0.7)",
                  borderRadius: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  elevation: 3,
                  opacity: resizeHandleOpacity,
                }}
              >
                <Ionicons
                  name="resize"
                  size={24}
                  color="#666"
                  style={{ transform: [{ rotate: "90deg" }] }}
                />
              </Animated.View>
            </View>
          )}
        </Animated.View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  drawerHost: {
    flex: 1,
    gap: 0,
    paddingHorizontal: 0,
  },
  keyboardAvoidingHost: {
    flex: 1,
  },
  screenContent: {
    flex: 1,
    gap: rhythm.cardContentGap,
    paddingHorizontal: layout.pagePaddingHorizontal,
  },
  composerPanel: {
    backgroundColor: aiLightColors.canvas,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingBottom: spacing[3],
    paddingTop: spacing[2],
    ...shadows.none,
  },
  header: {
    alignItems: "center",
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: spacing[12],
  },
  headerSide: {
    alignItems: "center",
    flexDirection: "row",
  },
  pressed: {
    opacity: 0.72,
  },
  iconBtn: {
    alignItems: "center",
    height: spacing[10],
    justifyContent: "center",
    width: spacing[10],
  },
  iconBtnDisabled: {
    opacity: 0.3,
  },
  newChatIconWrap: {
    alignItems: "center",
    height: spacing[7],
    justifyContent: "center",
    width: spacing[7],
  },
  newChatIconBadge: {
    alignItems: "center",
    backgroundColor: aiLightColors.primaryActive,
    borderColor: aiLightColors.canvas,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[3],
    justifyContent: "center",
    minWidth: spacing[3],
    position: "absolute",
    right: NEW_CHAT_BADGE_OFFSET,
    top: NEW_CHAT_BADGE_OFFSET,
  },
  titleBlock: {
    alignItems: "center",
    flex: 1,
    gap: rhythm.microGap,
    justifyContent: "center",
  },
  titleLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: rhythm.microGap,
    justifyContent: "center",
    maxWidth: "100%",
  },
  title: {
    ...typography.textStyles.navTitle,
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 26,
    maxWidth: "90%",
  },
  modelSubtitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    maxWidth: "92%",
    textAlign: "center",
  },
  newChatFeedback: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: aiLightColors.surface,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing[1],
    minHeight: spacing[7],
    paddingHorizontal: spacing[3],
  },
  newChatFeedbackText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    fontWeight: "600",
  },
  continuityInlineNotice: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[2],
    minHeight: spacing[6],
    paddingVertical: spacing[1],
  },
  continuityInlineNoticeMain: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing[2],
  },
  continuityInlineNoticeText: {
    ...typography.textStyles.caption,
    color: aiLightColors.ink,
    flex: 1,
    fontWeight: "600",
  },
  continuityInlineNoticeDetail: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: spacing[7],
  },
  continuityInlineNoticeDetailText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    fontWeight: "600",
  },
  liveDot: {
    backgroundColor: aiLightColors.primary,
    borderRadius: radius.pill,
    height: spacing[1.5],
    width: spacing[1.5],
  },
  error: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
    textAlign: "center",
  },
  messageScroller: {
    flex: 1,
  },
  messageArea: {
    flex: 1,
  },
  messageScrollContent: {
    flexGrow: 1,
    gap: rhythm.listCardGap,
    paddingBottom: spacing[4],
    paddingTop: spacing[3],
  },
  starterOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  starterWrap: {
    alignItems: "center",
    flex: 1,
    gap: rhythm.inlineGap,
    justifyContent: "flex-end",
    paddingBottom: spacing[8],
    paddingHorizontal: spacing[2],
  },
  starterGreeting: {
    color: aiLightColors.ink,
    fontFamily: aiLightDisplayFont,
    fontSize: 28,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 36,
    opacity: 0.78,
    textAlign: "center",
  },
  starterSuggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: rhythm.microGap,
    justifyContent: "center",
  },
  starterChip: {
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  starterChipText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  loadEarlierButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing[1],
    minHeight: 30,
    paddingHorizontal: spacing[3],
  },
  loadEarlierText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontWeight: "600",
  },
  dateSeparator: {
    ...typography.textStyles.micro,
    alignSelf: "center",
    color: aiLightColors.muted,
    paddingVertical: spacing[1],
  },
  inlineMemoryNotice: {
    alignSelf: "flex-end",
    maxWidth: "88%",
  },
  tailBlockContainer: {
    paddingHorizontal: spacing[4],
  },
  searchHighlightWrap: {
    backgroundColor: aiLightColors.primarySoft,
    borderColor: aiLightColors.primary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing[1],
  },
});
