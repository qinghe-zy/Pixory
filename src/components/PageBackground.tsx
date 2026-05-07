import type { ReactNode } from 'react';
import { Image, StyleSheet, useWindowDimensions, View, type ImageStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  pageBackgroundImages,
  pageBackgroundVariants,
  type PageBackgroundElementRecipe,
  type PageBackgroundVariant,
} from '../design/backgrounds';
import { colors } from '../design/tokens';

const BACKGROUND_IMAGE_ASPECT_RATIO = 1080 / 2400;

interface PageBackgroundProps {
  children: ReactNode;
  variant?: PageBackgroundVariant;
  backgroundColor?: string;
  dimmed?: boolean;
}

export function PageBackground({
  children,
  variant,
  backgroundColor = colors.background.page,
  dimmed = false,
}: PageBackgroundProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const backgroundImage = variant ? pageBackgroundImages[variant as keyof typeof pageBackgroundImages] : undefined;
  const recipe = variant && !backgroundImage ? pageBackgroundVariants[variant] : [];

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {backgroundImage ? (
          <Image
            resizeMode="contain"
            source={backgroundImage}
            style={[buildBackgroundImageStyle(width, height), dimmed && styles.dimmed]}
          />
        ) : null}
        {recipe.map((element, index) => (
          <Image
            key={`${variant}-${index}`}
            resizeMode="contain"
            source={element.source}
            style={buildElementStyle(element, width, height, insets.bottom, dimmed)}
          />
        ))}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function buildBackgroundImageStyle(screenWidth: number, screenHeight: number): ImageStyle {
  const screenAspectRatio = screenWidth / screenHeight;
  const useHeight = screenAspectRatio > BACKGROUND_IMAGE_ASPECT_RATIO;
  const imageHeight = useHeight ? screenHeight : screenWidth / BACKGROUND_IMAGE_ASPECT_RATIO;
  const imageWidth = useHeight ? screenHeight * BACKGROUND_IMAGE_ASPECT_RATIO : screenWidth;

  return {
    height: imageHeight,
    left: (screenWidth - imageWidth) / 2,
    position: 'absolute',
    top: (screenHeight - imageHeight) / 2,
    width: imageWidth,
  };
}

function buildElementStyle(
  element: PageBackgroundElementRecipe,
  screenWidth: number,
  screenHeight: number,
  bottomInset: number,
  dimmed: boolean,
): ImageStyle {
  const elementWidth = Math.round(screenWidth * element.widthRatio);
  const elementHeight = Math.round(elementWidth / element.aspectRatio);
  const style: ImageStyle = {
    height: elementHeight,
    opacity: (element.opacity ?? 1) * (dimmed ? 0.68 : 1),
    position: 'absolute',
    width: elementWidth,
  };

  if (element.anchorX === 'left') {
    style.left = screenWidth * element.offsetXRatio;
  } else {
    style.right = screenWidth * element.offsetXRatio;
  }

  if (element.anchorY === 'top') {
    style.top = screenHeight * element.offsetYRatio;
  } else if (element.anchorY === 'bottom') {
    style.bottom = bottomInset + screenHeight * element.offsetYRatio;
  } else {
    style.top = screenHeight * 0.5 - elementHeight * 0.5 + screenHeight * element.offsetYRatio;
  }

  const transform: Array<{ rotate: string } | { scaleX: number }> = [];
  if (element.rotate) {
    transform.push({ rotate: element.rotate });
  }
  if (element.mirror) {
    transform.push({ scaleX: -1 });
  }
  if (transform.length > 0) {
    style.transform = transform as ImageStyle['transform'];
  }

  return style;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
  dimmed: {
    opacity: 0.72,
  },
});
