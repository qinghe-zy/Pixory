/**
 * 表情语义自映射与可拓展分发引擎 (Sticker Semantic Resolver)
 *
 * 核心设计：
 * 1. 16 核心中性情绪桶与中英文别名模糊匹配；
 * 2. 动态自定义表情包注册机制 (registerCustomStickers)，支持后续第三方/导入表情包即插即用；
 * 3. 角色人设风格过滤 (styleExclude) 与加权随机抽样；
 * 4. 情绪截肢补偿映射 (Unicode Emoji Fallback)，在冷却拦截时无感补偿；
 * 5. 全局表情语义反查 (resolveStickerLabel)，供上下文装填与日记沉浸化使用。
 */

import { ANIMATED_EMOJIS, ALL_COMPANION_STICKERS } from './emojiCatalog';
import type { AnimatedEmojiItem } from './types';

export type CoreEmotionBucket =
  | 'laugh'       // 大笑
  | 'hug'         // 抱抱
  | 'blush'       // 害羞
  | 'kiss'        // 亲亲
  | 'pleading'    // 委屈
  | 'tsundere'    // 哼气
  | 'look'        // 观察
  | 'thumbsup'    // 点赞
  | 'thinking'    // 思考
  | 'surprised'   // 震惊
  | 'pat'         // 摸头
  | 'goodnight'   // 晚安
  | 'fire'        // 燃起
  | 'bomb'        // 炸毛
  | 'sleepy'      // 犯困
  | 'heartbreak'; // 心碎

export interface EmotionBucketDefinition {
  bucket: CoreEmotionBucket;
  primaryWord: string;
  aliases: string[];
  fallbackEmoji: string;
}

export const CORE_EMOTION_BUCKETS: Record<CoreEmotionBucket, EmotionBucketDefinition> = {
  laugh: {
    bucket: 'laugh',
    primaryWord: '大笑',
    aliases: ['大笑', '笑', '哈哈', '爆笑', '破涕为笑', '满地打滚', '偷笑', '笑哭', '开心', 'laugh', 'rofl', 'haha'],
    fallbackEmoji: '😄',
  },
  hug: {
    bucket: 'hug',
    primaryWord: '抱抱',
    aliases: ['抱抱', '抱', '拥抱', '抱一抱', '温暖抱抱', '抱住', '安慰', '蹭蹭', '贴贴', 'hug'],
    fallbackEmoji: '🫂',
  },
  blush: {
    bucket: 'blush',
    primaryWord: '害羞',
    aliases: ['害羞', '脸红', '不好意思', '羞涩', '害羞脸红', '羞', 'blush', 'shy'],
    fallbackEmoji: '😳',
  },
  kiss: {
    bucket: 'kiss',
    primaryWord: '亲亲',
    aliases: ['亲亲', '飞吻', '么么', '么么哒', '飞吻么么', '亲一口', '爱心', 'kiss', 'mwah'],
    fallbackEmoji: '😘',
  },
  pleading: {
    bucket: 'pleading',
    primaryWord: '委屈',
    aliases: ['委屈', '泪目', '哭哭', '难受', '嚎啕大哭', '呜呜', '可怜', 'pleading', 'sob', 'cry'],
    fallbackEmoji: '🥺',
  },
  tsundere: {
    bucket: 'tsundere',
    primaryWord: '哼气',
    aliases: ['哼气', '傲娇', '白眼', '哼', '才没有', '口嫌体正直', '无奈白眼', 'tsundere', 'eyeroll', 'hmph'],
    fallbackEmoji: '😒',
  },
  look: {
    bucket: 'look',
    primaryWord: '观察',
    aliases: ['观察', '暗中观察', '偷看', '偷瞄', '窥视', '吃瓜', '盯', 'look', 'peek', 'watch'],
    fallbackEmoji: '👀',
  },
  thumbsup: {
    bucket: 'thumbsup',
    primaryWord: '点赞',
    aliases: ['点赞', '超级点赞', '赞', '棒', '夸奖', '收到', '敬礼', '鼓掌', '合作', 'thumbsup', 'like', 'agree'],
    fallbackEmoji: '👍',
  },
  thinking: {
    bucket: 'thinking',
    primaryWord: '思考',
    aliases: ['思考', '托腮', '疑惑', '琢磨', '想想', '沉思', '托腮思考', 'thinking', 'think', 'ponder'],
    fallbackEmoji: '🤔',
  },
  surprised: {
    bucket: 'surprised',
    primaryWord: '震惊',
    aliases: ['震惊', '惊讶', '目瞪口呆', '吃惊', '卧槽', '震惊捂脸', '吓一跳', 'surprised', 'shock', 'wow'],
    fallbackEmoji: '😲',
  },
  pat: {
    bucket: 'pat',
    primaryWord: '摸头',
    aliases: ['摸头', '摸摸头', '揉头', '顺毛', '乖', '小猫', '趴趴小猫', 'pat', 'pet', 'comfort'],
    fallbackEmoji: '🐱',
  },
  goodnight: {
    bucket: 'goodnight',
    primaryWord: '晚安',
    aliases: ['晚安', '好梦', '晚安好梦', '睡了', '做个好梦', '夜安', 'goodnight', 'night'],
    fallbackEmoji: '🌙',
  },
  fire: {
    bucket: 'fire',
    primaryWord: '燃起',
    aliases: ['燃起', '冒火', '热血', '冲鸭', '干劲', '能量冒火', '庆祝', 'fire', 'party', 'hyped'],
    fallbackEmoji: '🔥',
  },
  bomb: {
    bucket: 'bomb',
    primaryWord: '炸毛',
    aliases: ['炸毛', '轰炸', '生气', '暴躁', '爆炸', '轰炸炸弹', '发火', 'bomb', 'angry', 'mad'],
    fallbackEmoji: '💣',
  },
  sleepy: {
    bucket: 'sleepy',
    primaryWord: '犯困',
    aliases: ['犯困', '困', '打瞌睡', '困困', '困倦', '想睡', '困困晚安', 'sleepy', 'drowsy', 'tired'],
    fallbackEmoji: '🥱',
  },
  heartbreak: {
    bucket: 'heartbreak',
    primaryWord: '心碎',
    aliases: ['心碎', '心碎裂开', '难过', '扎心', '破防', '伤心', 'brokenheart', 'sad', 'heartbreak'],
    fallbackEmoji: '💔',
  },
};

