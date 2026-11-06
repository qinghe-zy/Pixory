import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  ToastAndroid,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { asrService } from '../asrService';
import {
  addNativeSpeechRecognitionListener,
  cancelSpeechRecognition,
  getSpeechRecognitionCapabilities,
  startSpeechRecognition,
  stopSpeechRecognition,
} from '../../native/pixoryMediaModule';
import type { AiVoiceInputState } from '../../components/ai/AiVoiceInputStatus';

export interface UseSpeechToTextOptions {
  space?: 'normal' | 'personal';
  initialText?: string;
  onTextChange: (nextText: string | ((current: string) => string)) => void;
  maxDurationSec?: number;
}

export interface UseSpeechToTextReturn {
  voiceState: AiVoiceInputState;
  voiceError: string | null;
  isListening: boolean;
  toggleVoiceInput: () => Promise<void>;
  startVoiceInput: () => Promise<void>;
  stopVoiceInput: () => Promise<void>;
  cancelVoiceInput: () => void;
  clearError: () => void;
}

/**
 * 统一的流式实时语音转文字 Hook：
 * 1. 一边说话一边实时转写（Partial/Results 流式上屏），无需等待说完才开始；
 * 2. 录音过程中不因短暂停顿自行中断，由用户再次点击麦克风或达到 60s 硬超时才结束；
 * 3. 只有报错/未识别到内容时才展示无边框提示，并在 2.5 秒后自动消失；
 * 4. 彻底杜绝任何假问候语预填充。
 */
