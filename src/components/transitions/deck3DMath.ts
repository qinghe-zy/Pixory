/**
 * deck3DMath.ts — 3D卡牌长廊 / Cover Flow 数学模型与纯函数计算
 */

export interface RadialOrbitItem {
  id: string;
  name: string;
  avatarUri?: string | null;
  avatarEnabled?: boolean;
  description?: string | null;
  tags?: string[];
  themeColor?: string;
  prompt?: string;
  firstMessage?: string | null;
}

export interface GridAnchor {
  offsetX: number; // 卡片在瀑布流中的中心点相对屏幕中心 Xc 的偏移: gridCenterX - Xc
  offsetY: number; // 卡片在瀑布流中的中心点相对屏幕中心 Yc 的偏移: gridCenterY - Yc
  scale: number;   // 瀑布流卡片宽度与 3D 长廊基准卡片宽度之比: gridWidth / deckCardWidth
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// 3D 长廊卡片基准物理尺寸 (9:14 经典典藏卡比例)
export const DECK_CARD_WIDTH = 190;
export const DECK_CARD_HEIGHT = 276;

/**
 * 动态黄金体量尺寸计算函数 (W * 0.56 典藏卡 1:1.42 比例，确保五卡同屏入镜无截断)
 */
export function getDeckCardDimensions(W: number) {
  'worklet';
  const width = Math.round(W * 0.56);
  const height = Math.round(width * 1.42);
  return { width, height };
}

/**
 * 文本深度净化工具
 * 过滤底线指令、模型代号、前缀 Prompt 等，保持对外显示纯净
 */
export function cleanPromptSnippet(raw: string): string {
  if (!raw) return '';
  let str = raw
    .replace(/\[IGNORE ALL PREVIOUS CONTENT[^\]]*\]/gi, '')
    .replace(/\*\*Plot \/ Creator's Note:\*\*/gi, '')
    .trim();
  str = str
    .replace(/^(you are now|you are an?|act as|ignore all|system prompt|system:|persona:|rules:|model-[0-9a-z_-]*|instruction:)[^.,\n]*[.,\n]?/gi, '')
    .replace(/^(你现在是|你的设定是|系统设定[：:]|角色设定[：:])[^，。\n]*[，。\n]?/g, '')
    .replace(/^([A-Za-z0-9_-]+:)/, '')
    .replace(/Persona:|Rules:|System:/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  return str.replace(/\s+/g, ' ').trim();
}

function lerpWorklet(a: number, b: number, t: number) {
  'worklet';
  return a + (b - a) * t;
}

function interpolatePiecewise(v: number, inPts: number[], outPts: number[]) {
  'worklet';
  if (v <= inPts[0]) return outPts[0];
  const last = inPts.length - 1;
  if (v >= inPts[last]) return outPts[last];
  for (let i = 0; i < last; i++) {
    if (v >= inPts[i] && v <= inPts[i + 1]) {
      const t = (v - inPts[i]) / (inPts[i + 1] - inPts[i]);
      return lerpWorklet(outPts[i], outPts[i + 1], t);
    }
  }
  return outPts[last];
}

/**
 * 终极版全阶段 Worklet 计算函数 (v6.1 光学与透视校准版)
 * - p1: 0 (瀑布流网格) -> 1 (3D Deck 立体长廊)
 * - p2: 0 (3D Deck 立体长廊) -> 1 (全屏角色详情)
 * - 强 3D 透视镜头：perspective: 580 锁定首位，五卡同屏三阶纵深姿态
 */
export function computeCard3DStyle(
  k: number,          // 当前槽位连续偏移: index - activeIndex
  p1: number,         // 阶段1进度 (0: 瀑布流, 1: 3D Deck 长廊)
  p2: number,         // 阶段2进度 (0: 3D Deck 长廊, 1: 全屏角色详情)
  W: number,          // 屏幕宽度
  anchor: GridAnchor  // 该卡片在瀑布流中的测量锚点（屏幕外卡片传入底部合成兜底值）
) {
  'worklet';
  const absK = Math.abs(k);
  const minK1 = Math.min(absK, 1);
  const signK = k < 0 ? -1 : (k > 0 ? 1 : 0);
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  // 二阶段展平衰减因子：进入全屏详情页(p2 -> 1)时，3D 倾角与厚度平滑归零
  const deckFactor = p1 * (1 - p2);

  // (1) 空间三阶位姿：五卡同屏 (-2, -1, 0, +1, +2) 黄金体量与间距
  // |k|=0: 0, |k|=1: W*0.20, |k|=2: W*0.33, |k|=3: W*0.44
  const baseDeckX = interpolatePiecewise(absK, [0, 1, 2, 3], [0, W * 0.20, W * 0.33, W * 0.44]);
  const deckX = signK * baseDeckX * (1 + 0.35 * p2);

  // |k|=0: -10, |k|=1: 12, |k|=2: 26, |k|=3: 38
  const baseDeckY = interpolatePiecewise(absK, [0, 1, 2, 3], [-10, 12, 26, 38]);
  const deckY = baseDeckY * (1 - p2);

  const translateX = (1 - p1) * anchor.offsetX + p1 * deckX;
  const translateY = (1 - p1) * anchor.offsetY + p1 * deckY;
  const rotateZ = deckFactor * clamp(1.8 * k, -5, 5);
  const zIndex = 1000 - Math.round(absK * 100);

  // (2) 3D 透视角度：三阶侧立折角曲线 |k|=0(0°), |k|=1(32°), |k|=2(44°), |k|=3(48°)
  // 左卡(k<0)为+角度向内侧立，右卡(k>0)为-角度向内侧立
  const baseRotateY = interpolatePiecewise(absK, [0, 1, 2, 3], [0, 32, 44, 48]);
  const rotateY = -deckFactor * signK * baseRotateY;
  const rotateX = deckFactor * (3.5 - 1.5 * Math.exp(-k * k));

  // 缩放与压暗：|k|=0(1.0), |k|=1(0.82), |k|=2(0.68), |k|=3(0.56)
  const baseScale = interpolatePiecewise(absK, [0, 1, 2, 3], [1.0, 0.82, 0.68, 0.56]);
  const scale = (1 - p1) * anchor.scale + p1 * baseScale;

  // 实心景深暗化曲线：|k|=0(0), |k|=1(0.45), |k|=2(0.72), |k|=3(0.88)
  const darkOverlayOpacity = deckFactor * interpolatePiecewise(absK, [0, 1, 2, 3], [0, 0.45, 0.72, 0.88]);

  // 外侧卡片在进入全屏详情页(p2 -> 1)时平滑隐退 (使用连续函数，严禁三元突变)
  const sideFadeOut = p2 * minK1;
  const cardOpacity = clamp(1.0 - p1 * clamp(absK - 2.8, 0, 1) - sideFadeOut, 0, 1);

  // (3) 实体厚度衬底与阴影（固定 shadowRadius: 24 防离屏渲染掉帧）
  const extrudeDX = -deckFactor * 3.5 * clamp(k, -1, 1);
  const extrudeDY = deckFactor * (3.0 - 1.0 * minK1);
  const shadowOffsetX = deckFactor * 10 * clamp(k, -2, 2);
  const shadowOffsetY = deckFactor * (20 - 4 * Math.min(absK, 3));
  const shadowOpacity = deckFactor * (0.72 - 0.12 * Math.min(absK, 3));
  const bevelOpacity = clamp(1.0 - p2, 0, 1);

  return {
    cardStyle: {
      zIndex,
      opacity: cardOpacity,
      transform: [
        { perspective: 580 },
        { translateX },
        { translateY },
        { rotateX: `${rotateX}deg` },
        { rotateY: `${rotateY}deg` },
        { rotateZ: `${rotateZ}deg` },
        { scale },
      ],
      shadowOffset: { width: shadowOffsetX, height: shadowOffsetY },
      shadowRadius: 24, // 固定常量，杜绝 CoreAnimation 逐帧重算高斯模糊
      shadowOpacity,
    },
    extrudeCoreTransform: [{ translateX: extrudeDX }, { translateY: extrudeDY }],
    darkOverlayOpacity,
    bevelOpacity,
  };
}
