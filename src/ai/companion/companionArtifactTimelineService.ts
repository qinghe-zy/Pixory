export type CompanionArtifactKind = 'diary' | 'dream' | 'dreamJob';

export interface CompanionArtifactTimelineMessage {
  id: string;
  createdAt: string;
}

export interface CompanionArtifactEntry<Payload = unknown> {
  id: string;
  kind: CompanionArtifactKind;
  sourceMessageIds: string[];
  createdAt: string;
  payload: Payload;
}

export type CompanionArtifactTimelineItem<
  Message extends CompanionArtifactTimelineMessage,
  Payload = unknown,
> =
  | { id: string; type: 'message'; message: Message }
  | {
      id: string;
      type: 'artifact';
      anchorMessageId: string;
      artifact: CompanionArtifactEntry<Payload>;
    };

function findLegacyAnchorIndex<Message extends CompanionArtifactTimelineMessage>(
  messages: Message[],
  artifactCreatedAt: string,
): number {
  const artifactTime = Date.parse(artifactCreatedAt);
  if (!Number.isFinite(artifactTime)) {
    return -1;
  }

  let anchorIndex = -1;
  let anchorTime = Number.NEGATIVE_INFINITY;
  messages.forEach((message, index) => {
    const messageTime = Date.parse(message.createdAt);
    if (
      Number.isFinite(messageTime) &&
      messageTime <= artifactTime &&
      (messageTime > anchorTime || (messageTime === anchorTime && index > anchorIndex))
    ) {
      anchorIndex = index;
      anchorTime = messageTime;
    }
  });
  return anchorIndex;
}

export function buildCompanionArtifactTimeline<
  Message extends CompanionArtifactTimelineMessage,
  Payload = unknown,
>(input: {
  messages: Message[];
  artifacts: Array<CompanionArtifactEntry<Payload>>;
}): Array<CompanionArtifactTimelineItem<Message, Payload>> {
  const messageIndexById = new Map(
    input.messages.map((message, index) => [message.id, index] as const),
  );
  const artifactsByAnchorIndex = new Map<number, Array<CompanionArtifactEntry<Payload>>>();
  const seenArtifactIds = new Set<string>();

  input.artifacts.forEach((artifact) => {
    const artifactIdentity = `${artifact.kind}:${artifact.id}`;
    if (seenArtifactIds.has(artifactIdentity)) {
      return;
    }
    seenArtifactIds.add(artifactIdentity);
    const lastSourceMessageId = artifact.sourceMessageIds.at(-1);
    const anchorIndex = lastSourceMessageId !== undefined
      ? (messageIndexById.get(lastSourceMessageId) ?? -1)
      : findLegacyAnchorIndex(input.messages, artifact.createdAt);
    if (anchorIndex < 0) {
      return;
    }
    const anchoredArtifacts = artifactsByAnchorIndex.get(anchorIndex) ?? [];
    anchoredArtifacts.push(artifact);
    artifactsByAnchorIndex.set(anchorIndex, anchoredArtifacts);
  });

  const items: Array<CompanionArtifactTimelineItem<Message, Payload>> = [];
  input.messages.forEach((message, index) => {
    items.push({ id: message.id, type: 'message', message });
    const anchoredArtifacts = artifactsByAnchorIndex.get(index);
    if (!anchoredArtifacts) {
      return;
    }
    anchoredArtifacts
      .sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id) ||
        left.kind.localeCompare(right.kind),
      )
      .forEach((artifact) => {
        items.push({
          anchorMessageId: message.id,
          artifact,
          id: `${artifact.kind}-${artifact.id}`,
          type: 'artifact',
        });
      });
  });
  return items;
}
