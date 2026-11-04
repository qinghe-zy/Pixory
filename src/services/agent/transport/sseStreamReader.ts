import {
  dispatchAiStreamEvent,
  type AiStreamEvent,
  type AiStreamEventHandler,
} from '../../../ai/providers/base';

/**
 * 通用 SSE 流式行读取器
 * 统一处理分块解码、换行切片、行尾缓存与逐行派发，消除适配器间的代码重复 (DRY)
 */
export async function streamSseReader(
  body: ReadableStream<Uint8Array>,
  lineParser: (line: string) => AiStreamEvent[],
  onEvent: AiStreamEventHandler,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let lineBuffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() || '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const events = lineParser(line);
        for (let j = 0; j < events.length; j++) {
          await dispatchAiStreamEvent(onEvent, events[j]);
        }
      }
    }

    if (lineBuffer.trim()) {
      const events = lineParser(lineBuffer);
      for (let j = 0; j < events.length; j++) {
        await dispatchAiStreamEvent(onEvent, events[j]);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
