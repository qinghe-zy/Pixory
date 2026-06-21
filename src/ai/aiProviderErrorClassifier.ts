export type AiProviderErrorKind =
  | 'auth'
  | 'model'
  | 'billing'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'upstream'
  | 'bad_shape'
  | 'empty_response'
  | 'unknown';

export interface AiProviderErrorReason {
  detail?: string;
  kind: AiProviderErrorKind;
  status?: number;
}

export function redactProviderErrorText(text: string): string {
  return text
    .replace(/Authorization\s*:\s*Bearer\s+[^\s"'\\]+/gi, 'Authorization: Bearer [redacted]')
    .replace(/(["']?authorization["']?\s*[:=]\s*["']?Bearer\s+)[^"',\s\\]+/gi, '$1[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-[redacted]')
    .replace(/([?&](?:api_)?key=)[^&\s"'\\]+/gi, '$1[redacted]')
    .replace(/\b((?:api_)?key=)[^&\s"'\\]+/gi, '$1[redacted]')
    .replace(/(["']?(?:api_)?key["']?\s*[:=]\s*["'])[^"',\s\\]+(["'])/gi, '$1[redacted]$2');
}

function extractProviderMessage(body: string): string {
  const redacted = redactProviderErrorText(body.trim());
  if (!redacted) {
    return '';
  }
  try {
    const parsed = JSON.parse(redacted) as unknown;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const error = record.error;
      if (error && typeof error === 'object') {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === 'string') {
          return redactProviderErrorText(message);
        }
      }
      if (typeof record.message === 'string') {
        return redactProviderErrorText(record.message);
      }
    }
  } catch {
    return redacted;
  }
  return redacted;
}

export function classifyAiProviderError(input: {
  body?: string;
  error?: unknown;
  fallbackKind?: AiProviderErrorKind;
  status?: number;
}): AiProviderErrorReason {
  const status = input.status ?? 0;
  const rawDetail = input.body || (input.error instanceof Error ? input.error.message : String(input.error ?? ''));
  const detail = extractProviderMessage(rawDetail);
  const lower = detail.toLowerCase();

  if (input.error instanceof Error && (input.error.name === 'AbortError' || /timeout|timed out/i.test(input.error.message))) {
    return { detail, kind: 'timeout', status };
  }
  if (status === 401 || status === 403 || lower.includes('invalid api key') || lower.includes('unauthorized') || lower.includes('authentication')) {
    return { detail, kind: 'auth', status };
  }
  if (status === 404 || (lower.includes('model') && (lower.includes('not found') || lower.includes('invalid') || lower.includes('not exist')))) {
    return { detail, kind: 'model', status };
  }
  if (status === 402 || lower.includes('insufficient balance') || lower.includes('insufficient quota') || lower.includes('balance')) {
    return { detail, kind: 'billing', status };
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('quota exceeded')) {
    return { detail, kind: 'rate_limit', status };
  }
  if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('econn') || lower.includes('socket')) {
    return { detail, kind: 'network', status };
  }
  if (status >= 500 || lower.includes('<html') || lower.includes('bad gateway') || lower.includes('upstream')) {
    return { detail, kind: 'upstream', status };
  }
  return { detail, kind: input.fallbackKind ?? 'unknown', status };
}

export function toUserProviderErrorMessage(reason: AiProviderErrorReason): string {
  switch (reason.kind) {
    case 'auth':
      return 'API Key 无效或已过期，请检查是否复制完整。';
    case 'model':
      return '该模型 ID 在此中转站不可用，请换一个或填写网关别名。';
    case 'billing':
      return '中转站余额或额度不足，请到中转站后台查看。';
    case 'rate_limit':
      return '请求过快或触发限流，请稍后重试。';
    case 'timeout':
      return '响应太慢，已超时；配置未被清空。';
    case 'network':
      return '网络连接失败，请检查网络或服务地址。';
    case 'upstream':
      return '中转站或上游模型暂时异常。';
    case 'bad_shape':
      return '中转站返回格式不兼容，已保留配置，可稍后重试。';
    case 'empty_response':
      return 'AI 没有返回可用内容，可能是模型或中转站响应异常。';
    default:
      return reason.detail ? `请求失败：${reason.detail.slice(0, 120)}` : '请求失败，请检查配置或稍后重试。';
  }
}
