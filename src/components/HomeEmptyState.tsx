import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import Svg, { Ellipse, Polygon, Line, Path, Circle, G } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';

interface HomeEmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onCreate: () => void;
}

export function HomeEmptyState({ 
  title = '创建你的首个 IP',
  description = '搭建专属角色知识库与多模态素材矩阵，开启灵感沉淀与策展空间。',
  actionLabel = '开始构建',
  onCreate 
}: HomeEmptyStateProps) {
  // Pulse animation for the dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Subtle Ambient Glow Background - Simplified for React Native using a soft background element */}
        <View style={styles.glow} />

        {/* Top Micro Tag / Status Capsule */}
        <View style={styles.tag}>
          <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
          <Text style={styles.tagText}>PIXORY REPOSITORY · INIT</Text>
        </View>

        {/* Central 3D Geometry / Vault Conceptual Visual Frame */}
        <View style={styles.visualFrame}>
          <View style={styles.visualBackdrop} />
          <View style={styles.visualDashedBorder} />
          
          <Text style={[styles.cross, { top: 12, left: 12 }]}>+</Text>
          <Text style={[styles.cross, { top: 12, right: 12 }]}>+</Text>
          <Text style={[styles.cross, { bottom: 12, left: 12 }]}>+</Text>
          <Text style={[styles.cross, { bottom: 12, right: 12 }]}>+</Text>

          {/* SVG Graphic directly from provided code */}
          <View style={styles.svgContainer}>
            <Svg viewBox="0 0 96 96" width="100%" height="100%" fill="none">
              <Ellipse cx="48" cy="74" rx="20" ry="5" fill="black" fillOpacity="0.06" />
              
              <Polygon points="48,22 70,34 48,46 26,34" fill="#f5f5f5" stroke="#171717" strokeWidth="1.2" strokeLinejoin="round" />
              <Polygon points="26,34 48,46 48,70 26,58" fill="#e5e5e5" stroke="#171717" strokeWidth="1.2" strokeLinejoin="round" />
              <Polygon points="48,46 70,34 70,58 48,70" fill="#d4d4d4" stroke="#171717" strokeWidth="1.2" strokeLinejoin="round" />
              
              <Line x1="48" y1="46" x2="48" y2="70" stroke="#171717" strokeWidth="1.2" />
              <Line x1="37" y1="40" x2="37" y2="64" stroke="#a3a3a3" strokeWidth="0.8" strokeDasharray="2 2" />
              <Line x1="59" y1="40" x2="59" y2="64" stroke="#a3a3a3" strokeWidth="0.8" strokeDasharray="2 2" />

              <Path d="M48 29 C48 34 52 38 52 38 C52 38 48 42 48 47 C48 42 44 38 44 38 C44 38 48 34 48 29 Z" fill="#171717" />
              <Circle cx="48" cy="38" r="1.2" fill="#ffffff" />

              <G x="64" y="20">
                <Circle cx="10" cy="10" r="9" fill="#171717" />
                <Line x1="10" y1="6" x2="10" y2="14" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
                <Line x1="6" y1="10" x2="14" y2="10" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
              </G>
            </Svg>
          </View>
        </View>

        {/* Typography & Storytelling Copy */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>
            {description}
          </Text>
        </View>

        {/* Polished CTA Button */}
        <View style={styles.btnContainer}>
          <Pressable 
            style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}
            onPress={onCreate}
          >
            <Text style={styles.btnText}>{actionLabel}</Text>
            <MaterialIcons name="arrow-forward" size={16} color="#ffffff" style={styles.btnIcon} />
          </Pressable>
        </View>

        {/* Bottom Subtle Format Capabilities Strip */}
        <View style={styles.footerStrip}>
          <Text style={styles.footerText}>支持角色设定</Text>
          <Text style={styles.footerBullet}>•</Text>
          <Text style={styles.footerText}>原画与图鉴</Text>
          <Text style={styles.footerBullet}>•</Text>
          <Text style={styles.footerText}>多模态档案</Text>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: 'rgba(0,0,0,0.05)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 36,
    elevation: 2,
  },
  glow: {
    position: 'absolute',
    top: -64,
    left: '50%',
    transform: [{ translateX: -96 }],
    width: 192,
    height: 192,
    borderRadius: 96,
    backgroundColor: 'rgba(245, 245, 245, 0.8)',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(245, 245, 245, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: 999,
    marginBottom: 24,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#171717',
  },
  tagText: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: '#525252',
    fontWeight: '500',
  },
  visualFrame: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  visualBackdrop: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 16,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.03)',
  },
  visualDashedBorder: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(212, 212, 212, 0.7)',
  },
  cross: {
    position: 'absolute',
    fontSize: 9,
    color: '#d4d4d4',
  },
  svgContainer: {
    width: 96,
    height: 96,
    zIndex: 10,
  },
  textContainer: {
    alignItems: 'center',
    maxWidth: 300,
  },
  title: {
    fontFamily: 'PlayfairDisplay_400Regular',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '400',
    color: '#171717',
    letterSpacing: -0.5,
  },
  description: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 20,
    color: '#737373',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  btnContainer: {
    width: '100%',
    marginTop: 24,
    alignItems: 'center',
  },
  createBtn: {
    width: '100%',
    maxWidth: 260,
    height: 44,
    backgroundColor: '#171717',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 3,
  },
  createBtnPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: '#262626',
  },
  btnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.66,
    textTransform: 'uppercase',
  },
  btnIcon: {
    marginLeft: 4,
  },
  footerStrip: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.04)',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 11,
    color: '#a3a3a3',
  },
  footerBullet: {
    fontSize: 8,
    color: '#d4d4d4',
  },
});
