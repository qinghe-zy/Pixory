import type { ReactNode, RefObject } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { PageBackgroundVariant } from '../design/backgrounds';
import { colors, typography } from '../design/tokens';
import { AppScreen } from './AppScreen';
import { Header } from './Header';

interface ScreenScaffoldProps {
  title: string;
  titleSlot?: ReactNode;
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
  scrollViewRef?: RefObject<ScrollView | null>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export function ScreenScaffold({
  title,
  titleSlot,
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
  scrollViewRef,
  onScroll,
}: ScreenScaffoldProps) {
  return (
    <AppScreen
      backgroundDimmed={backgroundDimmed}
      backgroundVariant={backgroundVariant}
      contentStyle={contentContainerStyle}
      footer={footer}
      onScroll={onScroll}
      scrollViewRef={scrollViewRef}
      scrollable={scrollable}
    >
      <Header
        decorativeTitle={decorativeTitle}
        onBack={onBack}
        rightSlot={rightAction}
        subtitle={subtitle}
        title={title}
        titleSlot={titleSlot}
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
