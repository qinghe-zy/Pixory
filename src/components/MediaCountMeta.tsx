import { MaterialIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { colors, spacing, typography } from '../design/tokens';

export interface MediaCountMetaProps {
  imageCount: number;
  videoCount?: number | null;
  iconSize?: number;
  color?: string;
  textStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  itemGap?: number;
  groupGap?: number;
  rowGap?: number;
}

/**
 * 极简媒体数量展示组件：仅在数量大于 0 时渲染对应图标与数字，不附带冗余量词。
 */
export const MediaCountMeta = memo(function MediaCountMeta({
  imageCount,
  videoCount = 0,
  iconSize = 13,
  color = colors.text.secondary,
  textStyle,
  containerStyle,
  itemGap = spacing[1],
  groupGap = spacing[2],
  rowGap = 2, // 紧凑多行回退间距，避免占用过多卡片纵向高度
}: MediaCountMetaProps) {
  const safeImageCount = Number.isFinite(imageCount) && imageCount > 0 ? imageCount : 0;
  const safeVideoCount = typeof videoCount === 'number' && Number.isFinite(videoCount) && videoCount > 0 ? videoCount : 0;

  if (safeImageCount === 0 && safeVideoCount === 0) {
    return null;
  }

  const accessibilityParts: string[] = [];
  if (safeImageCount > 0) {
    accessibilityParts.push(`图片 ${safeImageCount}`);
  }
  if (safeVideoCount > 0) {
    accessibilityParts.push(`视频 ${safeVideoCount}`);
  }

  return (
    <View
      accessible
      accessibilityLabel={accessibilityParts.join('，')}
      style={[styles.container, { columnGap: groupGap, rowGap }, containerStyle]}
    >
      {safeImageCount > 0 ? (
        <View importantForAccessibility="no-hide-descendants" style={[styles.item, { gap: itemGap }]}>
          <MaterialIcons color={color} name="photo-library" size={iconSize} />
          <Text numberOfLines={1} style={[styles.text, { color }, textStyle]}>
            {safeImageCount}
          </Text>
        </View>
      ) : null}
      {safeVideoCount > 0 ? (
        <View importantForAccessibility="no-hide-descendants" style={[styles.item, { gap: itemGap }]}>
          <MaterialIcons color={color} name="movie" size={iconSize} />
          <Text numberOfLines={1} style={[styles.text, { color }, textStyle]}>
            {safeVideoCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    flexShrink: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  text: {
    fontFamily: typography.family.mono,
    // 卡片次级计数沿用 10px 等宽字号，确保双 4 位数与日期能在窄屏卡片内稳居单行
    fontSize: 10,
    lineHeight: 13,
    includeFontPadding: false,
  },
});