export interface ResolveStickerOptions {
  personaStyle?: string | null;
  excludeStickerIds?: string[];
}

export interface ResolvableStickerItem {
  id: string;
  name: string;
  animatedUri: string;
  previewUri?: string;
  packId?: string;
  width?: number;
  height?: number;
  bucket: CoreEmotionBucket;
  weight?: number;
  styleExclude?: string[];
  tags?: string[];
  keywords?: string[];
}

/**
 * 外部自定义表情包注册表（支持用户后续动态导入新表情包）
 */
const customStickersRegistry: ResolvableStickerItem[] = [];

/**
 * 注册自定义/外部导入表情包到语义映射系统
 */
export function registerCustomStickers(stickers: ResolvableStickerItem[]): void {
  for (const s of stickers) {
    const existingIdx = customStickersRegistry.findIndex((item) => item.id === s.id);
    if (existingIdx !== -1) {
      customStickersRegistry[existingIdx] = s;
    } else {
      customStickersRegistry.push(s);
    }
  }
}

/**
 * 注销指定 ID 的自定义表情
 */
export function unregisterCustomSticker(id: string): void {
  const index = customStickersRegistry.findIndex((item) => item.id === id);
  if (index !== -1) {
    customStickersRegistry.splice(index, 1);
  }
}

/**
 * 注销属于某个表情包的全部自定义表情
 */
export function unregisterPackStickers(packId: string): void {
  const remaining = customStickersRegistry.filter((item) => item.packId !== packId);
  customStickersRegistry.length = 0;
  customStickersRegistry.push(...remaining);
}

/**
 * 清除已注册的自定义表情包（用于测试或重置）
 */
export function clearCustomStickers(): void {
  customStickersRegistry.length = 0;
}

/**
 * 获取已注册的自定义表情包列表
 */
export function getRegisteredCustomStickers(): ResolvableStickerItem[] {
  return [...customStickersRegistry];
}

/**
 * 内置 35 张动态表情按情绪桶索引
 */
