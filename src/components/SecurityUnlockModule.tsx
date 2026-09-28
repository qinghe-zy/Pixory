import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, PanResponder, Pressable, Text } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../design/tokens';

const GRID_SIZE = 3;
const DOT_RADIUS = 6;
const DOT_ACTIVE_RADIUS = 12;

interface Point {
  x: number;
  y: number;
}

export interface SecurityUnlockModuleProps {
  onUnlockAttempt: (patternStr: string) => void;
  onBiometricSuccess: () => void;
  onBiometricError?: (error: string) => void;
  size?: number;
  isError?: boolean;
  disableBiometric?: boolean;
}

export function SecurityUnlockModule({
  onUnlockAttempt,
  onBiometricSuccess,
  onBiometricError,
  size = 280,
  isError = false,
  disableBiometric = false,
}: SecurityUnlockModuleProps) {
  const [activeNodes, setActiveNodes] = useState<number[]>([]);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const activeNodesRef = useRef<number[]>([]);

  // Nodes coordinates inside the SVG
  const nodeOffset = size / (GRID_SIZE + 1);
  const hitSlop = nodeOffset * 0.4;

  useEffect(() => {
    void checkBiometric();
  }, []);

  const checkBiometric = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    } catch (e) {
      console.log('Biometric check error:', e);
    }
  };

  const triggerBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: '验证指纹/面容进入隐私模式',
        fallbackLabel: '使用密码',
        disableDeviceFallback: true,
      });
      if (result.success) {
        onBiometricSuccess();
      } else if (result.error) {
        onBiometricError?.(result.error);
      }
    } catch (e) {
      console.log('Biometric auth error:', e);
    }
  };

  // Allow clearing externally or internally
  useEffect(() => {
    if (isError) {
      setTimeout(() => {
        setActiveNodes([]);
        activeNodesRef.current = [];
      }, 800);
    }
  }, [isError]);

  const getNodeIndex = (x: number, y: number): number | null => {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const cx = (col + 1) * nodeOffset;
        const cy = (row + 1) * nodeOffset;
        const dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
        if (dist <= hitSlop) {
          return row * GRID_SIZE + col;
        }
      }
    }
    return null;
  };

  const getNodeCoords = (index: number): Point => {
    const row = Math.floor(index / GRID_SIZE);
    const col = index % GRID_SIZE;
    return {
      x: (col + 1) * nodeOffset,
      y: (row + 1) * nodeOffset,
    };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const node = getNodeIndex(locationX, locationY);
        if (node !== null) {
          setActiveNodes([node]);
          activeNodesRef.current = [node];
        } else {
          setActiveNodes([]);
          activeNodesRef.current = [];
        }
        setCurrentPoint({ x: locationX, y: locationY });
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPoint({ x: locationX, y: locationY });
        const node = getNodeIndex(locationX, locationY);
        
        if (node !== null) {
          const nodes = activeNodesRef.current;
          if (!nodes.includes(node)) {
            // Check for intermediate node
            const lastNode = nodes[nodes.length - 1];
            if (lastNode !== undefined) {
              const row1 = Math.floor(lastNode / GRID_SIZE);
              const col1 = lastNode % GRID_SIZE;
              const row2 = Math.floor(node / GRID_SIZE);
              const col2 = node % GRID_SIZE;
              
              if ((row1 === row2 && Math.abs(col1 - col2) === 2) || 
                  (col1 === col2 && Math.abs(row1 - row2) === 2) ||
                  (Math.abs(row1 - row2) === 2 && Math.abs(col1 - col2) === 2)) {
                const midNode = ((row1 + row2) / 2) * GRID_SIZE + (col1 + col2) / 2;
                if (!nodes.includes(midNode)) {
                  nodes.push(midNode);
                }
              }
            }
            
            nodes.push(node);
            activeNodesRef.current = [...nodes];
            setActiveNodes([...nodes]);
          }
        }
      },
      onPanResponderRelease: () => {
        setCurrentPoint(null);
        if (activeNodesRef.current.length > 0) {
          const patternStr = activeNodesRef.current.join('');
          onUnlockAttempt(patternStr);
        }
        // Don't clear immediately, wait for parent to handle error/success or delay
        setTimeout(() => {
          if (!isError) {
             setActiveNodes([]);
             activeNodesRef.current = [];
          }
        }, 1000);
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      <View style={[styles.patternContainer, { width: size, height: size }]} {...panResponder.panHandlers}>
        <Svg width={size} height={size}>
          {/* Draw lines */}
          {activeNodes.map((node, i) => {
            if (i === 0) return null;
            const prevNode = activeNodes[i - 1];
            const p1 = getNodeCoords(prevNode);
            const p2 = getNodeCoords(node);
            return (
              <Line
                key={`line-${i}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={isError ? colors.semantic.danger : colors.primary.default}
                strokeWidth={4}
                strokeLinecap="round"
              />
            );
          })}
          {/* Draw current moving line */}
          {currentPoint && activeNodes.length > 0 && (
            <Line
              x1={getNodeCoords(activeNodes[activeNodes.length - 1]).x}
              y1={getNodeCoords(activeNodes[activeNodes.length - 1]).y}
              x2={currentPoint.x}
              y2={currentPoint.y}
              stroke={colors.primary.default}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.5}
            />
          )}
          {/* Draw nodes */}
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
            const { x, y } = getNodeCoords(i);
            const isActive = activeNodes.includes(i);
            return (
              <Circle
                key={`node-${i}`}
                cx={x}
                cy={y}
                r={isActive ? DOT_ACTIVE_RADIUS : DOT_RADIUS}
                fill={isActive ? (isError ? colors.semantic.danger : colors.primary.default) : colors.border.default}
              />
            );
          })}
        </Svg>
      </View>
      
      {!disableBiometric && biometricAvailable && (
        <Pressable onPress={triggerBiometric} style={({pressed}) => [styles.biometricButton, pressed && styles.pressed]}>
          <Ionicons name="finger-print" size={48} color={colors.primary.default} />
          <Text style={styles.biometricText}>使用指纹/面容解锁</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing[6],
    width: '100%',
  },
  patternContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricButton: {
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[2],
  },
  biometricText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.7,
  }
});
