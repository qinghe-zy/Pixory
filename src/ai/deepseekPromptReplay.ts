export interface DeepSeekReplaySnapshot { role: 'user' | 'assistant'; messageId: string; renderedContent: string; sourceMessageVersionHash: string; branchRouteHash: string; }
export interface DeepSeekReplayMessage { role: 'user' | 'assistant'; content: string; messageId?: string; }
export function replayDeepSeekRenderedUsers(input: { history: DeepSeekReplayMessage[]; snapshotsByAssistantId: Map<string, DeepSeekReplaySnapshot[]>; branchRouteHash: string; sourceHash: (content: string) => string }): DeepSeekReplayMessage[] {
  const replay = input.history.map((message) => ({ ...message }));
  for (let assistantIndex = 1; assistantIndex < replay.length; assistantIndex += 1) {
    const assistant = replay[assistantIndex];
    const user = replay[assistantIndex - 1];
    if (assistant.role !== 'assistant' || user.role !== 'user' || !assistant.messageId || !user.messageId) continue;
    const snapshot = input.snapshotsByAssistantId.get(assistant.messageId)?.find((candidate) => candidate.role === 'user' && candidate.messageId === user.messageId && candidate.branchRouteHash === input.branchRouteHash && candidate.sourceMessageVersionHash === input.sourceHash(user.content));
    if (snapshot) replay[assistantIndex - 1] = { ...user, content: snapshot.renderedContent };
  }
  return replay;
}
