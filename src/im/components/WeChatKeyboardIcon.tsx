import React from 'react';
import Svg, { Circle, Rect } from 'react-native-svg';

export interface WeChatKeyboardIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * 微信原版输入法“切换回键盘”圆形图标 (WeChat Switch-to-Keyboard Circular Icon)
 * 规格：
 * 1. 经典外圆环线框 (stroke)
 * 2. 第一排 4 个方形按键 (fill)
 * 3. 第二排 4 个方形按键 (fill)
 * 4. 第三排 居中空格键长条 (fill)
 */
export const WeChatKeyboardIcon = React.memo(function WeChatKeyboardIcon({
  size = 28,
  color = '#181818',
  strokeWidth = 1.9,
}: WeChatKeyboardIconProps) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 28 28" width={size}>
      {/* 外圆环 */}
      <Circle
        cx="14"
        cy="14"
        fill="none"
        r="11.5"
        stroke={color}
        strokeWidth={strokeWidth}
      />

      {/* 第一排 4 个方形按键 */}
      <Rect fill={color} height="2.4" rx="0.35" width="2.4" x="7.1" y="9.2" />
      <Rect fill={color} height="2.4" rx="0.35" width="2.4" x="10.9" y="9.2" />
      <Rect fill={color} height="2.4" rx="0.35" width="2.4" x="14.7" y="9.2" />
      <Rect fill={color} height="2.4" rx="0.35" width="2.4" x="18.5" y="9.2" />

      {/* 第二排 4 个方形按键 */}
      <Rect fill={color} height="2.4" rx="0.35" width="2.4" x="7.1" y="13.0" />
      <Rect fill={color} height="2.4" rx="0.35" width="2.4" x="10.9" y="13.0" />
      <Rect fill={color} height="2.4" rx="0.35" width="2.4" x="14.7" y="13.0" />
      <Rect fill={color} height="2.4" rx="0.35" width="2.4" x="18.5" y="13.0" />

      {/* 第三排 空格长按键 */}
      <Rect fill={color} height="2.0" rx="0.4" width="7.6" x="10.2" y="17.2" />
    </Svg>
  );
});
