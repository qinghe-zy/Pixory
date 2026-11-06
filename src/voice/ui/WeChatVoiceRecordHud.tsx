import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type VoiceRecordHudState =
  | 'idle'
  | 'recording'
  | 'canceling'
  | 'transcribing_ready'
  | 'transcribing'
  | 'transcribed_preview';

export interface WeChatVoiceRecordHudProps {
  state: VoiceRecordHudState;
  bubbleColor?: string;
  bubbleRadius?: number;
  amplitude?: number; // 0.0 ~ 1.0 真实麦克风振幅
  transcribedText?: string;
  onSendTranscribedText?: (text: string) => void;
  onCancelTranscribedText?: () => void;
}

const NUM_WAVE_BARS = 21;

// 计算声波条纺锤形包络因子 (中间高两边低)
const WAVE_ENVELOPE = Array.from({ length: NUM_WAVE_BARS }, (_, i) => {
  const norm = (i + 1) / (NUM_WAVE_BARS + 1);
  return Math.sin(norm * Math.PI);
});

// 根据气泡背景色明度智能计算高对比文字/声波颜色
function getContrastColor(hexColor: string, darkChoice = '#1F3A10', lightChoice = '#FFFFFF'): string {
  const cleanHex = hexColor.replace('#', '');
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 135 ? lightChoice : darkChoice;
  }
  return darkChoice;
}

