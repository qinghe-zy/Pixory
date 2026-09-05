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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PageBackgroundVariant } from '../design/backgrounds';
import { colors, typography } from '../design/tokens';
import { AppScreen } from './AppScreen';
import { Header } from './Header';

interface ScreenScaffoldProps {
  title?: string;
  titleSlot?: ReactNode;
  subtitle?: string;
  titleVariant?: 'page' | 'brand';
  decorativeTitle?: string;
  onBack?: () => void;
  compactBack?: boolean;
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
  showHeader?: boolean;
}

export function ScreenScaffold({
  title,
  titleSlot,
  subtitle,
  titleVariant,
  decorativeTitle,
  onBack,
  compactBack = false,
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
  showHeader = true,
}: ScreenScaffoldProps) {
  const insets = useSafeAreaInsets();

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
      {showHeader ? (
          <Header
          compactBack={compactBack}
          decorativeTitle={decorativeTitle}
          onBack={onBack}
          rightSlot={rightAction}
          subtitle={subtitle}
          title={title ?? ''}
          titleSlot={titleSlot}
          titleVariant={titleVariant}
        />
      ) : (
        <View style={{ height: insets.top }} />
      )}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <View pointerEvents={loading ? 'none' : 'auto'} style={[loading && styles.loadingContent, { flex: 1 }]}>
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
