import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { PageBackgroundVariant } from '../design/backgrounds';
import { colors, typography } from '../design/tokens';
import { AppScreen } from './AppScreen';
import { Header } from './Header';

interface ScreenScaffoldProps {
  title: string;
  subtitle?: string;
  titleVariant?: 'page' | 'brand';
  decorativeTitle?: string;
  onBack?: () => void;
  rightAction?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  scrollable?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  backgroundVariant?: PageBackgroundVariant;
  backgroundDimmed?: boolean;
}

export function ScreenScaffold({
  title,
  subtitle,
  titleVariant,
  decorativeTitle,
  onBack,
  rightAction,
  children,
  footer,
  scrollable = false,
  loading = false,
  errorMessage,
  contentContainerStyle,
  backgroundVariant,
  backgroundDimmed,
}: ScreenScaffoldProps) {
  return (
    <AppScreen
      backgroundDimmed={backgroundDimmed}
      backgroundVariant={backgroundVariant}
      contentStyle={contentContainerStyle}
      footer={footer}
      scrollable={scrollable}
    >
      <Header
        decorativeTitle={decorativeTitle}
        onBack={onBack}
        rightSlot={rightAction}
        subtitle={subtitle}
        title={title}
        titleVariant={titleVariant}
      />
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <View pointerEvents={loading ? 'none' : 'auto'} style={loading ? styles.loadingContent : undefined}>
        {children}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  errorText: {
    ...typography.textStyles.caption,
    color: colors.semantic.danger,
  },
  loadingContent: {
    opacity: 0.7,
  },
});
