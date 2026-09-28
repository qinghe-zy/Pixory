export const DIARY_CREATION_PHRASES = [
  '帮我写一篇日记',
  '给我写一篇日记',
  '替我写一篇日记',
  '为我写一篇日记',
  '请写一篇日记',
  '请你写一篇日记',
  '请帮我写一篇日记',
  '帮我写日记',
  '给我写日记',
  '替我写日记',
  '为我写日记',
  '请写日记',
  '请你写日记',
  '请帮我写日记',
  '帮我创作一篇日记',
  '给我创作一篇日记',
  '请创作一篇日记',
  '请你创作一篇日记',
  '生成一篇日记',
  '帮我生成一篇日记',
  '给我生成一篇日记',
  '请生成一篇日记',
  '生成今天的日记',
  '写今天的日记',
  '写今日的日记',
  '为今天写一篇日记',
  '现在写一篇日记',
  '现在生成日记',
  '记录成一篇日记',
  '把今天记成日记',
  '把这段记成日记',
  '把刚才记成日记',
  '把今天的聊天写成日记',
  '把这段聊天写成日记',
  '来一篇日记',
  '写个日记吧',
  '帮我写个日记',
  '给我写个日记',
  '请写个日记',
  '请你写个日记',
  '写一下日记',
  '帮我写一下日记',
  '给我写一下日记',
  '请帮我写一下日记',
  '给今天写个日记',
  '帮今天写个日记',
  '为今天留一篇日记',
  '给今天留一篇日记',
  '给今天留个日记',
  '为今天记录一篇日记',
  '记录一下今天的日记',
  '把今天写进日记',
  '把这段写进日记',
  '把刚才写进日记',
  '把这段对话写进日记',
  '把今天的聊天写进日记',
  '把这段对话记成日记',
  '把刚才的聊天记成日记',
  '把这一刻记成日记',
  '把今天整理成日记',
  '把这段整理成日记',
  '把这段聊天整理成日记',
  '把刚才的对话整理成日记',
  '帮我整理一篇日记',
  '给我整理一篇日记',
  '请整理一篇日记',
  '请你整理一篇日记',
  '日记来一篇',
  '来个日记',
  '来一篇今天的日记',
  '写篇日记',
  '帮我写篇日记',
  '给我写篇日记',
  '创作一篇今天的日记',
  '帮我创作今天的日记',
  '给我创作今天的日记',
  '生成今天这篇日记',
  '生成一份日记',
  '帮我生成一份日记',
  '请生成一份日记',
] as const;

/**
 * Kept deliberately narrow: a command verb plus a diary target must make up
 * the whole message. This accepts natural suffixes without treating a casual
 * mention such as "我在日记里写了你" as an action request.
 */
const DIARY_CREATION_PATTERNS = [
  /^(?:麻烦(?:你)?|可以(?:帮我)?|能不能(?:帮我)?|想请你|我想让你)(?:写|生成|创作|整理)(?:一篇|一份|个|篇)?(?:今天的|今日的)?日记(?:吧|呀|吗)?$/,
  /^(?:帮我|给我|替我|为我|请(?:你|帮我)?)(?:把)?(?:今天|今日|这段|刚才|这段聊天|这段对话|今天的聊天|刚才的聊天)?(?:写|记|整理|记录)(?:成|进|为)?(?:一篇|一份|个|篇)?日记(?:吧|呀)?$/,
  /^(?:把)?(?:今天|今日|这段|刚才|这段聊天|这段对话|今天的聊天|刚才的聊天)?(?:写|记|整理|记录)(?:成|进|为)(?:一篇|一份|个|篇)?日记(?:吧|呀)?$/,
] as const;

function normalizeDiaryCommand(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[。！!？?]+$/g, '');
}

/** Only self-contained requests are eligible for the non-blocking diary prompt. */
export function isDiaryCreationRequest(value: string): boolean {
  const normalized = normalizeDiaryCommand(value);
  return (
    DIARY_CREATION_PHRASES.some((phrase) => normalized === phrase) ||
    DIARY_CREATION_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}
