import React, { memo } from 'react';
import { type StyleProp, type ImageStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { FILE_TRANSFER_AVATAR } from '../utils/fileTransferAvatar';

export interface FileTransferAvatarProps {
  size?: number;
  borderRadius?: number;
  style?: StyleProp<ImageStyle>;
}

/**
 * 文件传输助手专属头像组件（严格对齐 Pixory 系统管家同款静态资源原生打包处理方式）
 * 使用 assets/file_transfer_avatar.png 原生静态资源与 ExpoImage 硬件加速渲染，彻底杜绝打包丢失
 */
export const FileTransferAvatar = memo(function FileTransferAvatar({
  size = 48,
  borderRadius,
  style,
}: FileTransferAvatarProps) {
  const finalRadius = borderRadius ?? Math.round(size * 0.22);

  return (
    <ExpoImage
      accessibilityLabel="文件传输助手"
      contentFit="cover"
      source={FILE_TRANSFER_AVATAR}
      style={[
        {
          width: size,
          height: size,
          borderRadius: finalRadius,
        },
        style,
      ]}
    />
  );
});
