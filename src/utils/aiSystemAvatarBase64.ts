import type { ImageSourcePropType } from 'react-native';

/**
 * 像素管家系统预设头像引用（已由 44KB Base64 迁移为原生静态资源，杜绝常驻 JS 堆内存）
 */
export const AI_SYSTEM_AVATAR: ImageSourcePropType = require('../../assets/ai_system_avatar.png');

/**
 * @deprecated 请直接使用原生资产 AI_SYSTEM_AVATAR，避免将 Base64 驻留在 JS 内存
 */
export const AI_SYSTEM_AVATAR_B64 = '';
