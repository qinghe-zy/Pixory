import type { ReactNode } from 'react';
import {
  Image,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  pageBackgroundVariants,
  type PageBackgroundElementRecipe,
  type PageBackgroundVariant,
} from '../design/backgrounds';
import { colors } from '../design/tokens';

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
  const recipe = variant ? pageBackgroundVariants[variant] : [];

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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

  const transform: NonNullable<ViewStyle['transform']> = [];
  if (element.rotate) {
    transform.push({ rotate: element.rotate });
  }
  if (element.mirror) {
    transform.push({ scaleX: -1 });
  }
  if (transform.length > 0) {
    style.transform = transform;
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
});
