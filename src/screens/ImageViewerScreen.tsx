import { Ionicons } from '@expo/vector-icons';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { imageRepository, type ImageListItem } from '../database';
import { colors, radius, spacing, typography } from '../design/tokens';
import type { ImageViewerContext } from '../navigation/imageViewerContext';
import { saveImageToSystemAlbum } from '../services/mediaLibraryService';

interface ImageViewerScreenProps {
  imageId: number;
  context: ImageViewerContext;
  refreshToken: number;
  onBack: () => void;
  onOpenDetail: (imageId: number) => void;
}

export function ImageViewerScreen({
  imageId,
  context,
  refreshToken,
  onBack,
  onOpenDetail,
}: ImageViewerScreenProps) {
  const listRef = useRef<FlatList<ImageListItem>>(null);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { width, height } = useWindowDimensions();
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingToAlbum, setIsSavingToAlbum] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionImage, setActionImage] = useState<ImageListItem | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadImages() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const items = await loadImagesForContext(context);
        if (!isMounted) {
          return;
        }

        const initialIndex = Math.max(0, items.findIndex((item) => item.id === imageId));
        setImages(items);
        setActiveIndex(initialIndex);

        if (items.length > 0) {
          requestAnimationFrame(() => {
            listRef.current?.scrollToIndex({
              animated: false,
              index: initialIndex,
            });
          });
        }
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : '未知错误';
          setErrorMessage(`读取大图失败：${message}`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadImages();

    return () => {
      isMounted = false;
    };
  }, [context, imageId, refreshToken]);

  const activeImage = images[activeIndex] ?? null;
  const pageSize = Math.max(1, width);

  useEffect(() => {
    if (!activeImage) {
      return;
    }

    void imageRepository.touchLastViewedAt(activeImage.id);
  }, [activeImage]);

  const counterLabel = useMemo(() => {
    if (images.length === 0) {
      return '0 / 0';
    }

    return `${activeIndex + 1} / ${images.length}`;
  }, [activeIndex, images.length]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ImageListItem>) => (
      <Pressable
        accessibilityLabel={`查看原图：${item.originalFilename}`}
        accessibilityRole="imagebutton"
        onLongPress={() => handleImageLongPress(item)}
        style={[styles.page, { height, width: pageSize }]}
      >
        <Image resizeMode="contain" source={{ uri: item.originalFileUri }} style={styles.image} />
      </Pressable>
    ),
    [height, pageSize]
  );

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageSize);
    if (nextIndex >= 0 && nextIndex < images.length) {
      setActiveIndex(nextIndex);
    }
  }

  function handleImageLongPress(image: ImageListItem) {
    setActionImage(image);
  }

  async function handleSaveToAlbum(image: ImageListItem) {
    if (isSavingToAlbum) {
      return;
    }

    setIsSavingToAlbum(true);

    try {
      await saveImageToSystemAlbum(image.originalFileUri);
      showToast('已保存到相册');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      showToast(`保存相册失败：${message}`);
    } finally {
      setIsSavingToAlbum(false);
    }
  }

  return (
    <View style={styles.shell}>
      <ExpoStatusBar backgroundColor="#05070A" style="light" translucent />
      <View style={[styles.topBar, { paddingTop: insets.top + spacing[3] }]}>
        <Pressable
          accessibilityLabel="返回"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons color={colors.text.inverse} name="chevron-back" size={22} />
        </Pressable>
        <Text numberOfLines={1} style={styles.counter}>
          {counterLabel}
        </Text>
        <View style={styles.iconButtonPlaceholder} />
      </View>

      {errorMessage ? (
        <View style={styles.stateWrap}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : isLoading ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>正在读取原图...</Text>
        </View>
      ) : images.length === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>没有可浏览的图片。</Text>
        </View>
      ) : (
        <FlatList
          data={images}
          getItemLayout={(_, index) => ({
            index,
            length: pageSize,
            offset: pageSize * index,
          })}
          horizontal
          initialNumToRender={3}
          keyExtractor={(item) => String(item.id)}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onScrollToIndexFailed={({ index }) => {
            if (images.length === 0) {
              return;
            }

            requestAnimationFrame(() => {
              listRef.current?.scrollToIndex({
                animated: false,
                index: Math.min(index, images.length - 1),
              });
            });
          }}
          pagingEnabled
          ref={listRef}
          renderItem={renderItem}
          showsHorizontalScrollIndicator={false}
          windowSize={3}
        />
      )}

      {activeImage ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing[4] }]}>
          <View style={styles.filenameBlock}>
            <Text numberOfLines={1} style={styles.filename}>
              {activeImage.originalFilename}
            </Text>
            <Text numberOfLines={1} style={styles.metaText}>
              原图浏览
            </Text>
          </View>
          <View style={styles.favoritePill}>
            <Ionicons
              color={activeImage.isFavorite ? colors.semantic.favorite : colors.text.inverse}
              name={activeImage.isFavorite ? 'star' : 'star-outline'}
              size={14}
            />
            <Text style={styles.favoriteText}>{activeImage.isFavorite ? '已收藏' : '未收藏'}</Text>
          </View>
        </View>
      ) : null}
      <AppActionSheet
        items={actionImage ? [
          { key: 'detail', label: '查看详情', icon: 'information-circle-outline', onPress: () => onOpenDetail(actionImage.id) },
          { key: 'save', label: isSavingToAlbum ? '保存中' : '保存到相册', icon: 'download-outline', disabled: isSavingToAlbum, onPress: () => void handleSaveToAlbum(actionImage) },
        ] : []}
        onClose={() => setActionImage(null)}
        title={actionImage?.originalFilename ?? '图片操作'}
        visible={Boolean(actionImage)}
      />
    </View>
  );
}

