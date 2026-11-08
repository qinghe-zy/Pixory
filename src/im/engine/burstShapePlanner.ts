/**
 * 伴侣回复形态规划器 (BurstShapePlanner)
 * 纯函数计算，彻底打破"每次两三条"的机械套路，实现极具真人随性感的多样化气泡形态
 */

export type BurstShape =
  | 'one_liner'               // 极简单句 (秒接、反问、吐槽、拟声词)
  | 'two'                     // 经典双句 (接情绪 + 接话题)
  | 'rapid_3_5'               // 连环短句 (兴奋、长篇分享、连珠炮)
  | 'long_para'               // 完整一段长话 (认真倾诉、讲故事、细腻情绪)
  | 'send_then_afterthought'; // 先发一两条，稍后再补一句

export interface BurstShapePlannerInput {
  userTextLength: number;
  hourOfDay: number;
  load?: 'free' | 'occupied' | 'sleeping';
  engagement?: 'hot' | 'normal' | 'cold';
  recentShapes?: BurstShape[];
  rng?: () => number;
}

export interface BurstShapePlanResult {
  shape: BurstShape;
  hint: string;
}

const DEFAULT_WEIGHTS: Record<BurstShape, number> = {
  one_liner: 35,
  two: 35,
  rapid_3_5: 20,
  long_para: 10,
  send_then_afterthought: 0,
};

const SHAPE_HINTS: Record<BurstShape, string> = {
  one_liner: '【气泡形态倾向】本轮适合发 1 个精炼利落的短气泡（可以是一个拟声词、一句短吐槽或顺口回应，随性自然）。',
  two: '【气泡形态倾向】本轮适合发 2 个自然短气泡（用 [BR] 切分，保持自然利落的聊天节奏）。',
  rapid_3_5: '【气泡形态倾向】本轮情绪较活泼或有连续想法，可发 3~4 个短促气泡（每句 5~15 字，像真人聊天一样断断续续发出来）。',
  long_para: '【气泡形态倾向】本轮适合发 1 个完整且连贯的长气泡或段落（认真回应对方的心事或展开讲述，不再用 [BR] 细碎打散）。',
  send_then_afterthought: '【气泡形态倾向】本轮适合发 1~2 个自然短气泡收住。',
};

/**
 * 纯函数：根据上下文状态动态规划本轮回复形态
 */
export function planBurstShape(input: BurstShapePlannerInput): BurstShapePlanResult {
  const rng = input.rng || Math.random;
  const weights: Record<BurstShape, number> = { ...DEFAULT_WEIGHTS };

  // 1. 用户输入极短（<= 4 字，如“嗯”、“哈哈”、“好呀”）
  if (input.userTextLength <= 4) {
    weights.one_liner += 25;
    weights.two += 10;
    weights.rapid_3_5 = Math.max(5, weights.rapid_3_5 - 10);
    weights.long_para = 2; // 短回复几乎不发大段长文
  } else if (input.userTextLength > 80) {
    // 2. 用户长段倾诉
    weights.long_para += 25;
    weights.rapid_3_5 += 15;
    weights.one_liner = Math.max(5, weights.one_liner - 15);
  }

  // 3. 时段偏置：深夜（23:00 ~ 07:00）更倾向简短，少连发
  if (input.hourOfDay >= 23 || input.hourOfDay < 7) {
    weights.one_liner += 20;
    weights.two += 10;
    weights.rapid_3_5 = Math.max(3, weights.rapid_3_5 - 15);
  }

  // 4. 伴侣状态偏置：忙碌或外出时回复偏短
  if (input.load === 'occupied') {
    weights.one_liner += 30;
    weights.two += 10;
    weights.rapid_3_5 = 2;
    weights.long_para = 1;
  } else if (input.load === 'sleeping') {
    weights.one_liner += 40;
    weights.two = 5;
    weights.rapid_3_5 = 0;
    weights.long_para = 0;
  }

  // 5. 互动热度偏置
  if (input.engagement === 'hot') {
    weights.rapid_3_5 += 20;
    weights.two += 10;
  } else if (input.engagement === 'cold') {
    weights.one_liner += 15;
  }

  // 6. 防重复：对最近 2 轮已用过的形态降权，严格杜绝连续 3 轮同形态
  const recent = input.recentShapes || [];
  if (recent.length >= 1) {
    const last1 = recent[recent.length - 1];
    weights[last1] = Math.max(1, Math.round(weights[last1] * 0.3));
  }
  if (recent.length >= 2) {
    const last2 = recent[recent.length - 2];
    weights[last2] = Math.max(1, Math.round(weights[last2] * 0.4));
    // 如果最后两轮形态完全一致，强行将该形态权重置零
    if (recent[recent.length - 1] === last2) {
      weights[last2] = 0;
    }
  }

  // 轮盘赌抽样
  const entries = Object.entries(weights) as [BurstShape, number][];
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  if (totalWeight <= 0) {
    return { shape: 'two', hint: SHAPE_HINTS.two };
  }

  let threshold = rng() * totalWeight;
  let chosenShape: BurstShape = 'two';

  for (const [shape, weight] of entries) {
    if (threshold <= weight) {
      chosenShape = shape;
      break;
    }
    threshold -= weight;
  }

  return {
    shape: chosenShape,
    hint: SHAPE_HINTS[chosenShape] || SHAPE_HINTS.two,
  };
}
