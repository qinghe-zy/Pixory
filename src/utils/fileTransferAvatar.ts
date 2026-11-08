import type { ImageSourcePropType } from 'react-native';

/**
 * 文件传输助手系统预设头像引用（严格对齐 AI_SYSTEM_AVATAR 的原生静态资源处理方式）
 * 1. 原生静态资源文件 assets/file_transfer_avatar.png 确保 Android Gradle 打包零丢包
 * 2. 结合 FileTransferAvatar 组件实现视网膜级 SVG 矢量回退支持
 */
export const FILE_TRANSFER_AVATAR: ImageSourcePropType = require('../../assets/file_transfer_avatar.png');
