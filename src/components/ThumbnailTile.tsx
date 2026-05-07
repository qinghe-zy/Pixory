import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ImageListItem, PixorySpace } from '../database';
import { colors, componentTokens, radius, spacing, typography } from '../design/tokens';
import { formatDuration } from '../utils/formatters';
import { SecureImage } from './SecureImage';

interface ThumbnailTileProps {
  image: Pick<ImageListItem, 'id' | 'thumbnailFileUri' | 'originalFilename' | 'isFavorite' | 'mediaType' | 'durationMs'>;
  space?: PixorySpace;
  onPress?: (imageId: number) => void;
  onLongPress?: (imageId: number) => void;
  aspectRatio?: number;
  selected?: boolean;
}

export function ThumbnailTile({
  image,
  space = 'normal',
  onPress,
  onLongPress,
  aspectRatio = componentTokens.thumbnail.aspectRatio,
  selected = false,
}: ThumbnailTileProps) {
  const isVideo = image.mediaType === 'video';
  const accessibilityLabel = isVideo
    ? selected
      ? `打开视频：${image.originalFilename}，已选中`
      : `打开视频：${image.originalFilename}`
    : selected
      ? `打开图片：${image.originalFilename}，已选中`
      : `打开图片：${image.originalFilename}`;
  const content = (
    <View style={[styles.tile, selected ? styles.selectedTile : null, { aspectRatio }]}>
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
      {selected ? (
        <>
          <View style={styles.selectionOverlay} />
          <View style={styles.selectionBadge}>
            <Ionicons color={colors.text.inverse} name="checkmark" size={10} />
          </View>
        </>
      ) : null}
    </View>
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
      onLongPress={onLongPress ? () => onLongPress(image.id) : undefined}
      onPress={onPress ? () => onPress(image.id) : undefined}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '31.6%',
  },
  pressed: {
    opacity: 0.84,
  },
  tile: {
    backgroundColor: colors.background.empty,
    borderColor: colors.border.subtle,
    borderRadius: componentTokens.thumbnail.radius,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  selectedTile: {
    borderColor: colors.primary.default,
    borderWidth: 1,
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
});
