import { useCallback, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

interface RunSubmitOptions {
  validate?: () => string | null;
  formatError?: (error: unknown) => string;
  onError?: (error: unknown, message: string) => void;
}

export function useSubmitState() {
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const runSubmit = useCallback(
    async (submitter: () => Promise<void>, options?: RunSubmitOptions) => {
      if (isSubmittingRef.current) {
        return false;
      }

      Keyboard.dismiss();

      const validationMessage = options?.validate?.() ?? null;
      if (validationMessage) {
        setSubmitError(validationMessage);
        return false;
      }

      isSubmittingRef.current = true;
      setIsSubmitting(true);
      setSubmitError(null);

      try {
        await submitter();
        return true;
      } catch (error) {
        console.error(error);
        const message = options?.formatError
          ? options.formatError(error)
          : error instanceof Error
            ? error.message
            : '未知错误';
        setSubmitError(message);
        options?.onError?.(error, message);
        return false;
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    []
  );

  const clearSubmitError = useCallback(() => {
    setSubmitError(null);
  }, []);

  return {
    isSubmitting,
    submitError,
    clearSubmitError,
    runSubmit,
  };
}
