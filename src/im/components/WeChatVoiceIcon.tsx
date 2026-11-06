import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export interface WeChatVoiceIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * 微信原版输入法“切换到语音”圆形发声图标 (WeChat Switch-to-Voice Circular Icon)
 * 1:1 严格对照参考图像素级还原：
 * 1. 外圆环线框：居中 (14, 14)，半径 r=11.5，线条宽度 strokeWidth (默认 1.9)
 * 2. 左侧发声源三角锥：尖端指向正左方 (8.6, 14.0)，右侧开口弧线由 (10.5, 12.3) 经由 (11.3, 14.0) 连至 (10.5, 15.7)，实心填充
 * 3. 中间内层声波弧线：圆心位于 (5.5, 14.0)，半径 R=8.6，沿垂直中心水平向右发散，端点 (13.0, 10.0) 至 (13.0, 18.0)，线条两端圆润
 * 4. 右侧外层声波弧线：圆心位于 (7.1, 14.0)，半径 R=10.4，沿垂直中心水平向右发散，端点 (15.4, 7.6) 至 (15.4, 20.4)，线条两端圆润
 * 整体图形严格水平对称且水平同心排列，无任何倾角偏转，真实还原微信原生输入框左侧语音图标。
 */
export const WeChatVoiceIcon = React.memo(function WeChatVoiceIcon({
  size = 28,
  color = '#181818',
  strokeWidth = 1.9,
}: WeChatVoiceIconProps) {
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

      {/* 左侧实心发声音腔三角锥（尖端朝左，开口朝右呈饱满圆弧） */}
      <Path
        d="M8.6 14L10.5 12.3A2.1 2.1 0 0 1 10.5 15.7Z"
        fill={color}
      />

      {/* 第 1 道内层声波弧线（向右辐射，两端圆角） */}
      <Path
        d="M13.0 10.0A8.6 8.6 0 0 1 13.0 18.0"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />

      {/* 第 2 道外层声波弧线（向右辐射，两端圆角） */}
      <Path
        d="M15.4 7.6A10.4 10.4 0 0 1 15.4 20.4"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
});
