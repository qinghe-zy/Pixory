/**
 * 独立解耦表情系统资产目录与元数据 (Emoji Catalog & Registry)
 *
 * 规格：
 * 1. 35 个高频 3D 动态大表情（5 行 × 7 列，严控总体积在 5MB 预算内）；
 * 2. 105 个精选静态高频 Emoji（15 行 × 7 列，支持光标插入与图文混排）；
 * 3. 77 个精选高频颜文字（11 行 × 7 列，满足“最起码 70 个”要求）；
 * 4. 统一黑白线框 Tab 导航定义（无文字）。
 */

import type { AnimatedEmojiItem, StaticEmojiItem, KaomojiItem, EmojiTabItem } from './types';

const FLUENT_ANIM_BASE = 'https://cdn.jsdelivr.net/gh/Tarikul-Islam-Anik/Animated-Fluent-Emojis@master/Emojis';

function makeAnimatedEmoji(id: string, name: string, pathSegment: string): AnimatedEmojiItem {
  return {
    id: `anim_${id}`,
    type: 'animated',
    name,
    previewText: `[${name}]`,
    animatedUri: `${FLUENT_ANIM_BASE}/${pathSegment}`,
    width: 140,
    height: 140,
    category: 'face',
  };
}

/**
 * 35 个顶级高频 3D 微动效表情 (5 行 × 7 列，60fps 真实动效)
 */
export const ANIMATED_EMOJIS: AnimatedEmojiItem[] = [
  // Row 1: 爆笑与互动 (7)
  makeAnimatedEmoji('laugh', '破涕为笑', 'Smilies/Face%20with%20Tears%20of%20Joy.png'),
  makeAnimatedEmoji('rofl', '满地打滚', 'Smilies/Rolling%20on%20the%20Floor%20Laughing.png'),
  makeAnimatedEmoji('kiss', '飞吻么么', 'Smilies/Face%20Blowing%20a%20Kiss.png'),
  makeAnimatedEmoji('hearteyes', '双眼爱心', 'Smilies/Smiling%20Face%20with%20Heart-Eyes.png'),
  makeAnimatedEmoji('giggle', '捂嘴偷笑', 'Smilies/Face%20with%20Hand%20Over%20Mouth.png'),
  makeAnimatedEmoji('smile', '治愈微笑', 'Smilies/Grinning%20Face%20with%20Smiling%20Eyes.png'),
  makeAnimatedEmoji('thumbsup', '超级点赞', 'Hand%20gestures/Thumbs%20Up.png'),

  // Row 2: 深情与委屈 (7)
  makeAnimatedEmoji('pray', '双手合十', 'Hand%20gestures/Folded%20Hands.png'),
  makeAnimatedEmoji('heart', '小心心跳', 'Smilies/Beating%20Heart.png'),
  makeAnimatedEmoji('hug', '温暖抱抱', 'Smilies/Hugging%20Face.png'),
  makeAnimatedEmoji('pleading', '委屈泪目', 'Smilies/Face%20Holding%20Back%20Tears.png'),
  makeAnimatedEmoji('sob', '嚎啕大哭', 'Smilies/Loudly%20Crying%20Face.png'),
  makeAnimatedEmoji('surprised', '震惊捂脸', 'Smilies/Astonished%20Face.png'),
  makeAnimatedEmoji('thinking', '托腮思考', 'Smilies/Thinking%20Face.png'),

  // Row 3: 派对与酷感 (7)
  makeAnimatedEmoji('party', '撒花庆祝', 'Smilies/Partying%20Face.png'),
  makeAnimatedEmoji('cool', '酷帅墨镜', 'Smilies/Smiling%20Face%20with%20Sunglasses.png'),
  makeAnimatedEmoji('eyeroll', '无奈白眼', 'Smilies/Face%20with%20Rolling%20Eyes.png'),
  makeAnimatedEmoji('sleepy', '困困晚安', 'Smilies/Sleeping%20Face.png'),
  makeAnimatedEmoji('blush', '害羞脸红', 'Smilies/Smiling%20Face%20with%20Hearts.png'),
  makeAnimatedEmoji('fire', '能量冒火', 'Smilies/Heart%20on%20Fire.png'),
  makeAnimatedEmoji('bomb', '轰炸炸弹', 'Smilies/Exploding%20Head.png'),

  // Row 4: 生动神态 (7)
  makeAnimatedEmoji('tongueout', '吐舌搞怪', 'Smilies/Winking%20Face%20with%20Tongue.png'),
  makeAnimatedEmoji('satisfied', '闭眼满足', 'Smilies/Relieved%20Face.png'),
  makeAnimatedEmoji('wink', '调皮眨眼', 'Smilies/Winking%20Face.png'),
  makeAnimatedEmoji('brokenheart', '心碎裂开', 'Smilies/Broken%20Heart.png'),
  makeAnimatedEmoji('clap', '欢呼鼓掌', 'Hand%20gestures/Clapping%20Hands.png'),
  makeAnimatedEmoji('salute', '敬礼收到', 'Smilies/Saluting%20Face.png'),
  makeAnimatedEmoji('nervous', '紧张汗颜', 'Smilies/Anxious%20Face%20with%20Sweat.png'),

  // Row 5: 陪伴萌态 (7)
  makeAnimatedEmoji('cat', '趴趴小猫', 'Animals/Cat%20Face.png'),
  makeAnimatedEmoji('raisehand', '举手打卡', 'Hand%20gestures/Raising%20Hands.png'),
  makeAnimatedEmoji('fistbump', '碰拳合作', 'Hand%20gestures/Oncoming%20Fist.png'),
  makeAnimatedEmoji('cheers', '干杯喝彩', 'Food/Clinking%20Beer%20Mugs.png'),
  makeAnimatedEmoji('rose', '送你鲜花', 'Smilies/Heart%20with%20Ribbon.png'),
  makeAnimatedEmoji('look', '暗中观察', 'Smilies/Face%20with%20Peeking%20Eye.png'),
  makeAnimatedEmoji('star', '星星期待', 'Smilies/Star-Struck.png'),
];

