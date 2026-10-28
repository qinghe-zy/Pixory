/**
 * IM Companion Chat Domain Types
 *
 * 物理隔离架构规范：
 * 属于短聊天独立领域模型，严禁引用 src/ai 中的巨石长聊天模型。
 */

export type ImMessageRole = 'user' | 'assistant' | 'system';

export type ImMessageStatus = 'sending' | 'sent' | 'failed';

export type DeliveryStatus = 'staged' | 'revealing' | 'delivered' | 'cancelled';

export type ImMessageType = 'text' | 'image' | 'voice' | 'system_notice' | 'diary_card';

/**
 * 语音消息预留元数据接口 (Reserved Voice Metadata)
 * 硬件受限阶段仅做类型契约预留，未来硬件就绪后平滑挂载音频流
 */
export interface ImVoiceMetadata {
  audioUri: string;
  durationMs: number;
  waveform?: number[];
  transcription?: string;
}

export interface ImMessage {
  id: string;
  threadId: string;
  burstGroupId?: string | null;
  role: ImMessageRole;
  content: string;
  type?: ImMessageType;
  imageUri?: string | null;
  boundIpName?: string | null;
  voice?: ImVoiceMetadata;
  status: ImMessageStatus;
  deliveryStatus?: DeliveryStatus;
  /**
   * 计划显影时间戳 (Unix 毫秒)。
   * 用户消息此值为 null（即时显影）；
   * 伴侣分句在未来时间点显影。
   */
  visibleAt?: number | null;
  createdAt: string;
}

export type ImFsmState =
  | 'IDLE'
  | 'DEBOUNCING'
  | 'STREAMING_CHUNK'
  | 'SCHEDULE_WRITE'
  | 'INTERRUPTED';

export interface ImBurstSegment {
  id: string;
  text: string;
  scheduledVisibleAt: number;
}

export type ActivityLoad = 'free' | 'occupied' | 'sleeping';
export type PrivacyContext = 'private' | 'public';
export type DeviceAccess = 'available' | 'limited' | 'away';

export interface LivingStateTrajectoryItem {
  statusText: string;
  startedAt: number;
  endedAt: number;
  activityLoad: ActivityLoad;
  privacyContext: PrivacyContext;
  deviceAccess: DeviceAccess;
}

/**
 * 伴侣生活状态自知觉模型 (HDSI Living State)
 * 记录伴侣当前正在做的事、物理环境负荷、情绪惯性与日间生活轨迹
 */
export interface ImCompanionLivingState {
  statusText: string;
  activityLoad: ActivityLoad;
  privacyContext: PrivacyContext;
  deviceAccess: DeviceAccess;
  startedAt: number;
  validUntil: number;
  alterValue: number; // [-5, +5]
  recentTrajectory: LivingStateTrajectoryItem[];
}

/**
 * 伴侣物理容量守卫判定契约
 */
export interface AgencyCapacityResult {
  allowed: boolean;
  reason:
    | 'capacity-available'
    | 'sleeping'
    | 'device-away'
    | 'schedule-occupied'
    | 'privacy-restricted';
  suggestedDelayMs?: number;
}

/**
 * 伴侣短聊天会话实体 (1:1 绑定角色卡)
 */
export interface ImThread {
  id: string;
  space: 'normal' | 'personal';
  roleCardId: string;
  title: string;
  chatMode: 'im';
  lastMessagePreview?: string | null;
  isPinned: boolean;
  livingState?: ImCompanionLivingState | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 伴侣消息列表项展示数据模型 (微信好友列表式排版)
 */
export interface ImThreadListItem {
  id: string;
  space: 'normal' | 'personal';
  roleCardId: string;
  title: string;
  avatarUri?: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  updatedAt: string;
  isPinned: boolean;
  unreadCount?: number;
  /** 伴侣生活状态（灵动心跳） */
  livingStatus?: string | null;
  livingState?: ImCompanionLivingState | null;
}
