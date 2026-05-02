import type { ReactNode } from 'react';
import { Keyboard, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, metrics, spacing, typography } from '../design/tokens';
import { PrimaryButton } from './PrimaryButton';
import { ScreenScaffold } from './ScreenScaffold';

interface FormScreenAction {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}

interface SecondaryFormAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

interface FormScreenScaffoldProps {
  title: string;
  onBack: () => void;
  children: ReactNode;
  errorMessage?: string | null;
  primaryAction: FormScreenAction;
  secondaryAction?: SecondaryFormAction;
  footerExtra?: ReactNode;
  scrollContentStyle?: StyleProp<ViewStyle>;
}

export function FormScreenScaffold({
  title,
  onBack,
  children,
  errorMessage,
  primaryAction,
  secondaryAction,
  footerExtra,
  scrollContentStyle,
}: FormScreenScaffoldProps) {
  function handlePrimaryPress() {
    if (primaryAction.loading || primaryAction.disabled) {
      return;
    }

    Keyboard.dismiss();
    primaryAction.onPress();
  }

  const footer = (
    <View style={styles.footerWrap}>
      {footerExtra}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <View style={styles.actions}>
        <PrimaryButton
          disabled={primaryAction.disabled}
          label={primaryAction.label}
          loading={primaryAction.loading}
          onPress={handlePrimaryPress}
        />
        {secondaryAction ? (
          <PrimaryButton
            disabled={secondaryAction.disabled ?? primaryAction.loading}
            label={secondaryAction.label}
            onPress={secondaryAction.onPress}
            variant="ghost"
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <ScreenScaffold
      contentContainerStyle={scrollContentStyle}
      footer={footer}
      onBack={onBack}
      scrollable
      title={title}
    >
      {children}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  footerWrap: {
    gap: spacing[3],
    paddingTop: spacing[2],
  },
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  actions: {
    gap: spacing[2],
    minHeight: metrics.bottomActionHeight + layout.stickyFooterBottomOffset,
  },
});
