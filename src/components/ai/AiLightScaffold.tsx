import { Ionicons } from '@expo/vector-icons';
import type { ReactNode, RefObject } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppScreen } from '../AppScreen';
import type { PageBackgroundVariant } from '../../design/backgrounds';
import { layout, radius, rhythm, spacing, typography } from '../../design/tokens';
import { aiLightColors } from './aiLightTheme';

interface AiLightScaffoldProps {
  bodyStyle?: StyleProp<ViewStyle>;
  backgroundVariant?: PageBackgroundVariant;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  errorMessage?: string | null;
  footer?: ReactNode;
  headerDividerVisible?: boolean;
  loading?: boolean;
  onBack?: () => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  rightAction?: ReactNode;
  scrollable?: boolean;
  scrollViewRef?: RefObject<ScrollView | null>;
  showHeader?: boolean;
  subtitle?: string;
  title: string;
  titleSlot?: ReactNode;
}

export function AiLightScaffold({
  bodyStyle,
  backgroundVariant,
  children,
  contentContainerStyle,
  errorMessage,
  footer,
  headerDividerVisible = true,
  loading = false,
  onBack,
  onScroll,
  rightAction,
  scrollable = false,
  scrollViewRef,
  showHeader = true,
  subtitle,
  title,
  titleSlot,
}: AiLightScaffoldProps) {
  const insets = useSafeAreaInsets();
  const statusBarHeight = Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, insets.top) : insets.top;

  return (
    <AppScreen
      backgroundColor={aiLightColors.canvas}
      backgroundVariant={backgroundVariant}
      contentStyle={contentContainerStyle}
      footer={footer}
      footerStyle={styles.footer}
      onScroll={onScroll}
      scrollViewRef={scrollViewRef}
      scrollable={scrollable}
    >
      {showHeader ? (
        <View style={[styles.header, !headerDividerVisible && styles.headerNoDivider, { paddingTop: statusBarHeight + layout.pageTopOffset }]}>
          <View style={styles.side}>
            {onBack ? (
              <Pressable accessibilityLabel="返回" accessibilityRole="button" hitSlop={10} onPress={onBack} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <Ionicons color={aiLightColors.ink} name="chevron-back" size={20} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.titleWrap}>
            {titleSlot ?? (
              <Text numberOfLines={1} style={styles.title}>
                {title}
              </Text>
            )}
            {subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <View style={styles.side}>{rightAction}</View>
        </View>
      ) : (
        <View style={{ paddingTop: statusBarHeight + layout.pageTopOffset }} />
      )}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <View pointerEvents={loading ? 'none' : 'auto'} style={[bodyStyle, loading && styles.loadingContent]}>
        {children}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    borderBottomColor: aiLightColors.hairline,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: rhythm.inlineGap,
    minHeight: layout.headerHeight,
  },
  headerNoDivider: {
    borderBottomWidth: 0,
  },
  side: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minWidth: spacing[10],
  },
  titleWrap: {
    alignItems: 'flex-start',
    flex: 1,
    gap: rhythm.microGap,
  },
  title: {
    ...typography.textStyles.navTitle,
    color: aiLightColors.ink,
    fontFamily: typography.family.base,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  subtitle: {
    ...typography.textStyles.caption,
    color: aiLightColors.muted,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: aiLightColors.canvas,
    borderColor: aiLightColors.hairline,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    height: spacing[10],
    justifyContent: 'center',
    width: spacing[10],
  },
  errorText: {
    ...typography.textStyles.caption,
    color: aiLightColors.primaryActive,
  },
  footer: {
    backgroundColor: aiLightColors.canvas,
    borderTopColor: aiLightColors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  loadingContent: {
    opacity: 0.7,
  },
  pressed: {
    opacity: 0.72,
  },
});
