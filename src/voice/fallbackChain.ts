import type { TtsSynthesisRequest, TtsSynthesisResult, VoicePresetRecord } from './types';
import { openAiCompatEngine } from './engines/openAiCompatEngine';
import { nativeTtsEngine } from './engines/nativeTtsEngine';
import { resolveDeveloperMimoKey } from './developerVoiceSecurity';

interface CircuitBreakerState {
  failureCount: number;
  openUntil: number;
}

const tier1CircuitBreaker: CircuitBreakerState = {
  failureCount: 0,
  openUntil: 0,
};

export function isTier1CircuitOpen(): boolean {
  if (tier1CircuitBreaker.openUntil === 0) return false;
  if (Date.now() > tier1CircuitBreaker.openUntil) {
    // 半开试探态
    tier1CircuitBreaker.openUntil = 0;
    return false;
  }
  return true;
}

export function recordTier1Success(): void {
  tier1CircuitBreaker.failureCount = 0;
  tier1CircuitBreaker.openUntil = 0;
}

export function recordTier1Failure(): void {
  tier1CircuitBreaker.failureCount += 1;
  if (tier1CircuitBreaker.failureCount >= 5) {
    // 连续失败 5 次，轻量保护 20 秒 (避免长时间惩罚用户主动操作)
    tier1CircuitBreaker.openUntil = Date.now() + 20 * 1000;
  }
}

export function resetTier1CircuitBreaker(): void {
  tier1CircuitBreaker.failureCount = 0;
  tier1CircuitBreaker.openUntil = 0;
}

export interface FallbackChainOptions {
  onTierFallback?: (fromTier: string, toTier: string, reason: string) => void;
  allowCloudInPersonal?: boolean;
}

export async function executeFallbackChain(
  request: TtsSynthesisRequest,
  preset: VoicePresetRecord,
  options?: FallbackChainOptions
): Promise<TtsSynthesisResult> {
  const isPersonal = request.space === 'personal';
  const allowCloud = !isPersonal || Boolean(options?.allowCloudInPersonal);

  // 1. 优先尝试 Tier 1: 云端模型 (含小米 MiMo 开发者内置官方授权 / 用户自配 SiliconFlow / OpenAI 等)
  if (preset.engineKind === 'openai_compat' && allowCloud) {
    let effectiveApiKey = request.apiKey?.trim();
    if (!effectiveApiKey) {
      effectiveApiKey = resolveDeveloperMimoKey(preset.model, preset.baseUrl) ?? undefined;
    }
    const hasApiKey = Boolean(effectiveApiKey);
    if (hasApiKey && !isTier1CircuitOpen()) {
      try {
        const result = await openAiCompatEngine.synthesizeToFile({
          ...request,
          apiKey: effectiveApiKey,
          timeoutMs: request.timeoutMs || 35000,
        });
        recordTier1Success();
        return result;
      } catch (err: any) {
        recordTier1Failure();
        // 若为系统内置预设且云端偶发 401 密钥失效或网络超时，平滑降级至本机离线引擎，绝不阻断用户听感
        if (!preset.isBuiltin) {
          throw err;
        }
      }
    } else if (!hasApiKey && !preset.isBuiltin) {
      // 自定义云端预设若未提供 Key，给出明确配置指引
      throw new Error('未检测到有效 API 密钥，请在下方【高级自定义 API 服务】中配置密钥。');
    }
  }

  // 2. 兜底 Tier 2: Android 本机系统离线引擎 (零网络依赖、零延迟、免 Key)
  try {
    return await nativeTtsEngine.synthesizeToFile({
      ...request,
      rate: request.rate || 1.0,
      pitch: request.pitch || 0.0,
    });
  } catch (err: any) {
    throw new Error('系统离线语音引擎尚未就绪，可在【声音与朗读】中配置自定义 API 服务。');
  }
}