/**
 * 105 个精选静态高频 Emoji (15 行 × 7 列)
 */
export const STATIC_EMOJI_CHARS: string[] = [
  // Row 1: 喜悦开心
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣',
  // Row 2: 欢笑与天使
  '😂', '🙂', '🙃', '🫠', '😉', '😊', '😇',
  // Row 3: 喜爱与崇拜
  '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
  // Row 4: 调皮与搞怪
  '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗',
  // Row 5: 思考与窥视
  '🤭', '🫢', '🫣', '🤫', '🤔', '🫡', '🤐',
  // Row 6: 怀疑与轻视
  '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
  // Row 7: 无奈与叹息
  '😬', '😮‍💨', '🤥', '🫥', '😌', '😔', '😪',
  // Row 8: 困倦与生病
  '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
  // Row 9: 极端感受
  '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠',
  // Row 10: 派对与墨镜
  '🥳', '🥸', '😎', '🤓', '🧐', '😕', '🫤',
  // Row 11: 难过与委屈
  '🥺', '🥹', '😢', '😭', '😤', '😠', '😡',
  // Row 12: 惊恐与汗颜
  '🤬', '😱', '😨', '😰', '😥', '😓', '🫣',
  // Row 13: 经典手势互动
  '👍', '👎', '👊', '✊', '🤛', '🤜', '👏',
  // Row 14: 拥抱祈祷合十
  '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✌️',
  // Row 15: 心意与氛围
  '❤️', '💖', '💗', '💓', '💘', '🔥', '✨',
];

export const STATIC_EMOJIS: StaticEmojiItem[] = STATIC_EMOJI_CHARS.map((char, index) => ({
  id: `static_${index}_${char}`,
  type: 'static',
  name: char,
  char,
  previewText: char,
}));

/**
 * 77 个精选高频颜文字 (11 行 × 7 列，满足“最起码 70 个”要求)
 */
