import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { DiaryPolaroidCard, DiaryStickerItem, DiaryWashiTapeItem, WashiTapeStyle } from '../types';

export interface ImDiaryStickerLayerProps {
  stickers: DiaryStickerItem[];
  tapes: DiaryWashiTapeItem[];
  polaroid?: DiaryPolaroidCard | null;
}

/**
 * 1:1 复刻 docs/ai.html 贴纸、和纸胶带与宝丽来拍立得卡片层
 */
export function ImDiaryStickerLayer({ stickers, tapes, polaroid }: ImDiaryStickerLayerProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 1. 和纸胶带 (Washi Tape Strips) */}
      {tapes.map((t) => (
        <View
          key={t.id}
          style={[
            styles.washiTape,
            getWashiStyle(t.style),
            {
              left: `${Math.round(t.x * 80)}%`,
              top: `${Math.round(t.y * 80)}%`,
              transform: [{ rotate: `${t.rotateDeg || -4}deg` }],
              width: t.width || 76,
            },
          ]}
        />
      ))}

      {/* 2. 拍立得卡片 (Polaroid Photo Card) */}
      {polaroid && (
        <View
          style={[
            styles.polaroidCard,
            {
              transform: [{ rotate: `${polaroid.rotateDeg || 3}deg` }],
            },
          ]}
        >
          <View style={styles.polaroidPhotoArea}>
            {polaroid.imageUri ? (
              <Image source={{ uri: polaroid.imageUri }} style={styles.polaroidImg} />
            ) : (
              <View style={styles.polaroidPlaceholder}>
                <Text style={styles.placeholderEmoji}>📸</Text>
              </View>
            )}
          </View>
          <Text numberOfLines={1} style={styles.polaroidCaption}>
            {polaroid.caption}
          </Text>
        </View>
      )}

      {/* 3. 刀版立体贴纸 (Die-Cut Physical Stickers) */}
      {stickers.map((s) => (
        <View
          key={s.id}
          style={[
            styles.stickerItem,
            {
              left: `${Math.round(s.x * 80)}%`,
              top: `${Math.round(s.y * 80)}%`,
              transform: [{ rotate: `${s.rotateDeg || 0}deg` }, { scale: s.scale || 1.0 }],
            },
          ]}
        >
          <Text style={styles.stickerEmoji}>{s.emojiOrAsset}</Text>
          {s.label && <Text style={styles.stickerLabel}>{s.label}</Text>}
        </View>
      ))}
    </View>
  );
}

function getWashiStyle(style: WashiTapeStyle) {
  switch (style) {
    case 'pink':
      return styles.washiPink;
    case 'mint':
      return styles.washiMint;
    case 'sunny':
      return styles.washiSunny;
    case 'sky':
      return styles.washiSky;
    default:
      return styles.washiPink;
  }
}

const styles = StyleSheet.create({
  washiTape: {
    position: 'absolute',
    height: 18,
    borderRadius: 2,
    opacity: 0.88,
    zIndex: 15,
    shadowColor: '#462D14',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 2,
  },
  washiPink: { backgroundColor: 'rgba(255, 143, 163, 0.85)', borderWidth: 1, borderColor: 'rgba(255, 204, 213, 0.9)' },
  washiMint: { backgroundColor: 'rgba(82, 229, 183, 0.82)', borderWidth: 1, borderColor: 'rgba(168, 245, 220, 0.9)' },
  washiSunny: { backgroundColor: 'rgba(255, 209, 102, 0.88)', borderWidth: 1, borderColor: 'rgba(255, 238, 173, 0.9)' },
  washiSky: { backgroundColor: 'rgba(114, 209, 249, 0.82)', borderWidth: 1, borderColor: 'rgba(180, 230, 255, 0.9)' },
  polaroidCard: {
    position: 'absolute',
    bottom: 24,
    right: 18,
    backgroundColor: '#FFFFFF',
    padding: 6,
    paddingBottom: 14,
    borderRadius: 8,
    shadowColor: '#503219',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#EFE7DA',
    zIndex: 20,
    width: 110,
  },
  polaroidPhotoArea: {
    width: '100%',
    height: 80,
    backgroundColor: '#F5EFE6',
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  polaroidImg: { width: '100%', height: '100%' },
  polaroidPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderEmoji: { fontSize: 26 },
  polaroidCaption: {
    fontSize: 11,
    color: '#5C4A3A',
    fontWeight: '600',
    textAlign: 'center',
  },
  stickerItem: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#462814',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 4,
    zIndex: 25,
  },
  stickerEmoji: { fontSize: 24 },
  stickerLabel: { fontSize: 9, color: '#FF6B8B', fontWeight: '700', marginTop: 1 },
});
