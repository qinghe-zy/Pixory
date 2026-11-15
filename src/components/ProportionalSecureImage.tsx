import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as RNImage, type StyleProp } from 'react-native';
import type { ImageProps, ImageStyle } from 'expo-image';

import {
  type ChatImageBounds,
  type ChatImageDimensions,
  computeBoundedImageDimensions,
  getCachedImageDimensions,
  rememberImageDimensions,
} from '../utils/chatImageSizing';
import { SecureImage, type SecureImageProps } from './SecureImage';

interface MeasuredImageState {
  height: number;
  uri: string;
  width: number;
}

export function useProportionalImageDimensions(
  uri: string | null | undefined,
  bounds?: ChatImageBounds,
  initialWidth?: number | null,
  initialHeight?: number | null,
): {
  dimensions: ChatImageDimensions;
  handleImageLoad: NonNullable<ImageProps['onLoad']>;
} {
  const trimmedUri = uri?.trim() ?? '';
  const [measured, setMeasured] = useState<MeasuredImageState | null>(null);

  const cached = trimmedUri ? getCachedImageDimensions(trimmedUri) : null;
  const hasValidInitial =
    typeof initialWidth === 'number' &&
    Number.isFinite(initialWidth) &&
    initialWidth > 0 &&
    typeof initialHeight === 'number' &&
    Number.isFinite(initialHeight) &&
    initialHeight > 0;

  useEffect(() => {
    if (trimmedUri && hasValidInitial) {
      rememberImageDimensions(trimmedUri, initialWidth, initialHeight);
    }
  }, [hasValidInitial, initialHeight, initialWidth, trimmedUri]);

  const knownNatural = hasValidInitial
    ? { width: initialWidth as number, height: initialHeight as number }
    : measured && measured.uri === trimmedUri
      ? { width: measured.width, height: measured.height }
      : cached;

  useEffect(() => {
    if (!trimmedUri || knownNatural) {
      return;
    }
    let cancelled = false;
    RNImage.getSize(
      trimmedUri,
      (width, height) => {
        if (width <= 0 || height <= 0) {
          return;
        }
        rememberImageDimensions(trimmedUri, width, height);
        if (!cancelled) {
          setMeasured({ height, uri: trimmedUri, width });
        }
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [knownNatural, trimmedUri]);

  const handleImageLoad = useCallback<NonNullable<ImageProps['onLoad']>>(
    (event) => {
      const width = event.source?.width;
      const height = event.source?.height;
      if (!trimmedUri || !width || !height || width <= 0 || height <= 0) {
        return;
      }
      rememberImageDimensions(trimmedUri, width, height);
      setMeasured((current) => {
        if (
          current &&
          current.uri === trimmedUri &&
          Math.round(current.width) === Math.round(width) &&
          Math.round(current.height) === Math.round(height)
        ) {
          return current;
        }
        return { height, uri: trimmedUri, width };
      });
    },
    [trimmedUri],
  );

  const maxWidth = bounds?.maxWidth;
  const maxHeight = bounds?.maxHeight;
  const minWidth = bounds?.minWidth;
  const minHeight = bounds?.minHeight;
  const minAspectRatio = bounds?.minAspectRatio;
  const maxAspectRatio = bounds?.maxAspectRatio;
  const fallbackWidth = bounds?.fallbackWidth;
  const fallbackHeight = bounds?.fallbackHeight;

  const dimensions = useMemo(
    () =>
      computeBoundedImageDimensions(knownNatural?.width, knownNatural?.height, {
        fallbackHeight,
        fallbackWidth,
        maxAspectRatio,
        maxHeight,
        maxWidth,
        minAspectRatio,
        minHeight,
        minWidth,
      }),
    [
      fallbackHeight,
      fallbackWidth,
      knownNatural?.height,
      knownNatural?.width,
      maxAspectRatio,
      maxHeight,
      maxWidth,
      minAspectRatio,
      minHeight,
      minWidth,
    ],
  );

  return { dimensions, handleImageLoad };
}

export interface ProportionalSecureImageProps extends SecureImageProps {
  bounds?: ChatImageBounds;
  initialHeight?: number | null;
  initialWidth?: number | null;
  style?: StyleProp<ImageStyle>;
}

export function ProportionalSecureImage({
  bounds,
  contentFit = 'cover',
  initialHeight,
  initialWidth,
  onError,
  onLoad,
  style,
  uri,
  ...rest
}: ProportionalSecureImageProps) {
  const { dimensions, handleImageLoad } = useProportionalImageDimensions(
    uri,
    bounds,
    initialWidth,
    initialHeight,
  );

  return (
    <SecureImage
      {...rest}
      contentFit={contentFit}
      onError={onError}
      onLoad={(event) => {
        handleImageLoad(event);
        onLoad?.(event);
      }}
      style={[style, { height: dimensions.height, width: dimensions.width }]}
      uri={uri}
    />
  );
}
