import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, typography } from '../design/tokens';
import { AppScreen } from './AppScreen';
import { Header } from './Header';

interface ScreenScaffoldProps {
  title: string;
  onBack?: () => void;
  rightAction?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  scrollable?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function ScreenScaffold({
  title,
  onBack,
  rightAction,
  children,
  footer,
  scrollable = false,
  loading = false,
  errorMessage,
  contentContainerStyle,
}: ScreenScaffoldProps) {
  return (
    <AppScreen
      contentStyle={contentContainerStyle}
      footer={footer}
      scrollable={scrollable}
    >
      <Header onBack={onBack} rightSlot={rightAction} title={title} />
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
