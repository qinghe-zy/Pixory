import type { ImageSourcePropType } from 'react-native';
import type { DiaryThemeKey } from './types';

export interface ImDiaryAssetPair {
  card: ImageSourcePropType;
  letter: ImageSourcePropType;
  name: string;
}

/**
 * 伴侣日记 5 款经典信纸资产映射表
 * 严格复用原生素材库，保持 src/im 领域 100% 物理隔离
 */
export const imDiaryThemeAssets: Record<DiaryThemeKey, ImDiaryAssetPair> = {
  sage: {
    card: require('../../../assets/backgrounds/diary/diary-sage-botanical.png'),
    letter: require('../../../assets/backgrounds/diary-letter/diary-letter-sage-botanical.jpg'),
    name: '草木绿',
  },
  rainwater: {
    card: require('../../../assets/backgrounds/diary/diary-rainwater-blue.png'),
    letter: require('../../../assets/backgrounds/diary-letter/diary-letter-rainwater-blue.jpg'),
    name: '雨水蓝',
  },
  rose: {
    card: require('../../../assets/backgrounds/diary/diary-pressed-rose.png'),
    letter: require('../../../assets/backgrounds/diary-letter/diary-letter-pressed-rose.jpg'),
    name: '粉蔷薇',
  },
  lavender: {
    card: require('../../../assets/backgrounds/diary/diary-lavender-vellum.png'),
    letter: require('../../../assets/backgrounds/diary-letter/diary-letter-lavender-vellum.jpg'),
    name: '薰衣草紫',
  },
  celadon: {
    card: require('../../../assets/backgrounds/diary/diary-celadon-ink.png'),
    letter: require('../../../assets/backgrounds/diary-letter/diary-letter-celadon-ink.jpg'),
    name: '青瓷墨',
  },
};
