import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { IpListItem } from '../database';
import { colors, componentTokens, layout, radius, shadows, spacing, typography } from '../design/tokens';
import { formatUpdatedLabel, getIpInitials } from '../utils/formatters';
import { MetaText } from './MetaText';

interface IPCardProps {
  ip: IpListItem;
  onPress: (ipId: number) => void;
}

export function IPCard({ ip, onPress }: IPCardProps) {
  return (
    <Pressable onPress={() => onPress(ip.id)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.preview}>
        {ip.coverThumbnailFileUri ? (
          <Image resizeMode="cover" source={{ uri: ip.coverThumbnailFileUri }} style={styles.previewImage} />
        ) : (
          <View style={styles.emptyPreview}>
            <Text style={styles.initialsText}>{getIpInitials(ip.name)}</Text>
          </View>
        )}
        {ip.isFavorite ? (
          <View style={styles.favoriteBadge}>
            <Ionicons color={colors.semantic.favorite} name="star" size={14} />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text numberOfLines={1} style={typography.textStyles.cardTitle}>
          {ip.name}
        </Text>
        <MetaText numberOfLines={1}>{`${ip.imageCount} 张图片 · ${ip.groupCount} 个分组`}</MetaText>
        <MetaText numberOfLines={1} tone="placeholder">
          {formatUpdatedLabel(ip.updatedAt)}
        </MetaText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    ...shadows.sm,
    backgroundColor: colors.background.surface,
    borderColor: colors.border.subtle,
    borderRadius: componentTokens.ipCard.radius,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: '48.2%',
  },
  cardPressed: {
    opacity: 0.84,
  },
  preview: {
    aspectRatio: componentTokens.ipCard.previewAspectRatio,
    backgroundColor: colors.background.empty,
    position: 'relative',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  emptyPreview: {
    alignItems: 'center',
    backgroundColor: colors.support.sky100,
    flex: 1,
    justifyContent: 'center',
  },
  initialsText: {
    color: colors.text.inverse,
    fontFamily: typography.family.brand,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: 0.2,
  },
  favoriteBadge: {
    alignItems: 'center',
    backgroundColor: colors.overlay.softSurface,
    borderRadius: componentTokens.ipCard.previewBadgeRadius,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing[2],
    top: spacing[2],
    width: 28,
  },
  body: {
    gap: spacing[1],
    padding: componentTokens.ipCard.contentPadding,
  },
});
