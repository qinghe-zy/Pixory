import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ImageListItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';

interface ThumbnailTileProps {
  image: Pick<ImageListItem, 'id' | 'thumbnailFileUri' | 'originalFilename' | 'isFavorite'>;
  onPress?: (imageId: number) => void;
  aspectRatio?: number;
}

export function ThumbnailTile({ image, onPress, aspectRatio = 1 }: ThumbnailTileProps) {
  const content = (
    <View style={[styles.tile, { aspectRatio }]}>
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
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable onPress={() => onPress(image.id)} style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
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
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
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
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.sm,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing[2],
    top: spacing[2],
    width: 22,
  },
});