export const KAOMOJI_CHARS: string[] = [
  // Row 1: 喜悦打招呼 (7)
  '(≧▽≦)', '(｡•́︿•̀｡)', '(*/ω＼*)', '(づ｡◕‿‿◕｡)づ', 'ヾ(•ω•`)o', '(ง •_•)ง', '(oﾟvﾟ)ノ',
  // Row 2: 萌趣欢呼 (7)
  'φ(゜▽゜*)♪', '(¯﹃¯)', '(╯‵□′)╯︵┻━┻', 'o(≧口≦)o', '(●\'◡\'●)', '(๑•̀ㅂ•́)و✧', '(。・ω・。)',
  // Row 3: 害羞与亲亲 (7)
  '(*￣3￣)╭', '(ノへ￣、)', '(*/∇＼*)', '(•_•)', '(•ˋ _ ˊ•)', 'ヘ( ^o^)ノ', '(￣y▽,￣)╭',
  // Row 4: 委屈与无语 (7)
  '＼(ﾟｰﾟ＼)', '(o_ _)ﾉ', 'ヽ(✿ﾟ▽ﾟ)ノ', '(T_T)', '(；′⌒`)', 'o((>ω< ))o', '凸(艹皿艹 )',
  // Row 5: 浪漫撒娇 (7)
  '(´▽`ʃ♡ƪ)', '(✿◡‿◡)', '(っ °Д °;)っ', 'ヾ(≧▽≦*)o', '(┬┬﹏┬┬)', '( ‵▽′)ψ', 'ԅ(¯﹃¯ԅ)',
  // Row 6: 加油与无奈 (7)
  '(ง •̀_•́)ง', '┑(￣Д ￣)┍', '(；一_一)', '(⊙_⊙)?', '(～￣▽￣)～', '(〃\'▽\'〃)', '(っ˘зʕ•̫͡•ʔ',
  // Row 7: 惊讶与困倦 (7)
  '╰(*°▽°*)╯', '(//∇//)', '(*^▽^*)', '(´•̥̥̥ω•̥̥̥`)', '(*/_＼)', '(｡♥‿♥｡)', '(￣o￣) . z Z',
  // Row 8: 卖萌与挥手 (7)
  '(。_。)', '(๑•̀ㅁ•́ฅ)', '(´･ω･`)', '(ง\'-\')ง', '╰(￣ω￣o)', 'ヾ(￣▽￣)Bye~', '(≧﹏ ≦)',
  // Row 9: 呆萌与叹息 (7)
  '(´・ω・｀)', '(´-ω-`)', '( *︾▽︾)', 'ヾ(≧へ≦)〃', '︿(￣︶￣)︿', '(⊙o⊙)', '(o_ _)o',
  // Row 10: 思考与互动 (7)
  '(๑•́ ₃ •̀๑)', 'ヽ(￣ω￣(￣ω￣〃)ゝ', '(*´∇｀*)', '(¬_¬ )', '(｡･∀･)ﾉﾞ', '(╯°Д°)╯', '( *¯ ³¯*)♡',
  // Row 11: 治愈安抚 (7)
  '(*ฅ́˘ฅ̀*)', '( ๑´•ω•) (・ω・｀)', 'ε٩(๑> ₃ <)۶з', '(*•̀ᴗ•́*)و ̑̑', '(o゜▽゜)o☆', '( Ĭ ^ Ĭ )', '(◕‿◕✿)',
];

export const KAOMOJIS: KaomojiItem[] = KAOMOJI_CHARS.map((text, index) => ({
  id: `kaomoji_${index}`,
  type: 'kaomoji',
  name: text,
  text,
  previewText: text,
}));

function makeCompanionSticker(
  id: string,
  name: string,
  pathSegment: string,
  category: 'animal' | 'prop' | 'gesture',
  emotionBucket?: string
): AnimatedEmojiItem {
  return {
    id: `companion_${id}`,
    type: 'animated',
    name,
    previewText: `[${name}]`,
    animatedUri: `${FLUENT_ANIM_BASE}/${pathSegment}`,
    width: 140,
    height: 140,
    category,
    emotionBucket,
  };
}

/**
 * 治愈萌宠与生灵精选 (5 款高频微动效贴纸)
 */
export const COMPANION_PET_STICKERS: AnimatedEmojiItem[] = [
  makeCompanionSticker('cat_face', '歪头猫咪', 'Animals/Cat%20Face.png', 'animal', 'look'),
  makeCompanionSticker('dog_face', '呆萌修狗', 'Animals/Dog%20Face.png', 'animal', 'pat'),
  makeCompanionSticker('hamster', '鼓腮仓鼠', 'Animals/Hamster.png', 'animal', 'sleepy'),
  makeCompanionSticker('rabbit', '垂耳兔兔', 'Animals/Rabbit%20Face.png', 'animal', 'blush'),
  makeCompanionSticker('panda', '打滚熊猫', 'Animals/Panda.png', 'animal', 'hug'),
];

