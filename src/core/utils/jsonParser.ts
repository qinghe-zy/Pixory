/**
 * 健壮的 JSON 对象提取与解析工具
 * 兼容处理大模型输出中包含 Markdown 代码块 (```json ... ```)、前置思考、解释说明等多余文本的场景。
 */

export function extractJsonObject<T = Record<string, unknown>>(text: string | null | undefined): T | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. 尝试匹配 ```json ... ``` 或 ``` ... ``` Markdown 代码块
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidate = fenced?.[1] ? fenced[1].trim() : trimmed;

  // 2. 寻找最外层有效大括号 '{' 与 '}'
  const first = candidate.indexOf('{');
  const last = candidate.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    return null;
  }

  const jsonStr = candidate.slice(first, last + 1);
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object') {
      return parsed as T;
    }
    return null;
  } catch {
    return null;
  }
}
