import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView as ScrollViewType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const bodyBottomPadding = (footer ? 0 : insets.bottom) + layout.pageBottomOffset + floatingFooterHeight;

  const body = scrollable ? (
    <ScrollView
      ref={scrollViewRef}
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
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
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + layout.stickyFooterBottomOffset,
            },
            footerStyle,
          ]}
        >
          {footer}
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
  footer: {
    backgroundColor: colors.background.page,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: layout.pagePaddingHorizontal,
    paddingTop: spacing[2],
    ...shadows.hairline,
  },
});
