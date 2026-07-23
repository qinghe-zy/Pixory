type SpaceMoveThread = {
  id: string;
  contextType: 'normal' | 'ip' | 'knowledge_base';
  sessionApiKeyRef: string | null;
};

type SpaceMoveMessage = {
  id: string;
  status: string;
};

export interface AiThreadSpaceMoveCandidate {
  thread: SpaceMoveThread;
  messages: SpaceMoveMessage[];
}

const ACTIVE_MESSAGE_STATUSES = new Set(['draft', 'queued', 'generating']);

export function assertAiThreadSpaceMoveAllowed(snapshot: AiThreadSpaceMoveCandidate): void {
  if (snapshot.thread.contextType !== 'normal') {
    throw new Error('IP 或知识库绑定的聊天暂不支持跨空间移动，请先保留在当前空间。');
  }
  if (snapshot.thread.sessionApiKeyRef) {
    throw new Error('该聊天使用了本会话专属 API Key，暂不支持跨空间移动。');
  }
  if (snapshot.messages.some((message) => ACTIVE_MESSAGE_STATUSES.has(message.status))) {
    throw new Error('该聊天仍有未完成的消息，请等待生成结束或停止后再移动。');
  }
}
