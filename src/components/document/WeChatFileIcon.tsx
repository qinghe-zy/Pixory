import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { WeChatFileTypeStyle } from './fileTypeResolver';

export interface WeChatFileIconProps {
  styleConfig: WeChatFileTypeStyle;
}

/**
 * 42x52 微信原生折角文档矢量外形几何:
 * - 宽度 42，高度 52，圆角 4，右上切角边长 12
 * - 切角自 (30, 0) 斜切至 (42, 12)
 */
const CARD_SVG_PATH =
  'M 4 0 H 30 L 42 12 V 48 A 4 4 0 0 1 38 52 H 4 A 4 4 0 0 1 0 48 V 4 A 4 4 0 0 1 4 0 Z';

/**
 * 右上折角翻折三角底片:
 * - 自 (30, 0) 连接至 (42, 12)，底部拐点在 (30, 12) 处呈现 3px 圆角
 */
const FOLD_SVG_PATH =
  'M 30 0 L 42 12 H 33 A 3 3 0 0 1 30 9 V 0 Z';

export const WeChatFileIcon = memo(
  function WeChatFileIcon({ styleConfig }: WeChatFileIconProps) {
    return (
      <View style={styles.container}>
        <Svg height={52} viewBox="0 0 42 52" width={42}>
          <Path d={CARD_SVG_PATH} fill={styleConfig.bgColor} />
          <Path d={FOLD_SVG_PATH} fill={styleConfig.foldColor} />
        </Svg>
        <View pointerEvents="none" style={styles.labelOverlay}>
          <Text
            allowFontScaling={false}
            style={[
              styles.labelText,
              {
                color: styleConfig.textColor,
                fontSize: styleConfig.fontSize,
                letterSpacing: styleConfig.letterSpacing ?? 0,
              },
            ]}
          >
            {styleConfig.label}
          </Text>
        </View>
      </View>
    );
  },
  (prev, next) =>
    prev.styleConfig.bgColor === next.styleConfig.bgColor &&
    prev.styleConfig.foldColor === next.styleConfig.foldColor &&
    prev.styleConfig.label === next.styleConfig.label &&
    prev.styleConfig.textColor === next.styleConfig.textColor &&
    prev.styleConfig.fontSize === next.styleConfig.fontSize &&
    prev.styleConfig.letterSpacing === next.styleConfig.letterSpacing
);

const styles = StyleSheet.create({
  container: {
    width: 42,
    height: 52,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  labelOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 3, // 微调视觉重心至未折角本体中心
  },
  labelText: {
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
