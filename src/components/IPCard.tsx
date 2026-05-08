import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { IpListItem, PixorySpace } from '../database';
import { resolvePersonalCoverBlurRadius } from '../constants/privacy';
import { colors, componentTokens, radius, shadows, spacing, typography } from '../design/tokens';
import { formatFileSize, formatUpdatedLabel, getIpInitials } from '../utils/formatters';
import { SecureImage } from './SecureImage';

interface IPCardProps {
  ip: IpListItem;
  space?: PixorySpace;
  onLongPress?: (ip: IpListItem) => void;
  onPress: (ipId: number) => void;
}

export function IPCard({ ip, space = 'normal', onLongPress, onPress }: IPCardProps) {
  const content = <CardCaption ip={ip} />;
  const coverBlurRadius = space === 'personal' && (ip.coverBlurEnabled ?? true) ? resolvePersonalCoverBlurRadius(ip.coverBlurRadius) : undefined;

  return (
    <Pressable
      accessibilityLabel={`打开 ${ip.name}`}
      accessibilityRole="button"
      onLongPress={onLongPress ? () => onLongPress(ip) : undefined}
      onPress={() => onPress(ip.id)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {ip.coverThumbnailFileUri ? (
        <View style={styles.cover}>
          <SecureImage blurRadius={coverBlurRadius} contentFit="cover" space={space} style={[StyleSheet.absoluteFill, styles.coverImage]} uri={ip.coverThumbnailFileUri} />
          {content}
        </View>
      ) : (
        <View style={[styles.cover, styles.fallbackCover]}>
          <Text numberOfLines={1} style={styles.initialsText}>
            {getIpInitials(ip.name)}
          </Text>
          <View style={styles.fallbackMark} />
          {content}
        </View>
      )}
    </Pressable>
  );
}

function CardCaption({ ip }: { ip: IpListItem }) {
  const mediaParts: string[] = [];
  if (ip.imageCount > 0) {
    mediaParts.push(`${ip.imageCount} 张图片`);
  }
  if (ip.videoCount > 0) {
    mediaParts.push(`${ip.videoCount} 个视频`);
  }
  if (ip.totalBytes > 0) {
    mediaParts.push(formatFileSize(ip.totalBytes));
  }
  mediaParts.push(formatUpdatedLabel(ip.updatedAt));

  return (
    <View style={styles.captionBlock}>
      <View style={styles.captionText}>
        <Text numberOfLines={1} style={styles.title}>
          {ip.name}
        </Text>
        <Text numberOfLines={1} style={styles.metaText}>{mediaParts.join(' · ')}</Text>
      </View>
      {ip.isFavorite ? (
        <View style={styles.favoriteBadge}>
          <Ionicons color={colors.semantic.favorite} name="star" size={14} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...shadows.sm,
    aspectRatio: 2.08,
    backgroundColor: colors.background.empty,
    borderColor: colors.border.subtle,
    borderRadius: componentTokens.ipCard.radius,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: '100%',
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  cover: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing[4],
    position: 'relative',
  },
  coverImage: {
    borderRadius: componentTokens.ipCard.radius,
  },
  fallbackCover: {
    backgroundColor: colors.background.empty,
  },
  fallbackMark: {
    backgroundColor: colors.primary.weak,
    borderRadius: radius.pill,
    height: 92,
    position: 'absolute',
    right: -30,
    top: -26,
    width: 92,
  },
  initialsText: {
    color: colors.primary.active,
    fontFamily: typography.family.brand,
    fontSize: 44,
    fontWeight: '500',
    left: spacing[5],
    lineHeight: 50,
    opacity: 0.22,
    position: 'absolute',
    top: spacing[5],
  },
  captionBlock: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    gap: spacing[3],
    justifyContent: 'flex-end',
    width: '74%',
  },
  captionText: {
    flex: 1,
    minWidth: 0,
  },
  favoriteBadge: {
    alignItems: 'center',
    backgroundColor: colors.overlay.softSurface,
    borderColor: colors.border.subtle,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  title: {
    ...typography.textStyles.cardTitle,
    color: colors.text.inverse,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'right',
    textShadowColor: 'rgba(23, 33, 43, 0.92)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  metaText: {
    ...typography.textStyles.caption,
    color: 'rgba(255, 255, 255, 0.94)',
    fontWeight: '500',
    lineHeight: 17,
    textAlign: 'right',
    textShadowColor: 'rgba(23, 33, 43, 0.92)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
});
