import type { ImageSourcePropType } from 'react-native';

import type { DiaryThemeKey } from './diaryTypes';

export interface DiaryThemeAssetPair {
  card: ImageSourcePropType;
  letter: ImageSourcePropType;
}

export const diaryThemeAssets: Record<DiaryThemeKey, DiaryThemeAssetPair> = {
  sage: {
    card: require('../../../assets/backgrounds/diary/diary-sage-botanical.png'),
    letter: require('../../../assets/backgrounds/diary-letter/diary-letter-sage-botanical.jpg'),
  },
  rainwater: {
    card: require('../../../assets/backgrounds/diary/diary-rainwater-blue.png'),
    letter: require('../../../assets/backgrounds/diary-letter/diary-letter-rainwater-blue.jpg'),
  },
  rose: {
    card: require('../../../assets/backgrounds/diary/diary-pressed-rose.png'),
    letter: require('../../../assets/backgrounds/diary-letter/diary-letter-pressed-rose.jpg'),
  },
  lavender: {
    card: require('../../../assets/backgrounds/diary/diary-lavender-vellum.png'),
    letter: require('../../../assets/backgrounds/diary-letter/diary-letter-lavender-vellum.jpg'),
  },
  celadon: {
    card: require('../../../assets/backgrounds/diary/diary-celadon-ink.png'),
    letter: require('../../../assets/backgrounds/diary-letter/diary-letter-celadon-ink.jpg'),
  },
};
