import React from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BubbleRendererProps } from '../../registry/bubbleRegistry';
import { imDiaryThemeAssets } from '../../diary/themeAssets';
import type { DiaryThemeKey } from '../../diary/types';

interface DiaryCardPayload {
  diaryId?: string;
  diaryDate?: string;
  themeKey?: DiaryThemeKey;
  title?: string;
}

/**
 * 伴侣日记略缩态小信封卡片 (Diary Envelope Thumbnail Bubble)
 * 1:1 复刻长聊天略缩信封，点击直接唤醒伴侣手账本
 */
export function DiaryCardRenderer({
  message,
  onOpenDiary,
  onPressMessage,
  onLongPressMessage,
}: BubbleRendererProps) {
  let data: DiaryCardPayload = {};
  try {
    data = JSON.parse(message.content);
  } catch {
    // 兼容普通字符串
  }

  const themeKey = (data.themeKey && imDiaryThemeAssets[data.themeKey]) ? data.themeKey : 'sage';
  const asset = imDiaryThemeAssets[themeKey];
  const dateStr = data.diaryDate || message.createdAt.slice(0, 10);
  const timeStr = message.createdAt ? new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const label = `TODAY · ${timeStr || '深夜'}`;

  const handlePress = () => {
    onPressMessage?.(message);
    onOpenDiary?.(data.diaryId);
  };

  const handleLongPress = (event: any) => {
    if (onLongPressMessage) {
      const { pageX, pageY } = event.nativeEvent;
      onLongPressMessage(message, pageX, pageY);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityLabel="打开伴侣日记"
        accessibilityRole="button"
        delayLongPress={300}
        onLongPress={handleLongPress}
        onPress={handlePress}
        style={({ pressed }) => [styles.cardWrapper, pressed && styles.pressed]}
      >
        <ImageBackground
          imageStyle={styles.cardImage}
          source={asset.card}
          style={styles.cardBackground}
        >
          <View style={styles.glassFooter}>
            <View style={styles.textCol}>
              <Text style={styles.metaText}>{label}</Text>
              <Text numberOfLines={1} style={styles.titleText}>
                {data.title || '伴侣日记已为你生成'}
              </Text>
            </View>
            <View style={styles.openBadge}>
              <Text style={styles.openText}>打开</Text>
            </View>
          </View>
        </ImageBackground>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  pressed: {
    opacity: 0.88,
  },
  cardBackground: {
    width: '100%',
    aspectRatio: 2.5,
    justifyContent: 'flex-end',
  },
  cardImage: {
    borderRadius: 14,
  },
  glassFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  textCol: {
    flex: 1,
    marginRight: 8,
  },
  metaText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.2,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  openBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  openText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
