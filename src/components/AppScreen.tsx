import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView as ScrollViewType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

import type { PageBackgroundVariant } from '../design/backgrounds';
import { colors, layout, radius, rhythm, shadows, spacing } from '../design/tokens';
import { PageBackground } from './PageBackground';

export const FloatingFooterContext = createContext<number>(0);

interface AppScreenProps {
  children: ReactNode;
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  footer?: ReactNode;
  footerStyle?: StyleProp<ViewStyle>;
  dismissKeyboardOnTouch?: boolean;
  backgroundVariant?: PageBackgroundVariant;
  backgroundDimmed?: boolean;
  scrollViewRef?: RefObject<ScrollViewType | null>;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

export function AppScreen({
  children,
  scrollable = false,
  contentStyle,
  backgroundColor = colors.background.page,
  footer,
  footerStyle,
  dismissKeyboardOnTouch = false,
  backgroundVariant,
  backgroundDimmed,
  scrollViewRef,
  onScroll,
}: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const floatingFooterHeight = useContext(FloatingFooterContext);
  
  // When footer is present and absolute, we need extra padding so content isn't hidden
  const footerEstimateHeight = footer ? 100 : 0;
  const bodyBottomPadding = (footer ? footerEstimateHeight : insets.bottom) + layout.pageBottomOffset + floatingFooterHeight;

  const body = scrollable ? (
    <ScrollView
      ref={scrollViewRef}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      directionalLockEnabled
      contentContainerStyle={[styles.scrollContent, { paddingBottom: bodyBottomPadding }, contentStyle]}
      style={styles.flex}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { paddingBottom: bodyBottomPadding }, contentStyle]}>{children}</View>
  );

  const bodyContent = Platform.OS === 'ios' ? (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      {body}
    </KeyboardAvoidingView>
  ) : body;

  const screenContent = (
    <View style={styles.flex}>
      {bodyContent}
      {footer ? (
        <View style={styles.footerWrap} pointerEvents="box-none">
          <BlurView
            intensity={85}
            tint="light"
            style={[
              styles.footer,
              {
                paddingBottom: insets.bottom + layout.stickyFooterBottomOffset,
              },
              footerStyle,
            ]}
          >
            {footer}
          </BlurView>
        </View>
      ) : null}
    </View>
  );

  if (dismissKeyboardOnTouch) {
    return (
      <PageBackground backgroundColor={backgroundColor} dimmed={backgroundDimmed} variant={backgroundVariant}>
        <TouchableWithoutFeedback accessible={false} onPress={Keyboard.dismiss}>
          {screenContent}
        </TouchableWithoutFeedback>
      </PageBackground>
    );
  }

  if (scrollable) {
    return (
      <PageBackground backgroundColor={backgroundColor} dimmed={backgroundDimmed} variant={backgroundVariant}>
        {screenContent}
      </PageBackground>
    );
  }

  return (
    <PageBackground backgroundColor={backgroundColor} dimmed={backgroundDimmed} variant={backgroundVariant}>
      {screenContent}
    </PageBackground>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.pagePaddingHorizontal,
    gap: rhythm.screenSectionGap,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: layout.pagePaddingHorizontal,
    gap: rhythm.screenSectionGap,
  },
  footerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  footer: {
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
});
