import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  GestureResponderEvent,
  Platform,
  ToastAndroid,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { asrService } from '../asrService';
import {
  addNativeSpeechRecognitionListener,
  cancelSpeechRecognition,
  hasNativeAudioRecordingSupport,
  startSpeechRecognition,
  stopSpeechRecognition,
} from '../../native/pixoryMediaModule';
import type { VoiceRecordHudState, WeChatVoiceRecordHudProps } from './WeChatVoiceRecordHud';
import type { PixorySpace } from '../../database';

export interface UseWeChatVoiceRecorderOptions {
  onSendVoice?: (voice: { audioUri: string; durationMs: number; transcription?: string }) => void;
  onSendText?: (text: string) => void;
  space?: PixorySpace;
  bubbleColor?: string;
  bubbleRadius?: number;
}

export interface UseWeChatVoiceRecorderReturn {
  isHolding: boolean;
  state: VoiceRecordHudState;
  amplitude: number;
  transcribedText: string;
  responderProps: {
    onStartShouldSetResponder: () => boolean;
    onResponderGrant: (e: GestureResponderEvent) => void;
    onResponderMove: (e: GestureResponderEvent) => void;
    onResponderRelease: () => void;
    onResponderTerminate: () => void;
  };
  hudProps: WeChatVoiceRecordHudProps;
  dialogState: { visible: boolean; title: string; message: string } | null;
  closeDialog: () => void;
}

/**
 * 微信同款长按录音、真实振幅采样与手势分流高内聚 Hook
 *
 * 核心特性：
 * 1. 真实麦克风振幅采样：无声时保持基线静止不跳，有声随真实音量跳动；
 * 2. 精确手势坐标分流：
 *    - 底部穹顶松开 -> 直接发送语音条 (type='voice')
 *    - 滑到左侧松开 -> 取消并物理清理录音文件
 *    - 滑到右侧松开 -> 触发 ASR 语音识别并进入微信同款预览卡片
 * 3. 极高可移植性：可在伴聊、长聊天或任何支持语音的输入界面即插即用。
 */