export function useSpeechToText({
  space = 'normal',
  onTextChange,
  maxDurationSec = 60,
}: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const [voiceState, setVoiceState] = useState<AiVoiceInputState>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // 保持 onTextChange 的最新引用，避免闭包陈旧且杜绝 useEffect 频繁重绑监听器
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

  const sessionActiveRef = useRef(false);
  const sessionTokenRef = useRef(0);
  const sessionInitialTextRef = useRef('');
  const hasRecognizedNewSpeechRef = useRef(false);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechCapabilitiesRef = useRef<{ available: boolean; onDevice: boolean }>({
    available: false,
    onDevice: false,
  });

  const clearAutoDismissTimer = useCallback(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  }, []);

  const clearMaxTimer = useCallback(() => {
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current);
      maxTimeoutRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const triggerError = useCallback((message: string) => {
    clearAutoDismissTimer();
    setVoiceState('error');
    setVoiceError(message);

    // 报错提示条在 2.5 秒后自动平滑消失
    autoDismissTimerRef.current = setTimeout(() => {
      setVoiceState('idle');
      setVoiceError(null);
      autoDismissTimerRef.current = null;
    }, 2500);
  }, [clearAutoDismissTimer]);

  const clearError = useCallback(() => {
    clearAutoDismissTimer();
    setVoiceState('idle');
    setVoiceError(null);
  }, [clearAutoDismissTimer]);

  // 内部启动系统语音识别循环（支持多段长句持续识别）
  const launchNativeSpeechRecognizer = useCallback(async () => {
    if (!speechCapabilitiesRef.current.available || !sessionActiveRef.current) return;
    try {
      await startSpeechRecognition();
    } catch {
      // 容错忽略单个句子重启冲突
    }
  }, []);

  // 监听原生识别事件（实现一边说话一边实时转写上屏）
  useEffect(() => {
    const subscription = addNativeSpeechRecognitionListener((event) => {
      if (!sessionActiveRef.current) return;

      if (event.type === 'ready') {
        setVoiceState('listening');
        return;
      }

      // 实时流式切片识别中（说话过程中实时更新输入框文本）
      if (event.type === 'partial') {
        const partialText = event.text?.trim() ?? '';
        if (partialText) {
          hasRecognizedNewSpeechRef.current = true;
          const prefix = sessionInitialTextRef.current;
          const separator = prefix && !prefix.endsWith('\n') && !partialText.startsWith('\n') ? ' ' : '';
          const fullDraft = prefix ? `${prefix}${separator}${partialText}` : partialText;
          onTextChangeRef.current(fullDraft);
        }
        return;
      }

      // 句末确认结果（提交当前句，并若会话未主动结束则继续无缝监听）
      if (event.type === 'result') {
        const sentence = event.text?.trim() ?? '';
        if (sentence) {
          hasRecognizedNewSpeechRef.current = true;
          const prefix = sessionInitialTextRef.current;
          const separator = prefix && !prefix.endsWith('\n') && !sentence.startsWith('\n') ? ' ' : '';
          const newCommitted = prefix ? `${prefix}${separator}${sentence}` : sentence;
          sessionInitialTextRef.current = newCommitted;
          onTextChangeRef.current(newCommitted);
        }

        // 如果用户尚未点击停止，且会话处于活跃状态，无缝重新挂接系统识别器以支持用户说下一句话
        if (sessionActiveRef.current) {
          clearReconnectTimer();
          reconnectTimerRef.current = setTimeout(() => {
            if (sessionActiveRef.current) {
              void launchNativeSpeechRecognizer();
            }
          }, 60);
        }
        return;
      }

      // 句子自然断句，若非主动取消则继续保持监听
      if (event.type === 'end') {
        if (sessionActiveRef.current) {
          clearReconnectTimer();
          reconnectTimerRef.current = setTimeout(() => {
            if (sessionActiveRef.current) {
              void launchNativeSpeechRecognizer();
            }
          }, 80);
        }
        return;
      }

      if (event.type === 'error') {
        // 短暂静音超时的系统事件不视为用户级致命错误，继续保持录音
        if (event.code === 'no_speech' || event.code === 'timeout') {
          if (sessionActiveRef.current) {
            clearReconnectTimer();
            reconnectTimerRef.current = setTimeout(() => {
              if (sessionActiveRef.current) {
                void launchNativeSpeechRecognizer();
              }
            }, 100);
          }
          return;
        }

        // 其他硬件或权限级错误
        sessionActiveRef.current = false;
        clearMaxTimer();
        clearReconnectTimer();
        const msg = event.message || '语音识别服务暂时受阻';
        triggerError(msg);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [clearMaxTimer, clearReconnectTimer, launchNativeSpeechRecognizer, triggerError]);

  // 开始语音转文字
  const startVoiceInput = useCallback(async () => {
    if (sessionActiveRef.current) return;
    clearError();
    clearMaxTimer();
    clearReconnectTimer();

    const currentToken = sessionTokenRef.current + 1;
    sessionTokenRef.current = currentToken;

    // 麦克风权限检查
    if (Platform.OS === 'android') {
      try {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
          triggerError(
            permission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
              ? '麦克风权限已被禁用，请在系统设置中开启'
              : '需要麦克风权限才能进行语音输入'
          );
          return;
        }
      } catch {
        triggerError('麦克风权限请求失败');
        return;
      }
    }

    if (sessionTokenRef.current !== currentToken) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    // 检测原生语音转写能力
    const capabilities = await getSpeechRecognitionCapabilities().catch(() => ({
      available: false,
      onDeviceAvailable: false,
      mode: 'unavailable' as const,
    }));
    speechCapabilitiesRef.current = {
      available: capabilities.available,
      onDevice: capabilities.onDeviceAvailable,
    };

    sessionActiveRef.current = true;
    hasRecognizedNewSpeechRef.current = false;
    setVoiceState('listening');

    // 抓取当前输入框已有内容作为基底前缀
    onTextChangeRef.current((current) => {
      const currentStr = typeof current === 'string' ? current : '';
      sessionInitialTextRef.current = currentStr;
      return currentStr;
    });

    try {
      // 启动底层录音（用于 SenseVoice/Whisper 降级或云端高精对齐）
      await asrService.startRecording();
    } catch {
      // 容错启动
    }

    if (sessionTokenRef.current !== currentToken || !sessionActiveRef.current) {
      void asrService.cancelRecording().catch(() => undefined);
      return;
    }

    // 启动原生流式识别（一边说话一边实时上屏）
    if (speechCapabilitiesRef.current.available) {
      await launchNativeSpeechRecognizer();
    }

    // 60秒硬超时安全看门狗（超时才自动停止）
    maxTimeoutRef.current = setTimeout(() => {
      if (sessionActiveRef.current && sessionTokenRef.current === currentToken) {
        void stopVoiceInput();
      }
    }, maxDurationSec * 1000);
  }, [clearError, clearMaxTimer, clearReconnectTimer, launchNativeSpeechRecognizer, maxDurationSec, triggerError]);

  // 结束语音转文字
  const stopVoiceInput = useCallback(async () => {
    if (!sessionActiveRef.current) return;
    sessionActiveRef.current = false;
    clearMaxTimer();
    clearReconnectTimer();
    setVoiceState('recognizing');

    try {
      await stopSpeechRecognition().catch(() => false);
    } catch {}

    let recordingResult: any = null;
    try {
      recordingResult = await asrService.stopRecording().catch(() => null);
    } catch {}

    try {
      // 若原生流式在此会话中已经识别出新内容，直接成功
      const hasStreamingSpeech = hasRecognizedNewSpeechRef.current;

      if (!hasStreamingSpeech && recordingResult) {
        // 如果原生引擎未识别到文字，则调用云端/高精度 ASR 服务
        if (recordingResult.durationMs < 400) {
          triggerError('说话时间太短');
          onTextChangeRef.current(sessionInitialTextRef.current);
          return;
        }

        const transcribed = await asrService.transcribeAudio(recordingResult.audioUri, { space });
        const clean = transcribed?.trim() || '';
        if (clean) {
          hasRecognizedNewSpeechRef.current = true;
          const prefix = sessionInitialTextRef.current;
          const separator = prefix && !prefix.endsWith('\n') && !clean.startsWith('\n') ? ' ' : '';
          const finalFull = prefix ? `${prefix}${separator}${clean}` : clean;
          sessionInitialTextRef.current = finalFull;
          onTextChangeRef.current(finalFull);
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}
          setVoiceState('idle');
          return;
        } else {
          triggerError('未能识别到清晰语音，请重新录制');
          onTextChangeRef.current(sessionInitialTextRef.current);
          return;
        }
      }

      if (!hasStreamingSpeech) {
        triggerError('未能识别到清晰语音，请重新录制');
        onTextChangeRef.current(sessionInitialTextRef.current);
        return;
      }

      // 成功识别
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setVoiceState('idle');
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : '语音转文字失败';
      triggerError(msg);
      onTextChangeRef.current(sessionInitialTextRef.current);
    } finally {
      sessionActiveRef.current = false;
    }
  }, [clearMaxTimer, clearReconnectTimer, space, triggerError]);

  // 取消语音转文字
  const cancelVoiceInput = useCallback(() => {
    sessionTokenRef.current += 1;
    sessionActiveRef.current = false;
    clearMaxTimer();
    clearReconnectTimer();
    clearAutoDismissTimer();

    void cancelSpeechRecognition().catch(() => undefined);
    void asrService.cancelRecording().catch(() => undefined);

    // 回滚撤销流式未提交的部分，彻底还原为会话启动前的基底草稿
    onTextChangeRef.current(sessionInitialTextRef.current);
    setVoiceState('idle');
    setVoiceError(null);
  }, [clearAutoDismissTimer, clearMaxTimer, clearReconnectTimer]);

  // 切换（点按一次开始，再点一次结束）
  const toggleVoiceInput = useCallback(async () => {
    if (sessionActiveRef.current) {
      await stopVoiceInput();
    } else {
      await startVoiceInput();
    }
  }, [startVoiceInput, stopVoiceInput]);

  useEffect(() => {
    return () => {
      clearAutoDismissTimer();
      clearMaxTimer();
      clearReconnectTimer();
      if (sessionActiveRef.current) {
        sessionActiveRef.current = false;
        void cancelSpeechRecognition().catch(() => undefined);
        void asrService.cancelRecording().catch(() => undefined);
      }
    };
  }, [clearAutoDismissTimer, clearMaxTimer, clearReconnectTimer]);

  return {
    voiceState,
    voiceError,
    isListening: voiceState === 'listening' || voiceState === 'recognizing',
    toggleVoiceInput,
    startVoiceInput,
    stopVoiceInput,
    cancelVoiceInput,
    clearError,
  };
}