const BUILTIN_STICKER_BUCKET_MAP: Record<string, CoreEmotionBucket> = {
  anim_laugh: 'laugh',
  anim_rofl: 'laugh',
  anim_giggle: 'laugh',
  anim_smile: 'laugh',
  anim_hug: 'hug',
  anim_pray: 'hug',
  anim_blush: 'blush',
  anim_satisfied: 'blush',
  anim_kiss: 'kiss',
  anim_hearteyes: 'kiss',
  anim_rose: 'kiss',
  anim_pleading: 'pleading',
  anim_sob: 'pleading',
  anim_nervous: 'pleading',
  anim_eyeroll: 'tsundere',
  anim_tongueout: 'tsundere',
  anim_cool: 'tsundere',
  anim_look: 'look',
  anim_wink: 'look',
  anim_thumbsup: 'thumbsup',
  anim_clap: 'thumbsup',
  anim_salute: 'thumbsup',
  anim_fistbump: 'thumbsup',
  anim_cheers: 'thumbsup',
  anim_thinking: 'thinking',
  anim_surprised: 'surprised',
  anim_cat: 'pat',
  anim_heart: 'pat',
  anim_star: 'pat',
  anim_sleepy: 'goodnight',
  anim_fire: 'fire',
  anim_party: 'fire',
  anim_bomb: 'bomb',
  anim_brokenheart: 'heartbreak',
  anim_raisehand: 'thumbsup',
};

// O(1) 别名映射表 (js-index-maps)
const EXACT_ALIAS_MAP = new Map<string, CoreEmotionBucket>();
for (const [bucketKey, def] of Object.entries(CORE_EMOTION_BUCKETS)) {
  EXACT_ALIAS_MAP.set(def.primaryWord.toLowerCase(), bucketKey as CoreEmotionBucket);
  EXACT_ALIAS_MAP.set(bucketKey.toLowerCase(), bucketKey as CoreEmotionBucket);
  for (const a of def.aliases) {
    EXACT_ALIAS_MAP.set(a.toLowerCase(), bucketKey as CoreEmotionBucket);
  }
}

/**
 * 根据原始情绪词解析对应情绪桶
 */
export function resolveBucketFromWord(rawWord: string): CoreEmotionBucket | null {
  if (!rawWord || !rawWord.trim()) return null;
  const cleaned = rawWord.trim().toLowerCase();

  // 1. O(1) 精确别名字典匹配
  const exactMatch = EXACT_ALIAS_MAP.get(cleaned);
  if (exactMatch) return exactMatch;

  // 2. 别名包含匹配
  for (const [bucketKey, def] of Object.entries(CORE_EMOTION_BUCKETS)) {
    for (const alias of def.aliases) {
      const aliasLower = alias.toLowerCase();
      if (cleaned.includes(aliasLower) || aliasLower.includes(cleaned)) {
        return bucketKey as CoreEmotionBucket;
      }
    }
  }

  // 3. 模糊字符重叠度匹配 (Jaccard > 0.4)
  for (const [bucketKey, def] of Object.entries(CORE_EMOTION_BUCKETS)) {
    for (const alias of def.aliases) {
      if (alias.length >= 2 && cleaned.length >= 2) {
        let matchCount = 0;
        for (const ch of cleaned) {
          if (alias.includes(ch)) matchCount++;
        }
        if (matchCount >= 2 || matchCount / Math.max(alias.length, cleaned.length) >= 0.5) {
          return bucketKey as CoreEmotionBucket;
        }
      }
    }
  }

  return null;
}

/**
 * 情绪词到补偿 Unicode Emoji 的快速映射
 */
export function resolveCompensationEmoji(rawWord: string): string {
  const bucket = resolveBucketFromWord(rawWord);
  if (bucket && CORE_EMOTION_BUCKETS[bucket]) {
    return CORE_EMOTION_BUCKETS[bucket].fallbackEmoji;
  }
  return '✨';
}

/**
 * 加权随机抽取
 */
function weightedSample<T extends { weight?: number }>(items: T[]): T | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const totalWeight = items.reduce((acc, curr) => acc + (curr.weight ?? 1), 0);
  let random = Math.random() * totalWeight;

  for (const item of items) {
    const w = item.weight ?? 1;
    if (random <= w) {
      return item;
    }
    random -= w;
  }

  return items[0];
}