/**
 * 烟火气生活与陪伴道具精选 (5 款高频微动效贴纸)
 */
export const COMPANION_PROP_STICKERS: AnimatedEmojiItem[] = [
  makeCompanionSticker('bubble_tea', '珍珠奶茶', 'Food/Bubble%20Tea.png', 'prop', 'pat'),
  makeCompanionSticker('hot_beverage', '暖暖热饮', 'Food/Hot%20Beverage.png', 'prop', 'pat'),
  makeCompanionSticker('cake', '生日蛋糕', 'Food/Birthday%20Cake.png', 'prop', 'pat'),
  makeCompanionSticker('cheers_mugs', '干杯碰杯', 'Food/Clinking%20Beer%20Mugs.png', 'prop', 'thumbsup'),
  makeCompanionSticker('bed', '暖暖被窝', 'Objects/Bed.png', 'prop', 'goodnight'),
];

/**
 * 隔空互动与肢体手势精选 (4 款高频微动效贴纸)
 */
export const COMPANION_GESTURE_STICKERS: AnimatedEmojiItem[] = [
  makeCompanionSticker('heart_hands', '双手比心', 'Hand%20gestures/Heart%20Hands.png', 'gesture', 'kiss'),
  makeCompanionSticker('clapping', '拍手鼓掌', 'Hand%20gestures/Clapping%20Hands.png', 'gesture', 'thumbsup'),
  makeCompanionSticker('waving', '挥手打招呼', 'Hand%20gestures/Waving%20Hand.png', 'gesture', 'goodnight'),
  makeCompanionSticker('peace_sign', '胜利耶耶', 'Hand%20gestures/Victory%20Hand.png', 'gesture', 'laugh'),
];

/**
 * 内置其他精选微动效 (共 14 款 = 5 萌宠 + 5 道具 + 4 手势，整除 7 列 = 2 行)
 */
export const ALL_COMPANION_STICKERS: AnimatedEmojiItem[] = [
  ...COMPANION_PET_STICKERS,
  ...COMPANION_PROP_STICKERS,
  ...COMPANION_GESTURE_STICKERS,
];

/**
 * 全量 49 款内置超级表情 (35 小黄脸 + 14 精选其他，整除 7 列 = 7 行)
 */
export const SUPER_STICKERS: AnimatedEmojiItem[] = [
  ...ANIMATED_EMOJIS,
  ...ALL_COMPANION_STICKERS,
];

/**
 * 顶部导航 Tab 选项（严格由黑白线框图标驱动，不带文字，可扩展）
 */
export const EMOJI_TABS: EmojiTabItem[] = [
  {
    id: 'fluent_emoji',
    iconName: 'happy-outline',
    accessibilityLabel: '主菜单加经典表情',
  },
  {
    id: 'companion_stickers',
    iconName: 'emoticon-cool-outline',
    iconFamily: 'MaterialCommunityIcons',
    accessibilityLabel: '超级表情',
  },
  {
    id: 'kaomoji',
    iconName: 'chatbox-ellipses-outline',
    accessibilityLabel: '颜文字',
  },
  {
    id: 'custom_stickers',
    iconName: 'heart-outline',
    accessibilityLabel: '我的表情包',
  },
];

/**
 * 兜底初始“最近使用”（14 格，2 行 × 7 列，保证首次打开不留白）
 */
export const DEFAULT_RECENT_EMOJIS: (AnimatedEmojiItem | StaticEmojiItem)[] = [
  ANIMATED_EMOJIS[0], // 破涕为笑 (动)
  ANIMATED_EMOJIS[1], // 满地打滚 (动)
  ANIMATED_EMOJIS[2], // 飞吻么么 (动)
  ANIMATED_EMOJIS[3], // 双眼爱心 (动)
  ANIMATED_EMOJIS[6], // 超级点赞 (动)
  ANIMATED_EMOJIS[8], // 小心心 (动)
  ANIMATED_EMOJIS[10], // 委屈泪目 (动)
  STATIC_EMOJIS[0], // 😀
  STATIC_EMOJIS[6], // 🤣
  STATIC_EMOJIS[7], // 😂
  STATIC_EMOJIS[14], // 🥰
  STATIC_EMOJIS[84], // 👍
  STATIC_EMOJIS[98], // ❤️
  STATIC_EMOJIS[103], // 🔥
];
