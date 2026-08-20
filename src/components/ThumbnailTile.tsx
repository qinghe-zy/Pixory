import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { ImageListItem, PixorySpace } from '../database';
import { colors, componentTokens, radius, spacing, typography, shadows } from '../design/tokens';
import { formatDuration } from '../utils/formatters';
import { SecureImage } from './SecureImage';

interface ThumbnailTileProps {
  image: Pick<ImageListItem, 'id' | 'thumbnailFileUri' | 'originalFilename' | 'isFavorite' | 'mediaType' | 'durationMs'>;
  space?: PixorySpace;
  onPress?: (imageId: number) => void;
  onLongPress?: (imageId: number) => void;
  aspectRatio?: number;
  selected?: boolean;
  isSelectionMode?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  index?: number;
  containerStyle?: StyleProp<ViewStyle>;
}

export function ThumbnailTile({
  image,
  space = 'normal',
  onPress,
  onLongPress,
  aspectRatio = componentTokens.thumbnail.aspectRatio,
  selected = false,
  isSelectionMode = false,
  onLayout,
  index,
  containerStyle,
}: ThumbnailTileProps) {
  const isVideo = image.mediaType === 'video';
  const accessibilityLabel = isVideo
    ? selected
      ? `打开视频：${image.originalFilename}，已选中`
      : `打开视频：${image.originalFilename}`
    : selected
      ? `打开图片：${image.originalFilename}，已选中`
      : `打开图片：${image.originalFilename}`;
  const entering = index !== undefined ? FadeIn.delay(Math.min(index * 20, 200)).duration(500) : FadeIn.duration(400);
  const content = (
    <Animated.View entering={entering} style={[styles.tile, styles.tileFloating, selected ? styles.selectedTile : null, { aspectRatio }]}>
      {image.thumbnailFileUri ? (
        <SecureImage contentFit="cover" space={space} style={styles.image} uri={image.thumbnailFileUri} />
      ) : (
        <View style={styles.emptyPreview}>
          <Ionicons color={colors.text.secondary} name={isVideo ? 'videocam-outline' : 'image-outline'} size={22} />
          <Text numberOfLines={1} style={styles.emptyText}>
            {image.originalFilename}
          </Text>
        </View>
      )}
      {isVideo ? (
        <View style={styles.videoBadge}>
          <Ionicons color={colors.text.inverse} name="play" size={10} />
          <Text style={styles.videoBadgeText}>{formatDuration(image.durationMs)}</Text>
        </View>
      ) : null}
      {image.isFavorite ? (
        <View style={styles.favoriteBadge}>
          <Ionicons color={colors.semantic.favorite} name="star" size={12} />
        </View>
      ) : null}
      {isSelectionMode || selected ? (
        <>
          <View style={[styles.selectionOverlay, !selected && { opacity: 0 }]} />
          <View style={[styles.selectionBadge, !selected && styles.selectionBadgeInactive]}>
            {selected ? <Ionicons color={colors.text.inverse} name="checkmark" size={10} /> : null}
          </View>
        </>
      ) : null}
    </Animated.View>
  );

  if (!onPress && !onLongPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="imagebutton"
      accessibilityState={{ selected }}
      delayLongPress={220}
      onLayout={onLayout}
      onLongPress={onLongPress ? () => onLongPress(image.id) : undefined}
      onPress={onPress ? () => onPress(image.id) : undefined}
      style={({ pressed }) => [styles.pressable, containerStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '31.8%',
  },
  pressed: {
    opacity: 0.84,
  },
  tile: {
    backgroundColor: colors.background.empty,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  tileFloating: {
    ...shadows.sm,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255, 255, 255, 0.12)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255, 255, 255, 0.04)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.02)',
  },
  selectedTile: {
    borderColor: colors.primary.default,
    borderWidth: 1.5,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  emptyPreview: {
    alignItems: 'center',
    flex: 1,
    gap: spacing[2],
    justifyContent: 'center',
    padding: spacing[3],
  },
  emptyText: {
    ...typography.textStyles.micro,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  favoriteBadge: {
    alignItems: 'center',
    backgroundColor: colors.overlay.softSurface,
    borderColor: colors.border.subtle,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    height: componentTokens.thumbnail.favoriteBadgeSize,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing[2],
    top: spacing[2],
    width: componentTokens.thumbnail.favoriteBadgeSize,
  },
  videoBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(30, 38, 29, 0.72)',
    borderRadius: radius.pill,
    bottom: spacing[2],
    flexDirection: 'row',
    gap: 3,
    minHeight: 22,
    paddingHorizontal: spacing[2],
    position: 'absolute',
    right: spacing[2],
  },
  videoBadgeText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '700',
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(86, 107, 72, 0.16)',
  },
  selectionBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary.default,
    borderColor: colors.overlay.softSurface,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 18,
    justifyContent: 'center',
    left: spacing[2],
    position: 'absolute',
    top: spacing[2],
    width: 18,
  },
  selectionBadgeInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderColor: colors.border.default,
  },
});
