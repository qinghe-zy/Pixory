/**
 * 独立解耦表情选择器面板 (Decoupled Emoji Picker Panel)
 *
 * 核心设计规范：
 * 1. 顶部 Tab 纯黑白极简线框图标，与面板同色底 (#F7F7F7)，高度升至 330px；
 * 2. 4 大 Tab：
 *    - Tab 1: 主菜单加经典表情 (实事求是最近使用 + 5行超级表情[第35格为横向三点更多按钮] + 经典Emoji)；
 *    - Tab 2: 超级表情 (emoticon-cool-outline 酷炫墨镜笑脸，聚合高频微动效，无分类小标题纯粹瀑布流，底部提供「获取更多表情」按需下载入口)；
 *    - Tab 3: 精选颜文字 (固定 3 列对称居中栅格，消除排版混乱)；
 *    - Tab 4: 我的表情包 (顶部拆分「拍照制作」「相册选图」「导入 ZIP 包」三独立按钮，免弹窗直达，全自动中心 1:1 裁切)；
 * 3. 严格禁止在按钮和标题中滥用 Emoji 符号修饰。
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type {
  EmojiPickerPanelProps,
  AnyEmojiItem,
  AnimatedEmojiItem,
  StaticEmojiItem,
  CustomStickerRecord,
} from './types';
import {
  ANIMATED_EMOJIS,
  STATIC_EMOJIS,
  KAOMOJIS,
  EMOJI_TABS,
  SUPER_STICKERS,
} from './emojiCatalog';
import { EmojiRecentService } from './recentEmojiService';
import { CustomStickerService } from './customStickerService';
import { StickerMarketModal } from './StickerMarketModal';
import { PRESET_STICKER_PACKS } from './stickerPackDownloadService';

const GRID_COLUMNS = 7;
const PRESET_PACK_ID_SET = new Set(PRESET_STICKER_PACKS.map((p) => p.id));

interface EmojiCellProps {
  item: AnyEmojiItem;
  cellSize: number;
  onPress: (item: AnyEmojiItem) => void;
  onLongPress?: (item: AnyEmojiItem) => void;
}

const EmojiCell = React.memo(function EmojiCell({ item, cellSize, onPress, onLongPress }: EmojiCellProps) {
  const isAnimated = item.type === 'animated';
  const animItem = isAnimated ? (item as AnimatedEmojiItem) : null;
  const staticItem = !isAnimated ? (item as StaticEmojiItem) : null;

  const handlePress = useCallback(() => {
    onPress(item);
  }, [onPress, item]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(item);
  }, [onLongPress, item]);

  return (
    <Pressable
      accessibilityLabel={item.name}
      accessibilityRole="button"
      onLongPress={handleLongPress}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.gridCell,
        { width: cellSize, height: cellSize },
        pressed && styles.cellPressed,
      ]}
    >
      {isAnimated && animItem ? (
        <Image
          autoplay
          cachePolicy="memory-disk"
          contentFit="contain"
          recyclingKey={animItem.animatedUri}
          source={{ uri: animItem.animatedUri }}
          style={styles.cellAnimatedImage}
        />
      ) : (
        <Text style={styles.cellStaticChar}>{staticItem?.char}</Text>
      )}
    </Pressable>
  );
});

export const EmojiPickerPanel = React.memo(function EmojiPickerPanel({
  onSelectStaticEmoji,
  onSelectAnimatedEmoji,
  onSelectKaomoji,
  onBackspace,
  height = 365,
  backgroundColor = '#F7F7F7',
  space = 'normal',
}: EmojiPickerPanelProps) {
  const { width: screenWidth } = useWindowDimensions();
  const cellSize = useMemo(() => Math.floor((screenWidth - 24) / GRID_COLUMNS), [screenWidth]);
  const kaomojiWidth = useMemo(() => Math.floor((screenWidth - 24 - 16) / 3), [screenWidth]);

  const [activeTabId, setActiveTabId] = useState<string>('fluent_emoji');
  const [recentItems, setRecentItems] = useState<AnyEmojiItem[]>([]);
  const [customStickers, setCustomStickers] = useState<CustomStickerRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [marketModalVisible, setMarketModalVisible] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(true);
  const backspaceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backspaceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 组件卸载保护与长按退格计时器清理
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (backspaceTimerRef.current) clearTimeout(backspaceTimerRef.current);
      if (backspaceIntervalRef.current) clearInterval(backspaceIntervalRef.current);
    };
  }, []);

  // 水合加载最近使用与自定义表情
  const loadData = useCallback(() => {
    void EmojiRecentService.getRecentEmojis().then((items) => {
      if (isMountedRef.current) setRecentItems(items);
    });
    void CustomStickerService.hydrateCustomStickers(space).then((stickers) => {
      if (isMountedRef.current) setCustomStickers(stickers);
    });
  }, [space]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const triggerHaptic = useCallback(() => {
    try {
      void Haptics.selectionAsync();
    } catch {}
  }, []);

  // 统一点击调度
  const handleItemPress = useCallback(
    (item: AnyEmojiItem) => {
      triggerHaptic();
      if (item.type === 'animated') {
        onSelectAnimatedEmoji(item as AnimatedEmojiItem);
      } else if (item.type === 'static') {
        onSelectStaticEmoji((item as StaticEmojiItem).char);
      } else if (item.type === 'kaomoji') {
        onSelectKaomoji((item as any).text);
      }
      void EmojiRecentService.recordRecent(item).then((updated) => {
        if (isMountedRef.current) {
          setRecentItems(updated);
        }
      });
    },
    [onSelectAnimatedEmoji, onSelectStaticEmoji, onSelectKaomoji, triggerHaptic]
  );

  // 点击颜文字
  const handleKaomojiPress = useCallback(
    (text: string) => {
      triggerHaptic();
      onSelectKaomoji(text);
    },
    [onSelectKaomoji, triggerHaptic]
  );

  const stopContinuousBackspace = useCallback(() => {
    if (backspaceTimerRef.current) {
      clearTimeout(backspaceTimerRef.current);
      backspaceTimerRef.current = null;
    }
    if (backspaceIntervalRef.current) {
      clearInterval(backspaceIntervalRef.current);
      backspaceIntervalRef.current = null;
    }
  }, []);

  // 支持单击与长按连续快速退格删除
  const handleBackspacePressIn = useCallback(() => {
    stopContinuousBackspace();
    triggerHaptic();
    onBackspace?.();

    // 350ms 后开启每 75ms 极速连删
    backspaceTimerRef.current = setTimeout(() => {
      backspaceIntervalRef.current = setInterval(() => {
        triggerHaptic();
        onBackspace?.();
      }, 75);
    }, 350);
  }, [onBackspace, stopContinuousBackspace, triggerHaptic]);

  // 直接制作表情（拍照或选图独立触发，免除中间弹窗）
  const handleDirectCreateSticker = useCallback(
    async (source: 'camera' | 'library') => {
      triggerHaptic();
      try {
        setIsProcessing(true);
        const created = await CustomStickerService.pickAndCreateCustomSticker(source, { space });
        if (created && isMountedRef.current) {
          setCustomStickers((prev) => [created, ...prev]);
          Alert.alert('制作成功', `已添加「${created.name}」，已同步学会此表情！`);
        }
      } catch (err: any) {
        Alert.alert('制作失败', err?.message || '操作异常');
      } finally {
        if (isMountedRef.current) {
          setIsProcessing(false);
        }
      }
    },
    [space, triggerHaptic]
  );

  // 导入 ZIP 压缩包
  const handleImportZip = useCallback(async () => {
    triggerHaptic();
    try {
      setIsProcessing(true);
      const res = await CustomStickerService.pickAndImportZip({ space });
      if (res && res.success && isMountedRef.current) {
        loadData();
        Alert.alert(
          '导入成功',
          `成功导入「${res.packName}」共 ${res.count} 张表情贴纸，已同步建立认知！`
        );
      }
    } catch (err: any) {
      Alert.alert('导入失败', err?.message || '解压或导入失败，请检查压缩包格式');
    } finally {
      if (isMountedRef.current) {
        setIsProcessing(false);
      }
    }
  }, [loadData, space, triggerHaptic]);

  // 长按删除自定义表情
  const handleLongPressCustomSticker = useCallback(
    (item: AnyEmojiItem) => {
      triggerHaptic();
      Alert.alert('删除表情', `确定要删除「${item.name}」吗？将不再使用此表情。`, [
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            await CustomStickerService.deleteSticker(item.id, space);
            setCustomStickers((prev) => prev.filter((s) => s.id !== item.id));
          },
        },
        { text: '取消', style: 'cancel' },
      ]);
    },
    [space, triggerHaptic]
  );

  // 实事求是最近使用：最大展示 14 个（2 行）
  const displayedRecentItems = useMemo(() => recentItems.slice(0, 14), [recentItems]);

  // 下载的超级表情（来源于官方扩展市场包 packId）
  const downloadedSuperStickers: AnimatedEmojiItem[] = useMemo(() => {
    return customStickers
      .filter((c) => Boolean(c.packId && PRESET_PACK_ID_SET.has(c.packId)))
      .map((c) => ({
        id: c.id,
        type: 'animated' as const,
        name: c.name,
        animatedUri: c.uri,
        previewUri: c.previewUri || undefined,
        width: c.width || 140,
        height: c.height || 140,
        category: 'custom',
      }));
  }, [customStickers]);

  // Tab 2 全量超级表情：内置 49 款 + 下载的超级表情，纯净瀑布流无缝展示
  const fullSuperStickers = useMemo(() => {
    return [...SUPER_STICKERS, ...downloadedSuperStickers];
  }, [downloadedSuperStickers]);

  // Tab 4 我的表情包：用户自主拍照、相册选图制作及用户导入的 ZIP 包等个性化专属表情
  const userCreatedCustomItems: AnimatedEmojiItem[] = useMemo(() => {
    return customStickers
      .filter((c) => !c.packId || !PRESET_PACK_ID_SET.has(c.packId))
      .map((c) => ({
        id: c.id,
        type: 'animated' as const,
        name: c.name,
        animatedUri: c.uri,
        previewUri: c.previewUri || undefined,
        width: c.width || 140,
        height: c.height || 140,
        category: 'custom',
      }));
  }, [customStickers]);

  return (
    <View style={[styles.panelWrapper, { height, backgroundColor }]}>
      {/* 顶部纯极简黑白线框导航 TabBar (同色底，无纯白割裂感) */}
      <View accessibilityRole="tablist" style={[styles.tabBar, { backgroundColor }]}>
        <View style={styles.tabIconsRow}>
          {EMOJI_TABS.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <Pressable
                accessibilityLabel={tab.accessibilityLabel}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                hitSlop={4}
                key={tab.id}
                onPress={() => {
                  triggerHaptic();
                  setActiveTabId(tab.id);
                  if (tab.id === 'custom_stickers' || tab.id === 'companion_stickers') {
                    loadData();
                  }
                }}
                style={({ pressed }) => [
                  styles.tabIconButton,
                  isActive && styles.tabIconButtonActive,
                  pressed && styles.tabPressed,
                ]}
              >
                {tab.iconFamily === 'MaterialCommunityIcons' ? (
                  <MaterialCommunityIcons
                    color={isActive ? '#111827' : '#9CA3AF'}
                    name={tab.iconName as any}
                    size={22}
                  />
                ) : (
                  <Ionicons
                    color={isActive ? '#111827' : '#9CA3AF'}
                    name={tab.iconName as any}
                    size={22}
                  />
                )}
                {isActive && <View style={styles.activeIndicator} />}
              </Pressable>
            );
          })}
        </View>

        {/* 右侧快捷退格删除键 (支持单点与长按连续快速删除) */}
        {Boolean(onBackspace) && (
          <Pressable
            accessibilityLabel="退格删除"
            accessibilityRole="button"
            hitSlop={8}
            onPressIn={handleBackspacePressIn}
            onPressOut={stopContinuousBackspace}
            style={({ pressed }) => [styles.backspaceButton, pressed && styles.backspacePressed]}
          >
            <Ionicons color="#374151" name="backspace-outline" size={21} />
          </Pressable>
        )}
      </View>

      {/* 主展示内容区 */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Tab 1: 主菜单加经典表情 */}
        {activeTabId === 'fluent_emoji' && (
          <View style={styles.mainTabContent}>
            {/* 1. 最近使用区：实事求是，发了几个展示几个（最多 14 个，未发则完全不展示） */}
            {displayedRecentItems.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>最近使用</Text>
                  <Pressable
                    accessibilityLabel="清空最近使用"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => {
                      triggerHaptic();
                      void EmojiRecentService.resetRecent().then(setRecentItems);
                    }}
                  >
                    <Ionicons color="#9CA3AF" name="trash-outline" size={15} />
                  </Pressable>
                </View>
                <View style={styles.gridContainer}>
                  {displayedRecentItems.map((item) => (
                    <EmojiCell
                      cellSize={cellSize}
                      item={item}
                      key={`recent_${item.id}`}
                      onPress={handleItemPress}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* 2. 超级表情区：主菜单严格展示 5 行（前 34 格展示表情，第 35 格为更多按钮） */}
            <View style={[styles.sectionHeader, { marginTop: displayedRecentItems.length > 0 ? 12 : 2 }]}>
              <Text style={styles.sectionTitle}>超级表情</Text>
              <Text style={styles.sectionSubtitle}>点击直接单发</Text>
            </View>
            <View style={styles.gridContainer}>
              {ANIMATED_EMOJIS.slice(0, 34).map((item) => (
                <EmojiCell
                  cellSize={cellSize}
                  item={item}
                  key={item.id}
                  onPress={handleItemPress}
                />
              ))}

              {/* 第 35 格（第 5 行最后一个）：横向三圆点更多按钮，点击切换到 Tab 2 超级表情 */}
              <Pressable
                accessibilityLabel="获取更多超级表情"
                accessibilityRole="button"
                onPress={() => {
                  triggerHaptic();
                  setActiveTabId('companion_stickers');
                }}
                style={({ pressed }) => [
                  styles.gridCell,
                  styles.moreButtonCell,
                  { width: cellSize, height: cellSize },
                  pressed && styles.cellPressed,
                ]}
              >
                <Ionicons color="#6B7280" name="ellipsis-horizontal" size={22} />
              </Pressable>
            </View>

            {/* 3. 经典表情区：105 格静态 Emoji 纯粹平铺 */}
            <View style={[styles.sectionHeader, { marginTop: 14 }]}>
              <Text style={styles.sectionTitle}>经典表情</Text>
              <Text style={styles.sectionSubtitle}>可伴随文字混排</Text>
            </View>
            <View style={styles.gridContainer}>
              {STATIC_EMOJIS.map((item) => (
                <EmojiCell
                  cellSize={cellSize}
                  item={item}
                  key={item.id}
                  onPress={handleItemPress}
                />
              ))}
            </View>
          </View>
        )}

        {/* Tab 2: 超级表情模块 (emoticon-cool-outline 酷炫墨镜笑脸，内置 + 下载超级表情统一瀑布流展示) */}
        {activeTabId === 'companion_stickers' && (
          <View style={styles.mainTabContent}>
            <View style={styles.gridContainer}>
              {fullSuperStickers.map((item) => {
                const isDownloaded = downloadedSuperStickers.some((d) => d.id === item.id);
                return (
                  <EmojiCell
                    cellSize={cellSize}
                    item={item}
                    key={item.id}
                    onLongPress={isDownloaded ? handleLongPressCustomSticker : undefined}
                    onPress={handleItemPress}
                  />
                );
              })}
            </View>

            {/* 底部按需下载扩展卡片：纯净无 Emoji 修饰 */}
            <Pressable
              accessibilityLabel="获取更多表情"
              accessibilityRole="button"
              onPress={() => {
                triggerHaptic();
                setMarketModalVisible(true);
              }}
              style={({ pressed }) => [
                styles.fetchMoreCard,
                pressed && styles.fetchMoreCardPressed,
              ]}
            >
              <View style={styles.fetchMoreLeft}>
                <Ionicons color="#111827" name="add-circle-outline" size={20} />
                <Text style={styles.fetchMoreText}>获取更多表情</Text>
              </View>
              <Ionicons color="#9CA3AF" name="chevron-forward" size={16} />
            </Pressable>
          </View>
        )}

        {/* Tab 3: 精选颜文字 (固定 3 列对称栅格，居中对齐，告别杂乱) */}
        {activeTabId === 'kaomoji' && (
          <View style={styles.kaomojiContainer}>
            <View style={styles.kaomojiFixedGrid}>
              {KAOMOJIS.map((k) => (
                <Pressable
                  accessibilityLabel={`颜文字：${k.text}`}
                  accessibilityRole="button"
                  key={k.id}
                  onPress={() => handleKaomojiPress(k.text)}
                  style={({ pressed }) => [
                    styles.kaomojiFixedCell,
                    { width: kaomojiWidth },
                    pressed && styles.kaomojiPressed,
                  ]}
                >
                  <Text numberOfLines={1} style={styles.kaomojiFixedText}>
                    {k.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Tab 4: 自定义与导入表情包专区 (三独立平铺按钮免弹窗直达) */}
        {activeTabId === 'custom_stickers' && (
          <View style={styles.mainTabContent}>
            {/* 顶栏独立三按钮：纯文字与中性线框，无 Emoji 符号 */}
            <View style={styles.customActionRow}>
              <Pressable
                accessibilityLabel="拍照制作"
                accessibilityRole="button"
                disabled={isProcessing}
                onPress={() => void handleDirectCreateSticker('camera')}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              >
                <Ionicons color="#111827" name="camera-outline" size={16} />
                <Text style={styles.actionButtonText}>拍照制作</Text>
              </Pressable>

              <Pressable
                accessibilityLabel="相册选图"
                accessibilityRole="button"
                disabled={isProcessing}
                onPress={() => void handleDirectCreateSticker('library')}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              >
                <Ionicons color="#111827" name="images-outline" size={16} />
                <Text style={styles.actionButtonText}>相册选图</Text>
              </Pressable>

              <Pressable
                accessibilityLabel="导入 ZIP 包"
                accessibilityRole="button"
                disabled={isProcessing}
                onPress={() => void handleImportZip()}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              >
                <Ionicons color="#111827" name="folder-open-outline" size={16} />
                <Text style={styles.actionButtonText}>导入 ZIP 包</Text>
              </Pressable>

              {isProcessing && <ActivityIndicator color="#111827" size="small" style={{ marginLeft: 4 }} />}
            </View>

            {/* 表情网格或空状态 */}
            {userCreatedCustomItems.length > 0 ? (
              <>
                <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                  <Text style={styles.sectionTitle}>我的表情 ({userCreatedCustomItems.length})</Text>
                  <Text style={styles.sectionSubtitle}>长按可删除</Text>
                </View>
                <View style={styles.gridContainer}>
                  {userCreatedCustomItems.map((item) => (
                    <EmojiCell
                      cellSize={cellSize}
                      item={item}
                      key={item.id}
                      onLongPress={handleLongPressCustomSticker}
                      onPress={handleItemPress}
                    />
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.customEmptyContainer}>
                <Ionicons color="#9CA3AF" name="images-outline" size={38} />
                <Text style={styles.customEmptyTitle}>暂无自定义表情</Text>
                <Text style={styles.customEmptySubtitle}>
                  点击上方按钮通过拍照、选图或导入 ZIP 制作专属表情包，AI 也能认出并自主发送！
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* 按需下载扩展表情中心弹窗 */}
      <StickerMarketModal
        onClose={() => setMarketModalVisible(false)}
        onPacksUpdated={loadData}
        space={space}
        visible={marketModalVisible}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  panelWrapper: {
    width: '100%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    overflow: 'hidden',
  },
  tabBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  tabIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  tabIconButton: {
    minWidth: 44,
    minHeight: 44,
    height: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabIconButtonActive: {
    opacity: 1,
  },
  tabPressed: {
    opacity: 0.6,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 16,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#111827',
  },
  backspaceButton: {
    minWidth: 44,
    minHeight: 44,
    height: 44,
    padding: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backspacePressed: {
    backgroundColor: '#E5E7EB',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
  },
  mainTabContent: {
    width: '100%',
  },
  recentSection: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.2,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#6B7280',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    width: '100%',
  },
  gridCell: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  cellPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.92 }],
  },
  moreButtonCell: {
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
  cellAnimatedImage: {
    width: '90%',
    height: '90%',
  },
  cellStaticChar: {
    fontSize: 26,
    textAlign: 'center',
  },
  fetchMoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
  },
  fetchMoreCardPressed: {
    backgroundColor: '#D1D5DB',
  },
  fetchMoreLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fetchMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  kaomojiContainer: {
    width: '100%',
    paddingTop: 4,
  },
  kaomojiFixedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kaomojiFixedCell: {
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    paddingHorizontal: 6,
  },
  kaomojiFixedText: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
    textAlign: 'center',
  },
  kaomojiPressed: {
    backgroundColor: '#E5E7EB',
  },
  customActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1D5DB',
  },
  actionButtonPressed: {
    backgroundColor: '#F3F4F6',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  customEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  customEmptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 10,
  },
  customEmptySubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
});
