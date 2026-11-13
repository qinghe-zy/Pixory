import { MaterialIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ImageListItem, PixorySpace } from '../../database';
import { colors, radius, spacing, typography } from '../../design/tokens';
import {
  formatDuration,
  formatFileSize,
  formatImageDimensions,
} from '../../utils/formatters';
import { SecureImage } from '../SecureImage';

export interface DrawerQueueRowProps {
  item: ImageListItem;
  isActive: boolean;
  space: PixorySpace;
  activeDisplayTimeSec: number;
  height: number;
  onSelect: (item: ImageListItem) => void;
}

/**
 * Memoized playlist drawer item row.
 * Inactive rows receive activeDisplayTimeSec=0 so 1Hz active-time updates never re-render them.
 */
export const DrawerQueueRow = memo(function DrawerQueueRow({
  item,
  isActive,
  space,
  activeDisplayTimeSec,
  height,
  onSelect,
}: DrawerQueueRowProps) {
  const thumbUri = item.coverThumbnailFileUri ?? item.thumbnailFileUri;

  return (
    <Pressable
      accessibilityLabel={`${item.originalFilename}${isActive ? '，正在播放' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={() => onSelect(item)}
      style={[
        styles.row,
        { height },
        isActive && styles.rowActive,
      ]}
    >
      <View style={styles.cover}>
        {thumbUri ? (
          <SecureImage
            contentFit="cover"
            space={space}
            style={styles.image}
            uri={thumbUri}
          />
        ) : null}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>
            {formatDuration(item.durationMs)}
          </Text>
        </View>
        {isActive ? (
          <View style={styles.activeOverlay}>
            <MaterialIcons color={colors.text.inverse} name="graphic-eq" size={20} />
          </View>
        ) : null}
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {item.originalFilename}
          </Text>
          {isActive ? <View style={styles.activeDot} /> : null}
        </View>
        {isActive ? (
          <Text style={styles.nowPlayingText}>
            播放中 · {formatDuration(activeDisplayTimeSec * 1000)} /{' '}
            {formatDuration(item.durationMs)}
          </Text>
        ) : (
          <Text style={styles.metaText}>
            {formatImageDimensions(item.width, item.height)} ·{' '}
            {formatFileSize(item.fileSize)}
          </Text>
        )}
      </View>
      <MaterialIcons
        color={isActive ? colors.text.inverse : 'rgba(255,255,255,0.5)'}
        name={isActive ? 'equalizer' : 'chevron-right'}
        size={20}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[2],
  },
  rowActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
  },
  cover: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.sm,
    height: 44,
    overflow: 'hidden',
    position: 'relative',
    width: 64,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  durationBadge: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 2,
    bottom: 2,
    paddingHorizontal: 4,
    position: 'absolute',
    right: 4,
  },
  durationText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontSize: 8,
  },
  activeOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  title: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    flexShrink: 1,
    fontWeight: '800',
  },
  activeDot: {
    backgroundColor: colors.text.inverse,
    borderRadius: radius.pill,
    height: 6,
    width: 6,
  },
  nowPlayingText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '800',
  },
  metaText: {
    ...typography.textStyles.micro,
    color: 'rgba(255,255,255,0.6)',
  },
});