export const WeChatVoiceRecordHud: React.FC<WeChatVoiceRecordHudProps> = ({
  state,
  bubbleColor = '#95EC69',
  bubbleRadius = 22,
  amplitude = 0,
  transcribedText = '',
  onSendTranscribedText,
  onCancelTranscribedText,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const domeWidth = Math.round(windowWidth * 1.4);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [editText, setEditText] = useState(transcribedText);

  useEffect(() => {
    setEditText(transcribedText);
  }, [transcribedText]);

  useEffect(() => {
    if (state !== 'idle') {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start();
    }
  }, [state, fadeAnim]);

  // 声波条高度动画 (使用真实 amplitude 驱动，没声音时高度为 3，静止不跳)
  const isCanceling = state === 'canceling';
  const isTranscribingReady = state === 'transcribing_ready';
  const isTranscribing = state === 'transcribing';
  const isPreview = state === 'transcribed_preview';

  // 声波条颜色 (在自定义气泡颜色上智能计算高对比深色或浅色，适配深色主题)
  const waveBarColor = useMemo(() => {
    if (isCanceling) return '#FFFFFF';
    return getContrastColor(bubbleColor, '#1F3A10', 'rgba(255, 255, 255, 0.9)');
  }, [bubbleColor, isCanceling]);

  const previewSendTextColor = useMemo(() => {
    return getContrastColor(bubbleColor, '#1F3A10', '#FFFFFF');
  }, [bubbleColor]);

  // 计算每根声波条的实际高度 (无声不跳，有声随真实音量跳动)
  const barHeights = useMemo(() => {
    // 振幅门限：小于 0.04 时视为环境静音，保持 3px 基线完全不跳
    if (amplitude < 0.04 || isCanceling || isTranscribing) {
      return Array(NUM_WAVE_BARS).fill(3);
    }
    return WAVE_ENVELOPE.map((env, idx) => {
      // 真实音量驱动高度：基线 3px + 包络 * 真实振幅 * 最大跳动范围 25px
      const jitter = (Math.sin(idx * 1.5 + Date.now() / 150) * 0.15 + 0.85);
      const h = 3 + env * amplitude * 24 * jitter;
      return Math.max(3, Math.min(28, h));
    });
  }, [amplitude, isCanceling, isTranscribing]);

  if (state === 'idle') {
    return null;
  }

  // 若处于转文字预览状态，渲染微信同款转文字编辑卡片面板 (全屏原生 Modal 隔离，保证安卓全屏手势、软键盘避让与点按事件 100% 顺畅)
  if (isPreview) {
    return (
      <Modal
        animationType="fade"
        onRequestClose={onCancelTranscribedText}
        statusBarTranslucent
        transparent
        visible
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityLabel="取消转文字预览"
            accessibilityRole="button"
            style={StyleSheet.absoluteFillObject}
            onPress={onCancelTranscribedText}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.previewCardContainer}
          >
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>语音转文字</Text>
                <Text style={styles.previewSub}>已完成识别，可修改后发送</Text>
              </View>
              <View style={styles.previewInputBox}>
                <TextInput
                  multiline
                  value={editText}
                  onChangeText={setEditText}
                  style={styles.previewTextInput}
                  placeholder="未能识别到清晰文字..."
                  placeholderTextColor="#999999"
                  autoFocus
                />
              </View>
              <View style={styles.previewActionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="取消转文字"
                  style={styles.previewCancelButton}
                  onPress={onCancelTranscribedText}
                >
                  <Text style={styles.previewCancelText}>取消</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="发送识别文字"
                  style={[
                    styles.previewSendButton,
                    { backgroundColor: bubbleColor },
                    !editText.trim() && { opacity: 0.45 },
                  ]}
                  disabled={!editText.trim()}
                  onPress={() => {
                    const clean = editText.trim();
                    if (clean) onSendTranscribedText?.(clean);
                  }}
                >
                  <Text style={[styles.previewSendText, { color: previewSendTextColor }]}>发送</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  }

  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      pointerEvents="box-none"
      style={styles.overlay}
    >
      {/* 全屏半透明黑色蒙层 */}
      <Animated.View style={[styles.darkBackdrop, { opacity: fadeAnim }]} />

      <View style={styles.hudForeground} pointerEvents="none">
        {/* 上半区：将声波气泡精准置于屏幕黄金视觉中心 (~42% 视口高度) */}
        <View style={styles.bubbleArea}>
          <View style={styles.bubbleContainer}>
            <View
              style={[
                styles.waveformBubble,
                {
                  backgroundColor: isCanceling ? '#FA5151' : bubbleColor,
                  borderRadius: Math.max(16, bubbleRadius),
                },
              ]}
            >
              {isTranscribing ? (
                <View style={styles.transcribingContent}>
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.transcribingText}>正在转换文字...</Text>
                </View>
              ) : isCanceling ? (
                <View style={styles.cancelingContent}>
                  <Ionicons name="arrow-undo" size={24} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.cancelingText}>松开手指，取消发送</Text>
                </View>
              ) : (
                <View style={styles.waveBarsRow}>
                  {barHeights.map((h, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveBar,
                        {
                          height: h,
                          backgroundColor: waveBarColor,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}

              {/* 朝下小三角尖角指示 (Bubble Arrow) */}
              <View
                style={[
                  styles.bubbleArrow,
                  {
                    borderTopColor: isCanceling ? '#FA5151' : bubbleColor,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* 下方操作区域：对称弧形按钮 + 底部大圆弧穹顶 */}
        <View style={styles.bottomSection}>
          {/* 两个对称圆弧功能按键 (取消 & 滑到这里 转文字，安全留白，彻底消除重叠) */}
          <View style={styles.actionButtonsRow}>
            {/* 左侧按键：取消 */}
            <View
              style={[
                styles.actionBtn,
                styles.cancelBtn,
                isCanceling && styles.cancelBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.actionBtnText,
                  isCanceling && styles.actionBtnTextActive,
                ]}
              >
                取消
              </Text>
            </View>

            {/* 右侧按键：滑到这里 转文字 */}
            <View
              style={[
                styles.actionBtn,
                styles.transcribeBtn,
                isTranscribingReady && [
                  styles.transcribeBtnActive,
                  { backgroundColor: bubbleColor },
                ],
              ]}
            >
              <Text
                style={[
                  styles.actionBtnText,
                  isTranscribingReady && styles.transcribeBtnTextActive,
                ]}
              >
                滑到这里 转文字
              </Text>
            </View>
          </View>

          {/* 底部大圆弧凸起穹顶 (Convex Arc: 松开 发送) */}
          <View style={styles.bottomDomeContainer}>
            <View style={[styles.bottomDomeOuter, { width: domeWidth }]}>
              <View style={styles.bottomDomeInner}>
                <Text
                  style={[
                    styles.bottomDomeText,
                    (isCanceling || isTranscribingReady) && styles.bottomDomeTextDimmed,
                  ]}
                >
                  松开 发送
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
  },
  darkBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  hudForeground: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bubbleArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  // 中心气泡容器
  bubbleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  waveformBubble: {
    minWidth: 196,
    minHeight: 74,
    paddingHorizontal: 26,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 8,
    position: 'relative',
  },
  bubbleArrow: {
    position: 'absolute',
    bottom: -10,
    left: '50%',
    marginLeft: -10,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  waveBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    gap: 3.5,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  cancelingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelingText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  transcribingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcribingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  // 底部两按键与大圆弧
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    marginBottom: 20,
    zIndex: 2,
  },
  actionBtn: {
    flex: 1,
    maxWidth: 165,
    height: 66,
    backgroundColor: 'rgba(56, 56, 56, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  cancelBtn: {
    borderRadius: 33,
    transform: [{ rotate: '-8deg' }],
  },
  cancelBtnActive: {
    backgroundColor: '#FA5151',
    transform: [{ rotate: '-8deg' }, { scale: 1.06 }],
  },
  transcribeBtn: {
    borderRadius: 33,
    transform: [{ rotate: '8deg' }],
  },
  transcribeBtnActive: {
    transform: [{ rotate: '8deg' }, { scale: 1.06 }],
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  actionBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  transcribeBtnTextActive: {
    color: '#1F3A10',
    fontWeight: '700',
  },
  // 底部大圆弧月牙穹顶
  bottomDomeContainer: {
    width: '100%',
    height: 110,
    overflow: 'hidden',
    alignItems: 'center',
    zIndex: 1,
  },
  bottomDomeOuter: {
    minWidth: '140%',
    height: 230,
    borderTopLeftRadius: 190,
    borderTopRightRadius: 190,
    backgroundColor: 'rgba(40, 40, 40, 0.8)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  bottomDomeInner: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 190,
    borderTopRightRadius: 190,
    backgroundColor: '#B6B9BE',
    paddingTop: 22,
    alignItems: 'center',
  },
  bottomDomeText: {
    color: '#282828',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1.4,
  },
  bottomDomeTextDimmed: {
    color: 'rgba(40, 40, 40, 0.35)',
  },
  // 转文字预览卡片
  previewCardContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  previewCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  previewHeader: {
    marginBottom: 12,
  },
  previewTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#181818',
  },
  previewSub: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  previewInputBox: {
    minHeight: 100,
    maxHeight: 180,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  previewTextInput: {
    fontSize: 15,
    color: '#181818',
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  previewActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  previewCancelButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#EAEAEA',
  },
  previewCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555555',
  },
  previewSendButton: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSendText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F3A10',
  },
});
