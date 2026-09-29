import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  imageRepository,
  runWithDatabaseSpace,
  type ImageListItem,
  type PixorySpace,
} from '../../database';
import { colors, radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

export interface IpImageItem {
  id: number;
  uri: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
}

interface AiIpImagePickerPanelProps {
  ipId?: number | null;
  space?: PixorySpace;
  visible: boolean;
  selectedUris: string[];
  onToggleImage: (image: IpImageItem) => void;
  onClose: () => void;
}

export function AiIpImagePickerPanel({
  ipId,
  space = 'normal',
  visible,
  selectedUris,
  onToggleImage,
  onClose,
}: AiIpImagePickerPanelProps) {
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !ipId) {
      return;
    }
    let isCancelled = false;
    setLoading(true);

    runWithDatabaseSpace(space, async (db) => {
      let items = await imageRepository.findByIpId(db, ipId, { mediaType: 'image' });
      if (!items || items.length === 0) {
        const fallbackItems = await imageRepository.findByIpId(db, ipId);
        items = fallbackItems.filter((item) => item.mediaType !== 'video');
      }
      return items;
    })
      .then((loadedImages) => {
        if (!isCancelled) {
          setImages(loadedImages);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setImages([]);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [visible, ipId, space]);

  if (!visible || !ipId) {
    return null;
  }

  const selectedCount = images.filter((img) => {
    const mainUri = img.originalFileUri || img.thumbnailFileUri || '';
    const thumbUri = img.thumbnailFileUri || '';
    return selectedUris.includes(mainUri) || (thumbUri && selectedUris.includes(thumbUri));
  }).length;

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Ionicons color={aiLightColors.primary} name="albums-outline" size={17} />
          <Text style={styles.headerTitle}>IP 图片素材</Text>
          <Text style={styles.headerCount}>
            {selectedCount > 0 ? `(已选 ${selectedCount} 张)` : `(共 ${images.length} 张)`}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="收起 IP 图片选择"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Ionicons color={aiLightColors.muted} name="close" size={18} />
        </Pressable>
      </View>

      {/* Body: Two rows, scrollable preview list matching ImportImagesScreen */}
      {loading && images.length === 0 ? (
        <View style={styles.statusBox}>
          <ActivityIndicator color={aiLightColors.primary} size="small" />
          <Text style={styles.statusText}>正在加载 IP 图片…</Text>
        </View>
      ) : images.length === 0 ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>当前 IP 暂无图片素材</Text>
        </View>
      ) : (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator
          style={styles.previewScroll}
        >
          <View style={styles.previewRow}>
            {images.map((item) => {
              const displayUri = item.thumbnailFileUri || item.coverThumbnailFileUri || item.originalFileUri;
              const mainUri = item.originalFileUri || item.thumbnailFileUri || '';
              const thumbUri = item.thumbnailFileUri || '';
              const isSelected = Boolean(
                selectedUris.includes(mainUri) || (thumbUri && selectedUris.includes(thumbUri)),
              );

              return (
                <Pressable
                  key={item.id}
                  accessibilityLabel={`${item.originalFilename || '素材图片'}${isSelected ? '，已选中' : ''}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => {
                    onToggleImage({
                      id: item.id,
                      uri: mainUri,
                      name: item.originalFilename || `image-${item.id}.jpg`,
                      size: item.fileSize ?? null,
                      mimeType: item.mimeType ?? 'image/jpeg',
                    });
                  }}
                  style={({ pressed }) => [
                    styles.previewCard,
                    isSelected && styles.previewCardSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Image
                    resizeMode="cover"
                    source={{ uri: displayUri }}
                    style={styles.previewImage}
                  />
                  {/* Selected dark/tint overlay */}
                  {isSelected ? <View style={styles.selectedOverlay} /> : null}

                  {/* Selection indicator check circle in top right corner */}
                  <View
                    style={[
                      styles.checkBadge,
                      isSelected ? styles.checkBadgeSelected : styles.checkBadgeUnselected,
                    ]}
                  >
                    {isSelected ? (
                      <Ionicons color="#FFFFFF" name="checkmark" size={11} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderColor: aiLightColors.hairline,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing[2],
    overflow: 'hidden',
    paddingBottom: spacing[2],
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
    paddingHorizontal: spacing[1],
  },
  headerTitleWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[1.5],
  },
  headerTitle: {
    ...typography.textStyles.bodyStrong,
    color: aiLightColors.ink,
    fontSize: 14,
  },
  headerCount: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
    fontSize: 12,
  },
  closeButton: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  /* --- Matching ImportImagesScreen 2-row scrollable grid style --- */
  previewScroll: {
    maxHeight: 176,
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  previewCard: {
    aspectRatio: 1.5,
    backgroundColor: colors.background.empty,
    borderColor: colors.border.default,
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
    width: '32.2%',
  },
  previewCardSelected: {
    borderColor: aiLightColors.primary,
    borderWidth: 2,
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(56, 125, 255, 0.18)',
  },
  checkBadge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 18,
  },
  checkBadgeSelected: {
    backgroundColor: aiLightColors.primary,
  },
  checkBadgeUnselected: {
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.2,
  },
  statusBox: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    paddingVertical: spacing[5],
  },
  statusText: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  pressed: {
    opacity: 0.8,
  },
});
