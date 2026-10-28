import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface ImDiaryLeatherBinderProps {
  children: React.ReactNode;
  thicknessLayers?: number;
}

/**
 * 极简日记本外壳与最左侧 3D 金属活页环 (左侧装订单页模式)
 */
export function ImDiaryLeatherBinder({ children, thicknessLayers = 2 }: ImDiaryLeatherBinderProps) {
  const bottomBorder = Math.max(5, Math.min(12, 4 + thicknessLayers));
  return (
    <View style={[styles.outerLeather, { borderBottomWidth: bottomBorder }]}>
      {/* 边缘手工缝线效果 */}
      <View pointerEvents="none" style={styles.stitchedBorder} />

      {/* 四角钛银包角 */}
      <View pointerEvents="none" style={[styles.silverCorner, styles.cornerTL]} />
      <View pointerEvents="none" style={[styles.silverCorner, styles.cornerTR]} />
      <View pointerEvents="none" style={[styles.silverCorner, styles.cornerBL]} />
      <View pointerEvents="none" style={[styles.silverCorner, styles.cornerBR]} />

      {/* 日记本书本内胆 (Book Block) */}
      <View style={styles.bookBlock}>
        {children}

        {/* 左侧活页装订线与 6 个 3D 金属活页环 */}
        <View pointerEvents="none" style={styles.leftSpine}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={styles.binderRing}>
              {/* 金属环实体 */}
              <View style={styles.ringBody} />
              {/* 活页孔 */}
              <View style={styles.punchHoleRight} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerLeather: {
    flex: 1,
    backgroundColor: '#1E2430',
    borderRadius: 22,
    padding: 6,
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 12,
    borderBottomWidth: 6,
    borderBottomColor: '#0F141C',
  },
  stitchedBorder: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 19,
    zIndex: 2,
  },
  silverCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderWidth: 2.5,
    borderColor: '#94A3B8',
    zIndex: 10,
  },
  cornerTL: { top: 4, left: 4, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 18 },
  cornerTR: { top: 4, right: 4, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 18 },
  cornerBL: { bottom: 4, left: 4, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 18 },
  cornerBR: { bottom: 4, right: 4, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 18 },
  bookBlock: {
    flex: 1,
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  leftSpine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 24,
    zIndex: 36,
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    paddingVertical: 24,
  },
  binderRing: {
    width: 24,
    height: 12,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  punchHoleRight: {
    position: 'absolute',
    left: 14,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#CBD5E1',
    zIndex: 1,
  },
  ringBody: {
    width: 20,
    height: 8,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: '#94A3B8',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
});
