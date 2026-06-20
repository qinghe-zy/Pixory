import type { AiContextType } from '../database';

export type AiChatFastPathClassification =
  | 'normal_no_material_fast_path'
  | 'normal_memory_only'
  | 'material_keyword_only'
  | 'material_full_retrieval'
  | 'ip_context_retrieval'
  | 'knowledge_base_retrieval'
  | 'long_companion_context';

export type AiChatRetrievalTier = 'full' | 'keyword' | 'none';

export interface AiChatFastPathInput {
  contextType: AiContextType;
  hasMemoryContext?: boolean;
  hasThreadMaterials?: boolean;
  includeIpDocuments?: boolean;
  messageCount?: number;
  userMessage: string;
}

export interface AiChatFastPathResult {
  classification: AiChatFastPathClassification;
  retrievalTier: AiChatRetrievalTier;
  retrievalSkippedReason: 'normal_fast_path' | null;
}

const LONG_COMPANION_MESSAGE_THRESHOLD = 160;

export const AMBIGUOUS_MATERIAL_REFERENCE_PATTERNS = [
  /这个文档/,
  /这份文档/,
  /那个文档/,
  /那份文档/,
  /这张图/,
  /那张图/,
  /这张图片/,
  /那张图片/,
  /上面的设定/,
  /前面的设定/,
  /刚才的资料/,
  /这些资料/,
  /上述资料/,
  /according to the material/i,
  /based on the material/i,
] as const;

const EXPLICIT_MATERIAL_REFERENCE_PATTERNS = [
  /资料/,
  /文档/,
  /知识库/,
  /引用/,
  /来源/,
  /设定集/,
  /素材/,
  /图片/,
  /图像/,
] as const;

function hasPattern(patterns: readonly RegExp[], value: string): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function materialRetrievalTier(input: {
  explicitMaterialReference: boolean;
  hasThreadMaterials?: boolean;
  materialReference: boolean;
}): AiChatRetrievalTier {
  if (input.hasThreadMaterials && input.explicitMaterialReference) {
    return 'full';
  }
  return input.materialReference ? 'keyword' : 'none';
}

export function classifyAiChatFastPath(input: AiChatFastPathInput): AiChatFastPathResult {
  const userMessage = input.userMessage.trim();
  const ambiguousMaterialReference = hasPattern(AMBIGUOUS_MATERIAL_REFERENCE_PATTERNS, userMessage);
  const explicitMaterialReference = !ambiguousMaterialReference && hasPattern(EXPLICIT_MATERIAL_REFERENCE_PATTERNS, userMessage);
  const materialReference = ambiguousMaterialReference || explicitMaterialReference;

  if (input.contextType === 'ip') {
    return { classification: 'ip_context_retrieval', retrievalTier: 'full', retrievalSkippedReason: null };
  }
  if (input.contextType === 'knowledge_base') {
    return { classification: 'knowledge_base_retrieval', retrievalTier: 'full', retrievalSkippedReason: null };
  }
  if ((input.messageCount ?? 0) >= LONG_COMPANION_MESSAGE_THRESHOLD) {
    const retrievalTier = materialRetrievalTier({
      explicitMaterialReference,
      hasThreadMaterials: input.hasThreadMaterials,
      materialReference,
    });
    return {
      classification: 'long_companion_context',
      retrievalTier,
      retrievalSkippedReason: retrievalTier === 'none' ? 'normal_fast_path' : null,
    };
  }
  if (ambiguousMaterialReference) {
    return { classification: 'material_keyword_only', retrievalTier: 'keyword', retrievalSkippedReason: null };
  }
  if (explicitMaterialReference) {
    return {
      classification: input.hasThreadMaterials ? 'material_full_retrieval' : 'material_keyword_only',
      retrievalTier: input.hasThreadMaterials ? 'full' : 'keyword',
      retrievalSkippedReason: null,
    };
  }
  if (input.hasMemoryContext) {
    return { classification: 'normal_memory_only', retrievalTier: 'none', retrievalSkippedReason: 'normal_fast_path' };
  }
  return { classification: 'normal_no_material_fast_path', retrievalTier: 'none', retrievalSkippedReason: 'normal_fast_path' };
}
