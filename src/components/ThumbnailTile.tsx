import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ImageListItem } from '../database';
import { colors, componentTokens, radius, spacing, typography } from '../design/tokens';

interface ThumbnailTileProps {
  image: Pick<ImageListItem, 'id' | 'thumbnailFileUri' | 'originalFilename' | 'isFavorite'>;
  onPress?: (imageId: number) => void;
  onLongPress?: (imageId: number) => void;
  aspectRatio?: number;
  selected?: boolean;
}

export function ThumbnailTile({
  image,
  onPress,
  onLongPress,
  aspectRatio = componentTokens.thumbnail.aspectRatio,
  selected = false,
}: ThumbnailTileProps) {
  const content = (
    <View style={[styles.tile, selected ? styles.selectedTile : null, { aspectRatio }]}>
      {image.thumbnailFileUri ? (
        <Image resizeMode="cover" source={{ uri: image.thumbnailFileUri }} style={styles.image} />
      ) : (
        <View style={styles.emptyPreview}>
          <Ionicons color={colors.text.secondary} name="image-outline" size={22} />
          <Text numberOfLines={1} style={styles.emptyText}>
            {image.originalFilename}
          </Text>
        </View>
      )}
      {image.isFavorite ? (
        <View style={styles.favoriteBadge}>
          <Ionicons color={colors.semantic.favorite} name="star" size={12} />
        </View>
      ) : null}
      {selected ? (
        <>
          <View style={styles.selectionOverlay} />
          <View style={styles.selectionBadge}>
            <Ionicons color={colors.text.inverse} name="checkmark" size={12} />
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
    borderRadius: radius.sm,
    height: componentTokens.thumbnail.favoriteBadgeSize,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing[2],
    top: spacing[2],
    width: componentTokens.thumbnail.favoriteBadgeSize,
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay.selectedGold,
  },
  selectionBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary.default,
    borderRadius: radius.sm,
    height: 22,
    justifyContent: 'center',
    left: spacing[2],
    position: 'absolute',
    top: spacing[2],
    width: 22,
  },
});
