import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { colors, layout, metrics, radius, rhythm, shadows, spacing, typography } from '../design/tokens';

type ToastTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
  kind?: 'toast' | 'undo';
  tone?: ToastTone;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface UndoSnackbarOptions {
  message: string;
  undoLabel?: string;
  onUndo: () => void;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions | string) => void;
  showUndoSnackbar: (options: UndoSnackbarOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function AppToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (options: ToastOptions | string) => {
      clearTimer();
      const normalizedOptions = typeof options === 'string' ? { message: options } : options;
      const nextToast: ToastState = {
        id: Date.now(),
        durationMs: 2600,
        kind: 'toast',
        tone: inferToastTone(normalizedOptions),
        ...normalizedOptions,
      };
      setToast(nextToast);

      timerRef.current = setTimeout(() => {
        setToast((current) => (current?.id === nextToast.id ? null : current));
        timerRef.current = null;
      }, nextToast.durationMs);
    },
    [clearTimer]
  );

  const showUndoSnackbar = useCallback(
    (options: UndoSnackbarOptions) => {
      showToast({
        message: options.message,
        actionLabel: options.undoLabel ?? '撤销',
        onAction: options.onUndo,
        durationMs: options.durationMs ?? 4000,
        kind: 'undo',
      });
    },
    [showToast]
  );

  const value = useMemo(() => ({ showToast, showUndoSnackbar }), [showToast, showUndoSnackbar]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing[4] }]}>
          <Animated.View
            entering={FadeInUp.duration(300).springify()}
            exiting={FadeOutUp.duration(200)}
            style={[styles.toast, toast.kind === 'undo' ? styles.undoToast : null]}
          >
            <View style={[styles.iconWrap]}>
              <Ionicons color={iconColorForToast(toast.tone)} name={iconForToast(toast.tone)} size={18} />
            </View>
            <Text numberOfLines={2} style={styles.message}>{toast.message}</Text>
            {toast.actionLabel && toast.onAction ? (
              <Pressable
                hitSlop={8}
                onPress={() => {
                  clearTimer();
                  setToast(null);
                  toast.onAction?.();
                }}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                <Text style={styles.actionText}>{toast.actionLabel}</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

function inferToastTone(options: Pick<ToastOptions, 'kind' | 'message' | 'tone'>): ToastTone {
  if (options.tone) {
    return options.tone;
  }
  if (options.kind === 'undo') {
    return 'info';
  }
  if (/失败|错误|不可用|无法|异常/.test(options.message)) {
    return 'error';
  }
  if (/跳过|部分|注意|没有|未/.test(options.message)) {
    return 'warning';
  }
  if (/成功|完成|已保存|已导入|已生成|已更新|已重命名|已选择|已同步|已创建|连接可用|已恢复|已删除|已处理/.test(options.message)) {
    return 'success';
  }
  return 'neutral';
}

function iconForToast(tone?: ToastTone): keyof typeof Ionicons.glyphMap {
  if (tone === 'success') return 'checkmark-circle';
  if (tone === 'warning') return 'alert-circle';
  if (tone === 'error') return 'close-circle';
  if (tone === 'info') return 'information-circle';
  return 'ellipse';
}

function iconColorForToast(tone?: ToastTone): string {
  if (tone === 'success') return colors.semantic.success;
  if (tone === 'warning') return colors.semantic.warning;
  if (tone === 'error') return colors.semantic.danger;
  if (tone === 'info') return colors.primary.light;
  return '#ffffff';
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside AppToastProvider.');
  }

  return context;
}

const styles = StyleSheet.create({
  host: {
    left: 0,
    paddingHorizontal: layout.pagePaddingHorizontal,
    position: 'absolute',
    right: 0,
    zIndex: 999,
  },
  toast: {
    ...shadows.floating,
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(28,28,30,0.92)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    maxWidth: 420,
    minHeight: metrics.bottomActionHeight,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    width: 'auto',
    borderWidth: 0,
  },
  undoToast: {
    minHeight: metrics.bottomActionHeight,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    ...typography.textStyles.caption,
    color: '#ffffff',
    fontWeight: '500',
    flexShrink: 1,
  },
  action: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  actionText: {
    ...typography.textStyles.caption,
    color: colors.primary.light,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
});
