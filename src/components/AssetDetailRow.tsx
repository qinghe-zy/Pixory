import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import type { ImageListItem, PixorySpace } from '../database';
import { colors, componentTokens, radius, shadows, spacing, typography } from '../design/tokens';
import { formatDateTime, formatDuration, formatFileSize, formatImageDimensions } from '../utils/formatters';
import { SecureImage } from './SecureImage';

interface AssetDetailRowProps {
  image: ImageListItem;
  space?: PixorySpace;
  onPress?: (imageId: number) => void;
  onLongPress?: (imageId: number) => void;
  selected?: boolean;
  isSelectionMode?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
}

export function AssetDetailRow({
  image,
  space = 'normal',
  onPress,
  onLongPress,
  selected = false,
  isSelectionMode = false,
  onLayout,
}: AssetDetailRowProps) {
  const isVideo = image.mediaType === 'video';
  const metaParts = [
    formatFileSize(image.fileSize),
    isVideo ? formatDuration(image.durationMs) : formatImageDimensions(image.width, image.height),
  ];
  const relationParts = [
    image.ipName,
    image.groupName,
    image.tagNames.length > 0 ? image.tagNames.map((tagName) => `#${tagName}`).join(' ') : null,
  ].filter((part): part is string => Boolean(part));

  const content = (
    <View style={[styles.row, selected ? styles.rowSelected : null]}>
      <View style={styles.thumbnail}>
        {image.thumbnailFileUri ? (
          <SecureImage contentFit="cover" space={space} style={styles.thumbnailImage} uri={image.thumbnailFileUri} />
        ) : (
          <View style={styles.emptyPreview}>
            <Ionicons color={colors.text.secondary} name={isVideo ? 'videocam-outline' : 'image-outline'} size={20} />
          </View>
        )}
        {isVideo ? (
          <View style={styles.mediaBadge}>
            <Ionicons color={colors.text.inverse} name="play" size={10} />
          </View>
        ) : null}
      </View>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.dateTitle}>{formatDateTime(image.createdAt)}</Text>
          {image.isFavorite ? <Ionicons color={colors.semantic.favorite} name="star" size={14} /> : null}
        </View>
        <Text numberOfLines={1} style={styles.meta}>
          <Text style={styles.filenameText}>{image.originalFilename}</Text>
          <Text> · {metaParts.join(' · ')}</Text>
        </Text>
        <Text numberOfLines={1} style={styles.relation}>{relationParts.length > 0 ? relationParts.join(' · ') : '未分组 · 无标签'}</Text>
      </View>
      {isSelectionMode || selected ? (
        <View style={[styles.selectionCircle, selected ? styles.selectionCircleActive : null]}>
          {selected ? <Ionicons color={colors.text.inverse} name="checkmark" size={12} /> : null}
        </View>
      ) : null}
    </View>
  );

  if (!onPress && !onLongPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityLabel={`${isVideo ? '打开视频' : '打开图片'}：${image.originalFilename}${selected ? '，已选中' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      delayLongPress={220}
      onLayout={onLayout}
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
    width: '100%',
  },
  pressed: {
    opacity: 0.84,
  },
  row: {
    ...shadows.sm,
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
    minHeight: 86,
    padding: spacing[2],
  },
  rowSelected: {
    backgroundColor: colors.primary.weak,
    borderColor: colors.primary.light,
  },
  thumbnail: {
    aspectRatio: componentTokens.thumbnail.squareAspectRatio,
    backgroundColor: colors.background.empty,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
    width: 70,
  },
  thumbnailImage: {
    height: '100%',
    width: '100%',
  },
  emptyPreview: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  mediaBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(30, 38, 29, 0.72)',
    borderRadius: radius.pill,
    bottom: spacing[1],
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing[1],
    width: 18,
  },
  content: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1],
    minWidth: 0,
    marginBottom: 2,
  },
  dateTitle: {
    fontFamily: typography.family.stat,
    fontSize: 16,
    color: colors.text.title,
    flex: 1,
    fontWeight: '600',
    minWidth: 0,
  },
  meta: {
    fontFamily: typography.family.stat,
    fontSize: 11,
    color: colors.text.secondary,
    lineHeight: 16,
    marginBottom: 2,
  },
  filenameText: {
    color: colors.text.placeholder,
  },
  relation: {
    ...typography.textStyles.micro,
    color: colors.text.tertiary,
  },
  selectionCircle: {
    alignItems: 'center',
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  selectionCircleActive: {
    backgroundColor: colors.primary.default,
    borderColor: colors.primary.default,
  },
});
