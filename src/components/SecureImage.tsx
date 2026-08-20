import { Image, type ImageContentFit, type ImageProps, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

import type { PixorySpace } from '../database';

interface SecureImageProps {
  uri: string;
  space: PixorySpace;
  blurRadius?: number;
  contentFit?: ImageContentFit;
  placeholder?: ImageProps['placeholder'];
  priority?: ImageProps['priority'];
  recyclingKey?: string;
  style?: StyleProp<ImageStyle>;
  transition?: ImageProps['transition'];
}

export function SecureImage({
  uri,
  space,
  blurRadius,
  contentFit = 'cover',
  placeholder,
  priority,
  recyclingKey,
  style,
  transition,
}: SecureImageProps) {
  return (
    <Image
      blurRadius={blurRadius}
      cachePolicy={space === 'personal' ? 'memory' : 'disk'}
      contentFit={contentFit}
      placeholder={placeholder}
      priority={priority}
      recyclingKey={recyclingKey}
      source={{ uri }}
      style={style}
      transition={transition}
    />
  );
}

export async function clearPersonalImageCache(): Promise<void> {
  const results = await Promise.allSettled([Image.clearMemoryCache()]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.warn('Pixory personal image cache clear failed.', {
        message: result.reason instanceof Error ? result.reason.message : 'unknown cache clear error',
      });
    }
  }
}
