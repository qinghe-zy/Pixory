import type { ReactNode } from 'react';
import { Keyboard, StyleSheet, View, Text, Pressable, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PageBackgroundVariant } from '../design/backgrounds';
import { layout, metrics, rhythm, spacing, typography } from '../design/tokens';
import { premiumColors } from '../design/tokens/premiumColors';
import { FeedbackBanner } from './FeedbackBanner';
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
  secondaryAction, // Kept in interface but intentionally omitted from UI per user request
  footerExtra,
  scrollContentStyle,
  backgroundVariant,
}: FormScreenScaffoldProps) {
  const insets = useSafeAreaInsets();

  function handlePrimaryPress() {
    if (primaryAction.loading || primaryAction.disabled) {
      return;
    }

    Keyboard.dismiss();
    primaryAction.onPress();
  }

  return (
    <View style={styles.flex}>
      <ScreenScaffold
        backgroundVariant={backgroundVariant}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }, scrollContentStyle]}
        footer={null}
        onBack={onBack}
        scrollable
        title={title}
      >
        <View style={styles.contentWrap}>
          {children}
          
          <View style={styles.footerExtraWrap}>
            {footerExtra}
            {errorMessage ? <FeedbackBanner message={errorMessage} tone="error" /> : null}
          </View>
        </View>
      </ScreenScaffold>

      <View pointerEvents="box-none" style={[styles.floatingWrap, { bottom: insets.bottom + spacing[4] }]}>
        <BlurView intensity={30} style={styles.glassPill} tint="light">
          <Pressable
            disabled={primaryAction.disabled || primaryAction.loading}
            onPress={handlePrimaryPress}
            style={({ pressed }) => [
              styles.pillButton,
              pressed && styles.pillButtonPressed,
              (primaryAction.disabled || primaryAction.loading) && styles.pillButtonDisabled,
            ]}
          >
            {primaryAction.loading ? (
              <ActivityIndicator color={premiumColors.buttonText} />
            ) : (
              <Text style={styles.pillButtonText}>{primaryAction.label}</Text>
            )}
          </Pressable>
        </BlurView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    // paddingBottom handled inline to avoid floating button overlap
  },
  contentWrap: {
    gap: rhythm.listCardGap,
  },
  footerExtraWrap: {
    gap: rhythm.listCardGap,
    paddingTop: spacing[4],
  },
  floatingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  glassPill: {
    borderRadius: 100,
    elevation: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  pillButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(107, 96, 86, 0.85)', // Transparent premiumColors.buttonBg (#6B6056)
    justifyContent: 'center',
    minWidth: 200,
    paddingHorizontal: 48,
    paddingVertical: 18,
  },
  pillButtonPressed: {
    backgroundColor: 'rgba(107, 96, 86, 0.95)',
  },
  pillButtonDisabled: {
    backgroundColor: 'rgba(107, 96, 86, 0.4)',
  },
  pillButtonText: {
    ...typography.textStyles.bodyStrong,
    color: premiumColors.buttonText,
    letterSpacing: 0.5,
  },
});
