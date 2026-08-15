import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { IpListItem, PixorySpace } from '../database';
import { resolvePersonalCoverBlurRadius } from '../constants/privacy';
import { colors, componentTokens, radius, shadows, spacing, typography } from '../design/tokens';
import { formatFileSize, formatUpdatedLabel, getIpInitials } from '../utils/formatters';
import { SecureImage } from './SecureImage';
import { MagneticCardContainer, GyroSpecularHighlight } from './MagneticCardContainer';

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
    <View style={styles.shadowContainer}>
      <MagneticCardContainer gyroSensitivity={3}>
        <Pressable
          accessibilityLabel={`打开 ${ip.name}`}
          accessibilityRole="button"
          onLongPress={onLongPress ? () => onLongPress(ip) : undefined}
          onPress={() => onPress(ip.id)}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          {ip.coverThumbnailFileUri ? (
            <View style={styles.cover}>
              <View style={styles.imageInset}>
                <SecureImage blurRadius={coverBlurRadius} contentFit="cover" space={space} style={[StyleSheet.absoluteFill, styles.coverImage]} uri={ip.coverThumbnailFileUri} />
              </View>
              <AcrylicGlass />
              <GyroSpecularHighlight intensity={0.6} />
              {content}
            </View>
          ) : (
            <View style={[styles.cover, styles.fallbackCover]}>
              <View style={styles.imageInset}>
                <Text numberOfLines={1} style={styles.initialsText}>
                  {getIpInitials(ip.name)}
                </Text>
                <View style={styles.fallbackMark} />
              </View>
              <AcrylicGlass />
              <GyroSpecularHighlight intensity={0.6} />
              {content}
            </View>
          )}
        </Pressable>
      </MagneticCardContainer>
    </View>
  );
}

function AcrylicGlass() {
  return (
    <>
      <View pointerEvents="none" style={styles.acrylicFrosting} />
      <View pointerEvents="none" style={styles.glassGlareContainer}>
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.25)', 'transparent', 'rgba(255, 255, 255, 0.05)']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View pointerEvents="none" style={styles.outerRim} />
      <View pointerEvents="none" style={styles.innerRim} />
      <View pointerEvents="none" style={styles.cornerHighlightTL} />
    </>
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
  shadowContainer: {
    ...shadows.hero,
    shadowColor: '#2C2318', 
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    width: '100%',
  },
  card: {
    shadowColor: '#1A130C',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    aspectRatio: 2.08,
    backgroundColor: colors.background.empty,
    borderRadius: componentTokens.ipCard.radius,
    overflow: 'hidden',
    width: '100%',
    elevation: 8,
  },
  cardPressed: {
    opacity: 0.88,
  },
  cover: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing[4],
    position: 'relative',
  },
  imageInset: {
    ...StyleSheet.absoluteFillObject,
    margin: 2.5,
    borderRadius: componentTokens.ipCard.radius - 2.5,
    overflow: 'hidden',
    backgroundColor: colors.background.empty,
  },
  coverImage: {
    borderRadius: componentTokens.ipCard.radius - 2.5,
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
  acrylicFrosting: {
    ...StyleSheet.absoluteFillObject,
    // Removed white frosting to restore crystal transparency
  },
  glassGlareContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  outerRim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: componentTokens.ipCard.radius,
    borderTopWidth: 2,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
    borderLeftColor: 'rgba(255, 255, 255, 0.4)',
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    borderRightColor: 'rgba(0, 0, 0, 0.05)',
  },
  innerRim: {
    ...StyleSheet.absoluteFillObject,
    margin: 1.5,
    borderRadius: componentTokens.ipCard.radius - 1.5,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    borderLeftColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomColor: 'rgba(255, 255, 255, 0.02)',
    borderRightColor: 'rgba(255, 255, 255, 0.01)',
  },
  cornerHighlightTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 20,
    height: 20,
    borderTopLeftRadius: componentTokens.ipCard.radius,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderTopColor: 'rgba(255, 255, 255, 1)',
    borderLeftColor: 'rgba(255, 255, 255, 0.8)',
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
