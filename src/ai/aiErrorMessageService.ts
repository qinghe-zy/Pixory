export function normalizeAiErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const text = raw.toLowerCase();

  if (/api[_\s-]?key|unauthorized|401|invalid key|missing key/.test(text)) {
    return 'API Key 无效或已过期，请检查模型账号设置。';
  }
  if (/quota|balance|billing|insufficient|rate limit|429|too many requests/.test(text)) {
    return '额度不足或请求过于频繁，请稍后再试或检查模型账号额度。';
  }
  if (/model.*not found|model.*unavailable|404|unsupported model|invalid model/.test(text)) {
    return '模型暂时不可用，请切换模型或检查模型 ID。';
  }
  if (/network|timeout|failed to fetch|connection|econn|socket/.test(text)) {
    return '网络连接失败，请检查网络后重试。';
  }
  return raw.trim() || '生成失败，请稍后重试。';
}
