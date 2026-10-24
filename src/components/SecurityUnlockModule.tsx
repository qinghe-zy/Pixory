import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, PanResponder, Pressable, Text, Animated } from 'react-native';
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

export type BiometricState = 'idle' | 'scanning' | 'success' | 'failed';

export interface SecurityUnlockModuleProps {
  onUnlockAttempt: (patternStr: string) => void;
  onBiometricSuccess: () => void;
  onBiometricError?: (error: string) => void;
  onUnlockErrorHint?: (msg: string) => void;
  size?: number;
  isError?: boolean;
  disableBiometric?: boolean;
}

export function SecurityUnlockModule({
  onUnlockAttempt,
  onBiometricSuccess,
  onBiometricError,
  onUnlockErrorHint,
  size = 280,
  isError = false,
  disableBiometric = false,
}: SecurityUnlockModuleProps) {
  const [activeNodes, setActiveNodes] = useState<number[]>([]);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [localError, setLocalError] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricState, setBiometricState] = useState<BiometricState>('idle');
  const [biometricFeedbackMsg, setBiometricFeedbackMsg] = useState<string | null>(null);

  const activeNodesRef = useRef<number[]>([]);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biometricTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biometricAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Nodes coordinates inside the SVG
  const nodeOffset = size / (GRID_SIZE + 1);
  const hitSlop = nodeOffset * 0.4;

  const cancelPendingClear = () => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  const cancelBiometricTimer = () => {
    if (biometricTimerRef.current) {
      clearTimeout(biometricTimerRef.current);
      biometricTimerRef.current = null;
    }
  };

  useEffect(() => {
    void checkBiometric();
    return () => {
      cancelPendingClear();
      cancelBiometricTimer();
    };
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

  const onUnlockAttemptRef = useRef(onUnlockAttempt);
  const isErrorRef = useRef(isError);

  useEffect(() => {
    onUnlockAttemptRef.current = onUnlockAttempt;
    isErrorRef.current = isError;
  }, [onUnlockAttempt, isError]);

  // Handle external isError changes
  useEffect(() => {
    if (isError) {
      cancelPendingClear();
      clearTimerRef.current = setTimeout(() => {
        setActiveNodes([]);
        activeNodesRef.current = [];
      }, 800);
    }
  }, [isError]);

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const triggerBiometric = async () => {
    setBiometricState('scanning');
    setBiometricFeedbackMsg('正在等待验证...');

    // Pulse animation
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(biometricAnim, { toValue: 1.15, duration: 500, useNativeDriver: true }),
        Animated.timing(biometricAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    pulseLoop.start();

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: '验证指纹/面容进入隐私模式',
        fallbackLabel: '使用密码',
        disableDeviceFallback: true,
      });

      pulseLoop.stop();
      biometricAnim.setValue(1);

      if (result.success) {
        setBiometricState('success');
        setBiometricFeedbackMsg('指纹验证成功');
        cancelBiometricTimer();
        biometricTimerRef.current = setTimeout(() => {
          onBiometricSuccess();
        }, 320);
      } else {
        setBiometricState('failed');
        setBiometricFeedbackMsg(result.error === 'user_cancel' ? '已取消验证' : '指纹不匹配，请重试');
        triggerShake();
        if (result.error && result.error !== 'user_cancel') {
          onBiometricError?.(result.error);
        }
        cancelBiometricTimer();
        biometricTimerRef.current = setTimeout(() => {
          setBiometricState('idle');
          setBiometricFeedbackMsg(null);
        }, 1600);
      }
    } catch (e) {
      pulseLoop.stop();
      biometricAnim.setValue(1);
      setBiometricState('failed');
      setBiometricFeedbackMsg('指纹识别异常');
      triggerShake();
      console.log('Biometric auth error:', e);
      cancelBiometricTimer();
      biometricTimerRef.current = setTimeout(() => {
        setBiometricState('idle');
        setBiometricFeedbackMsg(null);
      }, 1600);
    }
  };

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
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        cancelPendingClear();
        setLocalError(false);

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
        const nodes = activeNodesRef.current;

        if (nodes.length > 0) {
          if (nodes.length < 4) {
            setLocalError(true);
            onUnlockErrorHint?.('至少连接 4 个点');
            cancelPendingClear();
            clearTimerRef.current = setTimeout(() => {
              setLocalError(false);
              setActiveNodes([]);
              activeNodesRef.current = [];
            }, 700);
            return;
          }

          const patternStr = nodes.join('');
          onUnlockAttemptRef.current(patternStr);
        }

        cancelPendingClear();
        clearTimerRef.current = setTimeout(() => {
          if (!isErrorRef.current) {
            setActiveNodes([]);
            activeNodesRef.current = [];
          }
        }, 800);
      },
      onPanResponderTerminate: () => {
        setCurrentPoint(null);
        cancelPendingClear();
        setLocalError(false);
        setActiveNodes([]);
        activeNodesRef.current = [];
      },
    })
  ).current;

  const hasError = isError || localError;

  return (
    <View style={styles.container}>
      <View style={[styles.patternContainer, { width: size, height: size }]} {...panResponder.panHandlers}>
        <Svg height={size} pointerEvents="none" width={size}>
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
                stroke={hasError ? colors.semantic.danger : colors.primary.default}
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
                fill={isActive ? (hasError ? colors.semantic.danger : colors.primary.default) : colors.border.default}
              />
            );
          })}
        </Svg>
      </View>
      
      {!disableBiometric && biometricAvailable && (
        <Animated.View style={{ transform: [{ scale: biometricAnim }, { translateX: shakeAnim }], alignItems: 'center' }}>
          <Pressable
            onPress={triggerBiometric}
            disabled={biometricState === 'scanning'}
            style={({pressed}) => [styles.biometricButton, pressed && styles.pressed]}
          >
            <View style={[
              styles.biometricIconWrapper,
              biometricState === 'scanning' && styles.biometricScanning,
              biometricState === 'success' && styles.biometricSuccess,
              biometricState === 'failed' && styles.biometricFailed,
            ]}>
              <Ionicons
                name={biometricState === 'success' ? 'checkmark-circle' : 'finger-print'}
                size={36}
                color={
                  biometricState === 'success'
                    ? colors.semantic.taskSuccess
                    : biometricState === 'failed'
                    ? colors.semantic.danger
                    : biometricState === 'scanning'
                    ? colors.primary.active
                    : colors.primary.default
                }
              />
            </View>
            <Text style={[
              styles.biometricText,
              biometricState === 'success' && { color: colors.semantic.taskSuccess, fontWeight: '600' },
              biometricState === 'failed' && { color: colors.semantic.danger, fontWeight: '600' },
            ]}>
              {biometricFeedbackMsg || '点击使用指纹/面容解锁'}
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing[4],
    width: '100%',
  },
  patternContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricButton: {
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  biometricIconWrapper: {
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderColor: colors.border.default,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  biometricScanning: {
    borderColor: colors.primary.active,
    backgroundColor: colors.primary.weak,
  },
  biometricSuccess: {
    borderColor: colors.semantic.taskSuccess,
    backgroundColor: colors.semantic.successBackground,
  },
  biometricFailed: {
    borderColor: colors.semantic.danger,
    backgroundColor: colors.semantic.dangerBackground,
  },
  biometricText: {
    ...typography.textStyles.caption,
    color: colors.text.secondary,
  },
  pressed: {
    opacity: 0.7,
  }
});
