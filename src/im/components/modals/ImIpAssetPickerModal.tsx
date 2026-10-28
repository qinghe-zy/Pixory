import React, { useState, useEffect, useCallback } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  initDatabase,
  ipRepository,
  imageRepository,
  type IpListItem,
  type ImageListItem,
  type PixorySpace,
} from '../../../database';
import { useImTheme } from '../../theme/ImThemeProvider';

export interface SelectedIpImagePayload {
  ipId: number;
  ipName: string;
  images: Array<{
    id: number;
    uri: string;
    filename: string;
  }>;
}

export interface ImIpAssetPickerModalProps {
  visible: boolean;
  space: PixorySpace;
  onClose: () => void;
  onConfirmSend: (payload: SelectedIpImagePayload) => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLUMNS = 3;
const GRID_SPACING = 3;
const IMAGE_SIZE = (SCREEN_WIDTH - 24 - GRID_SPACING * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

/**
 * 关联 IP 二级素材图片选择器 (ImIpAssetPickerModal)
 *
 * 业务流转：
 * 1. 选 IP (Stage 1): 展示当前空间全部已建/导入 IP 库
 * 2. 选图片 (Stage 2): 展示该 IP 下的全部素材图片瀑布流，支持多选
 * 3. 发送 (Stage 3): 一键打包发送至短聊天流中
 */
export function ImIpAssetPickerModal({
  visible,
  space,
  onClose,
  onConfirmSend,
}: ImIpAssetPickerModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useImTheme();

  const [step, setStep] = useState<'select_ip' | 'select_images'>('select_ip');
  const [ips, setIps] = useState<IpListItem[]>([]);
  const [selectedIp, setSelectedIp] = useState<IpListItem | null>(null);
  const [images, setImages] = useState<ImageListItem[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  // 1. 加载 IP 列表
  const loadIps = useCallback(async () => {
    try {
      setLoading(true);
      const db = await initDatabase(space);
      const list = await ipRepository.findLibraryItems(db);
      setIps(list);
    } catch {
      // 容错静默
    } finally {
      setLoading(false);
    }
  }, [space]);

  useEffect(() => {
    if (visible) {
      setStep('select_ip');
      setSelectedIp(null);
      setSelectedImageIds(new Set());
      void loadIps();
    }
  }, [visible, loadIps]);

  // 2. 加载选定 IP 下的图片
  const handleSelectIp = async (ip: IpListItem) => {
    setSelectedIp(ip);
    setSelectedImageIds(new Set());
    setStep('select_images');
    try {
      setLoading(true);
      const db = await initDatabase(space);
      const records = await imageRepository.findByIpId(db, ip.id);
      setImages(records);
    } catch {
      // 容错静默
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectImage = (imageId: number) => {
    setSelectedImageIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  };

  const handleConfirmSend = () => {
    if (!selectedIp || selectedImageIds.size === 0) return;

    const chosen = images
      .filter((img) => selectedImageIds.has(img.id))
      .map((img) => ({
        id: img.id,
        uri: img.originalFileUri || img.thumbnailFileUri || '',
        filename: img.originalFilename,
      }));

    onConfirmSend({
      ipId: selectedIp.id,
      ipName: selectedIp.name,
      images: chosen,
    });
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
      visible={visible}
    >
      <View
        style={[
          styles.modalContainer,
          {
            paddingTop: Math.max(insets.top, 8),
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        {/* 顶部标题栏 */}
        <View style={styles.navBar}>
          <Pressable
            accessibilityLabel="返回"
            accessibilityRole="button"
            onPress={() => {
              if (step === 'select_images') {
                setStep('select_ip');
              } else {
                onClose();
              }
            }}
            style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
          >
            <Ionicons color="#111111" name="chevron-back" size={24} />
            <Text style={styles.navBtnText}>
              {step === 'select_images' ? '返回 IP' : '关闭'}
            </Text>
          </Pressable>

          <Text numberOfLines={1} style={styles.navTitle}>
            {step === 'select_images' && selectedIp
              ? `${selectedIp.name} · 选择图片`
              : '关联 IP 素材'}
          </Text>

          <View style={styles.navRightSlot} />
        </View>

        {/* 主内容区 */}
        {step === 'select_ip' ? (
          <FlatList
            contentContainerStyle={styles.ipListContent}
            data={ips}
            keyExtractor={(item) => String(item.id)}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyBox}>
                  <Ionicons color="#9CA3AF" name="color-palette-outline" size={48} />
                  <Text style={styles.emptyText}>当前空间暂无已保存的 IP 资料</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => void handleSelectIp(item)}
                style={({ pressed }) => [styles.ipRow, pressed && styles.pressed]}
              >
                <View style={styles.ipAvatar}>
                  {item.coverThumbnailFileUri ? (
                    <Image source={{ uri: item.coverThumbnailFileUri }} style={styles.ipCoverImage} />
                  ) : (
                    <Ionicons color="#006948" name="color-palette" size={24} />
                  )}
                </View>
                <View style={styles.ipInfo}>
                  <Text numberOfLines={1} style={styles.ipName}>{item.name}</Text>
                  <Text style={styles.ipCount}>{item.imageCount || 0} 张图片素材</Text>
                </View>
                <Ionicons color="#A1A1AA" name="chevron-forward" size={18} />
              </Pressable>
            )}
          />
        ) : (
          <View style={styles.imagesContainer}>
            <FlatList
              contentContainerStyle={styles.imageGridContent}
              data={images}
              keyExtractor={(item) => String(item.id)}
              numColumns={GRID_COLUMNS}
              renderItem={({ item }) => {
                const isSelected = selectedImageIds.has(item.id);
                return (
                  <Pressable
                    onPress={() => handleToggleSelectImage(item.id)}
                    style={[styles.gridCell, { width: IMAGE_SIZE, height: IMAGE_SIZE }]}
                  >
                    <Image
                      source={{ uri: item.thumbnailFileUri || item.originalFileUri }}
                      style={styles.gridImage}
                    />
                    {/* 勾选框 */}
                    <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                      {isSelected && <Ionicons color="#FFFFFF" name="checkmark" size={14} />}
                    </View>
                  </Pressable>
                );
              }}
            />

            {/* 底部发送操作条 */}
            <View style={styles.bottomBar}>
              <Text style={styles.selectedCountText}>
                已选 {selectedImageIds.size} 张
              </Text>
              <Pressable
                disabled={selectedImageIds.size === 0}
                onPress={handleConfirmSend}
                style={[
                  styles.sendActionBtn,
                  {
                    backgroundColor:
                      selectedImageIds.size > 0
                        ? theme.colors.sendButtonBackground
                        : '#E5E7EB',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sendActionBtnText,
                    { color: selectedImageIds.size > 0 ? '#111111' : '#9CA3AF' },
                  ]}
                >
                  发送到聊天
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  navBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#EDEDED',
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
  },
  navBtnText: {
    fontSize: 16,
    color: '#111111',
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111111',
    flex: 1,
    textAlign: 'center',
  },
  navRightSlot: {
    minWidth: 80,
  },
  pressed: {
    opacity: 0.6,
  },
  ipListContent: {
    padding: 12,
    gap: 8,
  },
  ipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  ipAvatar: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 105, 72, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  ipCoverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  ipInfo: {
    flex: 1,
    gap: 2,
  },
  ipName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111111',
  },
  ipCount: {
    fontSize: 12,
    color: '#71717A',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  imagesContainer: {
    flex: 1,
  },
  imageGridContent: {
    padding: 12,
    gap: GRID_SPACING,
  },
  gridCell: {
    marginRight: GRID_SPACING,
    marginBottom: GRID_SPACING,
    position: 'relative',
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  checkCircle: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: '#95EC69',
    borderColor: '#95EC69',
  },
  bottomBar: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  selectedCountText: {
    fontSize: 15,
    color: '#374151',
  },
  sendActionBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 4,
  },
  sendActionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