/**
 * 核心方法：由 AI 输出的 [STICKER: 情绪词] 动态解析为具体的贴纸资产
 * 支持内置表情与后续导入的自定义表情包自由融合
 */
export function resolveSticker(
  rawWord: string,
  options?: ResolveStickerOptions
): ResolvableStickerItem | null {
  if (!rawWord || !rawWord.trim()) return null;
  const rawClean = rawWord.trim().toLowerCase();

  // 0. 优先直接匹配自定义表情的名称或关键词 (Direct Match)
  const directCustom = customStickersRegistry.find(
    (c) => c.name.toLowerCase() === rawClean || c.keywords?.some((k) => k.toLowerCase() === rawClean)
  );
  if (directCustom && !options?.excludeStickerIds?.includes(directCustom.id)) {
    return directCustom;
  }

  const bucket = resolveBucketFromWord(rawWord);
  if (!bucket) return null;

  // 1. 汇集符合该桶的全部贴纸候选（包含内置与外部导入）
  const candidates: ResolvableStickerItem[] = [];

  // A. 遍历自定义导入库（优先匹配）
  for (const custom of customStickersRegistry) {
    if (custom.bucket === bucket) {
      if (options?.excludeStickerIds?.includes(custom.id)) continue;
      if (options?.personaStyle && custom.styleExclude?.includes(options.personaStyle)) continue;
      candidates.push({ ...custom, weight: custom.weight ?? 2 }); // 自定义表情具备更高采样权重
    }
  }

  // B. 遍历内置 35 张动态表情
  for (const builtin of ANIMATED_EMOJIS) {
    if (BUILTIN_STICKER_BUCKET_MAP[builtin.id] === bucket) {
      if (options?.excludeStickerIds?.includes(builtin.id)) continue;
      // 清冷风格过滤过度可爱/撒娇的表情
      if (
        options?.personaStyle &&
        (options.personaStyle === 'concise_cool' || options.personaStyle === 'concise') &&
        (builtin.id === 'anim_pleading' || builtin.id === 'anim_sob' || builtin.id === 'anim_tongueout')
      ) {
        continue;
      }
      candidates.push({
        id: builtin.id,
        name: builtin.name,
        animatedUri: builtin.animatedUri,
        previewUri: builtin.previewUri,
        width: builtin.width,
        height: builtin.height,
        bucket,
        weight: 1,
      });
    }
  }

  if (candidates.length === 0) return null;

  return weightedSample(candidates);
}

/**
 * 表情反查：由贴纸 ID 反查人类易懂的中文字标签
 * 供 Layer 3、Layer 5 历史装填与手账日记沉浸化生成使用
 */
export function resolveStickerLabel(
  stickerId: string | null | undefined,
  metadata?: { name?: string; label?: string } | null
): string {
  if (metadata?.name?.trim()) return metadata.name.trim();
  if (metadata?.label?.trim()) return metadata.label.trim();
  if (!stickerId) return '表情';

  // 1. 查询自定义注册库
  const custom = customStickersRegistry.find((c) => c.id === stickerId);
  if (custom?.name) return custom.name;

  // 2. 查询内置目录
  const builtin = ANIMATED_EMOJIS.find((b) => b.id === stickerId);
  if (builtin?.name) return builtin.name;

  // 3. 查询扩展伴侣贴纸目录
  const companion = ALL_COMPANION_STICKERS.find((p) => p.id === stickerId);
  if (companion?.name) return companion.name;

  // 4. 查询 bucket 默认词
  const bucket = BUILTIN_STICKER_BUCKET_MAP[stickerId];
  if (bucket && CORE_EMOTION_BUCKETS[bucket]) {
    return CORE_EMOTION_BUCKETS[bucket].primaryWord;
  }

  return '贴纸';
}

export const StickerSemanticResolver = {
  resolveSticker,
  resolveStickerLabel,
  resolveBucketFromWord,
  resolveCompensationEmoji,
  registerCustomStickers,
  unregisterCustomSticker,
  unregisterPackStickers,
  clearCustomStickers,
  getRegisteredCustomStickers,
};
