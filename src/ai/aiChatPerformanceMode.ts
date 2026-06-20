import type { AiContextType, PixorySpace } from '../database';
import type { AiChatFastPathClassification } from './aiChatFastPath';

export type AiChatPerformanceProfile =
  | 'balanced_companion'
  | 'low_latency'
  | 'long_companion'
  | 'material_grounding';

export function resolveAiChatPerformanceProfile(input: {
  fastPathClassification?: AiChatFastPathClassification | null;
  contextType: AiContextType;
  space: PixorySpace;
}): AiChatPerformanceProfile {
  if (input.contextType !== 'normal') {
    return 'material_grounding';
  }
  if (input.fastPathClassification === 'material_keyword_only' || input.fastPathClassification === 'material_full_retrieval') {
    return 'material_grounding';
  }
  if (input.fastPathClassification === 'normal_no_material_fast_path') {
    return 'low_latency';
  }
  if (input.fastPathClassification === 'long_companion_context') {
    return 'long_companion';
  }
  return 'balanced_companion';
}
