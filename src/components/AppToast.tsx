import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, radius, shadows, spacing, typography } from '../design/tokens';

interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions | string) => void;
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
      const nextToast: ToastState = {
        id: Date.now(),
        durationMs: 2600,
        ...(typeof options === 'string' ? { message: options } : options),
      };
      setToast(nextToast);

      timerRef.current = setTimeout(() => {
        setToast((current) => (current?.id === nextToast.id ? null : current));
        timerRef.current = null;
      }, nextToast.durationMs);
    },
    [clearTimer]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + layout.stickyFooterBottomOffset + spacing[4] }]}>
          <View style={styles.toast}>
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
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
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
    zIndex: 50,
  },
  toast: {
    ...shadows.floating,
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.text.title,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing[3],
    maxWidth: 420,
    minHeight: 46,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    width: '100%',
  },
  message: {
    ...typography.textStyles.caption,
    color: colors.text.inverse,
    flex: 1,
    minWidth: 0,
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
