export type JournalAchievementCategory =
  | 'journey'
  | 'connection'
  | 'time'
  | 'world'
  | 'organize';

export type JournalAchievementRouteKind =
  | 'asset'
  | 'thread'
  | 'memory-board'
  | 'diary'
  | 'dream'
  | 'branch-tree'
  | 'ip'
  | 'knowledge'
  | 'role'
  | 'group'
  | 'tag'
  | 'all-assets'
  | 'calculation';

export interface JournalAchievementDefinition {
  id: string;
  category: JournalAchievementCategory;
  title: string;
  description: string;
  requirement: string;
  sourceType: string;
  routeKind: JournalAchievementRouteKind;
}

const definition = (
  id: string,
  category: JournalAchievementCategory,
  title: string,
  description: string,
  requirement: string,
  sourceType: string,
  routeKind: JournalAchievementRouteKind,
): JournalAchievementDefinition => ({
  id,
  category,
  title,
  description,
  requirement,
  sourceType,
  routeKind,
});

export const JOURNAL_ACHIEVEMENT_DEFINITIONS: JournalAchievementDefinition[] = [
  definition('first-light', 'journey', '第一份光影', '第一份被妥善收好的图片或视频。', '首次成功保存图片或视频。', 'asset', 'asset'),
  definition('first-conversation', 'journey', '第一次对话', '第一段真正留下回声的对话。', '首个真实线程产生有效消息。', 'thread', 'thread'),
  definition('deep-night-light', 'connection', '深夜有光', '长夜里仍然连续亮着的一段对话。', '01:00–04:00 之间完成至少 20 轮有效问答。', 'thread', 'thread'),
  definition('long-conversation', 'connection', '长谈成章', '一小时里没有散开的长谈。', '一小时内连续完成至少 25 轮有效问答。', 'thread', 'thread'),
  definition('memory-note', 'connection', '心事入笺', '有一件事被认真留下。', '首条有效记忆正式落成。', 'memory', 'memory-board'),
  definition('memory-grove', 'connection', '记忆成林', '零散的片段慢慢长成一片林。', '有效记忆达到 30 条。', 'memory', 'memory-board'),
  definition('private-words', 'connection', '私语成篇', '角色的第一篇私语被保存下来。', '首篇角色日记成功保存。', 'diary', 'diary'),
  definition('dream-letter', 'connection', '梦中来信', '一封从梦里寄来的信。', '首个梦境完成生成并可阅读。', 'dream', 'dream'),
  definition('between-two-days', 'connection', '两日之间', '一段没有在午夜停下来的长谈。', '跨越两个日期，连续间隔不超过 3 分钟，且一小时内完成 25 轮。', 'thread', 'thread'),
  definition('week-has-voice', 'connection', '一周有声', '连续七天，都有回应抵达。', '连续 7 天每天至少完成 3 轮有效问答。', 'thread', 'thread'),
  definition('seven-days-poem', 'time', '七日成诗', '七天之后，日子开始有了韵脚。', '陪伴天数达到 7 天。', 'system', 'calculation'),
  definition('moon-trace', 'time', '月影留痕', '不同月份里，都留下过一点光。', '至少 3 个自然月有有效记录。', 'system', 'calculation'),
  definition('hundred-day-promise', 'time', '百日之约', '一起走过一百个日落。', '陪伴天数达到 100 天。', 'system', 'calculation'),
  definition('half-year-date', 'time', '半载有期', '半年时光，已经有了自己的页码。', '从首次使用日期起满 6 个自然月。', 'system', 'calculation'),
  definition('one-year-chapter', 'time', '一载成章', '一年之后，这段故事成为一章。', '从首次使用日期起满 12 个自然月。', 'system', 'calculation'),
  definition('four-seasons', 'time', '四季相逢', '春夏秋冬，都曾在这里相遇。', '实际经历四个季节。', 'system', 'calculation'),
  definition('new-year-promise', 'time', '岁首有约', '旧年和新年交界处的一次问候。', '12 月 31 日至次年 1 月 1 日完成有效对话。', 'thread', 'thread'),
  definition('reunion', 'time', '久别重逢', '离开一阵子之后，又回到了这里。', '沉寂至少 7 天后重新完成一轮有效对话。', 'thread', 'thread'),
  definition('parallel-time', 'world', '平行时空', '同一个问题，走向了另一种可能。', '创建分支并产生有效消息。', 'branch', 'branch-tree'),
  definition('three-way-crossing', 'world', '三岔路口', '一条路上长出了三种方向。', '同一线程存在至少 3 条有效分支路线。', 'branch', 'branch-tree'),
  definition('material-enters', 'world', '素材入境', '一份资料正式进入这段对话。', '首次成功绑定线程材料。', 'material', 'thread'),
  definition('paper-sets-sail', 'world', '纸页成舟', '一页文字开始载着世界航行。', '首个文档或知识库材料成功解析保存。', 'document', 'knowledge'),
  definition('words-echo', 'world', '字句回响', '回答里出现了可以追溯的依据。', '首次产生有效材料引用的 AI 回复。', 'citation', 'thread'),
  definition('role-awakens', 'world', '角色初醒', '一个角色不再只是空白名字。', '完成角色卡的一项实质配置。', 'role', 'role'),
  definition('world-grows', 'world', '世界渐丰', '一个世界开始拥有自己的分量。', '单个 IP 拥有至少 30 个未删除素材。', 'ip', 'ip'),
  definition('three-realms', 'world', '三方成境', '三个世界同时在这里展开。', '当前空间存在至少 3 个未删除 IP。', 'ip', 'ip'),
  definition('first-moving-image', 'organize', '第一段影像', '静止的光影之外，第一次留下流动。', '首次成功保存视频。', 'asset', 'asset'),
  definition('kept-treasure', 'organize', '留下一份珍藏', '有一份光影被单独留了下来。', '首次收藏图片或视频。', 'asset', 'asset'),
  definition('objects-in-chapter', 'organize', '归物成章', '素材第一次拥有了自己的章节。', '首次创建分组并归入素材。', 'group', 'group'),
  definition('first-name-tag', 'organize', '名帖初成', '第一枚名字被贴在光影上。', '首次创建并应用标签。', 'tag', 'tag'),
  definition('ten-in-one-group', 'organize', '十影成组', '十份光影在同一处相遇。', '同一分组拥有至少 10 个未删除素材。', 'group', 'group'),
  definition('hundred-images-scroll', 'organize', '百影成卷', '一百份光影，已经可以卷成一册。', '当前空间拥有至少 100 个未删除图片或视频。', 'asset', 'calculation'),
];

export const JOURNAL_ACHIEVEMENT_DEFINITION_BY_ID = new Map(
  JOURNAL_ACHIEVEMENT_DEFINITIONS.map((item) => [item.id, item]),
);
