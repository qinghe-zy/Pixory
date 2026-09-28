export interface AiBranchScope {
  branchRootMessageId: string;
  branchVersionIndex: number;
}

export interface AiBranchMessageLike {
  id: string;
  branchRootMessageId: string | null;
  branchVersionIndex: number | null;
  versionTotal: number;
}

export type AiSelectedVersionMap = Record<string, number>;

export function getSelectedMessageVersionIndex(
  selectedVersionByMessageId: AiSelectedVersionMap,
  messageId: string,
  versionTotal: number
): number {
  return selectedVersionByMessageId[messageId] ?? versionTotal;
}

export function messageMatchesSelectedBranchPath(
  message: AiBranchMessageLike,
  messagesById: Map<string, AiBranchMessageLike>,
  selectedVersionByMessageId: AiSelectedVersionMap
): boolean {
  const path: AiBranchMessageLike[] = [];
  const visiting = new Set<string>();
  let current: AiBranchMessageLike | undefined = message;

  while (current?.branchRootMessageId && current.branchVersionIndex) {
    if (visiting.has(current.id)) {
      return false;
    }
    visiting.add(current.id);
    path.push(current);
    current = messagesById.get(current.branchRootMessageId);
    if (!current) {
      return false;
    }
  }

  for (let index = path.length - 1; index >= 0; index -= 1) {
    const branchMessage = path[index];
    const branchRoot = messagesById.get(branchMessage.branchRootMessageId ?? '');
    if (!branchRoot) {
      return false;
    }
    const selectedVersion = getSelectedMessageVersionIndex(
      selectedVersionByMessageId,
      branchRoot.id,
      branchRoot.versionTotal
    );
    if (selectedVersion !== branchMessage.branchVersionIndex) {
      return false;
    }
  }

  return true;
}

export function getActiveBranchForNextMessageFromVisibleMessages(
  visibleMessages: AiBranchMessageLike[],
  selectedVersionByMessageId: AiSelectedVersionMap
): AiBranchScope | null {
  for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
    const message = visibleMessages[index];
    if (message.versionTotal > 1) {
      return {
        branchRootMessageId: message.id,
        branchVersionIndex: getSelectedMessageVersionIndex(selectedVersionByMessageId, message.id, message.versionTotal),
      };
    }
    if (message.branchRootMessageId && message.branchVersionIndex) {
      return {
        branchRootMessageId: message.branchRootMessageId,
        branchVersionIndex: message.branchVersionIndex,
      };
    }
  }
  return null;
}
