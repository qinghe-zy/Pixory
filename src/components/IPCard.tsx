import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
        <View style={styles.initialsBadge}>
          <Text style={styles.initialsText}>{getIpInitials(ip.name)}</Text>
        </View>
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
        <Text numberOfLines={2} style={styles.description}>
          {ip.description || '还没有简介'}
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
    borderColor: colors.border.default,
    borderRadius: componentTokens.ipCard.radius,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: '48.8%',
  },
  cardPressed: {
    opacity: 0.84,
  },
  preview: {
    alignItems: 'flex-start',
    aspectRatio: componentTokens.ipCard.previewAspectRatio,
    backgroundColor: colors.background.empty,
    justifyContent: 'space-between',
    padding: spacing[4],
  },
  initialsBadge: {
    alignItems: 'center',
    backgroundColor: colors.background.surface,
    borderRadius: radius.sm,
    height: 34,
    justifyContent: 'center',
    minWidth: 42,
    paddingHorizontal: spacing[3],
  },
  initialsText: {
    ...typography.textStyles.cardTitle,
    color: colors.primary.default,
    letterSpacing: 0.2,
  },
  favoriteBadge: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: colors.background.surface,
    borderRadius: componentTokens.ipCard.previewBadgeRadius,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  body: {
    gap: spacing[1],
    padding: spacing[4],
  },
  description: {
    ...typography.textStyles.body,
    color: colors.text.body,
    minHeight: 42,
  },
});
