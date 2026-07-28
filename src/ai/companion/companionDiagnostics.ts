import { hashCompanionText } from './companionRuntimeValidation';

export const COMPANION_CONTEXT_TRACE_VERSION = 'companion-context-trace-v1';

export function deriveCompanionTraceId(input: {
  space: string;
  threadId: string;
  sourceMessageId: string;
  branchRouteHash: string;
  lineageVersion: number;
}): string {
  return `ctrace_${hashCompanionText([
    input.space,
    input.threadId,
    input.sourceMessageId,
    input.branchRouteHash,
    String(input.lineageVersion),
  ].join('\u001F')).slice(0, 32)}`;
}
