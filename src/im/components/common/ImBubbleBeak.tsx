import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useImTheme } from '../../theme/ImThemeProvider';

export interface ImBubbleBeakProps {
  direction: 'left' | 'right';
  customColor?: string;
}

/**
 * 微信经典原生三角尖角组件 (Authentic WeChat Bubble Beak)
 *
 * 像素级对标 docs/微信/code.html:
 * - 左尖角: 指向伴侣头像，填充纯白
 * - 右尖角: 指向用户头像，填充微信绿
 * - 尺寸、偏移与颜色完全由 ImThemeTokens 驱动，支持随时开闭与换肤。
 */
export function ImBubbleBeak({ direction, customColor }: ImBubbleBeakProps) {
  const theme = useImTheme();

  if (!theme.flags.showBeak) {
    return null;
  }

  const { beakWidth, beakHeight, beakOffsetTop } = theme.metrics;
  const isLeft = direction === 'left';
  const fillColor = customColor ?? (isLeft ? theme.colors.bubbleLeftBackground : theme.colors.bubbleRightBackground);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.beakBase,
        {
          top: beakOffsetTop,
          borderTopWidth: beakHeight / 2,
          borderBottomWidth: beakHeight / 2,
        },
        isLeft
          ? {
              left: -beakWidth + 1, // 1px 微量贴合消除 Android 次像素白缝
              borderRightWidth: beakWidth,
              borderRightColor: fillColor,
            }
          : {
              right: -beakWidth + 1,
              borderLeftWidth: beakWidth,
              borderLeftColor: fillColor,
            },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  beakBase: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    zIndex: 1,
  },
});
