import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

import type { PixorySpace } from '../database';

interface SecureImageProps {
  uri: string;
  space: PixorySpace;
  blurRadius?: number;
  contentFit?: ImageContentFit;
  style?: StyleProp<ImageStyle>;
}

export function SecureImage({ uri, space, blurRadius, contentFit = 'cover', style }: SecureImageProps) {
  return (
    <Image
      blurRadius={blurRadius}
      cachePolicy={space === 'personal' ? 'none' : 'disk'}
      contentFit={contentFit}
      source={{ uri }}
      style={style}
    />
  );
}

export async function clearPersonalImageCache(): Promise<void> {
  const results = await Promise.allSettled([
    Image.clearMemoryCache(),
    Image.clearDiskCache(),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Pixory personal image cache clear failed.', {
        message: result.reason instanceof Error ? result.reason.message : 'unknown cache clear error',
      });
    }
  }
}
