import type { TtsSynthesisRequest, TtsSynthesisResult, VoiceEngineKind } from '../types';

export interface TtsEngine {
  readonly kind: VoiceEngineKind;
  synthesizeToFile(request: TtsSynthesisRequest): Promise<TtsSynthesisResult>;
}
