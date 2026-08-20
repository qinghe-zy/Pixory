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
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  FlatList,
  InteractionManager,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type NativeTouchEvent,
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
import { KeyboardAvoidingView } from "react-native-keyboard-controller";

import { ParallaxLightSweep } from "../components/ParallaxLightSweep";
import {
  AiChatComposer,
  type AiComposerAttachment,
} from "../components/ai/AiChatComposer";
import { AiChatErrorBanner } from "../components/ai/AiChatErrorBanner";
import { DiaryChatCard } from '../components/ai/DiaryChatCard';
import { DreamChatCard } from '../components/ai/DreamChatCard';
import {
  AiAnchoredContextMenu,
  type AiAnchoredContextMenuAction,
} from '../components/ai/AiAnchoredContextMenu';
import { AiComprehensiveRecordDrawer } from "../components/ai/AiComprehensiveRecordDrawer";
import { AiSessionConfigScreen } from "./AiSessionConfigScreen";
import type { AiVoiceInputState } from "../components/ai/AiVoiceInputStatus";
import {
  aiLightColors,
  aiLightDisplayFont,
} from "../components/ai/aiLightTheme";
import { AiMemoryCaptureNotice } from "../components/ai/AiMemoryCaptureNotice";
import { AiCitationList } from "../components/ai/AiCitationList";
import { AiReplyAssistModal } from "../components/ai/AiReplyAssistModal";
import { AiMessageBubble } from "../components/ai/AiMessageBubble";
import {
  AiMessageContextMenu,
  type AiMessageContextMenuAction,
} from "../components/ai/AiMessageContextMenu";
import { AiMessageTextSelectionModal } from "../components/ai/AiMessageTextSelectionModal";
import { mergeBufferedStreamingPatchIntoContextMenuTarget } from "../components/ai/aiMessageContextMenuTarget";
import { AiStreamingTailSpacer } from "../components/ai/AiStreamingTailSpacer";
import { AiStreamingTailContinuationBubble } from "../components/ai/AiStreamingTailContinuationBubble";
import { AiStreamingTailMessageSegment } from "../components/ai/AiStreamingTailMessageSegment";
import { SecureImage } from "../components/SecureImage";
import { AiScrollToLatestButton } from "../components/ai/AiScrollToLatestButton";
import { AppScreen } from "../components/AppScreen";
import {
  addNativeSpeechRecognitionListener,
  cancelSpeechRecognition,
  getSpeechRecognitionCapabilities,
  startSpeechRecognition,
  stopSpeechRecognition,
} from "../native/pixoryMediaModule";
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
  getCurrentChatModelPresentation,
  generateReplyAssistSuggestions,
  listThreadMessages,
  loadThreadMessagePage,
  loadThreadMessagePageAroundAnchor,
  loadThreadContinuityMilestones,
  loadThreadMessageAppearanceConfig,
  loadThreadTitle,
  listAiHistoryThreads,
  renameAiThread,
  rollbackThreadContinuityImport,
  listFavoriteAssistantMessageKeys,
  toggleAssistantMessageFavorite,
  type AiReplyAssistMode,
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
  resolveScrollToLatestGestureDirection,
  shouldReattachToLatest,
  shouldShowScrollToLatest,
  type ScrollToLatestGestureDirection,
} from "../ai/aiScrollToLatestPolicy";
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
  recordDetachedTailMerge,
  recordStreamingUiCommit,
} from "../ai/aiStreamingPerformanceDiagnostics";
import {
  getAiTailReplaySingleBubbleEnabled,
  refreshAiTailReplaySingleBubbleEnabled,
} from "../ai/aiStreamingTailFeatureFlags";
import {
  buildTailMessageSegments,
  canCommitStreamingTailToMessage,
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
import {
  diaryRepository,
  type RoleDiaryRecord,
  type RoleDiaryVersionGroup,
  type RoleDiaryVersionRecord,
} from '../ai/diary/diaryRepository';
import { regenerateDiaryVersion } from '../ai/diary/diaryVersionService';
import { companionArtifactChatStateRepository } from '../ai/companion/companionArtifactChatStateRepository';
import {
  buildCompanionArtifactTimeline,
  isDiaryEligibleForCompanionTimeline,
  type CompanionArtifactEntry,
} from '../ai/companion/companionArtifactTimelineService';
import { scheduleCompanionMaintenance } from '../ai/companion/companionMaintenanceQueue';
import { runDiaryJobInBackground, runDiaryTaskInBackground } from '../ai/diary/diaryGenerationManager';
import { isDiaryCreationRequest } from '../ai/diary/diaryCommandIntent';
import { prepareAndScheduleDiaryJob } from '../ai/diary/diarySchedulerService';
import { beijingDiaryDate } from '../ai/diary/diaryTypes';
import { subscribeDiaryRuntimeNotices } from '../ai/diary/diaryRuntimeEvents';
import {
  dreamRepository,
  type DreamJobRecord,
  type DreamRecord,
  type DreamVersionGroup,
} from '../ai/dream/dreamRepository';
import {
  confirmManualDream,
  regenerateDreamFromCurrentConversation,
  regenerateDreamVersion,
} from '../ai/dream/dreamService';
import { cancelDreamGeneration, retryDreamGeneration } from '../ai/dream/dreamWorker';
import { presentDreamFailure } from '../ai/dream/dreamPolicy';
import { loadDreamRuntimeNotice, subscribeDreamRuntimeNotices, type DreamRuntimeNotice } from '../ai/dream/dreamRuntimeEvents';
import { hashBranchRoute } from '../ai/context/conversationCoverage';
import type {
  AiBranchScope,
  AiMessagePageCursor,
  AiThreadContinuityMilestoneRecord,
  AiThreadHistoryItem,
} from "../database/repositories/aiThreadRepository";
import {
  layout,
  metrics,
  radius,
  rhythm,
  shadows,
  spacing,
  typography,
} from "../design/tokens";
import { formatAiMessageMinute } from "../utils/aiTimeFormatters";
import { AiChatMessageSkeleton } from "../components/ai/AiChatMessageSkeleton";
import { consumeThreadMessagePrefetch } from "../ai/aiThreadMessagePrefetch";
import { mergeOrderedMessagePages } from "../ai/aiMessagePageMerge";
import { validateAiChatAttachments } from "../ai/aiAttachmentPolicy";
import {
  isAdoptedThreadRouteSnapshotCurrent,
  loadPersistedAdoptedThreadBranchScopes,
} from "../ai/aiThreadRouteSnapshotService";
import { subscribeAiThreadPresentation } from "../ai/aiThreadPresentationEvents";

const MESSAGE_STREAM_FOLLOW_THRESHOLD = 48;
const MESSAGE_SAFE_FLUSH_OFFSET = 32;
const STICK_TO_BOTTOM_OFFSET_PX = 70;
const USER_SCROLL_IDLE_TIMEOUT_MS = 150;
const SHRINK_DEBOUNCE_MS = 150;
const SHRINK_STABLE_DELAY_MS = 200;
const RETAIN_RECONCILE_WINDOW_MS = 350;
const MESSAGE_LIST_ANCHOR_CONFIG = { minIndexForVisible: 0 };
const CHAT_MESSAGE_PAGE_SIZE = 60;
const COMPOSER_ENTRANCE_DURATION_MS = 500;
const COMPOSER_FOCUS_VISIBILITY_DELAYS_MS = [80, 260];
const ACTIVE_LATEST_JUMP_RETRY_DELAYS_MS = [50, 120, 180, 400, 700];
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

type MessageContextMenuState = {
  anchorX: number;
  anchorY: number;
  messageId: string;
};

type ArtifactContextMenuState = {
  anchorX: number;
  anchorY: number;
  artifactKind: 'diary' | 'dream';
  createdAt: string;
  groupId: string;
  versionId: string;
};

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

function getSelectableMessageContent(
  message: AiMessageWithCitations,
): string {
  const content = message.content || message.errorMessage || "";
  if (message.role !== "user") {
    return content;
  }
  const attachmentMarkerIndex = content.indexOf("\n\n[附件]");
  const visibleContent =
    attachmentMarkerIndex >= 0
      ? content.slice(0, attachmentMarkerIndex)
      : content;
  return visibleContent === "请根据以下附件继续对话。" ? "" : visibleContent;
}

function createOptimisticUserMessage(
  threadId: string,
  userMessageId: string,
  content: string,
  createdAt: string,
  branchRootMessageId: string | null,
  branchVersionIndex: number | null,
): AiMessageWithCitations {
  return {
    branchRootMessageId,
    branchVersionIndex,
    citations: [],
    completedAt: createdAt,
    continuityImportSessionId: null,
    continuitySyntheticKind: null,
    content,
    createdAt,
    errorMessage: null,
    id: userMessageId,
    messageVersions: [],
    modelId: null,
    modelSnapshotJson: "",
    promptSnapshotJson: "",
    providerId: null,
    reasoningText: null,
    role: 'user',
    status: 'completed',
    threadId,
    updatedAt: createdAt,
    versionIndex: 1,
    versionTotal: 1,
  };
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

function formatDateSeparator(dateKey: string): string {
  if (dateKey === beijingDiaryDate(new Date())) {
    return "今天";
  }
  if (dateKey === beijingDiaryDate(new Date(Date.now() - 24 * 60 * 60 * 1_000))) {
    return "昨天";
  }
  return dateKey;
}

function getAiChatStarterGroup(date = new Date()): { greeting: string; suggestions: readonly string[] } {
  const hour = date.getHours();
  
  if (hour >= 6 && hour < 10) {
    return {
      greeting: "早安，今天也要开开心心呀",
      suggestions: [
        "昨晚做了一个奇怪的梦",
        "今天有什么好建议吗？",
        "给我一句元气满满的鼓励"
      ]
    };
  } else if (hour >= 10 && hour < 12) {
    return {
      greeting: "上午好！在忙些什么呢？",
      suggestions: [
        "刚才发生了一件好玩的事",
        "我来找你吐槽一下",
        "帮我梳理一下现在的思绪"
      ]
    };
  } else if (hour >= 12 && hour < 14) {
    return {
      greeting: "午饭时间到，快来歇一会儿～",
      suggestions: [
        "中午吃点什么好呢？",
        "我好困，给我讲个笑话吧",
        "闲着也是闲着，玩个文字游戏？"
      ]
    };
  } else if (hour >= 14 && hour < 18) {
    return {
      greeting: "下午好，是不是有点犯困了？",
      suggestions: [
        "我有点累了，陪我聊会儿",
        "推荐一首适合现在听的歌",
        "带我出去脑洞大开一下！"
      ]
    };
  } else if (hour >= 18 && hour < 23) {
    return {
      greeting: "终于闲下来了，今天过得怎样？",
      suggestions: [
        "终于可以彻底放松啦！",
        "晚上有什么好玩的计划？",
        "安静地听我说说今天的心事"
      ]
    };
  } else {
    // 23:00 - 05:59
    return {
      greeting: "夜深了，全世界都睡了，我还在。",
      suggestions: [
        "睡不着，陪我聊聊天",
        "忽然想起来一段往事",
        "别说话，快哄我睡觉"
      ]
    };
  }
}

function buildReplyAssistTranscript(
  messages: AiMessageWithCitations[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter(
      (
        message,
      ): message is AiMessageWithCitations & {
        role: "user" | "assistant";
      } =>
        (message.role === "user" || message.role === "assistant") &&
        message.status !== "generating" &&
        message.content.trim().length > 0,
    )
    .slice(-12)
    .map((message) => ({
      content: message.content.trim(),
      role: message.role,
    }));
}

function canOpenReplyAssist(messages: AiMessageWithCitations[]): boolean {
  const transcript = buildReplyAssistTranscript(messages);
  if (transcript.length === 0) {
    return false;
  }
  return transcript[transcript.length - 1]?.role === "assistant";
}

type ReplyAssistPagesByMode = Record<AiReplyAssistMode, string[][]>;

type ReplyAssistPageIndexByMode = Record<AiReplyAssistMode, number>;

type ReplyAssistRequestSnapshot = {
  branchScopes: AiBranchScope[];
  contextSignature: string;
  threadId: string;
  transcript: Array<{ role: "user" | "assistant"; content: string }>;
};

function createEmptyReplyAssistPagesByMode(): ReplyAssistPagesByMode {
  return {
    long: [],
    short: [],
  };
}

function createEmptyReplyAssistPageIndexByMode(): ReplyAssistPageIndexByMode {
  return {
    long: 0,
    short: 0,
  };
}

function cloneReplyAssistPagesByMode(
  pagesByMode: ReplyAssistPagesByMode,
): ReplyAssistPagesByMode {
  return {
    long: pagesByMode.long.map((page) => [...page]),
    short: pagesByMode.short.map((page) => [...page]),
  };
}

function buildReplyAssistContextSignature(input: {
  threadId: string | null;
  branchScopes: AiBranchScope[];
  visibleMessages: AiMessageWithCitations[];
}): string {
  const branchScopeKey = [...input.branchScopes]
    .sort((left, right) =>
      left.branchRootMessageId.localeCompare(right.branchRootMessageId) ||
      left.branchVersionIndex - right.branchVersionIndex,
    )
    .map(
      (scope) => `${scope.branchRootMessageId}:${scope.branchVersionIndex}`,
    )
    .join("|");
  const transcriptKey = input.visibleMessages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        message.status !== "generating" &&
        message.content.trim().length > 0,
    )
    .slice(-12)
    .map(
      (message) =>
        `${message.id}:${message.versionIndex}:${message.role}:${message.content.trim()}`,
    )
    .join("|");
  return [input.threadId ?? "no-thread", branchScopeKey, transcriptKey].join(
    "::",
  );
}

function isReplyAssistAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /aborted?/i.test(error.message))
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

function messageUsesStandaloneAssistantDisplay(message: AiMessageWithCitations): boolean {
  try {
    const snapshot = message.promptSnapshotJson
      ? JSON.parse(message.promptSnapshotJson)
      : null;
    return snapshot?.messageDisplayKind === "standalone_assistant";
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
    }
  | {
      type: "dateSeparator";
      id: string;
      label: string;
      dateKey: string;
    }
  | {
      type: "streamTailSpacer";
      id: string;
      height: number;
      messageId: string;
    }
  | AiTailMessageSegment
  | AiTailDebtSpacerItem
  | {
      type: "streamTailContinuation";
      id: string;
      group: AiStreamingTailContinuationGroup;
    }
  | {
      type: 'diary';
      id: string;
      diary: RoleDiaryRecord;
      version: RoleDiaryVersionRecord;
      versionIndex: number;
      versionTotal: number;
    }
  | {
      type: 'dream';
      id: string;
      anchorCreatedAt: string;
      dream: DreamRecord;
      versionIndex: number;
      versionTotal: number;
    }
  | {
      type: 'dreamJob';
      id: string;
      job: DreamJobRecord;
    };

type ChatCompanionArtifactPayload =
  | { diary: RoleDiaryRecord; version: RoleDiaryVersionRecord; versionIndex: number; versionTotal: number }
  | { anchorCreatedAt: string; dream: DreamRecord; versionIndex: number; versionTotal: number }
  | DreamJobRecord;

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
  const starter = getAiChatStarterGroup();
  return (
    <View style={styles.starterWrap}>
      <Text style={styles.starterGreeting}>{starter.greeting}</Text>
      <View style={styles.starterSuggestions}>
        {starter.suggestions.map((suggestion) => (
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
  onOpenProviderSettings: () => void;
    onOpenMemoryBoard: (threadId: string) => void;
    onOpenBranchTree: (threadId: string) => void;
    onOpenChatSearch: (threadId: string) => void;
    onOpenThreadMaterials: (threadId: string) => void;
    onOpenInnerLife: (threadId: string) => void;
    onOpenCompanionRuntime: (threadId: string) => void;
    onCurrentThreadDeleted: (threadId: string) => void;
  onOpenDiary: (diaryId: string, versionId?: string) => void;
  onOpenDream: (dreamId: string) => void;
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
  onOpenProviderSettings,
    onOpenMemoryBoard,
    onOpenBranchTree,
    onOpenChatSearch,
    onOpenThreadMaterials,
    onOpenInnerLife,
    onOpenCompanionRuntime,
    onCurrentThreadDeleted,
  onOpenDiary,
  onOpenDream,
  onNewChat,
  onOpenThread,
  onOpenSource,
  onOpenIpSource,
  onOpenImageSource,
  onThreadReady,
  onThreadTitleChange,
}: AiChatScreenProps) {
  const insets = useSafeAreaInsets();

  const initialBottomInsetRef = useRef(insets.bottom);
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
  const pendingReplyTargetScrollMessageIdRef = useRef<string | null>(null);
  const appliedBranchTreeSelectionKeyRef = useRef<string | null>(null);
  const appliedSearchTargetKeyRef = useRef<string | null>(null);
  const activeMessageBranchScopesRef = useRef<AiBranchScope[] | undefined>(
    undefined,
  );
  const selectedVersionByMessageIdRef = useRef<Record<string, number>>({});

  const spaceRef = useRef(space);
  spaceRef.current = space;


  // Right-swipe opens the left record drawer; left-swipe opens the right config drawer.
  const swipeDrawerPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > DRAWER_SWIPE_ACTIVATION_DISTANCE &&
        Math.abs(gs.dx) > Math.abs(gs.dy) * DRAWER_SWIPE_HORIZONTAL_RATIO,
      onPanResponderRelease: (_evt, gs) => {
        // Right swipe → left record drawer
        if (
          gs.dx > DRAWER_SWIPE_RELEASE_DISTANCE ||
          (gs.dx > DRAWER_SWIPE_ACTIVATION_DISTANCE && gs.vx > 0.18)
        ) {
          setRecordDrawerVisible(true);
          return;
        }
        // Left swipe → right config drawer
        if (
          gs.dx < -DRAWER_SWIPE_RELEASE_DISTANCE ||
          (gs.dx < -DRAWER_SWIPE_ACTIVATION_DISTANCE && gs.vx < -0.18)
        ) {
          setConfigDrawerVisible(true);
        }
      },
    }),
  ).current;

  const olderMessageCursorRef = useRef<AiMessagePageCursor | null>(null);
  const userScrolledAwayFromBottomRef = useRef(false);
  const bottomLockedRef = useRef(true);
  const isUserDraggingRef = useRef(false);
  const isMomentumScrollingRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const escapedFromLockRef = useRef(false);
  const lastUserScrollAtRef = useRef(0);
  const showScrollToLatestRef = useRef(false);
  const messageScrollOffsetRef = useRef(0);
  const messageTouchStartYRef = useRef<number | null>(null);
  const messageTouchDirectionRef =
    useRef<ScrollToLatestGestureDirection>('undetermined');
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
  const replyAssistAbortControllersRef = useRef(new Set<AbortController>());
  const replyAssistCacheRef = useRef(new Map<string, ReplyAssistPagesByMode>());
  const replyAssistContextSignatureRef = useRef<string | null>(null);
  const replyAssistInFlightRef = useRef(new Map<string, Promise<string[]>>());
  const replyAssistSessionIdRef = useRef(0);
  const replyAssistWarmupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const replyAssistBackgroundPrefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const inlineEditSafeVisibleMessageIdsRef = useRef(new Set<string>());
  const inlineEditViewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 82,
  });
  const streamingTailViewabilityConfigRef = useRef({
    viewAreaCoveragePercentThreshold: 0.1,
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
  const liveStreamingRestoreAnimationFrameRef = useRef<number | null>(null);
  const reconcileForceRenderRef = useRef(false);
  const reconcileAllowFollowLatestRef = useRef(false);
  const reconcileReasonRef = useRef<string | null>(null);
  const allowFullShrinkSettlementRef = useRef(false);
  const pendingStreamingTailCommitRef = useRef(false);
  const commitStreamingTailIfStableRef = useRef<() => boolean>(() => false);
  const visibleStreamingTailMessageIdsRef = useRef(new Set<string>());
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
      const pendingReplyTargetMessageId =
        pendingReplyTargetScrollMessageIdRef.current;
      if (
        pendingReplyTargetMessageId &&
        nextVisibleMessageIds.has(pendingReplyTargetMessageId)
      ) {
        pendingReplyTargetScrollMessageIdRef.current = null;
        clearReplyTargetVisibilityTimeouts();
      }
    },
  );
  // Keep replay visibility independent from the stricter inline-edit threshold.
  const handleStreamingTailViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: ViewToken<VisibleMessageItem>[] }) => {
      const nextVisibleMessageIds = new Set<string>();
      viewableItems.forEach((token) => {
        if (!token.isViewable) {
          return;
        }
        const item = token.item;
        if (item.type === "message") {
          nextVisibleMessageIds.add(item.message.id);
        } else if (item.type === "messageSegment" || item.type === "tailDebtSpacer") {
          nextVisibleMessageIds.add(item.messageId);
        } else if (item.type === "streamTailContinuation") {
          nextVisibleMessageIds.add(item.group.messageId);
        } else if (item.type === "streamTailSpacer" && item.messageId) {
          nextVisibleMessageIds.add(item.messageId);
        }
      });
      visibleStreamingTailMessageIdsRef.current = nextVisibleMessageIds;
      commitStreamingTailIfStableRef.current();
    },
  );
  const viewabilityConfigCallbackPairsRef = useRef([
    {
      onViewableItemsChanged: handleInlineEditViewableItemsChangedRef.current,
      viewabilityConfig: inlineEditViewabilityConfigRef.current,
    },
    {
      onViewableItemsChanged: handleStreamingTailViewableItemsChangedRef.current,
      viewabilityConfig: streamingTailViewabilityConfigRef.current,
    },
  ]);
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
  const thinkingExpectedByMessageIdRef = useRef(new Map<string, boolean>());
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
  const replyTargetVisibilityTimeoutsRef = useRef<
    Array<ReturnType<typeof setTimeout>>
  >([]);
  const voiceResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const voiceSessionActiveRef = useRef(false);
  const voiceCancelledRef = useRef(false);
  const voiceSessionTokenRef = useRef(0);
  const voiceStopRequestedRef = useRef(false);
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
  const [roleDiaries, setRoleDiaries] = useState<RoleDiaryRecord[]>([]);
  const [diaryVersionsById, setDiaryVersionsById] = useState<
    Record<string, RoleDiaryVersionRecord[]>
  >({});
  const activeDiaryRoleCardIdRef = useRef<string | null>(null);
  const [roleDreams, setRoleDreams] = useState<DreamRecord[]>([]);
  const [dreamVersionsByGroupId, setDreamVersionsByGroupId] = useState<
    Record<string, DreamRecord[]>
  >({});
  const [selectedArtifactVersionByGroupId, setSelectedArtifactVersionByGroupId] =
    useState<Record<string, string>>({});
  const regeneratedArtifactGroupIdsRef = useRef(new Set<string>());
  const pendingDreamRegenerationBaseVersionByGroupIdRef = useRef(new Map<string, string>());
  const [roleDreamJobs, setRoleDreamJobs] = useState<DreamJobRecord[]>([]);
  const [regeneratingDreamGroupIds, setRegeneratingDreamGroupIds] = useState<Set<string>>(new Set());
  const [dreamNotice, setDreamNotice] = useState<DreamRuntimeNotice | null>(null);
  const [diaryManualHint, setDiaryManualHint] = useState(false);
  const [diaryCommandHint, setDiaryCommandHint] = useState(false);
  const [diaryGenerationStatus, setDiaryGenerationStatus] = useState<
    'generating' | { message: string; state: 'failed' } | null
  >(null);
  const diaryGenerationJobRef = useRef<Promise<void> | null>(null);
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
  const nativeMessageScrollOffsetRef = useRef(0);
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
  const [replyAssistVisible, setReplyAssistVisible] = useState(false);
  const [replyAssistMode, setReplyAssistMode] =
    useState<AiReplyAssistMode>("short");
  const [replyAssistPagesByMode, setReplyAssistPagesByMode] = useState<
    ReplyAssistPagesByMode
  >(createEmptyReplyAssistPagesByMode);
  const [replyAssistPageIndexByMode, setReplyAssistPageIndexByMode] = useState<
    ReplyAssistPageIndexByMode
  >(createEmptyReplyAssistPageIndexByMode);
  const [replyAssistLoading, setReplyAssistLoading] = useState(false);
  const [replyAssistError, setReplyAssistError] = useState<string | null>(null);
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
        commitStreamingTailIfStableRef.current();

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
      abortReplyAssistRequest();
      if (replyAssistWarmupTimeoutRef.current) {
        clearTimeout(replyAssistWarmupTimeoutRef.current);
      }
      if (replyAssistBackgroundPrefetchTimeoutRef.current) {
        clearTimeout(replyAssistBackgroundPrefetchTimeoutRef.current);
      }
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
      if (liveStreamingRestoreAnimationFrameRef.current != null) {
        cancelAnimationFrame(liveStreamingRestoreAnimationFrameRef.current);
      }
    };
  }, []);

  function getMessageItemIdAtIndex(index: number): string | null {
    const item = invertedMessageItems[index];
    return item?.type === "message" ? item.message.id : null;
  }

  const [hasEarlierMessages, setHasEarlierMessages] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [isInitialMessageLoading, setIsInitialMessageLoading] = useState(true);
  const [isMessageListReady, setIsMessageListReady] = useState(false);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === "active");

  const [showSweep, setShowSweep] = useState(true);

  useEffect(() => {
    if (!isInitialMessageLoading) {
      const timer = setTimeout(() => setShowSweep(false), 500);
      return () => clearTimeout(timer);
    } else {
      setShowSweep(true);
    }
  }, [isInitialMessageLoading]);
  const [singleBubbleTailReplayEnabled] = useState(
    getAiTailReplaySingleBubbleEnabled,
  );

  useEffect(() => {
    void refreshAiTailReplaySingleBubbleEnabled();
  }, []);

  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(
    null,
  );

  const draftThreadKey = threadId ?? "new_chat";
  const isComposerDraftLoadedRef = useRef(false);

  useEffect(() => {
    isComposerDraftLoadedRef.current = false;
    setComposerText("");
    setAssistantReplyTarget(null);
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
  const [editingUserMessageInitialDraft, setEditingUserMessageInitialDraft] = useState<
    string | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [messageLoadError, setMessageLoadError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    AiComposerAttachment[]
  >([]);
  const [assistantReplyTarget, setAssistantReplyTarget] = useState<{
    messageId: string;
  } | null>(null);
  const [pendingMessageActionId, setPendingMessageActionId] = useState<
    string | null
  >(null);
  const [favoriteStateByKey, setFavoriteStateByKey] = useState<
    Record<string, boolean>
  >({});
  const [messageContextMenuState, setMessageContextMenuState] =
    useState<MessageContextMenuState | null>(null);
  const [artifactContextMenuState, setArtifactContextMenuState] =
    useState<ArtifactContextMenuState | null>(null);
  const [artifactActionPending, setArtifactActionPending] = useState(false);
  const [messageTextSelectionContent, setMessageTextSelectionContent] = useState<{
    messageId: string; content: string; role: string;
  } | null>(null);
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
  const [voiceMode, setVoiceMode] = useState<'on_device' | 'system' | null>(null);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [composerPanelHeight, setComposerPanelHeight] = useState(0);
  const [composerShellHeight, setComposerShellHeight] = useState(0);
  const [recentThreads, setRecentThreads] = useState<AiThreadHistoryItem[]>([]);
  const [newChatFeedbackVisible, setNewChatFeedbackVisible] = useState(false);
  const [recordDrawerVisible, setRecordDrawerVisible] = useState(false);
  const [configDrawerVisible, setConfigDrawerVisible] = useState(false);
  const [searchHighlightMessageId, setSearchHighlightMessageId] = useState<
    string | null
  >(null);
  const [continuityMilestones, setContinuityMilestones] = useState<
    AiThreadContinuityMilestoneRecord[]
  >([]);
  const editingUserMessageIdRef = useRef<string | null>(null);
  const thinking = generating;
  const inlineEditingActive = Boolean(editingUserMessageId);
  // Keep the outer panel at opacity=1 so Android elevation/shadow renders
  // correctly. Instead, fade out a canvas-colored reveal mask on top of the
  // content (opacity 1 → 0) which avoids the shadow artifact caused by
  // animating the container opacity directly.
  const composerRevealMaskOpacity = composerEntranceProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  // composerEntranceStyle left empty – outer panel stays at full opacity.
  const composerEntranceStyle = {};
  const latestAssistantMessage = useMemo(
    () => findLatestAssistantMessage(messages),
    [messages],
  );
  const diarySessionStartedAtRef = useRef(new Date().toISOString());

  const reloadRoleDiaries = useCallback(async () => {
    const targetThreadId = activeThreadIdRef.current;
    if (!targetThreadId) {
      activeDiaryRoleCardIdRef.current = null;
      setRoleDiaries([]);
      setDiaryVersionsById({});
      return;
    }
    const diaryState = await runWithDatabaseSpace(space, async (db) => {
      const thread = await aiThreadRepository.findThreadById(db, targetThreadId);
      if (!thread?.roleCardId) return { groups: [], roleCardId: null };
      const groups = await diaryRepository.listVersionGroupsForRole(db, thread.roleCardId);
      const hiddenGroupIds = await companionArtifactChatStateRepository.listHiddenGroupIds(db, targetThreadId, 'diary');
      return {
        groups: groups.filter((group) => !hiddenGroupIds.has(group.diary.id)),
        roleCardId: thread.roleCardId,
      };
    });
    if (screenMountedRef.current && targetThreadId === activeThreadIdRef.current) {
      activeDiaryRoleCardIdRef.current = diaryState.roleCardId;
      setRoleDiaries(diaryState.groups.map((group) => group.diary));
      setDiaryVersionsById(Object.fromEntries(
        diaryState.groups.map((group) => [group.diary.id, group.versions]),
      ));
      setSelectedArtifactVersionByGroupId((previous) => {
        const next = { ...previous };
        for (const group of diaryState.groups) {
          const currentVersionId = group.diary.currentVersionId ?? group.versions.at(-1)?.id;
          if (!currentVersionId) continue;
          if (regeneratedArtifactGroupIdsRef.current.delete(group.diary.id) || !group.versions.some((version) => version.id === next[group.diary.id])) {
            next[group.diary.id] = currentVersionId;
          }
        }
        return next;
      });
    }
  }, [space]);

  useEffect(() => subscribeDiaryRuntimeNotices((notice) => {
    if (notice.space !== space || notice.roleCardId !== activeDiaryRoleCardIdRef.current) return;
    void reloadRoleDiaries();
  }), [reloadRoleDiaries, space]);

  const reloadRoleDreams = useCallback(async () => {
    const targetThreadId = activeThreadIdRef.current;
    if (!targetThreadId) { setRoleDreams([]); setDreamVersionsByGroupId({}); setRoleDreamJobs([]); setRegeneratingDreamGroupIds(new Set()); return; }
    const { groups, jobs, regeneratingGroupIds } = await runWithDatabaseSpace(space, async (db) => {
      const thread = await aiThreadRepository.findThreadById(db, targetThreadId);
      if (!thread?.roleCardId) return { groups: [], jobs: [], regeneratingGroupIds: [] };
      const scopes = persistedCurrentBranchScopes.length > 0 ? persistedCurrentBranchScopes : activeMessageBranchScopesRef.current ?? [];
      const route = hashBranchRoute(scopes);
      const allGroups = await dreamRepository.listVersionGroupsForRole(db, thread.roleCardId);
      const allJobs = await dreamRepository.listJobsForRole(db, thread.roleCardId);
      const hiddenGroupIds = await companionArtifactChatStateRepository.listHiddenGroupIds(db, targetThreadId, 'dream');
      const routeJobs = allJobs.filter(job => job.threadId === targetThreadId && job.branchRouteHash === route && job.lineageVersion === (thread.lineageVersion ?? 0));
      return {
        groups: allGroups.filter((group) => {
          const current = group.versions.find((dream) => dream.isCurrent) ?? group.versions.at(-1);
          if (!current) return false;
          return !hiddenGroupIds.has(group.id)
            && current.sourceThreadId === targetThreadId
            && current.sourceBranchRouteHash === route
            && current.lineageVersion === (thread.lineageVersion ?? 0);
        }),
        jobs: routeJobs.filter(job => job.targetVersionGroupId == null),
        regeneratingGroupIds: routeJobs
          .filter(job => job.targetVersionGroupId != null && ['pending', 'running', 'retry', 'waiting_model'].includes(job.status))
          .map(job => job.targetVersionGroupId as string),
      };
    });
    if (screenMountedRef.current && targetThreadId === activeThreadIdRef.current) {
      setRoleDreams(groups.map((group) => group.versions.find((dream) => dream.isCurrent) ?? group.versions.at(-1)).filter((dream): dream is DreamRecord => Boolean(dream)));
      setDreamVersionsByGroupId(Object.fromEntries(groups.map((group) => [group.id, group.versions])));
      setSelectedArtifactVersionByGroupId((previous) => {
        const next = { ...previous };
        for (const group of groups) {
          const current = group.versions.find((dream) => dream.isCurrent) ?? group.versions.at(-1);
          if (!current) continue;
          const regenerationBaseVersionId = pendingDreamRegenerationBaseVersionByGroupIdRef.current.get(group.id);
          if (regenerationBaseVersionId && current.id !== regenerationBaseVersionId) {
            next[group.id] = current.id;
            pendingDreamRegenerationBaseVersionByGroupIdRef.current.delete(group.id);
          } else if (!group.versions.some((dream) => dream.id === next[group.id])) {
            next[group.id] = current.id;
          }
        }
        return next;
      });
      setRoleDreamJobs(jobs);
      setRegeneratingDreamGroupIds(new Set(regeneratingGroupIds));
    }
  }, [persistedCurrentBranchScopes, space]);

  useEffect(() => {
    let disposed = false;
    const targetThreadId = activeThreadIdRef.current;
    const branchScopes = persistedCurrentBranchScopes.length > 0
      ? persistedCurrentBranchScopes
      : activeMessageBranchScopesRef.current ?? [];
    const reloadDreamNotice = async () => {
      if (!targetThreadId) return null;
      const notice = await runWithDatabaseSpace(space, async (db) => {
        const thread = await aiThreadRepository.findThreadById(db, targetThreadId);
        if (!thread) return null;
        return loadDreamRuntimeNotice(db, {
          branchRouteHash: hashBranchRoute(branchScopes),
          lineageVersion: thread.lineageVersion ?? 0,
          threadId: targetThreadId,
        });
      });
      if (!disposed && targetThreadId === activeThreadIdRef.current) setDreamNotice(notice);
      return notice;
    };
    if (targetThreadId) {
      void (async () => {
        await reloadDreamNotice().catch(() => {
          if (!disposed && targetThreadId === activeThreadIdRef.current) setDreamNotice(null);
        });
        await reloadRoleDreams().catch(() => undefined);
      })();
    } else {
      setDreamNotice(null);
    }
    const unsubscribe = subscribeDreamRuntimeNotices((notice) => {
      if (notice.threadId !== activeThreadIdRef.current) return;
      void (async () => {
        await reloadDreamNotice().catch(() => undefined);
        await reloadRoleDreams().catch(() => undefined);
      })();
    });
    return () => { disposed = true; unsubscribe(); };
  }, [activeThreadId, persistedCurrentBranchScopes, reloadRoleDreams, space]);

  useEffect(() => {
    if (dreamNotice?.type !== 'failed') return;
    let disposed = false;
    void runWithDatabaseSpace(space, (db) => dreamRepository.findJob(db, dreamNotice.jobId))
      .then((failedJob) => {
        if (disposed || !failedJob?.targetVersionGroupId) return;
        pendingDreamRegenerationBaseVersionByGroupIdRef.current.delete(failedJob.targetVersionGroupId);
        setErrorMessage(`梦境重新生成失败：${presentDreamFailure(failedJob.lastErrorCode).message}`);
      })
      .catch(() => undefined);
    return () => { disposed = true; };
  }, [dreamNotice, space]);

  const handleDreamJobRetry = useCallback(async (job: DreamJobRecord) => {
    try {
      setErrorMessage(null);
      const failure = presentDreamFailure(job.lastErrorCode);
      if (failure.retryMode === 'regenerate_current') {
        const replacementJobId = await regenerateDreamFromCurrentConversation({ failedJobId: job.id, space });
        if (!replacementJobId) {
          setErrorMessage('原梦境任务状态已变化，请刷新后再试。');
        }
      } else {
        const retryResult = await retryDreamGeneration(space, job.id);
        if (retryResult.status === 'frequency_blocked') {
          setErrorMessage('已达到今日次数或仍在梦境间隔内，请稍后再试。');
        } else if (retryResult.status === 'not_retryable') {
          setErrorMessage('梦境任务状态已变化，请刷新后再试。');
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? `梦境重试失败：${error.message}` : '梦境重试失败，请稍后再试。');
    } finally {
      await reloadRoleDreams().catch(() => undefined);
    }
  }, [reloadRoleDreams, space]);

  const handleDreamJobCancel = useCallback(async (job: DreamJobRecord) => {
    try {
      setErrorMessage(null);
      await cancelDreamGeneration(space, job.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? `取消梦境制作失败：${error.message}` : '取消梦境制作失败，请稍后再试。');
    } finally {
      await reloadRoleDreams().catch(() => undefined);
    }
  }, [reloadRoleDreams, space]);

  useEffect(() => {
    if (!thinking && !isInitialMessageLoading) {
      void reloadRoleDiaries();
    }
  }, [activeThreadId, isInitialMessageLoading, reloadRoleDiaries, thinking]);

  const generateDiaryManually = useCallback(async () => {
    if (diaryGenerationJobRef.current) {
      return diaryGenerationJobRef.current;
    }
    const targetThreadId = activeThreadIdRef.current;
    if (!targetThreadId) {
      return;
    }
    const task = runDiaryTaskInBackground({
      space,
      taskKey: `${space}:manual-diary:${targetThreadId}`,
      task: async () => {
      setDiaryGenerationStatus('generating');
      try {
        const job = await prepareAndScheduleDiaryJob({
          space,
          threadId: targetThreadId,
          diaryDate: beijingDiaryDate(diarySessionStartedAtRef.current),
          triggerKind: 'manual',
          scheduledFor: new Date().toISOString(),
          branchScopes: persistedCurrentBranchScopes.length > 0
            ? persistedCurrentBranchScopes
            : activeMessageBranchScopesRef.current ?? [],
        });
        setDiaryManualHint(false);
        await runDiaryJobInBackground({ jobId: job.id, space });
        const completedJob = await runWithDatabaseSpace(space, (db) =>
          diaryRepository.findJobById(db, job.id),
        );
        if (completedJob?.status !== 'completed') {
          throw new Error(completedJob?.errorMessage ?? '日记生成失败，请稍后重试。');
        }
        await reloadRoleDiaries();
        if (activeThreadIdRef.current === targetThreadId) {
          setDiaryGenerationStatus(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '日记生成失败，请稍后重试。';
        if (activeThreadIdRef.current === targetThreadId) {
          setDiaryGenerationStatus({ message, state: 'failed' });
        }
        throw error;
      }
      },
    });
    diaryGenerationJobRef.current = task;
    try {
      await task;
    } finally {
      if (diaryGenerationJobRef.current === task) {
        diaryGenerationJobRef.current = null;
      }
    }
  }, [persistedCurrentBranchScopes, reloadRoleDiaries, space]);

  const generateDiaryFromCommand = useCallback(async () => {
    setDiaryCommandHint(false);
    await generateDiaryManually();
  }, [generateDiaryManually]);

  useEffect(() => {
    setRoleDiaries([]);
    setDiaryVersionsById({});
    setRoleDreams([]);
    setDreamVersionsByGroupId({});
    setSelectedArtifactVersionByGroupId({});
    setRoleDreamJobs([]);
    setDreamNotice(null);
    setDiaryManualHint(false);
    setDiaryCommandHint(false);
    setDiaryGenerationStatus(null);
    diarySessionStartedAtRef.current = new Date().toISOString();
  }, [activeThreadId]);

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
            completedAt: tailState.completedAt,
            errorMessage: tailState.errorMessage,
            frozenContent: tailState.frozenContent,
            frozenReasoningText: tailState.frozenReasoningText,
            messageId: tailState.messageId,
            messageStatus: tailState.messageStatus,
            status: tailState.status,
            updatedAt: tailState.updatedAt,
          }
        : undefined;
    const displayMessages = nextVisibleMessages.map((message) =>
      selectVisibleMessage({ message, tailOverride }),
    );
    const visibleBranchScopes = persistedCurrentBranchScopes.length > 0
      ? persistedCurrentBranchScopes
      : activeMessageBranchScopesRef.current ?? [];
    const artifactEntries: Array<CompanionArtifactEntry<ChatCompanionArtifactPayload>> = [
      ...roleDiaries
        .filter((diary) => isDiaryEligibleForCompanionTimeline({
          activeBranchScopes: visibleBranchScopes,
          activeThreadId,
          sourceBranchRouteJson: diary.sourceBranchRouteJson,
          sourceThreadId: diary.sourceThreadId,
        }))
        .flatMap((diary) => {
          const versions = diaryVersionsById[diary.id] ?? [];
          const selectedVersionId = selectedArtifactVersionByGroupId[diary.id];
          const version = versions.find((entry) => entry.id === selectedVersionId)
            ?? versions.find((entry) => entry.id === diary.currentVersionId)
            ?? versions.at(-1);
          if (!version) return [];
          const versionIndex = Math.max(0, versions.findIndex((entry) => entry.id === version.id)) + 1;
          return [{
          createdAt: diary.createdAt,
          id: diary.id,
          kind: 'diary' as const,
          payload: { diary, version, versionIndex, versionTotal: versions.length },
          sourceMessageIds: diary.sourceMessageIds,
          }];
        }),
      ...roleDreams.flatMap((currentDream) => {
        const groupId = currentDream.versionGroupId;
        const versions = dreamVersionsByGroupId[groupId] ?? [];
        const anchorDream = versions.at(0) ?? currentDream;
        const selectedVersionId = selectedArtifactVersionByGroupId[groupId];
        const dream = versions.find((entry) => entry.id === selectedVersionId)
          ?? versions.find((entry) => entry.isCurrent)
          ?? currentDream;
        const versionIndex = Math.max(0, versions.findIndex((entry) => entry.id === dream.id)) + 1;
        return [{
        createdAt: anchorDream.displayAt,
        id: groupId,
        kind: 'dream' as const,
        payload: { anchorCreatedAt: anchorDream.displayAt, dream, versionIndex, versionTotal: versions.length },
        sourceMessageIds: anchorDream.sourceMessageIds,
        }];
      }),
      ...roleDreamJobs.map((job) => ({
        createdAt: job.createdAt,
        id: job.id,
        kind: 'dreamJob' as const,
        payload: job,
        sourceMessageIds: job.sourceMessageIds,
      })),
    ];
    const timelineItems = buildCompanionArtifactTimeline({
      artifacts: artifactEntries,
      messages: displayMessages,
    });
    const nextVisibleMessageItems: VisibleMessageItem[] = [];
    let previousMessage: AiMessageWithCitations | undefined;
    let previousMessageDateKey: string | null = null;
    timelineItems.forEach((item) => {
      if (item.type === 'artifact') {
        if (item.artifact.kind === 'diary') {
          const payload = item.artifact.payload as Extract<ChatCompanionArtifactPayload, { diary: RoleDiaryRecord }>;
          nextVisibleMessageItems.push({ type: 'diary', id: item.id, ...payload });
        } else if (item.artifact.kind === 'dream') {
          const payload = item.artifact.payload as Extract<ChatCompanionArtifactPayload, { dream: DreamRecord }>;
          nextVisibleMessageItems.push({ type: 'dream', id: item.id, ...payload });
        } else {
          const job = item.artifact.payload as DreamJobRecord;
          nextVisibleMessageItems.push({ type: 'dreamJob', id: item.id, job });
        }
        return;
      }

      const message = item.message;
      const dateKey = beijingDiaryDate(message.createdAt);
      const startsNewDate = dateKey !== previousMessageDateKey;
      if (startsNewDate) {
        nextVisibleMessageItems.push({
          type: "dateSeparator",
          id: `date-separator-${dateKey}`,
          label: formatDateSeparator(dateKey),
          dateKey,
        });
        previousMessageDateKey = dateKey;
      }
      nextVisibleMessageItems.push({
        id: message.id,
        type: "message",
        message,
        showAvatar:
          message.role === 'assistant' &&
          (startsNewDate ||
            previousMessage?.role !== 'assistant' ||
            messageUsesStandaloneAssistantDisplay(message)),
        showUserAvatar:
          message.role === 'user' &&
          (startsNewDate || previousMessage?.role !== 'user'),
      });
      previousMessage = message;
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
            edge:
              segment.blockRange.lane === "content" &&
              Boolean(tailState.frozenContent.trim())
                ? stitchTailSegmentEdgeAfterFrozenPrefix(segment.edge)
                : segment.edge,
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
            messageId: tailState.messageId ?? "",
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
    activeThreadId,
    messages,
    persistedCurrentBranchScopes,
    selectedVersionByMessageId,
    singleBubbleTailReplayEnabled,
    streamingTailVersion,
    roleDiaries,
    diaryVersionsById,
    roleDreams,
    dreamVersionsByGroupId,
    roleDreamJobs,
    selectedArtifactVersionByGroupId,
    thinking,
  ]);
  const {
    invertedMessageIndexById,
    invertedMessageItems,
    messagesById,
    visibleMessagesById,
    visibleMessageItems,
    visibleMessages,
  } = visibleMessageState;
  const latestVisibleMessageId =
    visibleMessages[visibleMessages.length - 1]?.id ?? null;
  const latestVisibleBranchRootMessageId = useMemo(
    () => findLatestVisibleBranchRootMessageId(visibleMessages),
    [visibleMessages],
  );
  const replyActionModeByMessageId = useMemo(() => {
    const next = new Map<string, "continue" | "reply">();
    visibleMessages.forEach((message, index) => {
      if (message.role !== "assistant" || message.status !== "completed") {
        return;
      }
      next.set(
        message.id,
        index < visibleMessages.length - 1 ? "reply" : "continue",
      );
    });
    return next;
  }, [visibleMessages]);
  useEffect(() => {
    if (!assistantReplyTarget) {
      return;
    }
    const targetMessage = visibleMessagesById.get(assistantReplyTarget.messageId);
    if (
      !targetMessage ||
      targetMessage.role !== "assistant" ||
      targetMessage.status !== "completed" ||
      targetMessage.versionIndex !== targetMessage.versionTotal ||
      replyActionModeByMessageId.get(assistantReplyTarget.messageId) !== "reply"
    ) {
      setAssistantReplyTarget(null);
    }
  }, [assistantReplyTarget, replyActionModeByMessageId, visibleMessagesById]);
  useEffect(() => {
    if (assistantReplyTarget) {
      return;
    }
    pendingReplyTargetScrollMessageIdRef.current = null;
    clearReplyTargetVisibilityTimeouts();
  }, [assistantReplyTarget]);
  const replyAssistContextSignature = useMemo(
    () =>
      buildReplyAssistContextSignature({
        branchScopes:
          persistedCurrentBranchScopes.length > 0
            ? persistedCurrentBranchScopes
            : Object.entries(selectedVersionByMessageId).map(
                ([branchRootMessageId, branchVersionIndex]) => ({
                  branchRootMessageId,
                  branchVersionIndex,
                }),
              ),
        threadId: activeThreadId,
        visibleMessages,
      }),
    [
      activeThreadId,
      persistedCurrentBranchScopes,
      selectedVersionByMessageId,
      visibleMessages,
    ],
  );
  useEffect(() => {
    if (
      replyAssistVisible &&
      replyAssistContextSignatureRef.current &&
      replyAssistContextSignatureRef.current !== replyAssistContextSignature
    ) {
      closeReplyAssistModal();
      return;
    }
    if (!replyAssistVisible) {
      replyAssistContextSignatureRef.current = replyAssistContextSignature;
    }
  }, [replyAssistContextSignature, replyAssistVisible]);
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
    pendingUserMessage?: {
      branchRootMessageId: string | null;
      branchVersionIndex: number | null;
      content: string;
      createdAt: string;
      hasAttachments: boolean;
    },
  ): AiGenerationSubscriber {
    return {
      // prettier-ignore
      getStreamingVisibility: () => getActiveStreamingVisibility(targetThreadId, generation),
      onCreated: ({ assistantMessageId, generationId, thinkingExpected, userMessageId }) => {
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
        thinkingExpectedByMessageIdRef.current.set(
          assistantMessageId,
          Boolean(thinkingExpected),
        );
        // prettier-ignore
        publishStreamingMessage(streamingIdentity, { content: '', reasoningText: null, status: 'generating' });
        // prettier-ignore
        thinkingExpandedByMessageIdRef.current.set(assistantMessageId, getLatestAssistantThinkingExpanded());
        setActiveAssistantId(assistantMessageId);
        setMessages((current) => {
          let nextMessages = current;
          if (
            pendingUserMessage &&
            !nextMessages.some((message) => message.id === userMessageId)
          ) {
            nextMessages = [
              ...nextMessages,
              createOptimisticUserMessage(
                targetThreadId,
                userMessageId,
                pendingUserMessage.content,
                pendingUserMessage.createdAt,
                pendingUserMessage.branchRootMessageId,
                pendingUserMessage.branchVersionIndex,
              ),
            ];
          }
          if (!nextMessages.some((message) => message.id === assistantMessageId)) {
            nextMessages = [
              ...nextMessages,
              createStreamingAssistantMessage(targetThreadId, assistantMessageId),
            ];
          }
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
          pendingStreamingTailCommitRef.current = true;
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
          if (pendingUserMessage?.hasAttachments) {
            await reloadMessages(targetThreadId);
          }
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
        void reloadThreadTitle(targetThreadId);
      },
    };
  }

  function beginStreamingRequest(
    targetThreadId: string,
    pendingUserMessage?: {
      branchRootMessageId: string | null;
      branchVersionIndex: number | null;
      content: string;
      createdAt: string;
      hasAttachments: boolean;
    },
  ): {
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
      subscriber: createGenerationSubscriber(
        targetThreadId,
        generation,
        pendingUserMessage,
      ),
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
    const nextShowScrollToLatest = shouldShowScrollToLatest(offsetY);
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
    if (liveStreamingRestoreAnimationFrameRef.current != null) {
      cancelAnimationFrame(liveStreamingRestoreAnimationFrameRef.current);
      liveStreamingRestoreAnimationFrameRef.current = null;
    }
    pendingStreamingTailCommitRef.current = false;
    visibleStreamingTailMessageIdsRef.current.clear();
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
    isMomentumScrollingRef.current = false;
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

  const handleMessageTouchStart = useCallback(
    (event: NativeSyntheticEvent<NativeTouchEvent>) => {
      messageTouchStartYRef.current = event.nativeEvent.pageY;
      messageTouchDirectionRef.current = 'undetermined';
    },
    [],
  );

  const handleMessageTouchMove = useCallback(
    (event: NativeSyntheticEvent<NativeTouchEvent>) => {
      const startY = messageTouchStartYRef.current;
      if (startY == null) return;
      messageTouchDirectionRef.current = resolveScrollToLatestGestureDirection(
        messageTouchDirectionRef.current,
        event.nativeEvent.pageY - startY,
      );
    },
    [],
  );

  const resetMessageTouchGesture = useCallback(() => {
    messageTouchStartYRef.current = null;
    messageTouchDirectionRef.current = 'undetermined';
  }, []);

  const handleMessageListContentSizeChange = useCallback(() => {
    if (!isInitialMessageLoading && invertedMessageItems.length > 0) {
      setIsMessageListReady(true);
    }
  }, [invertedMessageItems.length, isInitialMessageLoading]);

  // prettier-ignore
  const handleMessageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    nativeMessageScrollOffsetRef.current = contentOffset.y;
    scrollingTowardLatestRef.current =
      contentOffset.y <= previousMessageScrollOffsetRef.current;
    previousMessageScrollOffsetRef.current = contentOffset.y;
    messageScrollOffsetRef.current = contentOffset.y;
    lastUserScrollAtRef.current = Date.now();
    updateStreamingLockStateSnapshot(contentOffset.y);
    syncTailViewportPolicyForCurrentTailState();
    userScrolledAwayFromBottomRef.current = !isNearBottomRef.current;
    if (shouldReattachToLatest({ direction: messageTouchDirectionRef.current, offsetY: contentOffset.y })) {
      resetMessageTouchGesture();
      followLatestMessage(false);
      return;
    }
    const nextShowScrollToLatest = shouldShowScrollToLatest(contentOffset.y);
    setScrollToLatestVisible(nextShowScrollToLatest);
    scheduleStreamingTailReconcile("scroll");
  }, [followLatestMessage, resetMessageTouchGesture, scheduleStreamingTailReconcile, syncTailViewportPolicyForCurrentTailState, updateStreamingLockStateSnapshot]);

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
          followLatestMessage(animated || delay > 250);
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
    if (assistantReplyTarget?.messageId) {
      scheduleReplyTargetVisibility(assistantReplyTarget.messageId);
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
    if (assistantReplyTarget?.messageId) {
      scheduleReplyTargetVisibility(assistantReplyTarget.messageId);
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
  }, [assistantReplyTarget, scheduleStreamingTailReconcile]);

  function clearInlineEditVisibilityTimeouts() {
    inlineEditVisibilityTimeoutsRef.current.forEach((timeout) =>
      clearTimeout(timeout),
    );
    inlineEditVisibilityTimeoutsRef.current = [];
  }

  function clearReplyTargetVisibilityTimeouts() {
    replyTargetVisibilityTimeoutsRef.current.forEach((timeout) =>
      clearTimeout(timeout),
    );
    replyTargetVisibilityTimeoutsRef.current = [];
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

  function scrollReplyTargetMessageIntoView(messageId: string) {
    if (pendingReplyTargetScrollMessageIdRef.current !== messageId) {
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

  function retryReplyTargetScrollToIndex(info: {
    averageItemLength: number;
    index: number;
  }) {
    const failedMessageId = getMessageItemIdAtIndex(info.index);
    if (
      !failedMessageId ||
      pendingReplyTargetScrollMessageIdRef.current !== failedMessageId ||
      inlineEditSafeVisibleMessageIdsRef.current.has(failedMessageId)
    ) {
      return;
    }
    messageListRef.current?.scrollToOffset({
      animated: true,
      offset: Math.max(0, info.averageItemLength * info.index),
    });
    replyTargetVisibilityTimeoutsRef.current.push(
      setTimeout(
        () => scrollReplyTargetMessageIntoView(failedMessageId),
        INLINE_EDIT_SCROLL_RETRY_DELAY_MS,
      ),
    );
  }

  function scheduleReplyTargetVisibility(messageId: string) {
    clearReplyTargetVisibilityTimeouts();
    pendingReplyTargetScrollMessageIdRef.current = messageId;
    replyTargetVisibilityTimeoutsRef.current =
      INLINE_EDIT_VISIBILITY_SCROLL_DELAYS_MS.map((delay) =>
        setTimeout(() => scrollReplyTargetMessageIntoView(messageId), delay),
      );
  }

  function handleMessageScrollToIndexFailed(info: {
    averageItemLength: number;
    index: number;
  }) {
    retryInlineEditScrollToIndex(info);
    retryReplyTargetScrollToIndex(info);
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
        setMessageLoadError(null);
        void reloadContinuityMilestones(null);
        setHasEarlierMessages(false);
        olderMessageCursorRef.current = null;
        setMemoryCaptures([]);
        isLoadingEarlierRef.current = false;
        userScrolledAwayFromBottomRef.current = false;
        bottomLockedRef.current = true;
        setScrollToLatestVisible(false);
        return;
      }
      const forceToLatest = options.forceToLatest ?? false;
      const messageLimit = options.limitOverride ?? CHAT_MESSAGE_PAGE_SIZE;
      // An explicit empty route means the main trunk. Never widen it to an
      // unrestricted all-branch query when the persisted route is absent or invalid.
      let branchScopes: AiBranchScope[] | undefined = options.branchScopes;
      if (branchScopes === undefined) {
        try {
          branchScopes = (await loadPersistedAdoptedThreadBranchScopes(space, targetThreadId)) ?? [];
        } catch {
          branchScopes = [];
        }
      }
      const resolvedScopes = branchScopes ?? [];
      const routeSelection = buildBranchSelectionMap(resolvedScopes);
      // Direct message load – avoids the snapshot DB chain that crashed expo-sqlite.
      let nextMessages: AiMessageWithCitations[];
      let nextHasEarlierMessages: boolean;
      let nextOlderCursor: AiMessagePageCursor | null;
      try {
        if (options.anchorMessageId) {
          const page = await loadThreadMessagePageAroundAnchor(space, targetThreadId, {
            anchorMessageId: options.anchorMessageId,
            branchScopes: resolvedScopes,
            limit: messageLimit,
            selectedVersionByMessageId: routeSelection,
          });
          nextMessages = page.messages;
          nextHasEarlierMessages = page.hasEarlierMessages;
          nextOlderCursor = page.olderCursor;
        } else {
          const page = await loadThreadMessagePage(space, targetThreadId, {
            branchScopes: resolvedScopes,
            limit: messageLimit,
            selectedVersionByMessageId: routeSelection,
          });
          nextMessages = page.messages;
          nextHasEarlierMessages = page.hasEarlierMessages;
          nextOlderCursor = page.olderCursor;
        }
      } catch (error) {
        if (isLatestRequest("messages", requestId, targetThreadId)) {
          setMessageLoadError(
            error instanceof Error
              ? `聊天记录加载失败：${error.message}`
              : "聊天记录加载失败，请重试。",
          );
        }
        return;
      }
      if (!isLatestRequest("messages", requestId, targetThreadId)) {
        return;
      }
      setMessageLoadError(null);
      activeMessageBranchScopesRef.current = resolvedScopes;
      selectedVersionByMessageIdRef.current = buildBranchSelectionMap(resolvedScopes);
      setSelectedVersionByMessageId(selectedVersionByMessageIdRef.current);
      setPersistedCurrentBranchScopes(resolvedScopes);
      olderMessageCursorRef.current = nextOlderCursor;
      setHasEarlierMessages(nextHasEarlierMessages);
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
      void reloadContinuityMilestones(targetThreadId);
    },
    [reloadContinuityMilestones, space],
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
        requestAnimationFrame(() => {
          const visibleChars = (patch.content?.length ?? 0) + (patch.reasoningText?.length ?? 0);
          recordStreamingUiCommit({
            ...streamingIdentity,
            backlogAgeMs: 0,
            backlogChars: 0,
            visibleChars,
          });
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
            // Treat a new replay as visible until FlatList reports the first viewport snapshot.
            visibleStreamingTailMessageIdsRef.current.add(patch.id);
            maxTailReservedHeightRef.current = 0;
            maxTailReservedHeightMessageIdRef.current = null;
          }
          const tailMergeStartedAt = Date.now();
          const nextTailState = mergeStreamingTailPatch({
            bubbleWidth: targetBubbleWidth,
            patch,
            previous: tailStateToMerge,
          });
          recordDetachedTailMerge({
            generationId: patch.generationId,
            messageId: patch.id,
            space,
            threadId: targetThreadId,
            elapsedMs: Date.now() - tailMergeStartedAt,
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
    const beforeCursor = olderMessageCursorRef.current;
    if (!targetThreadId || !beforeCursor || isLoadingEarlierRef.current) {
      return;
    }
    isLoadingEarlierRef.current = true;
    void (async () => {
      try {
        const page = await loadThreadMessagePage(space, targetThreadId, {
          beforeCursor,
          branchScopes: activeMessageBranchScopesRef.current ?? [],
          limit: CHAT_MESSAGE_PAGE_SIZE,
          selectedVersionByMessageId: selectedVersionByMessageIdRef.current,
        });
        if (
          activeThreadIdRef.current !== targetThreadId
          || olderMessageCursorRef.current !== beforeCursor
        ) {
          return;
        }
        const mergedMessages = mergeOrderedMessagePages(
          page.messages,
          messagesRef.current,
        );
        olderMessageCursorRef.current = page.olderCursor;
        setHasEarlierMessages(page.hasEarlierMessages);
        replaceMessages(mergedMessages);
      } catch (error) {
        setMessageLoadError(
          error instanceof Error
            ? `聊天记录加载失败：${error.message}`
            : "聊天记录加载失败，请重试。",
        );
      } finally {
        isLoadingEarlierRef.current = false;
      }
    })();
  }, [space]);

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
      const { label, iconBrand } = await getCurrentChatModelPresentation(space, targetThreadId);
      if (!isLatestRequest("model", requestId, targetThreadId)) {
        return;
      }
      setModelLabel(label);
      setModelIconBrand(iconBrand);
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
      const nextAppearanceConfig = await loadThreadMessageAppearanceConfig(
        space,
        targetThreadId,
      );
      const profile = await runWithDatabaseSpace(space, async (db) => ({
        avatarUri: await settingsRepository.getProfileAvatarUri(db),
        nickname: await settingsRepository.getProfileNickname(db),
      }));
      if (!isLatestRequest("avatar", requestId, targetThreadId)) {
        return;
      }
      setParticipantAppearance({
        assistantAvatarEnabled: nextAppearanceConfig.assistantAvatar.avatarEnabled,
        assistantAvatarUri: nextAppearanceConfig.assistantAvatar.avatarUri,
        assistantName: nextAppearanceConfig.assistantName,
        userAvatarEnabled: nextAppearanceConfig.userAvatarEnabled,
        userAvatarUri: profile.avatarUri,
        userNickname: profile.nickname,
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
    try {
      setRecentThreads(await listAiHistoryThreads({ limit: 15, space }));
    } catch {
      // Keep existing list on error; don't blank the sidebar.
    }
  }, [space]);

  const flushBufferedStreamingState = useCallback(
    async ({
      followLatest,
      resetTail = false,
    }: {
      followLatest: boolean;
      resetTail?: boolean;
    }) => {
      pendingStreamingTailCommitRef.current = false;
      const bufferedPatch = bufferedStreamingPatchRef.current;
      const shouldReloadFinal = pendingFinalReloadRef.current;
      const pendingFinalStreamingIdentity =
        pendingFinalStreamingIdentityRef.current;
      const targetThreadId = pendingFinalStreamingIdentity
        ? pendingFinalStreamingIdentity.threadId
        : activeThreadIdRef.current;
      const shouldResetTailAfterFlush =
        resetTail ||
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

  const canRestoreLiveStreamingAtBottom = useCallback(() => {
    if (
      nativeMessageScrollOffsetRef.current > MESSAGE_SAFE_FLUSH_OFFSET ||
      isUserDraggingRef.current ||
      isMomentumScrollingRef.current ||
      Date.now() - lastUserScrollAtRef.current < USER_SCROLL_IDLE_TIMEOUT_MS
    ) {
      return false;
    }
    const tailState = streamingTailStateRef.current;
    const isThinkingExpanded = tailState.messageId
      ? Boolean(thinkingExpandedByMessageIdRef.current.get(tailState.messageId))
      : false;
    const activeLanes: ("reasoning" | "content")[] = isThinkingExpanded
      ? ["reasoning", "content"]
      : ["content"];
    const activeBlocks = tailState.blocks.filter((block) =>
      activeLanes.includes(block.lane),
    );
    if (
      tailState.pendingShrinkHeight > 0 ||
      calculateRemainingStreamingTailHeight(tailState, activeLanes) > 0 ||
      activeBlocks.some(
        (block) =>
          tailState.promotedBlockIds.has(block.blockId) &&
          typeof block.measuredHeight !== "number",
      )
    ) {
      return false;
    }
    return true;
  }, []);

  const restoreLiveStreamingAtBottom = useCallback(() => {
    const tailState = streamingTailStateRef.current;
    if (
      nativeMessageScrollOffsetRef.current <= MESSAGE_SAFE_FLUSH_OFFSET &&
      !isUserDraggingRef.current &&
      !isMomentumScrollingRef.current &&
      Date.now() - lastUserScrollAtRef.current >= USER_SCROLL_IDLE_TIMEOUT_MS &&
      tailState.pendingShrinkHeight > 0
    ) {
      const settledTailState = settleStreamingTailShrinkDebt({
        allowGeneratingPayoff: true,
        canApplyBlock: (block) =>
          tailState.promotedBlockIds.has(block.blockId),
        previous: tailState,
      });
      if (settledTailState !== tailState) {
        streamingTailStateRef.current = settledTailState;
        forceUpdateTailState();
      }
    }
    if (!canRestoreLiveStreamingAtBottom()) {
      return false;
    }
    if (liveStreamingRestoreAnimationFrameRef.current != null) {
      return true;
    }
    liveStreamingRestoreAnimationFrameRef.current = requestAnimationFrame(() => {
      liveStreamingRestoreAnimationFrameRef.current = null;
      if (!canRestoreLiveStreamingAtBottom()) {
        return;
      }
      pendingStreamingTailCommitRef.current = false;
      void flushBufferedStreamingState({
        followLatest: true,
        resetTail: true,
      });
    });
    return true;
  }, [canRestoreLiveStreamingAtBottom, flushBufferedStreamingState]);

  const commitStreamingTailIfStable = useCallback(() => {
    if (!pendingStreamingTailCommitRef.current) {
      return false;
    }
    if (restoreLiveStreamingAtBottom()) {
      return true;
    }
    const tailState = streamingTailStateRef.current;
    const isThinkingExpanded = tailState.messageId
      ? Boolean(
          thinkingExpandedByMessageIdRef.current.get(tailState.messageId),
        )
      : false;
    const activeLanes: ("reasoning" | "content")[] = isThinkingExpanded
      ? ["reasoning", "content"]
      : ["content"];
    const activeBlocks = tailState.blocks.filter((block) =>
      activeLanes.includes(block.lane),
    );
    const safeToCommit = canCommitStreamingTailToMessage({
      dragging: isUserDraggingRef.current,
      pendingShrinkHeight: tailState.pendingShrinkHeight,
      replayVisible: Boolean(
        tailState.messageId &&
          visibleStreamingTailMessageIdsRef.current.has(tailState.messageId),
      ),
      remainingTailHeight: calculateRemainingStreamingTailHeight(
        tailState,
        activeLanes,
      ),
      unmeasuredBlockCount: activeBlocks.filter(
        (block) =>
          tailState.promotedBlockIds.has(block.blockId) &&
          typeof block.measuredHeight !== "number",
      ).length,
    });
    if (!safeToCommit) {
      return false;
    }
    pendingStreamingTailCommitRef.current = false;
    void flushBufferedStreamingState({
      followLatest: false,
      resetTail: true,
    });
    return true;
  }, [flushBufferedStreamingState, restoreLiveStreamingAtBottom]);
  commitStreamingTailIfStableRef.current = commitStreamingTailIfStable;

  const requestStreamingTailCommit = useCallback(() => {
    if (!hasPendingStreamingReadBuffer()) {
      pendingStreamingTailCommitRef.current = false;
      return;
    }
    if (nativeMessageScrollOffsetRef.current > MESSAGE_SAFE_FLUSH_OFFSET) {
      return;
    }
    pendingStreamingTailCommitRef.current = true;
    allowFullShrinkSettlementRef.current = true;
    scheduleStreamingTailReconcile("latest-commit-request", {
      forceRender: true,
      retainWindow: true,
    });
    commitStreamingTailIfStableRef.current();
  }, [scheduleStreamingTailReconcile]);

  const handleMessageScrollBeginDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      nativeMessageScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
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
      if (nativeMessageScrollOffsetRef.current <= MESSAGE_SAFE_FLUSH_OFFSET) {
        requestStreamingTailCommit();
      }
    }, USER_SCROLL_IDLE_TIMEOUT_MS);
  }, [requestStreamingTailCommit, scheduleStreamingTailReconcile]);

  const handleMessageMomentumScrollBegin = useCallback(() => {
    isMomentumScrollingRef.current = true;
  }, []);

  const handleMessageScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      nativeMessageScrollOffsetRef.current = offsetY;
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
        requestStreamingTailCommit();
        markScrollGestureSettled();
        return;
      }
      syncScrollToLatestVisibility(offsetY);
      markScrollGestureSettled();
    },
    [
      markScrollGestureSettled,
      requestStreamingTailCommit,
      syncTailViewportPolicyForCurrentTailState,
      updateStreamingLockStateSnapshot,
    ],
  );

  const handleMessageMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      isMomentumScrollingRef.current = false;
      handleMessageScrollEnd(event);
    },
    [handleMessageScrollEnd],
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
    followLatestMessage();
  }, [followLatestMessage]);

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
    thinkingExpectedByMessageIdRef.current.clear();
    clearComposerFocusVisibilityTimeouts();
    clearLatestJumpTimeouts();
    clearInlineEditVisibilityTimeouts();
    clearReplyTargetVisibilityTimeouts();
    clearBranchTreeScrollTimeouts();
    clearSearchScrollTimeouts();
    clearSearchHighlightTimeout();
    inlineEditSafeVisibleMessageIdsRef.current = new Set();
    pendingReplyTargetScrollMessageIdRef.current = null;
    pendingSearchScrollMessageIdRef.current = null;
    editingUserMessageIdRef.current = null;
    setEditingUserMessageId(null);
    setSelectedVersionByMessageId({});
    setMessageLoadError(null);
    setPendingAttachments([]);
    clearGenerationSubscription();
    clearActiveStreamingIdentity();
    activeStreamGenerationRef.current += 1;
    resetStreamingReadBufferState();
    setGenerating(false);
    setActiveAssistantId(null);
    olderMessageCursorRef.current = null;
    setHasEarlierMessages(false);
    setSearchHighlightMessageId(null);
    replaceMessages([]);
    visibleMessagesRef.current = [];
    if (!nextThreadId) {
      setMemoryCaptures([]);
    }
    userScrolledAwayFromBottomRef.current = false;
    bottomLockedRef.current = true;
    setScrollToLatestVisible(false);
    setIsInitialMessageLoading(true);
    setIsMessageListReady(false);
    applyDisplayTitle(nextDisplayTitle);
  }, [applyDisplayTitle, contextTitle, contextType, threadId]);

  // prettier-ignore
  useEffect(() => {
    const targetThreadId = threadId ?? null;
    if (!targetThreadId) {
      void reloadMessages(null, true);
      setIsInitialMessageLoading(false);
      setIsMessageListReady(true);
      return;
    }
    let cancelled = false;
    const hasSearchTarget = Boolean(searchTargetMessageId);
    void (async () => {
      // ── Prefetch fast path ──────────────────────────────────────────────
      // If the user tapped this thread from the home/history screen, its
      // messages were pre-loaded during the navigation animation.  Try to
      // consume that cached result before touching the database again.
      if (!hasSearchTarget) {
        let prefetched = null;
        try {
          const candidate = await consumeThreadMessagePrefetch(space, targetThreadId);
          if (candidate && await isAdoptedThreadRouteSnapshotCurrent(candidate)) {
            prefetched = candidate;
          }
        } catch {
          // Treat a stale or failed prefetch as a cache miss and use the direct loader.
        }
        if (
          prefetched
          && !cancelled
        ) {
          // Apply data behind the readiness skeleton. The inverted list owns
          // offset zero and reveals only after its first non-empty layout.
          userScrolledAwayFromBottomRef.current = false;
          bottomLockedRef.current = true;
          messageScrollOffsetRef.current = 0;
          previousMessageScrollOffsetRef.current = 0;
          scrollingTowardLatestRef.current = true;
          setScrollToLatestVisible(false);
          activeMessageBranchScopesRef.current = prefetched.branchScopes;
          selectedVersionByMessageIdRef.current = prefetched.selectedVersionByMessageId;
          setSelectedVersionByMessageId(prefetched.selectedVersionByMessageId);
          setPersistedCurrentBranchScopes(prefetched.branchScopes);
          olderMessageCursorRef.current = prefetched.olderCursor;
          setHasEarlierMessages(prefetched.hasEarlierMessages);
          setMessageLoadError(null);
          replaceMessages(prefetched.messages);
          setIsInitialMessageLoading(false);
          if (prefetched.messages.length === 0) {
            setIsMessageListReady(true);
          }
          return;
        }
      }
      // ── Normal path (no prefetch hit) ───────────────────────────────────
      if (cancelled) {
        return;
      }
      await reloadMessages(targetThreadId, {
        anchorMessageId: searchTargetMessageId ?? undefined,
        branchScopes: searchTargetBranchScopes,
        forceToLatest: !hasSearchTarget,
      });
      if (!cancelled) {
        setIsInitialMessageLoading(false);
        if (messagesRef.current.length === 0) {
          setIsMessageListReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadMessages, searchTargetBranchScopes, searchTargetMessageId, space, threadId]);

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
    if (!threadId) {
      return;
    }
    return subscribeAiThreadPresentation(space, threadId, () => {
      void reloadThreadTitle(threadId);
    });
  }, [reloadThreadTitle, space, threadId]);

  useEffect(() => {
    if (isInitialMessageLoading) {
      return;
    }
    const interaction = InteractionManager.runAfterInteractions(() => {
      void reloadMemoryCaptures(threadId ?? null);
    });
    return () => interaction.cancel();
  }, [isInitialMessageLoading, reloadMemoryCaptures, threadId]);

  useEffect(() => {
    if (!recordDrawerVisible) {
      return;
    }
    void reloadRecentThreads();
  }, [recordDrawerVisible, reloadRecentThreads]);

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
    const subscription = addNativeSpeechRecognitionListener((event) => {
      if (event.type === 'ready' && voiceSessionActiveRef.current) {
        setVoiceState('listening');
        return;
      }
      if (event.type === 'end' && voiceSessionActiveRef.current) {
        setVoiceState('recognizing');
        return;
      }
      if (event.type === 'result') {
        const recognizedText = event.text?.trim() ?? '';
        if (voiceSessionActiveRef.current && !voiceCancelledRef.current && recognizedText) {
          setComposerText((current) => !current.trim()
            ? recognizedText
            : `${current}${current.endsWith("\n") ? "" : "\n"}${recognizedText}`);
          setErrorMessage(null);
        }
        voiceSessionActiveRef.current = false;
        setVoiceState('idle');
        return;
      }
      if (event.type === 'error') {
        voiceSessionActiveRef.current = false;
        const message = event.message ?? '语音识别失败。';
        setVoiceState('error');
        setVoiceError(message);
        setErrorMessage(message);
        return;
      }
      if (event.type === 'cancelled') {
        voiceSessionActiveRef.current = false;
        setVoiceState('cancelled');
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // prettier-ignore
    const subscription = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === "active";
      setAppIsActive(state === "active");
      if (state === 'active') {
        void reloadRoleDiaries().catch(() => undefined);
        scheduleCompanionMaintenance({ delayMs: 0, space: spaceRef.current });
      }
      if (state !== 'active') {
        voiceSessionActiveRef.current = false;
        voiceCancelledRef.current = true;
        void cancelSpeechRecognition().catch(() => undefined);
        void flushActiveStreamingSnapshot();
        scheduleCompanionMaintenance({ delayMs: 0, space: spaceRef.current });
      }
    });
    return () => {
      screenMountedRef.current = false;
      void flushActiveStreamingSnapshot();
      scheduleCompanionMaintenance({ delayMs: 0, space: spaceRef.current });
      subscription.remove();
      clearComposerFocusVisibilityTimeouts();
      clearLatestJumpTimeouts();
      clearInlineEditVisibilityTimeouts();
      clearReplyTargetVisibilityTimeouts();
      clearBranchTreeScrollTimeouts();
      clearSearchScrollTimeouts();
      clearSearchHighlightTimeout();
      cancelGenerationAction();
      clearGenerationSubscription();
      clearActiveStreamingIdentity();
      activeStreamGenerationRef.current += 1;
      clearVoiceResetTimeout();
      voiceSessionActiveRef.current = false;
      voiceCancelledRef.current = true;
      void cancelSpeechRecognition().catch(() => undefined);
      if (newChatFeedbackTimeoutRef.current) {
        clearTimeout(newChatFeedbackTimeoutRef.current);
        newChatFeedbackTimeoutRef.current = null;
      }
    };
  }, [reloadRoleDiaries]);

  useEffect(() => {
    // Wait until message loading is settled before playing the entrance
    // animation.  Starting the mask fade while the FlatList is still being
    // populated causes the composer to flicker/jump on re-render.
    if (isInitialMessageLoading) {
      return;
    }

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
  }, [composerEntranceKey, composerEntranceProgress, composerEntranceReason, isInitialMessageLoading]);

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
        setConfigDrawerVisible(true);
      } catch (error) {
      if (!screenMountedRef.current) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "无法打开会话设置",
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
      const nextAttachments = [...pendingAttachments, ...picked];
      const validation = validateAiChatAttachments(nextAttachments);
      if (!validation.ok) {
        throw new Error(validation.message);
      }
      setPendingAttachments(nextAttachments);
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
      const nextAttachments = [...pendingAttachments, ...picked];
      const validation = validateAiChatAttachments(nextAttachments);
      if (!validation.ok) {
        throw new Error(validation.message);
      }
      setPendingAttachments(nextAttachments);
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

  function abortReplyAssistRequest() {
    replyAssistAbortControllersRef.current.forEach((controller) =>
      controller.abort(),
    );
    replyAssistAbortControllersRef.current.clear();
  }

  function readReplyAssistCachedPages(
    contextSignature: string,
  ): ReplyAssistPagesByMode {
    const cached = replyAssistCacheRef.current.get(contextSignature);
    return cached
      ? cloneReplyAssistPagesByMode(cached)
      : createEmptyReplyAssistPagesByMode();
  }

  function writeReplyAssistCachedPages(
    contextSignature: string,
    nextPagesByMode: ReplyAssistPagesByMode,
  ) {
    const cloned = cloneReplyAssistPagesByMode(nextPagesByMode);
    replyAssistCacheRef.current.set(contextSignature, cloned);
    if (replyAssistContextSignatureRef.current === contextSignature) {
      setReplyAssistPagesByMode(cloned);
      setReplyAssistPageIndexByMode((current) => ({
        long: Math.min(current.long, Math.max(cloned.long.length - 1, 0)),
        short: Math.min(current.short, Math.max(cloned.short.length - 1, 0)),
      }));
    }
  }

  function appendReplyAssistCachedPage(
    contextSignature: string,
    mode: AiReplyAssistMode,
    suggestions: string[],
  ) {
    const cached = readReplyAssistCachedPages(contextSignature);
    cached[mode] = [...cached[mode], suggestions];
    writeReplyAssistCachedPages(contextSignature, cached);
  }

  function buildReplyAssistRequestSnapshot():
    | ReplyAssistRequestSnapshot
    | null {
    const threadId = activeThreadIdRef.current;
    if (!threadId) {
      return null;
    }
    const transcript = buildReplyAssistTranscript(visibleMessagesRef.current);
    if (
      transcript.length === 0 ||
      transcript[transcript.length - 1]?.role !== "assistant"
    ) {
      return null;
    }
    const branchScopes = getPersistedCurrentBranchScopes();
    return {
      branchScopes,
      contextSignature: buildReplyAssistContextSignature({
        branchScopes,
        threadId,
        visibleMessages: visibleMessagesRef.current,
      }),
      threadId,
      transcript,
    };
  }

  async function runReplyAssistRequest(
    requestKey: string,
    input: {
      mode: AiReplyAssistMode;
      snapshot: ReplyAssistRequestSnapshot;
    },
  ) {
    const existing = replyAssistInFlightRef.current.get(requestKey);
    if (existing) {
      return existing;
    }
    const controller = new AbortController();
    replyAssistAbortControllersRef.current.add(controller);
    const promise = generateReplyAssistSuggestions({
      branchScopes: input.snapshot.branchScopes,
      mode: input.mode,
      signal: controller.signal,
      space,
      threadId: input.snapshot.threadId,
      transcript: input.snapshot.transcript,
    }).finally(() => {
      replyAssistAbortControllersRef.current.delete(controller);
      if (replyAssistInFlightRef.current.get(requestKey) === promise) {
        replyAssistInFlightRef.current.delete(requestKey);
      }
    });
    replyAssistInFlightRef.current.set(requestKey, promise);
    return promise;
  }

  function closeReplyAssistModal() {
    abortReplyAssistRequest();
    replyAssistSessionIdRef.current += 1;
    replyAssistContextSignatureRef.current = replyAssistContextSignature;
    setReplyAssistVisible(false);
    setReplyAssistMode("short");
    setReplyAssistPagesByMode(createEmptyReplyAssistPagesByMode());
    setReplyAssistPageIndexByMode(createEmptyReplyAssistPageIndexByMode());
    setReplyAssistError(null);
    setReplyAssistLoading(false);
  }

  async function ensureReplyAssistFirstPage(
    mode: AiReplyAssistMode,
    options?: {
      foreground?: boolean;
      sessionId?: number;
      snapshot?: ReplyAssistRequestSnapshot;
    },
  ) {
    const snapshot = options?.snapshot ?? buildReplyAssistRequestSnapshot();
    if (!snapshot) {
      throw new Error("当前还没有可供帮答的 AI 回复。");
    }
    const cached = readReplyAssistCachedPages(snapshot.contextSignature);
    if (cached[mode].length > 0) {
      if (options?.foreground) {
        setReplyAssistPagesByMode(cached);
        setReplyAssistPageIndexByMode((current) => ({
          ...current,
          [mode]: Math.min(current[mode], Math.max(cached[mode].length - 1, 0)),
        }));
      }
      return cached[mode][0];
    }
    const sessionId = options?.sessionId ?? replyAssistSessionIdRef.current;
    if (options?.foreground) {
      setReplyAssistLoading(true);
      setReplyAssistError(null);
    }
    try {
      const suggestions = await runReplyAssistRequest(
        `${snapshot.contextSignature}:${mode}:page:0`,
        {
          mode,
          snapshot,
        },
      );
      const nextPagesByMode = readReplyAssistCachedPages(
        snapshot.contextSignature,
      );
      if (nextPagesByMode[mode].length === 0) {
        nextPagesByMode[mode] = [suggestions];
        writeReplyAssistCachedPages(snapshot.contextSignature, nextPagesByMode);
      }
      if (
        options?.foreground &&
        screenMountedRef.current &&
        replyAssistSessionIdRef.current === sessionId
      ) {
        const refreshedPages = readReplyAssistCachedPages(
          snapshot.contextSignature,
        );
        setReplyAssistPagesByMode(refreshedPages);
        setReplyAssistPageIndexByMode((current) => ({
          ...current,
          [mode]: 0,
        }));
      }
      return suggestions;
    } catch (error) {
      if (options?.foreground && !isReplyAssistAbortError(error)) {
        if (
          screenMountedRef.current &&
          replyAssistSessionIdRef.current === sessionId
        ) {
          setReplyAssistError(
            error instanceof Error ? error.message : "AI 帮答生成失败",
          );
        }
      }
      throw error;
    } finally {
      if (
        options?.foreground &&
        screenMountedRef.current &&
        replyAssistSessionIdRef.current === sessionId
      ) {
        setReplyAssistLoading(false);
      }
    }
  }

  async function appendReplyAssistPage(
    mode: AiReplyAssistMode,
    options?: {
      foreground?: boolean;
      sessionId?: number;
      snapshot?: ReplyAssistRequestSnapshot;
    },
  ) {
    const snapshot = options?.snapshot ?? buildReplyAssistRequestSnapshot();
    if (!snapshot) {
      throw new Error("当前还没有可供帮答的 AI 回复。");
    }
    const cached = readReplyAssistCachedPages(snapshot.contextSignature);
    const nextPageIndex = cached[mode].length;
    const sessionId = options?.sessionId ?? replyAssistSessionIdRef.current;
    if (options?.foreground) {
      setReplyAssistLoading(true);
      setReplyAssistError(null);
    }
    try {
      const suggestions = await runReplyAssistRequest(
        `${snapshot.contextSignature}:${mode}:page:${nextPageIndex}`,
        {
          mode,
          snapshot,
        },
      );
      const latestCached = readReplyAssistCachedPages(snapshot.contextSignature);
      if (latestCached[mode].length <= nextPageIndex) {
        appendReplyAssistCachedPage(snapshot.contextSignature, mode, suggestions);
      }
      if (
        options?.foreground &&
        screenMountedRef.current &&
        replyAssistSessionIdRef.current === sessionId
      ) {
        setReplyAssistPageIndexByMode((current) => ({
          ...current,
          [mode]: nextPageIndex,
        }));
      }
      return suggestions;
    } catch (error) {
      if (options?.foreground && !isReplyAssistAbortError(error)) {
        if (
          screenMountedRef.current &&
          replyAssistSessionIdRef.current === sessionId
        ) {
          setReplyAssistError(
            error instanceof Error ? error.message : "AI 帮答生成失败",
          );
        }
      }
      throw error;
    } finally {
      if (
        options?.foreground &&
        screenMountedRef.current &&
        replyAssistSessionIdRef.current === sessionId
      ) {
        setReplyAssistLoading(false);
      }
    }
  }

  async function handleOpenReplyAssist() {
    if (generating || !canOpenReplyAssist(visibleMessagesRef.current)) {
      return;
    }
    const snapshot = buildReplyAssistRequestSnapshot();
    if (!snapshot) {
      return;
    }
    replyAssistSessionIdRef.current += 1;
    const sessionId = replyAssistSessionIdRef.current;
    replyAssistContextSignatureRef.current = snapshot.contextSignature;
    setReplyAssistVisible(true);
    setReplyAssistError(null);
    setReplyAssistPagesByMode(readReplyAssistCachedPages(snapshot.contextSignature));
    setReplyAssistPageIndexByMode(createEmptyReplyAssistPageIndexByMode());
    try {
      await ensureReplyAssistFirstPage(replyAssistMode, {
        foreground: true,
        sessionId,
        snapshot,
      });
    } catch (error) {
      if (!isReplyAssistAbortError(error)) {
        return;
      }
    }
  }

  async function handleRefreshReplyAssistPage(
    mode = replyAssistMode,
    sessionId = replyAssistSessionIdRef.current,
  ) {
    try {
      await appendReplyAssistPage(mode, {
        foreground: true,
        sessionId,
      });
    } catch (error) {
      if (isReplyAssistAbortError(error)) {
        return;
      }
    }
  }

  async function handleChangeReplyAssistMode(mode: AiReplyAssistMode) {
    if (mode === replyAssistMode) {
      return;
    }
    setReplyAssistMode(mode);
    setReplyAssistError(null);
    const cached = readReplyAssistCachedPages(replyAssistContextSignatureRef.current ?? replyAssistContextSignature);
    setReplyAssistPagesByMode(cached);
    if (cached[mode].length > 0) {
      return;
    }
    try {
      await ensureReplyAssistFirstPage(mode, {
        foreground: true,
        sessionId: replyAssistSessionIdRef.current,
      });
    } catch (error) {
      if (!isReplyAssistAbortError(error)) {
        return;
      }
    }
  }

  useEffect(() => {
    if (replyAssistWarmupTimeoutRef.current) {
      clearTimeout(replyAssistWarmupTimeoutRef.current);
      replyAssistWarmupTimeoutRef.current = null;
    }
    if (
      generating ||
      replyAssistVisible ||
      !canOpenReplyAssist(visibleMessages)
    ) {
      return;
    }
    const snapshot = buildReplyAssistRequestSnapshot();
    if (!snapshot) {
      return;
    }
    const cached = readReplyAssistCachedPages(snapshot.contextSignature);
    if (cached.short.length > 0) {
      return;
    }
    replyAssistWarmupTimeoutRef.current = setTimeout(() => {
      void ensureReplyAssistFirstPage("short", {
        foreground: false,
        snapshot,
      }).catch(() => undefined);
    }, 480);
    return () => {
      if (replyAssistWarmupTimeoutRef.current) {
        clearTimeout(replyAssistWarmupTimeoutRef.current);
        replyAssistWarmupTimeoutRef.current = null;
      }
    };
  }, [generating, replyAssistContextSignature, replyAssistVisible, visibleMessages]);

  useEffect(() => {
    if (replyAssistBackgroundPrefetchTimeoutRef.current) {
      clearTimeout(replyAssistBackgroundPrefetchTimeoutRef.current);
      replyAssistBackgroundPrefetchTimeoutRef.current = null;
    }
    if (
      !replyAssistVisible ||
      replyAssistMode !== "short" ||
      replyAssistLoading
    ) {
      return;
    }
    const snapshot = buildReplyAssistRequestSnapshot();
    if (!snapshot) {
      return;
    }
    const cached = readReplyAssistCachedPages(snapshot.contextSignature);
    if (cached.short.length !== 1) {
      return;
    }
    replyAssistBackgroundPrefetchTimeoutRef.current = setTimeout(() => {
      void appendReplyAssistPage("short", {
        foreground: false,
        snapshot,
      }).catch(() => undefined);
    }, 260);
    return () => {
      if (replyAssistBackgroundPrefetchTimeoutRef.current) {
        clearTimeout(replyAssistBackgroundPrefetchTimeoutRef.current);
        replyAssistBackgroundPrefetchTimeoutRef.current = null;
      }
    };
  }, [
    replyAssistContextSignature,
    replyAssistLoading,
    replyAssistMode,
    replyAssistPagesByMode,
    replyAssistVisible,
  ]);

  async function handleSend() {
    if (voiceSessionActiveRef.current) {
      voiceCancelledRef.current = true;
      voiceSessionActiveRef.current = false;
      await cancelSpeechRecognition().catch(() => false);
      setVoiceState('idle');
    }
    const sendPressedAt = new Date().toISOString();
    const typedText = composerText.trim();
    const diaryCommandRequested = isDiaryCreationRequest(typedText);
    const attachments = pendingAttachments;
    const content = buildChatMessageContent(typedText, attachments);
    const replyTarget = assistantReplyTarget;
    if ((!typedText && !attachments.length) || generating) {
      return;
    }
    setDiaryCommandHint(false);
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
      let shouldOfferDiaryCreation = false;
      if (diaryCommandRequested) {
        try {
          shouldOfferDiaryCreation = await runWithDatabaseSpace(space, async (db) => {
            const [enabled, thread] = await Promise.all([
              settingsRepository.getValue(db, 'AI_ROLE_DIARY_ENABLED'),
              aiThreadRepository.findThreadById(db, targetThreadId),
            ]);
            return enabled !== 'false' && Boolean(thread?.roleCardId);
          });
        } catch {
          shouldOfferDiaryCreation = false;
        }
      }
      const activeBranch = replyTarget ? null : getActiveBranchForNextMessage();
      const streamRequest = beginStreamingRequest(
        targetThreadId,
        replyTarget
          ? undefined
          : {
              branchRootMessageId: activeBranch?.branchRootMessageId ?? null,
              branchVersionIndex: activeBranch?.branchVersionIndex ?? null,
              content,
              createdAt: sendPressedAt,
              hasAttachments: attachments.length > 0,
            },
      );
      streamGeneration = streamRequest.generation;
      const managedGeneration = replyTarget
        ? aiGenerationManager.startReplyToAssistantMessage({
            assistantMessageId: replyTarget.messageId,
            attachments,
            content,
            sendPressedAt,
            space,
            subscriber: {
              ...streamRequest.subscriber,
              onCreated: ({
                assistantMessageId,
                generationId,
                userMessageId,
                thinkingExpected,
              }) => {
                if (!isCurrentStream(targetThreadId, streamGeneration)) {
                  return;
                }
                streamRequest.subscriber.onCreated?.({
                  assistantMessageId,
                  generationId,
                  thinkingExpected,
                  userMessageId,
                });
                showLatestMessageVersion(replyTarget.messageId);
              },
            },
            threadId: targetThreadId,
          })
        : (() => {
            return aiGenerationManager.startSendUserMessage({
              attachments,
              branchRootMessageId: activeBranch?.branchRootMessageId,
              branchVersionIndex: activeBranch?.branchVersionIndex,
              content,
              sendPressedAt,
              space,
              subscriber: streamRequest.subscriber,
              threadId: targetThreadId,
            });
          })();
      streamUnsubscribe = managedGeneration.unsubscribe;
      generationSubscriptionRef.current = managedGeneration.unsubscribe;
      if (shouldOfferDiaryCreation) {
        setDiaryCommandHint(true);
      }
      await managedGeneration.promise;
      setAssistantReplyTarget(null);
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
          onCreated: ({
            assistantMessageId,
            generationId,
            thinkingExpected,
          }) => {
            if (!isCurrentStream(targetThreadId, streamGeneration)) {
              return;
            }
            subscriber.onCreated?.({
              userMessageId,
              assistantMessageId,
              generationId,
              thinkingExpected,
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
    const targetMessage = visibleMessagesRef.current.find(
      (message) => message.id === messageId,
    );
    if (
      !targetMessage ||
      targetMessage.role !== "assistant" ||
      targetMessage.versionIndex !== targetMessage.versionTotal
    ) {
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
            onCreated: ({
              assistantMessageId,
              generationId,
              userMessageId,
              thinkingExpected,
            }) => {
              subscriber.onCreated?.({
                assistantMessageId,
                generationId,
                thinkingExpected,
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

  async function handleContinueAssistantReply(messageId: string) {
    const targetThreadId = activeThreadId;
    if (!targetThreadId || generating) {
      return;
    }
    const targetMessage = visibleMessagesRef.current.find(
      (message) => message.id === messageId,
    );
    if (
      !targetMessage ||
      targetMessage.role !== "assistant" ||
      targetMessage.versionIndex !== targetMessage.versionTotal
    ) {
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
    try {
      markIntentionalLatestJump();
      await flushBufferedStreamingState({ followLatest: false });
      setPendingMessageActionId(messageId);
      setGenerating(true);
      setErrorMessage(null);
      scheduleIntentionalLatestJump(false);
      const managedGeneration =
        aiGenerationManager.startContinueAssistantReply({
          assistantMessageId: messageId,
          sendPressedAt,
          space,
          subscriber: {
            ...subscriber,
            onCreated: ({
              assistantMessageId,
              generationId,
              userMessageId,
              thinkingExpected,
            }) => {
              if (!isCurrentStream(targetThreadId, streamGeneration)) {
                return;
              }
              subscriber.onCreated?.({
                assistantMessageId,
                generationId,
                thinkingExpected,
                userMessageId,
              });
              setMessages((current) => {
                let changed = false;
                const nextMessages = current.map((message) => {
                  if (message.id !== assistantMessageId) {
                    return message;
                  }
                  changed = true;
                  return {
                    ...message,
                    promptSnapshotJson: JSON.stringify({
                      messageDisplayKind: "standalone_assistant",
                    }),
                  };
                });
                if (!changed) {
                  return current;
                }
                messagesRef.current = nextMessages;
                rebuildMessageIndex(nextMessages);
                return nextMessages;
              });
              showLatestMessageVersion(assistantMessageId);
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
      setErrorMessage(error instanceof Error ? error.message : "续答失败");
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

  function handleReplyToAssistant(messageId: string) {
    if (generating) {
      return;
    }
    if (assistantReplyTarget?.messageId === messageId) {
      pendingReplyTargetScrollMessageIdRef.current = null;
      clearReplyTargetVisibilityTimeouts();
      setAssistantReplyTarget(null);
      return;
    }
    const targetMessage = visibleMessagesRef.current.find(
      (message) => message.id === messageId,
    );
    if (
      !targetMessage ||
      targetMessage.role !== "assistant" ||
      targetMessage.status !== "completed" ||
      targetMessage.versionIndex !== targetMessage.versionTotal
    ) {
      return;
    }
    setAssistantReplyTarget({
      messageId,
    });
    setErrorMessage(null);
    scheduleReplyTargetVisibility(messageId);
  }

  function handleEditUserMessage(messageId: string, customDraft?: string) {
    if (generating) {
      return;
    }
    editingUserMessageIdRef.current = messageId;
    setEditingUserMessageId(messageId);
    setEditingUserMessageInitialDraft(customDraft ?? null);
    setErrorMessage(null);
    scheduleInlineEditVisibility(messageId);
  }

  function cancelInlineEdit() {
    clearInlineEditVisibilityTimeouts();
    editingUserMessageIdRef.current = null;
    setEditingUserMessageId(null);
    setEditingUserMessageInitialDraft(null);
  }

  async function handleVoiceStart() {
    if (voiceSessionActiveRef.current || generating) return;
    const sessionToken = voiceSessionTokenRef.current + 1;
    voiceSessionTokenRef.current = sessionToken;
    voiceSessionActiveRef.current = true;
    voiceCancelledRef.current = false;
    voiceStopRequestedRef.current = false;
    try {
      clearVoiceResetTimeout();
      setVoiceError(null);
      if (Platform.OS === "android") {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          const message = permission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
            ? "麦克风权限已被永久拒绝，请到系统设置中为 Pixory 开启。"
            : "需要麦克风权限才能进行语音输入。";
          setVoiceState("error");
          setVoiceError(message);
          setErrorMessage(message);
          voiceSessionActiveRef.current = false;
          return;
        }
      }
      if (voiceSessionTokenRef.current !== sessionToken || voiceCancelledRef.current) return;
      const capabilities = await getSpeechRecognitionCapabilities();
      if (!capabilities.available) throw new Error('当前设备没有可用的系统语音识别服务。');
      if (voiceSessionTokenRef.current !== sessionToken || voiceCancelledRef.current) return;
      setVoiceMode(capabilities.onDeviceAvailable ? 'on_device' : 'system');
      setVoiceState("listening");
      const started = await startSpeechRecognition();
      if (voiceSessionTokenRef.current !== sessionToken || voiceCancelledRef.current) {
        await cancelSpeechRecognition().catch(() => false);
        return;
      }
      setVoiceMode(started.onDevice ? 'on_device' : 'system');
      if (voiceStopRequestedRef.current) await stopSpeechRecognition();
    } catch (error) {
      voiceSessionActiveRef.current = false;
      const message = error instanceof Error ? error.message : "语音识别失败";
      setVoiceState("error");
      setVoiceError(message);
      setErrorMessage(message);
    }
  }

  async function handleVoiceStop() {
    if (!voiceSessionActiveRef.current) return;
    voiceStopRequestedRef.current = true;
    setVoiceState('recognizing');
    try {
      await stopSpeechRecognition();
    } catch (error) {
      voiceSessionActiveRef.current = false;
      const message = error instanceof Error ? error.message : '语音识别结束失败。';
      setVoiceState('error');
      setVoiceError(message);
    }
  }

  async function handleVoiceInput() {
    if (voiceSessionActiveRef.current) {
      await handleVoiceStop();
      return;
    }
    await handleVoiceStart();
  }

  function handleCancelVoiceInput() {
    voiceSessionTokenRef.current += 1;
    voiceCancelledRef.current = true;
    voiceSessionActiveRef.current = false;
    void cancelSpeechRecognition().catch(() => undefined);
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

  const handleArtifactLongPress = useCallback((
    artifactKind: 'diary' | 'dream',
    groupId: string,
    versionId: string,
    createdAt: string,
    pageX: number,
    pageY: number,
  ) => {
    setArtifactContextMenuState({
      anchorX: pageX,
      anchorY: pageY,
      artifactKind,
      createdAt,
      groupId,
      versionId,
    });
  }, []);

  const handleHideArtifactFromChat = useCallback(async () => {
    const artifact = artifactContextMenuState;
    const targetThreadId = activeThreadIdRef.current;
    if (!artifact || !targetThreadId) return;
    setArtifactActionPending(true);
    try {
      await runWithDatabaseSpace(space, (db) =>
        companionArtifactChatStateRepository.hide(db, {
          artifactGroupId: artifact.groupId,
          artifactKind: artifact.artifactKind,
          threadId: targetThreadId,
        }),
      );
      if (artifact.artifactKind === 'diary') {
        await reloadRoleDiaries();
      } else {
        await reloadRoleDreams();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? `从聊天中移除失败：${error.message}` : '从聊天中移除失败，请稍后重试。');
    } finally {
      setArtifactActionPending(false);
    }
  }, [artifactContextMenuState, reloadRoleDiaries, reloadRoleDreams, space]);

  const handleRegenerateArtifactVersion = useCallback(async () => {
    const artifact = artifactContextMenuState;
    if (!artifact) return;
    setArtifactActionPending(true);
    try {
      if (artifact.artifactKind === 'diary') {
        regeneratedArtifactGroupIdsRef.current.add(artifact.groupId);
        const result = await regenerateDiaryVersion({ space, versionId: artifact.versionId });
        setSelectedArtifactVersionByGroupId((current) => ({ ...current, [artifact.groupId]: result.versionId }));
        await reloadRoleDiaries();
      } else {
        pendingDreamRegenerationBaseVersionByGroupIdRef.current.set(artifact.groupId, artifact.versionId);
        setRegeneratingDreamGroupIds((current) => new Set(current).add(artifact.groupId));
        await regenerateDreamVersion({ dreamId: artifact.versionId, space });
      }
    } catch (error) {
      regeneratedArtifactGroupIdsRef.current.delete(artifact.groupId);
      pendingDreamRegenerationBaseVersionByGroupIdRef.current.delete(artifact.groupId);
      setRegeneratingDreamGroupIds((current) => {
        const next = new Set(current);
        next.delete(artifact.groupId);
        return next;
      });
      setErrorMessage(error instanceof Error ? `重新生成失败：${error.message}` : '重新生成失败，请稍后重试。');
    } finally {
      setArtifactActionPending(false);
    }
  }, [artifactContextMenuState, reloadRoleDiaries, reloadRoleDreams, space]);

  const artifactContextMenuActions: AiAnchoredContextMenuAction[] = artifactContextMenuState
    ? [
        {
          disabled: artifactActionPending
            || (artifactContextMenuState.artifactKind === 'dream'
              && regeneratingDreamGroupIds.has(artifactContextMenuState.groupId)),
          icon: 'refresh-outline',
          key: 'regenerate-artifact',
          label: '重新生成',
          onPress: () => { void handleRegenerateArtifactVersion(); },
        },
        {
          disabled: artifactActionPending,
          icon: 'eye-off-outline',
          key: 'hide-artifact-from-chat',
          label: '从聊天中移除',
          onPress: () => { void handleHideArtifactFromChat(); },
        },
      ]
    : [];

  const baseMessageContextMenuTarget = messageContextMenuState
    ? (visibleMessagesById.get(messageContextMenuState.messageId) ?? null)
    : null;
  const messageContextMenuTarget = baseMessageContextMenuTarget
    ? mergeBufferedStreamingPatchIntoContextMenuTarget(
        baseMessageContextMenuTarget,
        bufferedStreamingPatchRef.current,
      )
    : null;
  const messageContextMenuPresentation = messageContextMenuTarget
    ? {
        anchorX: messageContextMenuState?.anchorX ?? 0,
        anchorY: messageContextMenuState?.anchorY ?? 0,
        timeLabel: formatAiMessageMinute(
          messageContextMenuTarget.completedAt ??
            messageContextMenuTarget.updatedAt ??
            messageContextMenuTarget.createdAt,
        ),
      }
    : null;

  useEffect(() => {
    if (messageContextMenuState && !messageContextMenuTarget) {
      setMessageContextMenuState(null);
    }
  }, [messageContextMenuState, messageContextMenuTarget]);

  const handleMessageLongPress = useCallback(
    (
      message: AiMessageWithCitations,
      pageX: number,
      pageY: number,
    ) => {
      setMessageContextMenuState({
        anchorX: pageX,
        anchorY: pageY,
        messageId: message.id,
      });
    },
    [],
  );

  const messageContextMenuActions: AiMessageContextMenuAction[] = [];
  if (messageContextMenuTarget) {
    const message = messageContextMenuTarget;
    const content = message.content || message.errorMessage || "";
    const hasContent = Boolean(content.trim());
    const selectableContent = getSelectableMessageContent(message);
    const actionPending = pendingMessageActionId === message.id;
    const targetsLatestVersion =
      message.versionIndex === message.versionTotal;

    messageContextMenuActions.push(
      {
        disabled: !hasContent,
        icon: "copy-outline",
        key: "copy",
        label: "复制",
        onPress: () => {
          void copyMessageContent(message);
        },
      },
      {
        disabled: !selectableContent.trim(),
        icon: "text-outline",
        key: "select-text",
        label: "选择文本",
        onPress: () => setMessageTextSelectionContent({
          messageId: message.id,
          content: selectableContent,
          role: message.role,
        }),
      },
    );

    if (message.role === "user") {
      messageContextMenuActions.push({
        disabled: generating || actionPending || !targetsLatestVersion,
        icon: "create-outline",
        key: "edit",
        label: "修改",
        onPress: () => handleEditUserMessage(message.id),
      });
    } else {
      const favoriteIdentity =
        favoriteIdentityByMessageId.get(message.id) ?? null;
      const favorited = favoriteIdentity
        ? Boolean(favoriteStateByKey[favoriteIdentity.key])
        : false;
      const favoritePending = favoriteIdentity
        ? Boolean(favoritePendingByKey[favoriteIdentity.key])
        : false;
      const replyActionMode =
        replyActionModeByMessageId.get(message.id) ?? "continue";
      const canContinueGeneration =
        targetsLatestVersion &&
        !generating &&
        !actionPending &&
        hasContent &&
        (message.status === "failed" || message.status === "stopped");
      const canContinueOrReply =
        targetsLatestVersion &&
        !generating &&
        !actionPending &&
        hasContent &&
        message.status === "completed";
      const canRegenerate =
        !generating &&
        !actionPending &&
        (message.status === "completed" ||
          message.status === "failed" ||
          message.status === "stopped");

      messageContextMenuActions.push(
        {
          disabled:
            !favoriteIdentity ||
            favoritePending ||
            actionPending ||
            (generating && message.id === activeAssistantId),
          icon: favorited ? "star" : "star-outline",
          key: "favorite",
          label: favorited ? "取消收藏" : "收藏",
          onPress: () => {
            void handleToggleMessageFavorite(message);
          },
          selected: favorited,
        },
        {
          disabled: !canContinueGeneration,
          icon: "play-forward-outline",
          key: "continue-generation",
          label: "继续生成",
          onPress: () => handleContinueAssistantMessage(message.id),
        },
        {
          disabled: !canContinueOrReply,
          icon: "chatbubble-ellipses-outline",
          key: "continue-or-reply",
          label: replyActionMode === "reply" ? "回复" : "续答",
          onPress: () => {
            if (replyActionMode === "reply") {
              handleReplyToAssistant(message.id);
              return;
            }
            handleContinueAssistantReply(message.id);
          },
        },
        {
          disabled: !canRegenerate,
          icon: "refresh-outline",
          key: "regenerate",
          label: "重新生成",
          onPress: () => {
            void handleRegenerate(message.id);
          },
        },
      );
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
      if (item.type === "dateSeparator") {
        return <Text style={styles.dateSeparator}>{item.label}</Text>;
      }
      if (item.type === 'diary') {
        return (
          <DiaryChatCard
            contextOptIn={item.diary.contextOptIn}
            createdAt={item.diary.updatedAt}
            diaryDate={item.diary.diaryDate}
            onContextChoice={(accepted) => {
              // Optimistic update: reflect the choice immediately in the UI
              // without waiting for the async DB write to complete.
              setRoleDiaries((prev) =>
                prev.map((d) => d.id === item.diary.id ? { ...d, contextOptIn: accepted } : d),
              );
              void runWithDatabaseSpace(space, (db) =>
                diaryRepository.setContextOptIn(db, item.diary.id, accepted),
              )
                .then(() => reloadRoleDiaries())
                .catch(() => undefined);
            }}
            onLongPress={(pageX, pageY) => handleArtifactLongPress(
              'diary', item.diary.id, item.version.id, item.diary.updatedAt, pageX, pageY,
            )}
            onNextVersion={() => setSelectedArtifactVersionByGroupId((current) => ({
              ...current,
              [item.diary.id]: (diaryVersionsById[item.diary.id] ?? [])[Math.min(item.versionIndex, item.versionTotal - 1)]?.id ?? item.version.id,
            }))}
            onOpen={() => onOpenDiary(item.diary.id, item.version.id)}
            onPreviousVersion={() => setSelectedArtifactVersionByGroupId((current) => ({
              ...current,
              [item.diary.id]: (diaryVersionsById[item.diary.id] ?? [])[Math.max(0, item.versionIndex - 2)]?.id ?? item.version.id,
            }))}
            themeKey={item.diary.themeKey}
            versionIndex={item.versionIndex}
            versionTotal={item.versionTotal}
          />
        );
      }
      switch (item.type) {
        case 'dream':
          return <DreamChatCard
            createdAt={item.anchorCreatedAt}
            onLongPress={(pageX, pageY) => handleArtifactLongPress(
              'dream', item.dream.versionGroupId, item.dream.id, item.anchorCreatedAt, pageX, pageY,
            )}
            onNextVersion={() => setSelectedArtifactVersionByGroupId((current) => ({
              ...current,
              [item.dream.versionGroupId]: (dreamVersionsByGroupId[item.dream.versionGroupId] ?? [])[Math.min(item.versionIndex, item.versionTotal - 1)]?.id ?? item.dream.id,
            }))}
            onOpen={() => onOpenDream(item.dream.id)}
            onPreviousVersion={() => setSelectedArtifactVersionByGroupId((current) => ({
              ...current,
              [item.dream.versionGroupId]: (dreamVersionsByGroupId[item.dream.versionGroupId] ?? [])[Math.max(0, item.versionIndex - 2)]?.id ?? item.dream.id,
            }))}
            title={item.dream.title}
            versionIndex={item.versionIndex}
            versionTotal={item.versionTotal}
          />;
        case 'dreamJob':
          const failure = presentDreamFailure(item.job.lastErrorCode);
          return <DreamChatCard actionLabel={failure.actionLabel} createdAt={item.job.createdAt} failureMessage={failure.message} title="未命名梦境" status={item.job.status === 'waiting_model' ? 'waiting_model' : item.job.status === 'failed' ? 'failed' : 'generating'} onCancel={() => void handleDreamJobCancel(item.job)} onRetry={() => void handleDreamJobRetry(item.job)} />;
      }
      if (item.type === "streamTailSpacer") {
        return <AiStreamingTailSpacer height={item.height} />;
      }
      if (item.type === "tailDebtSpacer") {
        return <AiStreamingTailSpacer height={item.height} />;
      }
      if (item.type === "streamTailContinuation") {
        const message = visibleMessagesById.get(item.group.messageId) ?? null;
        return (
          <AiStreamingTailContinuationBubble
            bubbleWidth={getStreamingBubbleWidth()}
            group={item.group}
            onLongPress={
              message
                ? (pageX, pageY) => handleMessageLongPress(message, pageX, pageY)
                : undefined
            }
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
            onLongPress={
              message
                ? (pageX, pageY) => handleMessageLongPress(message, pageX, pageY)
                : undefined
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
      const thinkingExpected = Boolean(
        thinkingExpectedByMessageIdRef.current.get(message.id),
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
              initialEditDraft={editingUserMessageId === message.id ? editingUserMessageInitialDraft : null}
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
              replyActionMode={replyActionModeByMessageId.get(message.id)}
              showAvatar={item.showAvatar}
              showActionButtons={message.role === "assistant" && message.id === latestVisibleMessageId}
              showUserAvatar={item.showUserAvatar}
              space={space}
              streaming={streamingRendererActive}
              streamingIdentity={streamingIdentity}
              thinkingExpected={thinkingExpected}
              // prettier-ignore
              thinkingDefaultExpanded={thinkingExpandedByMessageIdRef.current.get(message.id) ?? false}
              onCopy={(targetMessage) => {
                void copyMessageContent(targetMessage);
              }}
              onCancelEdit={cancelInlineEdit}
              onContinue={handleContinueAssistantMessage}
              onContinueReply={handleContinueAssistantReply}
              onReplyToAssistant={handleReplyToAssistant}
              onEditUser={handleEditUserMessage}
              onOpenCitation={openCitation}
              onLongPress={handleMessageLongPress}
              onRegenerate={(messageId) => {
                void handleRegenerate(messageId);
              }}
              onSelectVersion={handleSelectMessageVersion}
              onSubmitEdit={(messageId, content) => {
                void handleSubmitInlineRewrite(messageId, content);
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
      handleMessageLongPress,
      handleContinueAssistantMessage,
      handleContinueAssistantReply,
      handleReplyToAssistant,
      handleRegenerate,
      handleSubmitInlineRewrite,
      handleSelectMessageVersion,
      handleToggleMessageFavorite,
      latestVisibleMessageId,
      memoryCapturesBySourceMessageId,
      openCitation,
      pendingMessageActionId,
      replyActionModeByMessageId,
      searchHighlightMessageId,
      singleBubbleTailReplayEnabled,
      space,
      scheduleStreamingTailReconcile,
      diaryVersionsById,
      dreamVersionsByGroupId,
      handleArtifactLongPress,
      onOpenDiary,
      onOpenDream,
      reloadRoleDiaries,
      reloadRoleDreams,
      handleDreamJobCancel,
      handleDreamJobRetry,
    ],
  );

  return (
    <AppScreen
      backgroundColor={aiLightColors.canvas}
      contentStyle={[
        styles.drawerHost,
        {
          paddingBottom:
            initialBottomInsetRef.current +
            layout.pageBottomOffset -
            spacing[2],
        },
      ]}
    >
      {/* prettier-ignore */}
      {/* Uses react-native-keyboard-controller's KeyboardAvoidingView which tracks
           keyboard frames via WindowInsetsAnimationCompat on Android 14+ edge-to-edge,
           eliminating the stuck-height / residual-padding bugs of the RN built-in KAV. */}
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.keyboardAvoidingHost}
      >
        {/* prettier-ignore */}
        <View
          style={[
            styles.screenContent,
            {
              paddingTop:
                statusBarHeight + spacing[1.5],
            },
          ]}
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
                <Ionicons color={aiLightColors.ink} name="ellipsis-horizontal" size={22} />
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
            <View style={styles.messageListFade}>
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
                    {errorMessage || messageLoadError ? (
                      <AiChatErrorBanner
                        message={errorMessage ?? messageLoadError ?? ""}
                        onRetry={
                          messageLoadError && activeThreadId
                            ? () => void reloadMessages(activeThreadId, { forceToLatest: true })
                            : latestAssistantMessage?.status === "failed"
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
                onMomentumScrollBegin={handleMessageMomentumScrollBegin}
                onMomentumScrollEnd={handleMessageMomentumScrollEnd}
                onContentSizeChange={handleMessageListContentSizeChange}
                onScrollEndDrag={handleMessageScrollEnd}
                onScrollToIndexFailed={handleMessageScrollToIndexFailed}
                onTouchCancel={resetMessageTouchGesture}
                onTouchEnd={resetMessageTouchGesture}
                onTouchMove={handleMessageTouchMove}
                onTouchStart={handleMessageTouchStart}
                renderItem={renderMessageItem}
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
                style={styles.messageScroller}
                contentContainerStyle={styles.messageScrollContent}
                viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairsRef.current}
              />
            </View>
            {/* Skeleton shares the list slot and stays until the first
                non-empty FlatList layout commits, so no correction frame is visible. */}
            {!isMessageListReady ? (
              <View style={styles.skeletonOverlay} pointerEvents="none">
                <AiChatMessageSkeleton />
              </View>
            ) : null}
            {invertedMessageItems.length === 0 && isMessageListReady && !errorMessage && !messageLoadError ? (
              <View style={styles.starterOverlay}>
                <AiChatStarterHints onPickSuggestion={setComposerText} />
              </View>
            ) : null}
          </View>

          {inlineEditingActive ? null : (
            <Animated.View onLayout={(event) => setComposerPanelHeight(event.nativeEvent.layout.height)} style={[styles.composerPanel, composerEntranceStyle]}>
              {dreamNotice && dreamNotice.type === 'manual_confirmation' ? (
                <View style={styles.diaryHint}>
                  <Ionicons color={aiLightColors.primaryActive} name="moon" size={metrics.iconSizeSm} />
                  <Text style={styles.diaryHintText}>是否触发梦境？</Text>
                  <Pressable accessibilityRole="button" onPress={() => void confirmManualDream(space, dreamNotice.seedId, true)} style={styles.diaryHintTouch}><Text style={styles.diaryHintAction}>是</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={() => { void confirmManualDream(space, dreamNotice.seedId, false); setDreamNotice(null); }} style={styles.diaryHintTouch}><Text style={styles.diaryHintDismiss}>否</Text></Pressable>
                </View>
              ) : null}
              {diaryGenerationStatus ? (
                <View style={styles.diaryHint}>
                  {diaryGenerationStatus === 'generating' ? (
                    <ActivityIndicator color={aiLightColors.primaryActive} size="small" style={styles.diaryHintSpinner} />
                  ) : null}
                  <Text style={styles.diaryHintText}>
                    {diaryGenerationStatus === 'generating'
                      ? '正在为您创作日记...'
                      : `日记生成失败：${diaryGenerationStatus.message}`}
                  </Text>
                  {diaryGenerationStatus !== 'generating' ? (
                    <Pressable onPress={() => void generateDiaryManually().catch(() => undefined)}>
                      <Text style={styles.diaryHintAction}>重试</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : diaryCommandHint && !thinking ? (
                <View style={styles.diaryHint}>
                  <Text style={styles.diaryHintText}>是否要为您创作日记</Text>
                  <Pressable onPress={() => void generateDiaryFromCommand().catch(() => undefined)}>
                    <Text style={styles.diaryHintAction}>是</Text>
                  </Pressable>
                  <Pressable onPress={() => setDiaryCommandHint(false)}>
                    <Text style={styles.diaryHintDismiss}>否</Text>
                  </Pressable>
                </View>
              ) : diaryManualHint && !thinking ? (
                <View style={styles.diaryHint}>
                  <Text style={styles.diaryHintText}>今天快结束了，</Text>
                  <Pressable onPress={() => void generateDiaryManually().catch(() => undefined)}><Text style={styles.diaryHintAction}>点击生成今天的日记</Text></Pressable>
                </View>
              ) : null}
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
                voiceAvailable={false}
                onAddDocumentAttachment={() => void pickChatDocuments()}
                onAddImageAttachment={() => void pickChatImages()}
                onChangeText={setComposerText}
                onComposerHeightChange={handleComposerHeightChange}
                onComposerShellHeightChange={setComposerShellHeight}
                onFocus={handleComposerFocus}
                onModelIconPress={() => void handleOpenSessionConfig()}
                onReplyAssist={() => {
                  void handleOpenReplyAssist();
                }}
                onRemoveAttachment={(id) =>
                  setPendingAttachments((current) =>
                    current.filter((attachment) => attachment.id !== id),
                  )
                }
                placeholder=""
                replyAssistDisabled={
                  generating || !canOpenReplyAssist(visibleMessages)
                }
                onSend={() => {
                  void handleSend();
                }}
                onStop={() => {
                  void handleStop();
                }}
                onVoiceInput={() => {
                  void handleVoiceInput();
                }}
                onVoiceStart={() => {
                  void handleVoiceStart();
                }}
                onVoiceStop={() => {
                  void handleVoiceStop();
                }}
                onCancelVoiceInput={handleCancelVoiceInput}
                value={composerText}
                voiceError={voiceError}
                voiceMode={voiceMode}
                voiceState={voiceState}
              />
              <Animated.View
                pointerEvents="none"
                style={[styles.composerRevealMask, { opacity: composerRevealMaskOpacity }]}
              />
            </Animated.View>
          )}
          <AiScrollToLatestButton
            bottomOffset={composerShellHeight + spacing[3] + spacing[1.5]}
            generating={generating}
            visible={showScrollToLatest && !inlineEditingActive}
            onPress={handleReturnToLatestPress}
          />
        </View>
      </KeyboardAvoidingView>
      <AiSessionConfigScreen
          contextTitle={contextTitle}
          contextType={contextType}
          onBack={() => setConfigDrawerVisible(false)}
          onCurrentThreadDeleted={() => {
            if (activeThreadId) {
              onCurrentThreadDeleted(activeThreadId);
            }
            setConfigDrawerVisible(false);
          }}
          onOpenProviderSettings={() => {
            setConfigDrawerVisible(false);
            onOpenProviderSettings();
          }}
          onOpenRoleLibrary={() => {
            setConfigDrawerVisible(false);
            onOpenRoleLibrary();
          }}
          onOpenBranchTree={() => {
            if (activeThreadId) {
              setConfigDrawerVisible(false);
              onOpenBranchTree(activeThreadId);
            }
          }}
          onOpenChatSearch={() => {
            if (activeThreadId) {
              setConfigDrawerVisible(false);
              onOpenChatSearch(activeThreadId);
            }
          }}
          onOpenThreadMaterials={() => {
            if (activeThreadId) {
              setConfigDrawerVisible(false);
              onOpenThreadMaterials(activeThreadId);
            }
          }}
          onOpenMemoryBoard={() => {
            if (activeThreadId) {
              setConfigDrawerVisible(false);
              onOpenMemoryBoard(activeThreadId);
            }
          }}
          onOpenInnerLife={() => {
            if (activeThreadId) {
              setConfigDrawerVisible(false);
              onOpenInnerLife(activeThreadId);
            }
          }}
          onOpenCompanionRuntime={() => {
            if (activeThreadId) {
              setConfigDrawerVisible(false);
              onOpenCompanionRuntime(activeThreadId);
            }
          }}
          onStartChat={() => setConfigDrawerVisible(false)}
          space={space}
          threadId={activeThreadId ?? undefined}
          visible={configDrawerVisible}
        />
        <AiComprehensiveRecordDrawer
          activeThreadId={activeThreadId}
        recentThreads={recentThreads}
        visible={recordDrawerVisible}
        onClose={() => setRecordDrawerVisible(false)}
        onOpenProviderSettings={() => {
          setRecordDrawerVisible(false);
          onOpenProviderSettings();
        }}
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
      <AiReplyAssistModal
        bottomInset={insets.bottom}
        errorMessage={replyAssistError}
        loading={replyAssistLoading}
        mode={replyAssistMode}
        onClose={closeReplyAssistModal}
        onNextPage={() =>
          setReplyAssistPageIndexByMode((current) => ({
            ...current,
            [replyAssistMode]: Math.min(
              current[replyAssistMode] + 1,
              Math.max(replyAssistPagesByMode[replyAssistMode].length - 1, 0),
            ),
          }))
        }
        onPreviousPage={() =>
          setReplyAssistPageIndexByMode((current) => ({
            ...current,
            [replyAssistMode]: Math.max(current[replyAssistMode] - 1, 0),
          }))
        }
        onRefresh={() => {
          void handleRefreshReplyAssistPage();
        }}
        onSelectSuggestion={(suggestion) => {
          setComposerText(suggestion);
          closeReplyAssistModal();
        }}
        onSetMode={(mode) => {
          void handleChangeReplyAssistMode(mode);
        }}
        pageIndex={replyAssistPageIndexByMode[replyAssistMode]}
        pages={replyAssistPagesByMode[replyAssistMode]}
        visible={replyAssistVisible}
      />
      <AiMessageContextMenu
        actions={messageContextMenuActions}
        anchorX={messageContextMenuPresentation?.anchorX ?? 0}
        anchorY={messageContextMenuPresentation?.anchorY ?? 0}
        onClose={() => setMessageContextMenuState(null)}
        timeLabel={messageContextMenuPresentation?.timeLabel ?? ""}
        visible={Boolean(messageContextMenuPresentation)}
      />
      <AiAnchoredContextMenu
        actions={artifactContextMenuActions}
        anchorX={artifactContextMenuState?.anchorX ?? 0}
        anchorY={artifactContextMenuState?.anchorY ?? 0}
        dismissAccessibilityLabel="关闭卡片操作菜单"
        onClose={() => setArtifactContextMenuState(null)}
        timeLabel={artifactContextMenuState ? formatAiMessageMinute(artifactContextMenuState.createdAt) : ''}
        visible={Boolean(artifactContextMenuState)}
      />
      <AiMessageTextSelectionModal
        content={messageTextSelectionContent?.content ?? ""}
        onClose={(editedText) => {
          const selection = messageTextSelectionContent;
          setMessageTextSelectionContent(null);
          if (selection && editedText !== undefined && editedText !== selection.content) {
            if (selection.role === "user") {
              handleEditUserMessage(selection.messageId, editedText);
            } else {
              setComposerText(editedText);
            }
          }
        }}
        visible={messageTextSelectionContent !== null}
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
      <ParallaxLightSweep
        active={showSweep && appIsActive}
        color1="#A7F3D0"
        color2="#BAE6FD"
        fadeDuration={500}
        opacity={0.65}
        variant="edges"
        visible={showSweep}
      />
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
  composerRevealMask: {
    backgroundColor: aiLightColors.canvas,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 3,
  },
  diaryHint: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  diaryHintText: { ...typography.textStyles.caption, color: aiLightColors.muted },
  diaryHintSpinner: { marginRight: spacing[2] },
  diaryHintTouch: { alignItems: 'center', justifyContent: 'center', minHeight: metrics.minTouchSize },
  diaryHintAction: { ...typography.textStyles.caption, color: aiLightColors.primaryActive, marginLeft: spacing[2] },
  diaryHintDismiss: { ...typography.textStyles.caption, color: aiLightColors.muted, marginLeft: spacing[3] },
  header: {
    alignItems: "center",
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: spacing[10],
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
    color: aiLightColors.ink,
    fontSize: typography.textStyles.body.fontSize,
    fontWeight: typography.textStyles.body.fontWeight,
    lineHeight: typography.textStyles.body.lineHeight,
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
    gap: spacing[2],
    paddingBottom: spacing[2],
    paddingTop: spacing[3],
  },
  starterOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  messageListFade: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  skeletonOverlay: {
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