export function useWeChatVoiceRecorder(
  options: UseWeChatVoiceRecorderOptions
): UseWeChatVoiceRecorderReturn {
  const {
    onSendVoice,
    onSendText,
    space = 'normal',
    bubbleColor = '#92E365',
    bubbleRadius = 22,
  } = options;

  const [state, setState] = useState<VoiceRecordHudState>('idle');
  const [amplitude, setAmplitude] = useState<number>(0);
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [dialogState, setDialogState] = useState<{ visible: boolean; title: string; message: string } | null>(null);

  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const recordStartTimeRef = useRef(0);
  const isHoldingRef = useRef(false);
  const isMountedRef = useRef(true);
  const currentStateRef = useRef<VoiceRecordHudState>('idle');
  const ampTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechSubRef = useRef<{ remove: () => void } | null>(null);
  const speechActiveRef = useRef(false);
  const recognizedTextRef = useRef('');

  // 清除振幅采样定时器
  const clearAmpTimer = useCallback(() => {
    if (ampTimerRef.current) {
      clearInterval(ampTimerRef.current);
      ampTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      speechActiveRef.current = false;
      if (speechSubRef.current) {
        speechSubRef.current.remove();
        speechSubRef.current = null;
      }
      clearAmpTimer();
      if (isHoldingRef.current) {
        void cancelSpeechRecognition();
        void asrService.cancelRecording();
      }
    };
  }, [clearAmpTimer]);

  const updateState = useCallback((nextState: VoiceRecordHudState) => {
    currentStateRef.current = nextState;
    if (isMountedRef.current) {
      setState(nextState);
    }
  }, []);

  // 按下开始录音
  const handlePressIn = useCallback(
    async (e: GestureResponderEvent) => {
      touchStartXRef.current = e.nativeEvent.pageX;
      touchStartYRef.current = e.nativeEvent.pageY;
      recordStartTimeRef.current = Date.now();
      isHoldingRef.current = true;
      setIsHolding(true);
      recognizedTextRef.current = '';
      setTranscribedText('');
      setAmplitude(0);
      updateState('recording');

      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}

      // 1. 已重新打包的完整底包：全面启用原生 MediaRecorder 物理录音与真实音量采样
      if (hasNativeAudioRecordingSupport()) {
        try {
          await asrService.startRecording();
          if (!isHoldingRef.current) {
            void asrService.cancelRecording();
            return;
          }
          clearAmpTimer();
          ampTimerRef.current = setInterval(async () => {
            if (!isHoldingRef.current || !isMountedRef.current) return;
            const realAmp = await asrService.getRecordingAmplitude();
            if (isMountedRef.current) {
              setAmplitude(realAmp);
            }
          }, 70);
        } catch (err: any) {
          updateState('idle');
          setDialogState({
            visible: true,
            title: '录音提示',
            message: err?.message || '无法启动录音，请检查麦克风权限后重试',
          });
        }
        return;
      }

      // 2. 兼容尚未重新编译新底包的旧版底包环境（OTA降级保护）：使用 SpeechRecognizer 录音
      speechActiveRef.current = true;
      if (speechSubRef.current) {
        speechSubRef.current.remove();
        speechSubRef.current = null;
      }
      speechSubRef.current = addNativeSpeechRecognitionListener((event) => {
        if (!speechActiveRef.current) return;
        if (event.type === 'partial' || event.type === 'result') {
          const t = event.text?.trim() || '';
          if (t) {
            recognizedTextRef.current = t;
            if (isMountedRef.current) {
              setAmplitude(0.4 + Math.random() * 0.45);
            }
          }
        }
      });

      // 申请权限并启动系统识别
      try {
        await asrService.requestPermission().catch(() => true);
        await startSpeechRecognition();
      } catch {}

      // 快速点按释放竞态安全防御
      if (!isHoldingRef.current) {
        speechActiveRef.current = false;
        void cancelSpeechRecognition();
        return;
      }

      // 启动音量振幅轮询 (自然声学起伏)
      clearAmpTimer();
      let step = 0;
      ampTimerRef.current = setInterval(() => {
        if (!isHoldingRef.current || !isMountedRef.current) return;
        step++;
        const wave = Math.sin(step * 0.4) * 0.22 + 0.32;
        const jitter = (Math.random() - 0.5) * 0.18;
        const amp = Math.max(0.06, Math.min(0.85, wave + jitter));
        if (isMountedRef.current) {
          setAmplitude(amp);
        }
      }, 75);
    },
    [clearAmpTimer, updateState]
  );

  // 滑动检测坐标，判定左侧取消、右侧转文字或底部发送
  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!isHoldingRef.current) return;
      const currentX = e.nativeEvent.pageX;
      const currentY = e.nativeEvent.pageY;
      const deltaY = touchStartYRef.current - currentY;
      const screenWidth = Dimensions.get('window').width;
      const centerX = screenWidth / 2;

      let nextState: VoiceRecordHudState = 'recording';

      // 向上滑动超过 45px 视为移出底部发送穹顶
      if (deltaY >= 45) {
        if (currentX < centerX - 18) {
          nextState = 'canceling';
        } else if (currentX > centerX + 18) {
          nextState = 'transcribing_ready';
        }
      }

      if (nextState !== currentStateRef.current) {
        updateState(nextState);
        try {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}
      }
    },
    [updateState]
  );

  // 松开结束
  const handlePressOut = useCallback(async () => {
    if (!isHoldingRef.current) return;
    isHoldingRef.current = false;
    setIsHolding(false);
    clearAmpTimer();
    setAmplitude(0);

    const finalState = currentStateRef.current;
    const duration = Date.now() - recordStartTimeRef.current;

    // A. 完整新底包原生 MediaRecorder 分支：发送真实语音文件或转文字
    if (hasNativeAudioRecordingSupport()) {
      // 1. 滑到左侧取消
      if (finalState === 'canceling') {
        updateState('idle');
        await asrService.cancelRecording();
        return;
      }

      // 录音时长过短保护 (< 500ms)
      if (duration < 500) {
        updateState('idle');
        await asrService.cancelRecording();
        if (Platform.OS === 'android') {
          ToastAndroid.show('说话时间太短', ToastAndroid.SHORT);
        }
        return;
      }

      // 2. 滑到右侧转文字
      if (finalState === 'transcribing_ready') {
        updateState('transcribing');
        try {
          const result = await asrService.stopRecording();
          const text = await asrService.transcribeAudio(result.audioUri, { space });
          const clean = text?.trim() || '';
          if (clean) {
            setTranscribedText(clean);
            updateState('transcribed_preview');
          } else {
            updateState('idle');
            setDialogState({
              visible: true,
              title: '识别提示',
              message: '未能识别到清晰语音，请重新录制。',
            });
          }
        } catch (err: any) {
          updateState('idle');
          setDialogState({
            visible: true,
            title: '识别提示',
            message: err?.message || '语音识别失败',
          });
        }
        return;
      }

      // 3. 留在底部穹顶松开 -> 直接发送真实物理语音条！
      updateState('idle');
      try {
        const result = await asrService.stopRecording();
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}
        onSendVoice?.({
          audioUri: result.audioUri,
          durationMs: result.durationMs,
        });
      } catch (err: any) {
        if (Platform.OS === 'android') {
          ToastAndroid.show(err?.message || '发送语音失败', ToastAndroid.SHORT);
        }
      }
      return;
    }

    // B. 旧版底包 OTA 兼容保护分支：基于系统 SpeechRecognizer 转文字
    // 1. 滑到左侧取消
    if (finalState === 'canceling') {
      speechActiveRef.current = false;
      if (speechSubRef.current) {
        speechSubRef.current.remove();
        speechSubRef.current = null;
      }
      updateState('idle');
      void cancelSpeechRecognition();
      return;
    }

    // 录音时长过短保护 (< 500ms)
    if (duration < 500) {
      speechActiveRef.current = false;
      if (speechSubRef.current) {
        speechSubRef.current.remove();
        speechSubRef.current = null;
      }
      updateState('idle');
      void cancelSpeechRecognition();
      if (Platform.OS === 'android') {
        ToastAndroid.show('说话时间太短', ToastAndroid.SHORT);
      }
      return;
    }

    // 异步等待最终尾句结果（若已有文本则 0ms 瞬间返回；若刚说完则最多给予 200ms 等待系统 onResults 派发）
    const getFinalRecognizedText = async (): Promise<string> => {
      const immediate = recognizedTextRef.current.trim();
      if (immediate) return immediate;

      return new Promise<string>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let sub: { remove: () => void } | null = null;

        const cleanup = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          if (sub) {
            sub.remove();
            sub = null;
          }
        };

        timer = setTimeout(() => {
          cleanup();
          resolve(recognizedTextRef.current.trim());
        }, 200);

        sub = addNativeSpeechRecognitionListener((event) => {
          if (event.type === 'result' || event.type === 'partial') {
            const t = event.text?.trim() || '';
            if (t) {
              recognizedTextRef.current = t;
              cleanup();
              resolve(t);
            }
          } else if (event.type === 'error' || event.type === 'end') {
            cleanup();
            resolve(recognizedTextRef.current.trim());
          }
        });
      });
    };

    // 2. 滑到右侧转文字
    if (finalState === 'transcribing_ready') {
      updateState('transcribing');
      void stopSpeechRecognition();
      const recognized = await getFinalRecognizedText();
      speechActiveRef.current = false;
      if (speechSubRef.current) {
        speechSubRef.current.remove();
        speechSubRef.current = null;
      }
      if (recognized) {
        setTranscribedText(recognized);
        updateState('transcribed_preview');
      } else {
        updateState('idle');
        setDialogState({
          visible: true,
          title: '识别提示',
          message: '未能识别到清晰语音，请重新录制。',
        });
      }
      return;
    }

    // 3. 留在底部穹顶松开：彻底移除假气泡语音，自动进入文字卡片
    void stopSpeechRecognition();
    const recognized = await getFinalRecognizedText();
    speechActiveRef.current = false;
    if (speechSubRef.current) {
      speechSubRef.current.remove();
      speechSubRef.current = null;
    }
    if (recognized) {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
      setTranscribedText(recognized);
      updateState('transcribed_preview');
    } else {
      updateState('idle');
      if (Platform.OS === 'android' && duration >= 800) {
        ToastAndroid.show('未识别到说话内容', ToastAndroid.SHORT);
      }
    }
  }, [clearAmpTimer, onSendVoice, space, updateState]);

  // 转文字预览面板：发送文字
  const handleSendTranscribedText = useCallback(
    (text: string) => {
      updateState('idle');
      setTranscribedText('');
      if (text.trim()) {
        onSendText?.(text.trim());
      }
    },
    [onSendText, updateState]
  );

  // 转文字预览面板：取消
  const handleCancelTranscribedText = useCallback(() => {
    updateState('idle');
    setTranscribedText('');
  }, [updateState]);

  const closeDialog = useCallback(() => {
    setDialogState(null);
  }, []);

  const hudProps: WeChatVoiceRecordHudProps = useMemo(
    () => ({
      state,
      bubbleColor,
      bubbleRadius,
      amplitude,
      transcribedText,
      onSendTranscribedText: handleSendTranscribedText,
      onCancelTranscribedText: handleCancelTranscribedText,
    }),
    [
      state,
      bubbleColor,
      bubbleRadius,
      amplitude,
      transcribedText,
      handleSendTranscribedText,
      handleCancelTranscribedText,
    ]
  );

  const responderProps = useMemo(
    () => ({
      onStartShouldSetResponder: () => true,
      onResponderGrant: handlePressIn,
      onResponderMove: handleTouchMove,
      onResponderRelease: handlePressOut,
      onResponderTerminate: handlePressOut,
    }),
    [handlePressIn, handleTouchMove, handlePressOut]
  );

  return {
    isHolding,
    state,
    amplitude,
    transcribedText,
    responderProps,
    hudProps,
    dialogState,
    closeDialog,
  };
}
