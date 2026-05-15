import type { ReactNode } from 'react';
import { Keyboard, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { PageBackgroundVariant } from '../design/backgrounds';
import { layout, metrics, rhythm, spacing } from '../design/tokens';
import { FeedbackBanner } from './FeedbackBanner';
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
  backgroundVariant?: PageBackgroundVariant;
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
  backgroundVariant,
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
      {errorMessage ? <FeedbackBanner message={errorMessage} tone="error" /> : null}
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
      backgroundVariant={backgroundVariant}
      contentContainerStyle={[styles.scrollContent, scrollContentStyle]}
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
    gap: rhythm.listCardGap,
    paddingTop: spacing[2],
  },
  actions: {
    gap: rhythm.cardContentGap,
    minHeight: metrics.bottomActionHeight + layout.stickyFooterBottomOffset,
  },
  scrollContent: {
    paddingBottom: layout.pageBottomOffset + metrics.bottomActionHeight * 2,
  },
});
