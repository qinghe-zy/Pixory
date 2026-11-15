import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageContentFit, type ImageProps, type ImageStyle } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { PixorySpace } from '../database';
import { colors, metrics } from '../design/tokens';

export interface SecureImageProps {
  uri: string;
  space: PixorySpace;
  accessibilityLabel?: string;
  blurRadius?: number;
  contentFit?: ImageContentFit;
  onError?: ImageProps['onError'];
  onLoad?: ImageProps['onLoad'];
  placeholder?: ImageProps['placeholder'];
  priority?: ImageProps['priority'];
  recyclingKey?: string;
  style?: StyleProp<ImageStyle>;
  transition?: ImageProps['transition'];
}

export function SecureImage({
  uri,
  space,
  accessibilityLabel,
  blurRadius,
  contentFit = 'cover',
  onError,
  onLoad,
  placeholder,
  priority,
  recyclingKey,
  style,
  transition,
}: SecureImageProps) {
  const [failedUri, setFailedUri] = React.useState<string | null>(null);
  const trimmedUri = uri?.trim() ?? '';
  const isFailed = !trimmedUri || failedUri === trimmedUri;

  if (isFailed) {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        style={[styles.fallbackContainer, style as StyleProp<ViewStyle>]}
      >
        <Ionicons color={colors.text.secondary} name="image-outline" size={metrics.iconSizeMd} />
      </View>
    );
  }

  return (
    <Image
      accessibilityLabel={accessibilityLabel}
      blurRadius={blurRadius}
      cachePolicy={space === 'personal' ? 'memory' : 'disk'}
      contentFit={contentFit}
      onError={(event) => {
        setFailedUri(trimmedUri);
        onError?.(event);
      }}
      onLoad={onLoad}
      placeholder={placeholder}
      priority={priority}
      recyclingKey={recyclingKey}
      source={{ uri: trimmedUri }}
      style={style}
      transition={transition}
    />
  );
}

const styles = StyleSheet.create({
  fallbackContainer: {
    alignItems: 'center',
    backgroundColor: colors.background.soft,
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

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