async function loadImagesForContext(context: ImageViewerContext): Promise<ImageListItem[]> {
  if (context.type === 'ip-recent') {
    return imageRepository.findRecentByIpId(context.ipId, context.limit);
  }

  if (context.type === 'ip-all') {
    const { filter } = context;
    if (filter.type === 'favorite') {
      return imageRepository.findByIpId(context.ipId, { favoritesOnly: true });
    }

    if (filter.type === 'ungrouped') {
      return imageRepository.findByIpId(context.ipId, { ungroupedOnly: true });
    }

    if (filter.type === 'untagged') {
      return imageRepository.findByIpId(context.ipId, { untaggedOnly: true });
    }

    if (filter.type === 'recent-viewed') {
      return imageRepository.findByIpId(context.ipId, { recentlyViewedOnly: true, orderBy: 'lastViewedAtDesc' });
    }

    if (filter.type === 'mime') {
      return imageRepository.findByIpId(context.ipId, { mimeType: filter.mimeType });
    }

    if (filter.type === 'size') {
      return imageRepository.findByIpId(context.ipId, {
        minFileSize: filter.minFileSize,
        maxFileSize: filter.maxFileSize,
      });
    }

    if (filter.type === 'group') {
      return imageRepository.findByGroupId(filter.groupId);
    }

    if (filter.type === 'tag') {
      return imageRepository.findByIpId(context.ipId, { tagId: filter.tagId });
    }

    return imageRepository.findByIpId(context.ipId);
  }

  if (context.type === 'group') {
    return imageRepository.findByGroupId(context.groupId);
  }

  if (context.type === 'tag') {
    return imageRepository.findByTagId(context.tagId);
  }

  if (context.type === 'favorites') {
    return imageRepository.findFavorites();
  }

  return imageRepository.findRecentViewed();
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#05070A',
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconButtonPlaceholder: {
    height: 44,
    width: 44,
  },
  counter: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  bottomBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(5, 7, 10, 0.66)',
    flexDirection: 'row',
    gap: spacing[3],
    left: 0,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  filenameBlock: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  filename: {
    ...typography.textStyles.bodyStrong,
    color: colors.text.inverse,
  },
  metaText: {
    ...typography.textStyles.micro,
    color: 'rgba(255, 255, 255, 0.68)',
  },
  favoritePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing[1],
    minHeight: 32,
    paddingHorizontal: spacing[2],
  },
  favoriteText: {
    ...typography.textStyles.micro,
    color: colors.text.inverse,
    fontWeight: '500',
  },
  stateWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing[5],
  },
  stateText: {
    ...typography.textStyles.body,
    color: colors.text.inverse,
    textAlign: 'center',
  },
  errorText: {
    ...typography.textStyles.body,
    color: colors.semantic.danger,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});
import { AppActionSheet } from '../components/AppActionSheet';
import { useToast } from '../components/AppToast';
